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

  // Loads sound.js fresh with a mocked child_process.execFile so we can
  // observe what command + args + opts the module spawned without actually
  // forking a process. The mock captures calls but does not invoke the
  // callback, so the Linux cascade halts after its first attempt — that's
  // sufficient for the assertions below.
  function loadModuleWithMockedExec() {
    delete require.cache[require.resolve('../../../src/utils/sound')];
    const cp = require('child_process');
    const originalExecFile = cp.execFile;
    cp.execFile = (cmd, args, opts /* , cb */) => {
      execCalls.push({ cmd, args, opts });
    };

    const originalWrite = process.stdout.write;
    process.stdout.write = (data) => { stdoutWrites.push(data); };

    const mod = require('../../../src/utils/sound');

    cp.execFile = originalExecFile;
    process.stdout.write = originalWrite;
    return mod;
  }

  it('should use afplay on macOS', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    const { playSound } = loadModuleWithMockedExec();
    playSound();
    assert.ok(execCalls.some(c => c.cmd === 'afplay'));
  });

  it('should use paplay/aplay on Linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    const { playSound } = loadModuleWithMockedExec();
    playSound();
    // First cascade attempt is paplay; aplay only fires if paplay errors,
    // which our no-op mock doesn't propagate. Asserting just paplay is
    // enough to lock in "tries paplay first."
    assert.ok(execCalls.some(c => c.cmd === 'paplay'));
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
    playSound({ cwd: '/tmp/test' });
    assert.ok(execCalls.some(c => c.opts && c.opts.cwd === '/tmp/test'));
  });

  it('should default to process.cwd() if no cwd given', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    const { playSound } = loadModuleWithMockedExec();
    playSound();
    assert.ok(execCalls.some(c => c.opts && c.opts.cwd === process.cwd()));
  });

  it('should pass arguments as a separate array, not a shell string', () => {
    // Regression check for the exec → execFile switch: arguments must be
    // in an array (no shell parsing), not interpolated into a single
    // command string.
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    const { playSound } = loadModuleWithMockedExec();
    playSound();
    const call = execCalls.find(c => c.cmd === 'afplay');
    assert.ok(call, 'expected an afplay call');
    assert.ok(Array.isArray(call.args), 'args must be an array');
    assert.ok(call.args.length > 0, 'args must contain the sound path');
    assert.ok(call.args[0].includes('Pop.aiff'));
  });
});
