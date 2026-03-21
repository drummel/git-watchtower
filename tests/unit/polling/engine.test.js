const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  detectNewBranches,
  detectDeletedBranches,
  detectUpdatedBranches,
  sortBranches,
  calculateAdaptiveInterval,
  restoreSelection,
  pruneStaleEntries,
} = require('../../../src/polling/engine');

describe('detectNewBranches', () => {
  it('should detect branches not in known set', () => {
    const branches = [{ name: 'main' }, { name: 'feature' }, { name: 'new-one' }];
    const known = new Set(['main', 'feature']);
    const result = detectNewBranches(branches, known);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'new-one');
    assert.equal(result[0].isNew, true);
    assert.ok(result[0].newAt > 0);
  });

  it('should return empty when all branches are known', () => {
    const branches = [{ name: 'main' }, { name: 'develop' }];
    const known = new Set(['main', 'develop']);
    assert.equal(detectNewBranches(branches, known).length, 0);
  });

  it('should detect all branches as new when known set is empty', () => {
    const branches = [{ name: 'a' }, { name: 'b' }];
    const known = new Set();
    assert.equal(detectNewBranches(branches, known).length, 2);
  });

  it('should handle empty branch list', () => {
    assert.equal(detectNewBranches([], new Set(['main'])).length, 0);
  });
});

describe('detectDeletedBranches', () => {
  it('should detect branches removed from fetched set', () => {
    const known = new Set(['main', 'feature', 'deleted-branch']);
    const fetched = new Set(['main', 'feature']);
    const existing = [
      { name: 'main' },
      { name: 'feature' },
      { name: 'deleted-branch' },
    ];
    const result = detectDeletedBranches(known, fetched, existing);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'deleted-branch');
    assert.equal(result[0].isDeleted, true);
    assert.ok(result[0].deletedAt > 0);
  });

  it('should not re-mark already deleted branches', () => {
    const known = new Set(['gone']);
    const fetched = new Set();
    const existing = [{ name: 'gone', isDeleted: true }];
    assert.equal(detectDeletedBranches(known, fetched, existing).length, 0);
  });

  it('should return empty when no branches deleted', () => {
    const known = new Set(['main']);
    const fetched = new Set(['main']);
    const existing = [{ name: 'main' }];
    assert.equal(detectDeletedBranches(known, fetched, existing).length, 0);
  });
});

describe('detectUpdatedBranches', () => {
  it('should detect branches with changed commits', () => {
    const branches = [
      { name: 'feature', commit: 'abc123' },
      { name: 'main', commit: 'def456' },
    ];
    const prev = new Map([['feature', 'old_hash'], ['main', 'def456']]);
    const result = detectUpdatedBranches(branches, prev, 'main');
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'feature');
    assert.equal(result[0].justUpdated, true);
  });

  it('should exclude current branch from updates', () => {
    const branches = [{ name: 'main', commit: 'new' }];
    const prev = new Map([['main', 'old']]);
    assert.equal(detectUpdatedBranches(branches, prev, 'main').length, 0);
  });

  it('should skip deleted branches', () => {
    const branches = [{ name: 'old', commit: 'new', isDeleted: true }];
    const prev = new Map([['old', 'prev']]);
    assert.equal(detectUpdatedBranches(branches, prev, 'main').length, 0);
  });

  it('should not flag branches with no previous state', () => {
    const branches = [{ name: 'brand-new', commit: 'abc' }];
    const prev = new Map();
    assert.equal(detectUpdatedBranches(branches, prev, 'main').length, 0);
  });

  it('should not flag branches with same commit', () => {
    const branches = [{ name: 'feature', commit: 'same' }];
    const prev = new Map([['feature', 'same']]);
    assert.equal(detectUpdatedBranches(branches, prev, 'main').length, 0);
  });
});

