/**
 * Cross-platform browser opening utility
 * @module utils/browser
 */

const { execFile } = require('child_process');

/**
 * Open a URL in the user's default browser.
 * Cross-platform: macOS (open), Windows (start), Linux (xdg-open).
 * Uses execFile (no shell) to prevent command injection via crafted URLs.
 * @param {string} url - The URL to open
 * @param {function} [onError] - Optional error callback (receives Error)
 */
function openInBrowser(url, onError) {
  const platform = process.platform;
  let command;
  let args;

  if (platform === 'darwin') {
    command = 'open';
    args = [url];
  } else if (platform === 'win32') {
    // On Windows, 'start' is a shell built-in, so we must use cmd.exe.
    // The URL is passed as a separate argument, not interpolated into a string.
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

module.exports = { openInBrowser };
