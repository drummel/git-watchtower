/**
 * Pure utility functions shared between Node (server) and the web dashboard.
 *
 * These are extracted so they can be unit-tested in Node while still being
 * inlined into the browser bundle by the assembly step in js.js.
 *
 * Every function here MUST be self-contained (no closures over external
 * state) so it can be serialised with Function.prototype.toString() and
 * embedded in a <script> tag.
 *
 * @module server/web-ui/pure
 */

/**
 * Escape a string for safe insertion into HTML.
 * @param {string} s
 * @returns {string}
 */
function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/**
 * Format a date string as a relative time (e.g. "5m ago", "2d ago").
 * @param {string} dateStr - ISO date string or any value accepted by `new Date()`
 * @returns {string}
 */
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

/**
 * Render a sparkline Unicode string as HTML bar elements.
 * @param {string} sparkStr - String of Unicode block characters (U+2581–U+2588)
 * @returns {string} HTML string
 */
function renderSparklineBars(sparkStr) {
  if (!sparkStr) return '';
  var chars = '\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588';
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

/**
 * Format a number in compact notation (e.g. 1500 → "1.5k").
 * @param {number} n
 * @returns {string}
 */
function fmtCompact(n) {
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1) + 'k';
  if (n < 1000000) return Math.round(n / 1000) + 'k';
  return (n / 1000000).toFixed(1) + 'm';
}

/**
 * Filter and sort branches for display.
 * Pure function — all dependencies passed as arguments.
 * @param {Array} branches - Full branch list from state
 * @param {Object} options
 * @param {string} [options.searchQuery=''] - Filter string
 * @param {string[]} [options.pinnedBranches=[]] - Branch names pinned to top
 * @param {string} [options.sortOrder='default'] - 'default' | 'alpha' | 'recent'
 * @returns {Array} Filtered and sorted branch list
 */
function getDisplayBranches(branches, options) {
  if (!branches) return [];
  var searchQuery = (options && options.searchQuery) || '';
  var pinnedBranches = (options && options.pinnedBranches) || [];
  var sortOrder = (options && options.sortOrder) || 'default';

  var result = branches.slice();

  if (searchQuery) {
    var q = searchQuery.toLowerCase();
    result = result.filter(function(b) {
      return b.name.toLowerCase().indexOf(q) !== -1;
    });
  }

  // Build pin lookup once
  var pinSet = {};
  for (var i = 0; i < pinnedBranches.length; i++) pinSet[pinnedBranches[i]] = true;

  if (sortOrder === 'alpha') {
    result.sort(function(a, b) {
      var aPin = pinSet[a.name] ? 1 : 0;
      var bPin = pinSet[b.name] ? 1 : 0;
      if (aPin !== bPin) return bPin - aPin;
      return a.name.localeCompare(b.name);
    });
  } else if (sortOrder === 'recent') {
    result.sort(function(a, b) {
      var aPin = pinSet[a.name] ? 1 : 0;
      var bPin = pinSet[b.name] ? 1 : 0;
      if (aPin !== bPin) return bPin - aPin;
      var aDate = a.date ? new Date(a.date).getTime() : 0;
      var bDate = b.date ? new Date(b.date).getTime() : 0;
      return bDate - aDate;
    });
  } else if (pinnedBranches.length > 0) {
    // Default sort: only move pinned branches to top
    result.sort(function(a, b) {
      var aPin = pinSet[a.name] ? 1 : 0;
      var bPin = pinSet[b.name] ? 1 : 0;
      return bPin - aPin;
    });
  }

  return result;
}

module.exports = { escHtml, timeAgo, renderSparklineBars, fmtCompact, getDisplayBranches };
