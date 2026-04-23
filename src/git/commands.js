/**
 * Git command execution module
 * Provides safe, timeout-aware git command execution
 */

const { execFile } = require('child_process');
const { GitError } = require('../utils/errors');

// Default timeout for git operations (30 seconds)
const DEFAULT_TIMEOUT = 30000;

// Longer timeout for fetch operations (60 seconds)
const FETCH_TIMEOUT = 60000;

// Short timeout for quick local operations (5 seconds)
const SHORT_TIMEOUT = 5000;

/**
 * Environment overrides applied to every git child process.
 *
 * LANG=C / LC_ALL=C force git into the C locale so parseable summary
 * lines — e.g. "X files changed, Y insertions(+), Z deletions(-)" —
 * don't get localized into the user's language. Without this,
 * parseDiffStats() returns (0, 0) on systems with a non-English LANG
 * and certain git builds, silently zeroing sparklines and hiding
 * activity from the user.
 *
 * GIT_TERMINAL_PROMPT=0 prevents git from blocking on a credential
 * prompt when auth is needed — we never run interactively, so a prompt
 * would just hang until the timeout fires.
 *
 * Spread `...process.env` first so callers can still override these
 * per-call if needed, and so the child inherits everything else
 * (critically PATH so `git` resolves on Windows).
 */
const GIT_ENV_OVERRIDES = {
  LANG: 'C',
  LC_ALL: 'C',
  GIT_TERMINAL_PROMPT: '0',
};

/**
 * Build the child-process env for a git call.
 *
 * Exported for tests. Accepts a base env (defaults to process.env) so
 * tests can pin behaviour without relying on the runner's shell.
 *
 * @param {NodeJS.ProcessEnv} [base] - Base env; defaults to process.env.
 * @returns {NodeJS.ProcessEnv}
 */
function buildGitEnv(base) {
  return { ...(base || process.env), ...GIT_ENV_OVERRIDES };
}

/**
 * Execute a git command safely using execFile (no shell).
 * @param {string[]} args - Git arguments as an array (e.g. ['log', '--oneline'])
 * @param {Object} [options] - Execution options
 * @param {number} [options.timeout] - Command timeout in ms
 * @param {string} [options.cwd] - Working directory
 * @returns {Promise<{stdout: string, stderr: string}>}
 * @throws {GitError}
 */
async function execGit(args, options = {}) {
  const { timeout = DEFAULT_TIMEOUT, cwd = process.cwd() } = options;

  if (!Array.isArray(args)) {
    throw new TypeError('execGit: args must be an array of strings');
  }

  const command = `git ${args.join(' ')}`;

  try {
    const result = await new Promise((resolve, reject) => {
      execFile('git', args, {
        cwd,
        env: buildGitEnv(),
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
        timeout,          // kill child process after timeout ms
        killSignal: 'SIGTERM',
      }, (error, stdout, stderr) => {
        if (error) {
          error.stderr = stderr;
          reject(error);
        } else {
          resolve({ stdout, stderr });
        }
      });
    });

    return {
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    };
  } catch (error) {
    // execFile sets error.killed = true when the process is killed due to
    // timeout.  GitError.fromExecError already maps killed → GIT_TIMEOUT.
    throw GitError.fromExecError(error, command, error.stderr);
  }
}

/**
 * Execute a git command, collapsing any failure into a null result.
 *
 * Callers use this when they want "the output, or nothing": the fallback
 * pattern `execGitOptional(A) || execGitOptional(B)` relies on this, as does
 * every caller that treats a missing result as "no data to show." This does
 * conflate "branch has no commits" (empty stdout, non-null result) with
 * "git errored" (null result) — if you need to distinguish those, use
 * execGit() and handle the throw yourself.
 *
 * @param {string[]} command - Git arguments
 * @param {Object} [options] - Execution options
 * @returns {Promise<{stdout: string, stderr: string}|null>} Result, or null if git failed
 */
async function execGitOptional(command, options = {}) {
  try {
    return await execGit(command, options);
  } catch (error) {
    return null;
  }
}

/**
 * Check if git is available
 * @returns {Promise<boolean>}
 */
