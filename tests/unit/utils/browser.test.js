const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const cp = require('child_process');

describe('isSafeUrl', () => {
  function getModule() {
    delete require.cache[require.resolve('../../../src/utils/browser')];
    return require('../../../src/utils/browser');
  }

  it('should accept http URLs', () => {
    const { isSafeUrl } = getModule();
    assert.equal(isSafeUrl('http://localhost:3000'), true);
  });

  it('should accept https URLs', () => {
    const { isSafeUrl } = getModule();
    assert.equal(isSafeUrl('https://example.com/path?q=1'), true);
  });

  it('should accept file URLs', () => {
    const { isSafeUrl } = getModule();
    assert.equal(isSafeUrl('file:///tmp/report.html'), true);
  });

  it('should reject URLs with & (cmd.exe command chaining)', () => {
    const { isSafeUrl } = getModule();
    assert.equal(isSafeUrl('https://example.com&calc'), false);
  });

  it('should reject URLs with | (cmd.exe pipe)', () => {
    const { isSafeUrl } = getModule();
    assert.equal(isSafeUrl('https://example.com|calc'), false);
  });

  it('should reject URLs with > (cmd.exe redirect)', () => {
    const { isSafeUrl } = getModule();
    assert.equal(isSafeUrl('https://example.com>out.txt'), false);
  });

  it('should reject URLs with < (cmd.exe redirect)', () => {
    const { isSafeUrl } = getModule();
    assert.equal(isSafeUrl('https://example.com<in.txt'), false);
  });

  it('should reject URLs with ^ (cmd.exe escape char)', () => {
    const { isSafeUrl } = getModule();
    assert.equal(isSafeUrl('https://example.com^foo'), false);
  });

  it('should reject non-http/https/file schemes', () => {
    const { isSafeUrl } = getModule();
    assert.equal(isSafeUrl('javascript:alert(1)'), false);
    assert.equal(isSafeUrl('data:text/html,<h1>hi</h1>'), false);
  });

  it('should reject empty or non-string input', () => {
    const { isSafeUrl } = getModule();
    assert.equal(isSafeUrl(''), false);
    assert.equal(isSafeUrl(null), false);
    assert.equal(isSafeUrl(undefined), false);
  });
});

describe('openInBrowser', () => {
  let originalPlatform;
  let originalExecFile;
  let execFileCalls;

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    originalExecFile = cp.execFile;
    execFileCalls = [];
  });

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
    cp.execFile = originalExecFile;
  });

  function getModule() {
    // Clear module cache to pick up fresh platform value
    delete require.cache[require.resolve('../../../src/utils/browser')];
    return require('../../../src/utils/browser');
  }

  it('should use "open" command on macOS', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    cp.execFile = (cmd, args, cb) => { execFileCalls.push({ cmd, args }); if (cb) cb(null); };
    const { openInBrowser } = getModule();
    openInBrowser('https://example.com');
    assert.ok(execFileCalls.some(c => c.cmd === 'open' && c.args.includes('https://example.com')));
  });

  it('should use "cmd.exe" with start on Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    cp.execFile = (cmd, args, cb) => { execFileCalls.push({ cmd, args }); if (cb) cb(null); };
    const { openInBrowser } = getModule();
    openInBrowser('https://example.com');
    assert.ok(execFileCalls.some(c => c.cmd === 'cmd.exe' && c.args.includes('start') && c.args.includes('https://example.com')));
  });

  it('should use "xdg-open" command on Linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    cp.execFile = (cmd, args, cb) => { execFileCalls.push({ cmd, args }); if (cb) cb(null); };
    const { openInBrowser } = getModule();
    openInBrowser('https://example.com');
    assert.ok(execFileCalls.some(c => c.cmd === 'xdg-open' && c.args.includes('https://example.com')));
  });

  it('should call onError callback when execFile fails', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    cp.execFile = (cmd, args, cb) => { if (cb) cb(new Error('exec failed')); };
    const { openInBrowser } = getModule();
    const errors = [];
    openInBrowser('https://example.com', (err) => errors.push(err));
    assert.equal(errors.length, 1);
    assert.equal(errors[0].message, 'exec failed');
  });

  it('should not throw when execFile fails and no onError callback', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    cp.execFile = (cmd, args, cb) => { if (cb) cb(new Error('exec failed')); };
    const { openInBrowser } = getModule();
    assert.doesNotThrow(() => openInBrowser('https://example.com'));
  });

  it('should pass URL as a separate argument (not interpolated into shell string)', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    cp.execFile = (cmd, args, cb) => { execFileCalls.push({ cmd, args }); if (cb) cb(null); };
    const { openInBrowser } = getModule();
    const safeUrl = 'https://example.com/$(whoami)';
    openInBrowser(safeUrl);
    // URL should be a separate arg, not embedded in a shell command string
    assert.ok(execFileCalls.some(c => c.args.includes(safeUrl)));
  });

  it('should reject URLs with shell metacharacters and call onError', () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    cp.execFile = (cmd, args, cb) => { execFileCalls.push({ cmd, args }); if (cb) cb(null); };
    const { openInBrowser } = getModule();
    const errors = [];
    openInBrowser('https://example.com&calc', (err) => errors.push(err));
    assert.equal(execFileCalls.length, 0, 'should not invoke execFile');
    assert.equal(errors.length, 1);
    assert.ok(errors[0].message.includes('unsafe URL'));
  });

  it('should reject non-http schemes without calling execFile', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    cp.execFile = (cmd, args, cb) => { execFileCalls.push({ cmd, args }); if (cb) cb(null); };
    const { openInBrowser } = getModule();
    openInBrowser('javascript:alert(1)');
    assert.equal(execFileCalls.length, 0);
  });
});
