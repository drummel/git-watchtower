/**
 * CSS styles for the Git Watchtower web dashboard.
 * @module server/web-ui/css
 */

/**
 * Get the dashboard CSS.
 * @returns {string} CSS content (without style tags)
 */
function getDashboardCss() {
  return `
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
  .branch-time-row {
    display: flex;
    align-items: center;
    gap: 6px;
    justify-content: flex-end;
  }
  .branch-badges {
    display: flex;
    gap: 4px;
    justify-content: flex-end;
    flex-wrap: wrap;
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
  .toast-action {
    cursor: pointer;
    text-decoration: underline;
    font-weight: 600;
    margin-left: 4px;
    opacity: 0.9;
  }
  .toast-action:hover { opacity: 1; }

  /* ── Modal Overlay (shared) ──────────────────────────────────── */
  .modal-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    z-index: 200;
    justify-content: center;
    align-items: center;
  }
  .modal-overlay.active { display: flex; }
  .modal-box {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 24px;
    min-width: 400px;
    max-width: 600px;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: var(--shadow-lg);
  }
  .modal-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .modal-close {
    margin-left: auto;
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 16px;
    padding: 4px 8px;
  }
  .modal-close:hover { color: var(--text); }

  /* ── Log Viewer ──────────────────────────────────────────────── */
  .log-viewer-tabs {
    display: flex;
    gap: 2px;
    margin-bottom: 12px;
    border-bottom: 1px solid var(--border);
  }
  .log-viewer-tab {
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    background: none;
    border-top: none;
    border-left: none;
    border-right: none;
  }
  .log-viewer-tab:hover { color: var(--text-dim); }
  .log-viewer-tab.active { color: var(--text); border-bottom-color: var(--accent); }
  .log-viewer-content {
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.6;
    max-height: 400px;
    overflow-y: auto;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 12px;
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }
  .log-line { padding: 1px 0; white-space: pre-wrap; word-break: break-all; }
  .log-line.error { color: var(--red); }
  .log-line .log-ts { color: var(--text-muted); margin-right: 8px; }

  /* ── Branch Action Modal ─────────────────────────────────────── */
  .action-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .action-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--text);
    font-size: 13px;
    background: none;
    border: 1px solid transparent;
    text-align: left;
    width: 100%;
    transition: background 0.15s, border-color 0.15s;
  }
  .action-item:hover { background: var(--bg-surface-hover); border-color: var(--border); }
  .action-item .action-icon { font-size: 14px; width: 20px; text-align: center; flex-shrink: 0; }
  .action-item .action-label { flex: 1; }
  .action-item .action-kbd {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-muted);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 1px 6px;
  }
  .action-item.disabled { opacity: 0.4; cursor: not-allowed; }

  /* ── Info Panel ──────────────────────────────────────────────── */
  .info-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 16px;
    font-size: 13px;
  }
  .info-label { color: var(--text-muted); font-weight: 500; }
  .info-value { color: var(--text); font-family: var(--font-mono); }

  /* ── Session Stats (footer) ──────────────────────────────────── */
  .stats-bar {
    display: flex;
    gap: 16px;
    align-items: center;
    font-size: 11px;
    color: var(--text-muted);
    font-family: var(--font-mono);
    flex-wrap: wrap;
  }
  .stats-bar .stat-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .stats-bar .stat-value { color: var(--text-dim); font-weight: 600; }
  .stats-bar .stat-label { font-family: var(--font); }

  /* ── Cleanup Modal ───────────────────────────────────────────── */
  .cleanup-branch-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 12px 0;
    max-height: 200px;
    overflow-y: auto;
  }
  .cleanup-branch-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-dim);
    background: var(--bg);
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-subtle);
  }
  .cleanup-branch-icon { color: var(--red); font-size: 10px; }

  /* ── Update Modal ────────────────────────────────────────────── */
  .update-info {
    font-size: 13px;
    color: var(--text-dim);
    margin-bottom: 16px;
    line-height: 1.5;
  }
  .update-versions {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    font-family: var(--font-mono);
    font-size: 13px;
  }
  .update-versions .old-version { color: var(--text-muted); }
  .update-versions .arrow { color: var(--text-muted); }
  .update-versions .new-version { color: var(--green); font-weight: 600; }
  .update-progress {
    font-size: 12px;
    color: var(--yellow);
    font-style: italic;
  }

  /* ── Clickable Links ────────────────────────────────────────── */
  .branch-name a, .branch-commit a, .pr-badge a {
    color: inherit;
    text-decoration: none;
    transition: color 0.15s, text-decoration 0.15s;
  }
  .branch-name a:hover { text-decoration: underline; color: var(--accent); }
  .branch-commit a:hover { text-decoration: underline; color: var(--yellow); }
  .pr-badge a:hover { text-decoration: underline; }

  /* ── Copy to Clipboard Button ───────────────────────────────── */
  .copy-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border: none;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: var(--radius-sm);
    font-size: 11px;
    opacity: 0;
    transition: opacity 0.15s, background 0.15s, color 0.15s;
    flex-shrink: 0;
    padding: 0;
    vertical-align: middle;
  }
  .branch-item:hover .copy-btn,
  .copy-btn:focus { opacity: 0.7; }
  .copy-btn:hover { opacity: 1; background: var(--bg-surface-active); color: var(--text); }
  .copy-btn.copied { color: var(--green); opacity: 1; }

  /* ── Notification Permission Button ─────────────────────────── */
  .notif-btn {
    font-size: 11px;
    padding: 3px 10px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text-dim);
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
    transition: background 0.15s, border-color 0.15s;
  }
  .notif-btn:hover { background: var(--bg-surface-hover); border-color: var(--accent); }
  .notif-btn.granted { background: var(--green-dim); color: #fff; border-color: var(--green-dim); cursor: default; }
  .notif-btn.denied { background: var(--red-dim); color: #fff; border-color: var(--red-dim); cursor: default; opacity: 0.6; }

  /* ── Sidebar Toggle ─────────────────────────────────────────── */
  .sidebar-toggle {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 12px;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    transition: color 0.15s, background 0.15s;
  }
  .sidebar-toggle:hover { color: var(--text); background: var(--bg-surface-hover); }

  /* ── Collapsed sidebar ──────────────────────────────────────── */
  .layout.sidebar-collapsed { grid-template-columns: 1fr 0px; }
  .layout.sidebar-collapsed .side-panel { display: none; }


  /* ── Preferences bar in footer ──────────────────────────────── */
  .pref-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-muted);
    cursor: pointer;
    font-size: 10px;
    padding: 1px 8px;
    border-radius: var(--radius-sm);
    font-family: var(--font);
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .pref-btn:hover { background: var(--bg-surface-hover); color: var(--text-dim); border-color: var(--text-muted); }
  .pref-btn.active { background: var(--accent-dim); color: #fff; border-color: var(--accent-dim); }

  @media (max-width: 900px) {
  }
`;
}

module.exports = { getDashboardCss };
