/**
 * Static server utilities — MIME types, live reload, diff parsing
 * @module server/static
 */

const fs = require('fs');
const path = require('path');

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
 * Resolve a static-server request candidate to a safe, realpath'd path
 * inside the static root.
 *
 * The critical property: the returned `path` is the realpath-resolved
 * target, so all downstream file reads operate on the same bytes the
 * containment check approved. Previously the server would realpath the
 * candidate for the 403 check but then read the pre-realpath path — a
 * TOCTOU window where a symlink inside the static dir could be swapped
 * between check and read to point outside the root.
 *
 * Contract:
 * - 'ok'        → the candidate exists inside `realStaticDir`; serve `path`.
 * - 'missing'   → the candidate resolves (or would resolve) inside the
 *                 root but doesn't exist. Callers can try an extension
 *                 fallback (e.g. `.html`) or return 404.
 * - 'forbidden' → the candidate resolves outside the root, via symlink
 *                 or via path traversal like `../../etc/passwd`. Return
 *                 403; do not attempt fallbacks, since the attacker
 *                 controls the request.
 *
 * @param {string} candidate - Unresolved absolute path (e.g.
 *   `path.join(STATIC_DIR, pathname)`).
 * @param {string} realStaticDir - The realpath'd absolute path of the
 *   static root. Callers should cache this per-request.
 * @returns {{ status: 'ok', path: string } | { status: 'missing' } | { status: 'forbidden' }}
 */
function resolveStaticPath(candidate, realStaticDir) {
  const resolvedCandidate = path.resolve(candidate);
  let realPath;
  let exists;
  try {
    realPath = fs.realpathSync(resolvedCandidate);
    exists = true;
  } catch (_) {
    // Doesn't exist. Fall back to the normalized form so path-traversal
    // attempts against non-existent files (`../../etc/passwd`) still get
    // rejected with 403 instead of silently 404'ing.
    realPath = resolvedCandidate;
    exists = false;
  }

  if (realPath !== realStaticDir && !realPath.startsWith(realStaticDir + path.sep)) {
    return { status: 'forbidden' };
  }
  if (!exists) {
    return { status: 'missing' };
  }
  return { status: 'ok', path: realPath };
}

module.exports = {
  MIME_TYPES,
  getMimeType,
  LIVE_RELOAD_SCRIPT,
  injectLiveReload,
  resolveStaticPath,
};
