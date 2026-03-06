/**
 * Version check utility - queries npm registry for latest version
 * Uses only Node.js built-in modules (zero dependencies)
 */

const https = require('https');
const { version: currentVersion } = require('../../package.json');

/**
 * Compare two semver version strings
 * @param {string} a - First version (e.g. '1.8.0')
 * @param {string} b - Second version (e.g. '1.7.0')
 * @returns {number} 1 if a > b, -1 if a < b, 0 if equal
 */
function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

/**
 * Check npm registry for a newer version of git-watchtower
 * @returns {Promise<string|null>} Latest version string if newer, or null
 */
function checkForUpdate() {
  return new Promise((resolve) => {
    const req = https.get(
      'https://registry.npmjs.org/git-watchtower/latest',
      { timeout: 5000 },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(null);
          return;
        }
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const { version } = JSON.parse(data);
            resolve(compareVersions(version, currentVersion) > 0 ? version : null);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

/** Default interval between periodic update checks (4 hours in ms) */
const UPDATE_CHECK_INTERVAL = 4 * 60 * 60 * 1000;

/**
 * Create a periodic update checker that re-checks npm at a fixed interval.
 * @param {(latestVersion: string) => void} onUpdateFound - Called when a new version is detected
 * @param {number} [interval] - Check interval in ms (default: 4 hours)
 * @returns {{ stop: () => void }} Controller with stop() to clear the timer
 */
function startPeriodicUpdateCheck(onUpdateFound, interval = UPDATE_CHECK_INTERVAL) {
  const timerId = setInterval(() => {
    checkForUpdate()
      .then((latestVersion) => {
        if (latestVersion) onUpdateFound(latestVersion);
      })
      .catch(() => {});
  }, interval);

  return { stop: () => clearInterval(timerId) };
}

module.exports = { checkForUpdate, compareVersions, startPeriodicUpdateCheck, UPDATE_CHECK_INTERVAL };
