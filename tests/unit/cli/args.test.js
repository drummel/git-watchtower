const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs, applyCliArgsToConfig, getHelpText, PACKAGE_VERSION } = require('../../../src/cli/args');

describe('parseArgs', () => {
  it('should return defaults for empty args', () => {
    const result = parseArgs([]);
    assert.equal(result.mode, null);
    assert.equal(result.noServer, false);
    assert.equal(result.port, null);
    assert.equal(result.staticDir, null);
    assert.equal(result.command, null);
    assert.equal(result.restartOnSwitch, null);
    assert.equal(result.remote, null);
    assert.equal(result.autoPull, null);
    assert.equal(result.pollInterval, null);
    assert.equal(result.sound, null);
    assert.equal(result.visibleBranches, null);
    assert.equal(result.init, false);
    assert.equal(result.casino, false);
  });

  // Server settings
  describe('--mode', () => {
    it('should parse --mode static', () => {
      const result = parseArgs(['--mode', 'static']);
      assert.equal(result.mode, 'static');
    });

    it('should parse --mode command', () => {
      const result = parseArgs(['--mode', 'command']);
      assert.equal(result.mode, 'command');
    });

    it('should parse --mode none', () => {
      const result = parseArgs(['--mode', 'none']);
      assert.equal(result.mode, 'none');
    });

    it('should parse -m shorthand', () => {
      const result = parseArgs(['-m', 'command']);
      assert.equal(result.mode, 'command');
    });

    it('should ignore invalid mode values', () => {
      const result = parseArgs(['--mode', 'invalid']);
      assert.equal(result.mode, null);
    });
  });

  describe('--port', () => {
    it('should parse --port with valid value', () => {
      const result = parseArgs(['--port', '8080']);
      assert.equal(result.port, 8080);
    });

    it('should parse -p shorthand', () => {
      const result = parseArgs(['-p', '3001']);
      assert.equal(result.port, 3001);
    });

    it('should reject port 0', () => {
      const result = parseArgs(['--port', '0']);
      assert.equal(result.port, null);
    });

    it('should reject negative port', () => {
      const result = parseArgs(['--port', '-1']);
      assert.equal(result.port, null);
    });

    it('should reject port >= 65536', () => {
      const result = parseArgs(['--port', '65536']);
      assert.equal(result.port, null);
    });

    it('should reject non-numeric port', () => {
      const result = parseArgs(['--port', 'abc']);
      assert.equal(result.port, null);
    });
  });

  describe('--no-server', () => {
    it('should set noServer flag', () => {
      const result = parseArgs(['--no-server']);
      assert.equal(result.noServer, true);
    });

    it('should parse -n shorthand', () => {
      const result = parseArgs(['-n']);
      assert.equal(result.noServer, true);
    });
  });

  describe('--static-dir', () => {
    it('should parse static directory', () => {
      const result = parseArgs(['--static-dir', 'dist']);
      assert.equal(result.staticDir, 'dist');
    });
  });

  describe('--command', () => {
    it('should parse server command', () => {
      const result = parseArgs(['--command', 'npm run dev']);
      assert.equal(result.command, 'npm run dev');
    });

    it('should parse -c shorthand', () => {
      const result = parseArgs(['-c', 'vite']);
      assert.equal(result.command, 'vite');
    });
  });

  describe('--restart-on-switch', () => {
    it('should enable restart on switch', () => {
      const result = parseArgs(['--restart-on-switch']);
      assert.equal(result.restartOnSwitch, true);
    });

    it('should disable restart on switch', () => {
      const result = parseArgs(['--no-restart-on-switch']);
      assert.equal(result.restartOnSwitch, false);
    });
  });

  // Git settings
  describe('--remote', () => {
    it('should parse remote name', () => {
      const result = parseArgs(['--remote', 'upstream']);
      assert.equal(result.remote, 'upstream');
    });

    it('should parse -r shorthand', () => {
      const result = parseArgs(['-r', 'upstream']);
      assert.equal(result.remote, 'upstream');
    });
  });

  describe('--auto-pull', () => {
    it('should enable auto-pull', () => {
      const result = parseArgs(['--auto-pull']);
      assert.equal(result.autoPull, true);
    });

    it('should disable auto-pull', () => {
      const result = parseArgs(['--no-auto-pull']);
      assert.equal(result.autoPull, false);
    });
  });

  describe('--poll-interval', () => {
    it('should parse valid poll interval', () => {
      const result = parseArgs(['--poll-interval', '10000']);
      assert.equal(result.pollInterval, 10000);
    });

    it('should reject zero interval', () => {
      const result = parseArgs(['--poll-interval', '0']);
      assert.equal(result.pollInterval, null);
    });

    it('should reject negative interval', () => {
      const result = parseArgs(['--poll-interval', '-5000']);
      assert.equal(result.pollInterval, null);
    });

    it('should reject non-numeric interval', () => {
      const result = parseArgs(['--poll-interval', 'fast']);
      assert.equal(result.pollInterval, null);
    });
  });

  // UI settings
  describe('--sound', () => {
    it('should enable sound', () => {
      const result = parseArgs(['--sound']);
      assert.equal(result.sound, true);
    });

    it('should disable sound', () => {
      const result = parseArgs(['--no-sound']);
      assert.equal(result.sound, false);
    });
  });

  describe('--visible-branches', () => {
    it('should parse valid branch count', () => {
      const result = parseArgs(['--visible-branches', '10']);
      assert.equal(result.visibleBranches, 10);
    });

    it('should reject zero', () => {
      const result = parseArgs(['--visible-branches', '0']);
      assert.equal(result.visibleBranches, null);
    });

    it('should reject negative', () => {
      const result = parseArgs(['--visible-branches', '-3']);
      assert.equal(result.visibleBranches, null);
    });
  });

  describe('--casino', () => {
    it('should enable casino mode', () => {
      const result = parseArgs(['--casino']);
      assert.equal(result.casino, true);
    });
  });

  describe('--init', () => {
    it('should set init flag', () => {
      const result = parseArgs(['--init']);
      assert.equal(result.init, true);
    });
  });

  describe('--version', () => {
    it('should call onVersion callback', () => {
      let versionCalled = null;
      parseArgs(['--version'], { onVersion: (v) => { versionCalled = v; } });
      assert.equal(versionCalled, PACKAGE_VERSION);
    });

    it('should parse -v shorthand', () => {
      let versionCalled = null;
      parseArgs(['-v'], { onVersion: (v) => { versionCalled = v; } });
      assert.equal(versionCalled, PACKAGE_VERSION);
    });
  });

  describe('--help', () => {
    it('should call onHelp callback', () => {
      let helpCalled = null;
      parseArgs(['--help'], { onHelp: (v) => { helpCalled = v; } });
      assert.equal(helpCalled, PACKAGE_VERSION);
    });

    it('should parse -h shorthand', () => {
      let helpCalled = null;
      parseArgs(['-h'], { onHelp: (v) => { helpCalled = v; } });
      assert.equal(helpCalled, PACKAGE_VERSION);
    });
  });

  describe('multiple args', () => {
    it('should handle multiple args together', () => {
      const result = parseArgs([
        '--mode', 'command',
        '--port', '8080',
        '-c', 'npm run dev',
        '--no-sound',
        '--poll-interval', '10000',
        '--casino',
      ]);
      assert.equal(result.mode, 'command');
      assert.equal(result.port, 8080);
      assert.equal(result.command, 'npm run dev');
      assert.equal(result.sound, false);
      assert.equal(result.pollInterval, 10000);
      assert.equal(result.casino, true);
    });
  });

  describe('null/undefined argv', () => {
    it('should handle null argv gracefully', () => {
      const result = parseArgs(null);
      assert.equal(result.mode, null);
    });

    it('should handle undefined argv gracefully', () => {
      const result = parseArgs(undefined);
      assert.equal(result.mode, null);
    });
  });
});

