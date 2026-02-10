/**
 * Extracted keyboard action handlers (pure state reducers).
 *
 * Each function takes the current state object (and optional context)
 * and returns an object of state updates, or null when no change is needed.
 * Async side-effects (git operations, server calls) are intentionally
 * excluded -- only synchronous state mutations live here.
 *
 * @module ui/actions
 */

const {
  isPrintableChar,
  isBackspaceKey,
  isEscapeKey,
  isEnterKey,
  KEYS,
  filterBranches,
} = require('./keybindings');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return the branch list that is currently visible (filtered or full).
 * @param {object} state
 * @returns {Array<{name: string}>}
 */
function getDisplayBranches(state) {
  return state.filteredBranches !== null ? state.filteredBranches : state.branches;
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/**
 * Move the selection cursor up by one row.
 * @param {object} state
 * @returns {object|null} State updates, or null if already at the top.
 */
function moveUp(state) {
  const displayBranches = getDisplayBranches(state);
  if (state.selectedIndex > 0) {
    const newIndex = state.selectedIndex - 1;
    return {
      selectedIndex: newIndex,
      selectedBranchName: displayBranches[newIndex] ? displayBranches[newIndex].name : null,
    };
  }
  return null;
}

/**
 * Move the selection cursor down by one row.
 * @param {object} state
 * @returns {object|null} State updates, or null if already at the bottom.
 */
function moveDown(state) {
  const displayBranches = getDisplayBranches(state);
  if (state.selectedIndex < displayBranches.length - 1) {
    const newIndex = state.selectedIndex + 1;
    return {
      selectedIndex: newIndex,
      selectedBranchName: displayBranches[newIndex] ? displayBranches[newIndex].name : null,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Search mode
// ---------------------------------------------------------------------------

/**
 * Enter search (filter) mode, resetting the query and cursor.
 * @param {object} state
 * @returns {object} State updates.
 */
function enterSearchMode(state) {
  return {
    searchMode: true,
    searchQuery: '',
    selectedIndex: 0,
  };
}

/**
 * Process a single keypress while in search mode.
 *
 * - Escape cancels the search and clears the filter.
 * - Enter confirms the current filter and exits search mode.
 * - Backspace removes the last character from the query.
 * - Printable characters are appended to the query.
 *
 * @param {object} state
 * @param {string} key - The raw key string from stdin.
 * @returns {object|null} State updates, or null if the key was not handled.
 */
function handleSearchInput(state, key) {
  if (isEscapeKey(key) || isEnterKey(key)) {
    const updates = { searchMode: false };
    if (isEscapeKey(key)) {
      updates.searchQuery = '';
      updates.filteredBranches = null;
    }
    return updates;
  }

  if (isBackspaceKey(key)) {
    const newQuery = state.searchQuery.slice(0, -1);
    const filtered = filterBranches(state.branches, newQuery);
    let newIndex = state.selectedIndex;
    if (filtered && newIndex >= filtered.length) {
      newIndex = Math.max(0, filtered.length - 1);
    }
    return {
      searchQuery: newQuery,
      filteredBranches: filtered,
      selectedIndex: newIndex,
    };
  }

  if (isPrintableChar(key)) {
    const newQuery = state.searchQuery + key;
    const filtered = filterBranches(state.branches, newQuery);
    let newIndex = state.selectedIndex;
    if (filtered && newIndex >= filtered.length) {
      newIndex = Math.max(0, filtered.length - 1);
    }
    return {
      searchQuery: newQuery,
      filteredBranches: filtered,
      selectedIndex: newIndex,
    };
  }

  return null; // Key not handled
}

// ---------------------------------------------------------------------------
// Modal toggles
// ---------------------------------------------------------------------------

/**
 * Toggle the diff/preview panel.
 * When opening, the caller is responsible for loading preview data
 * asynchronously after applying the returned state updates.
 * @param {object} state
 * @returns {object} State updates.
 */
function togglePreview(state) {
  if (state.previewMode) {
    return { previewMode: false, previewData: null };
  }
  // Opening preview requires async data loading -- return flag indicating need.
  return { previewMode: true };
}

/**
 * Toggle the commit history panel.
 * @param {object} state
 * @returns {object} State updates.
 */
function toggleHistory(state) {
  return { historyMode: !state.historyMode };
}

/**
 * Toggle the info/help panel.
 * @param {object} state
 * @returns {object} State updates.
 */
function toggleInfo(state) {
  return { infoMode: !state.infoMode };
}

/**
 * Toggle the log viewer panel.
 * No-ops when running without a server (`state.noServer`).
 * @param {object} state
 * @returns {object|null} State updates, or null if no server is configured.
 */
function toggleLogView(state) {
  if (state.noServer) return null;
  if (state.logViewMode) {
    return { logViewMode: false, logScrollOffset: 0 };
  }
  return { logViewMode: true, logScrollOffset: 0 };
}

/**
 * Close the action confirmation modal, clearing its data and loading flag.
 * @param {object} state
 * @returns {object} State updates.
 */
function closeActionModal(state) {
  return { actionMode: false, actionData: null, actionLoading: false };
}

// ---------------------------------------------------------------------------
// Log view actions
// ---------------------------------------------------------------------------

/**
 * Switch the active tab inside the log viewer.
 * @param {object} state
 * @param {string} tab - The tab identifier (e.g. 'server' or 'activity').
 * @returns {object} State updates.
 */
function switchLogTab(state, tab) {
  return { logViewTab: tab, logScrollOffset: 0 };
}

/**
 * Scroll the log viewer up or down by one line.
 * @param {object} state
 * @param {'up'|'down'} direction
 * @returns {object} State updates.
 */
function scrollLog(state, direction) {
  const logData = state.logViewTab === 'server' ? state.serverLogBuffer : state.activityLog;
  const maxScroll = Math.max(0, logData.length - 10);

  if (direction === 'up') {
    return { logScrollOffset: Math.min(state.logScrollOffset + 1, maxScroll) };
  } else {
    return { logScrollOffset: Math.max(0, state.logScrollOffset - 1) };
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/**
 * Toggle the notification sound on or off.
 * @param {object} state
 * @returns {object} State updates.
 */
function toggleSound(state) {
  return { soundEnabled: !state.soundEnabled };
}

/**
 * Set the number of visible branches to an exact value.
 * @param {object} state
 * @param {number} count
 * @returns {object} State updates.
 */
function setVisibleBranchCount(state, count) {
  return { visibleBranchCount: count };
}

/**
 * Increase the visible branch count by one, up to a screen-imposed maximum.
 * @param {object} state
 * @param {number} maxForScreen - Maximum branches that fit on the current terminal.
 * @returns {object|null} State updates, or null if already at max.
 */
function increaseVisibleBranches(state, maxForScreen) {
  if (state.visibleBranchCount < maxForScreen) {
    return { visibleBranchCount: state.visibleBranchCount + 1 };
  }
  return null;
}

/**
 * Decrease the visible branch count by one, with a minimum of 1.
 * @param {object} state
 * @returns {object|null} State updates, or null if already at minimum.
 */
function decreaseVisibleBranches(state) {
  if (state.visibleBranchCount > 1) {
    return { visibleBranchCount: state.visibleBranchCount - 1 };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Dismiss flash / error
// ---------------------------------------------------------------------------

/**
 * Dismiss the current flash message.
 * @param {object} state
 * @returns {object|null} State updates, or null if there is no flash message.
 */
function dismissFlash(state) {
  if (state.flashMessage) {
    return { flashMessage: null };
  }
  return null;
}

/**
 * Dismiss the current error toast.
 * @param {object} state
 * @returns {object|null} State updates, or null if there is no error toast.
 */
function dismissErrorToast(state) {
  if (state.errorToast) {
    return { errorToast: null };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Escape handler (normal mode)
// ---------------------------------------------------------------------------

/**
 * Handle the Escape key in normal mode.
 *
 * If a search filter is active, clears it. Otherwise signals a quit by
 * returning `{ _quit: true }`.
 *
 * @param {object} state
 * @returns {object} State updates (may include `_quit: true`).
 */
function handleEscape(state) {
  if (state.searchQuery || state.filteredBranches) {
    return { searchQuery: '', filteredBranches: null };
  }
  // Quit signal
  return { _quit: true };
}

// ---------------------------------------------------------------------------
// Selection query
// ---------------------------------------------------------------------------

/**
 * Return the branch object that is currently highlighted, or null if the
 * selection is out of range or the list is empty.
 * @param {object} state
 * @returns {object|null} The selected branch, or null.
 */
function getSelectedBranch(state) {
  const displayBranches = getDisplayBranches(state);
  if (displayBranches.length > 0 && state.selectedIndex < displayBranches.length) {
    return displayBranches[state.selectedIndex];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // helpers
  getDisplayBranches,

  // navigation
  moveUp,
  moveDown,

  // search
  enterSearchMode,
  handleSearchInput,

  // modal toggles
  togglePreview,
  toggleHistory,
  toggleInfo,
  toggleLogView,
  closeActionModal,

  // log view
  switchLogTab,
  scrollLog,

  // settings
  toggleSound,
  setVisibleBranchCount,
  increaseVisibleBranches,
  decreaseVisibleBranches,

  // dismiss
  dismissFlash,
  dismissErrorToast,

  // escape
  handleEscape,

  // selection
  getSelectedBranch,
};