async function isGitAvailable() {
  try {
    await execGit(['--version'], { timeout: 5000 });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Check if current directory is a git repository
 * @param {string} [cwd] - Working directory
 * @returns {Promise<boolean>}
 */
async function isGitRepository(cwd) {
  try {
    await execGit(['rev-parse', '--git-dir'], { cwd, timeout: 5000 });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get list of remotes
 * @param {string} [cwd] - Working directory
 * @returns {Promise<string[]>}
 */
async function getRemotes(cwd) {
  try {
    const { stdout } = await execGit(['remote'], { cwd, timeout: 5000 });
    return stdout.split('\n').filter(Boolean);
  } catch (error) {
    // Not a git repo or `git remote` unavailable — treat as "no remotes".
    return [];
  }
}

/**
 * Check if a specific remote exists
 * @param {string} remoteName - Remote name to check
 * @param {string} [cwd] - Working directory
 * @returns {Promise<boolean>}
 */
async function remoteExists(remoteName, cwd) {
  const remotes = await getRemotes(cwd);
  return remotes.includes(remoteName);
}

/**
 * Fetch from remote with timeout
 * @param {string} [remoteName='origin'] - Remote name
 * @param {Object} [options] - Fetch options
 * @param {boolean} [options.prune=true] - Prune deleted branches
 * @param {boolean} [options.all=true] - Fetch all branches
 * @param {string} [options.cwd] - Working directory
 * @returns {Promise<{success: boolean, error?: GitError}>}
 */
async function fetch(remoteName = 'origin', options = {}) {
  const { prune = true, all = true, cwd } = options;

  const args = ['fetch'];
  if (all) args.push('--all');
  if (prune) args.push('--prune');
  // When not fetching all remotes, target the specified remote.
  // (`git fetch --all <remote>` is redundant and can confuse older git versions.)
  if (!all && remoteName) args.push(remoteName);

  try {
    await execGit(args, { cwd, timeout: FETCH_TIMEOUT });
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
}

/**
 * Pull from remote
 * @param {string} remoteName - Remote name
 * @param {string} branchName - Branch to pull
 * @param {string} [cwd] - Working directory
 * @returns {Promise<{success: boolean, error?: GitError}>}
 */
async function pull(remoteName, branchName, cwd) {
  try {
    await execGit(['pull', remoteName, branchName], {
      cwd,
      timeout: FETCH_TIMEOUT,
    });
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
}

/**
 * Get commit log for a branch
 * @param {string} branchName - Branch name
 * @param {Object} [options] - Log options
 * @param {number} [options.count=10] - Number of commits
 * @param {string} [options.format] - Format string
 * @param {string} [options.cwd] - Working directory
 * @returns {Promise<string>}
 */
async function log(branchName, options = {}) {
  const {
    count = 10,
    format = '%h|%s|%cr',
    cwd,
  } = options;

  const { stdout } = await execGit(
    ['log', branchName, '-n', String(count), `--format=${format}`],
    { cwd }
  );

  return stdout;
}

/**
 * Get commit count by day for sparkline.
 *
 * Buckets commits by local calendar date rather than by dividing a ms
 * difference by 86 400 000, which breaks on DST transitions (a
 * spring-forward day is only 23 h, causing Math.floor(23/24) = 0 and
 * merging yesterday's commits into today's bucket).
 *
 * @param {string} branchName - Branch name
 * @param {number} [days=7] - Number of days
 * @param {string} [cwd] - Working directory
 * @returns {Promise<number[]>} - Array of commit counts per day
 */
async function getCommitsByDay(branchName, days = 7, cwd) {
  const counts = new Array(days).fill(0);

  try {
    const { stdout } = await execGit(
      ['log', branchName, '--format=%ci', `--since=${days} days ago`],
      { cwd, timeout: 10000 }
    );

    if (!stdout) return counts;

    // Build a map from "YYYY-MM-DD" → bucket index. Using setDate()
    // to step backwards is DST-safe because it adjusts the calendar
    // day without relying on a fixed ms offset.
    const today = new Date();
    const dayBuckets = new Map();
    for (let i = 0; i < days; i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      dayBuckets.set(key, days - 1 - i);
    }

    for (const line of stdout.split('\n').filter(Boolean)) {
      const commitDate = new Date(line);
      const key = `${commitDate.getFullYear()}-${String(commitDate.getMonth() + 1).padStart(2, '0')}-${String(commitDate.getDate()).padStart(2, '0')}`;
      const idx = dayBuckets.get(key);
      if (idx !== undefined) {
        counts[idx]++;
      }
    }
  } catch (error) {
    // Sparkline is decorative — a git-log failure (missing branch, network
    // hiccup) returns all-zeros and renders a flat bar rather than crashing
    // the caller.
  }

  return counts;
}

/**
 * Stash all uncommitted changes (tracked and untracked)
 * @param {Object} [options] - Stash options
 * @param {string} [options.message] - Optional stash message
 * @param {boolean} [options.includeUntracked=true] - Include untracked files
 * @param {string} [options.cwd] - Working directory
 * @returns {Promise<{success: boolean, error?: GitError}>}
 */
async function stash(options = {}) {
  const { message, includeUntracked = true, cwd } = options;

  const args = ['stash', 'push'];
  if (includeUntracked) args.push('--include-untracked');
  if (message) {
    args.push('-m', message);
  }

  try {
    const result = await execGit(args, { cwd });
    // git stash returns "No local changes to save" if there's nothing to stash
    if (result.stdout.includes('No local changes')) {
      return { success: false, error: new GitError('No local changes to stash', 'GIT_STASH_EMPTY') };
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof GitError ? error : GitError.fromExecError(error, 'stash'),
    };
  }
}

/**
 * Pop the most recent stash entry
 * @param {Object} [options] - Options
 * @param {string} [options.cwd] - Working directory
 * @returns {Promise<{success: boolean, error?: GitError}>}
 */
async function stashPop(options = {}) {
  const { cwd } = options;

  try {
    await execGit(['stash', 'pop'], { cwd });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof GitError ? error : GitError.fromExecError(error, 'stash pop'),
    };
  }
}

/**
 * Check if working directory has uncommitted changes
 * @param {string} [cwd] - Working directory
 * @returns {Promise<boolean>}
 */
async function hasUncommittedChanges(cwd) {
  try {
    const { stdout } = await execGit(['status', '--porcelain'], {
      cwd,
      timeout: 5000,
    });
    return stdout.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Get changed files for a branch compared to another
 * @param {string} branchName - Branch to compare
 * @param {string} [baseBranch] - Base branch (defaults to current)
 * @param {string} [cwd] - Working directory
 * @returns {Promise<string[]>}
 */
async function getChangedFiles(branchName, baseBranch = 'HEAD', cwd) {
  try {
    const { stdout } = await execGit(
      ['diff', '--name-only', `${baseBranch}...${branchName}`],
      { cwd }
    );
    return stdout.split('\n').filter(Boolean);
  } catch (error) {
    // Diff fails when branches share no common ancestor, or when either
    // ref doesn't exist. Caller renders "no changed files" either way.
    return [];
  }
}

/**
 * Parse git diff --stat output into added/deleted line counts
 * @param {string} diffStatOutput - Output from `git diff --stat`
 * @returns {{added: number, deleted: number}}
 */
function parseDiffStats(diffStatOutput) {
  if (!diffStatOutput) return { added: 0, deleted: 0 };

  // Parse the summary line: "X files changed, Y insertions(+), Z deletions(-)"
  const match = diffStatOutput.match(/(\d+) insertions?\(\+\).*?(\d+) deletions?\(-\)/);
  if (match) {
    return { added: parseInt(match[1], 10), deleted: parseInt(match[2], 10) };
  }
  // Try to match just insertions or just deletions
  const insertMatch = diffStatOutput.match(/(\d+) insertions?\(\+\)/);
  const deleteMatch = diffStatOutput.match(/(\d+) deletions?\(-\)/);
  return {
    added: insertMatch ? parseInt(insertMatch[1], 10) : 0,
    deleted: deleteMatch ? parseInt(deleteMatch[1], 10) : 0,
  };
}

/**
 * Get diff stats between two commits
 * @param {string} fromCommit - Starting commit
 * @param {string} [toCommit='HEAD'] - Ending commit
 * @param {Object} [options] - Options
 * @param {string} [options.cwd] - Working directory
 * @returns {Promise<{added: number, deleted: number}>}
 */
async function getDiffStats(fromCommit, toCommit = 'HEAD', options = {}) {
  try {
    const { stdout } = await execGit(['diff', '--stat', `${fromCommit}..${toCommit}`], options);
    return parseDiffStats(stdout);
  } catch (e) {
    // Diff fails when a ref is gone or commits share no ancestor. Zero
    // added/deleted renders as "no change summary" in the activity log.
    return { added: 0, deleted: 0 };
  }
}

/**
 * Delete a local branch
 * @param {string} branchName - Branch to delete
 * @param {Object} [options] - Options
 * @param {boolean} [options.force=false] - Force delete (git branch -D) even if not fully merged
 * @param {string} [options.cwd] - Working directory
 * @returns {Promise<{success: boolean, error?: GitError}>}
 */
async function deleteLocalBranch(branchName, options = {}) {
  const { force = false, cwd } = options;
  const flag = force ? '-D' : '-d';

  try {
    await execGit(['branch', flag, branchName], { cwd });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof GitError ? error : GitError.fromExecError(error, `branch ${flag}`),
    };
  }
}

/**
 * Get ahead/behind counts for a branch relative to a base ref.
 * Uses `git rev-list --left-right --count base...branch`.
 * @param {string} branchRef - Branch ref (e.g. "feature/foo" or "origin/feature/foo")
 * @param {string} baseRef - Base ref to compare against (e.g. "origin/main")
 * @param {Object} [options] - Options
 * @param {string} [options.cwd] - Working directory
 * @returns {Promise<{ahead: number, behind: number}>}
 */
async function getAheadBehind(branchRef, baseRef, options = {}) {
  try {
    const { stdout } = await execGit(
      ['rev-list', '--left-right', '--count', `${baseRef}...${branchRef}`],
      { ...options, timeout: SHORT_TIMEOUT }
    );
    const parts = stdout.trim().split(/\s+/);
    return {
      behind: parseInt(parts[0], 10) || 0,
      ahead: parseInt(parts[1], 10) || 0,
    };
  } catch (e) {
    // rev-list fails when baseRef is missing (no remote yet) or when the
    // branches share no common ancestor. 0/0 hides the ahead/behind column
    // for that row rather than crashing the background refresher.
    return { ahead: 0, behind: 0 };
  }
}

/**
 * Get diff stats (lines added/deleted) between two refs using three-dot syntax.
 * @param {string} baseRef - Base ref (e.g. "origin/main")
 * @param {string} branchRef - Branch ref (e.g. "feature/foo")
 * @param {Object} [options] - Options
 * @param {string} [options.cwd] - Working directory
 * @returns {Promise<{added: number, deleted: number}>}
 */
async function getDiffShortstat(baseRef, branchRef, options = {}) {
  try {
    const { stdout } = await execGit(
      ['diff', '--shortstat', `${baseRef}...${branchRef}`],
      { ...options, timeout: SHORT_TIMEOUT }
    );
    return parseDiffStats(stdout);
  } catch (e) {
    // See getAheadBehind: same background-refresh path, same 0/0 fallback
    // to hide the +/- column when a ref is missing.
    return { added: 0, deleted: 0 };
  }
}

module.exports = {
  execGit,
  execGitOptional,
  isGitAvailable,
  isGitRepository,
  getRemotes,
  remoteExists,
  fetch,
  pull,
  log,
  getCommitsByDay,
  hasUncommittedChanges,
  stash,
  stashPop,
  getChangedFiles,
  parseDiffStats,
  getDiffStats,
  deleteLocalBranch,
  getAheadBehind,
  getDiffShortstat,
  buildGitEnv,
  GIT_ENV_OVERRIDES,
  DEFAULT_TIMEOUT,
  FETCH_TIMEOUT,
};
