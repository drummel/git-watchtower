/**
 * DOM-based tests for web dashboard JavaScript.
 *
 * Uses jsdom to execute the client-side JS in a simulated browser
 * environment, allowing us to test runtime behavior like SSE state
 * handling, tab switching, and per-project data isolation.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { getDashboardHtml } = require('../../../../src/server/web-ui/html');
const { getDashboardCss } = require('../../../../src/server/web-ui/css');
const { getDashboardJs } = require('../../../../src/server/web-ui/js');

/**
 * Build a minimal state object that satisfies the render path.
 */
function makeState(overrides) {
  return {
    activeProjectId: 'local-1',
    projects: [
      { id: 'local-1', name: 'Local Project', path: '/local', active: true },
      { id: 'remote-2', name: 'Remote Project', path: '/remote', active: false },
    ],
    branches: [],
    currentBranch: 'main',
    isDetachedHead: false,
    hasMergeConflict: false,
    pollingStatus: 'idle',
    isOffline: false,
    serverMode: 'none',
    serverRunning: false,
    serverCrashed: false,
    port: 4000,
    soundEnabled: false,
    projectName: 'Local Project',
    activityLog: [],
    switchHistory: [],
    serverLogBuffer: [],
    sparklineCache: {},
    branchPrStatusMap: {},
    aheadBehindCache: {},
    version: '1.0.0',
    updateAvailable: null,
    updateInProgress: false,
    noServer: false,
    clientCount: 1,
    repoWebUrl: null,
    sessionStats: { startTime: new Date().toISOString(), branchSwitches: 0, fetches: 0, pulls: 0 },
    ...overrides,
  };
}

/**
 * Create a jsdom environment with the full dashboard loaded.
 * Returns helpers for pushing SSE events, simulating XHR responses,
 * and inspecting the DOM.
 */
