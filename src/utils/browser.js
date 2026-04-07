/**
 * Cross-platform browser opening utility
 * @module utils/browser
 */

const { execFile } = require('child_process');

/**
 * Validate that a string is a safe URL to pass to OS open commands.
 * Rejects URLs containing shell metacharacters that could lead to
 * command injection when passed through cmd.exe on Windows.
 * @param {string} url
 * @returns {boolean}
 */
function isSafeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  // Must start with http://, https://, or file://
  if (!/^https?:\/\/|^file:\/\//i.test(url)) return false;
  // Reject shell metacharacters that cmd.exe would interpret
  if (/[&|<>^"!%]/.test(url)) return false;
  return true;
}

/**
 * Open a URL in the user's default browser.
 * Cross-platform: macOS (open), Windows (start), Linux (xdg-open).
 * Uses execFile (no shell) to prevent command injection via crafted URLs.
 * @param {string} url - The URL to open
 * @param {function} [onError] - Optional error callback (receives Error)
 */
function openInBrowser(url, onError) {
  if (!isSafeUrl(url)) {
    if (onError) {
      onError(new Error(`Refusing to open unsafe URL: ${url}`));
    }
    return;
  }

  const platform = process.platform;
  let command;
  let args;

  if (platform === 'darwin') {
    command = 'open';
    args = [url];
  } else if (platform === 'win32') {
    // On Windows, 'start' is a shell built-in, so we must use cmd.exe.
    // URL is validated above to reject shell metacharacters.
    command = 'cmd.exe';
    args = ['/c', 'start', '', url];
  } else {
    command = 'xdg-open';
    args = [url];
  }

  execFile(command, args, (error) => {
    if (error && onError) {
      onError(error);
    }
  });
}

module.exports = { openInBrowser, isSafeUrl };
