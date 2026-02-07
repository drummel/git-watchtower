const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const cp = require('child_process');

describe('openInBrowser', () => {
  let originalPlatform;
  let originalExec;
  let execCalls;

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    originalExec = cp.exec;
    execCalls = [];
  });

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
    cp.exec = originalExec;
  });

  function getModule() {
    // Clear module cache to pick up fresh platform value
    delete require.cache[require.resolve('../../../src/utils/browser')];
    return require('../../../src/utils/browser');
  }

  it('should use "open" command on macOS', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    cp.exec = (cmd, cb) => { execCalls.push(cmd); if (cb) cb(null); };
    const { openInBrowser } = getModule();
    openInBrowser('https://example.com');
    assert.ok(execCalls.some(cmd => cmd.includes('open') && cmd.includes('https://example.com')));
  });

  it('should use "start" command on Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    cp.exec = (cmd, cb) => { execCalls.push(cmd); if (cb) cb(null); };
    const { openInBrowser } = getModule();
    openInBrowser('https://example.com');
    assert.ok(execCalls.some(cmd => cmd.includes('start') && cmd.includes('https://example.com')));
  });

  it('should use "xdg-open" command on Linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    cp.exec = (cmd, cb) => { execCalls.push(cmd); if (cb) cb(null); };
    const { openInBrowser } = getModule();
    openInBrowser('https://example.com');
    assert.ok(execCalls.some(cmd => cmd.includes('xdg-open') && cmd.includes('https://example.com')));
  });

  it('should call onError callback when exec fails', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    cp.exec = (cmd, cb) => { if (cb) cb(new Error('exec failed')); };
    const { openInBrowser } = getModule();
    const errors = [];
    openInBrowser('https://example.com', (err) => errors.push(err));
    assert.equal(errors.length, 1);
    assert.equal(errors[0].message, 'exec failed');
  });

  it('should not throw when exec fails and no onError callback', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    cp.exec = (cmd, cb) => { if (cb) cb(new Error('exec failed')); };
    const { openInBrowser } = getModule();
    assert.doesNotThrow(() => openInBrowser('https://example.com'));
  });

  it('should properly quote URLs with special characters', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    cp.exec = (cmd, cb) => { execCalls.push(cmd); if (cb) cb(null); };
    const { openInBrowser } = getModule();
    openInBrowser('https://example.com/path?q=hello&x=1');
    assert.ok(execCalls.some(cmd => cmd.includes('https://example.com/path?q=hello&x=1')));
  });
});
