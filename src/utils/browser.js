/**
 * Cross-platform browser opening utility
 * @module utils/browser
 */

const { execFile } = require('child_process');

/**
 * Validate that a string is a safe URL to pass to OS open commands.
 *
 * Rejects:
 * - non-string / empty input
 * - schemes other than http(s) / file
 * - control characters in any input (would mangle argv parsing on every
 *   open-tool we target)
 * - on Windows only: cmd.exe shell metacharacters (`& | < > ^ " ! %`)
 *   because the Windows path passes the URL through `cmd.exe /c start`
 *   to invoke the `start` shell builtin. macOS (`open`) and Linux
 *   (`xdg-open`) go through `execFile` with an args array — no shell
 *   involved — so those characters are safe to pass verbatim there.
 *
 * The platform-aware split fixes a real-world bug: legitimate URLs
 * containing `&` (query separators), `%` (percent-encoding — produced
 * by `encodeURIComponent` for any branch name with `/`), or `!` were
 * being rejected on macOS/Linux where they pose no shell-injection
 * risk. The TUI's "open branch on web" action silently no-op'd for
 * any branch like `feat/my-thing` because its built URL contained
 * `feat%2Fmy-thing`.
 *
 * @param {string} url
 * @param {string} [platform=process.platform] - Override for tests.
 * @returns {boolean}
 */
function isSafeUrl(url, platform) {
  if (platform === undefined) platform = process.platform;
  if (!url || typeof url !== 'string') return false;
  // Must start with http://, https://, or file://
  if (!/^https?:\/\/|^file:\/\//i.test(url)) return false;
  // Reject embedded control bytes regardless of platform — every
  // open-tool's argv parser would mangle them, and there is no
  // legitimate reason for a URL to contain them.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(url)) return false;
  // Windows-only: reject the chars cmd.exe interprets in unquoted args.
  if (platform === 'win32' && /[&|<>^"!%]/.test(url)) return false;
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
