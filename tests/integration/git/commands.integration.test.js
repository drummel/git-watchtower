/**
 * Integration tests for git commands module
 *
 * These tests use temporary git repositories to test actual git operations.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { createGitFixture } = require('./git-fixture');
const {
  execGit,
  fetch,
  pull,
  log,
  getCommitsByDay,
  getChangedFiles,
  hasUncommittedChanges,
  deleteLocalBranch,
} = require('../../../src/git/commands');

describe('commands.js integration tests', () => {
  let fixture;
  let remotePath;

  beforeEach(() => {
    fixture = createGitFixture();
  });

  afterEach(() => {
    if (fixture) {
      fixture.cleanup();
    }
  });

  describe('fetch', () => {
    beforeEach(() => {
      remotePath = fixture.createRemote('origin');
    });

    it('should fetch from remote successfully', async () => {
      const result = await fetch('origin', { cwd: fixture.path });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.error, undefined);
    });

    it('should fetch with prune option', async () => {
      const result = await fetch('origin', { prune: true, cwd: fixture.path });
      assert.strictEqual(result.success, true);
    });

    it('should fetch all branches', async () => {
      const result = await fetch('origin', { all: true, cwd: fixture.path });
      assert.strictEqual(result.success, true);
    });

    it('should succeed silently when no remotes exist', async () => {
      // git fetch with no remotes configured does nothing but succeeds
      const noRemoteFixture = require('./git-fixture').createGitFixture();
      try {
        const result = await fetch('origin', {
          all: false,
          cwd: noRemoteFixture.path,
        });
        // Git fetch succeeds even with no remotes (it just does nothing)
        assert.strictEqual(result.success, true);
      } finally {
        noRemoteFixture.cleanup();
      }
    });
  });

  describe('pull', () => {
    beforeEach(() => {
      remotePath = fixture.createRemote('origin');
    });

    it('should pull from remote successfully when up to date', async () => {
      const currentBranch = fixture.getCurrentBranch();
      const result = await pull('origin', currentBranch, fixture.path);
      assert.strictEqual(result.success, true);
    });

    it('should return error for non-existent remote', async () => {
      const result = await pull('nonexistent', 'main', fixture.path);
      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    it('should return error for non-existent branch', async () => {
      const result = await pull('origin', 'nonexistent-branch', fixture.path);
      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });
  });

  describe('log', () => {
    it('should return commit log for current branch', async () => {
      // Add some commits
      fixture.createFile('file1.txt', 'content1', true, 'First commit');
      fixture.createFile('file2.txt', 'content2', true, 'Second commit');

      const currentBranch = fixture.getCurrentBranch();
      const result = await log(currentBranch, { cwd: fixture.path });

      assert.ok(result.includes('Second commit'));
      assert.ok(result.includes('First commit'));
    });

    it('should limit number of commits', async () => {
      // Add several commits
      for (let i = 0; i < 5; i++) {
        fixture.createFile(`file${i}.txt`, `content${i}`, true, `Commit ${i}`);
      }

      const currentBranch = fixture.getCurrentBranch();
      const result = await log(currentBranch, { count: 2, cwd: fixture.path });

      const lines = result.split('\n').filter(Boolean);
      assert.strictEqual(lines.length, 2);
    });

    it('should use custom format', async () => {
      fixture.createFile('test.txt', 'test', true, 'Test commit message');

      const currentBranch = fixture.getCurrentBranch();
      const result = await log(currentBranch, {
        format: '%s',
        count: 1,
        cwd: fixture.path,
      });

      assert.strictEqual(result, 'Test commit message');
    });

    it('should return log for specific branch', async () => {
      // Create a branch with commits
      fixture.createBranch('feature', true);
      fixture.createFile('feature.txt', 'feature content', true, 'Feature commit');

      const result = await log('feature', { count: 1, cwd: fixture.path });
      assert.ok(result.includes('Feature commit'));
    });
  });

  describe('getCommitsByDay', () => {
    it('should return array of commit counts', async () => {
      const currentBranch = fixture.getCurrentBranch();
      const result = await getCommitsByDay(currentBranch, 7, fixture.path);

      assert.ok(Array.isArray(result));
      assert.strictEqual(result.length, 7);
      assert.ok(result.every((c) => typeof c === 'number'));
    });

    it('should count commits made today', async () => {
      // Make some commits today
      fixture.commit('Commit 1', true);
      fixture.commit('Commit 2', true);

      const currentBranch = fixture.getCurrentBranch();
      const result = await getCommitsByDay(currentBranch, 7, fixture.path);

      // The last element should be today's count (initial + 2 new commits)
      const todayCount = result[result.length - 1];
      assert.ok(todayCount >= 2, `Expected at least 2 commits today, got ${todayCount}`);
    });

    it('should return zeros for empty days', async () => {
      const currentBranch = fixture.getCurrentBranch();
      const result = await getCommitsByDay(currentBranch, 30, fixture.path);

      // Most days should be 0 (only today has commits)
      const zeroCount = result.filter((c) => c === 0).length;
      assert.ok(zeroCount >= 25, 'Most days should have zero commits');
    });

    it('should handle commits from past days', async () => {
      // Create commits with backdated dates
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      fixture.commitWithDate('Yesterday commit', yesterday);

      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      fixture.commitWithDate('Two days ago commit', twoDaysAgo);

      const currentBranch = fixture.getCurrentBranch();
      const result = await getCommitsByDay(currentBranch, 7, fixture.path);

      // Should have commits on multiple days
      const nonZeroDays = result.filter((c) => c > 0).length;
      assert.ok(nonZeroDays >= 2, `Expected commits on at least 2 days, got ${nonZeroDays}`);
    });

    it('should return zeros on error', async () => {
      const result = await getCommitsByDay('nonexistent-branch', 7, fixture.path);
      assert.ok(result.every((c) => c === 0));
    });
  });

  describe('getChangedFiles', () => {
    it('should return array of changed files', async () => {
      // Create a branch with different files
      fixture.createBranch('feature', true);
      fixture.createFile('new-file.txt', 'new content', true, 'Add new file');
      fixture.createFile('another.txt', 'more content', true, 'Add another');

      fixture.checkout('master');

      const result = await getChangedFiles('feature', 'master', fixture.path);

      assert.ok(Array.isArray(result));
      assert.ok(result.includes('new-file.txt'));
      assert.ok(result.includes('another.txt'));
    });

    it('should return empty array when no differences', async () => {
      const currentBranch = fixture.getCurrentBranch();
      const result = await getChangedFiles(currentBranch, currentBranch, fixture.path);

      assert.deepStrictEqual(result, []);
    });

    it('should return empty array for invalid branch', async () => {
      const result = await getChangedFiles('nonexistent', 'HEAD', fixture.path);
      assert.deepStrictEqual(result, []);
    });

    it('should detect file modifications', async () => {
      // Create initial file
      fixture.createFile('shared.txt', 'original', true, 'Original version');

      // Create branch and modify file
      fixture.createBranch('modified', true);
      fixture.createFile('shared.txt', 'modified', true, 'Modified version');

      fixture.checkout('master');

      const result = await getChangedFiles('modified', 'master', fixture.path);
      assert.ok(result.includes('shared.txt'));
    });
  });

  describe('hasUncommittedChanges', () => {
    it('should return false for clean working directory', async () => {
      const result = await hasUncommittedChanges(fixture.path);
      assert.strictEqual(result, false);
    });

    it('should return true for untracked files', async () => {
      fixture.createFile('untracked.txt', 'content', false);
      const result = await hasUncommittedChanges(fixture.path);
      assert.strictEqual(result, true);
    });

    it('should return true for staged changes', async () => {
      fixture.createFile('staged.txt', 'content', false);
      fixture.git('add staged.txt');
      const result = await hasUncommittedChanges(fixture.path);
      assert.strictEqual(result, true);
    });

    it('should return true for modified tracked files', async () => {
      fixture.createFile('tracked.txt', 'original', true, 'Add tracked file');
      fixture.createFile('tracked.txt', 'modified', false);
      const result = await hasUncommittedChanges(fixture.path);
      assert.strictEqual(result, true);
    });
  });

  describe('execGit timeout handling', () => {
    it('should accept timeout parameter without error', async () => {
      const result = await execGit('git status', {
        cwd: fixture.path,
        timeout: 5000,
      });
      assert.ok(result.stdout !== undefined);
    });
  });

  describe('deleteLocalBranch', () => {
    it('should delete a fully merged branch', async () => {
      fixture.createBranch('to-delete');

      const result = await deleteLocalBranch('to-delete', { cwd: fixture.path });
      assert.strictEqual(result.success, true);

      // Verify branch is gone
      const { stdout } = await execGit('git branch --list', { cwd: fixture.path });
      assert.ok(!stdout.includes('to-delete'));
    });

    it('should fail to delete unmerged branch without force', async () => {
      fixture.createBranch('unmerged', true);
      fixture.createFile('feature.txt', 'content');
      fixture.git('add .');
      fixture.commit('Feature work');
      fixture.checkout('master');

      const result = await deleteLocalBranch('unmerged', { cwd: fixture.path });
      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    it('should force delete unmerged branch with force=true', async () => {
      fixture.createBranch('unmerged', true);
      fixture.createFile('feature.txt', 'content');
      fixture.git('add .');
      fixture.commit('Feature work');
      fixture.checkout('master');

      const result = await deleteLocalBranch('unmerged', { force: true, cwd: fixture.path });
      assert.strictEqual(result.success, true);
    });

    it('should fail to delete non-existent branch', async () => {
      const result = await deleteLocalBranch('does-not-exist', { cwd: fixture.path });
      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });
  });
});
