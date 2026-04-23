/**
 * Multi-instance coordinator for Git Watchtower web dashboard.
 *
 * Manages a shared web server across multiple git-watchtower instances.
 * The first instance becomes the "coordinator" and starts the web server.
 * Subsequent instances connect as workers via Unix domain socket IPC
 * and push their project state to the coordinator.
 *
 * Lock file:  ~/.watchtower/web.lock   { pid, port, socketPath }
 * Socket:     ~/.watchtower/web.sock
 * Registry:   in-memory, rebuilt from live connections
 *
 * Zero dependencies — uses only Node built-in modules (net, fs, path, os, crypto).
 *
 * @module server/coordinator
 */

const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const telemetry = require('../telemetry');

/**
 * Directory for watchtower runtime files
 */
const WATCHTOWER_DIR = path.join(os.homedir(), '.watchtower');

/**
 * Maximum IPC receive buffer size (1 MiB). Connections that exceed
 * this without a complete newline-delimited message are dropped to
 * prevent unbounded memory growth from malformed or malicious peers.
 */
const MAX_IPC_BUFFER = 1024 * 1024;

/**
 * Lock file path
 */
const LOCK_FILE = path.join(WATCHTOWER_DIR, 'web.lock');

/**
 * Socket path
 */
const SOCKET_PATH = path.join(WATCHTOWER_DIR, 'web.sock');

/**
 * Ensure the ~/.watchtower directory exists.
 */
function ensureDir() {
  if (!fs.existsSync(WATCHTOWER_DIR)) {
    fs.mkdirSync(WATCHTOWER_DIR, { recursive: true });
  }
}

/**
 * Check if a process with the given PID is alive.
 * @param {number} pid
 * @returns {boolean}
 */
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Read the lock file.
 *
 * A lock may be a placeholder (pid only, no port/socketPath) while a new
 * coordinator is still binding its socket. Callers that need a connectable
 * coordinator should use getActiveCoordinator(), which rejects placeholders.
 *
 * @returns {{ pid: number, port?: number, socketPath?: string, pending?: boolean } | null}
 */
function readLock() {
  try {
    if (!fs.existsSync(LOCK_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
    if (!data || !data.pid) return null;
    return data;
  } catch (e) {
    // Lock file was unlinked between existsSync and readFileSync, or contains
    // garbage (crashed mid-write). Treat as "no lock" so tryAcquireLock()
    // can clean it up and retry.
    return null;
  }
}

/**
 * Write the lock file.
 * @param {number} pid
 * @param {number} port
 * @param {string} socketPath
 */
function writeLock(pid, port, socketPath) {
  ensureDir();
  fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid, port, socketPath }, null, 2) + '\n', 'utf8');
}

/**
 * Atomically reserve the coordinator lock.
 *
 * Uses `fs.openSync(..., 'wx')` to create the lock file exclusively, so two
 * instances racing to become coordinator cannot both succeed. A placeholder
 * entry ({ pid, pending: true }) is written immediately so that any process
 * reading the lock while we bind our socket still sees a valid owning PID.
 *
 * If the lock already exists but the owning process is dead, the stale lock
 * (and socket) are cleaned up and the acquisition is retried once.
 *
 * @param {number} pid - PID of the acquiring process
 * @returns {{acquired: true} | {acquired: false, existing: {pid: number, port?: number, socketPath?: string, pending?: boolean} | null}}
 */
function tryAcquireLock(pid) {
  ensureDir();

  // One retry after stale-lock cleanup; avoids looping if another process
  // keeps recreating the lock faster than we can clean it up.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(LOCK_FILE, 'wx');
      try {
        fs.writeSync(fd, JSON.stringify({ pid, pending: true }) + '\n');
      } finally {
        fs.closeSync(fd);
      }
      return { acquired: true };
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;

      // Lock file exists — check if the owner is alive.
      const existing = readLock();
      if (existing && isProcessAlive(existing.pid)) {
        return { acquired: false, existing };
      }
      // Stale or unreadable — clean up and retry the exclusive create.
      removeLock();
      removeSocket();
    }
  }

  // Another process raced us to re-create the lock. Treat it as active.
  const existing = readLock();
  return { acquired: false, existing: existing || null };
}

