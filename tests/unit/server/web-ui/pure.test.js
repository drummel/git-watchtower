/**
 * Tests for pure utility functions used in the web dashboard.
 * These functions are extracted into pure.js so they can be tested in Node
 * while being inlined into the browser bundle at assembly time.
 */

const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const {
  escHtml,
  timeAgo,
  renderSparklineBars,
  fmtCompact,
  getDisplayBranches,
  buildBranchUrl,
  buildCommitUrl,
  buildPrUrl,
} = require('../../../../src/server/web-ui/pure');

// ── escHtml ─────────────────────────────────────────────────────────

describe('escHtml', () => {
  it('should escape ampersands', () => {
    assert.equal(escHtml('a & b'), 'a &amp; b');
  });

  it('should escape less-than signs', () => {
    assert.equal(escHtml('<script>'), '&lt;script&gt;');
  });

  it('should escape greater-than signs', () => {
    assert.equal(escHtml('a > b'), 'a &gt; b');
  });

  it('should escape double quotes', () => {
    assert.equal(escHtml('say "hello"'), 'say &quot;hello&quot;');
  });

  it('should escape single quotes', () => {
    assert.equal(escHtml("it's"), 'it&#39;s');
  });

  it('should escape all special characters together', () => {
    assert.equal(
      escHtml('<a href="x&y">'),
      '&lt;a href=&quot;x&amp;y&quot;&gt;'
    );
  });

  it('should handle strings with only special characters', () => {
    assert.equal(escHtml('<>&"\''), '&lt;&gt;&amp;&quot;&#39;');
  });

  it('should return empty string for null', () => {
    assert.equal(escHtml(null), '');
  });

  it('should return empty string for undefined', () => {
    assert.equal(escHtml(undefined), '');
  });

  it('should return empty string for empty string', () => {
    assert.equal(escHtml(''), '');
  });

  it('should coerce numbers to string', () => {
    assert.equal(escHtml(42), '42');
  });

  it('should pass through safe strings unchanged', () => {
    assert.equal(escHtml('hello world'), 'hello world');
  });

});

// ── timeAgo ─────────────────────────────────────────────────────────

describe('timeAgo', () => {
  it('should return empty string for null/undefined', () => {
    assert.equal(timeAgo(null), '');
    assert.equal(timeAgo(undefined), '');
    assert.equal(timeAgo(''), '');
  });

  it('should return empty string for invalid dates', () => {
    assert.equal(timeAgo('not-a-date'), '');
  });

  it('should return "now" for future dates', () => {
    const future = new Date(Date.now() + 60000).toISOString();
    assert.equal(timeAgo(future), 'now');
  });

  it('should format seconds ago', () => {
    const d = new Date(Date.now() - 30 * 1000).toISOString();
    assert.equal(timeAgo(d), '30s ago');
  });

  it('should format 0 seconds ago', () => {
    const d = new Date(Date.now() - 500).toISOString();
    assert.equal(timeAgo(d), '0s ago');
  });

  it('should format minutes ago', () => {
    const d = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    assert.equal(timeAgo(d), '5m ago');
  });

  it('should format hours ago', () => {
    const d = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    assert.equal(timeAgo(d), '3h ago');
  });

  it('should format days ago', () => {
    const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(timeAgo(d), '7d ago');
  });

  it('should handle boundary: 59 seconds', () => {
    const d = new Date(Date.now() - 59 * 1000).toISOString();
    assert.equal(timeAgo(d), '59s ago');
  });

  it('should handle boundary: 60 seconds = 1 minute', () => {
    const d = new Date(Date.now() - 60 * 1000).toISOString();
    assert.equal(timeAgo(d), '1m ago');
  });

  it('should handle boundary: 59 minutes', () => {
    const d = new Date(Date.now() - 59 * 60 * 1000).toISOString();
    assert.equal(timeAgo(d), '59m ago');
  });

  it('should handle boundary: 60 minutes = 1 hour', () => {
    const d = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    assert.equal(timeAgo(d), '1h ago');
  });

  it('should handle boundary: 23 hours', () => {
    const d = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
    assert.equal(timeAgo(d), '23h ago');
  });

  it('should handle boundary: 24 hours = 1 day', () => {
    const d = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    assert.equal(timeAgo(d), '1d ago');
  });

  it('should accept Date objects coerced to string', () => {
    const d = new Date(Date.now() - 120 * 1000);
    assert.equal(timeAgo(d.toISOString()), '2m ago');
  });
});

