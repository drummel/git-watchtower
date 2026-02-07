/**
 * Static server utilities — MIME types, live reload, diff parsing
 * @module server/static
 */

/**
 * MIME type mapping by file extension.
 */
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.pdf': 'application/pdf',
};

/**
 * Get MIME type for a file extension.
 * @param {string} ext - File extension with dot (e.g., '.html')
 * @returns {string} MIME type, defaults to 'application/octet-stream'
 */
function getMimeType(ext) {
  return MIME_TYPES[(ext || '').toLowerCase()] || 'application/octet-stream';
}

/**
 * Live reload script to inject into HTML pages.
 * Connects via Server-Sent Events (SSE) and reloads on 'reload' event.
 */
const LIVE_RELOAD_SCRIPT = `
<script>
(function() {
  var source = new EventSource('/livereload');
  source.onmessage = function(e) {
    if (e.data === 'reload') location.reload();
  };
})();
</script>
</body>`;

/**
 * Inject live reload script into HTML content.
 * @param {string} html - HTML content
 * @returns {string} HTML with live reload script injected before </body>
 */
function injectLiveReload(html) {
  if (html.includes('</body>')) {
    return html.replace('</body>', LIVE_RELOAD_SCRIPT);
  }
  return html;
}

/**
 * Parse git diff --stat output into { added, deleted } counts.
 * @param {string} diffOutput - Output from `git diff --stat`
 * @returns {{ added: number, deleted: number }}
 */
function parseDiffStats(diffOutput) {
  if (!diffOutput) return { added: 0, deleted: 0 };

  // Parse the summary line: "X files changed, Y insertions(+), Z deletions(-)"
  const match = diffOutput.match(/(\d+) insertions?\(\+\).*?(\d+) deletions?\(-\)/);
  if (match) {
    return { added: parseInt(match[1], 10), deleted: parseInt(match[2], 10) };
  }

  // Try to match just insertions or just deletions
  const insertMatch = diffOutput.match(/(\d+) insertions?\(\+\)/);
  const deleteMatch = diffOutput.match(/(\d+) deletions?\(-\)/);
  return {
    added: insertMatch ? parseInt(insertMatch[1], 10) : 0,
    deleted: deleteMatch ? parseInt(deleteMatch[1], 10) : 0,
  };
}

module.exports = {
  MIME_TYPES,
  getMimeType,
  LIVE_RELOAD_SCRIPT,
  injectLiveReload,
  parseDiffStats,
};
