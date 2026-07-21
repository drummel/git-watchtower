const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  pruneStaleEntries,
  calculateInactivityInterval,
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

describe('calculateInactivityInterval', () => {
  // Defaults mirror the config: base 5s, active window 2m, step 2m, cap 5m, ×2.
  const base = 5000;
  const defaults = {
    baseMs: base,
    activeWindowMs: 120000,
    stepMs: 120000,
    maxIntervalMs: 300000,
    factor: 2,
  };
  // Note the helper param is `maxMs`, while config/callers use `maxIntervalMs`.
  const calc = (idleMs, over = {}) => {
    const merged = { ...defaults, ...over };
    return calculateInactivityInterval({
      idleMs,
      baseMs: merged.baseMs,
      activeWindowMs: merged.activeWindowMs,
      stepMs: merged.stepMs,
      maxMs: merged.maxIntervalMs,
      factor: merged.factor,
    });
  };

  it('stays at the base rate within the active window', () => {
    assert.equal(calc(0), base);
    assert.equal(calc(60000), base);        // 1 min idle
    assert.equal(calc(119999), base);       // just under 2 min
  });

  it('takes the first backoff step at the active-window boundary', () => {
    // idle === activeWindowMs is step 1 → base × 2
    assert.equal(calc(120000), base * 2);   // 10s
  });

  it('grows by the factor every step past the active window', () => {
    assert.equal(calc(120000), 10000);      // step 1 → 10s
    assert.equal(calc(240000), 20000);      // step 2 → 20s
    assert.equal(calc(360000), 40000);      // step 3 → 40s
    assert.equal(calc(480000), 80000);      // step 4 → 80s
    assert.equal(calc(600000), 160000);     // step 5 → 160s
  });

  it('caps at maxMs and holds there', () => {
    assert.equal(calc(720000), 300000);     // step 6 would be 320s → capped 300s
    assert.equal(calc(3600000), 300000);    // an hour idle → still capped
    assert.equal(calc(Number.MAX_SAFE_INTEGER), 300000);
  });

  it('honors a custom active window and step', () => {
    // N = 5 min grace, M = 1 min step
    const over = { activeWindowMs: 300000, stepMs: 60000 };
    assert.equal(calc(299999, over), base);       // still in grace
    assert.equal(calc(300000, over), base * 2);   // first step
    assert.equal(calc(360000, over), base * 4);   // second step
  });

  it('respects a factor other than 2', () => {
    assert.equal(calc(120000, { factor: 3 }), 15000);   // step 1 → base × 3
    assert.equal(calc(240000, { factor: 3 }), 45000);   // step 2 → base × 9
  });

  it('never returns below the base rate', () => {
    // A max below base is degenerate; backoff only ever slows polling, so the
    // result is floored at base rather than dropping under it.
    assert.equal(calc(600000, { maxIntervalMs: 3000 }), base);
    assert.equal(calc(0, { maxIntervalMs: 3000 }), base);
  });

  it('treats degenerate params as "backoff off" (returns base)', () => {
    assert.equal(calc(600000, { factor: 1 }), base);    // factor ≤ 1 never grows
    assert.equal(calc(600000, { factor: 0.5 }), base);
    assert.equal(calc(600000, { stepMs: 0 }), base);    // non-positive step
    assert.equal(calc(NaN), base);                      // NaN idle → base
  });

  it('handles a zero active window (ease off as soon as idle)', () => {
    assert.equal(calc(0, { activeWindowMs: 0 }), base * 2);   // step 1 right away
    assert.equal(calc(120000, { activeWindowMs: 0 }), base * 4);
  });
});
