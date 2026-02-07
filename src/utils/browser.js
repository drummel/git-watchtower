/**
 * Cross-platform browser opening utility
 * @module utils/browser
 */

const { exec } = require('child_process');

/**
 * Open a URL in the user's default browser.
 * Cross-platform: macOS (open), Windows (start), Linux (xdg-open).
 * @param {string} url - The URL to open
 * @param {function} [onError] - Optional error callback (receives Error)
 */
function openInBrowser(url, onError) {
  const platform = process.platform;
  let command;

  if (platform === 'darwin') {
    command = `open "${url}"`;
  } else if (platform === 'win32') {
    command = `start "" "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }

  exec(command, (error) => {
    if (error && onError) {
      onError(error);
    }
  });
}

module.exports = { openInBrowser };
