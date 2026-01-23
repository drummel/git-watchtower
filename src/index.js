/**
 * Git Watchtower - Modular Architecture
 *
 * This is the main entry point for the refactored modules.
 * Import what you need from this file.
 *
 * @example
 * const { Store, createStore } = require('./src');
 * const { GitError, ConfigError } = require('./src');
 * const { ansi, box } = require('./src');
 */

// Utilities
const asyncUtils = require('./utils/async');
const errors = require('./utils/errors');

// State management
const state = require('./state/store');

// UI components
const ui = require('./ui/ansi');

// Git operations
const gitCommands = require('./git/commands');
const gitBranch = require('./git/branch');

// Configuration
const configSchema = require('./config/schema');
const configLoader = require('./config/loader');

// Server management
const serverProcess = require('./server/process');

module.exports = {
  // Async utilities
  Mutex: asyncUtils.Mutex,
  withTimeout: asyncUtils.withTimeout,
  retry: asyncUtils.retry,
  sleep: asyncUtils.sleep,
  debounce: asyncUtils.debounce,
  throttle: asyncUtils.throttle,

  // Error classes
  AppError: errors.AppError,
  GitError: errors.GitError,
  ConfigError: errors.ConfigError,
  ServerError: errors.ServerError,
  ValidationError: errors.ValidationError,
  ErrorHandler: errors.ErrorHandler,

  // State management
  Store: state.Store,
  createStore: state.createStore,
  getInitialState: state.getInitialState,

  // UI utilities
  ansi: ui.ansi,
  box: ui.box,
  sparkline: ui.sparkline,
  indicators: ui.indicators,
  stripAnsi: ui.stripAnsi,
  visibleLength: ui.visibleLength,
  truncate: ui.truncate,
  pad: ui.pad,
  wordWrap: ui.wordWrap,
  horizontalLine: ui.horizontalLine,
  style: ui.style,

  // Git commands
  execGit: gitCommands.execGit,
  execGitSilent: gitCommands.execGitSilent,
  isGitAvailable: gitCommands.isGitAvailable,
  isGitRepository: gitCommands.isGitRepository,
  getRemotes: gitCommands.getRemotes,
  remoteExists: gitCommands.remoteExists,
  fetch: gitCommands.fetch,
  pull: gitCommands.pull,
  log: gitCommands.log,
  getCommitsByDay: gitCommands.getCommitsByDay,
  hasUncommittedChanges: gitCommands.hasUncommittedChanges,
  getChangedFiles: gitCommands.getChangedFiles,

  // Git branch operations
  isValidBranchName: gitBranch.isValidBranchName,
  sanitizeBranchName: gitBranch.sanitizeBranchName,
  getCurrentBranch: gitBranch.getCurrentBranch,
  getAllBranches: gitBranch.getAllBranches,
  detectBranchChanges: gitBranch.detectBranchChanges,
  checkout: gitBranch.checkout,
  getPreviewData: gitBranch.getPreviewData,
  generateSparkline: gitBranch.generateSparkline,
  getLocalBranches: gitBranch.getLocalBranches,
  localBranchExists: gitBranch.localBranchExists,

  // Configuration schema
  SERVER_MODES: configSchema.SERVER_MODES,
  DEFAULTS: configSchema.DEFAULTS,
  LIMITS: configSchema.LIMITS,
  getDefaultConfig: configSchema.getDefaultConfig,
  validatePort: configSchema.validatePort,
  validateServerMode: configSchema.validateServerMode,
  validatePollInterval: configSchema.validatePollInterval,
  validateVisibleBranches: configSchema.validateVisibleBranches,
  validateConfig: configSchema.validateConfig,
  migrateConfig: configSchema.migrateConfig,

  // Configuration loading
  CONFIG_FILE_NAME: configLoader.CONFIG_FILE_NAME,
  getConfigPath: configLoader.getConfigPath,
  configExists: configLoader.configExists,
  loadConfig: configLoader.loadConfig,
  saveConfig: configLoader.saveConfig,
  deleteConfig: configLoader.deleteConfig,
  applyCliArgs: configLoader.applyCliArgs,
  parseCliArgs: configLoader.parseCliArgs,
  ensureConfig: configLoader.ensureConfig,

  // Server process management
  ProcessManager: serverProcess.ProcessManager,
  parseCommand: serverProcess.parseCommand,
};
