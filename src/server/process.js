/**
 * Server process management for command mode
 * Manages spawning, stopping, and monitoring of user's dev server
 */

const { spawn } = require('child_process');
const { ServerError } = require('../utils/errors');

/**
 * @typedef {Object} ServerProcessState
 * @property {import('child_process').ChildProcess|null} process - The server process
 * @property {boolean} running - Is the server running
 * @property {boolean} crashed - Did the server crash
 * @property {Array<{timestamp: string, line: string, isError: boolean}>} logs - Server logs
 */

/**
 * Maximum log lines to keep in buffer
 */
const MAX_LOG_LINES = 500;

/**
 * Grace period before force kill (ms)
 */
const KILL_GRACE_PERIOD = 3000;

/**
 * Restart delay after stop (ms)
 */
const RESTART_DELAY = 500;

/**
 * Parse a command string into command and arguments
 * Handles quoted strings properly
 * @param {string} commandString - Command string to parse
 * @returns {{command: string, args: string[]}}
 */
function parseCommand(commandString) {
  const args = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < commandString.length; i++) {
    const char = commandString[i];

    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuotes) {
      inQuotes = false;
      quoteChar = '';
    } else if (char === ' ' && !inQuotes) {
      if (current) {
        args.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current) {
    args.push(current);
  }

  return {
    command: args[0] || '',
    args: args.slice(1),
  };
}

/**
 * Server process manager
 */
class ProcessManager {
  /**
   * @param {Object} [options]
   * @param {string} [options.cwd] - Working directory
   * @param {Function} [options.onLog] - Log callback (line, isError)
   * @param {Function} [options.onStateChange] - State change callback (state)
   */
  constructor(options = {}) {
    this.cwd = options.cwd || process.cwd();
    this.onLog = options.onLog || (() => {});
    this.onStateChange = options.onStateChange || (() => {});

    this.process = null;
    this.running = false;
    this.crashed = false;
    this.logs = [];
    this.command = '';
  }

  /**
   * Get current state
   * @returns {ServerProcessState}
   */
  getState() {
    return {
      process: this.process,
      running: this.running,
      crashed: this.crashed,
      logs: [...this.logs],
    };
  }

  /**
   * Add a log entry
   * @param {string} line - Log line
   * @param {boolean} [isError=false] - Is error output
   */
  addLog(line, isError = false) {
    const entry = {
      timestamp: new Date().toLocaleTimeString(),
      line,
      isError,
    };
    this.logs.push(entry);
    if (this.logs.length > MAX_LOG_LINES) {
      this.logs.shift();
    }
    this.onLog(line, isError);
  }

  /**
   * Clear log buffer
   */
  clearLogs() {
    this.logs = [];
  }

  /**
   * Start the server process
   * @param {string} commandString - Command to run
   * @returns {{success: boolean, error?: Error, pid?: number}}
   */
  start(commandString) {
    if (!commandString) {
      return {
        success: false,
        error: ServerError.startFailed(commandString, 'No command specified'),
      };
    }

    // Stop existing process first
    if (this.process) {
      this.stop();
    }

    this.clearLogs();
    this.crashed = false;
    this.running = false;
    this.command = commandString;

    this.addLog(`$ ${commandString}`);

    // Parse command
    const { command, args } = parseCommand(commandString);

    if (!command) {
      const error = ServerError.startFailed(commandString, 'Invalid command');
      this.crashed = true;
      this.addLog(`Failed to start: Invalid command`, true);
      this.notifyStateChange();
      return { success: false, error };
    }

    // Spawn options
    const isWindows = process.platform === 'win32';
    /** @type {import('child_process').SpawnOptions} */
    const spawnOptions = {
      cwd: this.cwd,
      env: { ...process.env, FORCE_COLOR: '1' },
      shell: isWindows,
      stdio: ['ignore', 'pipe', 'pipe'],
    };

    try {
      this.process = spawn(command, args, spawnOptions);
      this.running = true;

      // Handle stdout
      this.process.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n').filter(Boolean);
        lines.forEach((line) => this.addLog(line));
      });

      // Handle stderr
      this.process.stderr?.on('data', (data) => {
        const lines = data.toString().split('\n').filter(Boolean);
        lines.forEach((line) => this.addLog(line, true));
      });

      // Handle error
      this.process.on('error', (err) => {
        this.running = false;
        this.crashed = true;
        this.addLog(`Error: ${err.message}`, true);
        this.notifyStateChange();
      });

      // Handle close
      this.process.on('close', (code) => {
        this.running = false;
        if (code !== 0 && code !== null) {
          this.crashed = true;
          this.addLog(`Process exited with code ${code}`, true);
        } else {
          this.addLog('Process stopped');
        }
        this.process = null;
        this.notifyStateChange();
      });

      this.notifyStateChange();
      return { success: true, pid: this.process.pid };
    } catch (err) {
      this.crashed = true;
      this.addLog(`Failed to start: ${err.message}`, true);
      this.notifyStateChange();
      return {
        success: false,
        error: ServerError.startFailed(commandString, err.message),
      };
    }
  }

  /**
   * Stop the server process
   * @returns {boolean} - True if a process was stopped
   */
  stop() {
    if (!this.process) {
      return false;
    }

    // Capture reference before nulling — needed for deferred SIGKILL
    const proc = this.process;

    // Try graceful shutdown first
    if (process.platform === 'win32') {
      try {
        spawn('taskkill', ['/pid', proc.pid.toString(), '/f', '/t']);
      } catch (e) {
        // Ignore taskkill errors
      }
    } else {
      try {
        proc.kill('SIGTERM');

        // Force kill after grace period
        const forceKillTimeout = setTimeout(() => {
          try {
            proc.kill('SIGKILL');
          } catch (e) {
            // Process may already be dead
          }
        }, KILL_GRACE_PERIOD);

        // Clear timeout if process exits cleanly
        proc.once('close', () => {
          clearTimeout(forceKillTimeout);
        });
      } catch (e) {
        // Process may already be dead
      }
    }

    this.process = null;
    this.running = false;
    this.notifyStateChange();
    return true;
  }

  /**
   * Restart the server process
   * @returns {Promise<{success: boolean, error?: Error, pid?: number}>}
   */
  async restart() {
    const command = this.command;
    this.stop();

    // Wait before restarting
    await new Promise((resolve) => setTimeout(resolve, RESTART_DELAY));

    return this.start(command);
  }

  /**
   * Check if server is running
   * @returns {boolean}
   */
  isRunning() {
    return this.running;
  }

  /**
   * Check if server crashed
   * @returns {boolean}
   */
  hasCrashed() {
    return this.crashed;
  }

  /**
   * Get server PID
   * @returns {number|null}
   */
  getPid() {
    return this.process ? this.process.pid : null;
  }

  /**
   * Notify state change
   * @private
   */
  notifyStateChange() {
    this.onStateChange(this.getState());
  }
}

module.exports = {
  ProcessManager,
  parseCommand,
  MAX_LOG_LINES,
  KILL_GRACE_PERIOD,
  RESTART_DELAY,
};
