/**
 * Configuration file loading and saving
 */

const fs = require('fs');
const path = require('path');
const { ConfigError } = require('../utils/errors');
const { getDefaultConfig, validateConfig, migrateConfig } = require('./schema');

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

  // Migrate old format if needed
  return migrateConfig(raw);
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

/**
 * Apply CLI arguments to configuration
 * CLI args take precedence over config file values
 * @param {Object} config - Base configuration
 * @param {Object} cliArgs - CLI arguments
 * @returns {Object} - Merged configuration
 */
function applyCliArgs(config, cliArgs) {
  const result = JSON.parse(JSON.stringify(config)); // Deep clone

  // Server settings
  if (cliArgs.mode !== undefined && cliArgs.mode !== null) {
    result.server.mode = cliArgs.mode;
  }
  if (cliArgs.noServer) {
    result.server.mode = 'none';
  }
  if (cliArgs.port !== undefined && cliArgs.port !== null) {
    result.server.port = cliArgs.port;
  }
  if (cliArgs.staticDir !== undefined && cliArgs.staticDir !== null) {
    result.server.staticDir = cliArgs.staticDir;
  }
  if (cliArgs.command !== undefined && cliArgs.command !== null) {
    result.server.command = cliArgs.command;
  }
  if (cliArgs.restartOnSwitch !== undefined && cliArgs.restartOnSwitch !== null) {
    result.server.restartOnSwitch = cliArgs.restartOnSwitch;
  }

  // Git settings
  if (cliArgs.remote !== undefined && cliArgs.remote !== null) {
    result.remoteName = cliArgs.remote;
  }
  if (cliArgs.autoPull !== undefined && cliArgs.autoPull !== null) {
    result.autoPull = cliArgs.autoPull;
  }
  if (cliArgs.pollInterval !== undefined && cliArgs.pollInterval !== null) {
    result.gitPollInterval = cliArgs.pollInterval;
  }

  // UI settings
  if (cliArgs.sound !== undefined && cliArgs.sound !== null) {
    result.soundEnabled = cliArgs.sound;
  }
  if (cliArgs.visibleBranches !== undefined && cliArgs.visibleBranches !== null) {
    result.visibleBranches = cliArgs.visibleBranches;
  }

  return result;
}

/**
 * Parse CLI arguments
 * @param {string[]} [argv] - Command line arguments (defaults to process.argv.slice(2))
 * @returns {Object} - Parsed arguments
 */
function parseCliArgs(argv = process.argv.slice(2)) {
  const result = {
    // Server settings
    mode: null,
    noServer: false,
    port: null,
    staticDir: null,
    command: null,
    restartOnSwitch: null,
    // Git settings
    remote: null,
    autoPull: null,
    pollInterval: null,
    // UI settings
    sound: null,
    visibleBranches: null,
    // Special flags
    init: false,
    help: false,
    version: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    switch (arg) {
      // Server settings
      case '--mode':
        result.mode = argv[++i];
        break;
      case '--no-server':
        result.noServer = true;
        break;
      case '--port':
      case '-p':
        result.port = parseInt(argv[++i], 10);
        break;
      case '--static-dir':
        result.staticDir = argv[++i];
        break;
      case '--command':
      case '-c':
        result.command = argv[++i];
        break;
      case '--restart-on-switch':
        result.restartOnSwitch = true;
        break;
      case '--no-restart-on-switch':
        result.restartOnSwitch = false;
        break;

      // Git settings
      case '--remote':
      case '-r':
        result.remote = argv[++i];
        break;
      case '--auto-pull':
        result.autoPull = true;
        break;
      case '--no-auto-pull':
        result.autoPull = false;
        break;
      case '--poll-interval':
        result.pollInterval = parseInt(argv[++i], 10) * 1000; // Convert seconds to ms
        break;

      // UI settings
      case '--sound':
        result.sound = true;
        break;
      case '--no-sound':
        result.sound = false;
        break;
      case '--visible-branches':
        result.visibleBranches = parseInt(argv[++i], 10);
        break;

      // Special flags
      case '--init':
        result.init = true;
        break;
      case '--help':
      case '-h':
        result.help = true;
        break;
      case '--version':
      case '-v':
        result.version = true;
        break;
    }
  }

  return result;
}

/**
 * Ensure configuration exists
 * Loads from file, runs wizard if needed, and applies CLI args
 * @param {Object} cliArgs - CLI arguments
 * @param {Object} [options] - Options
 * @param {string} [options.projectRoot] - Project root directory
 * @param {boolean} [options.interactive=true] - Allow interactive prompts
 * @param {Function} [options.runWizard] - Wizard function to run if needed
 * @returns {Promise<Object>} - Final configuration
 */
async function ensureConfig(cliArgs, options = {}) {
  const { projectRoot, interactive = true, runWizard } = options;

  // Check if --init flag was passed (force reconfiguration)
  if (cliArgs.init && runWizard) {
    const config = await runWizard();
    return applyCliArgs(config, cliArgs);
  }

  // Load existing config
  let config = loadConfig(projectRoot);

  // If no config exists
  if (!config) {
    if (runWizard && interactive && process.stdin.isTTY) {
      config = await runWizard();
    } else {
      // Use defaults
      config = getDefaultConfig();
    }
  }

  // Apply CLI args over config
  return applyCliArgs(config, cliArgs);
}

module.exports = {
  CONFIG_FILE_NAME,
  getConfigPath,
  configExists,
  loadConfigRaw,
  loadConfig,
  saveConfig,
  deleteConfig,
  applyCliArgs,
  parseCliArgs,
  ensureConfig,
};