/**
 * Replace the placeholder lock with the final port/socket details after the
 * coordinator has successfully bound its IPC socket and the web server has
 * started listening. Caller must already own the lock via tryAcquireLock().
 *
 * @param {number} pid
 * @param {number} port
 * @param {string} socketPath
 */
function finalizeLock(pid, port, socketPath) {
  writeLock(pid, port, socketPath);
}

/**
 * Remove the lock file.
 */
function removeLock() {
  try { fs.unlinkSync(LOCK_FILE); } catch (e) { /* lock file may not exist */ }
}

/**
 * Remove stale socket file.
 */
function removeSocket() {
  try { fs.unlinkSync(SOCKET_PATH); } catch (e) { /* socket file may not exist */ }
}

/**
 * Check if a coordinator is already running and reachable.
 *
 * Returns null for stale locks (cleans them up) and for placeholder locks
 * that haven't finished binding yet — callers shouldn't try to connect to
 * a coordinator that isn't listening.
 *
 * @returns {{ pid: number, port: number, socketPath: string } | null}
 */
function getActiveCoordinator() {
  const lock = readLock();
  if (!lock) return null;
  if (!isProcessAlive(lock.pid)) {
    removeLock();
    removeSocket();
    return null;
  }
  // Placeholder (pending) — coordinator is still binding.
  if (!lock.port || !lock.socketPath) return null;
  return /** @type {{pid:number,port:number,socketPath:string}} */ (lock);
}

// ─── Coordinator (first instance) ────────────────────────────────

/**
 * @typedef {Object} ProjectState
 * @property {string} id - Unique project identifier
 * @property {string} projectPath - Absolute path to project
 * @property {string} projectName - Directory name
 * @property {Object} state - Serializable state snapshot
 * @property {number} lastUpdate - Timestamp of last state push
 */

/**
 * Coordinator server — manages worker connections and aggregates state.
 */
class Coordinator {
  /**
   * @param {Object} [options]
   * @param {string} [options.socketPath] - Unix socket path
   */
  constructor(options = {}) {
    this.socketPath = options.socketPath || SOCKET_PATH;
    /** @type {Map<string, ProjectState>} */
    this.projects = new Map();
    /** @type {Map<string, net.Socket>} */
    this.workerSockets = new Map();
    /** @type {net.Server|null} */
    this.ipcServer = null;
    /** @type {Function|null} */
    this.onProjectsChanged = null;
    /** @type {Function|null} */
    this.onActionRequest = null;
  }

  /**
   * Start the IPC server.
   * @returns {Promise<void>}
   */
  start() {
    return new Promise((resolve, reject) => {
      ensureDir();
      removeSocket();

      this.ipcServer = net.createServer((socket) => {
        this._handleWorkerConnection(socket);
      });

      this.ipcServer.on('error', (err) => {
        reject(err);
      });

      this.ipcServer.listen(this.socketPath, () => {
        resolve();
      });
    });
  }

  /**
   * Stop the IPC server and clean up.
   */
  stop() {
    // Close all worker sockets
    for (const socket of this.workerSockets.values()) {
      try { socket.destroy(); } catch (e) { /* socket may already be destroyed */ }
    }
    this.workerSockets.clear();
    this.projects.clear();

    if (this.ipcServer) {
      this.ipcServer.close();
      this.ipcServer = null;
    }

    removeLock();
    removeSocket();
  }

  /**
   * Register the coordinator's own project (local instance).
   * @param {string} id
   * @param {string} projectPath
   * @param {string} projectName
   * @param {Object} state
   */
  registerLocal(id, projectPath, projectName, state) {
    this.projects.set(id, {
      id,
      projectPath,
      projectName,
      state: state || {},
      lastUpdate: Date.now(),
    });
    this._notifyProjectsChanged();
  }

