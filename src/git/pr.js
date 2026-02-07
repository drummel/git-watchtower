/**
 * PR/CI integration for GitHub (gh) and GitLab (glab) CLIs
 * @module git/pr
 */

/**
 * Parse GitHub PR JSON response into normalized PR info.
 * @param {Array} prs - Array of PR objects from gh CLI
 * @returns {object|null} Normalized PR info
 */
function parseGitHubPr(prs) {
  if (!prs || prs.length === 0) return null;
  const pr = prs[0];
  const checks = pr.statusCheckRollup || [];
  const checksPass = checks.length > 0 && checks.every(c => c.conclusion === 'SUCCESS');
  const checksFail = checks.some(c => c.conclusion === 'FAILURE');
  return {
    number: pr.number,
    title: pr.title,
    state: pr.state,
    approved: pr.reviewDecision === 'APPROVED',
    checksPass,
    checksFail,
    checksCount: checks.length,
  };
}

/**
 * Parse GitLab MR JSON response into normalized PR info.
 * @param {Array} mrs - Array of MR objects from glab CLI
 * @returns {object|null} Normalized PR info
 */
function parseGitLabMr(mrs) {
  if (!mrs || mrs.length === 0) return null;
  const mr = mrs[0];
  return {
    number: mr.iid,
    title: mr.title,
    state: mr.state === 'merged' ? 'MERGED' : mr.state === 'opened' ? 'OPEN' : 'CLOSED',
    approved: false,
    checksPass: false,
    checksFail: false,
    checksCount: 0,
  };
}

/**
 * Parse bulk GitHub PR list into a Map of branch -> PR status.
 * @param {Array} prs - Array of PR objects from gh CLI
 * @returns {Map<string, {state: string, number: number, title: string}>}
 */
function parseGitHubPrList(prs) {
  const map = new Map();
  if (!prs || !Array.isArray(prs)) return map;
  for (const pr of prs) {
    const existing = map.get(pr.headRefName);
    if (!existing || pr.number > existing.number) {
      map.set(pr.headRefName, {
        state: pr.state,
        number: pr.number,
        title: pr.title,
      });
    }
  }
  return map;
}

/**
 * Parse bulk GitLab MR list into a Map of branch -> PR status.
 * @param {Array} mrs - Array of MR objects from glab CLI
 * @returns {Map<string, {state: string, number: number, title: string}>}
 */
function parseGitLabMrList(mrs) {
  const map = new Map();
  if (!mrs || !Array.isArray(mrs)) return map;
  for (const mr of mrs) {
    const branchName = mr.source_branch;
    const existing = map.get(branchName);
    if (!existing || mr.iid > existing.number) {
      map.set(branchName, {
        state: mr.state === 'merged' ? 'MERGED' : mr.state === 'opened' ? 'OPEN' : 'CLOSED',
        number: mr.iid,
        title: mr.title,
      });
    }
  }
  return map;
}

/**
 * Default/base branches that should never get "merged" treatment.
 */
const BASE_BRANCH_RE = /^(main|master|develop|development|staging|production|trunk|release)$/;

/**
 * Check if a branch name is a base/default branch.
 * @param {string} name
 * @returns {boolean}
 */
function isBaseBranch(name) {
  return BASE_BRANCH_RE.test(name);
}

module.exports = {
  parseGitHubPr,
  parseGitLabMr,
  parseGitHubPrList,
  parseGitLabMrList,
  BASE_BRANCH_RE,
  isBaseBranch,
};
