/**
 * fs.watch recursive-option support detection.
 *
 * `fs.watch(..., { recursive: true })` was not reliable on Linux before
 * Node 20 — depending on the point release it either threw
 * ERR_FEATURE_UNAVAILABLE_ON_PLATFORM or silently ignored the flag and
 * watched only the top-level directory, leaving subdirectory changes
 * undetected. macOS and Windows have supported recursive watching for
 * much longer.
 *
 * git-watchtower declares engines.node >=20 in package.json, but users
 * can bypass that with `npm install --force`. When they do, the static-
 * server live-reload watcher needs to warn clearly rather than appear
 * to work but silently miss edits in nested directories.
 *
 * @module utils/fs-watch
 */

'use strict';

/**
 * Parse `process.version` ("v20.11.1") into a numeric major version.
 * Exported so tests can drive edge cases (malformed strings, pre-releases).
 *
 * @param {string} versionString
 * @returns {number} major version, or NaN if unparseable
 */
function parseMajor(versionString) {
  if (typeof versionString !== 'string') return NaN;
  const match = /^v?(\d+)\./.exec(versionString);
  if (!match) return NaN;
  return parseInt(match[1], 10);
}

/**
 * Decide whether fs.watch recursive mode is reliably supported on the
 * current Node/platform combination.
 *
 * @param {Object} [env] - Injected for tests.
 * @param {string} [env.version] - e.g. process.version
 * @param {string} [env.platform] - e.g. process.platform
 * @returns {{ supported: boolean, reason: string | null }}
 *   reason is a short, user-facing explanation when !supported.
 */
function getRecursiveWatchSupport(env = {}) {
  const version = env.version !== undefined ? env.version : process.version;
  const platform = env.platform !== undefined ? env.platform : process.platform;

  // macOS and Windows have supported recursive watching since well before
  // any Node version we care about.
  if (platform === 'darwin' || platform === 'win32') {
    return { supported: true, reason: null };
  }

  if (platform === 'linux') {
    const major = parseMajor(version);
    if (Number.isNaN(major)) {
      return {
        supported: false,
        reason: `could not parse Node version "${version}"`,
      };
    }
    if (major < 20) {
      return {
        supported: false,
        reason:
          `Node ${version} on Linux does not reliably support fs.watch({ recursive: true }); ` +
          'upgrade to Node >=20 (see package.json engines).',
      };
    }
    return { supported: true, reason: null };
  }

  // Unknown platform (AIX, FreeBSD, etc.). Don't claim support we can't verify.
  return {
    supported: false,
    reason: `recursive fs.watch support is not verified on platform "${platform}"`,
  };
}

module.exports = {
  parseMajor,
  getRecursiveWatchSupport,
};
