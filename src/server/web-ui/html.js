/**
 * HTML skeleton for the Git Watchtower web dashboard.
 * Contains the body markup and modal templates.
 * @module server/web-ui/html
 */

/**
 * Get the dashboard HTML body markup.
 * @returns {string} HTML body content (elements only, no body/html tags)
 */
function getDashboardHtml() {
  return `
<div class="header">
  <div class="header-left">
    <span class="header-title">&#x1f3f0; Git Watchtower</span>
    <span class="header-version" id="version"></span>
    <span class="header-project" id="project-name">-</span>
  </div>
  <div class="header-right">
    <button class="notif-btn" id="notif-btn" title="Enable desktop notifications">notifications</button>
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

  <div class="side-panel" id="side-panel">
    <div class="panel-header">Activity Log <button class="sidebar-toggle" id="sidebar-toggle" title="Toggle sidebar">&#x25b6;</button></div>
    <div class="activity-log" id="activity-log"></div>
  </div>

  <div class="footer" id="footer">
    <span><kbd>j</kbd><kbd>k</kbd> navigate</span>
    <span><kbd>Enter</kbd> switch</span>
    <span><kbd>/</kbd> search</span>
    <span><kbd>b</kbd> actions</span>
    <span><kbd>i</kbd> info</span>
    <span><kbd>l</kbd> logs</span>
    <span><kbd>p</kbd> pull</span>
    <span><kbd>f</kbd> fetch</span>
    <span><kbd>S</kbd> stash</span>
    <span><kbd>d</kbd> cleanup</span>
    <span><kbd>h</kbd> history</span>
    <span><kbd>Esc</kbd> close</span>
    <span class="stats-bar" id="stats-bar"></span>
  </div>
</div>

<div class="flash" id="flash"></div>
<div class="confirm-overlay" id="confirm-overlay">
  <div class="confirm-box" id="confirm-box"></div>
</div>
<div class="toast-container" id="toast-container"></div>

<!-- Log Viewer Modal -->
<div class="modal-overlay" id="log-viewer-overlay">
  <div class="modal-box" style="min-width:500px;max-width:750px;">
    <div class="modal-title">
      Server Logs
      <button class="modal-close" id="log-viewer-close">&times;</button>
    </div>
    <div class="log-viewer-tabs" id="log-viewer-tabs">
      <button class="log-viewer-tab active" data-tab="server">Server</button>
      <button class="log-viewer-tab" data-tab="activity">Activity</button>
    </div>
    <div class="log-viewer-content" id="log-viewer-content"></div>
  </div>
</div>

<!-- Branch Action Modal -->
<div class="modal-overlay" id="branch-action-overlay">
  <div class="modal-box">
    <div class="modal-title">
      <span id="branch-action-title">Branch Actions</span>
      <button class="modal-close" id="branch-action-close">&times;</button>
    </div>
    <div class="action-list" id="branch-action-list"></div>
  </div>
</div>

<!-- Info Panel Modal -->
<div class="modal-overlay" id="info-overlay">
  <div class="modal-box" style="min-width:380px;">
    <div class="modal-title">
      Server Info
      <button class="modal-close" id="info-close">&times;</button>
    </div>
    <div class="info-grid" id="info-grid"></div>
  </div>
</div>

<!-- Branch Cleanup Modal -->
<div class="modal-overlay" id="cleanup-overlay">
  <div class="modal-box">
    <div class="modal-title">
      Branch Cleanup
      <button class="modal-close" id="cleanup-close">&times;</button>
    </div>
    <div id="cleanup-content"></div>
  </div>
</div>

<!-- Update Notification Modal -->
<div class="modal-overlay" id="update-overlay">
  <div class="modal-box" style="min-width:380px;">
    <div class="modal-title">
      Update Available
      <button class="modal-close" id="update-close">&times;</button>
    </div>
    <div id="update-content"></div>
  </div>
</div>

<!-- Stash Confirm Modal -->
<div class="modal-overlay" id="stash-overlay">
  <div class="modal-box" style="min-width:380px;">
    <div class="modal-title">
      Stash Changes
      <button class="modal-close" id="stash-close">&times;</button>
    </div>
    <div id="stash-content"></div>
  </div>
</div>
`;
}

module.exports = { getDashboardHtml };
