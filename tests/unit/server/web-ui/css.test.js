/**
 * Tests for web dashboard CSS module
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getDashboardCss } = require('../../../../src/server/web-ui/css');

describe('getDashboardCss', () => {
  it('should return a non-empty string', () => {
    const css = getDashboardCss();
    assert.equal(typeof css, 'string');
    assert.ok(css.length > 0, 'CSS should not be empty');
  });

  it('should contain CSS custom properties (:root)', () => {
    const css = getDashboardCss();
    assert.ok(css.includes(':root'), 'Should contain :root selector');
    assert.ok(css.includes('--bg:'), 'Should define --bg variable');
    assert.ok(css.includes('--text:'), 'Should define --text variable');
    assert.ok(css.includes('--accent:'), 'Should define --accent variable');
  });

  it('should contain key component styles', () => {
    const css = getDashboardCss();
    assert.ok(css.includes('.header'), 'Should style .header');
    assert.ok(css.includes('.branch-item'), 'Should style .branch-item');
    assert.ok(css.includes('.branch-list'), 'Should style .branch-list');
    assert.ok(css.includes('.side-panel'), 'Should style .side-panel');
    assert.ok(css.includes('.footer'), 'Should style .footer');
  });

  it('should contain modal styles', () => {
    const css = getDashboardCss();
    assert.ok(css.includes('.modal-overlay'), 'Should style .modal-overlay');
    assert.ok(css.includes('.modal-box'), 'Should style .modal-box');
    assert.ok(css.includes('.confirm-overlay'), 'Should style .confirm-overlay');
  });

  it('should contain toast and flash styles', () => {
    const css = getDashboardCss();
    assert.ok(css.includes('.toast-container'), 'Should style .toast-container');
    assert.ok(css.includes('.flash'), 'Should style .flash');
  });

  it('should contain search bar styles', () => {
    const css = getDashboardCss();
    assert.ok(css.includes('.search-bar'), 'Should style .search-bar');
    assert.ok(css.includes('.search-input'), 'Should style .search-input');
  });

  it('should contain badge styles for branch states', () => {
    const css = getDashboardCss();
    assert.ok(css.includes('.badge-online'), 'Should style .badge-online');
    assert.ok(css.includes('.badge-offline'), 'Should style .badge-offline');
    assert.ok(css.includes('.pr-badge'), 'Should style .pr-badge');
  });

  it('should contain sparkline styles', () => {
    const css = getDashboardCss();
    assert.ok(css.includes('.sparkline-bar'), 'Should style .sparkline-bar');
    assert.ok(css.includes('.spark-bar'), 'Should style .spark-bar');
  });

  it('should contain sidebar collapsed styles', () => {
    const css = getDashboardCss();
    assert.ok(css.includes('.sidebar-collapsed'), 'Should have sidebar collapsed styles');
  });

  it('should not contain HTML or script tags', () => {
    const css = getDashboardCss();
    assert.ok(!css.includes('<script'), 'Should not contain script tags');
    assert.ok(!css.includes('<div'), 'Should not contain HTML elements');
    assert.ok(!css.includes('function '), 'Should not contain JavaScript functions');
  });

  it('should return the same content on repeated calls', () => {
    const css1 = getDashboardCss();
    const css2 = getDashboardCss();
    assert.equal(css1, css2, 'Should be deterministic');
  });
});