// ── fmtCompact ──────────────────────────────────────────────────────

describe('fmtCompact', () => {
  it('should return plain number for < 1000', () => {
    assert.equal(fmtCompact(0), '0');
    assert.equal(fmtCompact(1), '1');
    assert.equal(fmtCompact(999), '999');
  });

  it('should format thousands with one decimal for < 10000', () => {
    assert.equal(fmtCompact(1000), '1.0k');
    assert.equal(fmtCompact(1500), '1.5k');
    assert.equal(fmtCompact(9999), '10.0k');
  });

  it('should format thousands rounded for >= 10000', () => {
    assert.equal(fmtCompact(10000), '10k');
    assert.equal(fmtCompact(50000), '50k');
    assert.equal(fmtCompact(999999), '1000k');
  });

  it('should format millions with one decimal', () => {
    assert.equal(fmtCompact(1000000), '1.0m');
    assert.equal(fmtCompact(2500000), '2.5m');
    assert.equal(fmtCompact(10000000), '10.0m');
  });

  it('should handle exact boundaries', () => {
    assert.equal(fmtCompact(999), '999');
    assert.equal(fmtCompact(1000), '1.0k');
    assert.equal(fmtCompact(9999), '10.0k');
    assert.equal(fmtCompact(10000), '10k');
    assert.equal(fmtCompact(999999), '1000k');
    assert.equal(fmtCompact(1000000), '1.0m');
  });
});

// ── renderSparklineBars ─────────────────────────────────────────────

describe('renderSparklineBars', () => {
  it('should return empty string for null/undefined/empty', () => {
    assert.equal(renderSparklineBars(null), '');
    assert.equal(renderSparklineBars(undefined), '');
    assert.equal(renderSparklineBars(''), '');
  });

  it('should return a sparkline-bar div wrapper', () => {
    const result = renderSparklineBars('\u2581');
    assert.ok(result.startsWith('<div class="sparkline-bar">'));
    assert.ok(result.endsWith('</div>'));
  });

  it('should create one spark-bar per character', () => {
    const result = renderSparklineBars('\u2581\u2582\u2583');
    const barCount = (result.match(/class="spark-bar"/g) || []).length;
    assert.equal(barCount, 3);
  });

  it('should map lowest block (U+2581) to 13% height', () => {
    const result = renderSparklineBars('\u2581');
    // (1/8)*100 = 12.5, rounded = 13
    assert.ok(result.includes('height:13%'), 'Expected 13% for lowest block, got: ' + result);
  });

  it('should map highest block (U+2588) to 100% height', () => {
    const result = renderSparklineBars('\u2588');
    assert.ok(result.includes('height:100%'), 'Expected 100% for highest block, got: ' + result);
  });

  it('should map middle block (U+2584) to 50% height', () => {
    const result = renderSparklineBars('\u2584');
    // (4/8)*100 = 50
    assert.ok(result.includes('height:50%'), 'Expected 50% for middle block, got: ' + result);
  });

  it('should map all 8 block heights correctly', () => {
    const blocks = '\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588';
    const expected = [13, 25, 38, 50, 63, 75, 88, 100]; // Math.round((i+1)/8*100)
    const result = renderSparklineBars(blocks);
    for (let i = 0; i < expected.length; i++) {
      assert.ok(
        result.includes('height:' + expected[i] + '%'),
        'Expected height:' + expected[i] + '% for block ' + i
      );
    }
  });

  it('should fall back to 1px height for unknown characters', () => {
    const result = renderSparklineBars('abc');
    const matches = result.match(/height:1px/g) || [];
    assert.equal(matches.length, 3, 'Unknown chars should get 1px height');
  });

  it('should handle mixed known and unknown characters', () => {
    const result = renderSparklineBars('a\u2584z');
    assert.ok(result.includes('height:1px'), 'Unknown char should get 1px');
    assert.ok(result.includes('height:50%'), 'Known char should get percentage');
    const barCount = (result.match(/class="spark-bar"/g) || []).length;
    assert.equal(barCount, 3);
  });
});

