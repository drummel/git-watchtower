/**
 * Integration tests for git branch module
 *
 * These tests use temporary git repositories to test actual branch operations.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { createGitFixture } = require('./git-fixture');
const {
  getCurrentBranch,
  getAllBranches,
  checkout,
  getPreviewData,
  generateSparkline,
  getLocalBranches,
  localBranchExists,
} = require('../../../src/git/branch');
const { GitError } = require('../../../src/utils/errors');

describe('branch.js integration tests', () => {
  let fixture;

  beforeEach(() => {
    fixture = createGitFixture();
  });

  afterEach(() => {
    if (fixture) {
      fixture.cleanup();
    }
  });

  describe('getCurrentBranch', () => {
    it('should return current branch name', async () => {
      const result = await getCurrentBranch(fixture.path);
      assert.strictEqual(result.name, 'master');
      assert.strictEqual(result.isDetached, false);
    });

    it('should detect different branches', async () => {
      fixture.createBranch('feature', true);
      const result = await getCurrentBranch(fixture.path);
      assert.strictEqual(result.name, 'feature');
      assert.strictEqual(result.isDetached, false);
    });

    it('should detect detached HEAD state', async () => {
      const commitHash = fixture.getHeadHash();
      fixture.git(`checkout ${commitHash}`);

      const result = await getCurrentBranch(fixture.path);
      assert.strictEqual(result.isDetached, true);
      assert.ok(result.name.startsWith('HEAD@'));
    });

    it('should return null name for invalid directory', async () => {
      const result = await getCurrentBranch('/nonexistent/path');
      assert.strictEqual(result.name, null);
      assert.strictEqual(result.isDetached, false);
    });
  });

  describe('getAllBranches', () => {
    it('should return list of local branches', async () => {
      fixture.createBranch('develop');
      fixture.createBranch('feature/test');

      const branches = await getAllBranches({
        fetch: false,
        cwd: fixture.path,
      });

      assert.ok(Array.isArray(branches));
      const branchNames = branches.map((b) => b.name);
      assert.ok(branchNames.includes('master'));
      assert.ok(branchNames.includes('develop'));
      assert.ok(branchNames.includes('feature/test'));
    });

    it('should return branch objects with expected properties', async () => {
      const branches = await getAllBranches({
        fetch: false,
        cwd: fixture.path,
      });

      assert.ok(branches.length > 0);
      const branch = branches[0];
      assert.ok('name' in branch);
      assert.ok('commit' in branch);
      assert.ok('subject' in branch);
      assert.ok('date' in branch);
      assert.ok('isLocal' in branch);
      assert.ok('hasRemote' in branch);
      assert.ok('hasUpdates' in branch);
    });

    it('should include remote branches when available', async () => {
      fixture.createRemote('origin');

      // Create a remote-only branch by pushing from a different local branch
      fixture.createBranch('remote-feature', true);
      fixture.createFile('remote.txt', 'content', true, 'Remote commit');
      fixture.push('remote-feature');
      fixture.checkout('master');
      fixture.git('branch -D remote-feature');

      const branches = await getAllBranches({
        fetch: false,
        remoteName: 'origin',
        cwd: fixture.path,
      });

      const remoteFeature = branches.find((b) => b.name === 'remote-feature');
      assert.ok(remoteFeature, 'Should find remote-feature branch');
      assert.strictEqual(remoteFeature.isLocal, false);
      assert.strictEqual(remoteFeature.hasRemote, true);
    });

    it('should detect hasRemote for local branches with tracking', async () => {
      fixture.createRemote('origin');

      const branches = await getAllBranches({
        fetch: false,
        remoteName: 'origin',
        cwd: fixture.path,
      });

      const master = branches.find((b) => b.name === 'master');
      assert.ok(master);
      assert.strictEqual(master.isLocal, true);
      assert.strictEqual(master.hasRemote, true);
    });

    it('should sort branches by date (most recent first)', async () => {
      // Create branches with commits at different times
      fixture.createBranch('old-branch', true);
      fixture.commit('Old commit', true);

      // Wait a moment and create another branch
      fixture.checkout('master');
      fixture.createBranch('new-branch', true);
      fixture.commit('New commit', true);

      const branches = await getAllBranches({
        fetch: false,
        cwd: fixture.path,
      });

      const oldIdx = branches.findIndex((b) => b.name === 'old-branch');
      const newIdx = branches.findIndex((b) => b.name === 'new-branch');

      assert.ok(newIdx < oldIdx, 'Newer branch should come first');
    });

    it('should handle fetch option', async () => {
      fixture.createRemote('origin');

      // Should not throw when fetch is true
      const branches = await getAllBranches({
        fetch: true,
        remoteName: 'origin',
        cwd: fixture.path,
      });

      assert.ok(Array.isArray(branches));
    });

    it('should return empty array for non-repository directory', async () => {
      // getAllBranches uses execGitSilent which returns null on error,
      // so it returns an empty array rather than throwing
      const branches = await getAllBranches({ fetch: false, cwd: '/tmp' });
      assert.deepStrictEqual(branches, []);
    });
  });

  describe('checkout', () => {
    it('should checkout existing local branch', async () => {
      fixture.createBranch('feature');

      const result = await checkout('feature', { cwd: fixture.path });

      assert.strictEqual(result.success, true);
      assert.strictEqual(fixture.getCurrentBranch(), 'feature');
    });

    it('should fail on dirty working directory', async () => {
      fixture.createBranch('feature');
      fixture.createFile('uncommitted.txt', 'content', false);

      const result = await checkout('feature', { cwd: fixture.path });

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
      assert.strictEqual(result.error.code, 'GIT_DIRTY_WORKDIR');
    });

    it('should force checkout with dirty working directory', async () => {
      fixture.createBranch('feature');
      fixture.createFile('uncommitted.txt', 'content', false);
      fixture.git('add uncommitted.txt');

      const result = await checkout('feature', {
        force: true,
        cwd: fixture.path,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(fixture.getCurrentBranch(), 'feature');
    });

    it('should create local branch from remote', async () => {
      fixture.createRemote('origin');

      // Create a remote-only branch
      fixture.createBranch('remote-only', true);
      fixture.createFile('remote.txt', 'content', true, 'Remote commit');
      fixture.push('remote-only');
      fixture.checkout('master');
      fixture.git('branch -D remote-only');

      const result = await checkout('remote-only', {
        remoteName: 'origin',
        cwd: fixture.path,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(fixture.getCurrentBranch(), 'remote-only');
    });

    it('should fail for invalid branch name', async () => {
      const result = await checkout('bad..name', { cwd: fixture.path });

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    it('should fail for non-existent branch', async () => {
      const result = await checkout('nonexistent-branch', { cwd: fixture.path });

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });
  });

  describe('getPreviewData', () => {
    it('should return commits and files for a branch', async () => {
      fixture.createBranch('feature', true);
      fixture.createFile('feature1.txt', 'content1', true, 'First feature commit');
      fixture.createFile('feature2.txt', 'content2', true, 'Second feature commit');

      fixture.checkout('master');

      const result = await getPreviewData('feature', { cwd: fixture.path });

      assert.ok(Array.isArray(result.commits));
      assert.ok(Array.isArray(result.files));
      assert.ok(result.commits.length >= 2);
      assert.ok(result.files.includes('feature1.txt'));
      assert.ok(result.files.includes('feature2.txt'));
    });

    it('should return commit objects with hash, subject, time', async () => {
      fixture.createFile('test.txt', 'content', true, 'Test commit');

      const result = await getPreviewData('master', { cwd: fixture.path });

      assert.ok(result.commits.length > 0);
      const commit = result.commits[0];
      assert.ok('hash' in commit);
      assert.ok('subject' in commit);
      assert.ok('time' in commit);
    });

    it('should limit commit count', async () => {
      // Create multiple commits
      for (let i = 0; i < 10; i++) {
        fixture.commit(`Commit ${i}`, true);
      }

      const result = await getPreviewData('master', {
        commitCount: 3,
        cwd: fixture.path,
      });

      assert.strictEqual(result.commits.length, 3);
    });

    it('should limit file count', async () => {
      // Create many files
      fixture.createBranch('many-files', true);
      for (let i = 0; i < 20; i++) {
        fixture.createFile(`file${i}.txt`, `content${i}`, true, `Add file ${i}`);
      }

      fixture.checkout('master');

      const result = await getPreviewData('many-files', {
        fileCount: 5,
        cwd: fixture.path,
      });

      assert.ok(result.files.length <= 5);
    });

    it('should return empty arrays for invalid branch', async () => {
      const result = await getPreviewData('nonexistent', { cwd: fixture.path });

      assert.deepStrictEqual(result.commits, []);
      assert.deepStrictEqual(result.files, []);
    });
  });

  describe('generateSparkline', () => {
    it('should return string of correct length', async () => {
      const result = await generateSparkline('master', {
        days: 7,
        cwd: fixture.path,
      });

      assert.strictEqual(typeof result, 'string');
      assert.strictEqual(result.length, 7);
    });

    it('should return spaces for days with no commits', async () => {
      // Create a branch with no recent commits
      const result = await generateSparkline('master', {
        days: 30,
        cwd: fixture.path,
      });

      // Most characters should be spaces (days with no commits)
      const spaceCount = (result.match(/ /g) || []).length;
      assert.ok(spaceCount >= 20, 'Most days should be empty');
    });

    it('should show activity for recent commits', async () => {
      // Add commits today
      fixture.commit('Commit 1', true);
      fixture.commit('Commit 2', true);
      fixture.commit('Commit 3', true);

      const result = await generateSparkline('master', {
        days: 7,
        cwd: fixture.path,
      });

      // The last character (today) should not be a space
      const lastChar = result[result.length - 1];
      assert.notStrictEqual(lastChar, ' ', 'Today should show activity');
    });

    it('should use sparkline characters', async () => {
      fixture.commit('Commit', true);

      const result = await generateSparkline('master', {
        days: 7,
        cwd: fixture.path,
      });

      const sparkChars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█', ' '];
      for (const char of result) {
        assert.ok(
          sparkChars.includes(char),
          `Character "${char}" should be a valid sparkline char`
        );
      }
    });

    it('should handle invalid branch gracefully', async () => {
      const result = await generateSparkline('nonexistent', {
        days: 7,
        cwd: fixture.path,
      });

      // Should return spaces (empty sparkline)
      assert.strictEqual(result.length, 7);
    });
  });

  describe('getLocalBranches', () => {
    it('should return array of local branch names', async () => {
      fixture.createBranch('branch-a');
      fixture.createBranch('branch-b');
      fixture.createBranch('feature/branch-c');

      const branches = await getLocalBranches(fixture.path);

      assert.ok(Array.isArray(branches));
      assert.ok(branches.includes('master'));
      assert.ok(branches.includes('branch-a'));
      assert.ok(branches.includes('branch-b'));
      assert.ok(branches.includes('feature/branch-c'));
    });

    it('should not include current branch marker', async () => {
      const branches = await getLocalBranches(fixture.path);

      // Should not have asterisk
      assert.ok(branches.every((b) => !b.includes('*')));
    });

    it('should return empty array for non-repo', async () => {
      const branches = await getLocalBranches('/tmp');
      assert.deepStrictEqual(branches, []);
    });
  });

  describe('localBranchExists', () => {
    it('should return true for existing branch', async () => {
      fixture.createBranch('existing');

      const result = await localBranchExists('existing', fixture.path);
      assert.strictEqual(result, true);
    });

    it('should return true for current branch', async () => {
      const result = await localBranchExists('master', fixture.path);
      assert.strictEqual(result, true);
    });

    it('should return false for non-existent branch', async () => {
      const result = await localBranchExists('nonexistent', fixture.path);
      assert.strictEqual(result, false);
    });

    it('should return false for remote-only branch', async () => {
      fixture.createRemote('origin');

      // Create and push a branch, then delete locally
      fixture.createBranch('remote-only', true);
      fixture.commit('Remote commit', true);
      fixture.push('remote-only');
      fixture.checkout('master');
      fixture.git('branch -D remote-only');

      const result = await localBranchExists('remote-only', fixture.path);
      assert.strictEqual(result, false);
    });
  });
});
