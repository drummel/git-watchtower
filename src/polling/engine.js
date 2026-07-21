/**
 * Polling engine — pure logic for branch tracking-set maintenance.
 *
 * Note: this module previously also exported helpers like detectNewBranches,
 * detectDeletedBranches, sortBranches, etc., but the bin reimplements those
 * flows inline. Only pruneStaleEntries and calculateInactivityInterval are
 * wired up in production, so that's all that lives here now.
 *
 * @module polling/engine
 */

/**
 * Calculate the poll interval under inactivity backoff ("poll backdown").
 *
 * The idea: keep polling at the normal (base) rate while the repo is showing
 * activity, then progressively ease off once it goes quiet — giving the remote
 * a break from `git ls-remote`/`fetch` on every tick. Any detected change
 * resets `idleMs` to ~0 (the caller does this), which snaps the interval back
 * to the base rate on the next cycle.
 *
 * Shape of the curve:
 *   - `idleMs < activeWindowMs`            → stay at `baseMs` (the grace window)
 *   - every `stepMs` of continued idleness → multiply the interval by `factor`
 *   - never exceed `maxMs`                 → the ceiling (e.g. every 5 minutes)
 *
 * With the defaults (base 5s, active window 2m, step 2m, factor 2, max 5m) an
 * idle repo eases 5s → 10s → 20s → 40s → 80s → 160s → 300s over ~12 minutes,
 * then holds at the 5-minute ceiling until something changes.
 *
 * Pure and deterministic: given the same inputs it always returns the same
 * interval, which is what makes it unit-testable in isolation.
 *
 * @param {Object} opts
 * @param {number} opts.idleMs - Time since the last detected activity, in ms.
 * @param {number} opts.baseMs - Normal (fast) poll interval, in ms.
 * @param {number} [opts.activeWindowMs=120000] - Grace window kept at baseMs after activity.
 * @param {number} [opts.stepMs=120000] - How often the interval grows past the grace window.
 * @param {number} [opts.maxMs=300000] - Ceiling for the returned interval.
 * @param {number} [opts.factor=2] - Multiplier applied to the interval per step.
 * @returns {number} Poll interval in ms, clamped to the range [baseMs, maxMs].
 */
function calculateInactivityInterval({
  idleMs,
  baseMs,
  activeWindowMs = 120000,
  stepMs = 120000,
  maxMs = 300000,
  factor = 2,
}) {
  // Treat a non-positive/NaN base as "off" — nothing sensible to grow from.
  const base = Number.isFinite(baseMs) && baseMs > 0 ? baseMs : 0;
  const ceiling = Number.isFinite(maxMs) ? maxMs : Infinity;

  // Still inside the active window, or the backoff is disabled by degenerate
  // params (a NaN idle also lands here since NaN >= x is false). Stay at the
  // base rate — backoff only ever slows polling down, never speeds it up.
  if (!(idleMs >= activeWindowMs) || factor <= 1 || stepMs <= 0) {
    return base;
  }

  // At the boundary (idleMs === activeWindowMs) this is step 1 — the first
  // notch of backoff — so the grace window is "< activeWindowMs stays fast".
  const steps = Math.floor((idleMs - activeWindowMs) / stepMs) + 1;
  const grown = base * Math.pow(factor, steps);
  // Clamp to [base, ceiling]. The min caps growth (and collapses the Infinity
  // that Math.pow reaches for very large idle times back to maxMs); the outer
  // max keeps a degenerate maxMs < base from ever dropping below the base rate.
  return Math.max(base, Math.min(grown, ceiling));
}

/**
 * Prune stale entries from tracking sets and caches for branches
 * that no longer exist in git.
 * @param {Object} opts
 * @param {Set<string>} opts.knownBranchNames - Known branch names (mutated)
 * @param {Set<string>} opts.fetchedBranchNames - Currently fetched branch names
 * @param {Array<{name: string, isDeleted?: boolean, deletedAt?: number}>} opts.allBranches - All branches including deleted
 * @param {Map<string, *>[]} opts.caches - Maps to prune stale keys from
 * @param {number} [opts.retentionMs=30000] - How long to keep deleted branches before pruning
 * @param {number} [opts.now] - Current timestamp (defaults to Date.now())
 * @returns {string[]} Names of pruned branches
 */
function pruneStaleEntries({ knownBranchNames, fetchedBranchNames, allBranches, caches, retentionMs = 30000, now }) {
  const timestamp = now ?? Date.now();
  const pruned = [];
  for (const knownName of [...knownBranchNames]) {
    if (fetchedBranchNames.has(knownName)) continue;
    const deletedBranch = allBranches.find(b => b.name === knownName && b.isDeleted);
    const shouldPrune = deletedBranch
      ? (deletedBranch.deletedAt && (timestamp - deletedBranch.deletedAt) > retentionMs)
      : true; // Not in allBranches at all — stale entry
    if (shouldPrune) {
      knownBranchNames.delete(knownName);
      for (const cache of caches) {
        cache.delete(knownName);
      }
      pruned.push(knownName);
    }
  }
  return pruned;
}

module.exports = {
  pruneStaleEntries,
  calculateInactivityInterval,
};
