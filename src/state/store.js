/**
 * Centralized state management for Git Watchtower
 * Replaces scattered global variables with a single source of truth
 */

/**
 * @typedef {Object} Branch
 * @property {string} name - Branch name
 * @property {string} commit - Short commit hash
 * @property {string} subject - Commit subject
 * @property {Date} date - Commit date
 * @property {boolean} isLocal - Is a local branch
 * @property {boolean} hasRemote - Has a remote tracking branch
 * @property {boolean} hasUpdates - Has updates available
 * @property {boolean} isNew - Newly discovered branch
 * @property {boolean} isDeleted - Branch was deleted
 * @property {boolean} justUpdated - Was just updated
 * @property {string} [sparkline] - Activity sparkline
 */

/**
 * @typedef {'normal' | 'search' | 'preview' | 'history' | 'logs' | 'info'} UIMode
 */

/**
 * @typedef {Object} FlashMessage
 * @property {string} text - Message text
 * @property {'info' | 'success' | 'warning' | 'error' | 'update'} type - Message type
 */

/**
 * @typedef {Object} ActivityLogEntry
 * @property {string} message - Log message
 * @property {'info' | 'success' | 'warning' | 'error' | 'update'} type - Entry type
 * @property {Date} timestamp - When the entry was added
 */

/**
 * @typedef {Object} SwitchHistoryEntry
 * @property {string} from - Previous branch name
 * @property {string} to - New branch name
 * @property {Date} timestamp - When the switch occurred
 */

/**
 * @typedef {Object} ServerLogEntry
 * @property {string} timestamp - Time string
 * @property {string} line - Log line content
 * @property {boolean} isError - Is an error line
 */

/**
 * @typedef {Object} State
 * @property {Branch[]} branches - All known branches
 * @property {string|null} currentBranch - Current checked out branch
 * @property {number} selectedIndex - Selected branch index
 * @property {string|null} selectedBranchName - Selected branch name (for persistence)
 * @property {Branch[]|null} filteredBranches - Filtered branch list (null = no filter)
 * @property {boolean} isDetachedHead - In detached HEAD state
 * @property {boolean} hasMergeConflict - Has merge conflicts
 * @property {UIMode} mode - Current UI mode (legacy)
 * @property {boolean} searchMode - Search mode active
 * @property {string} searchQuery - Current search query
 * @property {boolean} previewMode - Preview pane active
 * @property {Object|null} previewData - Preview pane data
 * @property {boolean} historyMode - History view active
 * @property {boolean} infoMode - Info view active
 * @property {boolean} logViewMode - Log view active
 * @property {string} logViewTab - Active log tab ('server' | 'activity')
 * @property {boolean} actionMode - Action modal active
 * @property {Object|null} actionData - Action modal data
 * @property {boolean} actionLoading - Action modal loading state
 * @property {FlashMessage|null} flashMessage - Current flash message
 * @property {Object|null} errorToast - Current error toast
 * @property {ActivityLogEntry[]} activityLog - Activity log entries
 * @property {SwitchHistoryEntry[]} switchHistory - Branch switch history
 * @property {boolean} isPolling - Currently polling git
 * @property {string} pollingStatus - Polling status message
 * @property {boolean} isOffline - Network is offline
 * @property {number} lastFetchDuration - Last fetch duration in ms
 * @property {number} consecutiveNetworkFailures - Number of consecutive failures
 * @property {number} adaptivePollInterval - Current adaptive poll interval in ms
 * @property {boolean} serverRunning - Server process is running
 * @property {boolean} serverCrashed - Server process crashed
 * @property {ServerLogEntry[]} serverLogs - Server log buffer (legacy)
 * @property {ServerLogEntry[]} serverLogBuffer - Server log buffer
 * @property {number} logScrollOffset - Scroll position in log view
 * @property {number} terminalWidth - Terminal width
 * @property {number} terminalHeight - Terminal height
 * @property {number} visibleBranchCount - Number of branches to show
 * @property {boolean} soundEnabled - Sound notifications enabled
 * @property {boolean} casinoModeEnabled - Casino mode enabled
 * @property {Map<string, string>} sparklineCache - Branch sparkline cache
 * @property {Map<string, Object>} branchPrStatusMap - Branch PR status cache
 * @property {string} serverMode - Server mode ('static' | 'command' | 'none')
 * @property {boolean} noServer - No server mode
 * @property {number} port - Server port
 * @property {number} maxLogEntries - Max activity log entries
 * @property {string} projectName - Project name
 * @property {number} clientCount - Connected SSE clients
 */

/**
 * Get initial state with sensible defaults
 * @returns {State}
 */
