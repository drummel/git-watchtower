const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseGitHubPr,
  parseGitLabMr,
  parseGitHubPrList,
  parseGitLabMrList,
  isBaseBranch,
} = require('../../../src/git/pr');

describe('parseGitHubPr', () => {
  it('should return null for empty array', () => {
    assert.equal(parseGitHubPr([]), null);
  });

  it('should return null for null', () => {
    assert.equal(parseGitHubPr(null), null);
  });

  it('should parse basic PR info', () => {
    const result = parseGitHubPr([{
      number: 42,
      title: 'Add feature',
      state: 'OPEN',
      reviewDecision: 'REVIEW_REQUIRED',
      statusCheckRollup: [],
    }]);
    assert.equal(result.number, 42);
    assert.equal(result.title, 'Add feature');
    assert.equal(result.state, 'OPEN');
    assert.equal(result.approved, false);
    assert.equal(result.checksPass, false);
    assert.equal(result.checksFail, false);
    assert.equal(result.checksCount, 0);
  });

  it('should detect approved PRs', () => {
    const result = parseGitHubPr([{
      number: 1,
      title: 'PR',
      state: 'OPEN',
      reviewDecision: 'APPROVED',
      statusCheckRollup: [],
    }]);
    assert.equal(result.approved, true);
  });

  it('should detect all checks passing', () => {
    const result = parseGitHubPr([{
      number: 1,
      title: 'PR',
      state: 'OPEN',
      reviewDecision: '',
      statusCheckRollup: [
        { conclusion: 'SUCCESS' },
        { conclusion: 'SUCCESS' },
      ],
    }]);
    assert.equal(result.checksPass, true);
    assert.equal(result.checksFail, false);
    assert.equal(result.checksCount, 2);
  });

  it('should detect failing checks', () => {
    const result = parseGitHubPr([{
      number: 1,
      title: 'PR',
      state: 'OPEN',
      reviewDecision: '',
      statusCheckRollup: [
        { conclusion: 'SUCCESS' },
        { conclusion: 'FAILURE' },
      ],
    }]);
    assert.equal(result.checksPass, false);
    assert.equal(result.checksFail, true);
  });

  it('should handle missing statusCheckRollup', () => {
    const result = parseGitHubPr([{
      number: 1,
      title: 'PR',
      state: 'MERGED',
    }]);
    assert.equal(result.checksPass, false);
    assert.equal(result.checksFail, false);
    assert.equal(result.checksCount, 0);
  });

  it('should only use the first PR', () => {
    const result = parseGitHubPr([
      { number: 1, title: 'First', state: 'OPEN', statusCheckRollup: [] },
      { number: 2, title: 'Second', state: 'CLOSED', statusCheckRollup: [] },
    ]);
    assert.equal(result.number, 1);
    assert.equal(result.title, 'First');
  });
});

describe('parseGitLabMr', () => {
  it('should return null for empty array', () => {
    assert.equal(parseGitLabMr([]), null);
  });

  it('should return null for null', () => {
    assert.equal(parseGitLabMr(null), null);
  });

  it('should parse opened MR', () => {
    const result = parseGitLabMr([{
      iid: 10,
      title: 'Fix bug',
      state: 'opened',
    }]);
    assert.equal(result.number, 10);
    assert.equal(result.title, 'Fix bug');
    assert.equal(result.state, 'OPEN');
  });

  it('should parse merged MR', () => {
    const result = parseGitLabMr([{
      iid: 11,
      title: 'Feature',
      state: 'merged',
    }]);
    assert.equal(result.state, 'MERGED');
  });

  it('should parse closed MR', () => {
    const result = parseGitLabMr([{
      iid: 12,
      title: 'Rejected',
      state: 'closed',
    }]);
    assert.equal(result.state, 'CLOSED');
  });

  it('should default checks to false', () => {
    const result = parseGitLabMr([{
      iid: 1,
      title: 'MR',
      state: 'opened',
    }]);
    assert.equal(result.approved, false);
    assert.equal(result.checksPass, false);
    assert.equal(result.checksFail, false);
    assert.equal(result.checksCount, 0);
  });
});