describe('applyCliArgsToConfig', () => {
  function getBaseConfig() {
    return {
      server: {
        mode: 'static',
        staticDir: 'public',
        command: '',
        port: 3000,
        restartOnSwitch: true,
      },
      remoteName: 'origin',
      autoPull: true,
      gitPollInterval: 5000,
      soundEnabled: true,
      visibleBranches: 7,
    };
  }

  it('should not mutate the original config', () => {
    const config = getBaseConfig();
    const original = JSON.parse(JSON.stringify(config));
    applyCliArgsToConfig(config, parseArgs(['--port', '9000']));
    assert.deepStrictEqual(config, original);
  });

  it('should apply mode override', () => {
    const result = applyCliArgsToConfig(getBaseConfig(), parseArgs(['--mode', 'none']));
    assert.equal(result.server.mode, 'none');
  });

  it('should apply noServer as mode=none', () => {
    const result = applyCliArgsToConfig(getBaseConfig(), parseArgs(['--no-server']));
    assert.equal(result.server.mode, 'none');
  });

  it('should apply port override', () => {
    const result = applyCliArgsToConfig(getBaseConfig(), parseArgs(['--port', '9000']));
    assert.equal(result.server.port, 9000);
  });

  it('should apply static dir override', () => {
    const result = applyCliArgsToConfig(getBaseConfig(), parseArgs(['--static-dir', 'dist']));
    assert.equal(result.server.staticDir, 'dist');
  });

  it('should apply command override', () => {
    const result = applyCliArgsToConfig(getBaseConfig(), parseArgs(['-c', 'vite']));
    assert.equal(result.server.command, 'vite');
  });

  it('should apply restartOnSwitch override', () => {
    const result = applyCliArgsToConfig(getBaseConfig(), parseArgs(['--no-restart-on-switch']));
    assert.equal(result.server.restartOnSwitch, false);
  });

  it('should apply remote override', () => {
    const result = applyCliArgsToConfig(getBaseConfig(), parseArgs(['--remote', 'upstream']));
    assert.equal(result.remoteName, 'upstream');
  });

  it('should apply autoPull override', () => {
    const result = applyCliArgsToConfig(getBaseConfig(), parseArgs(['--no-auto-pull']));
    assert.equal(result.autoPull, false);
  });

  it('should apply pollInterval override', () => {
    const result = applyCliArgsToConfig(getBaseConfig(), parseArgs(['--poll-interval', '15000']));
    assert.equal(result.gitPollInterval, 15000);
  });

  it('should apply sound override', () => {
    const result = applyCliArgsToConfig(getBaseConfig(), parseArgs(['--no-sound']));
    assert.equal(result.soundEnabled, false);
  });

  it('should apply visibleBranches override', () => {
    const result = applyCliArgsToConfig(getBaseConfig(), parseArgs(['--visible-branches', '15']));
    assert.equal(result.visibleBranches, 15);
  });

  it('should apply casino mode', () => {
    const result = applyCliArgsToConfig(getBaseConfig(), parseArgs(['--casino']));
    assert.equal(result.casinoMode, true);
  });

  it('should not modify values for null CLI args', () => {
    const result = applyCliArgsToConfig(getBaseConfig(), parseArgs([]));
    assert.equal(result.server.mode, 'static');
    assert.equal(result.server.port, 3000);
    assert.equal(result.remoteName, 'origin');
    assert.equal(result.autoPull, true);
    assert.equal(result.gitPollInterval, 5000);
    assert.equal(result.soundEnabled, true);
    assert.equal(result.visibleBranches, 7);
  });
});

describe('getHelpText', () => {
  it('should include the version', () => {
    const text = getHelpText('1.2.0');
    assert.ok(text.includes('v1.2.0'));
  });

  it('should include usage examples', () => {
    const text = getHelpText('1.0.0');
    assert.ok(text.includes('git-watchtower'));
    assert.ok(text.includes('--mode'));
    assert.ok(text.includes('--port'));
    assert.ok(text.includes('--no-server'));
  });

  it('should include all server modes', () => {
    const text = getHelpText('1.0.0');
    assert.ok(text.includes('static'));
    assert.ok(text.includes('command'));
    assert.ok(text.includes('none'));
  });
});

describe('PACKAGE_VERSION', () => {
  it('should be a semver string', () => {
    assert.match(PACKAGE_VERSION, /^\d+\.\d+\.\d+$/);
  });
});
