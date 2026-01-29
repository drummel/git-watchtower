/**
 * Configuration schema and defaults
 * Defines the structure and validation for Git Watchtower configuration
 */

const { ConfigError, ValidationError } = require('../utils/errors');

/**
 * @typedef {'static' | 'command' | 'none'} ServerMode
 */

/**
 * @typedef {Object} ServerConfig
 * @property {ServerMode} mode - Server mode
 * @property {string} staticDir - Directory for static files
 * @property {string} command - Command for command mode
 * @property {number} port - Server port
 * @property {boolean} restartOnSwitch - Restart on branch switch
 */

/**
 * @typedef {Object} Config
 * @property {ServerConfig} server - Server configuration
 * @property {string} remoteName - Git remote name
 * @property {boolean} autoPull - Auto-pull enabled
 * @property {number} gitPollInterval - Polling interval in ms
 * @property {boolean} soundEnabled - Sound notifications enabled
 * @property {number} visibleBranches - Number of visible branches
 */

/**
 * Valid server modes
 */
const SERVER_MODES = ['static', 'command', 'none'];

/**
 * Configuration defaults
 * @type {Config}
 */
const DEFAULTS = {
  server: {
    mode: /** @type {ServerMode} */ ('static'),
    staticDir: 'public',
    command: '',
    port: 3000,
    restartOnSwitch: true,
  },
  remoteName: 'origin',
  autoPull: true,
  gitPollInterval: 5000,
  soundEnabled: true,
  visibleBranches: 7,
  casinoMode: false,
};

/**
 * Configuration limits
 */
const LIMITS = {
  port: { min: 1, max: 65535 },
  gitPollInterval: { min: 1000, max: 300000 }, // 1s to 5min
  visibleBranches: { min: 1, max: 50 },
};

/**
 * Get default configuration
 * @returns {Config}
 */
function getDefaultConfig() {
  return {
    server: { ...DEFAULTS.server },
    remoteName: DEFAULTS.remoteName,
    autoPull: DEFAULTS.autoPull,
    gitPollInterval: DEFAULTS.gitPollInterval,
    soundEnabled: DEFAULTS.soundEnabled,
    visibleBranches: DEFAULTS.visibleBranches,
    casinoMode: DEFAULTS.casinoMode,
  };
}

/**
 * Validate a port number
 * @param {*} port - Port to validate
 * @returns {number}
 * @throws {ValidationError}
 */
function validatePort(port) {
  const num = Number(port);
  if (isNaN(num) || !Number.isInteger(num)) {
    throw ValidationError.invalidPort(port);
  }
  if (num < LIMITS.port.min || num > LIMITS.port.max) {
    throw ValidationError.invalidPort(port);
  }
  return num;
}

/**
 * Validate server mode
 * @param {*} mode - Mode to validate
 * @returns {ServerMode}
 * @throws {ConfigError}
 */
function validateServerMode(mode) {
  if (!SERVER_MODES.includes(mode)) {
    throw ConfigError.invalid(
      `Invalid server mode: "${mode}". Must be one of: ${SERVER_MODES.join(', ')}`,
      { field: 'server.mode', value: mode, valid: SERVER_MODES }
    );
  }
  return mode;
}

/**
 * Validate poll interval
 * @param {*} interval - Interval to validate
 * @returns {number}
 * @throws {ConfigError}
 */
function validatePollInterval(interval) {
  const num = Number(interval);
  if (isNaN(num) || num < LIMITS.gitPollInterval.min || num > LIMITS.gitPollInterval.max) {
    throw ConfigError.invalid(
      `Invalid poll interval: ${interval}. Must be between ${LIMITS.gitPollInterval.min}ms and ${LIMITS.gitPollInterval.max}ms`,
      { field: 'gitPollInterval', value: interval }
    );
  }
  return Math.round(num);
}

/**
 * Validate visible branches count
 * @param {*} count - Count to validate
 * @returns {number}
 * @throws {ConfigError}
 */
