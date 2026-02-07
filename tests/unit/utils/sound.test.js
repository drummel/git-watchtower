const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

describe('playSound', () => {
  let originalPlatform;
  let execCalls;
  let stdoutWrites;

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    execCalls = [];
    stdoutWrites = [];
  });

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  function loadModuleWithMockedExec() {
    delete require.cache[require.resolve('../../../src/utils/sound')];
    const cp = require('child_process');
    const originalExec = cp.exec;
    cp.exec = (cmd, opts) => { execCalls.push({ cmd, opts }); };

    const originalWrite = process.stdout.write;
    process.stdout.write = (data) => { stdoutWrites.push(data); };

    const mod = require('../../../src/utils/sound');

    cp.exec = originalExec;
    process.stdout.write = originalWrite;
    return mod;
  }

  it('should use afplay on macOS', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    const { playSound } = loadModuleWithMockedExec();
    const cp = require('child_process');
    const orig = cp.exec;
    cp.exec = (cmd, opts) => { execCalls.push({ cmd, opts }); };
    playSound();
    cp.exec = orig;
    assert.ok(execCalls.some(c => c.cmd.includes('afplay')));
  });

  it('should use paplay/aplay on Linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    const { playSound } = loadModuleWithMockedExec();
    const cp = require('child_process');
    const orig = cp.exec;
    cp.exec = (cmd, opts) => { execCalls.push({ cmd, opts }); };
    playSound();
    cp.exec = orig;
    assert.ok(execCalls.some(c => c.cmd.includes('paplay')));
  });

  it('should use terminal bell on Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    const { playSound } = loadModuleWithMockedExec();
    const originalWrite = process.stdout.write;
    process.stdout.write = (data) => { stdoutWrites.push(data); };
    playSound();
    process.stdout.write = originalWrite;
    assert.ok(stdoutWrites.some(w => w === '\x07'));
  });

  it('should accept a custom cwd option', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    const { playSound } = loadModuleWithMockedExec();
    const cp = require('child_process');
    const orig = cp.exec;
    cp.exec = (cmd, opts) => { execCalls.push({ cmd, opts }); };
    playSound({ cwd: '/tmp/test' });
    cp.exec = orig;
    assert.ok(execCalls.some(c => c.opts && c.opts.cwd === '/tmp/test'));
  });

  it('should default to process.cwd() if no cwd given', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    const { playSound } = loadModuleWithMockedExec();
    const cp = require('child_process');
    const orig = cp.exec;
    cp.exec = (cmd, opts) => { execCalls.push({ cmd, opts }); };
    playSound();
    cp.exec = orig;
    assert.ok(execCalls.some(c => c.opts && c.opts.cwd === process.cwd()));
  });
});
