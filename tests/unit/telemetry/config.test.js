const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// We need to test the config module with a custom home directory
// to avoid touching the real ~/.git-watchtower/
let tmpDir;
let originalHomedir;

function createConfigModule() {
  // Clear require cache to get a fresh module
  const modulePath = require.resolve('../../../src/telemetry/config');
  delete require.cache[modulePath];
  return require('../../../src/telemetry/config');
}

describe('telemetry/config', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-telemetry-test-'));
    // Override os.homedir to point to our temp dir
    originalHomedir = os.homedir;
    os.homedir = () => tmpDir;
  });

  afterEach(() => {
    os.homedir = originalHomedir;
    // Clean up env var
    delete process.env.GIT_WATCHTOWER_TELEMETRY;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  });

  describe('getConfigDir', () => {
    it('returns path under home directory', () => {
      const config = createConfigModule();
      const dir = config.getConfigDir();
      assert.equal(dir, path.join(tmpDir, '.git-watchtower'));
    });
  });

  describe('getConfigPath', () => {
    it('returns config.json path under config dir', () => {
      const config = createConfigModule();
      const p = config.getConfigPath();
      assert.equal(p, path.join(tmpDir, '.git-watchtower', 'config.json'));
    });
  });

  describe('loadTelemetryConfig', () => {
    it('returns null when config file does not exist', () => {
      const config = createConfigModule();
      assert.equal(config.loadTelemetryConfig(), null);
    });

    it('returns parsed config when file exists', () => {
      const config = createConfigModule();
      const dir = path.join(tmpDir, '.git-watchtower');
      fs.mkdirSync(dir, { recursive: true });
      const data = { telemetryEnabled: true, distinctId: 'test-uuid', promptedAt: '2024-01-01T00:00:00Z' };
      fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(data));

      const result = config.loadTelemetryConfig();
      assert.deepEqual(result, data);
    });

    it('returns null for corrupt JSON', () => {
      const config = createConfigModule();
      const dir = path.join(tmpDir, '.git-watchtower');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'config.json'), 'not json');

      assert.equal(config.loadTelemetryConfig(), null);
    });
  });

  describe('saveTelemetryConfig', () => {
    it('creates directory and writes config', () => {
      const config = createConfigModule();
      const data = { telemetryEnabled: false, distinctId: 'abc-123', promptedAt: '2024-01-01T00:00:00Z' };

      config.saveTelemetryConfig(data);

      const filePath = path.join(tmpDir, '.git-watchtower', 'config.json');
      assert.ok(fs.existsSync(filePath));
      const written = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      assert.deepEqual(written, data);
    });
  });

  describe('getOrCreateDistinctId', () => {
    it('generates a UUID when no config exists', () => {
      const config = createConfigModule();
      const id = config.getOrCreateDistinctId();
      assert.ok(id);
      assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('returns existing distinctId from config', () => {
      const config = createConfigModule();
      const dir = path.join(tmpDir, '.git-watchtower');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
        telemetryEnabled: true,
        distinctId: 'my-existing-id',
        promptedAt: '2024-01-01T00:00:00Z',
      }));

      assert.equal(config.getOrCreateDistinctId(), 'my-existing-id');
    });
  });

  describe('isTelemetryEnabled', () => {
    it('returns false when no config exists', () => {
      const config = createConfigModule();
      assert.equal(config.isTelemetryEnabled(), false);
    });

    it('returns true when config has telemetryEnabled: true', () => {
      const config = createConfigModule();
      const dir = path.join(tmpDir, '.git-watchtower');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
        telemetryEnabled: true,
        distinctId: 'test',
        promptedAt: '2024-01-01T00:00:00Z',
      }));

      assert.equal(config.isTelemetryEnabled(), true);
    });

    it('returns false when config has telemetryEnabled: false', () => {
      const config = createConfigModule();
      const dir = path.join(tmpDir, '.git-watchtower');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
        telemetryEnabled: false,
        distinctId: 'test',
        promptedAt: '2024-01-01T00:00:00Z',
      }));

      assert.equal(config.isTelemetryEnabled(), false);
    });

    it('returns false when GIT_WATCHTOWER_TELEMETRY=false even if config enabled', () => {
      const config = createConfigModule();
      process.env.GIT_WATCHTOWER_TELEMETRY = 'false';

      const dir = path.join(tmpDir, '.git-watchtower');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
        telemetryEnabled: true,
        distinctId: 'test',
        promptedAt: '2024-01-01T00:00:00Z',
      }));

      assert.equal(config.isTelemetryEnabled(), false);
    });

    it('returns false when GIT_WATCHTOWER_TELEMETRY=FALSE (case insensitive)', () => {
      const config = createConfigModule();
      process.env.GIT_WATCHTOWER_TELEMETRY = 'FALSE';
      assert.equal(config.isTelemetryEnabled(), false);
    });
  });

  describe('hasBeenPrompted', () => {
    it('returns false when no config exists', () => {
      const config = createConfigModule();
      assert.equal(config.hasBeenPrompted(), false);
    });

    it('returns true when config exists', () => {
      const config = createConfigModule();
      const dir = path.join(tmpDir, '.git-watchtower');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
        telemetryEnabled: false,
        distinctId: 'test',
        promptedAt: '2024-01-01T00:00:00Z',
      }));

      assert.equal(config.hasBeenPrompted(), true);
    });
  });

  describe('isEnvDisabled', () => {
    it('returns false when env var not set', () => {
      const config = createConfigModule();
      assert.equal(config.isEnvDisabled(), false);
    });

    it('returns true when GIT_WATCHTOWER_TELEMETRY=false', () => {
      const config = createConfigModule();
      process.env.GIT_WATCHTOWER_TELEMETRY = 'false';
      assert.equal(config.isEnvDisabled(), true);
    });

    it('returns false when GIT_WATCHTOWER_TELEMETRY=true', () => {
      const config = createConfigModule();
      process.env.GIT_WATCHTOWER_TELEMETRY = 'true';
      assert.equal(config.isEnvDisabled(), false);
    });
  });
});