describe('sortBranches', () => {
  const prMap = new Map();

  it('should sort new branches first', () => {
    const branches = [
      { name: 'old', date: new Date(1000), isNew: false },
      { name: 'new', date: new Date(500), isNew: true },
    ];
    const result = sortBranches(branches, prMap);
    assert.equal(result[0].name, 'new');
  });

  it('should sort deleted branches last', () => {
    const branches = [
      { name: 'deleted', date: new Date(2000), isDeleted: true },
      { name: 'active', date: new Date(1000) },
    ];
    const result = sortBranches(branches, prMap);
    assert.equal(result[result.length - 1].name, 'deleted');
  });

  it('should sort merged branches near bottom (above deleted)', () => {
    const mergedMap = new Map([['merged-branch', { state: 'MERGED' }]]);
    const branches = [
      { name: 'merged-branch', date: new Date(2000) },
      { name: 'active', date: new Date(1000) },
      { name: 'deleted', date: new Date(3000), isDeleted: true },
    ];
    const result = sortBranches(branches, mergedMap);
    assert.equal(result[0].name, 'active');
    assert.equal(result[1].name, 'merged-branch');
    assert.equal(result[2].name, 'deleted');
  });

  it('should not treat base branches as merged even with MERGED PR status', () => {
    const mainMergedMap = new Map([['main', { state: 'MERGED' }]]);
    const branches = [
      { name: 'main', date: new Date(2000) },
      { name: 'feature', date: new Date(1000) },
    ];
    const result = sortBranches(branches, mainMergedMap);
    // main should sort by date (top) despite having MERGED status
    assert.equal(result[0].name, 'main');
  });

  it('should sort by date when other criteria are equal', () => {
    const branches = [
      { name: 'older', date: new Date(1000) },
      { name: 'newer', date: new Date(2000) },
    ];
    const result = sortBranches(branches, prMap);
    assert.equal(result[0].name, 'newer');
  });
});

describe('calculateAdaptiveInterval', () => {
  it('should double interval for very slow fetches (>30s)', () => {
    const result = calculateAdaptiveInterval(35000, 5000, 5000);
    assert.equal(result.interval, 10000);
    assert.equal(result.warning, 'very_slow');
  });

  it('should cap at 60s max interval', () => {
    const result = calculateAdaptiveInterval(35000, 50000, 5000);
    assert.equal(result.interval, 60000);
  });

  it('should warn for slow fetches (>15s)', () => {
    const result = calculateAdaptiveInterval(20000, 5000, 5000);
    assert.equal(result.warning, 'slow');
    assert.equal(result.interval, 5000); // no change
  });

  it('should restore interval when fetches are fast again', () => {
    const result = calculateAdaptiveInterval(3000, 10000, 5000);
    assert.equal(result.interval, 5000);
    assert.equal(result.warning, 'restored');
  });

  it('should return null warning for normal fetches', () => {
    const result = calculateAdaptiveInterval(3000, 5000, 5000);
    assert.equal(result.warning, null);
  });

  it('should not restore if already at base interval', () => {
    const result = calculateAdaptiveInterval(3000, 5000, 5000);
    assert.equal(result.interval, 5000);
    assert.equal(result.warning, null);
  });
});

describe('restoreSelection', () => {
  const branches = [{ name: 'main' }, { name: 'feature' }, { name: 'dev' }];

  it('should find branch by name after reorder', () => {
    const result = restoreSelection(branches, 'feature', 0);
    assert.equal(result.selectedIndex, 1);
    assert.equal(result.selectedBranchName, 'feature');
  });

  it('should clamp index when branch is removed', () => {
    const result = restoreSelection(branches, 'gone-branch', 5);
    assert.equal(result.selectedIndex, 2); // clamped to last
  });

  it('should clamp to 0 for empty list', () => {
    const result = restoreSelection([], 'gone', 5);
    assert.equal(result.selectedIndex, 0);
  });

  it('should handle index overflow without previousName', () => {
    const result = restoreSelection(branches, null, 10);
    assert.equal(result.selectedIndex, 2);
  });

  it('should preserve index when within bounds and no name', () => {
    const result = restoreSelection(branches, null, 1);
    assert.equal(result.selectedIndex, 1);
  });
});

