/**
 * Configuration schema and defaults
 * Defines the structure and validation for Git Watchtower configuration
 */

const path = require('path');
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
 * @typedef {Object} WebConfig
 * @property {boolean} enabled - Web dashboard enabled
 * @property {number} port - Web dashboard port
 */

/**
 * @typedef {Object} InactivityBackoffConfig
 * @property {boolean} enabled - Ease off polling when the repo goes quiet
 * @property {number} activeWindowMs - Grace window kept at the base rate after activity (ms)
 * @property {number} stepMs - How often the interval grows once past the grace window (ms)
 * @property {number} maxIntervalMs - Ceiling for the eased poll interval (ms)
 * @property {number} factor - Multiplier applied to the interval per step
 */

/**
 * @typedef {Object} Config
 * @property {ServerConfig} server - Server configuration
 * @property {WebConfig} web - Web dashboard configuration
 * @property {string} remoteName - Git remote name
 * @property {boolean} autoPull - Auto-pull enabled
 * @property {number} gitPollInterval - Polling interval in ms
 * @property {InactivityBackoffConfig} inactivityBackoff - Idle poll backoff settings
 * @property {boolean} soundEnabled - Sound notifications enabled
 * @property {number} visibleBranches - Number of visible branches
 * @property {boolean} casinoMode - Casino mode enabled
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
    mode: /** @type {ServerMode} */ ('none'),
    staticDir: 'public',
    command: '',
    port: 3000,
    restartOnSwitch: true,
  },
  web: {
    enabled: false,
    port: 4000,
  },
  remoteName: 'origin',
  autoPull: true,
  gitPollInterval: 5000,
  inactivityBackoff: {
    enabled: true,
    activeWindowMs: 120000,  // hold the base rate for 2 min after activity
    stepMs: 120000,          // then ease off another notch every 2 min
    maxIntervalMs: 300000,   // never poll slower than once every 5 min
    factor: 2,               // doubling each step
  },
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
  // Inactivity backoff bounds. activeWindowMs may be 0 (start easing off
  // immediately once idle). The intervals share the 1h ceiling; factor is
  // strictly > 1 so the interval actually grows.
  inactivityActiveWindow: { min: 0, max: 3600000 },
  inactivityStep: { min: 1000, max: 3600000 },
  inactivityMaxInterval: { min: 1000, max: 3600000 },
  inactivityFactor: { min: 1.1, max: 10 },
};

/**
 * Get default configuration
 * @returns {Config}
 */
function getDefaultConfig() {
  return {
    server: { ...DEFAULTS.server },
    web: { ...DEFAULTS.web },
    remoteName: DEFAULTS.remoteName,
    autoPull: DEFAULTS.autoPull,
    gitPollInterval: DEFAULTS.gitPollInterval,
    inactivityBackoff: { ...DEFAULTS.inactivityBackoff },
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
 * Validate a numeric field against a {min, max} bound.
 * @param {*} value - Value to validate
 * @param {{min: number, max: number}} bounds - Inclusive bounds
 * @param {string} field - Field name for error messages
 * @returns {number}
 * @throws {ConfigError}
 */
function validateBoundedNumber(value, bounds, field) {
  const num = Number(value);
  if (isNaN(num) || num < bounds.min || num > bounds.max) {
    throw ConfigError.invalid(
      `Invalid ${field}: ${value}. Must be between ${bounds.min} and ${bounds.max}`,
      { field, value }
    );
  }
  return num;
}

/**
 * Validate and normalize the inactivity-backoff config block. Unknown or
 * omitted sub-keys fall back to the defaults, so a partial `{ enabled: false }`
 * is valid and leaves the timing knobs at their defaults.
 * @param {*} backoff - Raw inactivityBackoff config
 * @returns {InactivityBackoffConfig}
 * @throws {ConfigError}
 */
function validateInactivityBackoff(backoff) {
  if (typeof backoff !== 'object' || backoff === null) {
    throw ConfigError.invalid('inactivityBackoff must be an object', { field: 'inactivityBackoff', value: backoff });
  }

  const result = { ...DEFAULTS.inactivityBackoff };

  if (backoff.enabled !== undefined) {
    result.enabled = Boolean(backoff.enabled);
  }
  if (backoff.activeWindowMs !== undefined) {
    result.activeWindowMs = validateBoundedNumber(backoff.activeWindowMs, LIMITS.inactivityActiveWindow, 'inactivityBackoff.activeWindowMs');
  }
  if (backoff.stepMs !== undefined) {
    result.stepMs = validateBoundedNumber(backoff.stepMs, LIMITS.inactivityStep, 'inactivityBackoff.stepMs');
  }
  if (backoff.maxIntervalMs !== undefined) {
    result.maxIntervalMs = validateBoundedNumber(backoff.maxIntervalMs, LIMITS.inactivityMaxInterval, 'inactivityBackoff.maxIntervalMs');
  }
  if (backoff.factor !== undefined) {
    result.factor = validateBoundedNumber(backoff.factor, LIMITS.inactivityFactor, 'inactivityBackoff.factor');
  }

  return result;
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
      // Reject absolute paths and path traversal attempts
      if (path.isAbsolute(config.server.staticDir)) {
        throw ConfigError.invalid(
          'server.staticDir must be a relative path within the project',
          { field: 'server.staticDir', value: config.server.staticDir }
        );
      }
      const resolved = path.resolve(config.server.staticDir);
      const cwd = process.cwd();
      if (!resolved.startsWith(cwd + path.sep) && resolved !== cwd) {
        throw ConfigError.invalid(
          'server.staticDir must not escape the project directory',
          { field: 'server.staticDir', value: config.server.staticDir }
        );
      }
      result.server.staticDir = config.server.staticDir;
    }

    if (config.server.command !== undefined) {
      if (typeof config.server.command !== 'string') {
        throw ConfigError.invalid('server.command must be a string');
      }
      // Reject commands containing shell injection patterns
      const dangerousPatterns = /[|;&`$(){}]|>\s*\/|<\s*\//;
      if (config.server.command && dangerousPatterns.test(config.server.command)) {
        throw ConfigError.invalid(
          'server.command contains potentially dangerous shell characters (|;&`$(){}). ' +
          'Only simple commands like "npm run dev" are allowed.',
          { field: 'server.command', value: config.server.command }
        );
      }
      result.server.command = config.server.command;
    }

    if (config.server.restartOnSwitch !== undefined) {
      result.server.restartOnSwitch = Boolean(config.server.restartOnSwitch);
    }
  }

  // Validate web dashboard config
  if (config.web) {
    if (typeof config.web !== 'object') {
      throw ConfigError.invalid('web must be an object');
    }
    if (config.web.enabled !== undefined) {
      result.web.enabled = Boolean(config.web.enabled);
    }
    if (config.web.port !== undefined) {
      result.web.port = validatePort(config.web.port);
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

  if (config.inactivityBackoff !== undefined) {
    result.inactivityBackoff = validateInactivityBackoff(config.inactivityBackoff);
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

  // Convert old format to new. Legacy configs predate the 'none' default,
  // so preserve the old behavior: noServer maps to 'none', anything else
  // implies the user wanted the static server that used to be the default.
  const newConfig = getDefaultConfig();

  newConfig.server.mode = config.noServer ? 'none' : 'static';
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
  validateBoundedNumber,
  validateInactivityBackoff,
  validateConfig,
  migrateConfig,
};
