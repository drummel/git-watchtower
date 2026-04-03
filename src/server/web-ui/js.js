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
  var state = null;
  var prevBranches = null; // for notification diffing
  var selectedIndex = 0;
  var searchMode = false;
  var searchQuery = '';
  var confirmMode = false;
  var confirmCallback = null;
  var connected = false;
  var flashTimer = null;
  var activeTabId = null;
  var logViewerMode = false;
  var logViewerTab = 'server';
  var branchActionMode = false;
  var infoMode = false;
  var cleanupMode = false;
  var updateMode = false;
  var stashMode = false;
  var pendingStashBranch = null;
  var updateNotificationShown = false;
  var remoteTabPollTimer = null;

  // ── Persistent Preferences (localStorage) ─────────────────────
  var PREFS_KEY = 'git-watchtower-prefs';
  function loadPrefs() {
    try {
      return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
    } catch (e) { return {}; }
  }
  function savePrefs(updates) {
    var prefs = loadPrefs();
    for (var k in updates) { if (updates.hasOwnProperty(k)) prefs[k] = updates[k]; }
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ }
    return prefs;
  }
  var prefs = loadPrefs();
  var sidebarCollapsed = prefs.sidebarCollapsed || false;
  var sortOrder = prefs.sortOrder || 'default';
  var pinnedBranches = prefs.pinnedBranches || [];

  // Apply initial sidebar state
  (function() {
    var layout = document.querySelector('.layout');
    if (sidebarCollapsed) layout.classList.add('sidebar-collapsed');
  })();

  // ── Browser Notifications ─────────────────────────────────────
  var notifPermission = typeof Notification !== 'undefined' ? Notification.permission : 'denied';

  function updateNotifButton() {
    var btn = document.getElementById('notif-btn');
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

  document.getElementById('notif-btn').addEventListener('click', function() {
    if (notifPermission === 'granted' || notifPermission === 'denied') return;
    if (typeof Notification === 'undefined') {
      showToast('Notifications not supported in this browser', 'warning');
      return;
    }
    Notification.requestPermission().then(function(perm) {
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
      var n = new Notification(title, { body: body, tag: tag || 'git-watchtower', icon: '', silent: false });
      setTimeout(function() { n.close(); }, 8000);
    } catch (e) { /* ignore */ }
  }

  function diffBranchesForNotifications(oldBranches, newBranches) {
    if (!oldBranches || !newBranches) return;
    var oldMap = {};
    for (var i = 0; i < oldBranches.length; i++) {
      oldMap[oldBranches[i].name] = oldBranches[i];
    }
    for (var j = 0; j < newBranches.length; j++) {
      var nb = newBranches[j];
      var ob = oldMap[nb.name];
      if (!ob && nb.isNew) {
        sendNotification('New Branch', nb.name + ' was created', 'new-' + nb.name);
      } else if (ob && !ob.justUpdated && nb.justUpdated) {
        sendNotification('Branch Updated', nb.name + ' has new commits', 'update-' + nb.name);
      }
    }
    // Check PR state changes
    if (state && state.branchPrStatusMap) {
      for (var bn in state.branchPrStatusMap) {
        if (!state.branchPrStatusMap.hasOwnProperty(bn)) continue;
        var pr = state.branchPrStatusMap[bn];
        if (pr && pr.state === 'MERGED') {
          // Only notify once - check if it was not merged before
          var oldBranch = oldMap[bn];
          if (oldBranch) {
            sendNotification('PR Merged', 'PR #' + pr.number + ' for ' + bn + ' was merged', 'merged-' + bn);
          }
        }
      }
    }
  }

  // ── Clipboard Helper ──────────────────────────────────────────
  function copyToClipboard(text, btnEl) {
    navigator.clipboard.writeText(text).then(function() {
      if (btnEl) {
        btnEl.classList.add('copied');
        btnEl.innerHTML = '&#x2713;';
        setTimeout(function() {
          btnEl.classList.remove('copied');
          btnEl.innerHTML = '&#x1f4cb;';
        }, 1500);
      }
      showToast('Copied: ' + text, 'success');
    }).catch(function() {
      showToast('Failed to copy', 'error');
    });
  }

  // ── URL Building Helpers ──────────────────────────────────────
  function getRepoUrl() {
    return (state && state.repoWebUrl) ? state.repoWebUrl.replace(/\\/tree\\/.*$/, '') : null;
  }
  function getBranchUrl(branchName) {
    var base = getRepoUrl();
    if (!base) return null;
    return base + '/tree/' + encodeURIComponent(branchName);
  }
  function getCommitUrl(hash) {
    var base = getRepoUrl();
    if (!base || !hash) return null;
    return base + '/commit/' + hash;
  }
  function getPrUrl(prNumber) {
    var base = getRepoUrl();
    if (!base || !prNumber) return null;
    // Detect GitLab by URL pattern
    if (base.indexOf('gitlab') !== -1) {
      return base + '/-/merge_requests/' + prNumber;
    }
    return base + '/pull/' + prNumber;
  }

  // ── SSE Connection ─────────────────────────────────────────────
  var evtSource = null;

  function connect() {
    if (evtSource) { evtSource.close(); }
    evtSource = new EventSource('/api/events');

    evtSource.onopen = function() {
      connected = true;
      updateConnectionStatus();
    };

    evtSource.addEventListener('state', function(e) {
      try {
        var newState = JSON.parse(e.data);
        if (!activeTabId && newState.activeProjectId) {
          activeTabId = newState.activeProjectId;
        }
        // SSE always pushes the local project's state.  When the user
        // is viewing a different tab we must NOT overwrite the per-project
        // data (branches, PRs, activity, etc.) — only update global
        // metadata so the tab bar, connection status, and version info
        // stay current.
        var viewingLocalProject = !activeTabId || activeTabId === newState.activeProjectId;
        if (viewingLocalProject) {
          // Diff branches for desktop notifications
          if (state && state.branches) {
            diffBranchesForNotifications(state.branches, newState.branches || []);
          }
          prevBranches = state ? state.branches : null;
          state = newState;
        } else {
          // Viewing a remote tab — preserve per-project fields, update globals only
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
      } catch (err) { /* ignore parse errors */ }
    });

    evtSource.addEventListener('flash', function(e) {
      try {
        var data = JSON.parse(e.data);
        showFlash(data.text, data.type);
      } catch (err) { /* ignore */ }
    });

    evtSource.addEventListener('actionResult', function(e) {
      try {
        var data = JSON.parse(e.data);
        if (!data.success && data.message && data.message.indexOf('uncommitted') !== -1) {
          pendingStashBranch = data.branch || null;
          showErrorToastWithHint(data.message, 'Press S to stash');
        } else {
          showToast(data.message, data.success ? 'success' : 'error');
        }
      } catch (err) { /* ignore */ }
    });

    evtSource.onerror = function() {
      connected = false;
      updateConnectionStatus();
    };
  }

  function updateConnectionStatus() {
    var dot = document.getElementById('connection-dot');
    var badge = document.getElementById('status-badge');
    if (connected) {
      dot.className = 'connection-dot connected';
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
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/action');
    xhr.setRequestHeader('Content-Type', 'application/json');
    var data = { action: action, payload: payload || {} };
    if (activeTabId) data.projectId = activeTabId;
    xhr.send(JSON.stringify(data));
  }

  // ── Flash Messages ─────────────────────────────────────────────
  function showFlash(text, type) {
    var el = document.getElementById('flash');
    el.textContent = text;
    el.className = 'flash visible ' + (type || 'info');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function() {
      el.className = 'flash';
    }, 3000);
  }

  // ── Toast Notifications ────────────────────────────────────────
  function showToast(text, type) {
    var container = document.getElementById('toast-container');
    var toast = document.createElement('div');
    var icons = { success: '\\u2713', error: '\\u2717', info: '\\u2139', warning: '\\u26a0' };
    toast.className = 'toast ' + (type || 'info');
    toast.innerHTML = '<span class="toast-icon">' + (icons[type] || icons.info) + '</span>' + escHtml(text);
    container.appendChild(toast);
    requestAnimationFrame(function() {
      requestAnimationFrame(function() { toast.classList.add('visible'); });
    });
    setTimeout(function() {
      toast.classList.remove('visible');
      setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    }, 4000);
  }

  // ── Modal Helper ───────────────────────────────────────────────
  // Reusable helper that manages show/hide, overlay-click-to-close,
  // close-button click, and Escape key for standard modal overlays.
  var _openModals = [];

  function Modal(overlayId, closeId) {
    this.overlay = document.getElementById(overlayId);
    this.isOpen = false;
    this.onHide = null;
    var self = this;
    // Close button
    if (closeId) {
      var closeBtn = document.getElementById(closeId);
      if (closeBtn) closeBtn.addEventListener('click', function() { self.hide(); });
    }
    // Overlay background click
    this.overlay.addEventListener('click', function(e) {
      if (e.target === self.overlay) self.hide();
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
    var idx = _openModals.indexOf(this);
    if (idx !== -1) _openModals.splice(idx, 1);
    if (this.onHide) this.onHide();
  };

  function anyModalOpen() {
    return _openModals.length > 0 || confirmMode;
  }

  // Create modal instances
  var logViewerModal   = new Modal('log-viewer-overlay', 'log-viewer-close');
  var branchActionModal = new Modal('branch-action-overlay', 'branch-action-close');
  var infoModal        = new Modal('info-overlay', 'info-close');
  var stashModal       = new Modal('stash-overlay', 'stash-close');
  var cleanupModal     = new Modal('cleanup-overlay', 'cleanup-close');
  var updateModal      = new Modal('update-overlay', 'update-close');

  // Per-modal hide callbacks for state cleanup
  logViewerModal.onHide = function() { logViewerMode = false; };
  branchActionModal.onHide = function() { branchActionMode = false; };
  infoModal.onHide = function() { infoMode = false; };
  stashModal.onHide = function() { stashMode = false; pendingStashBranch = null; };
  cleanupModal.onHide = function() { cleanupMode = false; };
  updateModal.onHide = function() { updateMode = false; };

  // ── Confirm Dialog ─────────────────────────────────────────────
  function showConfirm(title, message, onConfirm, opts) {
    opts = opts || {};
    confirmMode = true;
    confirmCallback = onConfirm;
    var box = document.getElementById('confirm-box');
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
    document.getElementById('confirm-ok').onclick = function() {
      hideConfirm();
      if (confirmCallback) confirmCallback();
    };
  }

  function hideConfirm() {
    confirmMode = false;
    confirmCallback = null;
    document.getElementById('confirm-overlay').className = 'confirm-overlay';
  }

  // ── Tabs ───────────────────────────────────────────────────────
  function renderTabs() {
    var tabBar = document.getElementById('tab-bar');
    var projects = (state && state.projects) || [];
    if (projects.length <= 1) {
      tabBar.className = 'tab-bar';
      return;
    }
    tabBar.className = 'tab-bar visible';
    // Adjust layout height for tab bar
    document.querySelector('.layout').style.height = 'calc(100vh - 49px - 40px)';
    var html = '';
    for (var i = 0; i < projects.length; i++) {
      var p = projects[i];
      var isActive = p.id === activeTabId;
      html += '<div class="tab' + (isActive ? ' active' : '') + '" data-project-id="' + escHtml(p.id) + '">';
      html += '<span class="tab-dot"></span>';
      html += escHtml(p.name);
      if (i < 9) html += '<span class="tab-number">' + (i + 1) + '</span>';
      html += '</div>';
    }
    tabBar.innerHTML = html;
  }

  /**
   * Fetch a project's state from the server and merge it into the
   * current client-side state for rendering.
   */
  function fetchAndApplyProjectState(projectId) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/projects/' + projectId + '/state');
    xhr.onload = function() {
      if (xhr.status === 200 && activeTabId === projectId) {
        try {
          var pState = JSON.parse(xhr.responseText);
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
        } catch (err) { /* ignore */ }
      }
    };
    xhr.send();
  }

  function switchTab(projectId) {
    if (projectId === activeTabId) return;
    activeTabId = projectId;
    selectedIndex = 0;
    searchQuery = '';
    searchMode = false;
    document.getElementById('search-bar').className = 'search-bar';
    document.getElementById('search-input').value = '';
    renderTabs();
    fetchAndApplyProjectState(projectId);

    // For non-local tabs the SSE stream won't push per-project updates,
    // so poll the server periodically to keep the view fresh.
    clearInterval(remoteTabPollTimer);
    remoteTabPollTimer = null;
    if (state && projectId !== state.activeProjectId) {
      remoteTabPollTimer = setInterval(function() {
        fetchAndApplyProjectState(projectId);
      }, 2000);
    }
  }

  // ── Pure Utility Functions (inlined from pure.js) ──────────────
${pureFnBlock}

  // ── Get Display Branches (wrapper) ─────────────────────────────
  // The pure getDisplayBranches is inlined above as a var assignment.
  // Wrap it to pass closure state as args, keeping the same call-site API.
  var _pureGetDisplayBranches = getDisplayBranches;
  getDisplayBranches = function() {
    if (!state || !state.branches) return [];
    return _pureGetDisplayBranches(state.branches, {
      searchQuery: searchQuery,
      pinnedBranches: pinnedBranches,
      sortOrder: sortOrder,
    });
  };

  // ── Render ─────────────────────────────────────────────────────
  function render() {
    if (!state) return;

    // Header — hide project name pill when tabs are showing it
    var projectEl = document.getElementById('project-name');
    var hasTabs = state.projects && state.projects.length > 1;
    if (hasTabs) {
      projectEl.style.display = 'none';
    } else {
      projectEl.style.display = '';
      projectEl.textContent = state.projectName || '-';
    }
    var versionEl = document.getElementById('version');
    if (state.version) versionEl.textContent = 'v' + state.version;

    // Status badge
    if (connected) {
      var badge = document.getElementById('status-badge');
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
    if (state.updateAvailable && !updateNotificationShown && !anyModalOpen()) {
      updateNotificationShown = true;
      showUpdateModal();
    }

    // Update log viewer if open
    if (logViewerMode) renderLogViewer();
  }

  function renderBranches() {
    var container = document.getElementById('branch-list');
    var branches = getDisplayBranches();
    var countEl = document.getElementById('branch-count');
    countEl.textContent = branches.length;

    if (selectedIndex >= branches.length) {
      selectedIndex = Math.max(0, branches.length - 1);
    }

    if (branches.length === 0) {
      container.innerHTML = '<div class="empty-state">' +
        '<div class="empty-state-icon">&#x1f33f;</div>' +
        (searchQuery ? 'No branches matching "' + escHtml(searchQuery) + '"' : 'No branches found') +
        '</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < branches.length; i++) {
      var b = branches[i];
      var isSelected = i === selectedIndex;
      var isCurrent = b.name === state.currentBranch;

      // Sparkline
      var sparkStr = state.sparklineCache ? state.sparklineCache[b.name] : null;

      // PR status
      var prStatus = state.branchPrStatusMap ? state.branchPrStatusMap[b.name] : null;
      var isMerged = prStatus && prStatus.state === 'MERGED';

      // Ahead/behind
      var ab = state.aheadBehindCache ? state.aheadBehindCache[b.name] : null;

      var itemClasses = 'branch-item';
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
      var branchUrl = getBranchUrl(b.name);
      var isPinned = pinnedBranches.indexOf(b.name) !== -1;
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
      var commitUrl = getCommitUrl(b.commit);
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
      var badges = '';
      if (isCurrent) badges += '<span class="branch-current-badge">HEAD</span>';
      if (isPinned) badges += '<span class="branch-new-badge" style="color:var(--orange);background:rgba(219,109,40,0.15)">pinned</span>';
      if (b.isNew) badges += '<span class="branch-new-badge">new</span>';
      if (b.isDeleted) badges += '<span class="branch-deleted-badge">deleted</span>';
      if (b.justUpdated) badges += '<span class="branch-updated-badge">updated</span>';
      if (prStatus) {
        var prClass = prStatus.state === 'OPEN' ? 'pr-open' : prStatus.state === 'MERGED' ? 'pr-merged' : 'pr-closed';
        var prUrl = getPrUrl(prStatus.number);
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
    var selected = container.querySelector('.branch-item.selected');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }

  function renderActivityLog() {
    var container = document.getElementById('activity-log');
    var log = (state && state.activityLog) || [];
    if (log.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#x1f4cb;</div>No activity yet</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < log.length; i++) {
      var entry = log[i];
      var t = '';
      if (entry.timestamp) {
        var d = new Date(entry.timestamp);
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
    logViewerMode = true;
    logViewerTab = 'server';
    renderLogViewer();
    logViewerModal.show();
  }

  function hideLogViewer() { logViewerModal.hide(); }

  function renderLogViewer() {
    if (!state) return;
    var container = document.getElementById('log-viewer-content');
    // Update tab active state
    var tabs = document.querySelectorAll('.log-viewer-tab');
    for (var t = 0; t < tabs.length; t++) {
      tabs[t].className = 'log-viewer-tab' + (tabs[t].getAttribute('data-tab') === logViewerTab ? ' active' : '');
    }

    var html = '';
    if (logViewerTab === 'server') {
      var logs = state.serverLogBuffer || [];
      if (logs.length === 0) {
        html = '<div style="color:var(--text-muted);padding:20px;text-align:center;">No server logs</div>';
      } else {
        for (var i = 0; i < logs.length; i++) {
          var log = logs[i];
          html += '<div class="log-line' + (log.isError ? ' error' : '') + '">';
          html += '<span class="log-ts">' + escHtml(log.timestamp || '') + '</span>';
          html += escHtml(log.line || '');
          html += '</div>';
        }
      }
    } else {
      var alog = (state.activityLog || []);
      if (alog.length === 0) {
        html = '<div style="color:var(--text-muted);padding:20px;text-align:center;">No activity</div>';
      } else {
        for (var j = 0; j < alog.length; j++) {
          var entry = alog[j];
          var ts = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '';
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

  document.getElementById('log-viewer-tabs').addEventListener('click', function(e) {
    var tab = e.target.closest('.log-viewer-tab');
    if (!tab) return;
    logViewerTab = tab.getAttribute('data-tab');
    renderLogViewer();
  });

  // ── Branch Action Modal ────────────────────────────────────────
  function showBranchActions() {
    var branches = getDisplayBranches();
    if (!branches.length || selectedIndex >= branches.length) return;
    var branch = branches[selectedIndex];
    branchActionMode = true;
    branchActionModal.show();
    document.getElementById('branch-action-title').textContent = 'Actions: ' + branch.name;

    var prStatus = (state.branchPrStatusMap || {})[branch.name];
    var isCurrent = branch.name === state.currentBranch;

    var actions = [];

    // Open on web (GitHub/GitLab) — direct link if we have repo URL
    var brUrl = getBranchUrl(branch.name);
    if (brUrl) {
      actions.push({ icon: '\\u{1f310}', label: 'Open branch on web', key: 'openLink', data: { url: brUrl } });
    } else {
      actions.push({ icon: '\\u{1f310}', label: 'Open branch on web', key: 'openBranchWeb', data: { branch: branch.name } });
    }

    // PR actions
    var prUrl = prStatus ? getPrUrl(prStatus.number) : null;
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
    var isPinnedBranch = pinnedBranches.indexOf(branch.name) !== -1;
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

    var html = '';
    for (var i = 0; i < actions.length; i++) {
      var a = actions[i];
      html += '<button class="action-item" data-action-key="' + escHtml(a.key) + '" data-action-data=\\'' + escHtml(JSON.stringify(a.data)) + '\\'>';
      html += '<span class="action-icon">' + a.icon + '</span>';
      html += '<span class="action-label">' + escHtml(a.label) + '</span>';
      html += '</button>';
    }
    document.getElementById('branch-action-list').innerHTML = html;
  }

  function hideBranchActions() { branchActionModal.hide(); }

  document.getElementById('branch-action-list').addEventListener('click', function(e) {
    var btn = e.target.closest('.action-item');
    if (!btn) return;
    var key = btn.getAttribute('data-action-key');
    var data = {};
    try { data = JSON.parse(btn.getAttribute('data-action-data') || '{}'); } catch (err) { /* ignore */ }

    hideBranchActions();

    if (key === 'openLink') {
      // Direct client-side link opening
      window.open(data.url, '_blank', 'noopener');
      showToast('Opening in browser...', 'info');
    } else if (key === 'copy') {
      copyToClipboard(data.text, null);
    } else if (key === 'pin') {
      var pIdx = pinnedBranches.indexOf(data.branch);
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
    infoMode = true;
    var grid = document.getElementById('info-grid');
    var rows = [
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
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      html += '<span class="info-label">' + escHtml(rows[i][0]) + '</span>';
      html += '<span class="info-value">' + escHtml(rows[i][1]) + '</span>';
    }
    grid.innerHTML = html;
    infoModal.show();
  }

  function hideInfo() { infoModal.hide(); }

  // ── Stash Management ───────────────────────────────────────────
  function showStashDialog(pendingBranch) {
    stashMode = true;
    pendingStashBranch = pendingBranch || null;
    var msg = pendingBranch
      ? 'You have uncommitted changes. Stash them before switching to <strong>' + escHtml(pendingBranch) + '</strong>?'
      : 'Stash all uncommitted changes in the working directory?';
    var html = '<div style="color:var(--text-dim);font-size:13px;margin-bottom:16px;">' + msg + '</div>';
    html += '<div class="confirm-actions">';
    html += '<button class="confirm-btn" id="stash-cancel">Cancel</button>';
    html += '<button class="confirm-btn primary" id="stash-confirm">Stash &amp; Continue</button>';
    html += '</div>';
    document.getElementById('stash-content').innerHTML = html;
    stashModal.show();
    document.getElementById('stash-cancel').onclick = hideStash;
    document.getElementById('stash-confirm').onclick = function() {
      sendAction('stash', { pendingBranch: pendingStashBranch });
      showToast('Stashing changes...', 'info');
      hideStash();
    };
  }

  function hideStash() { stashModal.hide(); }

  // ── Branch Cleanup ─────────────────────────────────────────────
  function showCleanup() {
    cleanupMode = true;
    var html = '<div style="color:var(--text-dim);font-size:13px;margin-bottom:12px;">Scanning for branches with deleted remotes...</div>';
    document.getElementById('cleanup-content').innerHTML = html;
    cleanupModal.show();

    // Ask the server to find gone branches (we inspect state.branches for gone tracking hints)
    // For now, look at branches that have no remote
    var goneBranches = [];
    if (state && state.branches) {
      for (var i = 0; i < state.branches.length; i++) {
        var b = state.branches[i];
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
    for (var j = 0; j < goneBranches.length; j++) {
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
    document.getElementById('cleanup-safe').onclick = function() {
      sendAction('deleteBranches', { branches: goneBranches, force: false });
      showToast('Deleting ' + goneBranches.length + ' branches (safe)...', 'info');
      hideCleanup();
    };
    document.getElementById('cleanup-force').onclick = function() {
      showConfirm(
        'Force Delete',
        'Force delete ' + goneBranches.length + ' branch(es)? This may delete unmerged work.',
        function() {
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
    updateMode = true;
    var html = '<div class="update-versions">';
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
      html += '<button class="confirm-btn primary" id="update-install">Update Now</button>';
      html += '</div>';
    }
    document.getElementById('update-content').innerHTML = html;
    updateModal.show();
    if (!state.updateInProgress) {
      document.getElementById('update-dismiss').onclick = hideUpdate;
      document.getElementById('update-install').onclick = function() {
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
    var s = state.sessionStats;
    var bar = document.getElementById('stats-bar');
    var activeBranches = 0;
    var staleBranches = 0;
    if (state.branches) {
      for (var i = 0; i < state.branches.length; i++) {
        var b = state.branches[i];
        // Consider stale if no updates and not current
        if (b.justUpdated || b.name === state.currentBranch) {
          activeBranches++;
        } else {
          staleBranches++;
        }
      }
    }
    var html = '';
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
    var container = document.getElementById('toast-container');
    var toast = document.createElement('div');
    toast.className = 'toast error';
    var html = '<span class="toast-icon">\\u2717</span>' + escHtml(message);
    if (hint) {
      html += '<span class="toast-action" data-hint="' + escHtml(hint) + '">' + escHtml(hint) + '</span>';
    }
    toast.innerHTML = html;
    container.appendChild(toast);
    requestAnimationFrame(function() {
      requestAnimationFrame(function() { toast.classList.add('visible'); });
    });

    // Handle hint click
    var hintEl = toast.querySelector('.toast-action');
    if (hintEl) {
      hintEl.addEventListener('click', function() {
        var h = this.getAttribute('data-hint');
        if (h === 'Press S to stash') {
          showStashDialog(pendingStashBranch);
        }
        toast.classList.remove('visible');
        setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
      });
    }

    setTimeout(function() {
      toast.classList.remove('visible');
      setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    }, 6000);
  }

  // ── Keyboard ───────────────────────────────────────────────────
  document.addEventListener('keydown', function(e) {
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
    if (logViewerMode) {
      if (e.key === 'Tab' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        logViewerTab = logViewerTab === 'server' ? 'activity' : 'server';
        renderLogViewer();
      }
      return;
    }

    // Block other keys while modals are open
    if (_openModals.length > 0) return;

    // Confirm dialog mode — Escape to cancel, Enter to confirm
    if (confirmMode) {
      if (e.key === 'Escape') { e.preventDefault(); hideConfirm(); }
      if (e.key === 'Enter') {
        e.preventDefault();
        var cb = confirmCallback;
        hideConfirm();
        if (cb) cb();
      }
      return;
    }

    // Search mode
    if (searchMode) {
      if (e.key === 'Escape') {
        e.preventDefault();
        searchMode = false;
        searchQuery = '';
        document.getElementById('search-bar').className = 'search-bar';
        document.getElementById('search-input').value = '';
        selectedIndex = 0;
        renderBranches();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        searchMode = false;
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
    var projects = (state && state.projects) || [];
    if (projects.length > 1 && e.key >= '1' && e.key <= '9') {
      var tabIdx = parseInt(e.key, 10) - 1;
      if (tabIdx < projects.length) {
        e.preventDefault();
        switchTab(projects[tabIdx].id);
        return;
      }
    }

    // Tab cycling with Tab key
    if (e.key === 'Tab' && projects.length > 1) {
      e.preventDefault();
      var curIdx = projects.findIndex(function(p) { return p.id === activeTabId; });
      var nextIdx = e.shiftKey
        ? (curIdx - 1 + projects.length) % projects.length
        : (curIdx + 1) % projects.length;
      switchTab(projects[nextIdx].id);
      return;
    }

    // Normal mode
    switch (e.key) {
      case 'j':
      case 'ArrowDown':
        e.preventDefault();
        moveSelection(1);
        break;
      case 'k':
      case 'ArrowUp':
        e.preventDefault();
        moveSelection(-1);
        break;
      case 'Enter':
        e.preventDefault();
        var branches = getDisplayBranches();
        if (branches.length > 0 && selectedIndex < branches.length) {
          var b = branches[selectedIndex];
          if (b.isDeleted) {
            showToast('Cannot switch to a deleted branch', 'error');
          } else if (b.name === state.currentBranch) {
            showToast('Already on ' + b.name, 'info');
          } else {
            sendAction('switchBranch', { branch: b.name });
            showToast('Switching to ' + b.name + '...', 'info');
          }
        }
        break;
      case '/':
        e.preventDefault();
        searchMode = true;
        searchQuery = '';
        selectedIndex = 0;
        document.getElementById('search-bar').className = 'search-bar active';
        var input = document.getElementById('search-input');
        input.value = '';
        input.focus();
        break;
      case 'p':
        e.preventDefault();
        sendAction('pull');
        showToast('Pulling current branch...', 'info');
        break;
      case 'f':
        e.preventDefault();
        sendAction('fetch');
        showToast('Fetching all branches...', 'info');
        break;
      case 'r':
        e.preventDefault();
        if (state && state.serverMode === 'static') {
          sendAction('reloadBrowsers');
          showToast('Reloading browsers...', 'info');
        }
        break;
      case 'R':
        e.preventDefault();
        if (state && state.serverMode === 'command') {
          showConfirm(
            'Restart Server',
            'Restart the dev server process?',
            function() {
              sendAction('restartServer');
              showToast('Restarting server...', 'info');
            },
            { label: 'Restart' }
          );
        }
        break;
      case 'c':
        e.preventDefault();
        sendAction('toggleCasino');
        break;
      case 'o':
        e.preventDefault();
        sendAction('openBrowser');
        showToast('Opening in browser...', 'info');
        break;
      case 'h':
        e.preventDefault();
        if (state && state.switchHistory && state.switchHistory.length > 0) {
          var last = state.switchHistory[0];
          var histMsg = 'Last: ' + last.from + ' \\u2192 ' + last.to;
          if (state.switchHistory.length > 1) histMsg += ' (+' + (state.switchHistory.length - 1) + ' more)';
          showToast(histMsg, 'info');
        } else {
          showToast('No switch history yet', 'info');
        }
        break;
      case 'u':
        e.preventDefault();
        sendAction('undo');
        showToast('Undoing last switch...', 'info');
        break;
      case 's':
        e.preventDefault();
        sendAction('toggleSound');
        showToast(state && state.soundEnabled ? 'Sound off' : 'Sound on', 'info');
        break;
      case 'b':
        e.preventDefault();
        showBranchActions();
        break;
      case 'i':
        e.preventDefault();
        showInfo();
        break;
      case 'l':
        e.preventDefault();
        showLogViewer();
        break;
      case 'S':
        e.preventDefault();
        showStashDialog(null);
        break;
      case 'd':
        e.preventDefault();
        showCleanup();
        break;
      case 'Escape':
        e.preventDefault();
        break;
    }
  });

  // Search input handler
  document.getElementById('search-input').addEventListener('input', function(e) {
    searchQuery = e.target.value;
    selectedIndex = 0;
    renderBranches();
  });

  function moveSelection(delta) {
    var branches = getDisplayBranches();
    var newIndex = selectedIndex + delta;
    if (newIndex >= 0 && newIndex < branches.length) {
      selectedIndex = newIndex;
      renderBranches();
    }
  }

  // ── Click Handlers ─────────────────────────────────────────────
  document.getElementById('branch-list').addEventListener('click', function(e) {
    var item = e.target.closest('.branch-item');
    if (!item) return;
    var idx = parseInt(item.getAttribute('data-index'), 10);
    if (isNaN(idx)) return;
    selectedIndex = idx;
    renderBranches();

    // Double-click to switch with confirmation
    if (e.detail === 2) {
      var branches = getDisplayBranches();
      var br = branches[idx];
      if (br && !br.isDeleted && br.name !== state.currentBranch) {
        sendAction('switchBranch', { branch: br.name });
        showToast('Switching to ' + br.name + '...', 'info');
      }
    }
  });

  document.getElementById('confirm-overlay').addEventListener('click', function(e) {
    if (e.target === this) hideConfirm();
  });

  // Tab clicks
  document.getElementById('tab-bar').addEventListener('click', function(e) {
    var tab = e.target.closest('.tab');
    if (!tab) return;
    var projectId = tab.getAttribute('data-project-id');
    if (projectId) switchTab(projectId);
  });

  // ── Preferences Bar ─────────────────────────────────────────────
  function renderPrefsBar() {
    // Insert prefs controls into footer if not already there
    var footer = document.getElementById('footer');
    var existing = document.getElementById('prefs-bar');
    if (!existing) {
      var div = document.createElement('span');
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
  document.getElementById('footer').addEventListener('click', function(e) {
    var sortBtn = e.target.closest('[data-sort]');
    if (sortBtn) {
      sortOrder = sortBtn.getAttribute('data-sort');
      savePrefs({ sortOrder: sortOrder });
      var sortBtns = document.querySelectorAll('[data-sort]');
      for (var i = 0; i < sortBtns.length; i++) {
        sortBtns[i].className = 'pref-btn' + (sortBtns[i].getAttribute('data-sort') === sortOrder ? ' active' : '');
      }
      renderBranches();
      return;
    }
    if (e.target.id === 'pin-selected-btn') {
      var branches = getDisplayBranches();
      if (branches.length > 0 && selectedIndex < branches.length) {
        var bn = branches[selectedIndex].name;
        var idx = pinnedBranches.indexOf(bn);
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
      sidebarCollapsed = !sidebarCollapsed;
      savePrefs({ sidebarCollapsed: sidebarCollapsed });
      var layout = document.querySelector('.layout');
      if (sidebarCollapsed) {
        layout.classList.add('sidebar-collapsed');
      } else {
        layout.classList.remove('sidebar-collapsed');
      }
      e.target.className = 'pref-btn' + (sidebarCollapsed ? ' active' : '');
      return;
    }
  });

  // ── Sidebar Toggle (header) ───────────────────────────────────
  document.getElementById('sidebar-toggle').addEventListener('click', function() {
    sidebarCollapsed = !sidebarCollapsed;
    savePrefs({ sidebarCollapsed: sidebarCollapsed });
    var layout = document.querySelector('.layout');
    layout.classList.toggle('sidebar-collapsed', sidebarCollapsed);
    var btn = document.getElementById('toggle-sidebar-btn');
    if (btn) btn.className = 'pref-btn' + (sidebarCollapsed ? ' active' : '');
  });

  // ── Copy button delegation ────────────────────────────────────
  document.addEventListener('click', function(e) {
    var copyBtn = e.target.closest('.copy-btn');
    if (!copyBtn) return;
    var text = copyBtn.getAttribute('data-copy');
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
