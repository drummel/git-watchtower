const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  pruneStaleEntries,
} = require('../../../src/polling/engine');

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
