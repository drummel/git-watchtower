/**
 * Tests for git branch module
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  isValidBranchName,
  sanitizeBranchName,
  detectBranchChanges,
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

describe('detectBranchChanges', () => {
  const createBranch = (name, commit = 'abc123') => ({
    name,
    commit,
    subject: 'Test commit',
    date: new Date(),
    isLocal: true,
    hasRemote: false,
    hasUpdates: false,
  });

  it('should detect added branches', () => {
    const oldBranches = [createBranch('main')];
    const newBranches = [createBranch('main'), createBranch('feature')];

    const changes = detectBranchChanges(oldBranches, newBranches);

    assert.strictEqual(changes.added.length, 1);
    assert.strictEqual(changes.added[0].name, 'feature');
    assert.strictEqual(changes.removed.length, 0);
    assert.strictEqual(changes.updated.length, 0);
  });

  it('should detect removed branches', () => {
    const oldBranches = [createBranch('main'), createBranch('feature')];
    const newBranches = [createBranch('main')];

    const changes = detectBranchChanges(oldBranches, newBranches);

    assert.strictEqual(changes.added.length, 0);
    assert.strictEqual(changes.removed.length, 1);
    assert.strictEqual(changes.removed[0].name, 'feature');
    assert.strictEqual(changes.updated.length, 0);
  });

  it('should detect updated branches', () => {
    const oldBranches = [createBranch('main', 'old123')];
    const newBranches = [createBranch('main', 'new456')];

    const changes = detectBranchChanges(oldBranches, newBranches);

    assert.strictEqual(changes.added.length, 0);
    assert.strictEqual(changes.removed.length, 0);
    assert.strictEqual(changes.updated.length, 1);
    assert.strictEqual(changes.updated[0].name, 'main');
    assert.strictEqual(changes.updated[0].commit, 'new456');
  });

  it('should detect multiple changes simultaneously', () => {
    const oldBranches = [
      createBranch('main', 'old'),
      createBranch('develop'),
      createBranch('removed-branch'),
    ];
    const newBranches = [
      createBranch('main', 'new'),
      createBranch('develop'),
      createBranch('new-branch'),
    ];

    const changes = detectBranchChanges(oldBranches, newBranches);

    assert.strictEqual(changes.added.length, 1);
    assert.strictEqual(changes.added[0].name, 'new-branch');
    assert.strictEqual(changes.removed.length, 1);
    assert.strictEqual(changes.removed[0].name, 'removed-branch');
    assert.strictEqual(changes.updated.length, 1);
    assert.strictEqual(changes.updated[0].name, 'main');
  });

  it('should handle empty old list (all branches are new)', () => {
    const oldBranches = [];
    const newBranches = [createBranch('main'), createBranch('develop')];

    const changes = detectBranchChanges(oldBranches, newBranches);

    assert.strictEqual(changes.added.length, 2);
    assert.strictEqual(changes.removed.length, 0);
    assert.strictEqual(changes.updated.length, 0);
  });

  it('should handle empty new list (all branches removed)', () => {
    const oldBranches = [createBranch('main'), createBranch('develop')];
    const newBranches = [];

    const changes = detectBranchChanges(oldBranches, newBranches);

    assert.strictEqual(changes.added.length, 0);
    assert.strictEqual(changes.removed.length, 2);
    assert.strictEqual(changes.updated.length, 0);
  });

  it('should handle no changes', () => {
    const oldBranches = [createBranch('main', 'abc'), createBranch('develop', 'def')];
    const newBranches = [createBranch('main', 'abc'), createBranch('develop', 'def')];

    const changes = detectBranchChanges(oldBranches, newBranches);

    assert.strictEqual(changes.added.length, 0);
    assert.strictEqual(changes.removed.length, 0);
    assert.strictEqual(changes.updated.length, 0);
  });

  it('should handle both empty lists', () => {
    const changes = detectBranchChanges([], []);

    assert.strictEqual(changes.added.length, 0);
    assert.strictEqual(changes.removed.length, 0);
    assert.strictEqual(changes.updated.length, 0);
  });
});
