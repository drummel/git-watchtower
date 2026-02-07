const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  getMimeType,
  MIME_TYPES,
  injectLiveReload,
  parseDiffStats,
} = require('../../../src/server/static');

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
