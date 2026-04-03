/**
 * Tests for web dashboard HTML module
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getDashboardHtml } = require('../../../../src/server/web-ui/html');

describe('getDashboardHtml', () => {
  it('should return a non-empty string', () => {
    const html = getDashboardHtml();
    assert.equal(typeof html, 'string');
    assert.ok(html.length > 0, 'HTML should not be empty');
  });

  it('should contain the header section', () => {
    const html = getDashboardHtml();
    assert.ok(html.includes('class="header"'), 'Should have header div');
    assert.ok(html.includes('header-title'), 'Should have header title');
    assert.ok(html.includes('Git Watchtower'), 'Should have app name');
    assert.ok(html.includes('id="version"'), 'Should have version element');
    assert.ok(html.includes('id="project-name"'), 'Should have project name element');
  });

  it('should contain the status badge', () => {
    const html = getDashboardHtml();
    assert.ok(html.includes('id="status-badge"'), 'Should have status badge');
    assert.ok(html.includes('id="connection-dot"'), 'Should have connection dot');
  });

  it('should contain the branch panel', () => {
    const html = getDashboardHtml();
    assert.ok(html.includes('class="branch-panel"'), 'Should have branch panel');
    assert.ok(html.includes('id="branch-list"'), 'Should have branch list');
    assert.ok(html.includes('id="branch-count"'), 'Should have branch count');
  });

  it('should contain the search bar', () => {
    const html = getDashboardHtml();
    assert.ok(html.includes('id="search-bar"'), 'Should have search bar');
    assert.ok(html.includes('id="search-input"'), 'Should have search input');
  });

  it('should contain the side panel with activity log', () => {
    const html = getDashboardHtml();
    assert.ok(html.includes('id="side-panel"'), 'Should have side panel');
    assert.ok(html.includes('id="activity-log"'), 'Should have activity log');
  });

  it('should contain keyboard shortcut hints in the footer', () => {
    const html = getDashboardHtml();
    assert.ok(html.includes('id="footer"'), 'Should have footer');
    assert.ok(html.includes('<kbd>j</kbd>'), 'Should show j key hint');
    assert.ok(html.includes('<kbd>k</kbd>'), 'Should show k key hint');
    assert.ok(html.includes('<kbd>Enter</kbd>'), 'Should show Enter key hint');
    assert.ok(html.includes('<kbd>/</kbd>'), 'Should show / key hint');
  });

  it('should contain all modal overlays', () => {
    const html = getDashboardHtml();
    assert.ok(html.includes('id="log-viewer-overlay"'), 'Should have log viewer modal');
    assert.ok(html.includes('id="branch-action-overlay"'), 'Should have branch action modal');
    assert.ok(html.includes('id="info-overlay"'), 'Should have info modal');
    assert.ok(html.includes('id="cleanup-overlay"'), 'Should have cleanup modal');
    assert.ok(html.includes('id="update-overlay"'), 'Should have update modal');
    assert.ok(html.includes('id="stash-overlay"'), 'Should have stash modal');
  });

  it('should contain toast and flash containers', () => {
    const html = getDashboardHtml();
    assert.ok(html.includes('id="toast-container"'), 'Should have toast container');
    assert.ok(html.includes('id="flash"'), 'Should have flash element');
    assert.ok(html.includes('id="confirm-overlay"'), 'Should have confirm overlay');
  });

  it('should contain the notification button', () => {
    const html = getDashboardHtml();
    assert.ok(html.includes('id="notif-btn"'), 'Should have notification button');
  });

  it('should not contain CSS or JavaScript', () => {
    const html = getDashboardHtml();
    assert.ok(!html.includes(':root {'), 'Should not contain CSS :root block');
    assert.ok(!html.includes('function '), 'Should not contain JavaScript functions');
    assert.ok(!html.includes('<style>'), 'Should not contain style tags');
    assert.ok(!html.includes('<script>'), 'Should not contain script tags');
  });

  it('should return the same content on repeated calls', () => {
    const html1 = getDashboardHtml();
    const html2 = getDashboardHtml();
    assert.equal(html1, html2, 'Should be deterministic');
  });
});
