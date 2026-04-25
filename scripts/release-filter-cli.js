'use strict';

const { execFileSync } = require('node:child_process');
const commitAnalyzer = require('@semantic-release/commit-analyzer');
const releaseNotesGenerator = require('@semantic-release/release-notes-generator');

const EXCLUDED_PREFIXES = ['website/'];

function isExcluded(file) {
  return EXCLUDED_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function commitTouchesPackage(commit) {
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