function validateVisibleBranches(count) {
  const num = Number(count);
  if (isNaN(num) || !Number.isInteger(num)) {
    throw ConfigError.invalid(
      `Invalid visible branches: ${count}. Must be an integer`,
      { field: 'visibleBranches', value: count }
    );
  }
  if (num < LIMITS.visibleBranches.min || num > LIMITS.visibleBranches.max) {
    throw ConfigError.invalid(
      `Invalid visible branches: ${count}. Must be between ${LIMITS.visibleBranches.min} and ${LIMITS.visibleBranches.max}`,
      { field: 'visibleBranches', value: count }
    );
  }
  return num;
}

/**
 * Validate and normalize a full configuration object
 * @param {Object} config - Configuration to validate
 * @returns {Config}
 * @throws {ConfigError}
 */
function validateConfig(config) {
  if (!config || typeof config !== 'object') {
    throw ConfigError.invalid('Configuration must be an object');
  }

  const result = getDefaultConfig();

  // Validate server config
  if (config.server) {
    if (typeof config.server !== 'object') {
      throw ConfigError.invalid('server must be an object');
    }

    if (config.server.mode !== undefined) {
      result.server.mode = validateServerMode(config.server.mode);
    }

    if (config.server.port !== undefined) {
      result.server.port = validatePort(config.server.port);
    }

    if (config.server.staticDir !== undefined) {
      if (typeof config.server.staticDir !== 'string') {
        throw ConfigError.invalid('server.staticDir must be a string');
      }
      result.server.staticDir = config.server.staticDir;
    }

    if (config.server.command !== undefined) {
      if (typeof config.server.command !== 'string') {
        throw ConfigError.invalid('server.command must be a string');
      }
      result.server.command = config.server.command;
    }

    if (config.server.restartOnSwitch !== undefined) {
      result.server.restartOnSwitch = Boolean(config.server.restartOnSwitch);
    }
  }

  // Validate Git settings
  if (config.remoteName !== undefined) {
    if (typeof config.remoteName !== 'string' || !config.remoteName.trim()) {
      throw ConfigError.invalid('remoteName must be a non-empty string');
    }
    result.remoteName = config.remoteName.trim();
  }

  if (config.autoPull !== undefined) {
    result.autoPull = Boolean(config.autoPull);
  }

  if (config.gitPollInterval !== undefined) {
    result.gitPollInterval = validatePollInterval(config.gitPollInterval);
  }

  // Validate UI settings
  if (config.soundEnabled !== undefined) {
    result.soundEnabled = Boolean(config.soundEnabled);
  }

  if (config.visibleBranches !== undefined) {
    result.visibleBranches = validateVisibleBranches(config.visibleBranches);
  }

  if (config.casinoMode !== undefined) {
    result.casinoMode = Boolean(config.casinoMode);
  }

  return result;
}

/**
 * Migrate old config format to new format
 * @param {Object} config - Old config
 * @returns {Config}
 */
function migrateConfig(config) {
  // Already in new format
  if (config.server) {
    return validateConfig(config);
  }

  // Convert old format to new
  const newConfig = getDefaultConfig();

  if (config.noServer) {
    newConfig.server.mode = 'none';
  }
  if (config.port !== undefined) {
    newConfig.server.port = validatePort(config.port);
  }
  if (config.staticDir !== undefined) {
    newConfig.server.staticDir = config.staticDir;
  }
  if (config.gitPollInterval !== undefined) {
    newConfig.gitPollInterval = validatePollInterval(config.gitPollInterval);
  }
  if (typeof config.soundEnabled === 'boolean') {
    newConfig.soundEnabled = config.soundEnabled;
  }
  if (config.visibleBranches !== undefined) {
    newConfig.visibleBranches = validateVisibleBranches(config.visibleBranches);
  }

  return newConfig;
}

module.exports = {
  SERVER_MODES,
  DEFAULTS,
  LIMITS,
  getDefaultConfig,
  validatePort,
  validateServerMode,
  validatePollInterval,
  validateVisibleBranches,
  validateConfig,
  migrateConfig,
};
