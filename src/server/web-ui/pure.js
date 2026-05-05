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
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
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

/**
 * Build a branch URL for the appropriate git hosting service.
 * Pure / browser-safe — duplicated logic lives in src/git/remote.js for
 * Node-side callers, but THIS function is the canonical implementation
 * that the web dashboard inlines into its bundle.
 *
 * @param {string} baseUrl - Repository base URL (e.g., https://github.com/user/repo)
 * @param {string} host - Hostname of the git hosting service
 * @param {string} branchName - Name of the branch
 * @returns {string}
 */
function buildBranchUrl(baseUrl, host, branchName) {
  var branch = encodeURIComponent(branchName);
  var h = String(host || '').toLowerCase();

  // Azure DevOps: dev.azure.com/org/project/_git/repo or org.visualstudio.com
  if (h === 'dev.azure.com' || /\.visualstudio\.com$/.test(h)) {
    return baseUrl + '?version=GB' + branch;
  }
  // Bitbucket Cloud
  if (h === 'bitbucket.org') return baseUrl + '/src/' + branch;
  // AWS CodeCommit
  if (/codecommit\..+\.amazonaws\.com/.test(h)) {
    return baseUrl + '/browse/refs/heads/' + branch;
  }
  // GitHub, GitLab, SourceHut, Codeberg, Gitea, Forgejo, Gogs, self-hosted
  return baseUrl + '/tree/' + branch;
}

/**
 * Build a commit URL for the appropriate git hosting service.
 * @param {string} baseUrl - Repository base URL
 * @param {string} host - Hostname
 * @param {string} sha - Commit SHA (full or short)
 * @returns {string|null}
 */
function buildCommitUrl(baseUrl, host, sha) {
  if (!sha) return null;
  var h = String(host || '').toLowerCase();
  // Bitbucket uses /commits/ (plural)
  if (h === 'bitbucket.org') return baseUrl + '/commits/' + sha;
  // GitHub, GitLab, Gitea, Forgejo, Codeberg, Azure (best-effort), self-hosted
  return baseUrl + '/commit/' + sha;
}

/**
 * Build a pull/merge-request URL for the appropriate git hosting service.
 * @param {string} baseUrl - Repository base URL
 * @param {string} host - Hostname
 * @param {string|number} prNumber - PR / MR number
 * @returns {string|null}
 */
function buildPrUrl(baseUrl, host, prNumber) {
  if (!prNumber) return null;
  var h = String(host || '').toLowerCase();
  if (h === 'bitbucket.org') return baseUrl + '/pull-requests/' + prNumber;
  // GitLab.com or any host containing "gitlab" (self-hosted gitlab.example.com)
  if (h === 'gitlab.com' || h.split('.').indexOf('gitlab') !== -1) {
    return baseUrl + '/-/merge_requests/' + prNumber;
  }
  if (h === 'dev.azure.com' || /\.visualstudio\.com$/.test(h)) {
    return baseUrl + '/pullrequest/' + prNumber;
  }
  if (/codecommit\..+\.amazonaws\.com/.test(h)) {
    return baseUrl + '/pull-requests/' + prNumber;
  }
  // GitHub, Gitea, Codeberg, Forgejo, Gogs, self-hosted
  return baseUrl + '/pull/' + prNumber;
}

module.exports = {
  escHtml,
  timeAgo,
  renderSparklineBars,
  fmtCompact,
  getDisplayBranches,
  buildBranchUrl,
  buildCommitUrl,
  buildPrUrl,
};
