/**
 * Git command execution module
 * Provides safe, timeout-aware git command execution
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const { GitError } = require('../utils/errors');
const { withTimeout } = require('../utils/async');

const execPromise = promisify(exec);

// Default timeout for git operations (30 seconds)
const DEFAULT_TIMEOUT = 30000;

// Longer timeout for fetch operations (60 seconds)
const FETCH_TIMEOUT = 60000;

/**
 * Execute a git command with timeout and error handling
 * @param {string} command - Git command to execute
 * @param {Object} [options] - Execution options
 * @param {number} [options.timeout] - Command timeout in ms
 * @param {string} [options.cwd] - Working directory
 * @returns {Promise<{stdout: string, stderr: string}>}
 * @throws {GitError}
 */
async function execGit(command, options = {}) {
  const { timeout = DEFAULT_TIMEOUT, cwd = process.cwd() } = options;

  try {
    const promise = execPromise(command, {
      cwd,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
    });

    const result = await withTimeout(
      promise,
      timeout,
      `Git command timed out after ${timeout}ms: ${command}`
    );

    return {
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    };
  } catch (error) {
    // Handle timeout error
    if (error.message.includes('timed out')) {
      throw new GitError(error.message, 'GIT_TIMEOUT', { command });
    }

    // Handle exec error
    throw GitError.fromExecError(error, command, error.stderr);
  }
}

/**
 * Execute git command silently (suppress errors)
 * @param {string} command - Git command to execute
 * @param {Object} [options] - Execution options
 * @returns {Promise<{stdout: string, stderr: string}|null>}
 */
async function execGitSilent(command, options = {}) {
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
    await execGit('git --version', { timeout: 5000 });
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
    await execGit('git rev-parse --git-dir', { cwd, timeout: 5000 });
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
    const { stdout } = await execGit('git remote', { cwd, timeout: 5000 });
    return stdout.split('\n').filter(Boolean);
  } catch (error) {
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

  let command = 'git fetch';
  if (all) command += ' --all';
  if (prune) command += ' --prune';
  command += ' 2>/dev/null'; // Suppress progress output

  try {
    await execGit(command, { cwd, timeout: FETCH_TIMEOUT });
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
    await execGit(`git pull "${remoteName}" "${branchName}"`, {
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
    `git log "${branchName}" -n ${count} --format="${format}"`,
    { cwd }
  );

  return stdout;
}

/**
 * Get commit count by day for sparkline
 * @param {string} branchName - Branch name
 * @param {number} [days=7] - Number of days
 * @param {string} [cwd] - Working directory
 * @returns {Promise<number[]>} - Array of commit counts per day
 */
async function getCommitsByDay(branchName, days = 7, cwd) {
  const counts = new Array(days).fill(0);

  try {
    const { stdout } = await execGit(
      `git log "${branchName}" --format="%ci" --since="${days} days ago"`,
      { cwd, timeout: 10000 }
    );

    if (!stdout) return counts;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const line of stdout.split('\n').filter(Boolean)) {
      const commitDate = new Date(line);
      commitDate.setHours(0, 0, 0, 0);
      const daysDiff = Math.floor((today.getTime() - commitDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff >= 0 && daysDiff < days) {
        counts[days - 1 - daysDiff]++;
      }
    }
  } catch (error) {
    // Return zeros on error
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

  let command = 'git stash push';
  if (includeUntracked) command += ' --include-untracked';
  if (message) command += ` -m "${message.replace(/"/g, '\\"')}"`;

  try {
    const result = await execGit(command, { cwd });
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
    await execGit('git stash pop', { cwd });
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
    const { stdout } = await execGit('git status --porcelain', {
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
      `git diff --name-only "${baseBranch}...${branchName}"`,
      { cwd }
    );
    return stdout.split('\n').filter(Boolean);
  } catch (error) {
    return [];
  }
}

/**
 * Parse git diff --stat output into added/deleted line counts
 * @param {string} diffStatOutput - Output from `git diff --stat`
 * @returns {{added: number, deleted: number}}
 */
function parseDiffStats(diffStatOutput) {
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
    const { stdout } = await execGit(`git diff --stat ${fromCommit}..${toCommit}`, options);
    return parseDiffStats(stdout);
  } catch (e) {
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
    await execGit(`git branch ${flag} "${branchName}"`, { cwd });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof GitError ? error : GitError.fromExecError(error, `branch ${flag}`),
    };
  }
}

module.exports = {
  execGit,
  execGitSilent,
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
  DEFAULT_TIMEOUT,
  FETCH_TIMEOUT,
};