function getInitialState() {
  return {
    // Git state
    branches: [],
    currentBranch: null,
    selectedIndex: 0,
    selectedBranchName: null,
    filteredBranches: null,
    isDetachedHead: false,
    hasMergeConflict: false,

    // UI mode (legacy — used by setMode/getFilteredBranches)
    mode: 'normal',

    // UI mode flags
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

    // Notifications
    flashMessage: null,
    errorToast: null,

    // Activity tracking
    activityLog: [],
    switchHistory: [],

    // Polling state
    isPolling: false,
    pollingStatus: 'idle',
    isOffline: false,
    lastFetchDuration: 0,
    consecutiveNetworkFailures: 0,
    adaptivePollInterval: 5000,

    // Server state
    serverRunning: false,
    serverCrashed: false,
    serverLogs: [],
    serverLogBuffer: [],
    logScrollOffset: 0,

    // Terminal state
    terminalWidth: process.stdout.columns || 80,
    terminalHeight: process.stdout.rows || 24,

    // Settings (can be overridden by config)
    visibleBranchCount: 7,
    soundEnabled: true,
    casinoModeEnabled: false,

    // Caches (Maps — shallow-copied by getState())
    sparklineCache: new Map(),
    branchPrStatusMap: new Map(),

    // Config (set once at startup, treated as read-only after)
    serverMode: 'static',
    noServer: false,
    port: 3000,
    maxLogEntries: 10,
    projectName: '',
    clientCount: 0,
  };
}

/**
 * Centralized state store with subscription support
 */
class Store {
  /**
   * @param {Partial<State>} [initialState] - Optional initial state overrides
   */
  constructor(initialState = {}) {
    this.state = { ...getInitialState(), ...initialState };
    this.listeners = new Set();
    this.middlewares = [];
  }

  /**
   * Get a copy of the current state
   * @returns {State}
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Get a specific state value
   * @template {keyof State} K
   * @param {K} key - State key
   * @returns {State[K]}
   */
  get(key) {
    return this.state[key];
  }

  /**
   * Update state with partial updates
   * @param {Partial<State>} updates - State updates
   */
  setState(updates) {
    const prevState = this.state;

    // Run middlewares
    let processedUpdates = updates;
    for (const middleware of this.middlewares) {
      processedUpdates = middleware(prevState, processedUpdates) || processedUpdates;
    }

    this.state = { ...this.state, ...processedUpdates };
    this.notify(prevState, this.state, Object.keys(processedUpdates));
  }

  /**
   * Subscribe to state changes
   * @param {(prevState: State, newState: State, changedKeys: string[]) => void} listener
   * @returns {() => void} Unsubscribe function
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Subscribe to specific state keys
   * @param {(keyof State)[]} keys - Keys to watch
   * @param {(prevState: State, newState: State) => void} listener
   * @returns {() => void} Unsubscribe function
   */
  subscribeToKeys(keys, listener) {
    const keySet = new Set(keys);
    return this.subscribe((prevState, newState, changedKeys) => {
      // @ts-ignore - changedKeys are always valid State keys
      if (changedKeys.some((key) => keySet.has(key))) {
        listener(prevState, newState);
      }
    });
  }

  /**
   * Add middleware to process state updates
   * @param {(prevState: State, updates: Partial<State>) => Partial<State>|void} middleware
   */
  use(middleware) {
    this.middlewares.push(middleware);
  }

  /**
   * Notify all listeners of state change
   * @param {State} prevState
   * @param {State} newState
   * @param {string[]} changedKeys
   */
  notify(prevState, newState, changedKeys) {
    this.listeners.forEach((listener) => {
      try {
        listener(prevState, newState, changedKeys);
      } catch (error) {
        console.error('Store listener error:', error);
      }
    });
  }

  /**
   * Reset state to initial values
   * @param {Partial<State>} [overrides] - Optional overrides
   */
  reset(overrides = {}) {
    const prevState = this.state;
    this.state = { ...getInitialState(), ...overrides };
    this.notify(prevState, this.state, Object.keys(this.state));
  }

  // ==========================================================================
  // Convenience methods for common state operations
  // ==========================================================================

  /**
   * Set the current UI mode
   * @param {UIMode} mode
   */
  setMode(mode) {
    const prevMode = this.state.mode;
    const updates = { mode };

    // Clear mode-specific state when leaving
    if (prevMode === 'search' && mode !== 'search') {
      updates.searchQuery = '';
    }
    if (prevMode === 'preview' && mode !== 'preview') {
      updates.previewData = null;
    }
    if (prevMode === 'logs' && mode !== 'logs') {
      updates.logScrollOffset = 0;
    }

    this.setState(updates);
  }

  /**
   * Show a flash message
   * @param {string} text - Message text
   * @param {'info' | 'success' | 'warning' | 'error' | 'update'} [type='info'] - Message type
   */
  flash(text, type = 'info') {
    this.setState({
      flashMessage: { text, type },
    });
  }

  /**
   * Clear the flash message
   */
  clearFlash() {
    this.setState({ flashMessage: null });
  }

