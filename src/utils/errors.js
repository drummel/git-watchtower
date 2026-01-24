/**
 * Standardized error classes for Git Watchtower
 * Provides consistent error handling across the application
 */

/**
 * Base error class for Git Watchtower
 * @extends Error
 */
class AppError extends Error {
  /**
   * @param {string} message - Error message
   * @param {string} [code] - Error code for programmatic handling
   * @param {Object} [details] - Additional error details
   */
  constructor(message, code = 'APP_ERROR', details = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date();

    // Capture stack trace (V8 specific)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Create a user-friendly message for display
   * @returns {string}
   */
  toUserMessage() {
    return this.message;
  }

  /**
   * Serialize error for logging
   * @returns {Object}
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp.toISOString(),
    };
  }
}

/**
 * Error class for Git-related operations
 * @extends AppError
 */
class GitError extends AppError {
  /**
   * @param {string} message - Error message
   * @param {string} [code] - Git error code
   * @param {Object} [details] - Additional details including command, stderr
   */
  constructor(message, code = 'GIT_ERROR', details = {}) {
    super(message, code, details);
    this.name = 'GitError';
    this.command = details.command || null;
    this.stderr = details.stderr || null;
  }

  /**
   * Check if error is due to network issues
   * @returns {boolean}
   */
  isNetworkError() {
    const networkPatterns = [
      'Could not resolve host',
      'Connection refused',
      'Connection timed out',
      'Network is unreachable',
      'fatal: unable to access',
      'SSL certificate problem',
    ];
    return networkPatterns.some(
      (pattern) =>
        this.message.includes(pattern) ||
        (this.stderr && this.stderr.includes(pattern))
    );
  }

  /**
   * Check if error is due to authentication
   * @returns {boolean}
   */
  isAuthError() {
    const authPatterns = [
      'Authentication failed',
      'Permission denied',
      'Invalid username or password',
      'could not read Username',
      'fatal: Authentication',
    ];
    return authPatterns.some(
      (pattern) =>
        this.message.includes(pattern) ||
        (this.stderr && this.stderr.includes(pattern))
    );
  }

  /**
   * Check if error is due to merge conflicts
   * @returns {boolean}
   */
  isMergeConflict() {
    const conflictPatterns = [
      'CONFLICT',
      'Automatic merge failed',
      'fix conflicts',
      'Merge conflict',
    ];
    return conflictPatterns.some(
      (pattern) =>
        this.message.includes(pattern) ||
        (this.stderr && this.stderr.includes(pattern))
    );
  }

  /**
   * Check if error is due to dirty working directory
   * @returns {boolean}
   */
  isDirtyWorkingDir() {
    const dirtyPatterns = [
      'Your local changes',
      'uncommitted changes',
      'Please commit your changes',
      'overwritten by checkout',
    ];
    return dirtyPatterns.some(
      (pattern) =>
        this.message.includes(pattern) ||
        (this.stderr && this.stderr.includes(pattern))
    );
  }

  toUserMessage() {
    if (this.isNetworkError()) {
      return 'Network error - check your connection';
    }
    if (this.isAuthError()) {
      return 'Authentication failed - check credentials';
    }
    if (this.isMergeConflict()) {
      return 'Merge conflict - resolve conflicts first';
    }
    if (this.isDirtyWorkingDir()) {
      return 'Uncommitted changes - commit or stash first';
    }
    return this.message;
  }

  /**
   * Create GitError from exec callback error
   * @param {Error} error - Original error
   * @param {string} command - Git command that was executed
   * @param {string} [stderr] - Standard error output
   * @returns {GitError}
   */
  static fromExecError(error, command, stderr = '') {
    const message = stderr || error.message;
    let code = 'GIT_ERROR';

    // Determine specific error code
    // @ts-ignore - Node.js ExecException has killed and code properties
    if (error.killed) {
      code = 'GIT_TIMEOUT';
      // @ts-ignore - Node.js ExecException has code property
    } else if (error.code === 'ENOENT') {
      code = 'GIT_NOT_FOUND';
    }

    return new GitError(message, code, { command, stderr });
  }
}

/**
 * Error class for configuration-related issues
 * @extends AppError
 */
class ConfigError extends AppError {
  /**
   * @param {string} message - Error message
   * @param {string} [code] - Config error code
   * @param {Object} [details] - Additional details
   */
  constructor(message, code = 'CONFIG_ERROR', details = {}) {
    super(message, code, details);
    this.name = 'ConfigError';
  }

  /**
   * Create ConfigError for missing config
   * @param {string} configPath - Path to missing config
   * @returns {ConfigError}
   */
  static missing(configPath) {
    return new ConfigError(
      `Configuration file not found: ${configPath}`,
      'CONFIG_NOT_FOUND',
      { path: configPath }
    );
  }

  /**
   * Create ConfigError for invalid config
   * @param {string} reason - Why config is invalid
   * @param {Object} [details] - Validation details
   * @returns {ConfigError}
   */
  static invalid(reason, details = {}) {
    return new ConfigError(
      `Invalid configuration: ${reason}`,
      'CONFIG_INVALID',
      details
    );
  }

  /**
   * Create ConfigError for parse error
   * @param {Error} parseError - Original parse error
   * @returns {ConfigError}
   */
  static parseError(parseError) {
    return new ConfigError(
      `Failed to parse configuration: ${parseError.message}`,
      'CONFIG_PARSE_ERROR',
      { originalError: parseError.message }
    );
  }
}

/**
 * Error class for server-related issues
 * @extends AppError
 */
class ServerError extends AppError {
  /**
   * @param {string} message - Error message
   * @param {string} [code] - Server error code
   * @param {Object} [details] - Additional details
   */
  constructor(message, code = 'SERVER_ERROR', details = {}) {
    super(message, code, details);
    this.name = 'ServerError';
  }

  /**
   * Create ServerError for port in use
   * @param {number} port - The port that's in use
   * @returns {ServerError}
   */
  static portInUse(port) {
    return new ServerError(
      `Port ${port} is already in use`,
      'PORT_IN_USE',
      { port }
    );
  }

  /**
   * Create ServerError for process crash
   * @param {string} command - The command that crashed
   * @param {number} exitCode - Exit code
   * @returns {ServerError}
   */
  static processCrashed(command, exitCode) {
    return new ServerError(
      `Server process crashed with exit code ${exitCode}`,
      'PROCESS_CRASHED',
      { command, exitCode }
    );
  }

  /**
   * Create ServerError for start failure
   * @param {string} command - The command that failed to start
   * @param {string} reason - Failure reason
   * @returns {ServerError}
   */
  static startFailed(command, reason) {
    return new ServerError(
      `Failed to start server: ${reason}`,
      'START_FAILED',
      { command, reason }
    );
  }
}

/**
 * Error class for validation errors
 * @extends AppError
 */
class ValidationError extends AppError {
  /**
   * @param {string} message - Error message
   * @param {string} field - Field that failed validation
   * @param {*} value - Invalid value
   */
  constructor(message, field, value) {
    super(message, 'VALIDATION_ERROR', { field, value });
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
  }

  /**
   * Create ValidationError for invalid branch name
   * @param {string} name - Invalid branch name
   * @returns {ValidationError}
   */
  static invalidBranchName(name) {
    return new ValidationError(
      `Invalid branch name: "${name}"`,
      'branchName',
      name
    );
  }

  /**
   * Create ValidationError for invalid port
   * @param {*} port - Invalid port value
   * @returns {ValidationError}
   */
  static invalidPort(port) {
    return new ValidationError(
      `Invalid port: ${port}. Must be a number between 1 and 65535`,
      'port',
      port
    );
  }
}

/**
 * Standardized error handler
 * Provides consistent error handling across the application
 */
class ErrorHandler {
  /**
   * @param {Object} [options]
   * @param {boolean} [options.debug=false] - Enable debug logging
   * @param {Function} [options.onError] - Callback for all errors
   */
  constructor(options = {}) {
    this.debug = options.debug || process.env.DEBUG === 'true';
    this.onError = options.onError || null;
  }

  /**
   * Handle an error and return a user-friendly message
   * @param {Error} error - The error to handle
   * @param {string} context - Context where error occurred
   * @returns {{ message: string, severity: 'error' | 'warning' | 'info' }}
   */
  handle(error, context = 'unknown') {
    // Log in debug mode
    if (this.debug) {
      console.error(`[${context}]`, error);
    }

    // Call error callback if provided
    if (this.onError) {
      this.onError(error, context);
    }

    // Determine severity and message
    if (error instanceof AppError) {
      return {
        message: error.toUserMessage(),
        severity: this.getSeverity(error),
      };
    }

    // Handle standard errors
    return {
      message: error.message || 'An unexpected error occurred',
      severity: 'error',
    };
  }

  /**
   * Determine error severity
   * @param {AppError} error
   * @returns {'error' | 'warning' | 'info'}
   */
  getSeverity(error) {
    // Network errors are warnings (transient)
    if (error instanceof GitError && error.isNetworkError()) {
      return 'warning';
    }

    // Config errors are usually user-fixable
    if (error instanceof ConfigError) {
      return 'warning';
    }

    return 'error';
  }

  /**
   * Check if error is retryable
   * @param {Error} error
   * @returns {boolean}
   */
  isRetryable(error) {
    if (error instanceof GitError) {
      return error.isNetworkError();
    }
    return false;
  }
}

module.exports = {
  AppError,
  GitError,
  ConfigError,
  ServerError,
  ValidationError,
  ErrorHandler,
};