// ── getDisplayBranches ──────────────────────────────────────────────

describe('getDisplayBranches', () => {
  const branches = [
    { name: 'main', date: '2024-01-05T00:00:00Z' },
    { name: 'feature-alpha', date: '2024-01-03T00:00:00Z' },
    { name: 'feature-beta', date: '2024-01-04T00:00:00Z' },
    { name: 'bugfix-gamma', date: '2024-01-01T00:00:00Z' },
    { name: 'develop', date: '2024-01-02T00:00:00Z' },
  ];

  it('should return empty array for null/undefined branches', () => {
    assert.deepEqual(getDisplayBranches(null, {}), []);
    assert.deepEqual(getDisplayBranches(undefined, {}), []);
  });

  it('should return all branches with no options', () => {
    const result = getDisplayBranches(branches, {});
    assert.equal(result.length, 5);
  });

  it('should not mutate the original array', () => {
    const copy = branches.slice();
    getDisplayBranches(branches, { sortOrder: 'alpha' });
    assert.deepEqual(branches, copy, 'Original array should not be mutated');
  });

  // Search filtering
  it('should filter by search query (case-insensitive)', () => {
    const result = getDisplayBranches(branches, { searchQuery: 'feature' });
    assert.equal(result.length, 2);
    assert.ok(result.every(b => b.name.includes('feature')));
  });

  it('should filter by search query (uppercase)', () => {
    const result = getDisplayBranches(branches, { searchQuery: 'MAIN' });
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'main');
  });

  it('should return empty array when search matches nothing', () => {
    const result = getDisplayBranches(branches, { searchQuery: 'nonexistent' });
    assert.equal(result.length, 0);
  });

  it('should return all when search is empty string', () => {
    const result = getDisplayBranches(branches, { searchQuery: '' });
    assert.equal(result.length, 5);
  });

  // Pinning
  it('should pin branches to the top (default sort)', () => {
    const result = getDisplayBranches(branches, {
      pinnedBranches: ['bugfix-gamma'],
    });
    assert.equal(result[0].name, 'bugfix-gamma');
  });

  it('should pin multiple branches to the top', () => {
    const result = getDisplayBranches(branches, {
      pinnedBranches: ['bugfix-gamma', 'develop'],
    });
    const pinnedNames = result.slice(0, 2).map(b => b.name);
    assert.ok(pinnedNames.includes('bugfix-gamma'));
    assert.ok(pinnedNames.includes('develop'));
  });

  it('should ignore pinned branches that are not in the list', () => {
    const result = getDisplayBranches(branches, {
      pinnedBranches: ['nonexistent'],
    });
    assert.equal(result.length, 5);
  });

  // Alphabetical sort
  it('should sort alphabetically with sortOrder=alpha', () => {
    const result = getDisplayBranches(branches, { sortOrder: 'alpha' });
    const names = result.map(b => b.name);
    assert.deepEqual(names, [
      'bugfix-gamma', 'develop', 'feature-alpha', 'feature-beta', 'main',
    ]);
  });

  it('should sort alphabetically but keep pinned branches first', () => {
    const result = getDisplayBranches(branches, {
      sortOrder: 'alpha',
      pinnedBranches: ['main'],
    });
    assert.equal(result[0].name, 'main', 'Pinned branch should be first');
    // Rest should be alphabetical
    const rest = result.slice(1).map(b => b.name);
    assert.deepEqual(rest, ['bugfix-gamma', 'develop', 'feature-alpha', 'feature-beta']);
  });

  // Recent sort
  it('should sort by most recent with sortOrder=recent', () => {
    const result = getDisplayBranches(branches, { sortOrder: 'recent' });
    const names = result.map(b => b.name);
    assert.deepEqual(names, [
      'main', 'feature-beta', 'feature-alpha', 'develop', 'bugfix-gamma',
    ]);
  });

  it('should sort by recent but keep pinned branches first', () => {
    const result = getDisplayBranches(branches, {
      sortOrder: 'recent',
      pinnedBranches: ['bugfix-gamma'],
    });
    assert.equal(result[0].name, 'bugfix-gamma', 'Pinned branch should be first');
    assert.equal(result[1].name, 'main', 'Most recent non-pinned should be second');
  });

  it('should handle branches with missing dates in recent sort', () => {
    const branchesWithMissing = [
      { name: 'a', date: '2024-01-01T00:00:00Z' },
      { name: 'b', date: null },
      { name: 'c', date: '2024-01-03T00:00:00Z' },
    ];
    const result = getDisplayBranches(branchesWithMissing, { sortOrder: 'recent' });
    assert.equal(result[0].name, 'c', 'Most recent should be first');
    assert.equal(result[result.length - 1].name, 'b', 'Null date should sort last');
  });

  // Combined: search + sort + pin
  it('should apply search, then sort, then pin together', () => {
    const result = getDisplayBranches(branches, {
      searchQuery: 'feature',
      sortOrder: 'alpha',
      pinnedBranches: ['feature-beta'],
    });
    assert.equal(result.length, 2);
    assert.equal(result[0].name, 'feature-beta', 'Pinned match should be first');
    assert.equal(result[1].name, 'feature-alpha');
  });

  // Default sort with no pins should preserve order
  it('should preserve original order with default sort and no pins', () => {
    const result = getDisplayBranches(branches, { sortOrder: 'default' });
    const names = result.map(b => b.name);
    assert.deepEqual(names, branches.map(b => b.name));
  });
});

