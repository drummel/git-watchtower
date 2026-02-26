const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  getDisplayBranches,
  moveUp,
  moveDown,
  enterSearchMode,
  handleSearchInput,
  togglePreview,
  toggleHistory,
  toggleInfo,
  toggleLogView,
  closeActionModal,
  openCleanupConfirm,
  closeCleanupConfirm,
  switchLogTab,
  scrollLog,
  toggleSound,
  setVisibleBranchCount,
  increaseVisibleBranches,
  decreaseVisibleBranches,
  dismissFlash,
  dismissErrorToast,
  handleEscape,
  getSelectedBranch,
} = require('../../../src/ui/actions');
const { KEYS } = require('../../../src/ui/keybindings');

function makeState(overrides = {}) {
  return {
    branches: [
      { name: 'main', commit: 'abc123' },
      { name: 'feature-1', commit: 'def456' },
      { name: 'feature-2', commit: 'ghi789' },
    ],
    selectedIndex: 0,
    selectedBranchName: 'main',
    currentBranch: 'main',
    filteredBranches: null,
    searchMode: false,
    searchQuery: '',
    previewMode: false,
    previewData: { commits: [], filesChanged: [] },
    historyMode: false,
    infoMode: false,
    logViewMode: false,
    logViewTab: 'server',
    logScrollOffset: 0,
    actionMode: false,
    actionData: null,
    actionLoading: false,
    flashMessage: null,
    errorToast: null,
    visibleBranchCount: 7,
    soundEnabled: true,
    casinoModeEnabled: false,
    serverMode: 'static',
    noServer: false,
    serverLogBuffer: [],
    activityLog: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getDisplayBranches
// ---------------------------------------------------------------------------

describe('getDisplayBranches', () => {
  it('should return branches when filteredBranches is null', () => {
    const state = makeState();
    const result = getDisplayBranches(state);
    assert.equal(result, state.branches);
    assert.equal(result.length, 3);
  });

  it('should return filteredBranches when not null', () => {
    const filtered = [{ name: 'feature-1', commit: 'def456' }];
    const state = makeState({ filteredBranches: filtered });
    const result = getDisplayBranches(state);
    assert.equal(result, filtered);
    assert.equal(result.length, 1);
  });
});

// ---------------------------------------------------------------------------
// moveUp
// ---------------------------------------------------------------------------

describe('moveUp', () => {
  it('should return null when selectedIndex is 0', () => {
    const state = makeState({ selectedIndex: 0 });
    assert.equal(moveUp(state), null);
  });

  it('should return decremented index and updated selectedBranchName', () => {
    const state = makeState({ selectedIndex: 2, selectedBranchName: 'feature-2' });
    const result = moveUp(state);
    assert.deepEqual(result, {
      selectedIndex: 1,
      selectedBranchName: 'feature-1',
    });
  });

  it('should move from index 1 to index 0', () => {
    const state = makeState({ selectedIndex: 1, selectedBranchName: 'feature-1' });
    const result = moveUp(state);
    assert.deepEqual(result, {
      selectedIndex: 0,
      selectedBranchName: 'main',
    });
  });

  it('should work with filteredBranches', () => {
    const filtered = [
      { name: 'feature-1', commit: 'def456' },
      { name: 'feature-2', commit: 'ghi789' },
    ];
    const state = makeState({
      filteredBranches: filtered,
      selectedIndex: 1,
      selectedBranchName: 'feature-2',
    });
    const result = moveUp(state);
    assert.deepEqual(result, {
      selectedIndex: 0,
      selectedBranchName: 'feature-1',
    });
  });
});

// ---------------------------------------------------------------------------
// moveDown
// ---------------------------------------------------------------------------

describe('moveDown', () => {
  it('should return null when at last branch', () => {
    const state = makeState({ selectedIndex: 2 });
    assert.equal(moveDown(state), null);
  });

  it('should return incremented index and updated selectedBranchName', () => {
    const state = makeState({ selectedIndex: 0, selectedBranchName: 'main' });
    const result = moveDown(state);
    assert.deepEqual(result, {
      selectedIndex: 1,
      selectedBranchName: 'feature-1',
    });
  });

  it('should move from index 1 to index 2', () => {
    const state = makeState({ selectedIndex: 1, selectedBranchName: 'feature-1' });
    const result = moveDown(state);
    assert.deepEqual(result, {
      selectedIndex: 2,
      selectedBranchName: 'feature-2',
    });
  });

  it('should work with filteredBranches', () => {
    const filtered = [
      { name: 'feature-1', commit: 'def456' },
      { name: 'feature-2', commit: 'ghi789' },
    ];
    const state = makeState({
      filteredBranches: filtered,
      selectedIndex: 0,
      selectedBranchName: 'feature-1',
    });
    const result = moveDown(state);
    assert.deepEqual(result, {
      selectedIndex: 1,
      selectedBranchName: 'feature-2',
    });
  });

  it('should return null when at last filteredBranch', () => {
    const filtered = [{ name: 'feature-1', commit: 'def456' }];
    const state = makeState({
      filteredBranches: filtered,
      selectedIndex: 0,
    });
    assert.equal(moveDown(state), null);
  });
});

// ---------------------------------------------------------------------------
// enterSearchMode
// ---------------------------------------------------------------------------

describe('enterSearchMode', () => {
  it('should return searchMode true, empty query, and selectedIndex 0', () => {
    const state = makeState({ selectedIndex: 2, searchQuery: 'old' });
    const result = enterSearchMode(state);
    assert.deepEqual(result, {
      searchMode: true,
      searchQuery: '',
      selectedIndex: 0,
    });
  });

  it('should always reset selectedIndex to 0', () => {
    const state = makeState({ selectedIndex: 5 });
    const result = enterSearchMode(state);
    assert.equal(result.selectedIndex, 0);
  });
});

// ---------------------------------------------------------------------------
// handleSearchInput
// ---------------------------------------------------------------------------

describe('handleSearchInput', () => {
  it('should exit search and clear query on Escape', () => {
    const state = makeState({ searchMode: true, searchQuery: 'feat' });
    const result = handleSearchInput(state, KEYS.ESCAPE);
    assert.deepEqual(result, {
      searchMode: false,
      searchQuery: '',
      filteredBranches: null,
    });
  });

  it('should exit search but keep filter on Enter (carriage return)', () => {
    const state = makeState({ searchMode: true, searchQuery: 'feat' });
    const result = handleSearchInput(state, KEYS.ENTER);
    assert.deepEqual(result, { searchMode: false });
    assert.equal(result.searchQuery, undefined);
    assert.equal(result.filteredBranches, undefined);
  });

  it('should exit search but keep filter on Enter (newline)', () => {
    const state = makeState({ searchMode: true, searchQuery: 'feat' });
    const result = handleSearchInput(state, KEYS.NEWLINE);
    assert.deepEqual(result, { searchMode: false });
  });

  it('should remove last character on Backspace and re-filter', () => {
    const state = makeState({ searchMode: true, searchQuery: 'fea' });
    const result = handleSearchInput(state, KEYS.BACKSPACE);
    assert.equal(result.searchQuery, 'fe');
    assert.ok(Array.isArray(result.filteredBranches));
    assert.ok(result.filteredBranches.every(b => b.name.toLowerCase().includes('fe')));
  });

  it('should handle alt backspace key', () => {
    const state = makeState({ searchMode: true, searchQuery: 'ab' });
    const result = handleSearchInput(state, KEYS.BACKSPACE_ALT);
    assert.equal(result.searchQuery, 'a');
  });

  it('should return null filteredBranches when backspace empties the query', () => {
    const state = makeState({ searchMode: true, searchQuery: 'a' });
    const result = handleSearchInput(state, KEYS.BACKSPACE);
    assert.equal(result.searchQuery, '');
    assert.equal(result.filteredBranches, null);
  });

  it('should handle backspace on already empty query', () => {
    const state = makeState({ searchMode: true, searchQuery: '' });
    const result = handleSearchInput(state, KEYS.BACKSPACE);
    assert.equal(result.searchQuery, '');
    assert.equal(result.filteredBranches, null);
  });

  it('should append printable character to query and filter', () => {
    const state = makeState({ searchMode: true, searchQuery: '' });
    const result = handleSearchInput(state, 'f');
    assert.equal(result.searchQuery, 'f');
    assert.ok(Array.isArray(result.filteredBranches));
    assert.ok(result.filteredBranches.every(b => b.name.toLowerCase().includes('f')));
  });

  it('should build up multi-character queries', () => {
    const state = makeState({ searchMode: true, searchQuery: 'feat' });
    const result = handleSearchInput(state, 'u');
    assert.equal(result.searchQuery, 'featu');
    assert.ok(Array.isArray(result.filteredBranches));
  });

  it('should return null for unhandled keys', () => {
    const state = makeState({ searchMode: true, searchQuery: '' });
    // Arrow keys are non-printable, multi-char sequences
    assert.equal(handleSearchInput(state, KEYS.UP), null);
    assert.equal(handleSearchInput(state, KEYS.DOWN), null);
    // Ctrl+C is a control character
    assert.equal(handleSearchInput(state, KEYS.CTRL_C), null);
  });

  it('should clamp selectedIndex when filter shrinks results', () => {
    const state = makeState({
      searchMode: true,
      searchQuery: 'feature-',
      selectedIndex: 1,
      // Currently showing feature-1 and feature-2, user is on index 1
    });
    // Type '1' to narrow to only feature-1 (single result)
    const result = handleSearchInput(state, '1');
    assert.equal(result.searchQuery, 'feature-1');
    assert.equal(result.filteredBranches.length, 1);
    assert.equal(result.selectedIndex, 0);
  });

  it('should not clamp selectedIndex when filter has enough results', () => {
    const state = makeState({
      searchMode: true,
      searchQuery: '',
      selectedIndex: 1,
    });
    const result = handleSearchInput(state, 'f');
    // 'f' matches feature-1 and feature-2 (2 results), index 1 is valid
    assert.equal(result.selectedIndex, 1);
  });

  it('should handle filter that matches nothing', () => {
    const state = makeState({
      searchMode: true,
      searchQuery: 'xyz',
      selectedIndex: 0,
    });
    const result = handleSearchInput(state, 'q');
    assert.equal(result.searchQuery, 'xyzq');
    assert.ok(Array.isArray(result.filteredBranches));
    assert.equal(result.filteredBranches.length, 0);
    assert.equal(result.selectedIndex, 0);
  });
});

// ---------------------------------------------------------------------------
// togglePreview
// ---------------------------------------------------------------------------

describe('togglePreview', () => {
  it('should return previewMode false when already in preview', () => {
    const state = makeState({ previewMode: true });
    const result = togglePreview(state);
    assert.deepEqual(result, { previewMode: false, previewData: null });
  });

  it('should return previewMode true when not in preview', () => {
    const state = makeState({ previewMode: false });
    const result = togglePreview(state);
    assert.deepEqual(result, { previewMode: true });
  });
});

// ---------------------------------------------------------------------------
// toggleHistory
// ---------------------------------------------------------------------------

describe('toggleHistory', () => {
  it('should toggle historyMode from false to true', () => {
    const state = makeState({ historyMode: false });
    const result = toggleHistory(state);
    assert.deepEqual(result, { historyMode: true });
  });

  it('should toggle historyMode from true to false', () => {
    const state = makeState({ historyMode: true });
    const result = toggleHistory(state);
    assert.deepEqual(result, { historyMode: false });
  });
});

// ---------------------------------------------------------------------------
// toggleInfo
// ---------------------------------------------------------------------------

describe('toggleInfo', () => {
  it('should toggle infoMode from false to true', () => {
    const state = makeState({ infoMode: false });
    const result = toggleInfo(state);
    assert.deepEqual(result, { infoMode: true });
  });

  it('should toggle infoMode from true to false', () => {
    const state = makeState({ infoMode: true });
    const result = toggleInfo(state);
    assert.deepEqual(result, { infoMode: false });
  });
});

// ---------------------------------------------------------------------------
// toggleLogView
// ---------------------------------------------------------------------------

describe('toggleLogView', () => {
  it('should return null when noServer is true', () => {
    const state = makeState({ noServer: true });
    assert.equal(toggleLogView(state), null);
  });

  it('should open log view with logScrollOffset 0', () => {
    const state = makeState({ logViewMode: false });
    const result = toggleLogView(state);
    assert.deepEqual(result, { logViewMode: true, logScrollOffset: 0 });
  });

  it('should close log view and reset scroll offset', () => {
    const state = makeState({ logViewMode: true, logScrollOffset: 5 });
    const result = toggleLogView(state);
    assert.deepEqual(result, { logViewMode: false, logScrollOffset: 0 });
  });
});

// ---------------------------------------------------------------------------
// closeActionModal
// ---------------------------------------------------------------------------

describe('closeActionModal', () => {
  it('should return actionMode false, actionData null, actionLoading false', () => {
    const state = makeState({
      actionMode: true,
      actionData: { type: 'delete' },
      actionLoading: true,
    });
    const result = closeActionModal(state);
    assert.deepEqual(result, {
      actionMode: false,
      actionData: null,
      actionLoading: false,
    });
  });

  it('should return same shape even when already closed', () => {
    const state = makeState();
    const result = closeActionModal(state);
    assert.deepEqual(result, {
      actionMode: false,
      actionData: null,
      actionLoading: false,
    });
  });
});

// ---------------------------------------------------------------------------
// switchLogTab
// ---------------------------------------------------------------------------

describe('switchLogTab', () => {
  it('should switch tab and reset scroll offset', () => {
    const state = makeState({ logViewTab: 'server', logScrollOffset: 5 });
    const result = switchLogTab(state, 'activity');
    assert.deepEqual(result, { logViewTab: 'activity', logScrollOffset: 0 });
  });

  it('should switch to server tab', () => {
    const state = makeState({ logViewTab: 'activity', logScrollOffset: 3 });
    const result = switchLogTab(state, 'server');
    assert.deepEqual(result, { logViewTab: 'server', logScrollOffset: 0 });
  });
});

// ---------------------------------------------------------------------------
// scrollLog
// ---------------------------------------------------------------------------

describe('scrollLog', () => {
  it('should scroll up by incrementing offset clamped to max', () => {
    const logLines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
    const state = makeState({
      logViewTab: 'server',
      serverLogBuffer: logLines,
      logScrollOffset: 0,
    });
    const result = scrollLog(state, 'up');
    assert.equal(result.logScrollOffset, 1);
  });

  it('should clamp scroll up to max offset', () => {
    const logLines = Array.from({ length: 15 }, (_, i) => `line ${i}`);
    // maxScroll = max(0, 15 - 10) = 5
    const state = makeState({
      logViewTab: 'server',
      serverLogBuffer: logLines,
      logScrollOffset: 5,
    });
    const result = scrollLog(state, 'up');
    assert.equal(result.logScrollOffset, 5);
  });

  it('should scroll down by decrementing offset clamped to 0', () => {
    const logLines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
    const state = makeState({
      logViewTab: 'server',
      serverLogBuffer: logLines,
      logScrollOffset: 3,
    });
    const result = scrollLog(state, 'down');
    assert.equal(result.logScrollOffset, 2);
  });

  it('should clamp scroll down to 0', () => {
    const logLines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
    const state = makeState({
      logViewTab: 'server',
      serverLogBuffer: logLines,
      logScrollOffset: 0,
    });
    const result = scrollLog(state, 'down');
    assert.equal(result.logScrollOffset, 0);
  });

  it('should handle empty server log data', () => {
    const state = makeState({
      logViewTab: 'server',
      serverLogBuffer: [],
      logScrollOffset: 0,
    });
    const resultUp = scrollLog(state, 'up');
    assert.equal(resultUp.logScrollOffset, 0);
    const resultDown = scrollLog(state, 'down');
    assert.equal(resultDown.logScrollOffset, 0);
  });

  it('should handle empty activity log data', () => {
    const state = makeState({
      logViewTab: 'activity',
      activityLog: [],
      logScrollOffset: 0,
    });
    const resultUp = scrollLog(state, 'up');
    assert.equal(resultUp.logScrollOffset, 0);
  });

  it('should use activityLog when logViewTab is activity', () => {
    const activityLines = Array.from({ length: 20 }, (_, i) => `activity ${i}`);
    const state = makeState({
      logViewTab: 'activity',
      activityLog: activityLines,
      serverLogBuffer: [],
      logScrollOffset: 0,
    });
    const result = scrollLog(state, 'up');
    // maxScroll = max(0, 20 - 10) = 10, so offset should be 1
    assert.equal(result.logScrollOffset, 1);
  });

  it('should handle log data with fewer than 10 lines', () => {
    const logLines = Array.from({ length: 5 }, (_, i) => `line ${i}`);
    // maxScroll = max(0, 5 - 10) = 0
    const state = makeState({
      logViewTab: 'server',
      serverLogBuffer: logLines,
      logScrollOffset: 0,
    });
    const result = scrollLog(state, 'up');
    assert.equal(result.logScrollOffset, 0);
  });
});

// ---------------------------------------------------------------------------
// toggleSound
// ---------------------------------------------------------------------------

describe('toggleSound', () => {
  it('should return toggled soundEnabled from true to false', () => {
    const state = makeState({ soundEnabled: true });
    const result = toggleSound(state);
    assert.deepEqual(result, { soundEnabled: false });
  });

  it('should return toggled soundEnabled from false to true', () => {
    const state = makeState({ soundEnabled: false });
    const result = toggleSound(state);
    assert.deepEqual(result, { soundEnabled: true });
  });
});

// ---------------------------------------------------------------------------
// setVisibleBranchCount
// ---------------------------------------------------------------------------

describe('setVisibleBranchCount', () => {
  it('should set the count to the provided value', () => {
    const state = makeState({ visibleBranchCount: 7 });
    const result = setVisibleBranchCount(state, 5);
    assert.deepEqual(result, { visibleBranchCount: 5 });
  });

  it('should set the count to 1', () => {
    const state = makeState({ visibleBranchCount: 7 });
    const result = setVisibleBranchCount(state, 1);
    assert.deepEqual(result, { visibleBranchCount: 1 });
  });
});

// ---------------------------------------------------------------------------
// increaseVisibleBranches
// ---------------------------------------------------------------------------

describe('increaseVisibleBranches', () => {
  it('should return null when already at max', () => {
    const state = makeState({ visibleBranchCount: 10 });
    assert.equal(increaseVisibleBranches(state, 10), null);
  });

  it('should return incremented count when below max', () => {
    const state = makeState({ visibleBranchCount: 7 });
    const result = increaseVisibleBranches(state, 10);
    assert.deepEqual(result, { visibleBranchCount: 8 });
  });

  it('should allow incrementing to exactly the max', () => {
    const state = makeState({ visibleBranchCount: 9 });
    const result = increaseVisibleBranches(state, 10);
    assert.deepEqual(result, { visibleBranchCount: 10 });
  });

  it('should return null when count exceeds max', () => {
    const state = makeState({ visibleBranchCount: 15 });
    assert.equal(increaseVisibleBranches(state, 10), null);
  });
});

// ---------------------------------------------------------------------------
// decreaseVisibleBranches
// ---------------------------------------------------------------------------

describe('decreaseVisibleBranches', () => {
  it('should return null when already at 1', () => {
    const state = makeState({ visibleBranchCount: 1 });
    assert.equal(decreaseVisibleBranches(state), null);
  });

  it('should return decremented count when above 1', () => {
    const state = makeState({ visibleBranchCount: 7 });
    const result = decreaseVisibleBranches(state);
    assert.deepEqual(result, { visibleBranchCount: 6 });
  });

  it('should allow decrementing to exactly 1', () => {
    const state = makeState({ visibleBranchCount: 2 });
    const result = decreaseVisibleBranches(state);
    assert.deepEqual(result, { visibleBranchCount: 1 });
  });
});

// ---------------------------------------------------------------------------
// dismissFlash
// ---------------------------------------------------------------------------

describe('dismissFlash', () => {
  it('should return null when no flash message exists', () => {
    const state = makeState({ flashMessage: null });
    assert.equal(dismissFlash(state), null);
  });

  it('should return flashMessage null when flash exists', () => {
    const state = makeState({ flashMessage: 'Branch switched!' });
    const result = dismissFlash(state);
    assert.deepEqual(result, { flashMessage: null });
  });

  it('should handle object flash messages', () => {
    const state = makeState({ flashMessage: { text: 'Done', type: 'success' } });
    const result = dismissFlash(state);
    assert.deepEqual(result, { flashMessage: null });
  });
});

// ---------------------------------------------------------------------------
// dismissErrorToast
// ---------------------------------------------------------------------------

describe('dismissErrorToast', () => {
  it('should return null when no error toast exists', () => {
    const state = makeState({ errorToast: null });
    assert.equal(dismissErrorToast(state), null);
  });

  it('should return errorToast null when toast exists', () => {
    const state = makeState({ errorToast: 'Something went wrong' });
    const result = dismissErrorToast(state);
    assert.deepEqual(result, { errorToast: null });
  });

  it('should handle object error toasts', () => {
    const state = makeState({ errorToast: { message: 'Error', code: 500 } });
    const result = dismissErrorToast(state);
    assert.deepEqual(result, { errorToast: null });
  });
});

// ---------------------------------------------------------------------------
// handleEscape
// ---------------------------------------------------------------------------

describe('handleEscape', () => {
  it('should clear search when searchQuery exists', () => {
    const state = makeState({ searchQuery: 'feat', filteredBranches: null });
    const result = handleEscape(state);
    assert.deepEqual(result, { searchQuery: '', filteredBranches: null });
  });

  it('should clear search when filteredBranches exists', () => {
    const filtered = [{ name: 'feature-1' }];
    const state = makeState({ searchQuery: '', filteredBranches: filtered });
    const result = handleEscape(state);
    assert.deepEqual(result, { searchQuery: '', filteredBranches: null });
  });

  it('should clear search when both searchQuery and filteredBranches exist', () => {
    const filtered = [{ name: 'feature-1' }];
    const state = makeState({ searchQuery: 'feat', filteredBranches: filtered });
    const result = handleEscape(state);
    assert.deepEqual(result, { searchQuery: '', filteredBranches: null });
  });

  it('should return _quit true when nothing to clear', () => {
    const state = makeState({ searchQuery: '', filteredBranches: null });
    const result = handleEscape(state);
    assert.deepEqual(result, { _quit: true });
  });
});

// ---------------------------------------------------------------------------
// getSelectedBranch
// ---------------------------------------------------------------------------

describe('getSelectedBranch', () => {
  it('should return branch at selectedIndex', () => {
    const state = makeState({ selectedIndex: 1 });
    const result = getSelectedBranch(state);
    assert.deepEqual(result, { name: 'feature-1', commit: 'def456' });
  });

  it('should return first branch when selectedIndex is 0', () => {
    const state = makeState({ selectedIndex: 0 });
    const result = getSelectedBranch(state);
    assert.deepEqual(result, { name: 'main', commit: 'abc123' });
  });

  it('should return null when branches is empty', () => {
    const state = makeState({ branches: [], selectedIndex: 0 });
    const result = getSelectedBranch(state);
    assert.equal(result, null);
  });

  it('should work with filteredBranches', () => {
    const filtered = [
      { name: 'feature-1', commit: 'def456' },
      { name: 'feature-2', commit: 'ghi789' },
    ];
    const state = makeState({ filteredBranches: filtered, selectedIndex: 1 });
    const result = getSelectedBranch(state);
    assert.deepEqual(result, { name: 'feature-2', commit: 'ghi789' });
  });

  it('should return null when selectedIndex is out of bounds', () => {
    const state = makeState({ selectedIndex: 10 });
    const result = getSelectedBranch(state);
    assert.equal(result, null);
  });

  it('should return null when filteredBranches is empty', () => {
    const state = makeState({ filteredBranches: [], selectedIndex: 0 });
    const result = getSelectedBranch(state);
    assert.equal(result, null);
  });
});

// ---------------------------------------------------------------------------
// openCleanupConfirm / closeCleanupConfirm
// ---------------------------------------------------------------------------

describe('openCleanupConfirm', () => {
  it('should set cleanupConfirmMode and branches list', () => {
    const state = makeState();
    const goneBranches = ['old-feature', 'stale-branch'];
    const result = openCleanupConfirm(state, goneBranches);
    assert.equal(result.cleanupConfirmMode, true);
    assert.deepEqual(result.cleanupBranches, goneBranches);
    assert.equal(result.cleanupSelectedIndex, 0);
  });

  it('should work with empty branch list', () => {
    const state = makeState();
    const result = openCleanupConfirm(state, []);
    assert.equal(result.cleanupConfirmMode, true);
    assert.deepEqual(result.cleanupBranches, []);
    assert.equal(result.cleanupSelectedIndex, 0);
  });
});

describe('closeCleanupConfirm', () => {
  it('should reset cleanup state', () => {
    const state = makeState({
      cleanupConfirmMode: true,
      cleanupBranches: ['branch-1'],
      cleanupSelectedIndex: 1,
    });
    const result = closeCleanupConfirm(state);
    assert.equal(result.cleanupConfirmMode, false);
    assert.equal(result.cleanupBranches, null);
    assert.equal(result.cleanupSelectedIndex, 0);
  });
});
