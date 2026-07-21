/**
 * Tests for git branch module
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  isValidBranchName,
  sanitizeBranchName,
  hasUpdatesFromCounts,
} = require('../../../src/git/branch');
const { ValidationError } = require('../../../src/utils/errors');

describe('isValidBranchName', () => {
  describe('valid branch names', () => {
    it('should accept simple branch names', () => {
      assert.strictEqual(isValidBranchName('main'), true);
      assert.strictEqual(isValidBranchName('develop'), true);
      assert.strictEqual(isValidBranchName('master'), true);
    });

    it('should accept feature branch names', () => {
      assert.strictEqual(isValidBranchName('feature/add-login'), true);
      assert.strictEqual(isValidBranchName('feature/JIRA-123'), true);
      assert.strictEqual(isValidBranchName('bugfix/fix-crash'), true);
    });

    it('should accept names with numbers', () => {
      assert.strictEqual(isValidBranchName('release-1.0.0'), true);
      assert.strictEqual(isValidBranchName('v2.0'), true);
      assert.strictEqual(isValidBranchName('2023-update'), true);
    });

    it('should accept names with underscores and dashes', () => {
      assert.strictEqual(isValidBranchName('my_branch'), true);
      assert.strictEqual(isValidBranchName('my-branch'), true);
      assert.strictEqual(isValidBranchName('my_branch-name'), true);
    });

    it('should accept names with dots', () => {
      assert.strictEqual(isValidBranchName('release.1.0'), true);
      assert.strictEqual(isValidBranchName('user.feature'), true);
    });
  });

  describe('invalid branch names', () => {
    it('should reject empty or null names', () => {
      assert.strictEqual(isValidBranchName(''), false);
      assert.strictEqual(isValidBranchName(null), false);
      assert.strictEqual(isValidBranchName(undefined), false);
    });

    it('should reject names with double dots', () => {
      assert.strictEqual(isValidBranchName('branch..name'), false);
      assert.strictEqual(isValidBranchName('..hidden'), false);
    });

    it('should reject names starting with dash', () => {
      assert.strictEqual(isValidBranchName('-branch'), false);
      assert.strictEqual(isValidBranchName('-'), false);
    });

    it('should reject names starting or ending with slash', () => {
      assert.strictEqual(isValidBranchName('/branch'), false);
      assert.strictEqual(isValidBranchName('branch/'), false);
    });

    it('should reject names with special characters', () => {
      assert.strictEqual(isValidBranchName('branch name'), false);
      assert.strictEqual(isValidBranchName('branch@name'), false);
      assert.strictEqual(isValidBranchName('branch:name'), false);
      assert.strictEqual(isValidBranchName('branch~name'), false);
      assert.strictEqual(isValidBranchName('branch^name'), false);
    });

    it('should reject names that are too long', () => {
      const longName = 'a'.repeat(256);
      assert.strictEqual(isValidBranchName(longName), false);
    });

    it('should reject non-string inputs', () => {
      assert.strictEqual(isValidBranchName(123), false);
      assert.strictEqual(isValidBranchName({}), false);
      assert.strictEqual(isValidBranchName([]), false);
    });
  });
});

describe('sanitizeBranchName', () => {
  it('should return valid branch names unchanged', () => {
    assert.strictEqual(sanitizeBranchName('main'), 'main');
    assert.strictEqual(sanitizeBranchName('feature/test'), 'feature/test');
    assert.strictEqual(sanitizeBranchName('release-1.0'), 'release-1.0');
  });

  it('should throw ValidationError for invalid names', () => {
    assert.throws(() => sanitizeBranchName(''), ValidationError);
    assert.throws(() => sanitizeBranchName('bad..name'), ValidationError);
    assert.throws(() => sanitizeBranchName('-invalid'), ValidationError);
  });

  it('should include branch name in error', () => {
    try {
      sanitizeBranchName('bad..name');
      assert.fail('Should have thrown');
    } catch (error) {
      assert.ok(error instanceof ValidationError);
      assert.ok(error.message.includes('bad..name'));
      assert.strictEqual(error.field, 'branchName');
      assert.strictEqual(error.value, 'bad..name');
    }
  });
});

describe('hasUpdatesFromCounts', () => {
  it('is false when the branch is only ahead (unpushed local commits)', () => {
    // The core fix: a purely-ahead branch has nothing to pull, so it must
    // not be flagged as having updates (which drove the auto-pull/reload loop).
    assert.strictEqual(hasUpdatesFromCounts(3, 0), false);
    assert.strictEqual(hasUpdatesFromCounts(1, 0), false);
  });

  it('is true when the branch is behind the remote', () => {
    assert.strictEqual(hasUpdatesFromCounts(0, 1), true);
    assert.strictEqual(hasUpdatesFromCounts(0, 5), true);
  });

  it('is true when the branch has diverged (ahead and behind)', () => {
    // There are still remote commits to pull; the divergence dialog handles
    // the actual reconciliation safely.
    assert.strictEqual(hasUpdatesFromCounts(2, 3), true);
    assert.strictEqual(hasUpdatesFromCounts(1, 1), true);
  });

  it('falls back to true on an inconclusive 0/0 probe', () => {
    // Callers only invoke this when the commit hashes already differ, so a
    // successful probe can never be 0/0. A 0/0 therefore means the rev-list
    // probe failed, and we must not hide a potentially-real update.
    assert.strictEqual(hasUpdatesFromCounts(0, 0), true);
  });
});