// ── buildBranchUrl ──────────────────────────────────────────────────
// These are inlined into the browser bundle, so the audit's "broken links
// for Bitbucket / Azure / AWS CodeCommit" finding becomes a regression
// here if they revert.

describe('buildBranchUrl', () => {
  it('should build GitHub branch URL', () => {
    assert.equal(
      buildBranchUrl('https://github.com/user/repo', 'github.com', 'main'),
      'https://github.com/user/repo/tree/main'
    );
  });

  it('should build self-hosted GitLab branch URL (still uses /tree/)', () => {
    assert.equal(
      buildBranchUrl('https://gitlab.example.com/g/p', 'gitlab.example.com', 'feature'),
      'https://gitlab.example.com/g/p/tree/feature'
    );
  });

  it('should build Bitbucket branch URL with /src/', () => {
    assert.equal(
      buildBranchUrl('https://bitbucket.org/team/repo', 'bitbucket.org', 'develop'),
      'https://bitbucket.org/team/repo/src/develop'
    );
  });

  it('should build Azure DevOps branch URL with ?version=GB', () => {
    assert.equal(
      buildBranchUrl('https://dev.azure.com/org/proj/_git/repo', 'dev.azure.com', 'feature'),
      'https://dev.azure.com/org/proj/_git/repo?version=GBfeature'
    );
  });

  it('should build VisualStudio.com Azure branch URL', () => {
    assert.equal(
      buildBranchUrl('https://org.visualstudio.com/proj/_git/repo', 'org.visualstudio.com', 'main'),
      'https://org.visualstudio.com/proj/_git/repo?version=GBmain'
    );
  });

  it('should build AWS CodeCommit branch URL', () => {
    assert.equal(
      buildBranchUrl(
        'https://codecommit.us-east-1.amazonaws.com/v1/repos/myrepo',
        'codecommit.us-east-1.amazonaws.com',
        'main'
      ),
      'https://codecommit.us-east-1.amazonaws.com/v1/repos/myrepo/browse/refs/heads/main'
    );
  });

  it('should encode branch names with special characters', () => {
    assert.equal(
      buildBranchUrl('https://github.com/u/r', 'github.com', 'feature/my branch'),
      'https://github.com/u/r/tree/feature%2Fmy%20branch'
    );
  });

  it('should default to /tree/ for unknown hosts', () => {
    assert.equal(
      buildBranchUrl('https://gitea.example.com/u/r', 'gitea.example.com', 'main'),
      'https://gitea.example.com/u/r/tree/main'
    );
  });

  it('should be case-insensitive on host', () => {
    assert.equal(
      buildBranchUrl('https://bitbucket.org/team/repo', 'BITBUCKET.org', 'develop'),
      'https://bitbucket.org/team/repo/src/develop'
    );
  });
});

