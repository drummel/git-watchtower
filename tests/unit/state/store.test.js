/**
 * Tests for state store
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { Store, createStore, getInitialState } = require('../../../src/state/store');

describe('Store', () => {
  let store;

  beforeEach(() => {
    store = new Store();
  });

  describe('constructor', () => {
    it('should initialize with default state', () => {
      const state = store.getState();
      assert.deepStrictEqual(state.branches, []);
      assert.strictEqual(state.currentBranch, null);
      assert.strictEqual(state.selectedIndex, 0);
      assert.strictEqual(state.mode, 'normal');
    });

    it('should accept initial state overrides', () => {
      const customStore = new Store({ visibleBranchCount: 10 });
      assert.strictEqual(customStore.get('visibleBranchCount'), 10);
    });
  });

  describe('getState', () => {
    it('should return a copy of state', () => {
      const state1 = store.getState();
      const state2 = store.getState();
      assert.notStrictEqual(state1, state2);
      assert.deepStrictEqual(state1, state2);
    });
  });

  describe('get', () => {
    it('should return specific state value', () => {
      assert.strictEqual(store.get('mode'), 'normal');
      assert.deepStrictEqual(store.get('branches'), []);
    });
  });

  describe('setState', () => {
    it('should update state', () => {
      store.setState({ currentBranch: 'main' });
      assert.strictEqual(store.get('currentBranch'), 'main');
    });

    it('should merge with existing state', () => {
      store.setState({ currentBranch: 'main' });
      store.setState({ isPolling: true });
      assert.strictEqual(store.get('currentBranch'), 'main');
      assert.strictEqual(store.get('isPolling'), true);
    });

    it('should notify listeners', () => {
      let notified = false;
      store.subscribe(() => {
        notified = true;
      });
      store.setState({ currentBranch: 'main' });
      assert.strictEqual(notified, true);
    });

    it('should pass changed keys to listeners', () => {
      let changedKeys;
      store.subscribe((prev, next, keys) => {
        changedKeys = keys;
      });
      store.setState({ currentBranch: 'main', isPolling: true });
      assert.deepStrictEqual(changedKeys.sort(), ['currentBranch', 'isPolling']);
    });
  });

  describe('subscribe', () => {
    it('should add listener', () => {
      let callCount = 0;
      store.subscribe(() => callCount++);
      store.setState({ mode: 'search' });
      store.setState({ mode: 'normal' });
      assert.strictEqual(callCount, 2);
    });

    it('should return unsubscribe function', () => {
      let callCount = 0;
      const unsubscribe = store.subscribe(() => callCount++);
      store.setState({ mode: 'search' });
      unsubscribe();
      store.setState({ mode: 'normal' });
      assert.strictEqual(callCount, 1);
    });

    it('should pass previous and new state', () => {
      let prevState, newState;
      store.subscribe((prev, next) => {
        prevState = prev;
        newState = next;
      });
      store.setState({ currentBranch: 'feature' });
      assert.strictEqual(prevState.currentBranch, null);
      assert.strictEqual(newState.currentBranch, 'feature');
    });
  });

  describe('subscribeToKeys', () => {
    it('should only notify for watched keys', () => {
      let callCount = 0;
      store.subscribeToKeys(['currentBranch'], () => callCount++);

      store.setState({ mode: 'search' }); // Should not trigger
      assert.strictEqual(callCount, 0);

      store.setState({ currentBranch: 'main' }); // Should trigger
      assert.strictEqual(callCount, 1);
    });

    it('should trigger for any watched key', () => {
      let callCount = 0;
      store.subscribeToKeys(['currentBranch', 'mode'], () => callCount++);

      store.setState({ currentBranch: 'main' });
      store.setState({ mode: 'search' });
      assert.strictEqual(callCount, 2);
    });
  });

  describe('middleware', () => {
    it('should process updates through middleware', () => {
      store.use((prevState, updates) => {
        if (updates.currentBranch) {
          return { ...updates, currentBranch: updates.currentBranch.toUpperCase() };
        }
        return updates;
      });

      store.setState({ currentBranch: 'main' });
      assert.strictEqual(store.get('currentBranch'), 'MAIN');
    });

    it('should chain multiple middlewares', () => {
      store.use((prev, updates) => ({ ...updates, a: 1 }));
      store.use((prev, updates) => ({ ...updates, b: 2 }));

      store.setState({ c: 3 });
      const state = store.getState();
      assert.strictEqual(state.a, 1);
      assert.strictEqual(state.b, 2);
      assert.strictEqual(state.c, 3);
    });
  });

  describe('reset', () => {
    it('should reset to initial state', () => {
      store.setState({ currentBranch: 'feature', mode: 'search' });
      store.reset();
      assert.strictEqual(store.get('currentBranch'), null);
      assert.strictEqual(store.get('mode'), 'normal');
    });

    it('should accept overrides', () => {
      store.setState({ currentBranch: 'feature' });
      store.reset({ visibleBranchCount: 5 });
      assert.strictEqual(store.get('currentBranch'), null);
      assert.strictEqual(store.get('visibleBranchCount'), 5);
    });
  });
});

describe('Store convenience methods', () => {
  let store;

  beforeEach(() => {
    store = new Store();
  });

  describe('setMode', () => {
    it('should set UI mode', () => {
      store.setMode('search');
      assert.strictEqual(store.get('mode'), 'search');
    });

    it('should clear search query when leaving search mode', () => {
      store.setState({ mode: 'search', searchQuery: 'test' });
      store.setMode('normal');
      assert.strictEqual(store.get('searchQuery'), '');
    });

    it('should clear preview data when leaving preview mode', () => {
      store.setState({ mode: 'preview', previewData: { commits: [] } });
      store.setMode('normal');
      assert.strictEqual(store.get('previewData'), null);
    });

    it('should reset scroll when leaving logs mode', () => {
      store.setState({ mode: 'logs', logScrollOffset: 100 });
      store.setMode('normal');
      assert.strictEqual(store.get('logScrollOffset'), 0);
    });
  });

  describe('flash', () => {
    it('should set flash message', () => {
      store.flash('Test message', 'success');
      const flash = store.get('flashMessage');
      assert.strictEqual(flash.text, 'Test message');
      assert.strictEqual(flash.type, 'success');
    });

    it('should default to info type', () => {
      store.flash('Test');
      assert.strictEqual(store.get('flashMessage').type, 'info');
    });
  });

  describe('clearFlash', () => {
    it('should clear flash message', () => {
      store.flash('Test');
      store.clearFlash();
      assert.strictEqual(store.get('flashMessage'), null);
    });
  });

  describe('addLog', () => {
    it('should add activity log entry', () => {
      store.addLog('Test entry', 'info');
      const log = store.get('activityLog');
      assert.strictEqual(log.length, 1);
      assert.strictEqual(log[0].message, 'Test entry');
      assert.strictEqual(log[0].type, 'info');
      assert.ok(log[0].timestamp instanceof Date);
    });

    it('should limit entries', () => {
      for (let i = 0; i < 15; i++) {
        store.addLog(`Entry ${i}`);
      }
      const log = store.get('activityLog');
      assert.strictEqual(log.length, 10);
      assert.strictEqual(log[0].message, 'Entry 5');
      assert.strictEqual(log[9].message, 'Entry 14');
    });

    it('should accept custom max entries', () => {
      for (let i = 0; i < 10; i++) {
        store.addLog(`Entry ${i}`, 'info', 5);
      }
      assert.strictEqual(store.get('activityLog').length, 5);
    });
  });

  describe('switch history', () => {
    it('should add to history', () => {
      store.addToHistory('main', 'feature');
      const history = store.get('switchHistory');
      assert.strictEqual(history.length, 1);
      assert.strictEqual(history[0].from, 'main');
      assert.strictEqual(history[0].to, 'feature');
    });

    it('should get last switch', () => {
      store.addToHistory('main', 'feature');
      store.addToHistory('feature', 'develop');
      const last = store.getLastSwitch();
      assert.strictEqual(last.from, 'feature');
      assert.strictEqual(last.to, 'develop');
    });

    it('should return null if no history', () => {
      assert.strictEqual(store.getLastSwitch(), null);
    });

    it('should pop from history', () => {
      store.addToHistory('main', 'feature');
      store.addToHistory('feature', 'develop');
      store.popHistory();
      const history = store.get('switchHistory');
      assert.strictEqual(history.length, 1);
      assert.strictEqual(history[0].to, 'feature');
    });
  });

  describe('server logs', () => {
    it('should add server log', () => {
      store.addServerLog('Server started');
      const logs = store.get('serverLogs');
      assert.strictEqual(logs.length, 1);
      assert.strictEqual(logs[0].line, 'Server started');
      assert.strictEqual(logs[0].isError, false);
    });

    it('should mark error logs', () => {
      store.addServerLog('Error occurred', true);
      assert.strictEqual(store.get('serverLogs')[0].isError, true);
    });

    it('should clear server logs', () => {
      store.addServerLog('Log 1');
      store.addServerLog('Log 2');
      store.setState({ logScrollOffset: 50 });
      store.clearServerLogs();
      assert.deepStrictEqual(store.get('serverLogs'), []);
      assert.strictEqual(store.get('logScrollOffset'), 0);
    });
  });

  describe('branches', () => {
    const testBranches = [
      { name: 'main', commit: 'abc' },
      { name: 'feature', commit: 'def' },
      { name: 'develop', commit: 'ghi' },
    ];

    it('should set branches', () => {
      store.setBranches(testBranches);
      assert.strictEqual(store.get('branches').length, 3);
    });

    it('should maintain selection by name', () => {
      store.setBranches(testBranches);
      store.setSelectedIndex(1); // Select 'feature'

      // Reorder branches
      const reordered = [testBranches[2], testBranches[0], testBranches[1]];
      store.setBranches(reordered);

      // Selection should follow 'feature'
      assert.strictEqual(store.get('selectedIndex'), 2);
      assert.strictEqual(store.get('selectedBranchName'), 'feature');
    });

    it('should clamp selection to valid range', () => {
      store.setBranches(testBranches);
      store.setSelectedIndex(2);
      store.setBranches([testBranches[0]]); // Only one branch now
      assert.strictEqual(store.get('selectedIndex'), 0);
    });
  });

  describe('selection', () => {
    beforeEach(() => {
      store.setBranches([
        { name: 'main' },
        { name: 'feature' },
        { name: 'develop' },
      ]);
    });

    it('should set selected index', () => {
      store.setSelectedIndex(2);
      assert.strictEqual(store.get('selectedIndex'), 2);
      assert.strictEqual(store.get('selectedBranchName'), 'develop');
    });

    it('should clamp to valid range', () => {
      store.setSelectedIndex(100);
      assert.strictEqual(store.get('selectedIndex'), 2);

      store.setSelectedIndex(-5);
      assert.strictEqual(store.get('selectedIndex'), 0);
    });

    it('should move selection', () => {
      store.setSelectedIndex(1);
      store.moveSelection(1);
      assert.strictEqual(store.get('selectedIndex'), 2);
    });

    it('should not move past boundaries', () => {
      store.setSelectedIndex(0);
      store.moveSelection(-1);
      assert.strictEqual(store.get('selectedIndex'), 0);

      store.setSelectedIndex(2);
      store.moveSelection(1);
      assert.strictEqual(store.get('selectedIndex'), 2);
    });

    it('should get selected branch', () => {
      store.setSelectedIndex(1);
      const branch = store.getSelectedBranch();
      assert.strictEqual(branch.name, 'feature');
    });

    it('should return null if no branches', () => {
      store.setBranches([]);
      assert.strictEqual(store.getSelectedBranch(), null);
    });
  });

  describe('getFilteredBranches', () => {
    beforeEach(() => {
      store.setBranches([
        { name: 'main' },
        { name: 'feature-auth' },
        { name: 'feature-api' },
        { name: 'bugfix-login' },
      ]);
    });

    it('should return all branches in normal mode', () => {
      const filtered = store.getFilteredBranches();
      assert.strictEqual(filtered.length, 4);
    });

    it('should filter by search query in search mode', () => {
      store.setState({ mode: 'search', searchQuery: 'feature' });
      const filtered = store.getFilteredBranches();
      assert.strictEqual(filtered.length, 2);
      assert.ok(filtered.every((b) => b.name.includes('feature')));
    });

    it('should be case insensitive', () => {
      store.setState({ mode: 'search', searchQuery: 'FEATURE' });
      const filtered = store.getFilteredBranches();
      assert.strictEqual(filtered.length, 2);
    });
  });

  describe('setTerminalSize', () => {
    it('should update terminal dimensions', () => {
      store.setTerminalSize(120, 40);
      assert.strictEqual(store.get('terminalWidth'), 120);
      assert.strictEqual(store.get('terminalHeight'), 40);
    });
  });
});

describe('createStore', () => {
  it('should create a new store instance', () => {
    const store = createStore();
    assert.ok(store instanceof Store);
  });

  it('should accept initial state', () => {
    const store = createStore({ visibleBranchCount: 15 });
    assert.strictEqual(store.get('visibleBranchCount'), 15);
  });
});

describe('getInitialState', () => {
  it('should return fresh initial state', () => {
    const state1 = getInitialState();
    const state2 = getInitialState();
    assert.deepStrictEqual(state1, state2);
    assert.notStrictEqual(state1, state2); // Should be different objects
  });
});
