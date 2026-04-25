'use strict';

const { execFileSync } = require('node:child_process');
const commitAnalyzer = require('@semantic-release/commit-analyzer');
const releaseNotesGenerator = require('@semantic-release/release-notes-generator');

const EXCLUDED_PREFIXES = ['website/'];

// Commits whose message bodies contain literal text that
// conventional-commits-parser misreads as semver-relevant footers
// (e.g. quoting "BREAKING CHANGE:" while explaining a prior misfire).
// Skipping by hash is a targeted workaround that avoids rewriting
// merged history on main.
const EXCLUDED_HASHES = new Set([
  // ci: exclude website-only commits from semantic-release analysis
  // Body quotes "BREAKING CHANGE: footer" which triggered the v3.0.0 misfire.
  '3012256c45aa94d6dc1b5cd38e8667df6a94e1c6',
]);

function isExcluded(file) {
  return EXCLUDED_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function commitTouchesPackage(commit) {
  if (EXCLUDED_HASHES.has(commit.hash)) return false;
  let output;
  try {
    output = execFileSync(
      'git',
      ['diff-tree', '--no-commit-id', '--name-only', '-r', commit.hash],
      { encoding: 'utf8' },
    );
  } catch {
    return true;
  }
  const files = output.split('\n').map((s) => s.trim()).filter(Boolean);
  if (files.length === 0) return true;
  return files.some((file) => !isExcluded(file));
}

function filterCommits(commits) {
  return commits.filter(commitTouchesPackage);
}

module.exports = {
  analyzeCommits: (pluginConfig, context) =>
    commitAnalyzer.analyzeCommits(pluginConfig, {
      ...context,
      commits: filterCommits(context.commits),
    }),
  generateNotes: (pluginConfig, context) =>
    releaseNotesGenerator.generateNotes(pluginConfig, {
      ...context,
      commits: filterCommits(context.commits),
    }),
};
