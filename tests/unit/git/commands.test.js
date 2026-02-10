/**
 * Tests for git commands module
 *
 * These are integration tests that run against the actual git repository.
 * They test the behavior of the git command wrapper functions.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const {
  execGit,
  execGitSilent,
  isGitAvailable,
  isGitRepository,
  getRemotes,
  remoteExists,
  hasUncommittedChanges,
  stash,
  stashPop,
  parseDiffStats,
  DEFAULT_TIMEOUT,
  FETCH_TIMEOUT,
} = require('../../../src/git/commands');
const { GitError } = require('../../../src/utils/errors');

// Get the repo root (parent of tests directory)
const REPO_ROOT = path.resolve(__dirname, '../../..');

describe('execGit', () => {
  it('should execute git command and return output', async () => {
    const result = await execGit('git --version');
    assert.ok(result.stdout.includes('git version'));
    assert.strictEqual(typeof result.stderr, 'string');
  });

  it('should trim output whitespace', async () => {
    const result = await execGit('git rev-parse --short HEAD', { cwd: REPO_ROOT });
    // Should not have leading/trailing whitespace
    assert.strictEqual(result.stdout, result.stdout.trim());
  });

  it('should throw GitError on invalid command', async () => {
    await assert.rejects(
      execGit('git invalid-command-that-does-not-exist'),
      (err) => {
        assert.ok(err instanceof GitError);
        return true;
      }
    );
  });

  it('should use custom working directory', async () => {
    const result = await execGit('git rev-parse --show-toplevel', { cwd: REPO_ROOT });
    assert.ok(result.stdout.includes('git-watchtower'));
  });

  it('should timeout on long operations', async () => {
    // This tests that timeout parameter is accepted (but we can't easily test actual timeout)
    const result = await execGit('git --version', { timeout: 5000 });
    assert.ok(result.stdout.includes('git'));
  });
});

describe('execGitSilent', () => {
  it('should return result on success', async () => {
    const result = await execGitSilent('git --version');
    assert.ok(result.stdout.includes('git version'));
  });

  it('should return null on error instead of throwing', async () => {
    const result = await execGitSilent('git invalid-command-xyz');
    assert.strictEqual(result, null);
  });
});

describe('isGitAvailable', () => {
  it('should return true when git is available', async () => {
    const result = await isGitAvailable();
    assert.strictEqual(result, true);
  });
});

describe('isGitRepository', () => {
  it('should return true in a git repository', async () => {
    const result = await isGitRepository(REPO_ROOT);
    assert.strictEqual(result, true);
  });

  it('should return false outside a git repository', async () => {
    // /tmp is unlikely to be a git repo
    const result = await isGitRepository('/tmp');
    assert.strictEqual(result, false);
  });
});

describe('getRemotes', () => {
  it('should return array of remotes', async () => {
    const result = await getRemotes(REPO_ROOT);
    assert.ok(Array.isArray(result));
    // Most repos have at least 'origin'
    if (result.length > 0) {
      assert.ok(result.every((r) => typeof r === 'string'));
    }
  });

  it('should return empty array for non-repo directory', async () => {
    const result = await getRemotes('/tmp');
    assert.deepStrictEqual(result, []);
  });
});

describe('remoteExists', () => {
  it('should return boolean', async () => {
    const result = await remoteExists('origin', REPO_ROOT);
    assert.strictEqual(typeof result, 'boolean');
  });

  it('should return false for non-existent remote', async () => {
    const result = await remoteExists('nonexistent-remote-xyz', REPO_ROOT);
    assert.strictEqual(result, false);
  });
});

describe('hasUncommittedChanges', () => {
  it('should return boolean', async () => {
    const result = await hasUncommittedChanges(REPO_ROOT);
    assert.strictEqual(typeof result, 'boolean');
  });
});

describe('timeout constants', () => {
  it('should have reasonable default timeout', () => {
    assert.strictEqual(DEFAULT_TIMEOUT, 30000);
  });

  it('should have longer fetch timeout', () => {
    assert.strictEqual(FETCH_TIMEOUT, 60000);
    assert.ok(FETCH_TIMEOUT > DEFAULT_TIMEOUT);
  });
});

describe('GitError handling', () => {
  it('should include command in error details', async () => {
    try {
      await execGit('git show nonexistent-ref-xyz');
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err instanceof GitError);
      assert.ok(err.command || err.details?.command);
    }
  });
});

describe('parseDiffStats', () => {
  it('should parse both insertions and deletions', () => {
    const result = parseDiffStats('3 files changed, 10 insertions(+), 5 deletions(-)');
    assert.deepStrictEqual(result, { added: 10, deleted: 5 });
  });

  it('should parse only insertions', () => {
    const result = parseDiffStats('1 file changed, 3 insertions(+)');
    assert.deepStrictEqual(result, { added: 3, deleted: 0 });
  });

  it('should parse only deletions', () => {
    const result = parseDiffStats('2 files changed, 7 deletions(-)');
    assert.deepStrictEqual(result, { added: 0, deleted: 7 });
  });

  it('should parse singular insertion and deletion', () => {
    const result = parseDiffStats('1 file changed, 1 insertion(+), 1 deletion(-)');
    assert.deepStrictEqual(result, { added: 1, deleted: 1 });
  });

  it('should return zeros for empty string', () => {
    const result = parseDiffStats('');
    assert.deepStrictEqual(result, { added: 0, deleted: 0 });
  });

  it('should handle large numbers', () => {
    const result = parseDiffStats('50 files changed, 1234 insertions(+), 567 deletions(-)');
    assert.deepStrictEqual(result, { added: 1234, deleted: 567 });
  });
});

describe('stash', () => {
  it('should be a function', () => {
    assert.strictEqual(typeof stash, 'function');
  });

  it('should return an object with success property', async () => {
    // On a clean repo, stash returns success: false with GIT_STASH_EMPTY
    const result = await stash({ cwd: REPO_ROOT });
    assert.strictEqual(typeof result.success, 'boolean');
    if (!result.success && result.error) {
      assert.ok(result.error.message.includes('No local changes') || result.error.code === 'GIT_STASH_EMPTY');
    }
  });

  it('should accept a message option', async () => {
    const result = await stash({ message: 'test stash', cwd: REPO_ROOT });
    assert.strictEqual(typeof result.success, 'boolean');
  });

  it('should accept includeUntracked option', async () => {
    const result = await stash({ includeUntracked: false, cwd: REPO_ROOT });
    assert.strictEqual(typeof result.success, 'boolean');
  });
});

describe('stashPop', () => {
  it('should be a function', () => {
    assert.strictEqual(typeof stashPop, 'function');
  });

  it('should return an object with success property', async () => {
    // On a repo with no stash entries, this should fail gracefully
    const result = await stashPop({ cwd: REPO_ROOT });
    assert.strictEqual(typeof result.success, 'boolean');
  });
});
