/**
 * Client-side JavaScript for the Git Watchtower web dashboard.
 * Contains all interactive behavior: SSE connection, rendering, keyboard
 * navigation, modals, notifications, and preferences.
 *
 * Pure utility functions (escHtml, timeAgo, etc.) live in pure.js and are
 * inlined here at assembly time so they can be unit-tested in Node.
 * @module server/web-ui/js
 */

const pureFns = require('./pure');

/**
 * Serialize pure functions into a block of JS source that can be embedded
 * in a browser <script>.  Each function is emitted verbatim using
 * Function.prototype.toString().
 * @returns {string}
 */
function inlinePureFunctions() {
  return Object.entries(pureFns)
    .map(([name, fn]) => `  var ${name} = ${fn.toString()};`)
    .join('\n\n');
}

/**
 * Get the dashboard client-side JavaScript.
 * @returns {string} JavaScript content (without script tags)
 */
function getDashboardJs() {
  const pureFnBlock = inlinePureFunctions();
  return `
(function() {
  'use strict';

  // ── State ──────────────────────────────────────────────────────
  let state = null;  // server-pushed state (branches, config, etc.)

  // Client-side UI state — consolidated into a single object for
  // easier debugging (inspect ui in console) and clearer separation
  // from the server-pushed 'state' above.
  const ui = {
    prevBranches: null,
    selectedIndex: 0,
    searchMode: false,
    searchQuery: '',
    confirmMode: false,
    confirmCallback: null,
    connected: false,
    flashTimer: null,
    activeTabId: null,
    logViewerMode: false,
    logViewerTab: 'server',
    branchActionMode: false,
    infoMode: false,
    cleanupMode: false,
    updateMode: false,
    stashMode: false,
    pendingStashBranch: null,
    updateNotificationShown: false,
    remoteTabPollTimer: null,
  };

  // ── Persistent Preferences (localStorage) ─────────────────────
  const PREFS_KEY = 'git-watchtower-prefs';
  function loadPrefs() {
    try {
      return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
    } catch (e) { /* localStorage unavailable (private mode) or stored JSON got corrupted — fall back to defaults */ return {}; }
  }
  function savePrefs(updates) {
    const prefs = loadPrefs();
    Object.keys(updates).forEach((k) => { prefs[k] = updates[k]; });
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* localStorage quota exceeded or disabled (private mode) — prefs are best-effort */ }
    return prefs;
  }
  const prefs = loadPrefs();
  let sidebarCollapsed = prefs.sidebarCollapsed || false;
  let sortOrder = prefs.sortOrder || 'default';
  let pinnedBranches = prefs.pinnedBranches || [];

  // Apply initial sidebar state
  {
    const layout = document.querySelector('.layout');
    if (sidebarCollapsed) layout.classList.add('sidebar-collapsed');
  }

  // ── Browser Notifications ─────────────────────────────────────
  let notifPermission = typeof Notification !== 'undefined' ? Notification.permission : 'denied';

  function updateNotifButton() {
    const btn = document.getElementById('notif-btn');
    if (notifPermission === 'granted') {
      btn.className = 'notif-btn granted';
      btn.textContent = 'notifs on';
    } else if (notifPermission === 'denied') {
      btn.className = 'notif-btn denied';
      btn.textContent = 'notifs blocked';
    } else {
      btn.className = 'notif-btn';
      btn.textContent = 'notifications';
    }
  }
  updateNotifButton();

  document.getElementById('notif-btn').addEventListener('click', () => {
    if (notifPermission === 'granted' || notifPermission === 'denied') return;
    if (typeof Notification === 'undefined') {
      showToast('Notifications not supported in this browser', 'warning');
      return;
    }
    Notification.requestPermission().then((perm) => {
      notifPermission = perm;
      updateNotifButton();
      if (perm === 'granted') {
        showToast('Desktop notifications enabled', 'success');
      }
    });
  });

  function sendNotification(title, body, tag) {
    if (notifPermission !== 'granted') return;
    try {
      const n = new Notification(title, { body, tag: tag || 'git-watchtower', icon: '', silent: false });
      setTimeout(() => n.close(), 8000);
    } catch (e) { /* Notification constructor can throw on some browsers (e.g. permission revoked mid-session) */ }
  }

  function diffBranchesForNotifications(oldBranches, newBranches) {
    if (!oldBranches || !newBranches) return;
    const oldMap = {};
    for (const ob of oldBranches) {
      oldMap[ob.name] = ob;
    }
    for (const nb of newBranches) {
      const ob = oldMap[nb.name];
      if (!ob && nb.isNew) {
        sendNotification('New Branch', nb.name + ' was created', 'new-' + nb.name);
      } else if (ob && !ob.justUpdated && nb.justUpdated) {
        sendNotification('Branch Updated', nb.name + ' has new commits', 'update-' + nb.name);
      }
    }
    // Check PR state changes
    if (state && state.branchPrStatusMap) {
      for (const [bn, pr] of Object.entries(state.branchPrStatusMap)) {
        if (pr && pr.state === 'MERGED' && oldMap[bn]) {
          sendNotification('PR Merged', 'PR #' + pr.number + ' for ' + bn + ' was merged', 'merged-' + bn);
        }
      }
    }
  }

  // ── Clipboard Helper ──────────────────────────────────────────
  function copyToClipboard(text, btnEl) {
    navigator.clipboard.writeText(text).then(() => {
      if (btnEl) {
        btnEl.classList.add('copied');
        btnEl.innerHTML = '&#x2713;';
        setTimeout(() => {
          btnEl.classList.remove('copied');
          btnEl.innerHTML = '&#x1f4cb;';
        }, 1500);
      }
      showToast('Copied: ' + text, 'success');
    }).catch(() => {
      showToast('Failed to copy', 'error');
    });
  }

  // ── URL Building Helpers ──────────────────────────────────────
  function getRepoUrl() {
    return (state && state.repoWebUrl) ? state.repoWebUrl.replace(/\\/tree\\/.*$/, '') : null;
  }
  function getBranchUrl(branchName) {
    const base = getRepoUrl();
    if (!base) return null;
    return base + '/tree/' + encodeURIComponent(branchName);
  }
  function getCommitUrl(hash) {
    const base = getRepoUrl();
    if (!base || !hash) return null;
    return base + '/commit/' + hash;
  }
  function getPrUrl(prNumber) {
    const base = getRepoUrl();
    if (!base || !prNumber) return null;
    if (base.indexOf('gitlab') !== -1) {
      return base + '/-/merge_requests/' + prNumber;
    }
    return base + '/pull/' + prNumber;
  }

  // ── SSE Connection ─────────────────────────────────────────────
  let evtSource = null;

  function connect() {
    if (evtSource) { evtSource.close(); }
    evtSource = new EventSource('/api/events');

    evtSource.onopen = () => {
      ui.connected = true;
      updateConnectionStatus();
    };

    evtSource.addEventListener('state', (e) => {
      try {
        const newState = JSON.parse(e.data);
        if (!ui.activeTabId && newState.activeProjectId) {
          ui.activeTabId = newState.activeProjectId;
        }
        // SSE always pushes the local project's state.  When the user
        // is viewing a different tab we must NOT overwrite the per-project
        // data (branches, PRs, activity, etc.) — only update global
        // metadata so the tab bar, connection status, and version info
        // stay current.
        const viewingLocalProject = !ui.activeTabId || ui.activeTabId === newState.activeProjectId;
        if (viewingLocalProject) {
          if (state && state.branches) {
            diffBranchesForNotifications(state.branches, newState.branches || []);
          }
          ui.prevBranches = state ? state.branches : null;
          state = newState;
        } else {
          if (state) {
            state.projects = newState.projects;
            state.version = newState.version;
            state.updateAvailable = newState.updateAvailable;
            state.updateInProgress = newState.updateInProgress;
            state.clientCount = newState.clientCount;
          } else {
            state = newState;
          }
        }
        renderTabs();
        render();
      } catch (err) { /* malformed SSE state frame — skip this push, next one will re-render */ }
    });

    evtSource.addEventListener('flash', (e) => {
      try {
        const data = JSON.parse(e.data);
        showFlash(data.text, data.type);
      } catch (err) { /* malformed flash payload — not worth surfacing, skip */ }
    });

    evtSource.addEventListener('actionResult', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (!data.success && data.message && data.message.indexOf('uncommitted') !== -1) {
          ui.pendingStashBranch = data.branch || null;
          showErrorToastWithHint(data.message, 'Press S to stash');
        } else {
          showToast(data.message, data.success ? 'success' : 'error');
        }
      } catch (err) { /* malformed actionResult payload — skip (the action already ran server-side) */ }
    });

    evtSource.onerror = () => {
      ui.connected = false;
      updateConnectionStatus();
    };
  }

  function updateConnectionStatus() {
    const dot = document.getElementById('connection-dot');
    const badge = document.getElementById('status-badge');
    if (ui.connected) {
      dot.className = 'connection-dot ui.connected';
      badge.className = 'badge badge-online';
      badge.textContent = 'live';
    } else {
      dot.className = 'connection-dot disconnected';
      badge.className = 'badge badge-offline';
      badge.textContent = 'reconnecting';
    }
  }

  // ── Actions ────────────────────────────────────────────────────
  function sendAction(action, payload) {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/action');
    xhr.setRequestHeader('Content-Type', 'application/json');
    const data = { action, payload: payload || {} };
    if (ui.activeTabId) data.projectId = ui.activeTabId;
    xhr.send(JSON.stringify(data));
  }

  // ── Flash Messages ─────────────────────────────────────────────
  function showFlash(text, type) {
    const el = document.getElementById('flash');
    el.textContent = text;
    el.className = 'flash visible ' + (type || 'info');
    clearTimeout(ui.flashTimer);
    ui.flashTimer = setTimeout(() => { el.className = 'flash'; }, 3000);
  }

  // ── Toast Notifications ────────────────────────────────────────
  function showToast(text, type) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const icons = { success: '\\u2713', error: '\\u2717', info: '\\u2139', warning: '\\u26a0' };
    toast.className = 'toast ' + (type || 'info');
    toast.innerHTML = '<span class="toast-icon">' + (icons[type] || icons.info) + '</span>' + escHtml(text);
    container.appendChild(toast);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('visible'));
    });
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    }, 4000);
  }

  // ── Modal Helper ───────────────────────────────────────────────
  // Reusable helper that manages show/hide, overlay-click-to-close,
  // close-button click, and Escape key for standard modal overlays.
  const _openModals = [];

  function Modal(overlayId, closeId) {
    this.overlay = document.getElementById(overlayId);
    this.isOpen = false;
    this.onHide = null;
    if (closeId) {
      const closeBtn = document.getElementById(closeId);
      if (closeBtn) closeBtn.addEventListener('click', () => this.hide());
    }
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.hide();
    });
  }

  Modal.prototype.show = function() {
    this.isOpen = true;
    this.overlay.className = 'modal-overlay active';
    if (_openModals.indexOf(this) === -1) _openModals.push(this);
  };

  Modal.prototype.hide = function() {
    this.isOpen = false;
    this.overlay.className = 'modal-overlay';
    const idx = _openModals.indexOf(this);
    if (idx !== -1) _openModals.splice(idx, 1);
    if (this.onHide) this.onHide();
  };

  function anyModalOpen() {
    return _openModals.length > 0 || ui.confirmMode;
  }

  // Create modal instances
  const logViewerModal   = new Modal('log-viewer-overlay', 'log-viewer-close');
  const branchActionModal = new Modal('branch-action-overlay', 'branch-action-close');
  const infoModal        = new Modal('info-overlay', 'info-close');
  const stashModal       = new Modal('stash-overlay', 'stash-close');
  const cleanupModal     = new Modal('cleanup-overlay', 'cleanup-close');
  const updateModal      = new Modal('update-overlay', 'update-close');

  // Per-modal hide callbacks for state cleanup
  logViewerModal.onHide = () => { ui.logViewerMode = false; };
  branchActionModal.onHide = () => { ui.branchActionMode = false; };
  infoModal.onHide = () => { ui.infoMode = false; };
  stashModal.onHide = () => { ui.stashMode = false; ui.pendingStashBranch = null; };
  cleanupModal.onHide = () => { ui.cleanupMode = false; };
  updateModal.onHide = () => { ui.updateMode = false; };

  // ── Confirm Dialog ─────────────────────────────────────────────
  function showConfirm(title, message, onConfirm, opts) {
    opts = opts || {};
    ui.confirmMode = true;
    ui.confirmCallback = onConfirm;
    const box = document.getElementById('confirm-box');
    box.innerHTML =
      '<div class="confirm-title">' + escHtml(title) + '</div>' +
      '<div class="confirm-message">' + escHtml(message) + '</div>' +
      '<div class="confirm-actions">' +
        '<button class="confirm-btn" id="confirm-cancel">Cancel</button>' +
        '<button class="confirm-btn ' + (opts.danger ? 'danger' : 'primary') + '" id="confirm-ok">' +
          escHtml(opts.label || 'Confirm') +
        '</button>' +
      '</div>';
    document.getElementById('confirm-overlay').className = 'confirm-overlay active';
    document.getElementById('confirm-cancel').onclick = hideConfirm;
    document.getElementById('confirm-ok').onclick = () => {
      hideConfirm();
      if (ui.confirmCallback) ui.confirmCallback();
    };
  }

  function hideConfirm() {
    ui.confirmMode = false;
    ui.confirmCallback = null;
    document.getElementById('confirm-overlay').className = 'confirm-overlay';
  }

  // ── Tabs ───────────────────────────────────────────────────────
  function renderTabs() {
    const tabBar = document.getElementById('tab-bar');
    const projects = (state && state.projects) || [];
    if (projects.length <= 1) {
      tabBar.className = 'tab-bar';
      return;
    }
    tabBar.className = 'tab-bar visible';
    document.querySelector('.layout').style.height = 'calc(100vh - 49px - 40px)';
    let html = '';
    for (let i = 0; i < projects.length; i++) {
      const p = projects[i];
      const isActive = p.id === ui.activeTabId;
      html += '<div class="tab' + (isActive ? ' active' : '') + '" data-project-id="' + escHtml(p.id) + '">';
      html += '<span class="tab-dot"></span>';
      html += escHtml(p.name);
      if (i < 9) html += '<span class="tab-number">' + (i + 1) + '</span>';
      html += '</div>';
    }
    tabBar.innerHTML = html;
  }

  function fetchAndApplyProjectState(projectId) {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/projects/' + projectId + '/state');
    xhr.onload = () => {
      if (xhr.status === 200 && ui.activeTabId === projectId) {
        try {
          const pState = JSON.parse(xhr.responseText);
          state.branches = pState.branches || [];
          state.currentBranch = pState.currentBranch;
          state.activityLog = pState.activityLog || [];
          state.switchHistory = pState.switchHistory || [];
          state.sparklineCache = pState.sparklineCache || {};
          state.branchPrStatusMap = pState.branchPrStatusMap || {};
          state.aheadBehindCache = pState.aheadBehindCache || {};
          state.projectName = pState.projectName || '';
          state.pollingStatus = pState.pollingStatus || 'idle';
          state.isOffline = pState.isOffline || false;
          state.serverMode = pState.serverMode || 'none';
          state.repoWebUrl = pState.repoWebUrl || null;
          render();
        } catch (err) { /* malformed per-project state response — keep current view until the next poll */ }
      }
    };
    xhr.send();
  }

  function switchTab(projectId) {
    if (projectId === ui.activeTabId) return;
    ui.activeTabId = projectId;
    ui.selectedIndex = 0;
    ui.searchQuery = '';
    ui.searchMode = false;
    document.getElementById('search-bar').className = 'search-bar';
    document.getElementById('search-input').value = '';
    renderTabs();
    fetchAndApplyProjectState(projectId);

    clearInterval(ui.remoteTabPollTimer);
    ui.remoteTabPollTimer = null;
    if (state && projectId !== state.activeProjectId) {
      ui.remoteTabPollTimer = setInterval(() => {
        fetchAndApplyProjectState(projectId);
      }, 2000);
    }
  }

  // ── Pure Utility Functions (inlined from pure.js) ──────────────
${pureFnBlock}

  // ── Get Display Branches (wrapper) ─────────────────────────────
  // The pure getDisplayBranches is inlined above as a var assignment.
  // Wrap it to pass closure state as args, keeping the same call-site API.
  const _pureGetDisplayBranches = getDisplayBranches;
  getDisplayBranches = function() {
    if (!state || !state.branches) return [];
    return _pureGetDisplayBranches(state.branches, {
      searchQuery: ui.searchQuery,
      pinnedBranches: pinnedBranches,
      sortOrder: sortOrder,
    });
  };

  // ── Render ─────────────────────────────────────────────────────
  function render() {
    if (!state) return;

    // Header — hide project name pill when tabs are showing it
    const projectEl = document.getElementById('project-name');
    const hasTabs = state.projects && state.projects.length > 1;
    if (hasTabs) {
      projectEl.style.display = 'none';
    } else {
      projectEl.style.display = '';
      projectEl.textContent = state.projectName || '-';
    }
    const versionEl = document.getElementById('version');
    if (state.version) versionEl.textContent = 'v' + state.version;

    // Status badge
    if (ui.connected) {
      const badge = document.getElementById('status-badge');
      if (state.isOffline) {
        badge.className = 'badge badge-offline';
        badge.textContent = 'offline';
      } else if (state.pollingStatus === 'fetching') {
        badge.className = 'badge badge-fetching';
        badge.textContent = 'fetching';
      } else {
        badge.className = 'badge badge-online';
        badge.textContent = 'live';
      }
    }

    renderBranches();
    renderActivityLog();
    renderSessionStats();
    renderPrefsBar();

    // Auto-show update notification (once per session)
    if (state.updateAvailable && !ui.updateNotificationShown && !anyModalOpen()) {
      ui.updateNotificationShown = true;
      showUpdateModal();
    }

    // Update log viewer if open
    if (ui.logViewerMode) renderLogViewer();
  }

  function renderBranches() {
    const container = document.getElementById('branch-list');
    const branches = getDisplayBranches();
    const countEl = document.getElementById('branch-count');
    countEl.textContent = branches.length;

    if (ui.selectedIndex >= branches.length) {
      ui.selectedIndex = Math.max(0, branches.length - 1);
    }

    if (branches.length === 0) {
      container.innerHTML = '<div class="empty-state">' +
        '<div class="empty-state-icon">&#x1f33f;</div>' +
        (ui.searchQuery ? 'No branches matching "' + escHtml(ui.searchQuery) + '"' : 'No branches found') +
        '</div>';
      return;
    }

    let html = '';
    for (let i = 0; i < branches.length; i++) {
      const b = branches[i];
      const isSelected = i === ui.selectedIndex;
      const isCurrent = b.name === state.currentBranch;

      // Sparkline
      const sparkStr = state.sparklineCache ? state.sparklineCache[b.name] : null;

      // PR status
      const prStatus = state.branchPrStatusMap ? state.branchPrStatusMap[b.name] : null;
      const isMerged = prStatus && prStatus.state === 'MERGED';

      // Ahead/behind
      const ab = state.aheadBehindCache ? state.aheadBehindCache[b.name] : null;

      let itemClasses = 'branch-item';
      if (isSelected) itemClasses += ' selected';
      if (isCurrent) itemClasses += ' current';
      if (isMerged) itemClasses += ' merged';

      html += '<div class="' + itemClasses + '" data-index="' + i + '">';
      if (isCurrent) {
        html += '<span class="branch-current-icon">&#x25cf;</span>';
      }
      html += '<span class="branch-cursor">&#x25b6;</span>';
      html += '<div class="branch-info">';
      html += '<div class="branch-name-row">';
      // Branch name - clickable link to GitHub/GitLab
      const branchUrl = getBranchUrl(b.name);
      const isPinned = pinnedBranches.indexOf(b.name) !== -1;
      html += '<span class="branch-name">';
      if (branchUrl) {
        html += '<a href="' + escHtml(branchUrl) + '" target="_blank" rel="noopener" title="Open on web" onclick="event.stopPropagation()">' + escHtml(b.name) + '</a>';
      } else {
        html += escHtml(b.name);
      }
      html += '</span>';
      // Copy branch name button
      html += '<button class="copy-btn" data-copy="' + escHtml(b.name) + '" title="Copy branch name" onclick="event.stopPropagation()">&#x1f4cb;</button>';
      html += '</div>'; // branch-name-row

      html += '<div class="branch-meta">';
      // Commit hash - clickable link
      const commitUrl = getCommitUrl(b.commit);
      html += '<span class="branch-commit">';
      if (commitUrl) {
        html += '<a href="' + escHtml(commitUrl) + '" target="_blank" rel="noopener" title="View commit" onclick="event.stopPropagation()">' + escHtml(b.commit || '') + '</a>';
      } else {
        html += escHtml(b.commit || '');
      }
      html += '</span>';
      // Copy commit hash
      if (b.commit) {
        html += '<button class="copy-btn" data-copy="' + escHtml(b.commit) + '" title="Copy commit hash" onclick="event.stopPropagation()">&#x1f4cb;</button>';
      }
      html += '<span class="branch-subject">' + escHtml(b.subject || '') + '</span>';
      html += '</div>'; // branch-meta
      html += '</div>'; // branch-info

      html += '<div class="branch-right">';
      // Badges
      let badges = '';
      if (isCurrent) badges += '<span class="branch-current-badge">HEAD</span>';
      if (isPinned) badges += '<span class="branch-new-badge" style="color:var(--orange);background:rgba(219,109,40,0.15)">pinned</span>';
      if (b.isNew) badges += '<span class="branch-new-badge">new</span>';
      if (b.isDeleted) badges += '<span class="branch-deleted-badge">deleted</span>';
      if (b.justUpdated) badges += '<span class="branch-updated-badge">updated</span>';
      if (prStatus) {
        const prClass = prStatus.state === 'OPEN' ? 'pr-open' : prStatus.state === 'MERGED' ? 'pr-merged' : 'pr-closed';
        const prUrl = getPrUrl(prStatus.number);
        badges += '<span class="pr-badge ' + prClass + '">';
        if (prUrl) badges += '<a href="' + escHtml(prUrl) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">';
        badges += (prStatus.state === 'MERGED' ? 'merged' : 'PR #' + prStatus.number);
        if (prUrl) badges += '</a>';
        badges += '</span>';
        if (prUrl) badges += '<button class="copy-btn" data-copy="' + escHtml(prUrl) + '" title="Copy PR URL" onclick="event.stopPropagation()">&#x1f4cb;</button>';
      }
      html += '<div class="branch-time-row">';
      html += '<span class="branch-time">' + timeAgo(b.date) + '</span>';
      if (badges) html += '<div class="branch-badges">' + badges + '</div>';
      html += '</div>';
      if (ab && (ab.ahead || ab.behind)) {
        html += '<div class="branch-diff">';
        html += '<span class="diff-added">+' + fmtCompact(ab.ahead || 0) + '</span>';
        html += '<span class="diff-deleted">-' + fmtCompact(ab.behind || 0) + '</span>';
        html += '<span class="diff-label">commits</span>';
        if (ab.linesAdded || ab.linesDeleted) {
          html += ' <span class="diff-added">+' + fmtCompact(ab.linesAdded || 0) + '</span>';
          html += '<span class="diff-deleted">-' + fmtCompact(ab.linesDeleted || 0) + '</span>';
          html += '<span class="diff-label">lines</span>';
        }
        html += '</div>';
      }
      html += renderSparklineBars(sparkStr);
      html += '</div>';
      html += '</div>'; // branch-item
    }

    container.innerHTML = html;

    // Scroll selected into view
    const selected = container.querySelector('.branch-item.selected');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }

  function renderActivityLog() {
    const container = document.getElementById('activity-log');
    const log = (state && state.activityLog) || [];
    if (log.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#x1f4cb;</div>No activity yet</div>';
      return;
    }
    let html = '';
    for (let i = 0; i < log.length; i++) {
      const entry = log[i];
      const t = '';
      if (entry.timestamp) {
        const d = new Date(entry.timestamp);
        t = isNaN(d.getTime()) ? '' : d.toLocaleTimeString();
      }
      html += '<div class="log-entry">';
      html += '<span class="log-dot ' + (entry.type || 'info') + '"></span>';
      html += '<span class="log-text">' + escHtml(entry.message) + '</span>';
      html += '<span class="log-time">' + t + '</span>';
      html += '</div>';
    }
    container.innerHTML = html;
  }

  // ── Log Viewer ─────────────────────────────────────────────────
  function showLogViewer() {
    ui.logViewerMode = true;
    ui.logViewerTab = 'server';
    renderLogViewer();
    logViewerModal.show();
  }

  function hideLogViewer() { logViewerModal.hide(); }

  function renderLogViewer() {
    if (!state) return;
    const container = document.getElementById('log-viewer-content');
    // Update tab active state
    const tabs = document.querySelectorAll('.log-viewer-tab');
    for (let t = 0; t < tabs.length; t++) {
      tabs[t].className = 'log-viewer-tab' + (tabs[t].getAttribute('data-tab') === ui.logViewerTab ? ' active' : '');
    }

    let html = '';
    if (ui.logViewerTab === 'server') {
      const logs = state.serverLogBuffer || [];
      if (logs.length === 0) {
        html = '<div style="color:var(--text-muted);padding:20px;text-align:center;">No server logs</div>';
      } else {
        for (let i = 0; i < logs.length; i++) {
          const log = logs[i];
          html += '<div class="log-line' + (log.isError ? ' error' : '') + '">';
          html += '<span class="log-ts">' + escHtml(log.timestamp || '') + '</span>';
          html += escHtml(log.line || '');
          html += '</div>';
        }
      }
    } else {
      const alog = (state.activityLog || []);
      if (alog.length === 0) {
        html = '<div style="color:var(--text-muted);padding:20px;text-align:center;">No activity</div>';
      } else {
        for (let j = 0; j < alog.length; j++) {
          const entry = alog[j];
          const ts = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '';
          html += '<div class="log-line">';
          html += '<span class="log-ts">' + ts + '</span>';
          html += escHtml(entry.message || '');
          html += '</div>';
        }
      }
    }
    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
  }

  document.getElementById('log-viewer-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.log-viewer-tab');
    if (!tab) return;
    ui.logViewerTab = tab.getAttribute('data-tab');
    renderLogViewer();
  });

  // ── Branch Action Modal ────────────────────────────────────────
  function showBranchActions() {
    const branches = getDisplayBranches();
    if (!branches.length || ui.selectedIndex >= branches.length) return;
    const branch = branches[ui.selectedIndex];
    ui.branchActionMode = true;
    branchActionModal.show();
    document.getElementById('branch-action-title').textContent = 'Actions: ' + branch.name;

    const prStatus = (state.branchPrStatusMap || {})[branch.name];
    const isCurrent = branch.name === state.currentBranch;

    const actions = [];

    // Open on web (GitHub/GitLab) — direct link if we have repo URL
    const brUrl = getBranchUrl(branch.name);
    if (brUrl) {
      actions.push({ icon: '\\u{1f310}', label: 'Open branch on web', key: 'openLink', data: { url: brUrl } });
    } else {
      actions.push({ icon: '\\u{1f310}', label: 'Open branch on web', key: 'openBranchWeb', data: { branch: branch.name } });
    }

    // PR actions
    const prUrl = prStatus ? getPrUrl(prStatus.number) : null;
    if (prStatus && prUrl) {
      actions.push({ icon: '\\u{1f517}', label: 'View PR #' + prStatus.number, key: 'openLink', data: { url: prUrl } });
    } else if (prStatus && prStatus.url) {
      actions.push({ icon: '\\u{1f517}', label: 'View PR #' + prStatus.number, key: 'openPrUrl', data: { url: prStatus.url } });
    }

    // Copy actions
    actions.push({ icon: '\\u{1f4cb}', label: 'Copy branch name', key: 'copy', data: { text: branch.name } });
    if (branch.commit) {
      actions.push({ icon: '\\u{1f4cb}', label: 'Copy commit hash (' + branch.commit + ')', key: 'copy', data: { text: branch.commit } });
    }
    if (prUrl) {
      actions.push({ icon: '\\u{1f4cb}', label: 'Copy PR URL', key: 'copy', data: { text: prUrl } });
    }

    // Pin/Unpin
    const isPinnedBranch = pinnedBranches.indexOf(branch.name) !== -1;
    actions.push({ icon: isPinnedBranch ? '\\u{1f4cc}' : '\\u{1f4cc}', label: isPinnedBranch ? 'Unpin branch' : 'Pin branch to top', key: 'pin', data: { branch: branch.name } });

    // Switch to branch
    if (!isCurrent) {
      actions.push({ icon: '\\u{27a1}', label: 'Switch to this branch', key: 'switchBranch', data: { branch: branch.name } });
    }

    // Pull
    if (isCurrent) {
      actions.push({ icon: '\\u{2b07}', label: 'Pull latest changes', key: 'pull', data: {} });
    }

    // Fetch
    actions.push({ icon: '\\u{1f504}', label: 'Fetch all remotes', key: 'fetch', data: {} });

    let html = '';
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      html += '<button class="action-item" data-action-key="' + escHtml(a.key) + '" data-action-data=\\'' + escHtml(JSON.stringify(a.data)) + '\\'>';
      html += '<span class="action-icon">' + a.icon + '</span>';
      html += '<span class="action-label">' + escHtml(a.label) + '</span>';
      html += '</button>';
    }
    document.getElementById('branch-action-list').innerHTML = html;
  }

  function hideBranchActions() { branchActionModal.hide(); }

  document.getElementById('branch-action-list').addEventListener('click', (e) => {
    const btn = e.target.closest('.action-item');
    if (!btn) return;
    const key = btn.getAttribute('data-action-key');
    let data = {};
    try { data = JSON.parse(btn.getAttribute('data-action-data') || '{}'); } catch (err) { /* malformed data-action-data — fall through with empty object */ }

    hideBranchActions();

    if (key === 'openLink') {
      // Direct client-side link opening
      window.open(data.url, '_blank', 'noopener');
      showToast('Opening in browser...', 'info');
    } else if (key === 'copy') {
      copyToClipboard(data.text, null);
    } else if (key === 'pin') {
      const pIdx = pinnedBranches.indexOf(data.branch);
      if (pIdx === -1) {
        pinnedBranches.push(data.branch);
        showToast('Pinned: ' + data.branch, 'success');
      } else {
        pinnedBranches.splice(pIdx, 1);
        showToast('Unpinned: ' + data.branch, 'info');
      }
      savePrefs({ pinnedBranches: pinnedBranches });
      renderBranches();
    } else if (key === 'openBranchWeb' || key === 'openPrUrl') {
      // Fallback: handled by the server sending back a URL
      sendAction('openBrowser', data);
      showToast('Opening in browser...', 'info');
    } else if (key === 'switchBranch') {
      sendAction('switchBranch', data);
      showToast('Switching to ' + data.branch + '...', 'info');
    } else {
      sendAction(key, data);
      showToast(key + '...', 'info');
    }
  });

  // ── Info Panel ─────────────────────────────────────────────────
  function showInfo() {
    if (!state) return;
    ui.infoMode = true;
    const grid = document.getElementById('info-grid');
    const rows = [
      ['Project', state.projectName || '-'],
      ['Version', 'v' + (state.version || '-')],
      ['Server Mode', state.serverMode || 'none'],
      ['Server Port', state.noServer ? 'N/A' : String(state.port || '-')],
      ['Server Running', state.serverRunning ? 'Yes' : 'No'],
      ['SSE Clients', String(state.clientCount || 0)],
      ['Current Branch', state.currentBranch || '-'],
      ['Polling Status', state.pollingStatus || 'idle'],
      ['Network', state.isOffline ? 'Offline' : 'Online'],
      ['Branches', String((state.branches || []).length)],
    ];
    let html = '';
    for (let i = 0; i < rows.length; i++) {
      html += '<span class="info-label">' + escHtml(rows[i][0]) + '</span>';
      html += '<span class="info-value">' + escHtml(rows[i][1]) + '</span>';
    }
    grid.innerHTML = html;
    infoModal.show();
  }

  function hideInfo() { infoModal.hide(); }

  // ── Stash Management ───────────────────────────────────────────
  function showStashDialog(pendingBranch) {
    ui.stashMode = true;
    ui.pendingStashBranch = pendingBranch || null;
    const msg = pendingBranch
      ? 'You have uncommitted changes. Stash them before switching to <strong>' + escHtml(pendingBranch) + '</strong>?'
      : 'Stash all uncommitted changes in the working directory?';
    const html = '<div style="color:var(--text-dim);font-size:13px;margin-bottom:16px;">' + msg + '</div>';
    html += '<div class="confirm-actions">';
    html += '<button class="confirm-btn" id="stash-cancel">Cancel</button>';
    html += '<button class="confirm-btn primary" id="stash-confirm">Stash &amp; Continue</button>';
    html += '</div>';
    document.getElementById('stash-content').innerHTML = html;
    stashModal.show();
    document.getElementById('stash-cancel').onclick = hideStash;
    document.getElementById('stash-confirm').onclick = () => {
      sendAction('stash', { pendingBranch: ui.pendingStashBranch });
      showToast('Stashing changes...', 'info');
      hideStash();
    };
  }

  function hideStash() { stashModal.hide(); }

  // ── Branch Cleanup ─────────────────────────────────────────────
  function showCleanup() {
    ui.cleanupMode = true;
    const html = '<div style="color:var(--text-dim);font-size:13px;margin-bottom:12px;">Scanning for branches with deleted remotes...</div>';
    document.getElementById('cleanup-content').innerHTML = html;
    cleanupModal.show();

    // Ask the server to find gone branches (we inspect state.branches for gone tracking hints)
    // For now, look at branches that have no remote
    const goneBranches = [];
    if (state && state.branches) {
      for (let i = 0; i < state.branches.length; i++) {
        const b = state.branches[i];
        if (b.isLocal && !b.hasRemote && b.name !== state.currentBranch) {
          goneBranches.push(b.name);
        }
      }
    }

    if (goneBranches.length === 0) {
      html = '<div style="color:var(--text-dim);font-size:13px;padding:12px 0;">No stale branches found. All branches have active remotes.</div>';
      html += '<div class="confirm-actions"><button class="confirm-btn" id="cleanup-done">OK</button></div>';
      document.getElementById('cleanup-content').innerHTML = html;
      document.getElementById('cleanup-done').onclick = hideCleanup;
      return;
    }

    html = '<div style="color:var(--text-dim);font-size:13px;margin-bottom:8px;">Found ' + goneBranches.length + ' branch(es) with no remote tracking:</div>';
    html += '<div class="cleanup-branch-list">';
    for (let j = 0; j < goneBranches.length; j++) {
      html += '<div class="cleanup-branch-item"><span class="cleanup-branch-icon">&#x2716;</span>' + escHtml(goneBranches[j]) + '</div>';
    }
    html += '</div>';
    html += '<div class="confirm-actions">';
    html += '<button class="confirm-btn" id="cleanup-cancel">Cancel</button>';
    html += '<button class="confirm-btn danger" id="cleanup-safe">Safe Delete (-d)</button>';
    html += '<button class="confirm-btn danger" id="cleanup-force">Force Delete (-D)</button>';
    html += '</div>';

    document.getElementById('cleanup-content').innerHTML = html;
    document.getElementById('cleanup-cancel').onclick = hideCleanup;
    document.getElementById('cleanup-safe').onclick = () => {
      sendAction('deleteBranches', { branches: goneBranches, force: false });
      showToast('Deleting ' + goneBranches.length + ' branches (safe)...', 'info');
      hideCleanup();
    };
    document.getElementById('cleanup-force').onclick = () => {
      showConfirm(
        'Force Delete',
        'Force delete ' + goneBranches.length + ' branch(es)? This may delete unmerged work.',
        () => {
          sendAction('deleteBranches', { branches: goneBranches, force: true });
          showToast('Force deleting ' + goneBranches.length + ' branches...', 'warning');
          hideCleanup();
        },
        { danger: true, label: 'Force Delete' }
      );
    };
  }

  function hideCleanup() { cleanupModal.hide(); }

  // ── Update Notification ────────────────────────────────────────
  function showUpdateModal() {
    if (!state || !state.updateAvailable) return;
    ui.updateMode = true;
    const html = '<div class="update-versions">';
    html += '<span class="old-version">v' + escHtml(state.version || '?') + '</span>';
    html += '<span class="arrow">&#x2192;</span>';
    html += '<span class="new-version">v' + escHtml(state.updateAvailable) + '</span>';
    html += '</div>';
    html += '<div class="update-info">A new version of git-watchtower is available.</div>';
    if (state.updateInProgress) {
      html += '<div class="update-progress">Update in progress...</div>';
    } else {
      html += '<div class="confirm-actions">';
      html += '<button class="confirm-btn" id="update-dismiss">Dismiss</button>';
      html += '<button class="confirm-btn primary" id="update-install">Update &amp; Restart</button>';
      html += '</div>';
    }
    document.getElementById('update-content').innerHTML = html;
    updateModal.show();
    if (!state.updateInProgress) {
      document.getElementById('update-dismiss').onclick = hideUpdate;
      document.getElementById('update-install').onclick = () => {
        sendAction('checkUpdate', { install: true });
        showToast('Installing update...', 'info');
        hideUpdate();
      };
    }
  }

  function hideUpdate() { updateModal.hide(); }

  // ── Session Stats ──────────────────────────────────────────────
  function renderSessionStats() {
    if (!state || !state.sessionStats) return;
    const s = state.sessionStats;
    const bar = document.getElementById('stats-bar');
    const activeBranches = 0;
    const staleBranches = 0;
    if (state.branches) {
      for (let i = 0; i < state.branches.length; i++) {
        const b = state.branches[i];
        // Consider stale if no updates and not current
        if (b.justUpdated || b.name === state.currentBranch) {
          activeBranches++;
        } else {
          staleBranches++;
        }
      }
    }
    let html = '';
    html += '<span class="stat-item"><span class="stat-label">Session:</span> <span class="stat-value">' + escHtml(s.sessionDuration || '0m') + '</span></span>';
    html += '<span class="stat-item"><span class="stat-label">Lines:</span> <span class="stat-value">+' + (s.linesAdded || 0) + '/-' + (s.linesDeleted || 0) + '</span></span>';
    html += '<span class="stat-item"><span class="stat-label">Polls:</span> <span class="stat-value">' + (s.totalPolls || 0) + '</span> <span class="stat-label">(' + (s.hitRate || 0) + '% hit)</span></span>';
    if (s.lastUpdate) {
      html += '<span class="stat-item"><span class="stat-label">Last update:</span> <span class="stat-value">' + escHtml(s.lastUpdate) + '</span></span>';
    }
    html += '<span class="stat-item"><span class="stat-label">Active:</span> <span class="stat-value">' + activeBranches + '</span> <span class="stat-label">Stale:</span> <span class="stat-value">' + staleBranches + '</span></span>';
    bar.innerHTML = html;
  }

  // ── Error Toast with Stash Hint ────────────────────────────────
  function showErrorToastWithHint(message, hint) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast error';
    const html = '<span class="toast-icon">\\u2717</span>' + escHtml(message);
    if (hint) {
      html += '<span class="toast-action" data-hint="' + escHtml(hint) + '">' + escHtml(hint) + '</span>';
    }
    toast.innerHTML = html;
    container.appendChild(toast);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('visible'));
    });

    // Handle hint click
    const hintEl = toast.querySelector('.toast-action');
    if (hintEl) {
      hintEl.addEventListener('click', (e) => {
        const h = e.currentTarget.getAttribute('data-hint');
        if (h === 'Press S to stash') {
          showStashDialog(ui.pendingStashBranch);
        }
        toast.classList.remove('visible');
        setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
      });
    }

    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    }, 6000);
  }

  // ── Keyboard ───────────────────────────────────────────────────

  // Key-to-action mapping for normal mode.
  // Declarative — easy to test, extend, and share with TUI.
  const KEY_MAP = {
    'j':         'moveDown',
    'ArrowDown': 'moveDown',
    'k':         'moveUp',
    'ArrowUp':   'moveUp',
    'Enter':     'selectBranch',
    '/':         'search',
    'p':         'pull',
    'f':         'fetch',
    'r':         'reloadBrowsers',
    'R':         'restartServer',
    'c':         'toggleCasino',
    'o':         'openBrowser',
    'h':         'showHistory',
    'u':         'undo',
    's':         'toggleSound',
    'b':         'branchActions',
    'i':         'info',
    'l':         'logViewer',
    'S':         'stash',
    'd':         'cleanup',
    'Escape':    'escape',
  };

  // Action handlers for normal mode.
  // Each receives the KeyboardEvent for cases that need it.
  const KEY_ACTIONS = {
    moveDown()    { moveSelection(1); },
    moveUp()      { moveSelection(-1); },
    selectBranch() {
      const branches = getDisplayBranches();
      if (branches.length > 0 && ui.selectedIndex < branches.length) {
        const b = branches[ui.selectedIndex];
        if (b.isDeleted) {
          showToast('Cannot switch to a deleted branch', 'error');
        } else if (b.name === state.currentBranch) {
          showToast('Already on ' + b.name, 'info');
        } else {
          sendAction('switchBranch', { branch: b.name });
          showToast('Switching to ' + b.name + '...', 'info');
        }
      }
    },
    search() {
      ui.searchMode = true;
      ui.searchQuery = '';
      ui.selectedIndex = 0;
      document.getElementById('search-bar').className = 'search-bar active';
      const input = document.getElementById('search-input');
      input.value = '';
      input.focus();
    },
    pull()           { sendAction('pull'); showToast('Pulling current branch...', 'info'); },
    fetch()          { sendAction('fetch'); showToast('Fetching all branches...', 'info'); },
    reloadBrowsers() {
      if (state && state.serverMode === 'static') {
        sendAction('reloadBrowsers');
        showToast('Reloading browsers...', 'info');
      }
    },
    restartServer() {
      if (state && state.serverMode === 'command') {
        showConfirm('Restart Server', 'Restart the dev server process?', () => {
          sendAction('restartServer');
          showToast('Restarting server...', 'info');
        }, { label: 'Restart' });
      }
    },
    toggleCasino()   { sendAction('toggleCasino'); },
    openBrowser()    { sendAction('openBrowser'); showToast('Opening in browser...', 'info'); },
    showHistory() {
      if (state && state.switchHistory && state.switchHistory.length > 0) {
        const last = state.switchHistory[0];
        let histMsg = 'Last: ' + last.from + ' \\u2192 ' + last.to;
        if (state.switchHistory.length > 1) histMsg += ' (+' + (state.switchHistory.length - 1) + ' more)';
        showToast(histMsg, 'info');
      } else {
        showToast('No switch history yet', 'info');
      }
    },
    undo()           { sendAction('undo'); showToast('Undoing last switch...', 'info'); },
    toggleSound()    { sendAction('toggleSound'); showToast(state && state.soundEnabled ? 'Sound off' : 'Sound on', 'info'); },
    branchActions()  { showBranchActions(); },
    info()           { showInfo(); },
    logViewer()      { showLogViewer(); },
    stash()          { showStashDialog(null); },
    cleanup()        { showCleanup(); },
    escape()         { /* no-op in normal mode */ },
  };

  document.addEventListener('keydown', (e) => {
    // Ignore when typing in input fields (other than search)
    if (e.target.tagName === 'INPUT' && e.target.id !== 'search-input') return;
    if (e.target.tagName === 'BUTTON') return;

    // Any modal — Escape to close the topmost one
    if (_openModals.length > 0 && e.key === 'Escape') {
      e.preventDefault();
      _openModals[_openModals.length - 1].hide();
      return;
    }

    // Log viewer tab switching
    if (ui.logViewerMode) {
      if (e.key === 'Tab' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        ui.logViewerTab = ui.logViewerTab === 'server' ? 'activity' : 'server';
        renderLogViewer();
      }
      return;
    }

    // Block other keys while modals are open
    if (_openModals.length > 0) return;

    // Confirm dialog mode — Escape to cancel, Enter to confirm
    if (ui.confirmMode) {
      if (e.key === 'Escape') { e.preventDefault(); hideConfirm(); }
      if (e.key === 'Enter') {
        e.preventDefault();
        const cb = ui.confirmCallback;
        hideConfirm();
        if (cb) cb();
      }
      return;
    }

    // Search mode
    if (ui.searchMode) {
      if (e.key === 'Escape') {
        e.preventDefault();
        ui.searchMode = false;
        ui.searchQuery = '';
        document.getElementById('search-bar').className = 'search-bar';
        document.getElementById('search-input').value = '';
        ui.selectedIndex = 0;
        renderBranches();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        ui.searchMode = false;
        document.getElementById('search-bar').className = 'search-bar';
        return;
      }
      if (e.key === 'ArrowDown' || (e.key === 'j' && e.ctrlKey)) {
        e.preventDefault();
        moveSelection(1);
        return;
      }
      if (e.key === 'ArrowUp' || (e.key === 'k' && e.ctrlKey)) {
        e.preventDefault();
        moveSelection(-1);
        return;
      }
      return;
    }

    // Tab switching with number keys (1-9)
    const projects = (state && state.projects) || [];
    if (projects.length > 1 && e.key >= '1' && e.key <= '9') {
      const tabIdx = parseInt(e.key, 10) - 1;
      if (tabIdx < projects.length) {
        e.preventDefault();
        switchTab(projects[tabIdx].id);
        return;
      }
    }

    // Tab cycling with Tab key
    if (e.key === 'Tab' && projects.length > 1) {
      e.preventDefault();
      const curIdx = projects.findIndex((p) => p.id === ui.activeTabId);
      const nextIdx = e.shiftKey
        ? (curIdx - 1 + projects.length) % projects.length
        : (curIdx + 1) % projects.length;
      switchTab(projects[nextIdx].id);
      return;
    }

    // Normal mode — look up action from key map
    const action = KEY_MAP[e.key];
    if (action && KEY_ACTIONS[action]) {
      e.preventDefault();
      KEY_ACTIONS[action](e);
    }
  });

  // Search input handler
  let _searchDebounce = null;
  document.getElementById('search-input').addEventListener('input', (e) => {
    ui.searchQuery = e.target.value;
    ui.selectedIndex = 0;
    clearTimeout(_searchDebounce);
    _searchDebounce = setTimeout(() => renderBranches(), 80);
  });

  function moveSelection(delta) {
    const branches = getDisplayBranches();
    const newIndex = ui.selectedIndex + delta;
    if (newIndex >= 0 && newIndex < branches.length) {
      ui.selectedIndex = newIndex;
      renderBranches();
    }
  }

  // ── Click Handlers ─────────────────────────────────────────────
  document.getElementById('branch-list').addEventListener('click', (e) => {
    const item = e.target.closest('.branch-item');
    if (!item) return;
    const idx = parseInt(item.getAttribute('data-index'), 10);
    if (isNaN(idx)) return;
    ui.selectedIndex = idx;
    renderBranches();

    // Double-click to switch with confirmation
    if (e.detail === 2) {
      const branches = getDisplayBranches();
      const br = branches[idx];
      if (br && !br.isDeleted && br.name !== state.currentBranch) {
        sendAction('switchBranch', { branch: br.name });
        showToast('Switching to ' + br.name + '...', 'info');
      }
    }
  });

  document.getElementById('confirm-overlay').addEventListener('click', (e) => {
    if (e.target === this) hideConfirm();
  });

  // Tab clicks
  document.getElementById('tab-bar').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    const projectId = tab.getAttribute('data-project-id');
    if (projectId) switchTab(projectId);
  });

  // ── Preferences Bar ─────────────────────────────────────────────
  function renderPrefsBar() {
    // Insert prefs controls into footer if not already there
    const footer = document.getElementById('footer');
    const existing = document.getElementById('prefs-bar');
    if (!existing) {
      const div = document.createElement('span');
      div.id = 'prefs-bar';
      div.style.cssText = 'display:flex;gap:6px;align-items:center;margin-left:auto;';
      div.innerHTML =
        '<button class="pref-btn' + (sortOrder === 'default' ? ' active' : '') + '" data-sort="default" title="Default sort">Default</button>' +
        '<button class="pref-btn' + (sortOrder === 'alpha' ? ' active' : '') + '" data-sort="alpha" title="Sort alphabetically">A-Z</button>' +
        '<button class="pref-btn' + (sortOrder === 'recent' ? ' active' : '') + '" data-sort="recent" title="Sort by most recent">Recent</button>' +
        '<button class="pref-btn" id="pin-selected-btn" title="Pin/unpin selected branch">Pin</button>' +
        '<button class="pref-btn' + (sidebarCollapsed ? ' active' : '') + '" id="toggle-sidebar-btn" title="Toggle sidebar">Sidebar</button>';
      footer.appendChild(div);
    }
  }

  // Prefs bar click handler
  document.getElementById('footer').addEventListener('click', (e) => {
    const sortBtn = e.target.closest('[data-sort]');
    if (sortBtn) {
      sortOrder = sortBtn.getAttribute('data-sort');
      savePrefs({ sortOrder: sortOrder });
      const sortBtns = document.querySelectorAll('[data-sort]');
      for (let i = 0; i < sortBtns.length; i++) {
        sortBtns[i].className = 'pref-btn' + (sortBtns[i].getAttribute('data-sort') === sortOrder ? ' active' : '');
      }
      renderBranches();
      return;
    }
    if (e.target.id === 'pin-selected-btn') {
      const branches = getDisplayBranches();
      if (branches.length > 0 && ui.selectedIndex < branches.length) {
        const bn = branches[ui.selectedIndex].name;
        const idx = pinnedBranches.indexOf(bn);
        if (idx === -1) {
          pinnedBranches.push(bn);
          showToast('Pinned: ' + bn, 'success');
        } else {
          pinnedBranches.splice(idx, 1);
          showToast('Unpinned: ' + bn, 'info');
        }
        savePrefs({ pinnedBranches: pinnedBranches });
        renderBranches();
      }
      return;
    }
    if (e.target.id === 'toggle-sidebar-btn') {
      toggleSidebar();
      return;
    }
  });

  // ── Sidebar Toggle ────────────────────────────────────────────
  function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    savePrefs({ sidebarCollapsed });
    document.querySelector('.layout').classList.toggle('sidebar-collapsed', sidebarCollapsed);
    const btn = document.getElementById('toggle-sidebar-btn');
    if (btn) btn.className = 'pref-btn' + (sidebarCollapsed ? ' active' : '');
  }

  document.getElementById('sidebar-toggle').addEventListener('click', toggleSidebar);

  // ── Copy button delegation ────────────────────────────────────
  document.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.copy-btn');
    if (!copyBtn) return;
    const text = copyBtn.getAttribute('data-copy');
    if (text) {
      e.preventDefault();
      e.stopPropagation();
      copyToClipboard(text, copyBtn);
    }
  });

  // ── Init ───────────────────────────────────────────────────────
  connect();
})();
`;
}

module.exports = { getDashboardJs };
