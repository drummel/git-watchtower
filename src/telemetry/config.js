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
 * Load telemetry config from disk
 * @returns {{ telemetryEnabled: boolean, distinctId: string, promptedAt: string } | null}
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
 * @param {{ telemetryEnabled: boolean, distinctId: string, promptedAt: string }} config
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
 * Check if the user has already been prompted for telemetry
 * @returns {boolean}
 */
function hasBeenPrompted() {
  return loadTelemetryConfig() !== null;
}

/**
 * Check if telemetry is force-disabled via environment variable
 * @returns {boolean}
 */
function isEnvDisabled() {
  const envVar = process.env.GIT_WATCHTOWER_TELEMETRY;
  return envVar !== undefined && envVar.toLowerCase() === 'false';
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
};