  /**
   * Update the coordinator's own project state.
   * @param {string} id
   * @param {Object} state
   */
  updateLocal(id, state) {
    const project = this.projects.get(id);
    if (project) {
      project.state = state;
      project.lastUpdate = Date.now();
      this._notifyProjectsChanged();
    }
  }

  /**
   * Get all project states.
   * @returns {ProjectState[]}
   */
  getProjects() {
    return Array.from(this.projects.values());
  }

  /**
   * Get a specific project.
   * @param {string} id
   * @returns {ProjectState|undefined}
   */
  getProject(id) {
    return this.projects.get(id);
  }

  /**
   * Send a command to a worker.
   * @param {string} projectId
   * @param {string} action
   * @param {Object} payload
   */
  sendCommand(projectId, action, payload) {
    const socket = this.workerSockets.get(projectId);
    if (socket) {
      this._sendMessage(socket, { type: 'command', action, payload });
    } else if (this.onActionRequest) {
      // Local project — handle directly
      this.onActionRequest(projectId, action, payload);
    }
  }

  // ─── Private ─────────────────────────────────────────────────

  /**
   * Handle a new worker connection.
   * @param {net.Socket} socket
   * @private
   */
  _handleWorkerConnection(socket) {
    let workerId = null;
    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();
      if (buffer.length > MAX_IPC_BUFFER) {
        socket.destroy();
        return;
      }
      let newlineIdx;
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);
        if (line.trim()) {
          try {
            const msg = JSON.parse(line);
            this._handleWorkerMessage(socket, msg, (id) => { workerId = id; }, () => workerId);
          } catch (e) {
            // Both sides of this socket are our own code, so a JSON-parse
            // failure indicates a protocol/version bug worth diagnosing.
            telemetry.captureError(e);
            /* skip malformed frame and keep reading */
          }
        }
      }
    });

    socket.on('close', () => {
      if (workerId) {
        this.projects.delete(workerId);
        this.workerSockets.delete(workerId);
        this._notifyProjectsChanged();
      }
    });

    socket.on('error', () => {
      if (workerId) {
        this.projects.delete(workerId);
        this.workerSockets.delete(workerId);
        this._notifyProjectsChanged();
      }
    });
  }

  /**
   * Handle a message from a worker.
   * @param {net.Socket} socket
   * @param {Object} msg
   * @param {Function} setWorkerId
   * @private
   */
  _handleWorkerMessage(socket, msg, setWorkerId, getWorkerId) {
    switch (msg.type) {
      case 'register': {
        // Prevent re-registration: a socket that already registered cannot change its ID
        const currentId = getWorkerId();
        if (currentId) break;

        // Reject if this ID is already claimed by a different socket
        const existingSocket = this.workerSockets.get(msg.id);
        if (existingSocket && existingSocket !== socket) break;

        setWorkerId(msg.id);
        this.workerSockets.set(msg.id, socket);
        this.projects.set(msg.id, {
          id: msg.id,
          projectPath: msg.projectPath,
          projectName: msg.projectName,
          state: msg.state || {},
          lastUpdate: Date.now(),
        });
        this._sendMessage(socket, { type: 'registered', id: msg.id });
        this._notifyProjectsChanged();
        break;
      }

      case 'state': {
        // Validate sender — only accept state for the worker's own registered ID
        const registeredId = getWorkerId();
        if (msg.id && msg.id === registeredId && this.projects.has(msg.id)) {
          this.projects.get(msg.id).state = msg.state;
          this.projects.get(msg.id).lastUpdate = Date.now();
          this._notifyProjectsChanged();
        }
        break;
      }

      case 'unregister': {
        const regId = getWorkerId();
        if (msg.id && msg.id === regId) {
          this.projects.delete(msg.id);
          this.workerSockets.delete(msg.id);
          this._notifyProjectsChanged();
        }
        break;
      }
    }
  }

  /**
   * Send a JSON message over a socket.
   * @param {net.Socket} socket
   * @param {Object} msg
   * @private
   */
  _sendMessage(socket, msg) {
    try {
      socket.write(JSON.stringify(msg) + '\n');
    } catch (e) { /* peer socket closed between iteration and write — peer will reconnect if it recovers */ }
  }

  /**
   * Notify that projects changed.
   * @private
   */
  _notifyProjectsChanged() {
    if (this.onProjectsChanged) {
      this.onProjectsChanged(this.getProjects());
    }
  }
}