// ── buildCommitUrl ──────────────────────────────────────────────────

describe('buildCommitUrl', () => {
  it('should build GitHub commit URL with /commit/', () => {
    assert.equal(
      buildCommitUrl('https://github.com/u/r', 'github.com', 'abc1234'),
      'https://github.com/u/r/commit/abc1234'
    );
  });

  it('should build Bitbucket commit URL with /commits/ (plural)', () => {
    assert.equal(
      buildCommitUrl('https://bitbucket.org/team/repo', 'bitbucket.org', 'abc1234'),
      'https://bitbucket.org/team/repo/commits/abc1234'
    );
  });

  it('should build GitLab commit URL with /commit/', () => {
    assert.equal(
      buildCommitUrl('https://gitlab.com/g/p', 'gitlab.com', 'abc1234'),
      'https://gitlab.com/g/p/commit/abc1234'
    );
  });

  it('should return null for missing sha', () => {
    assert.equal(buildCommitUrl('https://github.com/u/r', 'github.com', null), null);
    assert.equal(buildCommitUrl('https://github.com/u/r', 'github.com', ''), null);
  });
});

// ── buildPrUrl ──────────────────────────────────────────────────────

describe('buildPrUrl', () => {
  it('should build GitHub PR URL with /pull/', () => {
    assert.equal(
      buildPrUrl('https://github.com/u/r', 'github.com', 42),
      'https://github.com/u/r/pull/42'
    );
  });

  it('should build GitLab MR URL with /-/merge_requests/', () => {
    assert.equal(
      buildPrUrl('https://gitlab.com/g/p', 'gitlab.com', 42),
      'https://gitlab.com/g/p/-/merge_requests/42'
    );
  });

  it('should build self-hosted GitLab MR URL', () => {
    assert.equal(
      buildPrUrl('https://gitlab.example.com/g/p', 'gitlab.example.com', 42),
      'https://gitlab.example.com/g/p/-/merge_requests/42'
    );
  });

  it('should build Bitbucket pull-request URL with /pull-requests/', () => {
    assert.equal(
      buildPrUrl('https://bitbucket.org/team/repo', 'bitbucket.org', 42),
      'https://bitbucket.org/team/repo/pull-requests/42'
    );
  });

  it('should build Azure DevOps PR URL with /pullrequest/', () => {
    assert.equal(
      buildPrUrl('https://dev.azure.com/org/proj/_git/repo', 'dev.azure.com', 42),
      'https://dev.azure.com/org/proj/_git/repo/pullrequest/42'
    );
  });

  it('should build AWS CodeCommit PR URL', () => {
    assert.equal(
      buildPrUrl(
        'https://codecommit.us-east-1.amazonaws.com/v1/repos/myrepo',
        'codecommit.us-east-1.amazonaws.com',
        42
      ),
      'https://codecommit.us-east-1.amazonaws.com/v1/repos/myrepo/pull-requests/42'
    );
  });

  it('should return null for missing prNumber', () => {
    assert.equal(buildPrUrl('https://github.com/u/r', 'github.com', null), null);
    assert.equal(buildPrUrl('https://github.com/u/r', 'github.com', 0), null);
  });

  it('should not match "gitlab" inside an unrelated host segment', () => {
    // host like "company.com" with path containing "gitlab" should NOT
    // be classified as GitLab — we split on dots, so "gitlab" must be
    // its own segment.
    assert.equal(
      buildPrUrl('https://github.com/gitlab-org/repo', 'github.com', 42),
      'https://github.com/gitlab-org/repo/pull/42'
    );
  });
});
