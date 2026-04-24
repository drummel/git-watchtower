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
  execGitOptional,
  isGitAvailable,
  isGitRepository,
  getRemotes,
  remoteExists,
  hasUncommittedChanges,
  stash,
  stashPop,
  parseDiffStats,
  buildGitEnv,
  GIT_ENV_OVERRIDES,
  DEFAULT_TIMEOUT,
  FETCH_TIMEOUT,
} = require('../../../src/git/commands');
const { GitError } = require('../../../src/utils/errors');

// Get the repo root (parent of tests directory)
const REPO_ROOT = path.resolve(__dirname, '../../..');

describe('execGit', () => {
  it('should execute git command and return output', async () => {
    const result = await execGit(['--version']);
    assert.ok(result.stdout.includes('git version'));
    assert.strictEqual(typeof result.stderr, 'string');
  });

  it('should trim output whitespace', async () => {
    const result = await execGit(['rev-parse', '--short', 'HEAD'], { cwd: REPO_ROOT });
    // Should not have leading/trailing whitespace
    assert.strictEqual(result.stdout, result.stdout.trim());
  });

  it('should throw GitError on invalid command', async () => {
    await assert.rejects(
      execGit(['invalid-command-that-does-not-exist']),
      (err) => {
        assert.ok(err instanceof GitError);
        return true;
      }
    );
  });

  it('should use custom working directory', async () => {
    const result = await execGit(['rev-parse', '--show-toplevel'], { cwd: REPO_ROOT });
    assert.ok(result.stdout.includes('git-watchtower'));
  });

  it('should timeout on long operations', async () => {
    // This tests that timeout parameter is accepted (but we can't easily test actual timeout)
    const result = await execGit(['--version'], { timeout: 5000 });
    assert.ok(result.stdout.includes('git'));
  });

  it('should throw TypeError when args is not an array', async () => {
    await assert.rejects(
      execGit('git --version'),
      (err) => err instanceof TypeError
    );
  });
});

describe('execGitOptional', () => {
  it('should return result on success', async () => {
    const result = await execGitOptional(['--version']);
    assert.ok(result.stdout.includes('git version'));
  });

  it('should return null on error instead of throwing', async () => {
    const result = await execGitOptional(['invalid-command-xyz']);
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

describe('buildGitEnv', () => {
  it('sets LC_ALL=C, LANG=C, and GIT_TERMINAL_PROMPT=0', () => {
    const env = buildGitEnv({ PATH: '/usr/bin' });
    assert.strictEqual(env.LC_ALL, 'C');
    assert.strictEqual(env.LANG, 'C');
    assert.strictEqual(env.GIT_TERMINAL_PROMPT, '0');
  });

  it('passes through the rest of the base env (e.g. PATH)', () => {
    // PATH must survive or `git` won't resolve on Windows / minimal shells.
    const env = buildGitEnv({ PATH: '/tmp/x:/tmp/y', HOME: '/home/test', OTHER: '42' });
    assert.strictEqual(env.PATH, '/tmp/x:/tmp/y');
    assert.strictEqual(env.HOME, '/home/test');
    assert.strictEqual(env.OTHER, '42');
  });

  it('overrides the base env locale settings rather than letting the user preempt them', () => {
    // The whole point of this helper: even if the parent shell has a French
    // locale, the git child runs in C so parseDiffStats sees English.
    const env = buildGitEnv({ LC_ALL: 'fr_FR.UTF-8', LANG: 'fr_FR.UTF-8' });
    assert.strictEqual(env.LC_ALL, 'C');
    assert.strictEqual(env.LANG, 'C');
  });

  it('falls back to process.env when called with no argument', () => {
    const env = buildGitEnv();
    // process.env.PATH is almost always defined; we rely on that here.
    assert.ok('PATH' in env || 'Path' in env, 'expected PATH to be inherited');
    assert.strictEqual(env.LC_ALL, 'C');
  });

  it('GIT_ENV_OVERRIDES is the authoritative constant', () => {
    assert.deepStrictEqual(GIT_ENV_OVERRIDES, {
      LANG: 'C',
      LC_ALL: 'C',
      GIT_TERMINAL_PROMPT: '0',
    });
  });
});

describe('execGit locale isolation', () => {
  it('produces English diff --stat output regardless of the parent LANG', async () => {
    // End-to-end check that buildGitEnv() actually flows through execGit:
    // run `git diff --stat` between two seeded commits in a throwaway repo
    // and assert the summary line contains English words parseDiffStats
    // expects. This would fail on a FR-locale runner without the
    // LC_ALL=C override.
    //
    // We build our own repo inline — using HEAD~1..HEAD against the
    // checkout doesn't work in CI where actions/checkout@v4 defaults to
    // fetch-depth: 1 and the parent commit isn't present.
    const fs = require('fs');
    const os = require('os');
    const { execSync } = require('child_process');

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'watchtower-locale-'));
    const gitEnv = {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
      GIT_CONFIG_NOSYSTEM: '1',
    };
    const run = (cmd) => execSync(cmd, { cwd: tmp, env: gitEnv, stdio: 'pipe' });

    run('git init -q');
    run('git config commit.gpgsign false');
    fs.writeFileSync(path.join(tmp, 'a.txt'), 'line1\nline2\nline3\n');
    run('git add a.txt');
    run('git commit -q -m first');
    fs.writeFileSync(path.join(tmp, 'a.txt'), 'line1\nline2-changed\nline3\nline4\n');
    run('git commit -q -am second');

    const originalLang = process.env.LANG;
    const originalLcAll = process.env.LC_ALL;
    try {
      process.env.LANG = 'fr_FR.UTF-8';
      process.env.LC_ALL = 'fr_FR.UTF-8';
      const { stdout } = await execGit(['diff', '--stat', 'HEAD~1..HEAD'], { cwd: tmp });
      assert.ok(
        /insertions?\(\+\)|deletions?\(-\)|files? changed/.test(stdout),
        `expected English diff --stat summary; got: ${stdout}`,
      );
    } finally {
      if (originalLang === undefined) delete process.env.LANG;
      else process.env.LANG = originalLang;
      if (originalLcAll === undefined) delete process.env.LC_ALL;
      else process.env.LC_ALL = originalLcAll;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
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
      await execGit(['show', 'nonexistent-ref-xyz']);
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
