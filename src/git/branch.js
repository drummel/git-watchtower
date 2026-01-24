/**
 * Git branch operations module
 * Provides branch management and parsing
 */

const { execGit, execGitSilent, fetch, hasUncommittedChanges, getCommitsByDay, log } = require('./commands');
const { GitError, ValidationError } = require('../utils/errors');

// Valid git branch name pattern (conservative)
const VALID_BRANCH_PATTERN = /^[a-zA-Z0-9_\-./]+$/;

/**
 * @typedef {Object} Branch
 * @property {string} name - Branch name
 * @property {string} commit - Short commit hash
 * @property {string} subject - Commit subject
 * @property {Date} date - Commit date
 * @property {boolean} isLocal - Is a local branch
 * @property {boolean} hasRemote - Has a remote tracking branch
 * @property {boolean} hasUpdates - Has updates available from remote
 * @property {string} [remoteCommit] - Remote commit hash
 * @property {Date} [remoteDate] - Remote commit date
 * @property {string} [remoteSubject] - Remote commit subject
 * @property {boolean} [isNew] - Newly discovered branch
 * @property {boolean} [isDeleted] - Branch was deleted
 * @property {boolean} [justUpdated] - Was just updated
 * @property {string} [sparkline] - Activity sparkline
 */

/**
 * Validate a branch name for safety
 * @param {string} name - Branch name to validate
 * @returns {boolean}
 */
function isValidBranchName(name) {
  if (!name || typeof name !== 'string') return false;
  if (name.length > 255) return false;
  if (!VALID_BRANCH_PATTERN.test(name)) return false;
  // Reject dangerous patterns
  if (name.includes('..')) return false;
  if (name.startsWith('-')) return false;
  if (name.startsWith('/') || name.endsWith('/')) return false;
  return true;
}

/**
 * Sanitize and validate a branch name
 * @param {string} name - Branch name to sanitize
 * @returns {string}
 * @throws {ValidationError}
 */
function sanitizeBranchName(name) {
  if (!isValidBranchName(name)) {
    throw ValidationError.invalidBranchName(name);
  }
  return name;
}

/**
 * Get the current branch name
 * @param {string} [cwd] - Working directory
 * @returns {Promise<{name: string|null, isDetached: boolean}>}
 */
async function getCurrentBranch(cwd) {
  try {
    const { stdout } = await execGit('git rev-parse --abbrev-ref HEAD', { cwd });

    if (stdout === 'HEAD') {
      // Detached HEAD state - get short commit hash
      const { stdout: commitHash } = await execGit('git rev-parse --short HEAD', { cwd });
      return { name: `HEAD@${commitHash}`, isDetached: true };
    }

    return { name: stdout, isDetached: false };
  } catch (error) {
    return { name: null, isDetached: false };
  }
}

/**
 * Get all branches (local and remote)
 * @param {Object} [options] - Options
 * @param {string} [options.remoteName='origin'] - Remote name
 * @param {boolean} [options.fetch=true] - Fetch before listing
 * @param {string} [options.cwd] - Working directory
 * @returns {Promise<Branch[]>}
 */
async function getAllBranches(options = {}) {
  const { remoteName = 'origin', fetch: shouldFetch = true, cwd } = options;

  try {
    // Optionally fetch first
    if (shouldFetch) {
      await fetch(remoteName, { prune: true, all: true, cwd });
    }

    const branchList = [];
    const seenBranches = new Set();

    // Get local branches
    const localResult = await execGitSilent(
      'git for-each-ref --sort=-committerdate --format="%(refname:short)|%(committerdate:iso8601)|%(objectname:short)|%(subject)" refs/heads/',
      { cwd }
    );

    if (localResult) {
      for (const line of localResult.stdout.split('\n').filter(Boolean)) {
        const [name, dateStr, commit, subject] = line.split('|');
        if (!seenBranches.has(name) && isValidBranchName(name)) {
          seenBranches.add(name);
          branchList.push({
            name,
            commit,
            subject: subject || '',
            date: new Date(dateStr),
            isLocal: true,
            hasRemote: false,
            hasUpdates: false,
          });
        }
      }
    }

    // Get remote branches
    const remoteResult = await execGitSilent(
      `git for-each-ref --sort=-committerdate --format="%(refname:short)|%(committerdate:iso8601)|%(objectname:short)|%(subject)" refs/remotes/${remoteName}/`,
      { cwd }
    );

    if (remoteResult) {
      const remotePrefix = `${remoteName}/`;
      for (const line of remoteResult.stdout.split('\n').filter(Boolean)) {
        const [fullName, dateStr, commit, subject] = line.split('|');
        const name = fullName.replace(remotePrefix, '');

        if (name === 'HEAD') continue;
        if (!isValidBranchName(name)) continue;

        const existing = /** @type {Branch|undefined} */ (branchList.find((b) => b.name === name));
        if (existing) {
          existing.hasRemote = true;
          existing.remoteCommit = commit;
          existing.remoteDate = new Date(dateStr);
          existing.remoteSubject = subject || '';
          if (commit !== existing.commit) {
            existing.hasUpdates = true;
            // Use remote's date when it has updates (so it sorts to top)
            existing.date = new Date(dateStr);
            existing.subject = subject || existing.subject;
          }
        } else if (!seenBranches.has(name)) {
          seenBranches.add(name);
          branchList.push({
            name,
            commit,
            subject: subject || '',
            date: new Date(dateStr),
            isLocal: false,
            hasRemote: true,
            hasUpdates: false,
          });
        }
      }
    }

    // Sort by date (most recent first)
    branchList.sort((a, b) => b.date.getTime() - a.date.getTime());

    return branchList;
  } catch (error) {
    throw new GitError(`Failed to get branches: ${error.message}`, 'GIT_BRANCH_LIST_FAILED', {
      originalError: error,
    });
  }
}

