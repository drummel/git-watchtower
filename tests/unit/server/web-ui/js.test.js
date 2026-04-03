/**
 * Tests for web dashboard JavaScript module
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getDashboardJs } = require('../../../../src/server/web-ui/js');

describe('getDashboardJs', () => {
  it('should return a non-empty string', () => {
    const js = getDashboardJs();
    assert.equal(typeof js, 'string');
    assert.ok(js.length > 0, 'JS should not be empty');
  });

  it('should be wrapped in an IIFE', () => {
    const js = getDashboardJs();
    assert.ok(js.includes('(function()'), 'Should start with IIFE');
    assert.ok(js.includes('})();'), 'Should end with IIFE invocation');
  });

  it('should use strict mode', () => {
    const js = getDashboardJs();
    assert.ok(js.includes("'use strict'"), 'Should enable strict mode');
  });

  it('should contain SSE connection logic', () => {
    const js = getDashboardJs();
    assert.ok(js.includes('EventSource'), 'Should use EventSource for SSE');
    assert.ok(js.includes('/api/events'), 'Should connect to /api/events');
    assert.ok(js.includes('function connect()'), 'Should define connect function');
  });

  it('should contain state management', () => {
    const js = getDashboardJs();
    assert.ok(js.includes('let state = null'), 'Should initialize state');
    assert.ok(js.includes('let selectedIndex = 0'), 'Should track selected branch index');
    assert.ok(js.includes('let connected = false'), 'Should track connection state');
  });

  it('should contain render functions', () => {
    const js = getDashboardJs();
    assert.ok(js.includes('function render()'), 'Should have main render function');
    assert.ok(js.includes('function renderBranches()'), 'Should have renderBranches');
    assert.ok(js.includes('function renderActivityLog()'), 'Should have renderActivityLog');
    assert.ok(js.includes('function renderSessionStats()'), 'Should have renderSessionStats');
    assert.ok(js.includes('function renderPrefsBar()'), 'Should have renderPrefsBar');
  });

  it('should contain utility functions', () => {
    const js = getDashboardJs();
    assert.ok(js.includes('function escHtml('), 'Should have escHtml utility');
    assert.ok(js.includes('function timeAgo('), 'Should have timeAgo utility');
    assert.ok(js.includes('function fmtCompact('), 'Should have fmtCompact utility');
  });

  it('should contain modal show/hide functions', () => {
    const js = getDashboardJs();
    assert.ok(js.includes('function showLogViewer()'), 'Should have showLogViewer');
    assert.ok(js.includes('function hideLogViewer()'), 'Should have hideLogViewer');
    assert.ok(js.includes('function showBranchActions()'), 'Should have showBranchActions');
    assert.ok(js.includes('function hideBranchActions()'), 'Should have hideBranchActions');
    assert.ok(js.includes('function showInfo()'), 'Should have showInfo');
    assert.ok(js.includes('function hideInfo()'), 'Should have hideInfo');
    assert.ok(js.includes('function showCleanup()'), 'Should have showCleanup');
    assert.ok(js.includes('function hideCleanup()'), 'Should have hideCleanup');
    assert.ok(js.includes('function showConfirm('), 'Should have showConfirm');
    assert.ok(js.includes('function hideConfirm()'), 'Should have hideConfirm');
  });

  it('should contain Modal helper with registry', () => {
    const js = getDashboardJs();
    assert.ok(js.includes('function Modal('), 'Should have Modal constructor');
    assert.ok(js.includes('Modal.prototype.show'), 'Should have Modal.show method');
    assert.ok(js.includes('Modal.prototype.hide'), 'Should have Modal.hide method');
    assert.ok(js.includes('_openModals'), 'Should have _openModals registry');
    assert.ok(js.includes('logViewerModal'), 'Should create logViewerModal instance');
    assert.ok(js.includes('branchActionModal'), 'Should create branchActionModal instance');
    assert.ok(js.includes('infoModal'), 'Should create infoModal instance');
    assert.ok(js.includes('stashModal'), 'Should create stashModal instance');
    assert.ok(js.includes('cleanupModal'), 'Should create cleanupModal instance');
    assert.ok(js.includes('updateModal'), 'Should create updateModal instance');
  });

  it('should contain keyboard event handling', () => {
    const js = getDashboardJs();
    assert.ok(js.includes("addEventListener('keydown'"), 'Should listen for keydown');
    assert.ok(js.includes('function moveSelection('), 'Should have moveSelection');
  });

  it('should contain action dispatch', () => {
    const js = getDashboardJs();
    assert.ok(js.includes('function sendAction('), 'Should have sendAction');
    assert.ok(js.includes('/api/action'), 'Should POST to /api/action');
  });

  it('should contain notification support', () => {
    const js = getDashboardJs();
    assert.ok(js.includes('function sendNotification('), 'Should have sendNotification');
    assert.ok(js.includes('function diffBranchesForNotifications('), 'Should have diffBranchesForNotifications');
    assert.ok(js.includes('Notification'), 'Should reference browser Notification API');
  });

  it('should contain preferences (localStorage) support', () => {
    const js = getDashboardJs();
    assert.ok(js.includes('function loadPrefs()'), 'Should have loadPrefs');
    assert.ok(js.includes('function savePrefs('), 'Should have savePrefs');
    assert.ok(js.includes('localStorage'), 'Should use localStorage');
    assert.ok(js.includes('git-watchtower-prefs'), 'Should have preferences key');
  });

  it('should contain toast and flash functions', () => {
    const js = getDashboardJs();
    assert.ok(js.includes('function showToast('), 'Should have showToast');
    assert.ok(js.includes('function showFlash('), 'Should have showFlash');
  });

  it('should contain clipboard support', () => {
    const js = getDashboardJs();
    assert.ok(js.includes('function copyToClipboard('), 'Should have copyToClipboard');
  });

  it('should contain branch display logic', () => {
    const js = getDashboardJs();
    assert.ok(js.includes('getDisplayBranches'), 'Should have getDisplayBranches');
    assert.ok(js.includes('function renderSparklineBars('), 'Should have renderSparklineBars');
  });

  it('should contain URL building helpers', () => {
    const js = getDashboardJs();
    assert.ok(js.includes('function getRepoUrl()'), 'Should have getRepoUrl');
    assert.ok(js.includes('function getBranchUrl('), 'Should have getBranchUrl');
    assert.ok(js.includes('function getCommitUrl('), 'Should have getCommitUrl');
    assert.ok(js.includes('function getPrUrl('), 'Should have getPrUrl');
  });

  it('should not contain HTML or CSS', () => {
    const js = getDashboardJs();
    assert.ok(!js.includes('<style>'), 'Should not contain style tags');
    assert.ok(!js.includes(':root {'), 'Should not contain CSS :root');
    assert.ok(!js.includes('class="header"'), 'Should not contain HTML class attributes');
  });

  it('should return the same content on repeated calls', () => {
    const js1 = getDashboardJs();
    const js2 = getDashboardJs();
    assert.equal(js1, js2, 'Should be deterministic');
  });
});
