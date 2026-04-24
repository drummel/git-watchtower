/**
 * Tests for config loader module
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  CONFIG_FILE_NAME,
  getConfigPath,
  configExists,
  loadConfig,
  saveConfig,
  deleteConfig,
} = require('../../../src/config/loader');
const { getDefaultConfig } = require('../../../src/config/schema');
const { ConfigError } = require('../../../src/utils/errors');

describe('getConfigPath', () => {
  it('should return path with config filename', () => {
    const result = getConfigPath('/project');
    assert.strictEqual(result, path.join('/project', CONFIG_FILE_NAME));
  });

  it('should use current directory by default', () => {
    const result = getConfigPath();
    assert.strictEqual(result, path.join(process.cwd(), CONFIG_FILE_NAME));
  });
});

describe('config file operations', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watchtower-test-'));
  });

  afterEach(() => {
    // Clean up temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('configExists', () => {
    it('should return false when no config file', () => {
      assert.strictEqual(configExists(tempDir), false);
    });

    it('should return true when config file exists', () => {
      fs.writeFileSync(path.join(tempDir, CONFIG_FILE_NAME), '{}');
      assert.strictEqual(configExists(tempDir), true);
    });
  });

  describe('loadConfig', () => {
    it('should return null when no config file', () => {
      const result = loadConfig(tempDir);
      assert.strictEqual(result, null);
    });

    it('should load and validate config file', () => {
      const config = {
        server: { mode: 'command', port: 8080 },
        remoteName: 'upstream',
      };
      fs.writeFileSync(
        path.join(tempDir, CONFIG_FILE_NAME),
        JSON.stringify(config)
      );

      const result = loadConfig(tempDir);

      assert.strictEqual(result.server.mode, 'command');
      assert.strictEqual(result.server.port, 8080);
      assert.strictEqual(result.remoteName, 'upstream');
    });

    it('should throw on invalid JSON', () => {
      fs.writeFileSync(path.join(tempDir, CONFIG_FILE_NAME), 'not json');

      assert.throws(() => loadConfig(tempDir), ConfigError);
    });

    it('should migrate old format', () => {
      const oldConfig = { noServer: true, port: 4000 };
      fs.writeFileSync(
        path.join(tempDir, CONFIG_FILE_NAME),
        JSON.stringify(oldConfig)
      );

      const result = loadConfig(tempDir);

      assert.strictEqual(result.server.mode, 'none');
      assert.strictEqual(result.server.port, 4000);
    });
  });

  describe('saveConfig', () => {
    it('should save valid config', () => {
      const config = getDefaultConfig();
      config.server.port = 9000;

      saveConfig(config, tempDir);

      const content = fs.readFileSync(
        path.join(tempDir, CONFIG_FILE_NAME),
        'utf8'
      );
      const saved = JSON.parse(content);

      assert.strictEqual(saved.server.port, 9000);
    });

    it('should format JSON nicely', () => {
      const config = getDefaultConfig();
      saveConfig(config, tempDir);

      const content = fs.readFileSync(
        path.join(tempDir, CONFIG_FILE_NAME),
        'utf8'
      );

      assert.ok(content.includes('\n')); // Has newlines
      assert.ok(content.endsWith('\n')); // Ends with newline
    });

    it('should throw on invalid config', () => {
      const invalidConfig = { server: { mode: 'invalid' } };

      assert.throws(() => saveConfig(invalidConfig, tempDir), ConfigError);
    });
  });

  describe('deleteConfig', () => {
    it('should delete existing config', () => {
      fs.writeFileSync(path.join(tempDir, CONFIG_FILE_NAME), '{}');

      const result = deleteConfig(tempDir);

      assert.strictEqual(result, true);
      assert.strictEqual(configExists(tempDir), false);
    });

    it('should return false if no config exists', () => {
      const result = deleteConfig(tempDir);

      assert.strictEqual(result, false);
    });
  });
});
