/**
 * Keyboard input handling - key constants and mode management
 * @module ui/keybindings
 */

/**
 * Key constants for special keys
 */
const KEYS = {
  UP: '\u001b[A',
  DOWN: '\u001b[B',
  ENTER: '\r',
  NEWLINE: '\n',
  ESCAPE: '\u001b',
  BACKSPACE: '\u007f',
  BACKSPACE_ALT: '\b',
  CTRL_C: '\u0003',
};

/**
 * UI mode identifiers
 */
const MODES = {
  NORMAL: 'normal',
  SEARCH: 'search',
  PREVIEW: 'preview',
  HISTORY: 'history',
  INFO: 'info',
  LOG_VIEW: 'log_view',
  ACTION: 'action',
};

/**
 * Determine the current UI mode from state flags.
 * @param {object} state
 * @param {boolean} state.searchMode
 * @param {boolean} state.previewMode
 * @param {boolean} state.historyMode
 * @param {boolean} state.infoMode
 * @param {boolean} state.logViewMode
 * @param {boolean} state.actionMode
 * @returns {string} One of MODES values
 */
function getCurrentMode(state) {
  if (state.searchMode) return MODES.SEARCH;
  if (state.previewMode) return MODES.PREVIEW;
  if (state.historyMode) return MODES.HISTORY;
  if (state.infoMode) return MODES.INFO;
  if (state.logViewMode) return MODES.LOG_VIEW;
  if (state.actionMode) return MODES.ACTION;
  return MODES.NORMAL;
}

/**
 * Check if a key is a printable character.
 * @param {string} key
 * @returns {boolean}
 */
function isPrintableChar(key) {
  return key.length === 1 && key >= ' ' && key <= '~';
}

/**
 * Check if a key is a navigation key (up/down arrows or j/k).
 * @param {string} key
 * @returns {boolean}
 */
function isNavKey(key) {
  return key === KEYS.UP || key === KEYS.DOWN || key === 'k' || key === 'j';
}

/**
 * Check if a key is the escape key.
 * @param {string} key
 * @returns {boolean}
 */
function isEscapeKey(key) {
  return key === KEYS.ESCAPE;
}

/**
 * Check if a key is the enter key.
 * @param {string} key
 * @returns {boolean}
 */
function isEnterKey(key) {
  return key === KEYS.ENTER || key === KEYS.NEWLINE;
}

/**
 * Check if a key is a backspace key.
 * @param {string} key
 * @returns {boolean}
 */
function isBackspaceKey(key) {
  return key === KEYS.BACKSPACE || key === KEYS.BACKSPACE_ALT;
}

/**
 * Check if a key is a digit (0-9).
 * @param {string} key
 * @returns {boolean}
 */
function isDigitKey(key) {
  return key.length === 1 && key >= '0' && key <= '9';
}

/**
 * Determine the normal mode action for a given key.
 * Returns an action name string, or null if the key is unhandled.
 * @param {string} key
 * @returns {string|null} Action name
 */
function getNormalModeAction(key) {
  switch (key) {
    case KEYS.UP:
    case 'k':
      return 'move_up';
    case KEYS.DOWN:
    case 'j':
      return 'move_down';
    case KEYS.ENTER:
    case KEYS.NEWLINE:
      return 'select_branch';
    case 'v':
      return 'preview';
    case '/':
      return 'search';
    case 'h':
      return 'history';
    case 'i':
      return 'info';
    case 'u':
      return 'undo';
    case 'p':
      return 'pull';
    case 'r':
      return 'reload_browsers';
    case 'R':
      return 'restart_server';
    case 'l':
      return 'view_logs';
    case 'o':
      return 'open_browser';
    case 'b':
      return 'branch_actions';
    case 'f':
      return 'fetch';
    case 's':
      return 'toggle_sound';
    case 'S':
      return 'stash';
    case 'c':
      return 'toggle_casino';
    case 'd':
      return 'cleanup_branches';
    case 'q':
    case KEYS.CTRL_C:
      return 'quit';
    case KEYS.ESCAPE:
      return 'escape';
    case '+':
    case '=':
      return 'increase_visible';
    case '-':
    case '_':
      return 'decrease_visible';
    default:
      if (isDigitKey(key)) return 'set_visible_count';
      return null;
  }
}

/**
 * Apply a search query to filter branches.
 * @param {Array<{name: string}>} branches - Full branch list
 * @param {string} query - Search query
 * @returns {Array<{name: string}>|null} Filtered branches, or null if empty query
 */
function filterBranches(branches, query) {
  if (!query) return null;
  const lowerQuery = query.toLowerCase();
  return branches.filter(b => b.name.toLowerCase().includes(lowerQuery));
}

module.exports = {
  KEYS,
  MODES,
  getCurrentMode,
  isPrintableChar,
  isNavKey,
  isEscapeKey,
  isEnterKey,
  isBackspaceKey,
  isDigitKey,
  getNormalModeAction,
  filterBranches,
};
