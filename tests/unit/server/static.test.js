const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  getMimeType,
  MIME_TYPES,
  injectLiveReload,
  resolveStaticPath,
} = require('../../../src/server/static');
const { parseDiffStats } = require('../../../src/git/commands');

describe('MIME_TYPES', () => {
  it('should include common web types', () => {
    assert.equal(MIME_TYPES['.html'], 'text/html');
    assert.equal(MIME_TYPES['.css'], 'text/css');
    assert.equal(MIME_TYPES['.js'], 'application/javascript');
    assert.equal(MIME_TYPES['.json'], 'application/json');
  });

  it('should include image types', () => {
    assert.equal(MIME_TYPES['.png'], 'image/png');
    assert.equal(MIME_TYPES['.jpg'], 'image/jpeg');
    assert.equal(MIME_TYPES['.jpeg'], 'image/jpeg');
    assert.equal(MIME_TYPES['.gif'], 'image/gif');
    assert.equal(MIME_TYPES['.svg'], 'image/svg+xml');
    assert.equal(MIME_TYPES['.webp'], 'image/webp');
  });

  it('should include font types', () => {
    assert.equal(MIME_TYPES['.woff'], 'font/woff');
    assert.equal(MIME_TYPES['.woff2'], 'font/woff2');
    assert.equal(MIME_TYPES['.ttf'], 'font/ttf');
  });
});

describe('getMimeType', () => {
  it('should return correct type for known extensions', () => {
    assert.equal(getMimeType('.html'), 'text/html');
    assert.equal(getMimeType('.css'), 'text/css');
    assert.equal(getMimeType('.png'), 'image/png');
  });

  it('should default to application/octet-stream for unknown', () => {
    assert.equal(getMimeType('.xyz'), 'application/octet-stream');
    assert.equal(getMimeType('.bin'), 'application/octet-stream');
  });

  it('should be case-insensitive', () => {
    assert.equal(getMimeType('.HTML'), 'text/html');
    assert.equal(getMimeType('.CSS'), 'text/css');
  });

  it('should handle null/undefined', () => {
    assert.equal(getMimeType(null), 'application/octet-stream');
    assert.equal(getMimeType(undefined), 'application/octet-stream');
    assert.equal(getMimeType(''), 'application/octet-stream');
  });
});

describe('injectLiveReload', () => {
  it('should inject script before </body>', () => {
    const html = '<html><body><h1>Hello</h1></body></html>';
    const result = injectLiveReload(html);
    assert.ok(result.includes('EventSource'));
    assert.ok(result.includes('/livereload'));
    assert.ok(result.includes('<script>'));
    // Script is injected before the closing body tag
    const scriptIndex = result.indexOf('EventSource');
    const bodyIndex = result.lastIndexOf('</body>');
    assert.ok(scriptIndex < bodyIndex);
  });

  it('should not modify HTML without </body>', () => {
    const html = '<html><h1>No body tag</h1></html>';
    const result = injectLiveReload(html);
    assert.equal(result, html);
  });

  it('should handle empty string', () => {
    assert.equal(injectLiveReload(''), '');
  });
});

describe('parseDiffStats', () => {
  it('should parse both insertions and deletions', () => {
    const output = ' 3 files changed, 45 insertions(+), 12 deletions(-)';
    const result = parseDiffStats(output);
    assert.equal(result.added, 45);
    assert.equal(result.deleted, 12);
  });

  it('should parse single insertion', () => {
    const output = ' 1 file changed, 1 insertion(+)';
    const result = parseDiffStats(output);
    assert.equal(result.added, 1);
    assert.equal(result.deleted, 0);
  });

  it('should parse single deletion', () => {
    const output = ' 1 file changed, 1 deletion(-)';
    const result = parseDiffStats(output);
    assert.equal(result.added, 0);
    assert.equal(result.deleted, 1);
  });

  it('should parse insertions only', () => {
    const output = ' 5 files changed, 200 insertions(+)';
    const result = parseDiffStats(output);
    assert.equal(result.added, 200);
    assert.equal(result.deleted, 0);
  });

  it('should parse deletions only', () => {
    const output = ' 2 files changed, 50 deletions(-)';
    const result = parseDiffStats(output);
    assert.equal(result.added, 0);
    assert.equal(result.deleted, 50);
  });

  it('should handle null/empty input', () => {
    assert.deepEqual(parseDiffStats(null), { added: 0, deleted: 0 });
    assert.deepEqual(parseDiffStats(''), { added: 0, deleted: 0 });
  });

  it('should handle unparseable output', () => {
    assert.deepEqual(parseDiffStats('no diff data'), { added: 0, deleted: 0 });
  });

  it('should handle large numbers', () => {
    const output = ' 100 files changed, 5432 insertions(+), 1234 deletions(-)';
    const result = parseDiffStats(output);
    assert.equal(result.added, 5432);
    assert.equal(result.deleted, 1234);
  });
});