function createDashboardEnv() {
  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Git Watchtower</title>
<style>${getDashboardCss()}</style>
</head>
<body>
${getDashboardHtml()}
<div id="__test-ready"></div>
</body>
</html>`;

  // We need to inject mocks BEFORE the dashboard JS runs.
  // Build a setup script that installs mocks, then append the real JS.
  const mockScript = `
    window.__test_sseListeners = {};
    window.__test_xhrRequests = [];

    window.EventSource = function MockEventSource() {
      window.__test_sseListeners = {};
    };
    window.EventSource.prototype.addEventListener = function(event, fn) {
      window.__test_sseListeners[event] = fn;
    };
    window.EventSource.prototype.close = function() {};
    Object.defineProperty(window.EventSource.prototype, 'onerror', { set: function() {} });
    Object.defineProperty(window.EventSource.prototype, 'onopen', {
      set: function(fn) { window.__test_sseOnOpen = fn; }
    });

    window.__OrigXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function MockXHR() {
      this._method = null;
      this._url = null;
      this._headers = {};
      this._sent = false;
      this.status = 0;
      this.responseText = '';
      this.onload = null;
      this._respond = function(status, data) {
        this.status = status;
        this.responseText = typeof data === 'string' ? data : JSON.stringify(data);
        if (this.onload) this.onload();
      };
    };
    window.XMLHttpRequest.prototype.open = function(method, url) {
      this._method = method;
      this._url = url;
    };
    window.XMLHttpRequest.prototype.setRequestHeader = function(k, v) {
      this._headers[k] = v;
    };
    window.XMLHttpRequest.prototype.send = function(body) {
      this._body = body;
      this._sent = true;
      window.__test_xhrRequests.push(this);
    };

    window.Notification = { permission: 'denied' };
  `;

  // Combine: mocks first, then dashboard JS
  const combinedHtml = fullHtml.replace(
    '<div id="__test-ready"></div>',
    '<script>' + mockScript + ';' + getDashboardJs() + '</script>'
  );

  const dom = new JSDOM(combinedHtml, {
    url: 'http://localhost:4000',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });

  const { window } = dom;
  const { document } = window;

  // Fire onopen so the client thinks it's connected
  if (window.__test_sseOnOpen) window.__test_sseOnOpen();

  // Expose captured mocks for test helpers
  const xhrRequests = window.__test_xhrRequests;

  // ── Helpers ───────────────────────────────────────────────────

  /** Push a simulated SSE 'state' event into the client. */
  function pushSSE(stateObj) {
    const handler = window.__test_sseListeners.state;
    if (!handler) throw new Error('No SSE state listener registered');
    handler({ data: JSON.stringify(stateObj) });
  }

  /** Respond to the most recent XHR that matched a URL pattern. */
  function respondToXhr(urlPattern, status, data) {
    const xhr = [...xhrRequests].reverse().find(r => r._url.includes(urlPattern));
    if (!xhr) throw new Error('No XHR matching ' + urlPattern);
    xhr._respond(status, data);
  }

  /** Get the last XHR request matching a URL pattern. */
  function getXhr(urlPattern) {
    return [...xhrRequests].reverse().find(r => r._url.includes(urlPattern)) || null;
  }

  /** Click a tab by project ID. */
  function clickTab(projectId) {
    const tabBar = document.getElementById('tab-bar');
    const tab = tabBar.querySelector('[data-project-id="' + projectId + '"]');
    if (!tab) throw new Error('Tab not found for project: ' + projectId);
    tab.click();
  }

  /** Get all branch names currently rendered in the DOM. */
  function getRenderedBranchNames() {
    const items = document.querySelectorAll('.branch-item .branch-name');
    return Array.from(items).map(el => el.textContent.trim());
  }

  /** Get the text content of the branch list container. */
  function getBranchListText() {
    return document.getElementById('branch-list').textContent;
  }

  /** Clean up jsdom timers and resources. */
  function cleanup() {
    dom.window.close();
  }

  /** Check if a modal overlay is visible (has 'active' class). */
  function isModalOpen(overlayId) {
    const el = document.getElementById(overlayId);
    return el && el.className.includes('active');
  }

  /** Simulate pressing a key. */
  function pressKey(key) {
    const event = new window.KeyboardEvent('keydown', { key: key, bubbles: true });
    document.dispatchEvent(event);
  }

  return {
    dom,
    window,
    document,
    pushSSE,
    respondToXhr,
    getXhr,
    clickTab,
    getRenderedBranchNames,
    getBranchListText,
    isModalOpen,
    pressKey,
    xhrRequests,
    cleanup,
  };
}

// ─────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────

describe('dashboard JS — DOM behavior', () => {
  /** Create an env and register cleanup with the test context. */
  function setup(t) {
    const env = createDashboardEnv();
    t.after(() => env.cleanup());
    return env;
  }

  describe('SSE state handler with tabs', () => {
    it('should apply full state when viewing local project tab', (t) => {
      const env = setup(t);
      const localState = makeState({
        branches: [
          { name: 'main', lastCommitDate: '2025-01-01' },
          { name: 'feature-a', lastCommitDate: '2025-01-02' },
        ],
      });

      env.pushSSE(localState);

      const names = env.getRenderedBranchNames();
      assert.ok(names.includes('main'), 'Should show main branch');
      assert.ok(names.includes('feature-a'), 'Should show feature-a branch');
    });

    it('should NOT overwrite remote tab data with local SSE push', (t) => {
      const env = setup(t);

      // 1. Initial SSE push establishes local project state
      const localState = makeState({
        branches: [
          { name: 'local-main', lastCommitDate: '2025-01-01' },
        ],
        branchPrStatusMap: { 'local-main': { state: 'OPEN', number: 10 } },
      });
      env.pushSSE(localState);

      // Verify local branch is rendered
      assert.ok(env.getRenderedBranchNames().includes('local-main'));

      // 2. User switches to the remote tab
      env.clickTab('remote-2');

      // 3. Respond to the XHR that switchTab fires
      const remoteState = makeState({
        activeProjectId: 'remote-2',
        projectName: 'Remote Project',
        branches: [
          { name: 'remote-main', lastCommitDate: '2025-01-01' },
          { name: 'remote-feature', lastCommitDate: '2025-01-02' },
        ],
        branchPrStatusMap: { 'remote-main': { state: 'MERGED', number: 42 } },
      });
      env.respondToXhr('/api/projects/remote-2/state', 200, remoteState);

      // Verify remote branches are rendered
      let names = env.getRenderedBranchNames();
      assert.ok(names.includes('remote-main'), 'Should show remote-main');
      assert.ok(names.includes('remote-feature'), 'Should show remote-feature');
      assert.ok(!names.includes('local-main'), 'Should NOT show local-main');

      // 4. Another SSE push arrives (always local project data)
      const updatedLocalState = makeState({
        branches: [
          { name: 'local-main', lastCommitDate: '2025-01-01' },
          { name: 'local-new-branch', lastCommitDate: '2025-01-03' },
        ],
        branchPrStatusMap: {
          'local-main': { state: 'OPEN', number: 10 },
          'local-new-branch': { state: 'OPEN', number: 11 },
        },
      });
      env.pushSSE(updatedLocalState);

      // 5. Assert: remote tab data should be PRESERVED, not overwritten
      names = env.getRenderedBranchNames();
      assert.ok(names.includes('remote-main'), 'remote-main should still be shown');
      assert.ok(names.includes('remote-feature'), 'remote-feature should still be shown');
      assert.ok(!names.includes('local-main'), 'local-main should NOT appear on remote tab');
      assert.ok(!names.includes('local-new-branch'), 'local-new-branch should NOT appear on remote tab');
    });

    it('should still update global metadata while on a remote tab', (t) => {
      const env = setup(t);

      // Initial state
      env.pushSSE(makeState({ version: '1.0.0' }));

      // Switch to remote tab
      env.clickTab('remote-2');
      env.respondToXhr('/api/projects/remote-2/state', 200, makeState({
        activeProjectId: 'remote-2',
        branches: [{ name: 'remote-main', lastCommitDate: '2025-01-01' }],
      }));

      // SSE push with updated version — should update global fields
      env.pushSSE(makeState({
        version: '2.0.0',
        projects: [
          { id: 'local-1', name: 'Local Project', path: '/local', active: true },
          { id: 'remote-2', name: 'Remote Project', path: '/remote', active: false },
          { id: 'new-3', name: 'New Project', path: '/new', active: false },
        ],
      }));

      // Version should be updated
      const versionEl = env.document.getElementById('version');
      assert.equal(versionEl.textContent, 'v2.0.0');

      // Tab bar should reflect the updated projects list (3 tabs now)
      const tabs = env.document.querySelectorAll('.tab');
      assert.equal(tabs.length, 3, 'Should now show 3 tabs');
    });

    it('should resume full SSE updates when switching back to local tab', (t) => {
      const env = setup(t);

      // Initial state
      env.pushSSE(makeState({
        branches: [{ name: 'main', lastCommitDate: '2025-01-01' }],
      }));

      // Switch to remote tab
      env.clickTab('remote-2');
      env.respondToXhr('/api/projects/remote-2/state', 200, makeState({
        activeProjectId: 'remote-2',
        branches: [{ name: 'remote-main', lastCommitDate: '2025-01-01' }],
      }));

      // Switch back to local tab
      env.clickTab('local-1');
      env.respondToXhr('/api/projects/local-1/state', 200, makeState({
        branches: [{ name: 'main', lastCommitDate: '2025-01-01' }],
      }));

      // SSE push should now fully apply again
      env.pushSSE(makeState({
        branches: [
          { name: 'main', lastCommitDate: '2025-01-01' },
          { name: 'new-feature', lastCommitDate: '2025-01-05' },
        ],
      }));

      const names = env.getRenderedBranchNames();
      assert.ok(names.includes('main'), 'Should show main');
      assert.ok(names.includes('new-feature'), 'Should show new-feature from SSE');
    });
  });

  describe('tab switching', () => {
    it('should fetch project state when switching tabs', (t) => {
      const env = setup(t);

      env.pushSSE(makeState({
        branches: [{ name: 'main', lastCommitDate: '2025-01-01' }],
      }));

      env.clickTab('remote-2');

      const xhr = env.getXhr('/api/projects/remote-2/state');
      assert.ok(xhr, 'Should have made an XHR request for remote project state');
      assert.equal(xhr._method, 'GET');
    });

    it('should not re-fetch when clicking the already active tab', (t) => {
      const env = setup(t);

      env.pushSSE(makeState());

      const countBefore = env.xhrRequests.length;
      env.clickTab('local-1'); // Already active
      assert.equal(env.xhrRequests.length, countBefore, 'Should not make a new XHR');
    });

    it('should render the correct branches after switching', (t) => {
      const env = setup(t);

      env.pushSSE(makeState({
        branches: [{ name: 'local-branch', lastCommitDate: '2025-01-01' }],
      }));
      assert.ok(env.getRenderedBranchNames().includes('local-branch'));

      // Switch to remote
      env.clickTab('remote-2');
      env.respondToXhr('/api/projects/remote-2/state', 200, makeState({
        activeProjectId: 'remote-2',
        branches: [
          { name: 'remote-branch-1', lastCommitDate: '2025-01-01' },
          { name: 'remote-branch-2', lastCommitDate: '2025-01-02' },
        ],
      }));

      const names = env.getRenderedBranchNames();
      assert.ok(names.includes('remote-branch-1'));
      assert.ok(names.includes('remote-branch-2'));
      assert.ok(!names.includes('local-branch'), 'local branch should not be shown');
    });
  });

  describe('PR status isolation between tabs', () => {
    it('should show correct PR badges per tab', (t) => {
      const env = setup(t);

      // Local project has an open PR on main
      env.pushSSE(makeState({
        branches: [{ name: 'main', lastCommitDate: '2025-01-01' }],
        branchPrStatusMap: { main: { state: 'OPEN', number: 5 } },
      }));

      // Rendering: open PRs show "PR #N", merged PRs show "merged"
      let html = env.document.getElementById('branch-list').innerHTML;
      assert.ok(html.includes('PR #5'), 'Should show PR #5 badge');
      assert.ok(html.includes('pr-open'), 'Should have pr-open class');

      // Switch to remote — it has a MERGED PR on its main
      env.clickTab('remote-2');
      env.respondToXhr('/api/projects/remote-2/state', 200, makeState({
        activeProjectId: 'remote-2',
        branches: [{ name: 'main', lastCommitDate: '2025-01-01' }],
        branchPrStatusMap: { main: { state: 'MERGED', number: 99 } },
      }));

      html = env.document.getElementById('branch-list').innerHTML;
      assert.ok(html.includes('pr-merged'), 'Should show merged PR badge');
      assert.ok(!html.includes('PR #5'), 'Should NOT show local PR #5 on remote tab');

      // SSE push with local data should not overwrite remote PR info
      env.pushSSE(makeState({
        branches: [{ name: 'main', lastCommitDate: '2025-01-01' }],
        branchPrStatusMap: { main: { state: 'OPEN', number: 5 } },
      }));

      html = env.document.getElementById('branch-list').innerHTML;
      assert.ok(html.includes('pr-merged'),
        'Remote merged PR badge should still be shown after local SSE push');
      assert.ok(!html.includes('PR #5'),
        'Local PR #5 should NOT leak into remote tab after SSE push');
    });
  });

  describe('single project mode', () => {
    it('should not show tab bar with only one project', (t) => {
      const env = setup(t);

      env.pushSSE(makeState({
        projects: [{ id: 'only-1', name: 'Solo Project', path: '/solo', active: true }],
        branches: [{ name: 'main', lastCommitDate: '2025-01-01' }],
      }));

      const tabBar = env.document.getElementById('tab-bar');
      assert.ok(!tabBar.classList.contains('visible'), 'Tab bar should be hidden for single project');
    });

    it('should apply SSE state normally in single-project mode', (t) => {
      const env = setup(t);

      const s = makeState({
        projects: [{ id: 'local-1', name: 'Solo', path: '/solo', active: true }],
        branches: [{ name: 'main', lastCommitDate: '2025-01-01' }],
      });
      env.pushSSE(s);

      assert.ok(env.getRenderedBranchNames().includes('main'));

      // Second push with new branch
      env.pushSSE(makeState({
        projects: [{ id: 'local-1', name: 'Solo', path: '/solo', active: true }],
        branches: [
          { name: 'main', lastCommitDate: '2025-01-01' },
          { name: 'develop', lastCommitDate: '2025-01-02' },
        ],
      }));

      const names = env.getRenderedBranchNames();
      assert.ok(names.includes('main'));
      assert.ok(names.includes('develop'));
    });
  });

  describe('Modal helper', () => {
    it('should open and close the info modal via keyboard shortcut', (t) => {
      const env = setup(t);
      env.pushSSE(makeState({ branches: [] }));

      assert.ok(!env.isModalOpen('info-overlay'), 'Info modal should start closed');
      env.pressKey('i');
      assert.ok(env.isModalOpen('info-overlay'), 'Info modal should open on "i" key');
      env.pressKey('Escape');
      assert.ok(!env.isModalOpen('info-overlay'), 'Info modal should close on Escape');
    });

    it('should open and close the log viewer modal', (t) => {
      const env = setup(t);
      env.pushSSE(makeState({ branches: [] }));

      env.pressKey('l');
      assert.ok(env.isModalOpen('log-viewer-overlay'), 'Log viewer should open on "l" key');
      env.pressKey('Escape');
      assert.ok(!env.isModalOpen('log-viewer-overlay'), 'Log viewer should close on Escape');
    });

    it('should open and close the cleanup modal', (t) => {
      const env = setup(t);
      env.pushSSE(makeState({ branches: [] }));

      env.pressKey('d');
      assert.ok(env.isModalOpen('cleanup-overlay'), 'Cleanup modal should open on "d" key');
      env.pressKey('Escape');
      assert.ok(!env.isModalOpen('cleanup-overlay'), 'Cleanup modal should close on Escape');
    });

    it('should close modal when clicking the overlay background', (t) => {
      const env = setup(t);
      env.pushSSE(makeState({ branches: [] }));

      env.pressKey('i');
      assert.ok(env.isModalOpen('info-overlay'), 'Info modal should be open');

      // Click the overlay itself (not the modal box)
      const overlay = env.document.getElementById('info-overlay');
      const clickEvent = new env.window.MouseEvent('click', { bubbles: true });
      Object.defineProperty(clickEvent, 'target', { value: overlay });
      overlay.dispatchEvent(clickEvent);
      assert.ok(!env.isModalOpen('info-overlay'), 'Info modal should close on overlay click');
    });

    it('should close modal when clicking the close button', (t) => {
      const env = setup(t);
      env.pushSSE(makeState({ branches: [] }));

      env.pressKey('l');
      assert.ok(env.isModalOpen('log-viewer-overlay'), 'Log viewer should be open');

      env.document.getElementById('log-viewer-close').click();
      assert.ok(!env.isModalOpen('log-viewer-overlay'), 'Log viewer should close on close button click');
    });

    it('should block normal keys while a modal is open', (t) => {
      const env = setup(t);
      env.pushSSE(makeState({
        branches: [
          { name: 'main', lastCommitDate: '2025-01-01' },
          { name: 'feature', lastCommitDate: '2025-01-02' },
        ],
      }));

      env.pressKey('i');
      assert.ok(env.isModalOpen('info-overlay'), 'Info modal should be open');

      // Try pressing "l" to open log viewer — should be blocked
      env.pressKey('l');
      assert.ok(!env.isModalOpen('log-viewer-overlay'), 'Log viewer should NOT open while info is open');
      assert.ok(env.isModalOpen('info-overlay'), 'Info modal should still be open');
    });

    it('should track open modals via anyModalOpen logic', (t) => {
      const env = setup(t);
      env.pushSSE(makeState({ branches: [] }));

      // No modals open — the update modal auto-show check relies on anyModalOpen
      // Open info modal and verify it blocks the update modal auto-show
      env.pressKey('i');
      assert.ok(env.isModalOpen('info-overlay'), 'Info modal should be open');

      // Push state with updateAvailable — update modal should NOT auto-show
      env.pushSSE(makeState({ branches: [], updateAvailable: '2.0.0' }));
      assert.ok(!env.isModalOpen('update-overlay'), 'Update modal should NOT open while info modal is open');
    });
  });
});
