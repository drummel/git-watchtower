const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

let tmpDir;
let originalHomedir;

function freshAnalytics() {
  // Clear caches
  const analyticsPath = require.resolve('../../../src/telemetry/analytics');
  const configPath = require.resolve('../../../src/telemetry/config');
  const indexPath = require.resolve('../../../src/telemetry/index');
  delete require.cache[analyticsPath];
  delete require.cache[configPath];
  delete require.cache[indexPath];
  return require('../../../src/telemetry/analytics');
}

describe('telemetry/analytics', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-analytics-test-'));
    originalHomedir = os.homedir;
    os.homedir = () => tmpDir;
  });

  afterEach(() => {
    os.homedir = originalHomedir;
    delete process.env.GIT_WATCHTOWER_TELEMETRY;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  });

  describe('init', () => {
    it('does not crash when telemetry is disabled (no config)', () => {
      const analytics = freshAnalytics();
      // No config file = disabled
      analytics.init({ version: '1.0.0' });
      assert.equal(analytics.isEnabled(), false);
    });

    it('does not crash when env var disables telemetry', () => {
      process.env.GIT_WATCHTOWER_TELEMETRY = 'false';
      const analytics = freshAnalytics();
      analytics.init({ version: '1.0.0' });
      assert.equal(analytics.isEnabled(), false);
    });
  });

  describe('capture', () => {
    it('is a no-op when disabled', () => {
      const analytics = freshAnalytics();
      analytics.init({ version: '1.0.0' });
      // Should not throw
      analytics.capture('test_event', { key: 'value' });
    });
  });

  describe('captureError', () => {
    it('is a no-op when disabled', () => {
      const analytics = freshAnalytics();
      analytics.init({ version: '1.0.0' });
      // Should not throw
      analytics.captureError(new Error('test error'));
    });

    it('handles errors with code property', () => {
      const analytics = freshAnalytics();
      analytics.init({ version: '1.0.0' });
      const err = new Error('test');
      err.code = 'ENOENT';
      // Should not throw
      analytics.captureError(err);
    });
  });

  describe('shutdown', () => {
    it('resolves when disabled', async () => {
      const analytics = freshAnalytics();
      analytics.init({ version: '1.0.0' });
      await analytics.shutdown(); // Should resolve without errors
    });
  });

  describe('isEnabled', () => {
    it('returns false before init', () => {
      const analytics = freshAnalytics();
      assert.equal(analytics.isEnabled(), false);
    });
  });
});

describe('telemetry/index', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-telemetry-idx-test-'));
    originalHomedir = os.homedir;
    os.homedir = () => tmpDir;
  });

  afterEach(() => {
    os.homedir = originalHomedir;
    delete process.env.GIT_WATCHTOWER_TELEMETRY;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  });

  describe('promptIfNeeded', () => {
    it('skips prompt when already prompted', async () => {
      // Create config file to simulate already prompted
      const dir = path.join(tmpDir, '.git-watchtower');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
        telemetryEnabled: false,
        distinctId: 'test',
        promptedAt: '2024-01-01T00:00:00Z',
      }));

      const indexPath = require.resolve('../../../src/telemetry/index');
      const configPath = require.resolve('../../../src/telemetry/config');
      delete require.cache[indexPath];
      delete require.cache[configPath];
      const telemetry = require('../../../src/telemetry');

      let promptCalled = false;
      await telemetry.promptIfNeeded(async () => { promptCalled = true; return false; });
      assert.equal(promptCalled, false);
    });

    it('skips prompt when env var forces off', async () => {
      process.env.GIT_WATCHTOWER_TELEMETRY = 'false';

      const indexPath = require.resolve('../../../src/telemetry/index');
      const configPath = require.resolve('../../../src/telemetry/config');
      delete require.cache[indexPath];
      delete require.cache[configPath];
      const telemetry = require('../../../src/telemetry');

      let promptCalled = false;
      await telemetry.promptIfNeeded(async () => { promptCalled = true; return false; });
      assert.equal(promptCalled, false);
    });

    it('saves config when user opts in', async () => {
      const indexPath = require.resolve('../../../src/telemetry/index');
      const configPath = require.resolve('../../../src/telemetry/config');
      delete require.cache[indexPath];
      delete require.cache[configPath];
      const telemetry = require('../../../src/telemetry');

      // Mock stdin.isTTY
      const origIsTTY = process.stdin.isTTY;
      process.stdin.isTTY = true;

      await telemetry.promptIfNeeded(async () => true);

      process.stdin.isTTY = origIsTTY;

      const configFile = path.join(tmpDir, '.git-watchtower', 'config.json');
      assert.ok(fs.existsSync(configFile));
      const saved = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      assert.equal(saved.telemetryEnabled, true);
      assert.ok(saved.distinctId);
      assert.ok(saved.promptedAt);
    });

    it('saves config when user opts out', async () => {
      const indexPath = require.resolve('../../../src/telemetry/index');
      const configPath = require.resolve('../../../src/telemetry/config');
      delete require.cache[indexPath];
      delete require.cache[configPath];
      const telemetry = require('../../../src/telemetry');

      const origIsTTY = process.stdin.isTTY;
      process.stdin.isTTY = true;

      await telemetry.promptIfNeeded(async () => false);

      process.stdin.isTTY = origIsTTY;

      const configFile = path.join(tmpDir, '.git-watchtower', 'config.json');
      const saved = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      assert.equal(saved.telemetryEnabled, false);
    });

    it('skips prompt when no TTY', async () => {
      const indexPath = require.resolve('../../../src/telemetry/index');
      const configPath = require.resolve('../../../src/telemetry/config');
      delete require.cache[indexPath];
      delete require.cache[configPath];
      const telemetry = require('../../../src/telemetry');

      const origIsTTY = process.stdin.isTTY;
      process.stdin.isTTY = false;

      let promptCalled = false;
      await telemetry.promptIfNeeded(async () => { promptCalled = true; return false; });

      process.stdin.isTTY = origIsTTY;
      assert.equal(promptCalled, false);
    });
  });
});
