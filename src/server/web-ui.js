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
    --header-bg: linear-gradient(135deg, #0550ae 0%, #0969da 100%);
    --radius: 8px;
    --radius-sm: 4px;
    --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
    --font-mono: 'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', Consolas, monospace;
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
    --shadow-md: 0 4px 12px rgba(0,0,0,0.4);
    --shadow-lg: 0 8px 24px rgba(0,0,0,0.5);
    --merged-text: #484f58;
    --merged-bg: rgba(72,79,88,0.06);
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
    padding: 14px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    user-select: none;
    box-shadow: 0 1px 8px rgba(0,0,0,0.3);
    position: relative;
    z-index: 10;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .header-title {
    font-size: 15px;
    font-weight: 700;
    color: #fff;
    letter-spacing: -0.2px;
  }
  .header-version {
    font-size: 11px;
    color: rgba(255,255,255,0.4);
    font-weight: 500;
  }
  .header-project {
    font-size: 13px;
    font-weight: 600;
    color: rgba(255,255,255,0.95);
    background: rgba(255,255,255,0.12);
    padding: 3px 12px;
    border-radius: var(--radius-sm);
    backdrop-filter: blur(4px);
    border: 1px solid rgba(255,255,255,0.08);
  }
  .header-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .badge {
    font-size: 10px;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 10px;
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }
  .badge-online { background: var(--green-dim); color: #fff; box-shadow: 0 0 8px rgba(63,185,80,0.3); }
  .badge-offline { background: var(--red-dim); color: #fff; box-shadow: 0 0 8px rgba(248,81,73,0.3); }
  .badge-fetching { background: var(--yellow); color: #000; }

  /* ── Layout ────────────────────────────────────────────────────── */
  .layout {
    display: grid;
    grid-template-columns: 1fr 320px;
    grid-template-rows: 1fr auto;
    height: calc(100vh - 49px);
    min-height: 0;
    gap: 0;
  }

  /* ── Branch List ───────────────────────────────────────────────── */
  .branch-panel {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .panel-header {
    padding: 12px 20px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    color: var(--text-muted);
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
    padding: 10px 20px;
    border-bottom: 1px solid var(--border-subtle);
    border-left: 2px solid transparent;
    cursor: pointer;
    transition: background 0.15s, opacity 0.15s, border-color 0.15s;
  }
  .branch-item:hover { background: var(--bg-surface-hover); }
  .branch-item.selected { background: var(--bg-surface-active); border-left-color: var(--accent); }
  .branch-item.selected .branch-name { color: var(--accent); }
  .branch-item.current {
    background: rgba(63,185,80,0.06);
    border-left-color: var(--green);
  }
  .branch-item.current:hover { background: rgba(63,185,80,0.10); }
  .branch-item.current.selected { border-left-color: var(--green); background: rgba(63,185,80,0.10); }
  .branch-item.current .branch-name { color: var(--green); font-weight: 600; }
  .branch-item.merged { opacity: 0.45; }
  .branch-item.merged:hover { opacity: 0.7; }
  .branch-item.merged .branch-name { color: var(--text-muted); }

  .branch-cursor {
    font-size: 9px;
    color: var(--accent);
    opacity: 0;
    transition: opacity 0.15s;
    filter: drop-shadow(0 0 3px var(--accent));
  }
  .branch-item.selected .branch-cursor { opacity: 1; }
  .branch-current-icon {
    font-size: 10px;
    color: var(--green);
    filter: drop-shadow(0 0 4px rgba(63,185,80,0.6));
  }
  .branch-item.current .branch-cursor { display: none; }
  .branch-item.current.selected .branch-current-icon { display: none; }
  .branch-item.current.selected .branch-cursor { display: inline; opacity: 1; }

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
    padding-left: 16px;
    flex-shrink: 0;
    min-width: 60px;
  }
  .branch-time {
    font-size: 12px;
    font-family: var(--font-mono);
    color: var(--text-dim);
    white-space: nowrap;
    font-weight: 500;
    letter-spacing: -0.3px;
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
    gap: 6px;
    font-size: 11px;
    font-family: var(--font-mono);
    justify-content: flex-end;
    text-align: right;
    white-space: nowrap;
  }
  .diff-added { color: var(--green); }
  .diff-deleted { color: var(--red); }
  .diff-label { color: var(--text-muted); font-size: 10px; }

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
    border-left: 1px solid var(--border);
    box-shadow: -2px 0 8px rgba(0,0,0,0.15);
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
    padding: 8px 20px;
    background: var(--bg-surface);
    border-top: 1px solid var(--border);
    font-size: 11px;
    color: var(--text-muted);
    display: flex;
    gap: 14px;
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
    box-shadow: 0 1px 0 var(--border);
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
    padding: 24px;
    box-shadow: var(--shadow-lg);
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
  .connection-dot.connected { background: var(--green); box-shadow: 0 0 6px rgba(63,185,80,0.5), 0 0 2px var(--green); }
  .connection-dot.disconnected { background: var(--red); box-shadow: 0 0 6px rgba(248,81,73,0.5), 0 0 2px var(--red); animation: pulse-dot 2s ease-in-out infinite; }
  @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

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

  /* ── Tab Bar ───────────────────────────────────────────────────── */
  .tab-bar {
    display: none;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border);
    padding: 0 16px;
    gap: 2px;
    overflow-x: auto;
    scrollbar-width: none;
    flex-shrink: 0;
    align-items: stretch;
    box-shadow: inset 0 -1px 0 var(--border);
  }
  .tab-bar::-webkit-scrollbar { display: none; }
  .tab-bar.visible { display: flex; }
  .tab {
    padding: 10px 20px 9px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-muted);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    white-space: nowrap;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
    user-select: none;
    position: relative;
    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  }
  .tab:hover { color: var(--text-dim); background: rgba(255,255,255,0.03); }
  .tab.active {
    color: var(--text);
    font-weight: 600;
    border-bottom-color: var(--accent);
    background: var(--bg);
  }
  .tab .tab-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    margin-right: 8px;
    background: var(--green);
    box-shadow: 0 0 4px rgba(63,185,80,0.4);
  }
  .tab .tab-number {
    font-size: 10px;
    color: var(--text-muted);
    margin-left: 6px;
    font-family: var(--font-mono);
    opacity: 0.6;
  }
  .tab.active .tab-number { color: var(--accent); opacity: 0.8; }

  /* ── Confirm Dialog ────────────────────────────────────────────── */
  .confirm-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    z-index: 200;
    justify-content: center;
    align-items: center;
  }
  .confirm-overlay.active { display: flex; }
  .confirm-box {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 28px;
    min-width: 360px;
    max-width: 480px;
    box-shadow: var(--shadow-lg);
  }
  .confirm-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 8px;
  }
  .confirm-message {
    font-size: 13px;
    color: var(--text-dim);
    margin-bottom: 20px;
    line-height: 1.5;
  }
  .confirm-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
  .confirm-btn {
    padding: 6px 16px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    background: var(--bg);
    color: var(--text);
    transition: background 0.15s;
  }
  .confirm-btn:hover { background: var(--bg-surface-hover); }
  .confirm-btn.primary {
    background: var(--accent-dim);
    border-color: var(--accent-dim);
    color: #fff;
  }
  .confirm-btn.primary:hover { background: var(--accent); }
  .confirm-btn.danger {
    background: var(--red-dim);
    border-color: var(--red-dim);
    color: #fff;
  }
  .confirm-btn.danger:hover { background: var(--red); }

  /* ── Toast Notifications ───────────────────────────────────────── */
  .toast-container {
    position: fixed;
    bottom: 60px;
    right: 20px;
    z-index: 150;
    display: flex;
    flex-direction: column-reverse;
    gap: 8px;
    pointer-events: none;
  }
  .toast {
    padding: 10px 16px;
    border-radius: var(--radius);
    font-size: 13px;
    font-weight: 500;
    pointer-events: auto;
    opacity: 0;
    transform: translateX(20px);
    transition: opacity 0.3s, transform 0.3s;
    max-width: 360px;
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid;
  }
  .toast.visible { opacity: 1; transform: translateX(0); }
  .toast.success { background: rgba(35,134,54,0.9); border-color: var(--green); color: #fff; }
  .toast.error { background: rgba(218,54,51,0.9); border-color: var(--red); color: #fff; }
  .toast.info { background: rgba(31,111,235,0.9); border-color: var(--accent); color: #fff; }
  .toast.warning { background: rgba(210,153,34,0.9); border-color: var(--yellow); color: #000; }
  .toast-icon { font-size: 14px; flex-shrink: 0; }
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

<div class="tab-bar" id="tab-bar"></div>

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
    <span><kbd>Enter</kbd> switch</span>
    <span><kbd>/</kbd> search</span>
    <span><kbd>v</kbd> preview</span>
    <span><kbd>p</kbd> pull</span>
    <span><kbd>f</kbd> fetch</span>
    <span><kbd>r</kbd> reload</span>
    <span><kbd>R</kbd> restart</span>
    <span><kbd>h</kbd> history</span>
    <span><kbd>c</kbd> casino</span>
    <span><kbd>1</kbd>-<kbd>9</kbd> tabs</span>
    <span><kbd>Esc</kbd> close</span>
  </div>
</div>

<div class="flash" id="flash"></div>
<div class="preview-overlay" id="preview-overlay">
  <div class="preview-box" id="preview-box"></div>
</div>
<div class="confirm-overlay" id="confirm-overlay">
  <div class="confirm-box" id="confirm-box"></div>
</div>
<div class="toast-container" id="toast-container"></div>

<script>
(function() {
  'use strict';

  // ── State ──────────────────────────────────────────────────────
  var state = null;
  var selectedIndex = 0;
  var searchMode = false;
  var searchQuery = '';
  var previewMode = false;
  var confirmMode = false;
  var confirmCallback = null;
  var connected = false;
  var flashTimer = null;
  var activeTabId = null;

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
        if (!activeTabId && state.activeProjectId) {
          activeTabId = state.activeProjectId;
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
        showToast(data.message, data.success ? 'success' : 'error');
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

  function switchTab(projectId) {
    if (projectId === activeTabId) return;
    activeTabId = projectId;
    selectedIndex = 0;
    searchQuery = '';
    searchMode = false;
    document.getElementById('search-bar').className = 'search-bar';
    document.getElementById('search-input').value = '';
    renderTabs();
    // Fetch the project's state
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/projects/' + projectId + '/state');
    xhr.onload = function() {
      if (xhr.status === 200) {
        try {
          var pState = JSON.parse(xhr.responseText);
          // Merge into current state for rendering
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
          render();
        } catch (err) { /* ignore */ }
      }
    };
    xhr.send();
  }

  // ── Time Formatting ────────────────────────────────────────────
  function timeAgo(dateStr) {
    if (!dateStr) return '';
    var ts = new Date(dateStr).getTime();
    if (isNaN(ts)) return '';
    var diff = Date.now() - ts;
    if (diff < 0) return 'now';
    var s = Math.floor(diff / 1000);
    if (s < 60) return s + 's ago';
    var m = Math.floor(s / 60);
    if (m < 60) return m + 'm ago';
    var h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    var d = Math.floor(h / 24);
    return d + 'd ago';
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
      html += '<span class="branch-name">' + escHtml(b.name) + '</span>';
      if (isCurrent) html += '<span class="branch-current-badge">HEAD</span>';
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
      html += '</div>'; // branch-meta
      html += '</div>'; // branch-info

      html += '<div class="branch-right">';
      html += '<span class="branch-time">' + timeAgo(b.date) + '</span>';
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
    if (e.target.tagName === 'BUTTON') return;

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

  document.getElementById('preview-overlay').addEventListener('click', function(e) {
    if (e.target === this) hidePreview();
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
