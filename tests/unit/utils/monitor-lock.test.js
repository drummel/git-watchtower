/**
 * Tests for the per-repo monitor lock.
 *
 * These tests exercise the real `~/.watchtower` directory but use ephemeral
 * repo paths so the lock file keys (sha1 of the path) are unique per test
 * and cannot collide with a real running watchtower. Each test releases in a
 * finally block so a failure partway through doesn't leave stale locks behind.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const monitorLock = require('../../../src/utils/monitor-lock');

/** Build a unique fake repo path for a given test. */
function makeRepoPath(label) {
  const nonce = crypto.randomBytes(6).toString('hex');
  return path.join(os.tmpdir(), `gw-test-${label}-${nonce}`);
}

describe('monitor-lock', () => {
  describe('lockFilePath', () => {
    it('produces a deterministic path under ~/.watchtower', () => {
      const repo = '/some/repo/path';
      const a = monitorLock.lockFilePath(repo);
      const b = monitorLock.lockFilePath(repo);
      assert.strictEqual(a, b);
      assert.ok(a.startsWith(monitorLock.WATCHTOWER_DIR));
      assert.ok(/monitor-[0-9a-f]{16}\.lock$/.test(a));
    });

    it('produces different paths for different repos', () => {
      const a = monitorLock.lockFilePath('/repo/a');
      const b = monitorLock.lockFilePath('/repo/b');
      assert.notStrictEqual(a, b);
    });
  });

  describe('acquire / release', () => {
    it('acquires when no lock exists, writes our PID, and releases cleanly', () => {
      const repo = makeRepoPath('acquire-clean');
      const result = monitorLock.acquire(repo);
      try {
        assert.strictEqual(result.acquired, true);
        assert.strictEqual(result.file, monitorLock.lockFilePath(repo));
        assert.ok(fs.existsSync(result.file));

        const contents = JSON.parse(fs.readFileSync(result.file, 'utf8'));
        assert.strictEqual(contents.pid, process.pid);
        assert.strictEqual(contents.cwd, repo);
        assert.strictEqual(typeof contents.startedAt, 'number');
      } finally {
        monitorLock.release(result.file);
      }
      assert.strictEqual(fs.existsSync(result.file), false);
    });

    it('returns busy when an alive owner already holds the lock', () => {
      const repo = makeRepoPath('busy');
      const first = monitorLock.acquire(repo);
      try {
        assert.strictEqual(first.acquired, true);

        const second = monitorLock.acquire(repo);
        assert.strictEqual(second.acquired, false);
        assert.strictEqual(second.reason, 'busy');
        assert.strictEqual(second.existing.pid, process.pid);
        assert.strictEqual(second.file, first.file);
      } finally {
        monitorLock.release(first.file);
      }
    });

    it('treats a lock owned by a dead PID as stale and takes it over', () => {
      const repo = makeRepoPath('stale');
      const file = monitorLock.lockFilePath(repo);

      // Hand-write a lock claiming an impossible PID. process.kill(pid, 0)
      // will throw ESRCH, so isProcessAlive returns false and acquire should
      // treat the existing lock as stale, clean it up, and succeed.
      if (!fs.existsSync(monitorLock.WATCHTOWER_DIR)) {
        fs.mkdirSync(monitorLock.WATCHTOWER_DIR, { recursive: true });
      }
      fs.writeFileSync(file, JSON.stringify({ pid: 2147483646, startedAt: 0, cwd: repo }));

      const result = monitorLock.acquire(repo);
      try {
        assert.strictEqual(result.acquired, true);
        const contents = JSON.parse(fs.readFileSync(result.file, 'utf8'));
        assert.strictEqual(contents.pid, process.pid);
      } finally {
        monitorLock.release(result.file);
      }
    });

    it('release is a no-op when the lock is owned by a different PID', () => {
      const repo = makeRepoPath('release-guard');
      const file = monitorLock.lockFilePath(repo);

      if (!fs.existsSync(monitorLock.WATCHTOWER_DIR)) {
        fs.mkdirSync(monitorLock.WATCHTOWER_DIR, { recursive: true });
      }
      // Someone else owns the lock — our release must NOT delete their file.
      const otherPid = process.pid + 1;
      fs.writeFileSync(file, JSON.stringify({ pid: otherPid, startedAt: Date.now(), cwd: repo }));

      try {
        monitorLock.release(file);
        assert.strictEqual(fs.existsSync(file), true, 'should not delete lock owned by another PID');
      } finally {
        try { fs.unlinkSync(file); } catch (_) { /* ignore */ }
      }
    });

    it('recovers from a garbage (unparseable) lock file by treating it as stale', () => {
      const repo = makeRepoPath('garbage');
      const file = monitorLock.lockFilePath(repo);

      if (!fs.existsSync(monitorLock.WATCHTOWER_DIR)) {
        fs.mkdirSync(monitorLock.WATCHTOWER_DIR, { recursive: true });
      }
      fs.writeFileSync(file, 'this is not json');

      const result = monitorLock.acquire(repo);
      try {
        assert.strictEqual(result.acquired, true);
      } finally {
        monitorLock.release(result.file);
      }
    });
  });

  describe('isProcessAlive', () => {
    it('returns true for the current process', () => {
      assert.strictEqual(monitorLock.isProcessAlive(process.pid), true);
    });

    it('returns false for a PID that cannot exist', () => {
      // PIDs above INT32_MAX are never assigned on any mainstream OS.
      assert.strictEqual(monitorLock.isProcessAlive(2147483646), false);
    });

    it('returns false for falsy / non-numeric input', () => {
      assert.strictEqual(monitorLock.isProcessAlive(0), false);
      assert.strictEqual(monitorLock.isProcessAlive(null), false);
      assert.strictEqual(monitorLock.isProcessAlive(undefined), false);
      assert.strictEqual(monitorLock.isProcessAlive('123'), false);
    });
  });
});