describe('resolveStaticPath', () => {
  // Build a sandbox with a real static root, a sibling "outside" file, a
  // symlink from inside-to-outside, and a symlink from inside-to-inside.
  // Tests run against realpaths so we pick up the tmp dir's actual target
  // (important on macOS where /tmp is a symlink to /private/tmp).
  let tmp;
  let realStaticDir;
  let outsideFile;
  let insideFile;
  let subdir;

  before(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'watchtower-static-')));
    realStaticDir = path.join(tmp, 'public');
    fs.mkdirSync(realStaticDir);

    insideFile = path.join(realStaticDir, 'index.html');
    fs.writeFileSync(insideFile, '<h1>ok</h1>');

    subdir = path.join(realStaticDir, 'sub');
    fs.mkdirSync(subdir);
    fs.writeFileSync(path.join(subdir, 'index.html'), '<h1>sub</h1>');

    outsideFile = path.join(tmp, 'secret.txt');
    fs.writeFileSync(outsideFile, 'top secret');

    // Symlink inside the static root that points at outside content.
    fs.symlinkSync(outsideFile, path.join(realStaticDir, 'escape.html'));

    // Symlink inside the static root that points at another inside file.
    fs.symlinkSync(insideFile, path.join(realStaticDir, 'alias.html'));
  });

  after(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('returns ok + realpath for a plain file inside the root', () => {
    const result = resolveStaticPath(path.join(realStaticDir, 'index.html'), realStaticDir);
    assert.equal(result.status, 'ok');
    assert.equal(result.path, insideFile);
  });

  it('returns ok and follows an inside-to-inside symlink without flagging it', () => {
    const result = resolveStaticPath(path.join(realStaticDir, 'alias.html'), realStaticDir);
    assert.equal(result.status, 'ok');
    // Critical: returned path is the *realpath target*, not the symlink name.
    // This is what downstream readers must use to close the TOCTOU window.
    assert.equal(result.path, insideFile);
  });

  it('returns forbidden for an inside-to-outside symlink', () => {
    const result = resolveStaticPath(path.join(realStaticDir, 'escape.html'), realStaticDir);
    assert.equal(result.status, 'forbidden');
  });

  it('returns forbidden for a traversal attempt against a non-existent file', () => {
    const result = resolveStaticPath(path.join(realStaticDir, '..', 'secret.txt'), realStaticDir);
    // Resolves to an existing outside file — must be rejected, not 404'd.
    assert.equal(result.status, 'forbidden');
  });

  it('returns forbidden for a traversal attempt whose target does not exist', () => {
    const result = resolveStaticPath(path.join(realStaticDir, '..', 'nonexistent'), realStaticDir);
    assert.equal(result.status, 'forbidden');
  });

  it('returns missing for a non-existent file inside the root', () => {
    const result = resolveStaticPath(path.join(realStaticDir, 'does-not-exist.html'), realStaticDir);
    assert.equal(result.status, 'missing');
  });

  it('returns ok for the root directory itself (used for index.html lookup)', () => {
    const result = resolveStaticPath(realStaticDir, realStaticDir);
    assert.equal(result.status, 'ok');
    assert.equal(result.path, realStaticDir);
  });

  it('returns ok for a nested directory inside the root', () => {
    const result = resolveStaticPath(subdir, realStaticDir);
    assert.equal(result.status, 'ok');
    assert.equal(result.path, subdir);
  });
});
