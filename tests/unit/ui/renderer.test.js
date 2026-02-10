/**
 * Tests for the renderer module (src/ui/renderer.js)
 *
 * Each render function takes a `(state, write)` pair.  We capture output
 * into an array, join it, then strip ANSI codes so assertions are readable.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  renderHeader,
  renderBranchList,
  renderActivityLog,
  renderFooter,
  renderFlash,
  renderErrorToast,
  renderPreview,
  renderHistory,
  renderLogView,
  renderInfo,
  renderActionModal,
} = require('../../../src/ui/renderer');
const { stripAnsi } = require('../../../src/ui/ansi');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides = {}) {
  return {
    terminalWidth: 80,
    terminalHeight: 24,
    branches: [],
    currentBranch: 'main',
    selectedIndex: 0,
    selectedBranchName: null,
    filteredBranches: null,
    sparklineCache: new Map(),
    branchPrStatusMap: new Map(),
    searchMode: false,
    searchQuery: '',
    previewMode: false,
    previewData: null,
    historyMode: false,
    infoMode: false,
    logViewMode: false,
    logViewTab: 'server',
    actionMode: false,
    actionData: null,
    actionLoading: false,
    flashMessage: null,
    errorToast: null,
    pollingStatus: 'idle',
    isOffline: false,
    isDetachedHead: false,
    hasMergeConflict: false,
    serverMode: 'static',
    noServer: false,
    port: 3000,
    serverRunning: true,
    serverCrashed: false,
    serverLogBuffer: [],
    logScrollOffset: 0,
    visibleBranchCount: 7,
    soundEnabled: true,
    casinoModeEnabled: false,
    activityLog: [],
    switchHistory: [],
    maxLogEntries: 10,
    adaptivePollInterval: 5000,
    clientCount: 0,
    projectName: 'test-project',
    ...overrides,
  };
}

function collect(fn, ...args) {
  const output = [];
  const write = (s) => output.push(s);
  const ret = fn(...args, write);
  return { raw: output.join(''), text: stripAnsi(output.join('')), ret };
}

function collectState(fn, overrides) {
  const state = makeState(overrides);
  return collect(fn, state);
}

// ---------------------------------------------------------------------------
// renderHeader
// ---------------------------------------------------------------------------

describe('renderHeader', () => {
  it('should show project name', () => {
    const { text } = collectState(renderHeader);
    assert.ok(text.includes('test-project'), 'Expected project name in header');
  });

  it('should show a custom project name', () => {
    const { text } = collectState(renderHeader, { projectName: 'my-app' });
    assert.ok(text.includes('my-app'));
  });

  it('should show OFFLINE badge when isOffline', () => {
    const { text } = collectState(renderHeader, { isOffline: true });
    assert.ok(text.includes('OFFLINE'), 'Expected OFFLINE badge');
  });

  it('should show DETACHED HEAD badge when isDetachedHead', () => {
    const { text } = collectState(renderHeader, { isDetachedHead: true });
    assert.ok(text.includes('DETACHED HEAD'), 'Expected DETACHED HEAD badge');
  });

  it('should show MERGE CONFLICT badge when hasMergeConflict', () => {
    const { text } = collectState(renderHeader, { hasMergeConflict: true });
    assert.ok(text.includes('MERGE CONFLICT'), 'Expected MERGE CONFLICT badge');
  });

  it('should show CRASHED badge when server crashed in command mode', () => {
    const { text } = collectState(renderHeader, {
      serverMode: 'command',
      serverCrashed: true,
    });
    assert.ok(text.includes('CRASHED'), 'Expected CRASHED badge');
  });

  it('should not show CRASHED badge in static mode even if serverCrashed', () => {
    const { text } = collectState(renderHeader, {
      serverMode: 'static',
      serverCrashed: true,
    });
    assert.ok(!text.includes('CRASHED'), 'Should not show CRASHED in static mode');
  });

  it('should show STATIC mode badge for static serverMode', () => {
    const { text } = collectState(renderHeader, { serverMode: 'static' });
    assert.ok(text.includes('STATIC'), 'Expected STATIC badge');
  });

  it('should show COMMAND mode badge for command serverMode', () => {
    const { text } = collectState(renderHeader, { serverMode: 'command' });
    assert.ok(text.includes('COMMAND'), 'Expected COMMAND badge');
  });

  it('should show MONITOR mode badge for monitor serverMode', () => {
    const { text } = collectState(renderHeader, { serverMode: 'monitor' });
    assert.ok(text.includes('MONITOR'), 'Expected MONITOR badge');
  });

  it('should show sound enabled icon when soundEnabled is true', () => {
    const { raw } = collectState(renderHeader, { soundEnabled: true });
    // Sound enabled uses the bell emoji \uD83D\uDD14
    assert.ok(raw.includes('\uD83D\uDD14'), 'Expected sound-on icon');
  });

  it('should show sound disabled icon when soundEnabled is false', () => {
    const { raw } = collectState(renderHeader, { soundEnabled: false });
    // Sound disabled uses \uD83D\uDD15
    assert.ok(raw.includes('\uD83D\uDD15'), 'Expected sound-off icon');
  });

  it('should show server host and port when server is not none mode', () => {
    const { text } = collectState(renderHeader, { port: 4000 });
    assert.ok(text.includes('localhost:4000'), 'Expected server URL in header');
  });

  it('should show multiple badges simultaneously', () => {
    const { text } = collectState(renderHeader, {
      isOffline: true,
      isDetachedHead: true,
      hasMergeConflict: true,
    });
    assert.ok(text.includes('OFFLINE'));
    assert.ok(text.includes('DETACHED HEAD'));
    assert.ok(text.includes('MERGE CONFLICT'));
  });
});

// ---------------------------------------------------------------------------
// renderBranchList
// ---------------------------------------------------------------------------

describe('renderBranchList', () => {
  it('should show "No branches found" when branches array is empty', () => {
    const { text } = collectState(renderBranchList);
    assert.ok(text.includes('No branches found'), 'Expected empty message');
  });

  it('should show "No branches matching" when search yields no results', () => {
    const { text } = collectState(renderBranchList, {
      searchMode: true,
      searchQuery: 'xyz',
      filteredBranches: [],
    });
    assert.ok(
      text.includes('No branches matching'),
      'Expected no-match message'
    );
    assert.ok(text.includes('xyz'), 'Expected query in message');
  });

  it('should show branch names', () => {
    const { text } = collectState(renderBranchList, {
      branches: [
        { name: 'feature/login', date: new Date(), commit: 'abc1234', subject: 'Add login' },
      ],
    });
    assert.ok(text.includes('feature/login'), 'Expected branch name');
  });

  it('should show current branch with CURRENT badge', () => {
    const { text } = collectState(renderBranchList, {
      currentBranch: 'main',
      branches: [
        { name: 'main', date: new Date(), commit: 'abc1234', subject: 'Init' },
      ],
    });
    assert.ok(text.includes('\u2605'), 'Expected star indicator');
    assert.ok(text.includes('CURRENT'), 'Expected CURRENT badge');
  });

  it('should show NEW badge for new branches', () => {
    const { text } = collectState(renderBranchList, {
      branches: [
        { name: 'feature/new', date: new Date(), commit: 'abc1234', subject: 'New', isNew: true },
      ],
    });
    assert.ok(text.includes('\u2726'), 'Expected diamond indicator');
    assert.ok(text.includes('NEW'), 'Expected NEW badge');
  });

  it('should show UPDATES badge for branches with updates', () => {
    const { text } = collectState(renderBranchList, {
      branches: [
        { name: 'feature/upd', date: new Date(), commit: 'abc1234', subject: 'Upd', hasUpdates: true },
      ],
    });
    assert.ok(text.includes('\u2193'), 'Expected down-arrow indicator');
    assert.ok(text.includes('UPDATES'), 'Expected UPDATES badge');
  });

  it('should show DELETED badge for deleted branches', () => {
    const { text } = collectState(renderBranchList, {
      branches: [
        { name: 'old-branch', date: new Date(), commit: 'abc1234', subject: 'Old', isDeleted: true },
      ],
    });
    assert.ok(text.includes('\u2717'), 'Expected cross indicator');
    assert.ok(text.includes('DELETED'), 'Expected DELETED badge');
  });

  it('should return the bottom row number', () => {
    const state = makeState({
      branches: [
        { name: 'main', date: new Date(), commit: 'abc', subject: 'Init' },
      ],
    });
    const output = [];
    const write = (s) => output.push(s);
    const bottomRow = renderBranchList(state, write);
    assert.strictEqual(typeof bottomRow, 'number');
    assert.ok(bottomRow > 3, 'Bottom row should be past the start row');
  });

  it('should show search query in title when in search mode', () => {
    const { text } = collectState(renderBranchList, {
      searchMode: true,
      searchQuery: 'feat',
      filteredBranches: [
        { name: 'feature/a', date: new Date(), commit: 'abc', subject: 'A' },
      ],
    });
    assert.ok(text.includes('BRANCHES'), 'Expected BRANCHES title');
    assert.ok(text.includes('/feat'), 'Expected search query in title');
  });

  it('should show ACTIVE BRANCHES title when not in search mode', () => {
    const { text } = collectState(renderBranchList, {
      branches: [
        { name: 'main', date: new Date(), commit: 'abc', subject: 'Init' },
      ],
    });
    assert.ok(text.includes('ACTIVE BRANCHES'), 'Expected ACTIVE BRANCHES title');
  });

  it('should show commit hash in branch detail line', () => {
    const { text } = collectState(renderBranchList, {
      branches: [
        { name: 'main', date: new Date(), commit: 'a1b2c3d', subject: 'Test commit' },
      ],
    });
    assert.ok(text.includes('a1b2c3d'), 'Expected commit hash');
  });

  it('should show commit subject in branch detail line', () => {
    const { text } = collectState(renderBranchList, {
      branches: [
        { name: 'main', date: new Date(), commit: 'abc1234', subject: 'My commit message' },
      ],
    });
    assert.ok(text.includes('My commit message'), 'Expected commit subject');
  });

  it('should respect visibleBranchCount limit', () => {
    const branches = [];
    for (let i = 0; i < 20; i++) {
      branches.push({ name: `branch-${i}`, date: new Date(), commit: 'abc', subject: `Subject ${i}` });
    }
    const { text } = collectState(renderBranchList, {
      branches,
      visibleBranchCount: 3,
    });
    // Should show first 3 branches but not later ones
    assert.ok(text.includes('branch-0'));
    assert.ok(text.includes('branch-1'));
    assert.ok(text.includes('branch-2'));
    assert.ok(!text.includes('branch-3'), 'Should not show branch beyond visibleBranchCount');
  });

  it('should use filteredBranches when provided', () => {
    const { text } = collectState(renderBranchList, {
      branches: [
        { name: 'main', date: new Date(), commit: 'abc', subject: 'Init' },
        { name: 'dev', date: new Date(), commit: 'def', subject: 'Dev' },
      ],
      filteredBranches: [
        { name: 'dev', date: new Date(), commit: 'def', subject: 'Dev' },
      ],
    });
    assert.ok(text.includes('dev'));
    // main should not appear because we use filteredBranches
    assert.ok(!text.includes('main'));
  });
});

// ---------------------------------------------------------------------------
// renderActivityLog
// ---------------------------------------------------------------------------

describe('renderActivityLog', () => {
  it('should show "No activity yet..." when activityLog is empty', () => {
    const state = makeState();
    const output = [];
    const write = (s) => output.push(s);
    renderActivityLog(state, write, 15);
    const text = stripAnsi(output.join(''));
    assert.ok(text.includes('No activity yet...'), 'Expected empty-log message');
  });

  it('should show log entries with timestamps', () => {
    const state = makeState({
      activityLog: [
        { timestamp: '12:34:56', color: 'green', icon: '\u2713', message: 'Fetched branches' },
        { timestamp: '12:35:00', color: 'yellow', icon: '\u26A0', message: 'Branch updated' },
      ],
    });
    const output = [];
    const write = (s) => output.push(s);
    renderActivityLog(state, write, 15);
    const text = stripAnsi(output.join(''));
    assert.ok(text.includes('[12:34:56]'), 'Expected first timestamp');
    assert.ok(text.includes('Fetched branches'), 'Expected first message');
    assert.ok(text.includes('[12:35:00]'), 'Expected second timestamp');
    assert.ok(text.includes('Branch updated'), 'Expected second message');
  });

  it('should return the correct bottom row', () => {
    const state = makeState();
    const output = [];
    const write = (s) => output.push(s);
    const startRow = 15;
    const bottomRow = renderActivityLog(state, write, startRow);
    assert.strictEqual(typeof bottomRow, 'number');
    assert.ok(bottomRow > startRow, 'Bottom row should be past startRow');
  });

  it('should show ACTIVITY LOG title', () => {
    const state = makeState();
    const output = [];
    const write = (s) => output.push(s);
    renderActivityLog(state, write, 15);
    const text = stripAnsi(output.join(''));
    assert.ok(text.includes('ACTIVITY LOG'), 'Expected ACTIVITY LOG title');
  });
});

// ---------------------------------------------------------------------------
// renderFooter
// ---------------------------------------------------------------------------

describe('renderFooter', () => {
  it('should show navigation keys', () => {
    const { text } = collectState(renderFooter);
    assert.ok(text.includes('Nav'), 'Expected Nav key hint');
    assert.ok(text.includes('Search'), 'Expected Search key hint');
    assert.ok(text.includes('Preview'), 'Expected Preview key hint');
    assert.ok(text.includes('Switch'), 'Expected Switch key hint');
    assert.ok(text.includes('History'), 'Expected History key hint');
    assert.ok(text.includes('Info'), 'Expected Info key hint');
    assert.ok(text.includes('Actions'), 'Expected Actions key hint');
    assert.ok(text.includes('Quit'), 'Expected Quit key hint');
  });

  it('should show server keys when server is active', () => {
    const { text } = collectState(renderFooter, { noServer: false });
    assert.ok(text.includes('Logs'), 'Expected Logs key hint');
    assert.ok(text.includes('Open'), 'Expected Open key hint');
  });

  it('should hide server keys when noServer is true', () => {
    const { text } = collectState(renderFooter, { noServer: true });
    assert.ok(!text.includes('Logs'), 'Should not show Logs when noServer');
    assert.ok(!text.includes('Open'), 'Should not show Open when noServer');
  });

  it('should show Reload key for static mode', () => {
    const { text } = collectState(renderFooter, { serverMode: 'static' });
    assert.ok(text.includes('Reload'), 'Expected Reload key hint for static mode');
  });

  it('should show Restart key for command mode', () => {
    const { text } = collectState(renderFooter, { serverMode: 'command' });
    assert.ok(text.includes('Restart'), 'Expected Restart key hint for command mode');
  });

  it('should not show Reload or Restart for monitor mode', () => {
    const { text } = collectState(renderFooter, { serverMode: 'monitor' });
    assert.ok(!text.includes('Reload'), 'Should not show Reload for monitor');
    assert.ok(!text.includes('Restart'), 'Should not show Restart for monitor');
  });

  it('should show visible branch count', () => {
    const { text } = collectState(renderFooter, { visibleBranchCount: 5 });
    assert.ok(text.includes('List:'), 'Expected List label');
    assert.ok(text.includes('5'), 'Expected visible branch count');
  });

  it('should show Casino key hint', () => {
    const { text } = collectState(renderFooter, { casinoModeEnabled: false });
    assert.ok(text.includes('Casino'), 'Expected Casino key hint');
  });
});

// ---------------------------------------------------------------------------
// renderFlash
// ---------------------------------------------------------------------------

describe('renderFlash', () => {
  it('should do nothing when flashMessage is null', () => {
    const output = [];
    const write = (s) => output.push(s);
    renderFlash(makeState({ flashMessage: null }), write);
    assert.strictEqual(output.length, 0, 'Expected no output for null flashMessage');
  });

  it('should show flash message text when present', () => {
    const { text } = collectState(renderFlash, {
      flashMessage: 'Branch updated: feature/login',
    });
    assert.ok(text.includes('Branch updated: feature/login'), 'Expected flash text');
  });

  it('should show NEW UPDATE label', () => {
    const { text } = collectState(renderFlash, {
      flashMessage: 'Something happened',
    });
    assert.ok(text.includes('NEW UPDATE'), 'Expected NEW UPDATE label');
  });

  it('should show dismiss instruction', () => {
    const { text } = collectState(renderFlash, {
      flashMessage: 'A flash',
    });
    assert.ok(text.includes('Press any key to dismiss'), 'Expected dismiss hint');
  });
});

// ---------------------------------------------------------------------------
// renderErrorToast
// ---------------------------------------------------------------------------

describe('renderErrorToast', () => {
  it('should do nothing when errorToast is null', () => {
    const output = [];
    const write = (s) => output.push(s);
    renderErrorToast(makeState({ errorToast: null }), write);
    assert.strictEqual(output.length, 0, 'Expected no output for null errorToast');
  });

  it('should show error title and message', () => {
    const { text } = collectState(renderErrorToast, {
      errorToast: {
        title: 'Checkout Failed',
        message: 'Could not switch to branch feature/broken',
      },
    });
    assert.ok(text.includes('Checkout Failed'), 'Expected error title');
    assert.ok(text.includes('Could not switch to branch'), 'Expected error message');
  });

  it('should use default title when none given', () => {
    const { text } = collectState(renderErrorToast, {
      errorToast: {
        message: 'Something went wrong',
      },
    });
    assert.ok(text.includes('Git Error'), 'Expected default title "Git Error"');
    assert.ok(text.includes('Something went wrong'), 'Expected error message');
  });

  it('should show hint when provided', () => {
    const { text } = collectState(renderErrorToast, {
      errorToast: {
        title: 'Error',
        message: 'Conflict detected',
        hint: 'Try git stash first',
      },
    });
    assert.ok(text.includes('Try git stash first'), 'Expected hint text');
  });

  it('should show dismiss instruction', () => {
    const { text } = collectState(renderErrorToast, {
      errorToast: {
        title: 'Error',
        message: 'Oops',
      },
    });
    assert.ok(text.includes('Press any key to dismiss'), 'Expected dismiss hint');
  });
});

// ---------------------------------------------------------------------------
// renderPreview
// ---------------------------------------------------------------------------

describe('renderPreview', () => {
  it('should do nothing when previewMode is false', () => {
    const output = [];
    const write = (s) => output.push(s);
    renderPreview(makeState({ previewMode: false }), write);
    assert.strictEqual(output.length, 0, 'Expected no output when preview off');
  });

  it('should do nothing when previewData is null', () => {
    const output = [];
    const write = (s) => output.push(s);
    renderPreview(makeState({ previewMode: true, previewData: null }), write);
    assert.strictEqual(output.length, 0, 'Expected no output when previewData null');
  });

  it('should show commits when available', () => {
    const { text } = collectState(renderPreview, {
      previewMode: true,
      previewData: {
        commits: [
          { hash: 'a1b2c3d', message: 'Fix login bug' },
          { hash: 'e4f5g6h', message: 'Add tests' },
        ],
        filesChanged: [],
      },
      branches: [
        { name: 'feature/login', date: new Date(), commit: 'a1b2c3d', subject: 'Fix' },
      ],
      selectedIndex: 0,
    });
    assert.ok(text.includes('Recent Commits'), 'Expected commits header');
    assert.ok(text.includes('a1b2c3d'), 'Expected first commit hash');
    assert.ok(text.includes('Fix login bug'), 'Expected first commit message');
    assert.ok(text.includes('e4f5g6h'), 'Expected second commit hash');
    assert.ok(text.includes('Add tests'), 'Expected second commit message');
  });

  it('should show "(no commits)" when commits array is empty', () => {
    const { text } = collectState(renderPreview, {
      previewMode: true,
      previewData: {
        commits: [],
        filesChanged: [],
      },
      branches: [
        { name: 'empty-branch', date: new Date(), commit: 'abc', subject: 'Empty' },
      ],
      selectedIndex: 0,
    });
    assert.ok(text.includes('(no commits)'), 'Expected no-commits message');
  });

  it('should show files changed', () => {
    const { text } = collectState(renderPreview, {
      previewMode: true,
      previewData: {
        commits: [{ hash: 'abc1234', message: 'Change stuff' }],
        filesChanged: ['src/index.js', 'src/utils.js'],
      },
      branches: [
        { name: 'feature/files', date: new Date(), commit: 'abc', subject: 'Files' },
      ],
      selectedIndex: 0,
    });
    assert.ok(text.includes('Files Changed vs HEAD'), 'Expected files header');
    assert.ok(text.includes('src/index.js'), 'Expected first file');
    assert.ok(text.includes('src/utils.js'), 'Expected second file');
  });

  it('should show "no changes" when filesChanged is empty', () => {
    const { text } = collectState(renderPreview, {
      previewMode: true,
      previewData: {
        commits: [{ hash: 'abc', message: 'Stuff' }],
        filesChanged: [],
      },
      branches: [
        { name: 'branch', date: new Date(), commit: 'abc', subject: 'S' },
      ],
      selectedIndex: 0,
    });
    assert.ok(text.includes('no changes or same as current'), 'Expected no-changes message');
  });

  it('should show "... and N more" when more than 5 files changed', () => {
    const files = [];
    for (let i = 0; i < 8; i++) {
      files.push(`src/file${i}.js`);
    }
    const { text } = collectState(renderPreview, {
      previewMode: true,
      previewData: {
        commits: [{ hash: 'abc', message: 'Many files' }],
        filesChanged: files,
      },
      branches: [
        { name: 'branch', date: new Date(), commit: 'abc', subject: 'S' },
      ],
      selectedIndex: 0,
    });
    assert.ok(text.includes('and 3 more'), 'Expected overflow count');
  });

  it('should show branch name in preview title', () => {
    const { text } = collectState(renderPreview, {
      previewMode: true,
      previewData: { commits: [], filesChanged: [] },
      branches: [
        { name: 'my-cool-branch', date: new Date(), commit: 'abc', subject: 'S' },
      ],
      selectedIndex: 0,
    });
    assert.ok(text.includes('Preview:'), 'Expected Preview label');
    assert.ok(text.includes('my-cool-branch'), 'Expected branch name in title');
  });

  it('should show close instruction', () => {
    const { text } = collectState(renderPreview, {
      previewMode: true,
      previewData: { commits: [], filesChanged: [] },
      branches: [
        { name: 'b', date: new Date(), commit: 'abc', subject: 'S' },
      ],
      selectedIndex: 0,
    });
    assert.ok(text.includes('[v] or [Esc] to close'), 'Expected close hint');
  });
});

// ---------------------------------------------------------------------------
// renderHistory
// ---------------------------------------------------------------------------

describe('renderHistory', () => {
  it('should show "No branch switches yet" when history is empty', () => {
    const { text } = collectState(renderHistory, { switchHistory: [] });
    assert.ok(text.includes('No branch switches yet'), 'Expected empty-history message');
  });

  it('should show switch entries', () => {
    const { text } = collectState(renderHistory, {
      switchHistory: [
        { from: 'main', to: 'feature/login' },
        { from: 'feature/login', to: 'dev' },
      ],
    });
    assert.ok(text.includes('main'), 'Expected from-branch in first entry');
    assert.ok(text.includes('feature/login'), 'Expected to-branch in first entry');
    assert.ok(text.includes('dev'), 'Expected to-branch in second entry');
  });

  it('should show Switch History title', () => {
    const { text } = collectState(renderHistory, { switchHistory: [] });
    assert.ok(text.includes('Switch History'), 'Expected Switch History title');
  });

  it('should show arrow indicator for most recent switch', () => {
    const { text } = collectState(renderHistory, {
      switchHistory: [
        { from: 'main', to: 'dev' },
      ],
    });
    assert.ok(text.includes('\u2192'), 'Expected arrow indicator');
  });

  it('should show close instructions', () => {
    const { text } = collectState(renderHistory, { switchHistory: [] });
    assert.ok(text.includes('Undo last'), 'Expected undo hint');
    assert.ok(text.includes('Close'), 'Expected close hint');
  });
});

// ---------------------------------------------------------------------------
// renderLogView
// ---------------------------------------------------------------------------

describe('renderLogView', () => {
  it('should do nothing when logViewMode is false', () => {
    const output = [];
    const write = (s) => output.push(s);
    renderLogView(makeState({ logViewMode: false }), write);
    assert.strictEqual(output.length, 0, 'Expected no output when logViewMode off');
  });

  it('should show tab headers', () => {
    const { text } = collectState(renderLogView, { logViewMode: true });
    assert.ok(text.includes('1:Activity'), 'Expected Activity tab');
    assert.ok(text.includes('2:Server'), 'Expected Server tab');
  });

  it('should show "No server output yet..." when empty and on server tab', () => {
    const { text } = collectState(renderLogView, {
      logViewMode: true,
      logViewTab: 'server',
      serverLogBuffer: [],
    });
    assert.ok(text.includes('No server output yet...'), 'Expected empty server log message');
  });

  it('should show "No activity yet..." when empty and on activity tab', () => {
    const { text } = collectState(renderLogView, {
      logViewMode: true,
      logViewTab: 'activity',
      activityLog: [],
    });
    assert.ok(text.includes('No activity yet...'), 'Expected empty activity log message');
  });

  it('should show server status indicator for command mode on server tab', () => {
    const { text } = collectState(renderLogView, {
      logViewMode: true,
      logViewTab: 'server',
      serverMode: 'command',
      serverRunning: true,
    });
    assert.ok(text.includes('RUNNING'), 'Expected RUNNING status');
  });

  it('should show CRASHED status for crashed server', () => {
    const { text } = collectState(renderLogView, {
      logViewMode: true,
      logViewTab: 'server',
      serverMode: 'command',
      serverRunning: false,
      serverCrashed: true,
    });
    assert.ok(text.includes('CRASHED'), 'Expected CRASHED status');
  });

  it('should show STOPPED status for stopped server', () => {
    const { text } = collectState(renderLogView, {
      logViewMode: true,
      logViewTab: 'server',
      serverMode: 'command',
      serverRunning: false,
      serverCrashed: false,
    });
    assert.ok(text.includes('STOPPED'), 'Expected STOPPED status');
  });

  it('should show STATIC indicator for static mode on server tab', () => {
    const { text } = collectState(renderLogView, {
      logViewMode: true,
      logViewTab: 'server',
      serverMode: 'static',
    });
    assert.ok(text.includes('STATIC'), 'Expected STATIC indicator');
  });

  it('should show server log entries', () => {
    const { text } = collectState(renderLogView, {
      logViewMode: true,
      logViewTab: 'server',
      serverLogBuffer: [
        { line: 'Server started on port 3000', isError: false },
        { line: 'GET /index.html 200', isError: false },
      ],
    });
    assert.ok(text.includes('Server started on port 3000'), 'Expected server log line');
    assert.ok(text.includes('GET /index.html 200'), 'Expected second log line');
  });

  it('should show activity log entries on activity tab', () => {
    const { text } = collectState(renderLogView, {
      logViewMode: true,
      logViewTab: 'activity',
      activityLog: [
        { timestamp: '10:00:00', color: 'green', icon: '\u2713', message: 'Fetched successfully' },
      ],
    });
    assert.ok(text.includes('[10:00:00]'), 'Expected timestamp');
    assert.ok(text.includes('Fetched successfully'), 'Expected activity message');
  });

  it('should show close instructions', () => {
    const { text } = collectState(renderLogView, { logViewMode: true });
    assert.ok(text.includes('Switch Tab'), 'Expected tab switch hint');
    assert.ok(text.includes('Scroll'), 'Expected scroll hint');
    assert.ok(text.includes('Close'), 'Expected close hint');
  });

  it('should show Restart hint for command mode', () => {
    const { text } = collectState(renderLogView, {
      logViewMode: true,
      serverMode: 'command',
    });
    assert.ok(text.includes('Restart'), 'Expected Restart hint in command mode');
  });

  it('should not show Restart hint for static mode', () => {
    const { text } = collectState(renderLogView, {
      logViewMode: true,
      serverMode: 'static',
    });
    assert.ok(!text.includes('Restart'), 'Should not show Restart in static mode');
  });
});

// ---------------------------------------------------------------------------
// renderInfo
// ---------------------------------------------------------------------------

describe('renderInfo', () => {
  it('should show server URL and port when server is active', () => {
    const { text } = collectState(renderInfo, {
      noServer: false,
      port: 3000,
    });
    assert.ok(text.includes('http://localhost:3000'), 'Expected server URL');
    assert.ok(text.includes('3000'), 'Expected port number');
  });

  it('should show Dev Server section when not noServer', () => {
    const { text } = collectState(renderInfo, { noServer: false });
    assert.ok(text.includes('Dev Server'), 'Expected Dev Server heading');
  });

  it('should show connected browsers count', () => {
    const { text } = collectState(renderInfo, {
      noServer: false,
      clientCount: 3,
    });
    assert.ok(text.includes('Connected browsers'), 'Expected connected browsers label');
    assert.ok(text.includes('3'), 'Expected client count');
  });

  it('should show polling interval', () => {
    const { text } = collectState(renderInfo, {
      adaptivePollInterval: 10000,
    });
    assert.ok(text.includes('Interval'), 'Expected Interval label');
    assert.ok(text.includes('10s'), 'Expected interval in seconds');
  });

  it('should show polling status as Online when not offline', () => {
    const { text } = collectState(renderInfo, { isOffline: false });
    assert.ok(text.includes('Status'), 'Expected Status label');
    assert.ok(text.includes('Online'), 'Expected Online status');
  });

  it('should show polling status as Offline when offline', () => {
    const { text } = collectState(renderInfo, { isOffline: true });
    assert.ok(text.includes('Offline'), 'Expected Offline status');
  });

  it('should show "No-Server" mode label when noServer is true', () => {
    const { text } = collectState(renderInfo, { noServer: true });
    assert.ok(text.includes('No-Server'), 'Expected No-Server mode label');
  });

  it('should show Status Info title when noServer', () => {
    const { text } = collectState(renderInfo, { noServer: true });
    assert.ok(text.includes('Status Info'), 'Expected Status Info title');
  });

  it('should show Server Info title when server is active', () => {
    const { text } = collectState(renderInfo, { noServer: false });
    assert.ok(text.includes('Server Info'), 'Expected Server Info title');
  });

  it('should not show Dev Server section when noServer', () => {
    const { text } = collectState(renderInfo, { noServer: true });
    assert.ok(!text.includes('Dev Server'), 'Should not show Dev Server when noServer');
  });

  it('should show Git Polling section always', () => {
    const { text } = collectState(renderInfo, { noServer: true });
    assert.ok(text.includes('Git Polling'), 'Expected Git Polling heading');
  });

  it('should show close instruction', () => {
    const { text } = collectState(renderInfo);
    assert.ok(text.includes('[i] or [Esc] to close'), 'Expected close hint');
  });
});

// ---------------------------------------------------------------------------
// renderActionModal
// ---------------------------------------------------------------------------

describe('renderActionModal', () => {
  it('should do nothing when actionMode is false', () => {
    const output = [];
    const write = (s) => output.push(s);
    renderActionModal(makeState({ actionMode: false }), write);
    assert.strictEqual(output.length, 0, 'Expected no output when actionMode off');
  });

  it('should do nothing when actionData is null', () => {
    const output = [];
    const write = (s) => output.push(s);
    renderActionModal(makeState({ actionMode: true, actionData: null }), write);
    assert.strictEqual(output.length, 0, 'Expected no output when actionData null');
  });

  function makeActionData(overrides = {}) {
    return {
      branch: { name: 'feature/test' },
      sessionUrl: null,
      prInfo: null,
      hasGh: true,
      hasGlab: false,
      ghAuthed: true,
      glabAuthed: false,
      webUrl: 'https://github.com/user/repo',
      isClaudeBranch: false,
      platform: 'github',
      prLoaded: true,
      ...overrides,
    };
  }

  it('should show branch name in modal', () => {
    const { text } = collectState(renderActionModal, {
      actionMode: true,
      actionData: makeActionData({ branch: { name: 'feature/awesome' } }),
    });
    assert.ok(text.includes('feature/awesome'), 'Expected branch name');
  });

  it('should show Branch Actions title', () => {
    const { text } = collectState(renderActionModal, {
      actionMode: true,
      actionData: makeActionData(),
    });
    assert.ok(text.includes('Branch Actions'), 'Expected Branch Actions title');
  });

  it('should show Claude badge for Claude branches', () => {
    const { text } = collectState(renderActionModal, {
      actionMode: true,
      actionData: makeActionData({
        isClaudeBranch: true,
        branch: { name: 'claude/improve-tests' },
      }),
    });
    assert.ok(text.includes('[Claude]'), 'Expected [Claude] badge');
  });

  it('should not show Claude badge for non-Claude branches', () => {
    const { text } = collectState(renderActionModal, {
      actionMode: true,
      actionData: makeActionData({ isClaudeBranch: false }),
    });
    assert.ok(!text.includes('[Claude]'), 'Should not show [Claude] badge');
  });

  it('should show action items', () => {
    const { text } = collectState(renderActionModal, {
      actionMode: true,
      actionData: makeActionData(),
    });
    assert.ok(text.includes('Open branch on GitHub'), 'Expected open-on-web action');
    assert.ok(text.includes('Open Claude Code session'), 'Expected Claude session action');
    assert.ok(text.includes('Create PR'), 'Expected create PR action');
    assert.ok(text.includes('Check CI status'), 'Expected CI action');
  });

  it('should show View PR action when prInfo is present', () => {
    const { text } = collectState(renderActionModal, {
      actionMode: true,
      actionData: makeActionData({
        prInfo: { number: 42, title: 'Fix things', state: 'OPEN', approved: false, checksPass: false, checksFail: false },
      }),
    });
    assert.ok(text.includes('View PR #42'), 'Expected View PR action');
  });

  it('should show loading indicator when actionLoading', () => {
    const { text } = collectState(renderActionModal, {
      actionMode: true,
      actionLoading: true,
      actionData: makeActionData({
        isClaudeBranch: true,
        prLoaded: false,
      }),
    });
    assert.ok(text.includes('loading...'), 'Expected loading indicator');
  });

  it('should show Approve and Merge actions for open PRs', () => {
    const { text } = collectState(renderActionModal, {
      actionMode: true,
      actionData: makeActionData({
        prInfo: { number: 10, title: 'A PR', state: 'OPEN', approved: false, checksPass: true, checksFail: false },
      }),
    });
    assert.ok(text.includes('Approve PR'), 'Expected Approve action');
    assert.ok(text.includes('Merge PR'), 'Expected Merge action');
  });

  it('should show reason when gh CLI is not installed', () => {
    const { text } = collectState(renderActionModal, {
      actionMode: true,
      actionData: makeActionData({
        hasGh: false,
        ghAuthed: false,
      }),
    });
    assert.ok(text.includes('Requires gh CLI'), 'Expected gh CLI reason');
  });

  it('should show MR labels for GitLab platform', () => {
    const { text } = collectState(renderActionModal, {
      actionMode: true,
      actionData: makeActionData({
        platform: 'gitlab',
        hasGh: false,
        hasGlab: true,
        ghAuthed: false,
        glabAuthed: true,
      }),
    });
    assert.ok(text.includes('GitLab'), 'Expected GitLab label');
    assert.ok(text.includes('Create MR'), 'Expected MR label instead of PR');
  });

  it('should show close instruction', () => {
    const { text } = collectState(renderActionModal, {
      actionMode: true,
      actionData: makeActionData(),
    });
    assert.ok(text.includes('[Esc] to close'), 'Expected close hint');
  });

  it('should show PR status info for existing PR', () => {
    const { text } = collectState(renderActionModal, {
      actionMode: true,
      actionData: makeActionData({
        prInfo: {
          number: 55,
          title: 'Great feature',
          state: 'OPEN',
          approved: true,
          checksPass: true,
          checksFail: false,
        },
      }),
    });
    assert.ok(text.includes('PR #55'), 'Expected PR number in status');
    assert.ok(text.includes('Great feature'), 'Expected PR title in status');
    assert.ok(text.includes('approved'), 'Expected approved badge');
    assert.ok(text.includes('checks pass'), 'Expected checks pass badge');
  });

  it('should show merged badge for merged PRs', () => {
    const { text } = collectState(renderActionModal, {
      actionMode: true,
      actionData: makeActionData({
        prInfo: {
          number: 99,
          title: 'Done PR',
          state: 'MERGED',
          approved: false,
          checksPass: false,
          checksFail: false,
        },
      }),
    });
    assert.ok(text.includes('merged'), 'Expected merged badge');
  });

  it('should show session URL info for Claude branch with session', () => {
    const { text } = collectState(renderActionModal, {
      actionMode: true,
      actionData: makeActionData({
        isClaudeBranch: true,
        sessionUrl: 'https://claude.ai/code/session_abc123',
        branch: { name: 'claude/fix-bug' },
      }),
    });
    assert.ok(text.includes('Session:'), 'Expected Session label');
    assert.ok(text.includes('session_abc123'), 'Expected session ID');
  });

  it('should show no-PR message when cliReady but no PR found', () => {
    const { text } = collectState(renderActionModal, {
      actionMode: true,
      actionData: makeActionData({
        hasGh: true,
        ghAuthed: true,
        prInfo: null,
        prLoaded: true,
      }),
    });
    assert.ok(text.includes('No PR for this branch'), 'Expected no-PR message');
  });
});