describe('pruneStaleEntries', () => {
  function makeOpts(overrides = {}) {
    return {
      knownBranchNames: new Set(['main', 'feature', 'stale']),
      fetchedBranchNames: new Set(['main', 'feature']),
      allBranches: [{ name: 'main' }, { name: 'feature' }],
      caches: [new Map([['main', 'v1'], ['feature', 'v2'], ['stale', 'v3']])],
      retentionMs: 30000,
      now: 100000,
      ...overrides,
    };
  }

  it('should prune branches not in fetchedBranchNames or allBranches', () => {
    const opts = makeOpts();
    const pruned = pruneStaleEntries(opts);
    assert.deepEqual(pruned, ['stale']);
    assert.ok(!opts.knownBranchNames.has('stale'));
    assert.ok(!opts.caches[0].has('stale'));
  });

  it('should not prune branches still in fetchedBranchNames', () => {
    const opts = makeOpts();
    pruneStaleEntries(opts);
    assert.ok(opts.knownBranchNames.has('main'));
    assert.ok(opts.knownBranchNames.has('feature'));
    assert.ok(opts.caches[0].has('main'));
    assert.ok(opts.caches[0].has('feature'));
  });

  it('should keep recently deleted branches within retention period', () => {
    const opts = makeOpts({
      allBranches: [
        { name: 'main' },
        { name: 'feature' },
        { name: 'stale', isDeleted: true, deletedAt: 90000 }, // deleted 10s ago
      ],
      now: 100000,
      retentionMs: 30000,
    });
    const pruned = pruneStaleEntries(opts);
    assert.deepEqual(pruned, []);
    assert.ok(opts.knownBranchNames.has('stale'));
    assert.ok(opts.caches[0].has('stale'));
  });

  it('should prune deleted branches past retention period', () => {
    const opts = makeOpts({
      allBranches: [
        { name: 'main' },
        { name: 'feature' },
        { name: 'stale', isDeleted: true, deletedAt: 50000 }, // deleted 50s ago
      ],
      now: 100000,
      retentionMs: 30000,
    });
    const pruned = pruneStaleEntries(opts);
    assert.deepEqual(pruned, ['stale']);
    assert.ok(!opts.knownBranchNames.has('stale'));
  });

  it('should prune from all provided caches', () => {
    const cache1 = new Map([['stale', 'a']]);
    const cache2 = new Map([['stale', 'b']]);
    const cache3 = new Map([['stale', 'c'], ['main', 'd']]);
    const opts = makeOpts({ caches: [cache1, cache2, cache3] });
    pruneStaleEntries(opts);
    assert.ok(!cache1.has('stale'));
    assert.ok(!cache2.has('stale'));
    assert.ok(!cache3.has('stale'));
    assert.ok(cache3.has('main'));
  });

  it('should return empty array when nothing to prune', () => {
    const opts = makeOpts({
      knownBranchNames: new Set(['main']),
      fetchedBranchNames: new Set(['main']),
      allBranches: [{ name: 'main' }],
      caches: [new Map([['main', 'v1']])],
    });
    assert.deepEqual(pruneStaleEntries(opts), []);
  });

  it('should handle empty inputs', () => {
    const opts = makeOpts({
      knownBranchNames: new Set(),
      fetchedBranchNames: new Set(),
      allBranches: [],
      caches: [],
    });
    assert.deepEqual(pruneStaleEntries(opts), []);
  });

  it('should handle deleted branch without deletedAt timestamp', () => {
    const opts = makeOpts({
      allBranches: [
        { name: 'main' },
        { name: 'feature' },
        { name: 'stale', isDeleted: true }, // no deletedAt
      ],
    });
    const pruned = pruneStaleEntries(opts);
    // No deletedAt means the condition (timestamp - deletedAt) > retentionMs is falsy
    assert.deepEqual(pruned, []);
  });

  it('should use default retentionMs of 30000', () => {
    const opts = makeOpts({
      allBranches: [
        { name: 'main' },
        { name: 'feature' },
        { name: 'stale', isDeleted: true, deletedAt: 69999 }, // 30001ms ago
      ],
      now: 100000,
    });
    delete opts.retentionMs;
    const pruned = pruneStaleEntries(opts);
    assert.deepEqual(pruned, ['stale']);
  });

  it('should prune multiple stale branches at once', () => {
    const opts = makeOpts({
      knownBranchNames: new Set(['main', 'gone1', 'gone2', 'gone3']),
      fetchedBranchNames: new Set(['main']),
      allBranches: [{ name: 'main' }],
      caches: [new Map([['main', 'v'], ['gone1', 'a'], ['gone2', 'b'], ['gone3', 'c']])],
    });
    const pruned = pruneStaleEntries(opts);
    assert.equal(pruned.length, 3);
    assert.ok(pruned.includes('gone1'));
    assert.ok(pruned.includes('gone2'));
    assert.ok(pruned.includes('gone3'));
    assert.equal(opts.knownBranchNames.size, 1);
    assert.equal(opts.caches[0].size, 1);
  });
});
