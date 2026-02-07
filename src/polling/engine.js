/**
 * Polling engine — pure logic for branch change detection and sorting
 * @module polling/engine
 */

const { isBaseBranch } = require('../git/pr');

/**
 * Detect new branches not previously known.
 * @param {Array<{name: string, isNew?: boolean, newAt?: number}>} allBranches - All currently fetched branches
 * @param {Set<string>} knownBranchNames - Previously known branch names
 * @returns {Array<{name: string, isNew?: boolean, newAt?: number}>} Branches with isNew flag
 */
function detectNewBranches(allBranches, knownBranchNames) {
  const now = Date.now();
  const newBranches = [];
  for (const branch of allBranches) {
    if (!knownBranchNames.has(branch.name)) {
      branch.isNew = true;
      branch.newAt = now;
      newBranches.push(branch);
    }
  }
  return newBranches;
}

/**
 * Detect deleted branches (were known but no longer exist in fetched set).
 * @param {Set<string>} knownBranchNames - Previously known branch names
 * @param {Set<string>} fetchedBranchNames - Currently fetched branch names
 * @param {Array<{name: string, isDeleted?: boolean, deletedAt?: number}>} existingBranches - Previous branch list
 * @returns {Array<{name: string, isDeleted?: boolean, deletedAt?: number}>} Deleted branches
 */
function detectDeletedBranches(knownBranchNames, fetchedBranchNames, existingBranches) {
  const now = Date.now();
  const deleted = [];
  for (const knownName of knownBranchNames) {
    if (!fetchedBranchNames.has(knownName)) {
      const existing = existingBranches.find(b => b.name === knownName);
      if (existing && !existing.isDeleted) {
        existing.isDeleted = true;
        existing.deletedAt = now;
        deleted.push(existing);
      }
    }
  }
  return deleted;
}

/**
 * Detect branches that have been updated (commit changed) since last poll.
 * @param {Array<{name: string, commit: string, isDeleted?: boolean, justUpdated?: boolean}>} branches - Current branch list
 * @param {Map<string, string>} previousStates - Map of branch name -> previous commit hash
 * @param {string} currentBranch - Name of current branch (excluded from updates)
 * @returns {Array<{name: string, commit: string, isDeleted?: boolean, justUpdated?: boolean}>} Updated branches
 */
function detectUpdatedBranches(branches, previousStates, currentBranch) {
  const updated = [];
  for (const branch of branches) {
    if (branch.isDeleted) continue;
    const prevCommit = previousStates.get(branch.name);
    if (prevCommit && prevCommit !== branch.commit && branch.name !== currentBranch) {
      branch.justUpdated = true;
      updated.push(branch);
    }
  }
  return updated;
}

/**
 * Sort branches: new first, then by date, merged near bottom, deleted at bottom.
 * @param {Array} branches - Branch list to sort
 * @param {Map} prStatusMap - Map of branch name -> PR status
 * @returns {Array} Sorted branches (mutates and returns input)
 */
function sortBranches(branches, prStatusMap) {
  return branches.sort((a, b) => {
    const aIsBase = isBaseBranch(a.name);
    const bIsBase = isBaseBranch(b.name);
    const aMerged = !aIsBase && prStatusMap.has(a.name) && prStatusMap.get(a.name).state === 'MERGED';
    const bMerged = !bIsBase && prStatusMap.has(b.name) && prStatusMap.get(b.name).state === 'MERGED';
    if (a.isDeleted && !b.isDeleted) return 1;
    if (!a.isDeleted && b.isDeleted) return -1;
    if (aMerged && !bMerged && !b.isDeleted) return 1;
    if (!aMerged && bMerged && !a.isDeleted) return -1;
    if (a.isNew && !b.isNew) return -1;
    if (!a.isNew && b.isNew) return 1;
    return b.date - a.date;
  });
}

/**
 * Calculate adaptive polling interval based on fetch duration.
 * @param {number} fetchDuration - How long the fetch took (ms)
 * @param {number} currentInterval - Current polling interval (ms)
 * @param {number} baseInterval - Base/default polling interval (ms)
 * @returns {{ interval: number, warning: string|null }}
 */
function calculateAdaptiveInterval(fetchDuration, currentInterval, baseInterval) {
  if (fetchDuration > 30000) {
    return {
      interval: Math.min(currentInterval * 2, 60000),
      warning: 'very_slow',
    };
  }
  if (fetchDuration > 15000) {
    return {
      interval: currentInterval,
      warning: 'slow',
    };
  }
  if (fetchDuration < 5000 && currentInterval > baseInterval) {
    return {
      interval: baseInterval,
      warning: 'restored',
    };
  }
  return {
    interval: currentInterval,
    warning: null,
  };
}

/**
 * Restore selection index after branch list reorder.
 * @param {Array<{name: string}>} branches - New branch list
 * @param {string|null} previousName - Previously selected branch name
 * @param {number} previousIndex - Previously selected index
 * @returns {{ selectedIndex: number, selectedBranchName: string|null }}
 */
function restoreSelection(branches, previousName, previousIndex) {
  if (previousName) {
    const newIndex = branches.findIndex(b => b.name === previousName);
    if (newIndex >= 0) {
      return { selectedIndex: newIndex, selectedBranchName: previousName };
    }
    const clampedIndex = Math.min(previousIndex, Math.max(0, branches.length - 1));
    return {
      selectedIndex: clampedIndex,
      selectedBranchName: branches[clampedIndex] ? branches[clampedIndex].name : null,
    };
  }
  if (previousIndex >= branches.length) {
    const idx = Math.max(0, branches.length - 1);
    return { selectedIndex: idx, selectedBranchName: branches[idx] ? branches[idx].name : null };
  }
  return { selectedIndex: previousIndex, selectedBranchName: previousName };
}

module.exports = {
  detectNewBranches,
  detectDeletedBranches,
  detectUpdatedBranches,
  sortBranches,
  calculateAdaptiveInterval,
  restoreSelection,
};
