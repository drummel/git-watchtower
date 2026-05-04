/**
 * Casino mode "win" line-count aggregation.
 *
 * The polling loop used to fake the line-change total as
 * `notifyBranches.length * 100` — a placeholder that surfaced as inflated
 * (and incorrect) numbers in the dashboard's "+lines" / netWinnings
 * displays. This module sums the REAL diff between each updated branch's
 * previous commit and its new commit so the casino stats track actual
 * code churn.
 *
 * @module casino/poll-churn
 */

/**
 * Sum the diff churn across a list of updated branches by running the
 * caller-supplied diff function on each (prev → new) pair in parallel.
 * Branches missing a prev commit (e.g. brand-new branches) contribute 0,
 * so a notification still fires but no fake line count is invented.
 *
 * @param {Array<{name: string, commit: string}>} updatedBranches
 * @param {Map<string, string>} prevCommits - map of branch.name → previous commit hash
 * @param {(from: string, to: string) => Promise<{added: number, deleted: number}>} diffFn
 * @returns {Promise<{added: number, deleted: number}>}
 */
async function sumPollChurn(updatedBranches, prevCommits, diffFn) {
  if (!updatedBranches || updatedBranches.length === 0) {
    return { added: 0, deleted: 0 };
  }
  const results = await Promise.all(
    updatedBranches.map(async (branch) => {
      const prev = prevCommits ? prevCommits.get(branch.name) : null;
      if (!prev || !branch.commit) return { added: 0, deleted: 0 };
      try {
        const r = await diffFn(prev, branch.commit);
        return {
          added: Number.isFinite(r && r.added) ? r.added : 0,
          deleted: Number.isFinite(r && r.deleted) ? r.deleted : 0,
        };
      } catch (e) {
        // diffFn already returns { added: 0, deleted: 0 } on git failure
        // (see src/git/commands.js#getDiffStats), but guard against a
        // throwing test stub or future caller passing a stricter fn.
        return { added: 0, deleted: 0 };
      }
    })
  );
  return results.reduce(
    (acc, d) => ({ added: acc.added + d.added, deleted: acc.deleted + d.deleted }),
    { added: 0, deleted: 0 }
  );
}

module.exports = { sumPollChurn };
