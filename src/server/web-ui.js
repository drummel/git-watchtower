/**
 * Embedded HTML/CSS/JS for the Git Watchtower web dashboard.
 * Returns a complete HTML page as a string — no external dependencies.
 * @module server/web-ui
 */

/**
 * Generate the web dashboard HTML.
 * @param {number} port - The web server port (for SSE connection)
 * @returns {string} Complete HTML document
 */
function getWebDashboardHtml(port) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Git Watchtower</title>
<style>
  :root {
    --bg: #0d1117;
    --bg-surface: #161b22;
    --bg-surface-hover: #1c2129;
    --bg-surface-active: #252c35;
    --border: #30363d;
    --border-subtle: #21262d;
    --text: #e6edf3;
    --text-dim: #8b949e;
    --text-muted: #484f58;
    --accent: #58a6ff;
    --accent-dim: #1f6feb;
    --green: #3fb950;
    --green-dim: #238636;
    --red: #f85149;
    --red-dim: #da3633;
    --yellow: #d29922;
    --cyan: #39d2c0;
    --magenta: #bc8cff;
    --orange: #db6d28;
    --sparkline: #58a6ff;
    --header-bg: #0550ae;
    --radius: 8px;
    --radius-sm: 4px;
    --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
    --font-mono: 'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', Consolas, monospace;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: var(--font);
    background: var(--bg);
    color: var(--text);
    line-height: 1.5;
    overflow: hidden;
    height: 100vh;
  }

  /* ── Header ────────────────────────────────────────────────────── */
  .header {
    background: var(--header-bg);
    padding: 12px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border);
    user-select: none;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .header-title {
    font-size: 15px;
    font-weight: 600;
    color: #fff;
  }
  .header-version {
    font-size: 12px;
    color: rgba(255,255,255,0.5);
  }
  .header-project {
    font-size: 14px;
    font-weight: 600;
    color: rgba(255,255,255,0.9);
    background: rgba(255,255,255,0.1);
    padding: 2px 10px;
    border-radius: var(--radius-sm);
  }
  .header-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .badge {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .badge-online { background: var(--green-dim); color: #fff; }
  .badge-offline { background: var(--red-dim); color: #fff; }
  .badge-fetching { background: var(--yellow); color: #000; }

  /* ── Layout ────────────────────────────────────────────────────── */
  .layout {
    display: grid;
    grid-template-columns: 1fr 320px;
    grid-template-rows: 1fr auto;
    height: calc(100vh - 49px);
    gap: 0;
  }

  /* ── Branch List ───────────────────────────────────────────────── */
  .branch-panel {
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .panel-header {
    padding: 10px 16px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-dim);
    border-bottom: 1px solid var(--border);
    background: var(--bg-surface);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .branch-count {
    color: var(--text-muted);
    font-weight: 400;
  }
  .branch-list {
    flex: 1;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }
  .branch-list::-webkit-scrollbar { width: 6px; }
  .branch-list::-webkit-scrollbar-track { background: transparent; }
  .branch-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

  .branch-item {
    display: grid;
    grid-template-columns: 24px 1fr auto;
    align-items: center;
    padding: 8px 16px;
    border-bottom: 1px solid var(--border-subtle);
    cursor: pointer;
    transition: background 0.1s;
  }
  .branch-item:hover { background: var(--bg-surface-hover); }
  .branch-item.selected { background: var(--bg-surface-active); }
  .branch-item.selected .branch-name { color: var(--accent); }

  .branch-cursor {
    font-size: 10px;
    color: var(--accent);
    opacity: 0;
    transition: opacity 0.1s;
  }
  .branch-item.selected .branch-cursor { opacity: 1; }

  .branch-info {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .branch-name-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .branch-name {
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .branch-current-badge {
    font-size: 10px;
    color: var(--green);
    background: rgba(63,185,80,0.15);
    padding: 0 6px;
    border-radius: var(--radius-sm);
    font-weight: 600;
    flex-shrink: 0;
  }
  .branch-new-badge {
    font-size: 10px;
    color: var(--yellow);
    background: rgba(210,153,34,0.15);
    padding: 0 6px;
    border-radius: var(--radius-sm);
    font-weight: 600;
    flex-shrink: 0;
  }
  .branch-deleted-badge {
    font-size: 10px;
    color: var(--red);
    background: rgba(248,81,73,0.15);
    padding: 0 6px;
    border-radius: var(--radius-sm);
    font-weight: 600;
    flex-shrink: 0;
  }
  .branch-updated-badge {
    font-size: 10px;
    color: var(--cyan);
    background: rgba(57,210,192,0.15);
    padding: 0 6px;
    border-radius: var(--radius-sm);
    font-weight: 600;
    flex-shrink: 0;
  }
  .branch-meta {
    font-size: 11px;
    color: var(--text-dim);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .branch-commit {
    font-family: var(--font-mono);
    color: var(--text-muted);
    font-size: 11px;
  }
  .branch-subject {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 300px;
  }
  .branch-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    padding-left: 12px;
    flex-shrink: 0;
  }
  .branch-time {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .sparkline-bar {
    display: flex;
    align-items: flex-end;
    gap: 1px;
    height: 16px;
  }
  .spark-bar {
    width: 4px;
    border-radius: 1px;
    background: var(--sparkline);
    transition: height 0.3s;
    min-height: 1px;
  }

  .branch-diff {
    display: flex;
    gap: 8px;
    font-size: 11px;
    font-family: var(--font-mono);
  }
  .diff-added { color: var(--green); }
  .diff-deleted { color: var(--red); }
  .diff-label { color: var(--text-muted); }

  .pr-badge {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    font-weight: 600;
    flex-shrink: 0;
  }
  .pr-open { color: var(--green); background: rgba(63,185,80,0.15); }
  .pr-merged { color: var(--magenta); background: rgba(188,140,255,0.15); }
  .pr-closed { color: var(--red); background: rgba(248,81,73,0.15); }

  /* ── Side Panel ────────────────────────────────────────────────── */
  .side-panel {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-surface);
  }

  /* ── Activity Log ──────────────────────────────────────────────── */
  .activity-log {
    flex: 1;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }
  .log-entry {
    padding: 6px 16px;
    font-size: 12px;
    border-bottom: 1px solid var(--border-subtle);
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }
  .log-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    margin-top: 6px;
    flex-shrink: 0;
  }
  .log-dot.info { background: var(--accent); }
  .log-dot.success { background: var(--green); }
  .log-dot.warning { background: var(--yellow); }
  .log-dot.error { background: var(--red); }
  .log-dot.update { background: var(--cyan); }
  .log-text {
    color: var(--text-dim);
    line-height: 1.4;
    word-break: break-word;
  }
  .log-time {
    color: var(--text-muted);
    font-size: 10px;
    font-family: var(--font-mono);
    flex-shrink: 0;
    margin-left: auto;
    padding-left: 8px;
  }

  /* ── Search Overlay ────────────────────────────────────────────── */
  .search-bar {
    display: none;
    padding: 8px 16px;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border);
  }
  .search-bar.active { display: flex; }
  .search-input {
    width: 100%;
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 13px;
    padding: 6px 12px;
    border-radius: var(--radius-sm);
    outline: none;
  }
  .search-input:focus { border-color: var(--accent); }

  /* ── Footer ────────────────────────────────────────────────────── */
  .footer {
    grid-column: 1 / -1;
    padding: 8px 16px;
    background: var(--bg-surface);
    border-top: 1px solid var(--border);
    font-size: 11px;
    color: var(--text-muted);
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    user-select: none;
  }
  .footer kbd {
    display: inline-block;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 0 5px;
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-dim);
    line-height: 18px;
    margin-right: 2px;
  }

  /* ── Flash Message ─────────────────────────────────────────────── */
  .flash {
    position: fixed;
    top: 60px;
    left: 50%;
    transform: translateX(-50%);
    padding: 8px 20px;
    border-radius: var(--radius);
    font-size: 13px;
    font-weight: 500;
    z-index: 100;
    opacity: 0;
    transition: opacity 0.3s;
    pointer-events: none;
  }
  .flash.visible { opacity: 1; }
  .flash.info { background: var(--accent-dim); color: #fff; }
  .flash.success { background: var(--green-dim); color: #fff; }
  .flash.warning { background: var(--yellow); color: #000; }
  .flash.error { background: var(--red-dim); color: #fff; }
  .flash.update { background: var(--cyan); color: #000; }

  /* ── Preview Panel ─────────────────────────────────────────────── */
  .preview-overlay {
    display: none;
    position: fixed;
    inset: 49px 0 0 0;
    background: rgba(0,0,0,0.6);
    z-index: 50;
  }
  .preview-overlay.active { display: flex; justify-content: center; align-items: flex-start; padding-top: 40px; }
  .preview-box {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    width: 90%;
    max-width: 700px;
    max-height: 70vh;
    overflow-y: auto;
    padding: 20px;
  }
  .preview-title {
    font-family: var(--font-mono);
    font-size: 15px;
    font-weight: 600;
    color: var(--accent);
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .preview-section-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-muted);
    margin: 16px 0 8px;
  }
  .preview-commit {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-dim);
    padding: 4px 0;
    border-bottom: 1px solid var(--border-subtle);
  }
  .preview-commit-hash {
    color: var(--yellow);
    margin-right: 8px;
  }
  .preview-file {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-dim);
    padding: 2px 0;
  }

  /* ── Connection indicator ──────────────────────────────────────── */
  .connection-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }
  .connection-dot.connected { background: var(--green); box-shadow: 0 0 6px var(--green); }
  .connection-dot.disconnected { background: var(--red); box-shadow: 0 0 6px var(--red); }

  /* ── Empty state ───────────────────────────────────────────────── */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: var(--text-muted);
    font-size: 13px;
  }
  .empty-state-icon { font-size: 32px; margin-bottom: 12px; opacity: 0.5; }
</style>
</head>
<body>

<div class="header">
  <div class="header-left">
    <span class="header-title">&#x1f3f0; Git Watchtower</span>
    <span class="header-version" id="version"></span>
    <span class="header-project" id="project-name">-</span>
  </div>
  <div class="header-right">
    <span class="badge" id="status-badge">connecting</span>
    <span class="connection-dot disconnected" id="connection-dot"></span>
  </div>
</div>

<div class="layout">
  <div class="branch-panel">
    <div class="search-bar" id="search-bar">
      <input type="text" class="search-input" id="search-input" placeholder="Filter branches..." autocomplete="off" spellcheck="false">
    </div>
    <div class="panel-header">
      <span>Active Branches</span>
      <span class="branch-count" id="branch-count">0</span>
    </div>
    <div class="branch-list" id="branch-list"></div>
  </div>

  <div class="side-panel">
    <div class="panel-header">Activity Log</div>
    <div class="activity-log" id="activity-log"></div>
  </div>

  <div class="footer" id="footer">
    <span><kbd>j</kbd><kbd>k</kbd> navigate</span>
    <span><kbd>Enter</kbd> switch branch</span>
    <span><kbd>/</kbd> search</span>
    <span><kbd>v</kbd> preview</span>
    <span><kbd>p</kbd> pull</span>
    <span><kbd>f</kbd> fetch</span>
    <span><kbd>h</kbd> history</span>
    <span><kbd>Esc</kbd> close</span>
  </div>
</div>

<div class="flash" id="flash"></div>
<div class="preview-overlay" id="preview-overlay">
  <div class="preview-box" id="preview-box"></div>
</div>

<script>
(function() {
  'use strict';

  // ── State ──────────────────────────────────────────────────────
  var state = null;
  var selectedIndex = 0;
  var searchMode = false;
  var searchQuery = '';
  var previewMode = false;
  var connected = false;
  var flashTimer = null;

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
        state = JSON.parse(e.data);
        render();
      } catch (err) { /* ignore parse errors */ }
    });

    evtSource.addEventListener('flash', function(e) {
      try {
        var data = JSON.parse(e.data);
        showFlash(data.text, data.type);
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
    xhr.send(JSON.stringify({ action: action, payload: payload || {} }));
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

  // ── Time Formatting ────────────────────────────────────────────
  function timeAgo(dateStr) {
    if (!dateStr) return '';
    var diff = Date.now() - new Date(dateStr).getTime();
    var s = Math.floor(diff / 1000);
    if (s < 60) return s + 's';
    var m = Math.floor(s / 60);
    if (m < 60) return m + 'm';
    var h = Math.floor(m / 60);
    if (h < 24) return h + 'h';
    var d = Math.floor(h / 24);
    return d + 'd';
  }

  // ── Sparkline Rendering ────────────────────────────────────────
  function renderSparklineBars(sparkStr) {
    if (!sparkStr) return '';
    var chars = '\\u2581\\u2582\\u2583\\u2584\\u2585\\u2586\\u2587\\u2588';
    var html = '<div class="sparkline-bar">';
    for (var i = 0; i < sparkStr.length; i++) {
      var ch = sparkStr[i];
      var idx = chars.indexOf(ch);
      if (idx < 0) {
        html += '<div class="spark-bar" style="height:1px"></div>';
      } else {
        var pct = Math.round(((idx + 1) / 8) * 100);
        html += '<div class="spark-bar" style="height:' + pct + '%"></div>';
      }
    }
    html += '</div>';
    return html;
  }

  // ── Compact number ─────────────────────────────────────────────
  function fmtCompact(n) {
    if (n < 1000) return String(n);
    if (n < 10000) return (n / 1000).toFixed(1) + 'k';
    if (n < 1000000) return Math.round(n / 1000) + 'k';
    return (n / 1000000).toFixed(1) + 'm';
  }

  // ── Get Display Branches ───────────────────────────────────────
  function getDisplayBranches() {
    if (!state || !state.branches) return [];
    var branches = state.branches;
    if (searchQuery) {
      var q = searchQuery.toLowerCase();
      branches = branches.filter(function(b) {
        return b.name.toLowerCase().indexOf(q) !== -1;
      });
    }
    return branches;
  }

  // ── Render ─────────────────────────────────────────────────────
  function render() {
    if (!state) return;

    // Header
    document.getElementById('project-name').textContent = state.projectName || '-';
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

      // Ahead/behind
      var ab = state.aheadBehindCache ? state.aheadBehindCache[b.name] : null;

      html += '<div class="branch-item' + (isSelected ? ' selected' : '') + '" data-index="' + i + '">';
      html += '<span class="branch-cursor">&#x25b6;</span>';
      html += '<div class="branch-info">';
      html += '<div class="branch-name-row">';
      html += '<span class="branch-name">' + escHtml(b.name) + '</span>';
      if (isCurrent) html += '<span class="branch-current-badge">current</span>';
      if (b.isNew) html += '<span class="branch-new-badge">new</span>';
      if (b.isDeleted) html += '<span class="branch-deleted-badge">deleted</span>';
      if (b.justUpdated) html += '<span class="branch-updated-badge">updated</span>';
      if (prStatus) {
        var prClass = prStatus.state === 'OPEN' ? 'pr-open' : prStatus.state === 'MERGED' ? 'pr-merged' : 'pr-closed';
        html += '<span class="pr-badge ' + prClass + '">';
        html += (prStatus.state === 'MERGED' ? 'merged' : 'PR #' + prStatus.number);
        html += '</span>';
      }
      html += '</div>'; // branch-name-row

      html += '<div class="branch-meta">';
      html += '<span class="branch-commit">' + escHtml(b.commit || '') + '</span>';
      html += '<span class="branch-subject">' + escHtml(b.subject || '') + '</span>';
      if (ab && (ab.ahead || ab.behind)) {
        html += '<span class="branch-diff">';
        html += '<span class="diff-added">+' + fmtCompact(ab.ahead || 0) + '</span>';
        html += '<span class="diff-deleted">-' + fmtCompact(ab.behind || 0) + '</span>';
        html += '<span class="diff-label">commits</span>';
        if (ab.linesAdded || ab.linesDeleted) {
          html += '<span class="diff-added">+' + fmtCompact(ab.linesAdded || 0) + '</span>';
          html += '<span class="diff-deleted">-' + fmtCompact(ab.linesDeleted || 0) + '</span>';
          html += '<span class="diff-label">lines</span>';
        }
        html += '</span>';
      }
      html += '</div>'; // branch-meta
      html += '</div>'; // branch-info

      html += '<div class="branch-right">';
      html += '<span class="branch-time">' + timeAgo(b.date) + '</span>';
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
      var t = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '';
      html += '<div class="log-entry">';
      html += '<span class="log-dot ' + (entry.type || 'info') + '"></span>';
      html += '<span class="log-text">' + escHtml(entry.message) + '</span>';
      html += '<span class="log-time">' + t + '</span>';
      html += '</div>';
    }
    container.innerHTML = html;
  }

  // ── Preview ────────────────────────────────────────────────────
  function showPreview(branchName) {
    previewMode = true;
    sendAction('preview', { branch: branchName });
    document.getElementById('preview-overlay').className = 'preview-overlay active';
    document.getElementById('preview-box').innerHTML =
      '<div class="empty-state"><div class="empty-state-icon">&#x23f3;</div>Loading preview...</div>';
  }

  function hidePreview() {
    previewMode = false;
    document.getElementById('preview-overlay').className = 'preview-overlay';
  }

  function renderPreview(data) {
    if (!data) return;
    var html = '<div class="preview-title">';
    html += '&#x1f50d; ' + escHtml(data.branch || '');
    html += '</div>';

    if (data.commits && data.commits.length) {
      html += '<div class="preview-section-title">Recent Commits</div>';
      for (var i = 0; i < data.commits.length; i++) {
        var c = data.commits[i];
        html += '<div class="preview-commit">';
        html += '<span class="preview-commit-hash">' + escHtml(c.hash || '') + '</span>';
        html += escHtml(c.subject || '');
        html += '</div>';
      }
    }

    if (data.files && data.files.length) {
      html += '<div class="preview-section-title">Changed Files</div>';
      for (var j = 0; j < data.files.length; j++) {
        html += '<div class="preview-file">' + escHtml(data.files[j]) + '</div>';
      }
    }

    document.getElementById('preview-box').innerHTML = html;
  }

  // ── Keyboard ───────────────────────────────────────────────────
  document.addEventListener('keydown', function(e) {
    // Ignore when typing in input fields (other than search)
    if (e.target.tagName === 'INPUT' && e.target.id !== 'search-input') return;

    // Preview mode
    if (previewMode) {
      if (e.key === 'Escape' || e.key === 'v') {
        e.preventDefault();
        hidePreview();
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
      // Let other keys go to the input
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
          if (!b.isDeleted && b.name !== state.currentBranch) {
            sendAction('switchBranch', { branch: b.name });
            showFlash('Switching to ' + b.name + '...', 'info');
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
      case 'v':
        e.preventDefault();
        var vBranches = getDisplayBranches();
        if (vBranches.length > 0 && selectedIndex < vBranches.length) {
          showPreview(vBranches[selectedIndex].name);
        }
        break;
      case 'p':
        e.preventDefault();
        sendAction('pull');
        showFlash('Pulling...', 'info');
        break;
      case 'f':
        e.preventDefault();
        sendAction('fetch');
        showFlash('Fetching all branches...', 'info');
        break;
      case 'h':
        e.preventDefault();
        // Show history in preview overlay
        if (state && state.switchHistory && state.switchHistory.length > 0) {
          previewMode = true;
          document.getElementById('preview-overlay').className = 'preview-overlay active';
          var hHtml = '<div class="preview-title">&#x1f4dc; Switch History</div>';
          for (var hi = 0; hi < state.switchHistory.length; hi++) {
            var sh = state.switchHistory[hi];
            var hTime = sh.timestamp ? new Date(sh.timestamp).toLocaleTimeString() : '';
            hHtml += '<div class="preview-commit">';
            hHtml += '<span class="preview-commit-hash">' + hTime + '</span>';
            hHtml += escHtml(sh.from) + ' &#x2192; ' + escHtml(sh.to);
            hHtml += '</div>';
          }
          document.getElementById('preview-box').innerHTML = hHtml;
        } else {
          showFlash('No switch history yet', 'info');
        }
        break;
      case 'u':
        e.preventDefault();
        sendAction('undo');
        showFlash('Undoing last switch...', 'info');
        break;
      case 's':
        e.preventDefault();
        sendAction('toggleSound');
        break;
      case 'Escape':
        e.preventDefault();
        if (previewMode) hidePreview();
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

    // Double-click to switch
    if (e.detail === 2) {
      var branches = getDisplayBranches();
      if (branches[idx] && !branches[idx].isDeleted && branches[idx].name !== state.currentBranch) {
        sendAction('switchBranch', { branch: branches[idx].name });
        showFlash('Switching to ' + branches[idx].name + '...', 'info');
      }
    }
  });

  document.getElementById('preview-overlay').addEventListener('click', function(e) {
    if (e.target === this) hidePreview();
  });

  // ── SSE event for preview data ─────────────────────────────────
  // Listen for preview response from server
  function setupPreviewListener() {
    if (evtSource) {
      evtSource.addEventListener('preview', function(e) {
        try {
          var data = JSON.parse(e.data);
          renderPreview(data);
        } catch (err) { /* ignore */ }
      });
    }
  }

  // ── Utility ────────────────────────────────────────────────────
  function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Init ───────────────────────────────────────────────────────
  connect();
  setTimeout(setupPreviewListener, 100);
})();
</script>
</body>
</html>`;
}

module.exports = { getWebDashboardHtml };