describe('parseGitHubPrList', () => {
  it('should return empty map for null', () => {
    const map = parseGitHubPrList(null);
    assert.equal(map.size, 0);
  });

  it('should return empty map for empty array', () => {
    const map = parseGitHubPrList([]);
    assert.equal(map.size, 0);
  });

  it('should map branch names to PR status', () => {
    const map = parseGitHubPrList([
      { headRefName: 'feature-a', number: 1, title: 'A', state: 'OPEN' },
      { headRefName: 'feature-b', number: 2, title: 'B', state: 'MERGED' },
    ]);
    assert.equal(map.size, 2);
    assert.deepEqual(map.get('feature-a'), { state: 'OPEN', number: 1, title: 'A' });
    assert.deepEqual(map.get('feature-b'), { state: 'MERGED', number: 2, title: 'B' });
  });

  it('should prefer highest PR number per branch', () => {
    const map = parseGitHubPrList([
      { headRefName: 'feature', number: 1, title: 'Old', state: 'CLOSED' },
      { headRefName: 'feature', number: 5, title: 'New', state: 'OPEN' },
      { headRefName: 'feature', number: 3, title: 'Mid', state: 'CLOSED' },
    ]);
    assert.equal(map.size, 1);
    assert.deepEqual(map.get('feature'), { state: 'OPEN', number: 5, title: 'New' });
  });
});

describe('parseGitLabMrList', () => {
  it('should return empty map for null', () => {
    const map = parseGitLabMrList(null);
    assert.equal(map.size, 0);
  });

  it('should map branch names to MR status', () => {
    const map = parseGitLabMrList([
      { source_branch: 'fix-1', iid: 10, title: 'Fix', state: 'opened' },
      { source_branch: 'feat-2', iid: 11, title: 'Feat', state: 'merged' },
    ]);
    assert.equal(map.size, 2);
    assert.deepEqual(map.get('fix-1'), { state: 'OPEN', number: 10, title: 'Fix' });
    assert.deepEqual(map.get('feat-2'), { state: 'MERGED', number: 11, title: 'Feat' });
  });

  it('should normalize GitLab states', () => {
    const map = parseGitLabMrList([
      { source_branch: 'a', iid: 1, title: 'A', state: 'opened' },
      { source_branch: 'b', iid: 2, title: 'B', state: 'merged' },
      { source_branch: 'c', iid: 3, title: 'C', state: 'closed' },
    ]);
    assert.equal(map.get('a').state, 'OPEN');
    assert.equal(map.get('b').state, 'MERGED');
    assert.equal(map.get('c').state, 'CLOSED');
  });

  it('should prefer highest MR iid per branch', () => {
    const map = parseGitLabMrList([
      { source_branch: 'feat', iid: 1, title: 'Old', state: 'closed' },
      { source_branch: 'feat', iid: 5, title: 'New', state: 'opened' },
    ]);
    assert.deepEqual(map.get('feat'), { state: 'OPEN', number: 5, title: 'New' });
  });
});

describe('isBaseBranch', () => {
  it('should identify main as base branch', () => {
    assert.equal(isBaseBranch('main'), true);
  });

  it('should identify master as base branch', () => {
    assert.equal(isBaseBranch('master'), true);
  });

  it('should identify develop as base branch', () => {
    assert.equal(isBaseBranch('develop'), true);
  });

  it('should identify staging as base branch', () => {
    assert.equal(isBaseBranch('staging'), true);
  });

  it('should identify production as base branch', () => {
    assert.equal(isBaseBranch('production'), true);
  });

  it('should identify trunk as base branch', () => {
    assert.equal(isBaseBranch('trunk'), true);
  });

  it('should identify release as base branch', () => {
    assert.equal(isBaseBranch('release'), true);
  });

  it('should NOT identify feature branches as base', () => {
    assert.equal(isBaseBranch('feature/add-login'), false);
    assert.equal(isBaseBranch('claude/improve-test'), false);
    assert.equal(isBaseBranch('bugfix/fix-crash'), false);
  });

  it('should NOT match partial names', () => {
    assert.equal(isBaseBranch('main-v2'), false);
    assert.equal(isBaseBranch('pre-release'), false);
  });
});