/**
 * Detect changes between two branch lists
 * @param {Branch[]} oldBranches - Previous branch list
 * @param {Branch[]} newBranches - Current branch list
 * @returns {{added: Branch[], removed: Branch[], updated: Branch[]}}
 */
function detectBranchChanges(oldBranches, newBranches) {
  const oldNames = new Map(oldBranches.map((b) => [b.name, b]));
  const newNames = new Map(newBranches.map((b) => [b.name, b]));

  const added = newBranches.filter((b) => !oldNames.has(b.name));
  const removed = oldBranches.filter((b) => !newNames.has(b.name));
  const updated = newBranches.filter((b) => {
    const old = oldNames.get(b.name);
    return old && old.commit !== b.commit;
  });

  return { added, removed, updated };
}

/**
 * Check out a branch
 * @param {string} branchName - Branch to check out
 * @param {Object} [options] - Options
 * @param {string} [options.remoteName='origin'] - Remote name
 * @param {boolean} [options.force=false] - Force checkout (discard changes)
 * @param {string} [options.cwd] - Working directory
 * @returns {Promise<{success: boolean, error?: GitError}>}
 */
async function checkout(branchName, options = {}) {
  const { remoteName = 'origin', force = false, cwd } = options;

  try {
    // Validate branch name
    const safeName = sanitizeBranchName(branchName);

    // Check for uncommitted changes (unless force)
    if (!force && (await hasUncommittedChanges(cwd))) {
      return {
        success: false,
        error: new GitError(
          'Cannot switch: uncommitted changes in working directory',
          'GIT_DIRTY_WORKDIR'
        ),
      };
    }

    // Check if local branch exists
    const { stdout: localBranches } = await execGit('git branch --list', { cwd });
    const hasLocal = localBranches
      .split('\n')
      .some((b) => b.trim().replace('* ', '') === safeName);

    if (hasLocal) {
      // Local branch exists - just check out
      if (force) {
        await execGit(`git checkout -- . 2>/dev/null; git checkout "${safeName}"`, { cwd });
      } else {
        await execGit(`git checkout "${safeName}"`, { cwd });
      }
    } else {
      // Create local branch from remote
      await execGit(`git checkout -b "${safeName}" "${remoteName}/${safeName}"`, { cwd });
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof GitError ? error : GitError.fromExecError(error, 'checkout'),
    };
  }
}

/**
 * Get preview data for a branch
 * @param {string} branchName - Branch name
 * @param {Object} [options] - Options
 * @param {number} [options.commitCount=5] - Number of commits to show
 * @param {number} [options.fileCount=10] - Number of files to show
 * @param {string} [options.cwd] - Working directory
 * @returns {Promise<{commits: Array, files: string[]}>}
 */
async function getPreviewData(branchName, options = {}) {
  const { commitCount = 5, fileCount = 10, cwd } = options;

  try {
    const safeName = sanitizeBranchName(branchName);

    // Get recent commits
    const commitLog = await log(safeName, {
      count: commitCount,
      format: '%h|%s|%cr',
      cwd,
    });

    const commits = commitLog
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, subject, time] = line.split('|');
        return { hash, subject, time };
      });

    // Get changed files compared to current branch
    let files = [];
    try {
      const { stdout: diffFiles } = await execGit(
        `git diff --name-only HEAD..."${safeName}" 2>/dev/null`,
        { cwd }
      );
      files = diffFiles.split('\n').filter(Boolean).slice(0, fileCount);
    } catch (e) {
      // May fail if branches have no common ancestor
    }

    return { commits, files };
  } catch (error) {
    return { commits: [], files: [] };
  }
}

/**
 * Generate sparkline for branch activity
 * @param {string} branchName - Branch name
 * @param {Object} [options] - Options
 * @param {number} [options.days=7] - Days to include
 * @param {string} [options.cwd] - Working directory
 * @returns {Promise<string>}
 */
async function generateSparkline(branchName, options = {}) {
  const { days = 7, cwd } = options;

  const sparkChars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const counts = await getCommitsByDay(branchName, days, cwd);

  if (counts.every((c) => c === 0)) {
    return ' '.repeat(days);
  }

  const max = Math.max(...counts);
  return counts
    .map((count) => {
      if (count === 0) return ' ';
      const level = Math.floor((count / max) * 7);
      return sparkChars[Math.min(level, 7)];
    })
    .join('');
}

/**
 * Get list of local branches
 * @param {string} [cwd] - Working directory
 * @returns {Promise<string[]>}
 */
async function getLocalBranches(cwd) {
  try {
    const { stdout } = await execGit('git branch --list', { cwd });
    return stdout
      .split('\n')
      .map((b) => b.trim().replace('* ', ''))
      .filter(Boolean);
  } catch (error) {
    return [];
  }
}

/**
 * Check if a branch exists locally
 * @param {string} branchName - Branch name
 * @param {string} [cwd] - Working directory
 * @returns {Promise<boolean>}
 */
async function localBranchExists(branchName, cwd) {
  const branches = await getLocalBranches(cwd);
  return branches.includes(branchName);
}

module.exports = {
  isValidBranchName,
  sanitizeBranchName,
  getCurrentBranch,
  getAllBranches,
  detectBranchChanges,
  checkout,
  getPreviewData,
  generateSparkline,
  getLocalBranches,
  localBranchExists,
  VALID_BRANCH_PATTERN,
};
