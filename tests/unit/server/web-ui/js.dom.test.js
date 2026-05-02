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

  // Combine: mocks first, then dashboard JS.
  // Use a function replacer — a string replacement would interpret `$'`,
  // `$&`, `$n` etc. as back-references, corrupting any generated JS that
  // happens to contain those byte sequences (e.g. dollar-sign followed by
  // a single quote inside a casino-stats string literal).
  const replacement = '<script>' + mockScript + ';' + getDashboardJs() + '</script>';
  const combinedHtml = fullHtml.replace(
    '<div id="__test-ready"></div>',
    () => replacement
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

    // Regression for the bug where `showCleanup` did `const html = …`
    // followed by `html = …` (full reassignment) two branches later.
    // Both branches throw TypeError: Assignment to constant variable.
    // Unlike the stash dialog the throw fires AFTER `cleanupModal.show()`,
    // so the existing isModalOpen-only test above is a false positive —
    // the overlay gets the `active` class but the function then throws
    // and the modal never advances past "Scanning for branches…".
    // This test asserts the post-open content actually rendered AND that
    // no errors were emitted on `window.onerror`.
    it('should render the empty-state cleanup content without throwing', (t) => {
      const errors = [];
      const env = setup(t);
      env.window.addEventListener('error', (e) => errors.push(e.error || e.message));
      // No branches with !hasRemote → cleanup empty state path
      env.pushSSE(makeState({
        branches: [
          { name: 'main', isLocal: true, hasRemote: true, lastCommitDate: '2025-01-01' },
        ],
        currentBranch: 'main',
      }));

      env.pressKey('d');

      assert.deepEqual(errors, [], 'showCleanup should not throw');
      assert.ok(env.isModalOpen('cleanup-overlay'), 'Cleanup modal should open');
      const content = env.document.getElementById('cleanup-content').innerHTML;
      // After showCleanup completes, the empty branch follows the
      // "no stale branches found" branch — NOT stuck on "Scanning…".
      assert.ok(
        content.includes('No stale branches found'),
        `cleanup modal should advance past "Scanning…" to the empty-state copy; got: ${content.slice(0, 200)}`
      );
      assert.ok(
        env.document.getElementById('cleanup-done'),
        'OK button should be wired up in the empty state'
      );
    });

    it('should render the populated cleanup content with delete buttons', (t) => {
      const errors = [];
      const env = setup(t);
      env.window.addEventListener('error', (e) => errors.push(e.error || e.message));
      // One stale local branch (isLocal && !hasRemote && != current)
      env.pushSSE(makeState({
        branches: [
          { name: 'main', isLocal: true, hasRemote: true, lastCommitDate: '2025-01-01' },
          { name: 'feature/old', isLocal: true, hasRemote: false, lastCommitDate: '2025-01-02' },
        ],
        currentBranch: 'main',
      }));

      env.pressKey('d');

      assert.deepEqual(errors, [], 'showCleanup should not throw');
      assert.ok(env.isModalOpen('cleanup-overlay'), 'Cleanup modal should open');
      const content = env.document.getElementById('cleanup-content').innerHTML;
      assert.ok(
        content.includes('feature/old'),
        `cleanup modal should list the stale branch; got: ${content.slice(0, 300)}`
      );
      assert.ok(
        env.document.getElementById('cleanup-safe'),
        'Safe Delete button should be rendered'
      );
      assert.ok(
        env.document.getElementById('cleanup-force'),
        'Force Delete button should be rendered'
      );

      // Click Safe Delete — fires a deleteBranches POST.
      env.document.getElementById('cleanup-safe').click();
      const xhr = env.getXhr('/api/action');
      assert.ok(xhr, 'Safe Delete should POST to /api/action');
      const body = JSON.parse(xhr._body);
      assert.equal(body.action, 'deleteBranches');
      assert.deepEqual(body.payload.branches, ['feature/old']);
      assert.equal(body.payload.force, false);
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

    // Regression for the bug where `showStashDialog` did `const html = …`
    // followed by `html += …`, which throws TypeError: Assignment to
    // constant variable. The throw fired BEFORE `stashModal.show()`, so
    // the modal never opened and pressing 'S' silently did nothing.
    // Asserting only `isModalOpen` would not catch this — the existing
    // cleanup test gives a false positive because the throw happens
    // AFTER show(). Always assert the modal also rendered its content
    // and wired up its action buttons.
    it('should open the stash dialog with rendered content and working buttons', (t) => {
      const errors = [];
      const env = setup(t);
      env.window.addEventListener('error', (e) => errors.push(e.error || e.message));
      env.pushSSE(makeState({ branches: [] }));

      env.pressKey('S');

      assert.deepEqual(errors, [], 'showStashDialog should not throw');
      assert.ok(env.isModalOpen('stash-overlay'), 'Stash modal should open on S');
      const content = env.document.getElementById('stash-content');
      assert.ok(
        content.innerHTML.includes('Stash all uncommitted changes'),
        'modal body should render the stash prompt'
      );
      assert.ok(
        env.document.getElementById('stash-cancel'),
        'Cancel button should be rendered'
      );
      const confirmBtn = env.document.getElementById('stash-confirm');
      assert.ok(confirmBtn, 'Confirm button should be rendered');

      // Click Confirm — should fire a `stash` action POST.
      const xhrCountBefore = env.xhrRequests.length;
      confirmBtn.click();
      const stashXhr = env.getXhr('/api/action');
      assert.ok(stashXhr, 'Confirm click should POST to /api/action');
      const body = JSON.parse(stashXhr._body);
      assert.equal(body.action, 'stash', 'POST body should target the stash action');
      assert.ok(env.xhrRequests.length > xhrCountBefore, 'should have fired a fresh XHR');

      // Modal should close after confirm.
      assert.ok(!env.isModalOpen('stash-overlay'), 'modal should close after Confirm');
    });
  });

  describe('KEY_MAP dispatch', () => {
    it('should navigate branches with j/k keys', (t) => {
      const env = setup(t);
      env.pushSSE(makeState({
        branches: [
          { name: 'alpha', lastCommitDate: '2025-01-01' },
          { name: 'beta', lastCommitDate: '2025-01-02' },
          { name: 'gamma', lastCommitDate: '2025-01-03' },
        ],
      }));

      // Initially first branch is selected
      let selected = env.document.querySelector('.branch-item.selected .branch-name');
      assert.ok(selected, 'A branch should be selected');
      assert.equal(selected.textContent.trim(), 'alpha');

      // Press j to move down
      env.pressKey('j');
      selected = env.document.querySelector('.branch-item.selected .branch-name');
      assert.equal(selected.textContent.trim(), 'beta', 'j should move selection down');

      // Press k to move back up
      env.pressKey('k');
      selected = env.document.querySelector('.branch-item.selected .branch-name');
      assert.equal(selected.textContent.trim(), 'alpha', 'k should move selection up');
    });

    it('should open search with / key', (t) => {
      const env = setup(t);
      env.pushSSE(makeState({ branches: [] }));

      const searchBar = env.document.getElementById('search-bar');
      assert.ok(!searchBar.className.includes('active'), 'Search should start inactive');

      env.pressKey('/');
      assert.ok(searchBar.className.includes('active'), '/ should activate search bar');
    });

    it('should open modals via their shortcut keys', (t) => {
      const env = setup(t);
      env.pushSSE(makeState({ branches: [] }));

      const shortcuts = [
        { key: 'i', overlay: 'info-overlay' },
        { key: 'l', overlay: 'log-viewer-overlay' },
        { key: 'd', overlay: 'cleanup-overlay' },
      ];

      for (const { key, overlay } of shortcuts) {
        env.pressKey(key);
        assert.ok(env.isModalOpen(overlay), key + ' should open ' + overlay);
        env.pressKey('Escape');
        assert.ok(!env.isModalOpen(overlay), 'Escape should close ' + overlay);
      }
    });
  });

  describe('Casino mode', () => {
    it('should not have casino-active class when state.casinoModeEnabled is false', (t) => {
      const env = setup(t);
      env.pushSSE(makeState({ casinoModeEnabled: false }));
      assert.ok(
        !env.document.body.classList.contains('casino-active'),
        'body should not be casino-active by default'
      );
    });

    it('should add casino-active class to body when state.casinoModeEnabled flips on', (t) => {
      const env = setup(t);
      env.pushSSE(makeState({ casinoModeEnabled: false }));
      env.pushSSE(makeState({ casinoModeEnabled: true, casinoStats: stubCasinoStats() }));
      assert.ok(
        env.document.body.classList.contains('casino-active'),
        'body should pick up casino-active when state flips on'
      );
    });

    it('should remove casino-active class when state.casinoModeEnabled flips off', (t) => {
      const env = setup(t);
      env.pushSSE(makeState({ casinoModeEnabled: true, casinoStats: stubCasinoStats() }));
      env.pushSSE(makeState({ casinoModeEnabled: false }));
      assert.ok(
        !env.document.body.classList.contains('casino-active'),
        'body should drop casino-active when state flips off'
      );
    });

    it('should POST a toggleCasino action when c is pressed', (t) => {
      const env = setup(t);
      env.pushSSE(makeState({}));

      env.pressKey('c');

      const xhr = env.getXhr('/api/action');
      assert.ok(xhr, 'pressing c should fire an action POST');
      const body = JSON.parse(xhr._body);
      assert.equal(body.action, 'toggleCasino');
    });

    it('should fill the dashboard-stats bar with casino numbers when casino is on', (t) => {
      const env = setup(t);
      env.pushSSE(makeState({
        casinoModeEnabled: true,
        casinoStats: stubCasinoStats({
          totalLinesAdded: 42,
          totalLinesDeleted: 7,
          totalLines: 49,
          totalPolls: 5,
          netWinnings: 44,
          houseEdge: 73,
          luckMeter: 88,
          dopamineHits: 12,
          sessionDuration: '3m',
          vibesQuality: '\u{1f680}',
          consecutivePolls: 0,
        }),
      }));

      const bar = env.document.getElementById('dashboard-stats');
      assert.ok(bar.className.includes('casino-mode'), 'bar should re-skin to casino-mode');
      const text = bar.textContent;
      assert.ok(text.includes('+42'), 'should show lines added');
      assert.ok(text.includes('-7'), 'should show lines deleted');
      assert.ok(text.includes('$49'), 'should show total lines as dollars');
      assert.ok(text.includes('$5'), 'should show poll cost');
      assert.ok(text.includes('+$44'), 'should show net winnings with sign');
      assert.ok(text.includes('73%'), 'should show house edge');
      assert.ok(text.includes('88%'), 'should show luck meter');
      assert.ok(text.includes('12'), 'should show dopamine hits');
    });

    it('should fall back to plain session stats when casino is off', (t) => {
      const env = setup(t);
      env.pushSSE(makeState({
        casinoModeEnabled: true,
        casinoStats: stubCasinoStats(),
      }));
      env.pushSSE(makeState({ casinoModeEnabled: false, casinoStats: null }));

      const bar = env.document.getElementById('dashboard-stats');
      assert.ok(!bar.className.includes('casino-mode'), 'bar should drop casino-mode skin');
      assert.ok(bar.textContent.includes('Session'), 'bar should show plain Session stats');
    });

    it('should anchor the bar with a Session Stats title in default mode', (t) => {
      const env = setup(t);
      env.pushSSE(makeState({ casinoModeEnabled: false }));

      const bar = env.document.getElementById('dashboard-stats');
      const title = bar.querySelector('.stats-title');
      assert.ok(title, 'should have a .stats-title pill');
      assert.ok(title.textContent.includes('Session Stats'), 'title should label the bar');
    });

    it('should switch the title to Casino Stats when casino is on', (t) => {
      const env = setup(t);
      env.pushSSE(makeState({ casinoModeEnabled: true, casinoStats: stubCasinoStats() }));

      const title = env.document.querySelector('#dashboard-stats .stats-title');
      assert.ok(title, 'should still have a title in casino mode');
      assert.ok(title.textContent.includes('Casino Stats'), 'title should label the bar in casino mode');
    });

    it('should split the bar into a left identity group and a right readouts group', (t) => {
      const env = setup(t);
      env.pushSSE(makeState({ casinoModeEnabled: false }));

      const groups = env.document.querySelectorAll('#dashboard-stats .stats-group');
      assert.equal(groups.length, 2, 'should render exactly two groups (left identity, right readouts)');
      // Left group must include the title; right group must not.
      assert.ok(groups[0].querySelector('.stats-title'), 'left group hosts the title');
      assert.ok(!groups[1].querySelector('.stats-title'), 'right group is title-free');
    });

    it('should swap the header icon between castle and slot machine', (t) => {
      const env = setup(t);
      const icon = env.document.getElementById('header-icon');

      env.pushSSE(makeState({ casinoModeEnabled: false }));
      assert.ok(icon.textContent.includes('\u{1f3f0}'), 'castle when off');

      env.pushSSE(makeState({ casinoModeEnabled: true, casinoStats: stubCasinoStats() }));
      assert.ok(icon.textContent.includes('\u{1f3b0}'), 'slot machine when on');

      env.pushSSE(makeState({ casinoModeEnabled: false }));
      assert.ok(icon.textContent.includes('\u{1f3f0}'), 'castle restored when off again');
    });

    it('should activate slot reels when polling status flips to fetching', (t) => {
      const env = setup(t);
      env.pushSSE(makeState({ casinoModeEnabled: true, casinoStats: stubCasinoStats(), pollingStatus: 'idle' }));
      env.pushSSE(makeState({ casinoModeEnabled: true, casinoStats: stubCasinoStats(), pollingStatus: 'fetching' }));

      const reels = env.document.getElementById('casino-reels');
      assert.ok(reels.className.includes('spinning'), 'reels should be spinning');
    });

    it('should not start spinning if casino mode is off', (t) => {
      const env = setup(t);
      env.pushSSE(makeState({ casinoModeEnabled: false, pollingStatus: 'idle' }));
      env.pushSSE(makeState({ casinoModeEnabled: false, pollingStatus: 'fetching' }));

      const reels = env.document.getElementById('casino-reels');
      assert.ok(!reels.className.includes('spinning'), 'reels should not spin when mode is off');
    });

    it('should render the four marquee edge strips when casino is on', (t) => {
      const env = setup(t);
      env.pushSSE(makeState({ casinoModeEnabled: true, casinoStats: stubCasinoStats() }));

      const edges = env.document.querySelectorAll('.casino-edge');
      assert.equal(edges.length, 4, 'should have top/bottom/left/right strips');
      const sides = Array.from(edges).map((e) => e.className.replace('casino-edge', '').trim()).sort();
      assert.deepEqual(sides, ['bottom', 'left', 'right', 'top']);
    });

    // Regression for the bug that hid casino mode in production: the SSE
    // handler wraps render() in try/catch, and renderActivityLog /
    // renderSessionStats both used `const` where a loop reassigned them,
    // so any state push with branches OR an activity log threw a
    // TypeError before reconcileCasinoMode ran. Casino-active never made
    // it onto the body and nothing visible appeared. Lock down that
    // realistic state still gets the body class.
    it('should still apply casino-active when state has branches and activity log', (t) => {
      const env = setup(t);
      env.pushSSE(makeState({
        casinoModeEnabled: true,
        casinoStats: stubCasinoStats(),
        branches: [
          { name: 'main', commit: 'abc1234', subject: 'Initial commit', date: new Date().toISOString(), isLocal: true, hasRemote: true },
          { name: 'feature-x', commit: 'def5678', subject: 'Add feature', date: new Date().toISOString(), isLocal: true, hasRemote: true, justUpdated: true },
        ],
        currentBranch: 'main',
        activityLog: [
          { message: 'Watchtower started', type: 'info', timestamp: new Date().toISOString() },
          { message: 'Branch updated', type: 'success', timestamp: new Date().toISOString() },
        ],
      }));

      assert.ok(
        env.document.body.classList.contains('casino-active'),
        'casino-active must apply even when render() touches branches+log code paths'
      );
    });
  });
});

/**
 * Realistic-shaped casinoStats stub matching what casino.getStats() returns.
 * Lets tests override individual fields without restating the whole payload.
 */
function stubCasinoStats(overrides) {
  return Object.assign({
    totalLinesAdded: 0,
    totalLinesDeleted: 0,
    totalLines: 0,
    totalPolls: 0,
    pollsWithUpdates: 0,
    bigWins: 0,
    jackpots: 0,
    megaJackpots: 0,
    consecutivePolls: 0,
    nearMisses: 0,
    sessionStart: Date.now(),
    lastHitTime: null,
    sessionDuration: '0m',
    hitRate: 0,
    timeSinceLastHit: 'Never',
    luckMeter: 50,
    houseEdge: 70,
    vibesQuality: '\u{1f60e}',
    dopamineHits: 0,
    netWinnings: 0,
  }, overrides || {});
}
