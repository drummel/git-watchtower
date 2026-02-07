/**
 * Tests for error utilities
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  AppError,
  GitError,
  ConfigError,
  ServerError,
  ValidationError,
  ErrorHandler,
  isAuthError,
  isMergeConflict,
  isNetworkError,
} = require('../../../src/utils/errors');

describe('AppError', () => {
  it('should create error with message', () => {
    const error = new AppError('Test error');
    assert.strictEqual(error.message, 'Test error');
    assert.strictEqual(error.name, 'AppError');
    assert.strictEqual(error.code, 'APP_ERROR');
  });

  it('should create error with custom code', () => {
    const error = new AppError('Test', 'CUSTOM_CODE');
    assert.strictEqual(error.code, 'CUSTOM_CODE');
  });

  it('should store details', () => {
    const error = new AppError('Test', 'CODE', { foo: 'bar' });
    assert.deepStrictEqual(error.details, { foo: 'bar' });
  });

  it('should have timestamp', () => {
    const before = new Date();
    const error = new AppError('Test');
    const after = new Date();

    assert.ok(error.timestamp >= before);
    assert.ok(error.timestamp <= after);
  });

  it('should serialize to JSON', () => {
    const error = new AppError('Test', 'CODE', { detail: 1 });
    const json = error.toJSON();

    assert.strictEqual(json.name, 'AppError');
    assert.strictEqual(json.code, 'CODE');
    assert.strictEqual(json.message, 'Test');
    assert.deepStrictEqual(json.details, { detail: 1 });
    assert.ok(json.timestamp);
  });

  it('should return user message', () => {
    const error = new AppError('Test error message');
    assert.strictEqual(error.toUserMessage(), 'Test error message');
  });
});

describe('GitError', () => {
  it('should create git error', () => {
    const error = new GitError('Git failed');
    assert.strictEqual(error.name, 'GitError');
    assert.strictEqual(error.code, 'GIT_ERROR');
  });

  it('should store command and stderr', () => {
    const error = new GitError('Failed', 'GIT_ERROR', {
      command: 'git fetch',
      stderr: 'fatal: error',
    });

    assert.strictEqual(error.command, 'git fetch');
    assert.strictEqual(error.stderr, 'fatal: error');
  });

  describe('error detection', () => {
    it('should detect network errors', () => {
      const error1 = new GitError('Could not resolve host');
      assert.strictEqual(error1.isNetworkError(), true);

      const error2 = new GitError('Connection refused');
      assert.strictEqual(error2.isNetworkError(), true);

      const error3 = new GitError('Some other error');
      assert.strictEqual(error3.isNetworkError(), false);
    });

    it('should detect network errors in stderr', () => {
      const error = new GitError('Command failed', 'GIT_ERROR', {
        stderr: 'fatal: unable to access',
      });
      assert.strictEqual(error.isNetworkError(), true);
    });

    it('should detect auth errors', () => {
      const error1 = new GitError('Authentication failed');
      assert.strictEqual(error1.isAuthError(), true);

      const error2 = new GitError('Permission denied');
      assert.strictEqual(error2.isAuthError(), true);
    });

    it('should detect merge conflicts', () => {
      const error = new GitError('CONFLICT in file.txt');
      assert.strictEqual(error.isMergeConflict(), true);
    });

    it('should detect dirty working directory', () => {
      const error = new GitError('Your local changes would be overwritten');
      assert.strictEqual(error.isDirtyWorkingDir(), true);
    });
  });

  describe('toUserMessage', () => {
    it('should return friendly network error message', () => {
      const error = new GitError('Could not resolve host');
      assert.strictEqual(
        error.toUserMessage(),
        'Network error - check your connection'
      );
    });

    it('should return friendly auth error message', () => {
      const error = new GitError('Authentication failed');
      assert.strictEqual(
        error.toUserMessage(),
        'Authentication failed - check credentials'
      );
    });

    it('should return friendly merge conflict message', () => {
      const error = new GitError('CONFLICT');
      assert.strictEqual(
        error.toUserMessage(),
        'Merge conflict - resolve conflicts first'
      );
    });

    it('should return friendly dirty workdir message', () => {
      const error = new GitError('Your local changes');
      assert.strictEqual(
        error.toUserMessage(),
        'Uncommitted changes - commit or stash first'
      );
    });

    it('should return original message for unknown errors', () => {
      const error = new GitError('Unknown error');
      assert.strictEqual(error.toUserMessage(), 'Unknown error');
    });
  });

  describe('fromExecError', () => {
    it('should create GitError from exec error', () => {
      const execError = new Error('Command failed');
      const gitError = GitError.fromExecError(execError, 'git fetch', 'stderr output');

      assert.strictEqual(gitError.message, 'stderr output');
      assert.strictEqual(gitError.command, 'git fetch');
      assert.strictEqual(gitError.stderr, 'stderr output');
    });

    it('should handle killed process', () => {
      const execError = new Error('Process killed');
      execError.killed = true;
      const gitError = GitError.fromExecError(execError, 'git fetch');

      assert.strictEqual(gitError.code, 'GIT_TIMEOUT');
    });

    it('should handle ENOENT', () => {
      const execError = new Error('Git not found');
      execError.code = 'ENOENT';
      const gitError = GitError.fromExecError(execError, 'git status');

      assert.strictEqual(gitError.code, 'GIT_NOT_FOUND');
    });
  });
});

describe('ConfigError', () => {
  it('should create config error', () => {
    const error = new ConfigError('Invalid config');
    assert.strictEqual(error.name, 'ConfigError');
    assert.strictEqual(error.code, 'CONFIG_ERROR');
  });

  it('should create missing config error', () => {
    const error = ConfigError.missing('/path/to/config');
    assert.strictEqual(error.code, 'CONFIG_NOT_FOUND');
    assert.ok(error.message.includes('/path/to/config'));
  });

  it('should create invalid config error', () => {
    const error = ConfigError.invalid('port must be a number');
    assert.strictEqual(error.code, 'CONFIG_INVALID');
    assert.ok(error.message.includes('port must be a number'));
  });

  it('should create parse error', () => {
    const parseError = new Error('Unexpected token');
    const error = ConfigError.parseError(parseError);
    assert.strictEqual(error.code, 'CONFIG_PARSE_ERROR');
    assert.ok(error.message.includes('Unexpected token'));
  });
});

describe('ServerError', () => {
  it('should create server error', () => {
    const error = new ServerError('Server failed');
    assert.strictEqual(error.name, 'ServerError');
    assert.strictEqual(error.code, 'SERVER_ERROR');
  });

  it('should create port in use error', () => {
    const error = ServerError.portInUse(3000);
    assert.strictEqual(error.code, 'PORT_IN_USE');
    assert.ok(error.message.includes('3000'));
    assert.strictEqual(error.details.port, 3000);
  });

  it('should create process crashed error', () => {
    const error = ServerError.processCrashed('npm run dev', 1);
    assert.strictEqual(error.code, 'PROCESS_CRASHED');
    assert.strictEqual(error.details.exitCode, 1);
  });

  it('should create start failed error', () => {
    const error = ServerError.startFailed('npm run dev', 'command not found');
    assert.strictEqual(error.code, 'START_FAILED');
    assert.ok(error.message.includes('command not found'));
  });
});

describe('ValidationError', () => {
  it('should create validation error', () => {
    const error = new ValidationError('Invalid value', 'field', 'value');
    assert.strictEqual(error.name, 'ValidationError');
    assert.strictEqual(error.field, 'field');
    assert.strictEqual(error.value, 'value');
  });

  it('should create invalid branch name error', () => {
    const error = ValidationError.invalidBranchName('bad..branch');
    assert.strictEqual(error.field, 'branchName');
    assert.strictEqual(error.value, 'bad..branch');
  });

  it('should create invalid port error', () => {
    const error = ValidationError.invalidPort('abc');
    assert.strictEqual(error.field, 'port');
    assert.strictEqual(error.value, 'abc');
  });
});

describe('ErrorHandler', () => {
  let handler;

  beforeEach(() => {
    handler = new ErrorHandler();
  });

  describe('handle', () => {
    it('should handle AppError', () => {
      const error = new AppError('Test error');
      const result = handler.handle(error, 'test');

      assert.strictEqual(result.message, 'Test error');
      assert.strictEqual(result.severity, 'error');
    });

    it('should handle GitError network errors as warning', () => {
      const error = new GitError('Could not resolve host');
      const result = handler.handle(error, 'test');

      assert.strictEqual(result.severity, 'warning');
    });

    it('should handle ConfigError as warning', () => {
      const error = new ConfigError('Invalid config');
      const result = handler.handle(error, 'test');

      assert.strictEqual(result.severity, 'warning');
    });

    it('should handle standard Error', () => {
      const error = new Error('Standard error');
      const result = handler.handle(error, 'test');

      assert.strictEqual(result.message, 'Standard error');
      assert.strictEqual(result.severity, 'error');
    });

    it('should call onError callback', () => {
      let calledWith = null;
      const handlerWithCallback = new ErrorHandler({
        onError: (err, ctx) => {
          calledWith = { err, ctx };
        },
      });

      const error = new AppError('Test');
      handlerWithCallback.handle(error, 'context');

      assert.strictEqual(calledWith.err, error);
      assert.strictEqual(calledWith.ctx, 'context');
    });
  });

  describe('isRetryable', () => {
    it('should return true for network errors', () => {
      const error = new GitError('Could not resolve host');
      assert.strictEqual(handler.isRetryable(error), true);
    });

    it('should return false for auth errors', () => {
      const error = new GitError('Authentication failed');
      assert.strictEqual(handler.isRetryable(error), false);
    });

    it('should return false for standard errors', () => {
      const error = new Error('Some error');
      assert.strictEqual(handler.isRetryable(error), false);
    });
  });
});

describe('isAuthError (standalone)', () => {
  it('should detect "Authentication failed"', () => {
    assert.strictEqual(isAuthError('Authentication failed for repo'), true);
  });

  it('should detect "could not read Username"', () => {
    assert.strictEqual(isAuthError('could not read Username'), true);
  });

  it('should detect "could not read Password"', () => {
    assert.strictEqual(isAuthError('could not read Password'), true);
  });

  it('should detect "Permission denied"', () => {
    assert.strictEqual(isAuthError('Permission denied (publickey)'), true);
  });

  it('should detect "invalid credentials"', () => {
    assert.strictEqual(isAuthError('invalid credentials provided'), true);
  });

  it('should detect "authorization failed"', () => {
    assert.strictEqual(isAuthError('authorization failed'), true);
  });

  it('should detect "fatal: Authentication"', () => {
    assert.strictEqual(isAuthError('fatal: Authentication required'), true);
  });

  it('should detect "HTTP 401"', () => {
    assert.strictEqual(isAuthError('HTTP 401 Unauthorized'), true);
  });

  it('should detect "HTTP 403"', () => {
    assert.strictEqual(isAuthError('HTTP 403 Forbidden'), true);
  });

  it('should be case-insensitive', () => {
    assert.strictEqual(isAuthError('AUTHENTICATION FAILED'), true);
    assert.strictEqual(isAuthError('permission denied'), true);
    assert.strictEqual(isAuthError('http 401'), true);
  });

  it('should return false for non-matching messages', () => {
    assert.strictEqual(isAuthError('Some other git error'), false);
    assert.strictEqual(isAuthError('Could not resolve host'), false);
    assert.strictEqual(isAuthError('CONFLICT in file.txt'), false);
  });

  it('should handle null input', () => {
    assert.strictEqual(isAuthError(null), false);
  });

  it('should handle undefined input', () => {
    assert.strictEqual(isAuthError(undefined), false);
  });

  it('should handle empty string', () => {
    assert.strictEqual(isAuthError(''), false);
  });
});

describe('isMergeConflict (standalone)', () => {
  it('should detect "CONFLICT"', () => {
    assert.strictEqual(isMergeConflict('CONFLICT (content): Merge conflict in file.txt'), true);
  });

  it('should detect "Automatic merge failed"', () => {
    assert.strictEqual(isMergeConflict('Automatic merge failed; fix conflicts and then commit'), true);
  });

  it('should detect "fix conflicts"', () => {
    assert.strictEqual(isMergeConflict('fix conflicts and then commit the result'), true);
  });

  it('should detect "Merge conflict"', () => {
    assert.strictEqual(isMergeConflict('Merge conflict in src/index.js'), true);
  });

  it('should be case-sensitive for "CONFLICT"', () => {
    assert.strictEqual(isMergeConflict('CONFLICT in file'), true);
    assert.strictEqual(isMergeConflict('conflict in file'), false);
  });

  it('should return false for non-matching messages', () => {
    assert.strictEqual(isMergeConflict('Some other git error'), false);
    assert.strictEqual(isMergeConflict('Authentication failed'), false);
  });

  it('should handle null input', () => {
    assert.strictEqual(isMergeConflict(null), false);
  });

  it('should handle undefined input', () => {
    assert.strictEqual(isMergeConflict(undefined), false);
  });

  it('should handle empty string', () => {
    assert.strictEqual(isMergeConflict(''), false);
  });
});

describe('isNetworkError (standalone)', () => {
  it('should detect "Could not resolve host"', () => {
    assert.strictEqual(isNetworkError('Could not resolve host: github.com'), true);
  });

  it('should detect "unable to access"', () => {
    assert.strictEqual(isNetworkError('fatal: unable to access repository'), true);
  });

  it('should detect "Connection refused"', () => {
    assert.strictEqual(isNetworkError('Connection refused by server'), true);
  });

  it('should detect "Network is unreachable"', () => {
    assert.strictEqual(isNetworkError('Network is unreachable'), true);
  });

  it('should detect "Connection timed out"', () => {
    assert.strictEqual(isNetworkError('Connection timed out'), true);
  });

  it('should detect "Failed to connect"', () => {
    assert.strictEqual(isNetworkError('Failed to connect to github.com'), true);
  });

  it('should detect "no route to host"', () => {
    assert.strictEqual(isNetworkError('no route to host'), true);
  });

  it('should detect "Temporary failure in name resolution"', () => {
    assert.strictEqual(isNetworkError('Temporary failure in name resolution'), true);
  });

  it('should be case-insensitive', () => {
    assert.strictEqual(isNetworkError('COULD NOT RESOLVE HOST'), true);
    assert.strictEqual(isNetworkError('connection refused'), true);
    assert.strictEqual(isNetworkError('NETWORK IS UNREACHABLE'), true);
  });

  it('should return false for non-matching messages', () => {
    assert.strictEqual(isNetworkError('Some other git error'), false);
    assert.strictEqual(isNetworkError('Authentication failed'), false);
    assert.strictEqual(isNetworkError('CONFLICT in file.txt'), false);
  });

  it('should handle null input', () => {
    assert.strictEqual(isNetworkError(null), false);
  });

  it('should handle undefined input', () => {
    assert.strictEqual(isNetworkError(undefined), false);
  });

  it('should handle empty string', () => {
    assert.strictEqual(isNetworkError(''), false);
  });
});
