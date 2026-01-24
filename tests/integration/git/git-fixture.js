/**
 * Git test fixture utilities
 *
 * Creates temporary git repositories with controlled state for integration testing.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Execute git command in a directory
 * @param {string} command - Git command (without 'git' prefix)
 * @param {string} cwd - Working directory
 * @returns {string} - Command output
 */
function git(command, cwd) {
  return execSync(`git ${command}`, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test Author',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test Author',
      GIT_COMMITTER_EMAIL: 'test@example.com',
      // Disable any signing for test repos
      GIT_CONFIG_NOSYSTEM: '1',
    },
  }).trim();
}

/**
 * Create a temporary git repository for testing
 * @returns {Object} - Fixture object with helper methods
 */
function createGitFixture() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-watchtower-test-'));

  // Initialize repository
  git('init', tmpDir);
  git('config user.email "test@example.com"', tmpDir);
  git('config user.name "Test Author"', tmpDir);
  // Disable commit signing for test repos
  git('config commit.gpgsign false', tmpDir);

  // Create initial commit so we have a valid repo
  fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Test Repo\n');
  git('add .', tmpDir);
  git('commit -m "Initial commit"', tmpDir);

  const fixture = {
    path: tmpDir,

    /**
     * Run a git command in the fixture repo
     * @param {string} command - Git command (without 'git' prefix)
     * @returns {string}
     */
    git(command) {
      return git(command, tmpDir);
    },

    /**
     * Create a file and optionally commit it
     * @param {string} filename - File name
     * @param {string} content - File content
     * @param {boolean} commit - Whether to commit the file
     * @param {string} [message] - Commit message
     */
    createFile(filename, content, commit = false, message) {
      const filePath = path.join(tmpDir, filename);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, content);
      if (commit) {
        git('add .', tmpDir);
        git(`commit -m "${message || `Add ${filename}`}"`, tmpDir);
      }
    },

    /**
     * Create a branch and optionally switch to it
     * @param {string} name - Branch name
     * @param {boolean} checkout - Whether to switch to the branch
     */
    createBranch(name, checkout = false) {
      if (checkout) {
        git(`checkout -b ${name}`, tmpDir);
      } else {
        git(`branch ${name}`, tmpDir);
      }
    },

    /**
     * Switch to a branch
     * @param {string} name - Branch name
     */
    checkout(name) {
      git(`checkout ${name}`, tmpDir);
    },

    /**
     * Make a commit with a specific message
     * @param {string} message - Commit message
     * @param {boolean} allowEmpty - Allow empty commit
     */
    commit(message, allowEmpty = false) {
      const emptyFlag = allowEmpty ? '--allow-empty' : '';
      git(`commit ${emptyFlag} -m "${message}"`, tmpDir);
    },

    /**
     * Make a commit with a specific date
     * @param {string} message - Commit message
     * @param {Date} date - Commit date
     */
    commitWithDate(message, date) {
      const dateStr = date.toISOString();
      execSync(`git commit --allow-empty --no-gpg-sign -m "${message}"`, {
        cwd: tmpDir,
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'Test Author',
          GIT_AUTHOR_EMAIL: 'test@example.com',
          GIT_COMMITTER_NAME: 'Test Author',
          GIT_COMMITTER_EMAIL: 'test@example.com',
          GIT_AUTHOR_DATE: dateStr,
          GIT_COMMITTER_DATE: dateStr,
          GIT_CONFIG_NOSYSTEM: '1',
        },
      });
    },

    /**
     * Create a bare remote repository and link it
     * @param {string} [name='origin'] - Remote name
     * @returns {string} - Path to the bare repo
     */
    createRemote(name = 'origin') {
      const remotePath = fs.mkdtempSync(path.join(os.tmpdir(), 'git-watchtower-remote-'));
      git('init --bare', remotePath);
      git(`remote add ${name} "${remotePath}"`, tmpDir);
      // Push current branch to remote
      const currentBranch = git('rev-parse --abbrev-ref HEAD', tmpDir);
      git(`push -u ${name} ${currentBranch}`, tmpDir);
      return remotePath;
    },

    /**
     * Push a branch to remote
     * @param {string} branch - Branch name
     * @param {string} [remote='origin'] - Remote name
     */
    push(branch, remote = 'origin') {
      git(`push ${remote} ${branch}`, tmpDir);
    },

    /**
     * Get the current branch name
     * @returns {string}
     */
    getCurrentBranch() {
      return git('rev-parse --abbrev-ref HEAD', tmpDir);
    },

    /**
     * Get the short hash of HEAD
     * @returns {string}
     */
    getHeadHash() {
      return git('rev-parse --short HEAD', tmpDir);
    },

    /**
     * Clean up the fixture (remove temp directories)
     */
    cleanup() {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (e) {
        // Ignore cleanup errors
      }
    },
  };

  return fixture;
}

module.exports = {
  createGitFixture,
  git,
};
