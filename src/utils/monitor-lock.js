/**
 * Per-repository single-instance lock for the CLI monitor.
 *
 * Prevents two `git-watchtower` TUI processes from running against the same
 * repository at the same time — without this, both render to the same TTY,
 * stomping on each other's frames (selection cursor bounces between their
 * independent selectedIndex values, CURRENT label flips while one process
 * lags the other's checkout, activity log flips between two buffers, etc.).
 *
 * The lock file lives at `~/.watchtower/monitor-<sha1(repoRoot)>.lock` and
 * contains `{ pid, startedAt, cwd }`. We use the same atomic
 * `fs.openSync(..., 'wx')` pattern as {@link module:server/coordinator} so
 * two processes racing to acquire cannot both succeed. Dead-owner locks are
 * treated as stale and cleaned up.
 *
 * Zero runtime dependencies — only Node built-ins.
 *
 * @module utils/monitor-lock
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const WATCHTOWER_DIR = path.join(os.homedir(), '.watchtower');

/**
 * Check if a process with the given PID is alive.
 * @param {number} pid
 * @returns {boolean}
 */
function isProcessAlive(pid) {
  if (!pid || typeof pid !== 'number') return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // ESRCH = no such process; EPERM = exists but owned by another user
    return e.code === 'EPERM';
  }
}

/**
 * Compute the lock file path for a given repo root.
 * @param {string} repoRoot - Absolute path to the repo
 * @returns {string}
 */
function lockFilePath(repoRoot) {
  const hash = crypto.createHash('sha1').update(repoRoot).digest('hex').slice(0, 16);
  return path.join(WATCHTOWER_DIR, `monitor-${hash}.lock`);
}

function ensureDir() {
  if (!fs.existsSync(WATCHTOWER_DIR)) {
    fs.mkdirSync(WATCHTOWER_DIR, { recursive: true });
  }
}

/**
 * Read and parse a lock file. Returns null on any I/O or parse error.
 * @param {string} file
 * @returns {{ pid: number, startedAt?: number, cwd?: string } | null}
 */
function readLock(file) {
  try {
    if (!fs.existsSync(file)) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || typeof data.pid !== 'number') return null;
    return data;
  } catch (e) {
    return null;
  }
}

function removeLock(file) {
  try { fs.unlinkSync(file); } catch (e) { /* ignore */ }
}

/**
 * @typedef {Object} AcquireResult
 * @property {true}  acquired
 * @property {string} file  - Path of the lock we now own
 *
 * @typedef {Object} ConflictResult
 * @property {false} acquired
 * @property {'busy'} reason
 * @property {string} file
 * @property {{ pid: number, startedAt?: number, cwd?: string }} existing
 */

/**
 * Atomically try to acquire the monitor lock for the given repo.
 *
 * - If the lock file doesn't exist, create it exclusively and return acquired.
 * - If it exists but the owning PID is dead (stale), remove it and retry.
 * - If it exists and the owning PID is alive, return busy.
 *
 * @param {string} repoRoot - Absolute path to the repo
 * @param {Object} [opts]
 * @param {number} [opts.pid] - PID to record (defaults to process.pid)
 * @returns {AcquireResult | ConflictResult}
 */
function acquire(repoRoot, opts = {}) {
  if (typeof repoRoot !== 'string' || !repoRoot) {
    throw new TypeError('acquire: repoRoot must be a non-empty string');
  }
  ensureDir();
  const pid = opts.pid || process.pid;
  const file = lockFilePath(repoRoot);
  const payload = JSON.stringify({ pid, startedAt: Date.now(), cwd: repoRoot });

  // One retry after stale-lock cleanup — matches coordinator.js's approach.
  // A second race loss after cleanup is surfaced as busy rather than looping
  // indefinitely against a hostile or rapidly-respawning peer.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(file, 'wx');
      try {
        fs.writeSync(fd, payload + '\n');
      } finally {
        fs.closeSync(fd);
      }
      return { acquired: true, file };
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;

      const existing = readLock(file);
      if (existing && isProcessAlive(existing.pid)) {
        return { acquired: false, reason: 'busy', file, existing };
      }
      // Stale lock — owner is dead or file is unreadable garbage. Clean up and retry.
      removeLock(file);
    }
  }

  // Lost the retry race to another starter; treat as busy.
  const existing = readLock(file);
  return {
    acquired: false,
    reason: 'busy',
    file,
    existing: existing || { pid: 0 },
  };
}

/**
 * Release a previously acquired lock. Only removes the file if the PID inside
 * matches the given (or current) PID — guards against deleting a lock that
 * was reacquired by a different process after our own stale cleanup.
 *
 * @param {string} file - Lock file path returned from acquire()
 * @param {Object} [opts]
 * @param {number} [opts.pid] - PID to check against (defaults to process.pid)
 */
function release(file, opts = {}) {
  if (!file) return;
  const pid = opts.pid || process.pid;
  const existing = readLock(file);
  if (existing && existing.pid === pid) {
    removeLock(file);
  }
}

module.exports = {
  acquire,
  release,
  lockFilePath,
  readLock,
  isProcessAlive,
  WATCHTOWER_DIR,
};
