/**
 * Tests for server process module
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const {
  ProcessManager,
  parseCommand,
  MAX_LOG_LINES,
} = require('../../../src/server/process');

describe('parseCommand', () => {
  it('should parse simple command', () => {
    const result = parseCommand('npm start');
    assert.strictEqual(result.command, 'npm');
    assert.deepStrictEqual(result.args, ['start']);
  });

  it('should parse command with multiple args', () => {
    const result = parseCommand('npm run dev --port 3000');
    assert.strictEqual(result.command, 'npm');
    assert.deepStrictEqual(result.args, ['run', 'dev', '--port', '3000']);
  });

  it('should handle double-quoted arguments', () => {
    const result = parseCommand('npm run "dev server"');
    assert.strictEqual(result.command, 'npm');
    assert.deepStrictEqual(result.args, ['run', 'dev server']);
  });

  it('should handle single-quoted arguments', () => {
    const result = parseCommand("npm run 'dev server'");
    assert.strictEqual(result.command, 'npm');
    assert.deepStrictEqual(result.args, ['run', 'dev server']);
  });

  it('should handle mixed quotes', () => {
    const result = parseCommand('echo "hello" \'world\'');
    assert.strictEqual(result.command, 'echo');
    assert.deepStrictEqual(result.args, ['hello', 'world']);
  });

  it('should handle empty command', () => {
    const result = parseCommand('');
    assert.strictEqual(result.command, '');
    assert.deepStrictEqual(result.args, []);
  });

  it('should handle command with only spaces', () => {
    const result = parseCommand('   ');
    assert.strictEqual(result.command, '');
    assert.deepStrictEqual(result.args, []);
  });

  it('should handle command with extra spaces', () => {
    const result = parseCommand('npm   run   dev');
    assert.strictEqual(result.command, 'npm');
    assert.deepStrictEqual(result.args, ['run', 'dev']);
  });

  it('should handle path with spaces in quotes', () => {
    const result = parseCommand('node "/path/with spaces/script.js"');
    assert.strictEqual(result.command, 'node');
    assert.deepStrictEqual(result.args, ['/path/with spaces/script.js']);
  });

  it('should handle complex npm command', () => {
    const result = parseCommand('npm run dev -- --host 0.0.0.0 --port 3000');
    assert.strictEqual(result.command, 'npm');
    assert.deepStrictEqual(result.args, [
      'run',
      'dev',
      '--',
      '--host',
      '0.0.0.0',
      '--port',
      '3000',
    ]);
  });
});

describe('ProcessManager', () => {
  let manager;

  beforeEach(() => {
    manager = new ProcessManager();
  });

  afterEach(() => {
    // Clean up any running processes
    if (manager.isRunning()) {
      manager.stop();
    }
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      assert.strictEqual(manager.running, false);
      assert.strictEqual(manager.crashed, false);
      assert.deepStrictEqual(manager.logs, []);
      assert.strictEqual(manager.process, null);
    });

    it('should accept custom cwd', () => {
      const customManager = new ProcessManager({ cwd: '/custom/path' });
      assert.strictEqual(customManager.cwd, '/custom/path');
    });
  });

  describe('getState', () => {
    it('should return current state', () => {
      const state = manager.getState();
      assert.strictEqual(state.running, false);
      assert.strictEqual(state.crashed, false);
      assert.ok(Array.isArray(state.logs));
      assert.strictEqual(state.process, null);
    });

    it('should return copy of logs', () => {
      manager.addLog('test');
      const state1 = manager.getState();
      const state2 = manager.getState();
      assert.notStrictEqual(state1.logs, state2.logs);
    });
  });

  describe('addLog', () => {
    it('should add log entry', () => {
      manager.addLog('test message');
      assert.strictEqual(manager.logs.length, 1);
      assert.strictEqual(manager.logs[0].line, 'test message');
      assert.strictEqual(manager.logs[0].isError, false);
      assert.ok(manager.logs[0].timestamp);
    });

    it('should add error log', () => {
      manager.addLog('error message', true);
      assert.strictEqual(manager.logs[0].isError, true);
    });

    it('should call onLog callback', () => {
      let loggedLine = null;
      let loggedError = null;
      const customManager = new ProcessManager({
        onLog: (line, isError) => {
          loggedLine = line;
          loggedError = isError;
        },
      });

      customManager.addLog('test', true);
      assert.strictEqual(loggedLine, 'test');
      assert.strictEqual(loggedError, true);
    });

    it('should limit log buffer size', () => {
      for (let i = 0; i < MAX_LOG_LINES + 50; i++) {
        manager.addLog(`line ${i}`);
      }
      assert.strictEqual(manager.logs.length, MAX_LOG_LINES);
      assert.strictEqual(manager.logs[0].line, 'line 50'); // First 50 should be gone
    });
  });

  describe('clearLogs', () => {
    it('should clear log buffer', () => {
      manager.addLog('test1');
      manager.addLog('test2');
      manager.clearLogs();
      assert.strictEqual(manager.logs.length, 0);
    });
  });

  describe('start', () => {
    it('should fail with empty command', () => {
      const result = manager.start('');
      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    it('should start valid command', async () => {
      // Use a simple command that exits immediately
      const result = manager.start('node -e "console.log(1)"');
      assert.strictEqual(result.success, true);
      assert.ok(result.pid);

      // Wait for process to complete
      await new Promise((resolve) => setTimeout(resolve, 500));
    });

    it('should clear logs on start', () => {
      manager.addLog('old log');
      manager.start('node -e "process.exit(0)"');
      // First log should be the command
      assert.ok(manager.logs[0].line.includes('node'));
    });

    it('should call onStateChange', async () => {
      let stateChanges = 0;
      const customManager = new ProcessManager({
        onStateChange: () => stateChanges++,
      });

      customManager.start('node -e "console.log(1)"');

      // Wait for process to complete
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Should have at least one state change (start)
      assert.ok(stateChanges >= 1);
    });
  });

  describe('stop', () => {
    it('should return false if no process', () => {
      const result = manager.stop();
      assert.strictEqual(result, false);
    });

    it('should stop running process', async () => {
      // Start a long-running command
      manager.start('node -e "setTimeout(() => {}, 10000)"');
      assert.strictEqual(manager.isRunning(), true);

      const result = manager.stop();
      assert.strictEqual(result, true);

      // Wait a bit for cleanup
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.strictEqual(manager.isRunning(), false);
    });
  });

  describe('isRunning', () => {
    it('should return false initially', () => {
      assert.strictEqual(manager.isRunning(), false);
    });
  });

  describe('hasCrashed', () => {
    it('should return false initially', () => {
      assert.strictEqual(manager.hasCrashed(), false);
    });
  });

  describe('getPid', () => {
    it('should return null initially', () => {
      assert.strictEqual(manager.getPid(), null);
    });

    it('should return pid when running', () => {
      manager.start('node -e "setTimeout(() => {}, 10000)"');
      const pid = manager.getPid();
      assert.ok(typeof pid === 'number');
      assert.ok(pid > 0);
      manager.stop();
    });
  });

  describe('restart', () => {
    it('should restart the process', async () => {
      manager.start('node -e "setTimeout(() => {}, 10000)"');
      const originalPid = manager.getPid();

      const result = await manager.restart();
      assert.strictEqual(result.success, true);

      const newPid = manager.getPid();
      // PIDs might be the same or different depending on OS
      assert.ok(typeof newPid === 'number');

      manager.stop();
    });
  });
});
