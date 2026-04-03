/**
 * Tests for web dashboard assembly module
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getWebDashboardHtml } = require('../../../../src/server/web-ui/index');

describe('getWebDashboardHtml', () => {
  it('should return a complete HTML document', () => {
    const html = getWebDashboardHtml(4000);
    assert.equal(typeof html, 'string');
    assert.ok(html.length > 0, 'Should not be empty');
    assert.ok(html.startsWith('<!DOCTYPE html>'), 'Should start with DOCTYPE');
    assert.ok(html.includes('</html>'), 'Should end with closing html tag');
  });

  it('should include all three sections in the correct order', () => {
    const html = getWebDashboardHtml(4000);

    const styleStart = html.indexOf('<style>');
    const styleEnd = html.indexOf('</style>');
    const bodyStart = html.indexOf('<body>');
    const scriptStart = html.indexOf('<script>');
    const scriptEnd = html.indexOf('</script>');
    const bodyEnd = html.indexOf('</body>');

    assert.ok(styleStart > 0, 'Should contain style tag');
    assert.ok(styleEnd > styleStart, 'Should close style tag after opening');
    assert.ok(bodyStart > styleEnd, 'Body should come after style');
    assert.ok(scriptStart > bodyStart, 'Script should come after body opens');
    assert.ok(scriptEnd > scriptStart, 'Should close script tag after opening');
    assert.ok(bodyEnd > scriptEnd, 'Body should close after script');
  });

  it('should contain CSS content between style tags', () => {
    const html = getWebDashboardHtml(4000);
    const styleStart = html.indexOf('<style>') + '<style>'.length;
    const styleEnd = html.indexOf('</style>');
    const css = html.substring(styleStart, styleEnd);

    assert.ok(css.includes(':root'), 'CSS section should have :root');
    assert.ok(css.includes('.header'), 'CSS section should have .header');
    assert.ok(css.includes('.branch-item'), 'CSS section should have .branch-item');
  });

  it('should contain HTML body elements', () => {
    const html = getWebDashboardHtml(4000);
    assert.ok(html.includes('id="branch-list"'), 'Should have branch list');
    assert.ok(html.includes('id="activity-log"'), 'Should have activity log');
    assert.ok(html.includes('id="footer"'), 'Should have footer');
  });

  it('should contain JavaScript between script tags', () => {
    const html = getWebDashboardHtml(4000);
    const scriptStart = html.indexOf('<script>') + '<script>'.length;
    const scriptEnd = html.indexOf('</script>');
    const js = html.substring(scriptStart, scriptEnd);

    assert.ok(js.includes('function render()'), 'JS section should have render');
    assert.ok(js.includes('function connect()'), 'JS section should have connect');
    assert.ok(js.includes('EventSource'), 'JS section should have EventSource');
  });

  it('should have proper HTML structure', () => {
    const html = getWebDashboardHtml(4000);
    assert.ok(html.includes('<html lang="en">'), 'Should have html lang attribute');
    assert.ok(html.includes('<meta charset="utf-8">'), 'Should have charset meta');
    assert.ok(html.includes('<title>Git Watchtower</title>'), 'Should have title');
  });

  it('should not have duplicate wrapper tags from assembly', () => {
    const html = getWebDashboardHtml(4000);
    assert.equal((html.match(/<style>/g) || []).length, 1, 'Should have exactly one <style> tag');
    assert.equal((html.match(/<\/style>/g) || []).length, 1, 'Should have exactly one </style> tag');
    assert.equal((html.match(/<script>/g) || []).length, 1, 'Should have exactly one <script> tag');
    assert.equal((html.match(/<\/script>/g) || []).length, 1, 'Should have exactly one </script> tag');
    assert.equal((html.match(/<body>/g) || []).length, 1, 'Should have exactly one <body> tag');
    assert.equal((html.match(/<\/body>/g) || []).length, 1, 'Should have exactly one </body> tag');
  });

  it('should accept port parameter for API compatibility', () => {
    // Port is currently unused but accepted for backward compatibility
    assert.doesNotThrow(() => getWebDashboardHtml(4000));
    assert.doesNotThrow(() => getWebDashboardHtml(5000));
    assert.doesNotThrow(() => getWebDashboardHtml());
  });

  it('should produce identical output regardless of port', () => {
    const html1 = getWebDashboardHtml(4000);
    const html2 = getWebDashboardHtml(5000);
    assert.equal(html1, html2, 'Port is unused so output should be identical');
  });

  it('should be importable via the re-export at server/web-ui.js', () => {
    const reexport = require('../../../../src/server/web-ui');
    assert.equal(typeof reexport.getWebDashboardHtml, 'function');
    // Verify it's the same function
    const html = reexport.getWebDashboardHtml(4000);
    assert.ok(html.startsWith('<!DOCTYPE html>'));
  });
});
