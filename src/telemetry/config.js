/**
 * Telemetry configuration management
 *
 * Stores telemetry preferences in ~/.git-watchtower/config.json
 * (separate from per-project .watchtowerrc.json).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const CONFIG_DIR_NAME = '.git-watchtower';
const CONFIG_FILE_NAME = 'config.json';

/**
 * Get the telemetry config directory path
 * @returns {string}
 */
function getConfigDir() {
  return path.join(os.homedir(), CONFIG_DIR_NAME);
}

/**
 * Get the telemetry config file path
 * @returns {string}
 */
function getConfigPath() {
  return path.join(getConfigDir(), CONFIG_FILE_NAME);
}

/**
 * @typedef {object} UserConfig
 * @property {boolean} [telemetryEnabled]
 * @property {string} [distinctId]
 * @property {string} [promptedAt]
 * @property {string} [lastSeenUpdateVersion]
 */

/**
 * Load user config from disk. The same file persists telemetry preferences
 * and update-modal state — fields are individually optional because the
 * file may exist before the telemetry consent prompt has run.
 * @returns {UserConfig | null}
 */
function loadTelemetryConfig() {
  try {
    const data = fs.readFileSync(getConfigPath(), 'utf8');
    const config = JSON.parse(data);
    if (config && typeof config === 'object') {
      return config;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Save telemetry config to disk
 *
 * `distinctId` is optional: when the user declines telemetry we persist
 * `{ telemetryEnabled: false, promptedAt }` only — no persistent identifier
 * lands on disk for declining users. `getOrCreateDistinctId` already
 * handles the missing case by minting a fresh UUID if the user later
 * opts in.
 *
 * @param {UserConfig} config
 */
function saveTelemetryConfig(config) {
  const dir = getConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2) + '\n', 'utf8');
}

/**
 * Get existing distinctId or create a new one
 * @returns {string}
 */
function getOrCreateDistinctId() {
  const config = loadTelemetryConfig();
  if (config && config.distinctId) {
    return config.distinctId;
  }
  return crypto.randomUUID();
}

/**
 * Check if telemetry is enabled
 *
 * Priority:
 * 1. GIT_WATCHTOWER_TELEMETRY=false env var always disables (CI/corporate)
 * 2. If no config file exists, telemetry is disabled (not yet prompted)
 * 3. Otherwise, return the stored preference
 *
 * @returns {boolean}
 */
function isTelemetryEnabled() {
  const envVar = process.env.GIT_WATCHTOWER_TELEMETRY;
  if (envVar !== undefined && envVar.toLowerCase() === 'false') {
    return false;
  }

  const config = loadTelemetryConfig();
  if (!config) {
    return false;
  }

  return config.telemetryEnabled === true;
}

/**
 * Check if the user has already been prompted for telemetry.
 * Looks specifically at `promptedAt` rather than config existence — the
 * same file also stores non-telemetry preferences (e.g. lastSeenUpdateVersion),
 * so a present file does not on its own mean the consent prompt has run.
 * @returns {boolean}
 */
function hasBeenPrompted() {
  const config = loadTelemetryConfig();
  return !!(config && typeof config.promptedAt === 'string');
}

/**
 * Check if telemetry is force-disabled via environment variable
 * @returns {boolean}
 */
function isEnvDisabled() {
  const envVar = process.env.GIT_WATCHTOWER_TELEMETRY;
  return envVar !== undefined && envVar.toLowerCase() === 'false';
}

/**
 * Get the last update version the user has been notified about.
 * Used to suppress re-popping the update modal on subsequent launches
 * for a version they've already seen.
 * @returns {string | null}
 */
function getLastSeenUpdateVersion() {
  const config = loadTelemetryConfig();
  if (config && typeof config.lastSeenUpdateVersion === 'string') {
    return config.lastSeenUpdateVersion;
  }
  return null;
}

/**
 * Persist the version the user has just been notified about. Merges into
 * the existing user-config file so telemetry preferences are preserved.
 * @param {string} version
 */
function setLastSeenUpdateVersion(version) {
  const existing = loadTelemetryConfig() || {};
  saveTelemetryConfig({
    ...existing,
    lastSeenUpdateVersion: version,
  });
}

module.exports = {
  getConfigDir,
  getConfigPath,
  loadTelemetryConfig,
  saveTelemetryConfig,
  getOrCreateDistinctId,
  isTelemetryEnabled,
  hasBeenPrompted,
  isEnvDisabled,
  getLastSeenUpdateVersion,
  setLastSeenUpdateVersion,
};
