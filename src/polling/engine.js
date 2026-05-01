/**
 * Polling engine — pure logic for branch tracking-set maintenance.
 *
 * Note: this module previously also exported helpers like detectNewBranches,
 * detectDeletedBranches, sortBranches, calculateAdaptiveInterval, etc., but
 * the bin reimplements those flows inline. Only pruneStaleEntries is wired
 * up in production, so that's all that lives here now.
 *
 * @module polling/engine
 */

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
};