  /**
   * Add an activity log entry
   * @param {string} message - Log message
   * @param {'info' | 'success' | 'warning' | 'error' | 'update'} [type='info'] - Entry type
   * @param {number} [maxEntries=10] - Maximum entries to keep
   */
  addLog(message, type = 'info', maxEntries = 10) {
    const entry = { message, type, timestamp: new Date() };
    const activityLog = [...this.state.activityLog, entry].slice(-maxEntries);
    this.setState({ activityLog });
  }

  /**
   * Add a branch switch to history
   * @param {string} from - Previous branch
   * @param {string} to - New branch
   * @param {number} [maxEntries=20] - Maximum entries to keep
   */
  addToHistory(from, to, maxEntries = 20) {
    const entry = { from, to, timestamp: new Date() };
    const switchHistory = [...this.state.switchHistory, entry].slice(-maxEntries);
    this.setState({ switchHistory });
  }

  /**
   * Get the last switch for undo
   * @returns {SwitchHistoryEntry|null}
   */
  getLastSwitch() {
    const history = this.state.switchHistory;
    return history.length > 0 ? history[history.length - 1] : null;
  }

  /**
   * Remove the last switch from history (after undo)
   */
  popHistory() {
    const switchHistory = this.state.switchHistory.slice(0, -1);
    this.setState({ switchHistory });
  }

  /**
   * Add a server log entry
   * @param {string} line - Log line
   * @param {boolean} [isError=false] - Is error output
   * @param {number} [maxLines=500] - Maximum lines to keep
   */
  addServerLog(line, isError = false, maxLines = 500) {
    const entry = {
      timestamp: new Date().toLocaleTimeString(),
      line,
      isError,
    };
    const serverLogs = [...this.state.serverLogs, entry].slice(-maxLines);
    this.setState({ serverLogs });
  }

  /**
   * Clear server logs
   */
  clearServerLogs() {
    this.setState({ serverLogs: [], logScrollOffset: 0 });
  }

  /**
   * Update branches and maintain selection
   * @param {Branch[]} branches - New branch list
   */
  setBranches(branches) {
    // Validate input
    if (!Array.isArray(branches)) {
      console.error('Store.setBranches: expected array, got', typeof branches);
      return;
    }

    const { selectedBranchName, selectedIndex } = this.state;

    // Try to maintain selection by name
    let newSelectedIndex = selectedIndex;
    if (selectedBranchName) {
      const idx = branches.findIndex((b) => b.name === selectedBranchName);
      if (idx !== -1) {
        newSelectedIndex = idx;
      }
    }

    // Clamp to valid range (handle empty array case)
    if (branches.length === 0) {
      newSelectedIndex = 0;
    } else {
      newSelectedIndex = Math.max(0, Math.min(newSelectedIndex, branches.length - 1));
    }

    this.setState({
      branches,
      selectedIndex: newSelectedIndex,
      selectedBranchName: branches[newSelectedIndex]?.name || null,
    });
  }

  /**
   * Update selection index
   * @param {number} index - New index
   */
  setSelectedIndex(index) {
    // Validate input - convert to number and check for NaN
    const numIndex = Number(index);
    if (Number.isNaN(numIndex)) {
      console.error('Store.setSelectedIndex: expected number, got', typeof index);
      return;
    }

    const { branches } = this.state;
    // Handle empty branches array
    if (branches.length === 0) {
      this.setState({
        selectedIndex: 0,
        selectedBranchName: null,
      });
      return;
    }

    const clampedIndex = Math.max(0, Math.min(Math.floor(numIndex), branches.length - 1));
    this.setState({
      selectedIndex: clampedIndex,
      selectedBranchName: branches[clampedIndex]?.name || null,
    });
  }

  /**
   * Move selection up or down
   * @param {number} delta - Amount to move (-1 for up, 1 for down)
   */
  moveSelection(delta) {
    const { selectedIndex, branches } = this.state;
    const newIndex = selectedIndex + delta;
    if (newIndex >= 0 && newIndex < branches.length) {
      this.setSelectedIndex(newIndex);
    }
  }

  /**
   * Get currently selected branch
   * @returns {Branch|null}
   */
  getSelectedBranch() {
    const { branches, selectedIndex } = this.state;
    return branches[selectedIndex] || null;
  }

  /**
   * Get branches filtered by current search query
   * @returns {Branch[]}
   */
  getFilteredBranches() {
    const { branches, searchQuery, mode, searchMode } = this.state;
    if ((!searchMode && mode !== 'search') || !searchQuery) {
      return branches;
    }
    const query = searchQuery.toLowerCase();
    return branches.filter((b) => b.name.toLowerCase().includes(query));
  }

  /**
   * Update terminal dimensions
   * @param {number} width
   * @param {number} height
   */
  setTerminalSize(width, height) {
    this.setState({
      terminalWidth: width,
      terminalHeight: height,
    });
  }
}

/**
 * Create a new store instance
 * @param {Partial<State>} [initialState]
 * @returns {Store}
 */
function createStore(initialState) {
  return new Store(initialState);
}

module.exports = {
  Store,
  createStore,
  getInitialState,
};
