/**
 * Install source detection — figures out how the running CLI was installed
 * (homebrew, npm global, source checkout) so the update flow can show the
 * correct upgrade command instead of hardcoding `npm i -g git-watchtower`.
 *
 * Result is memoized for the life of the process — install source can't
 * change between calls in the same run.
 *
 * @module utils/install-source
 */

const fs = require('fs');

/** @typedef {'homebrew' | 'npm' | 'source' | 'unknown'} InstallSource */

/** @type {InstallSource | null} */
let _cached = null;
let _detected = false;

/**
 * Classify a resolved entry-script path. Exposed for tests so they can
 * exercise every branch with a synthetic path string.
 *
 * Order matters: homebrew installs ship via npm under the hood, so the
 * resolved path contains both `Cellar` AND `node_modules`. Check Cellar
 * first or homebrew users get classified as npm.
 *
 * @param {string} resolvedPath - Result of fs.realpathSync on the entry script
 * @returns {InstallSource}
 */
function classifyPath(resolvedPath) {
  const segments = resolvedPath.split(/[\\/]+/).map((s) => s.toLowerCase());
  if (segments.includes('cellar') || segments.includes('homebrew')) return 'homebrew';
  if (segments.includes('node_modules')) return 'npm';
  return 'source';
}

/**
 * Detect how the currently-running CLI was installed.
 * Memoized — subsequent calls return the cached result.
 * @returns {InstallSource}
 */
function detectInstallSource() {
  if (_detected) return /** @type {InstallSource} */ (_cached);
  _detected = true;
  try {
    const entry = process.argv[1] || (require.main && require.main.filename);
    if (!entry) {
      _cached = 'unknown';
      return _cached;
    }
    _cached = classifyPath(fs.realpathSync(entry));
  } catch {
    _cached = 'unknown';
  }
  return _cached;
}

/**
 * Get the user-facing upgrade command for a given install source.
 * @param {InstallSource} source
 * @returns {string}
 */
function getUpdateCommand(source) {
  switch (source) {
    case 'homebrew': return 'brew update && brew upgrade git-watchtower';
    case 'npm':      return 'npm i -g git-watchtower';
    case 'source':   return 'git pull && npm install';
    default:         return 'npm i -g git-watchtower';
  }
}

/**
 * Reset the memoized result. Tests only — not part of the public API.
 * @private
 */
function _resetForTests() {
  _cached = null;
  _detected = false;
}

module.exports = {
  detectInstallSource,
  getUpdateCommand,
  classifyPath,
  _resetForTests,
};