// ─── Worker (subsequent instances) ───────────────────────────────

/**
 * Worker client — connects to the coordinator and pushes state.
 */
class Worker {
  /**
   * @param {Object} options
   * @param {string} options.id - Unique project ID
   * @param {string} options.projectPath - Absolute path
   * @param {string} options.projectName - Directory name
   * @param {string} [options.socketPath] - Unix socket path
   */
  constructor(options) {
    this.id = options.id;
    this.projectPath = options.projectPath;
    this.projectName = options.projectName;
    this.socketPath = options.socketPath || SOCKET_PATH;
    /** @type {net.Socket|null} */
    this.socket = null;
    /** @type {Function|null} */
    this.onCommand = null;
    this._connected = false;
    this._buffer = '';
  }

  /**
   * Connect to the coordinator.
   * @returns {Promise<void>}
   */
  connect() {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(this.socketPath, () => {
        this._connected = true;
        // Register with coordinator
        this._send({
          type: 'register',
          id: this.id,
          projectPath: this.projectPath,
          projectName: this.projectName,
        });
        resolve();
      });

      this.socket.on('data', (data) => {
        this._buffer += data.toString();
        if (this._buffer.length > MAX_IPC_BUFFER) {
          this.socket.destroy();
          return;
        }
        let idx;
        while ((idx = this._buffer.indexOf('\n')) !== -1) {
          const line = this._buffer.slice(0, idx);
          this._buffer = this._buffer.slice(idx + 1);
          if (line.trim()) {
            try {
              const msg = JSON.parse(line);
              this._handleMessage(msg);
            } catch (e) {
              // Both sides of this socket are our own code, so a JSON-parse
              // failure indicates a protocol/version bug worth diagnosing.
              telemetry.captureError(e);
              /* skip malformed frame and keep reading */
            }
          }
        }
      });

      this.socket.on('error', (err) => {
        this._connected = false;
        reject(err);
      });

      this.socket.on('close', () => {
        this._connected = false;
      });
    });
  }

  /**
   * Push state update to the coordinator.
   * @param {Object} state - Serializable state
   */
  pushState(state) {
    if (!this._connected) return;
    this._send({ type: 'state', id: this.id, state });
  }

  /**
   * Disconnect from the coordinator.
   */
  disconnect() {
    if (this.socket) {
      if (this._connected) {
        this._send({ type: 'unregister', id: this.id });
      }
      this.socket.destroy();
      this.socket = null;
      this._connected = false;
    }
  }

  /**
   * Check if connected.
   * @returns {boolean}
   */
  isConnected() {
    return this._connected;
  }

  // ─── Private ─────────────────────────────────────────────────

  /**
   * @param {Object} msg
   * @private
   */
  _send(msg) {
    if (this.socket && this._connected) {
      try {
        this.socket.write(JSON.stringify(msg) + '\n');
      } catch (e) { /* coordinator socket closed between isConnected() check and write */ }
    }
  }

  /**
   * @param {Object} msg
   * @private
   */
  _handleMessage(msg) {
    if (msg.type === 'command' && this.onCommand) {
      this.onCommand(msg.action, msg.payload);
    }
  }
}

/**
 * Generate a unique project ID from the project path.
 * @param {string} projectPath
 * @returns {string}
 */
function generateProjectId(projectPath) {
  return crypto.createHash('md5').update(projectPath).digest('hex').slice(0, 12);
}

module.exports = {
  Coordinator,
  Worker,
  generateProjectId,
  getActiveCoordinator,
  readLock,
  writeLock,
  tryAcquireLock,
  finalizeLock,
  removeLock,
  removeSocket,
  isProcessAlive,
  ensureDir,
  WATCHTOWER_DIR,
  LOCK_FILE,
  SOCKET_PATH,
};
