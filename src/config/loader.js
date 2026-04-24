/**
 * Configuration file loading and saving
 */

const fs = require('fs');
const path = require('path');
const { ConfigError } = require('../utils/errors');
const { validateConfig, migrateConfig } = require('./schema');

/**
 * Default configuration file name
 */
const CONFIG_FILE_NAME = '.watchtowerrc.json';

/**
 * Get the configuration file path
 * @param {string} [projectRoot] - Project root directory
 * @returns {string}
 */
function getConfigPath(projectRoot = process.cwd()) {
  return path.join(projectRoot, CONFIG_FILE_NAME);
}

/**
 * Check if configuration file exists
 * @param {string} [projectRoot] - Project root directory
 * @returns {boolean}
 */
function configExists(projectRoot) {
  return fs.existsSync(getConfigPath(projectRoot));
}

/**
 * Load configuration from file
 * @param {string} [projectRoot] - Project root directory
 * @returns {Object|null} - Raw config object or null if not found
 * @throws {ConfigError} - If file exists but cannot be parsed
 */
function loadConfigRaw(projectRoot) {
  const configPath = getConfigPath(projectRoot);

  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw ConfigError.parseError(error);
    }
    throw new ConfigError(
      `Failed to read configuration: ${error.message}`,
      'CONFIG_READ_ERROR',
      { path: configPath }
    );
  }
}

/**
 * Load and validate configuration from file
 * @param {string} [projectRoot] - Project root directory
 * @returns {Object|null} - Validated config or null if not found
 * @throws {ConfigError} - If config is invalid
 */
function loadConfig(projectRoot) {
  const raw = loadConfigRaw(projectRoot);

  if (!raw) {
    return null;
  }

  // Migrate old format if needed, then validate
  const migrated = migrateConfig(raw);
  return validateConfig(migrated);
}

/**
 * Save configuration to file
 * @param {Object} config - Configuration to save
 * @param {string} [projectRoot] - Project root directory
 * @throws {ConfigError} - If save fails
 */
function saveConfig(config, projectRoot) {
  const configPath = getConfigPath(projectRoot);

  try {
    // Validate before saving
    const validated = validateConfig(config);
    const content = JSON.stringify(validated, null, 2) + '\n';
    fs.writeFileSync(configPath, content, 'utf8');
  } catch (error) {
    if (error instanceof ConfigError) {
      throw error;
    }
    throw new ConfigError(
      `Failed to save configuration: ${error.message}`,
      'CONFIG_WRITE_ERROR',
      { path: configPath }
    );
  }
}

/**
 * Delete configuration file
 * @param {string} [projectRoot] - Project root directory
 * @returns {boolean} - True if deleted, false if didn't exist
 */
function deleteConfig(projectRoot) {
  const configPath = getConfigPath(projectRoot);

  if (!fs.existsSync(configPath)) {
    return false;
  }

  fs.unlinkSync(configPath);
  return true;
}

module.exports = {
  CONFIG_FILE_NAME,
  getConfigPath,
  configExists,
  loadConfigRaw,
  loadConfig,
  saveConfig,
  deleteConfig,
};
