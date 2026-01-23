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
  applyCliArgs,
  parseCliArgs,
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

describe('applyCliArgs', () => {
  it('should override server mode', () => {
    const config = getDefaultConfig();
    const cliArgs = { mode: 'command' };

    const result = applyCliArgs(config, cliArgs);

    assert.strictEqual(result.server.mode, 'command');
  });

  it('should set mode to none with noServer flag', () => {
    const config = getDefaultConfig();
    const cliArgs = { noServer: true };

    const result = applyCliArgs(config, cliArgs);

    assert.strictEqual(result.server.mode, 'none');
  });

  it('should override port', () => {
    const config = getDefaultConfig();
    const cliArgs = { port: 8080 };

    const result = applyCliArgs(config, cliArgs);

    assert.strictEqual(result.server.port, 8080);
  });

  it('should override git settings', () => {
    const config = getDefaultConfig();
    const cliArgs = {
      remote: 'upstream',
      autoPull: false,
      pollInterval: 10000,
    };

    const result = applyCliArgs(config, cliArgs);

    assert.strictEqual(result.remoteName, 'upstream');
    assert.strictEqual(result.autoPull, false);
    assert.strictEqual(result.gitPollInterval, 10000);
  });

  it('should override UI settings', () => {
    const config = getDefaultConfig();
    const cliArgs = {
      sound: false,
      visibleBranches: 15,
    };

    const result = applyCliArgs(config, cliArgs);

    assert.strictEqual(result.soundEnabled, false);
    assert.strictEqual(result.visibleBranches, 15);
  });

  it('should not override with null values', () => {
    const config = getDefaultConfig();
    config.server.port = 9000;
    const cliArgs = { port: null };

    const result = applyCliArgs(config, cliArgs);

    assert.strictEqual(result.server.port, 9000);
  });

  it('should not mutate original config', () => {
    const config = getDefaultConfig();
    const originalPort = config.server.port;
    const cliArgs = { port: 8080 };

    applyCliArgs(config, cliArgs);

    assert.strictEqual(config.server.port, originalPort);
  });
});

describe('parseCliArgs', () => {
  it('should parse server mode', () => {
    const result = parseCliArgs(['--mode', 'command']);
    assert.strictEqual(result.mode, 'command');
  });

  it('should parse no-server flag', () => {
    const result = parseCliArgs(['--no-server']);
    assert.strictEqual(result.noServer, true);
  });

  it('should parse port with long flag', () => {
    const result = parseCliArgs(['--port', '8080']);
    assert.strictEqual(result.port, 8080);
  });

  it('should parse port with short flag', () => {
    const result = parseCliArgs(['-p', '8080']);
    assert.strictEqual(result.port, 8080);
  });

  it('should parse static directory', () => {
    const result = parseCliArgs(['--static-dir', 'dist']);
    assert.strictEqual(result.staticDir, 'dist');
  });

  it('should parse command', () => {
    const result = parseCliArgs(['--command', 'npm run dev']);
    assert.strictEqual(result.command, 'npm run dev');
  });

  it('should parse restart on switch flags', () => {
    const withRestart = parseCliArgs(['--restart-on-switch']);
    assert.strictEqual(withRestart.restartOnSwitch, true);

    const withoutRestart = parseCliArgs(['--no-restart-on-switch']);
    assert.strictEqual(withoutRestart.restartOnSwitch, false);
  });

  it('should parse remote name', () => {
    const result = parseCliArgs(['--remote', 'upstream']);
    assert.strictEqual(result.remote, 'upstream');
  });

  it('should parse auto-pull flags', () => {
    const withAutoPull = parseCliArgs(['--auto-pull']);
    assert.strictEqual(withAutoPull.autoPull, true);

    const withoutAutoPull = parseCliArgs(['--no-auto-pull']);
    assert.strictEqual(withoutAutoPull.autoPull, false);
  });

  it('should parse poll interval in seconds', () => {
    const result = parseCliArgs(['--poll-interval', '10']);
    assert.strictEqual(result.pollInterval, 10000); // Converted to ms
  });

  it('should parse sound flags', () => {
    const withSound = parseCliArgs(['--sound']);
    assert.strictEqual(withSound.sound, true);

    const withoutSound = parseCliArgs(['--no-sound']);
    assert.strictEqual(withoutSound.sound, false);
  });

  it('should parse visible branches', () => {
    const result = parseCliArgs(['--visible-branches', '10']);
    assert.strictEqual(result.visibleBranches, 10);
  });

  it('should parse special flags', () => {
    const init = parseCliArgs(['--init']);
    assert.strictEqual(init.init, true);

    const help = parseCliArgs(['--help']);
    assert.strictEqual(help.help, true);

    const version = parseCliArgs(['--version']);
    assert.strictEqual(version.version, true);
  });

  it('should parse multiple args', () => {
    const result = parseCliArgs([
      '--mode',
      'command',
      '-p',
      '8080',
      '--no-sound',
      '--remote',
      'upstream',
    ]);

    assert.strictEqual(result.mode, 'command');
    assert.strictEqual(result.port, 8080);
    assert.strictEqual(result.sound, false);
    assert.strictEqual(result.remote, 'upstream');
  });

  it('should return nulls for unspecified args', () => {
    const result = parseCliArgs([]);

    assert.strictEqual(result.mode, null);
    assert.strictEqual(result.port, null);
    assert.strictEqual(result.remote, null);
    assert.strictEqual(result.noServer, false);
  });
});
