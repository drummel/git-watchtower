# Architecture Review: Git Watchtower

**Review Date:** January 2026
**Reviewer:** Architecture Review Agent
**Version Reviewed:** 1.0.0

---

## Executive Summary

Git Watchtower is a terminal-based Git branch monitoring tool with an optional integrated dev server. The application is built as a **zero-dependency monolith** (~2,660 lines) using only Node.js built-in modules. While this design has notable strengths (simple deployment, no supply chain risk), the architecture has reached a complexity threshold where refactoring would significantly improve maintainability, testability, and extensibility.

### Key Findings

| Category | Rating | Summary |
|----------|--------|---------|
| **Simplicity** | ✅ Good | Zero dependencies, single-file deployment |
| **Functionality** | ✅ Good | Comprehensive feature set, handles edge cases well |
| **Code Organization** | ⚠️ Fair | Logical sections but no module boundaries |
| **State Management** | ⚠️ Fair | 50+ global variables, risk of race conditions |
| **Testability** | ❌ Poor | No tests, global state makes unit testing difficult |
| **Extensibility** | ⚠️ Fair | Adding features requires modifying single file |

---

## Table of Contents

1. [Current Architecture](#1-current-architecture)
2. [Identified Concerns](#2-identified-concerns)
3. [Recommended Refactoring](#3-recommended-refactoring)
4. [Testability Improvements](#4-testability-improvements)
5. [Implementation Roadmap](#5-implementation-roadmap)

---

## 1. Current Architecture

### 1.1 High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                       git-watchtower.js                             │
│                        (2,660 lines)                                │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │   Config    │  │    Git      │  │   Server    │  │    UI      │ │
│  │  (lines     │  │  (lines     │  │  (lines     │  │  (lines    │ │
│  │  93-343)    │  │  1615-1877) │  │  542-643,   │  │  983-1614) │ │
│  │             │  │             │  │  2098-2202) │  │            │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐ │
│  │   Polling   │  │   Input     │  │     Global State            │ │
│  │  (lines     │  │  (lines     │  │     (50+ variables)         │ │
│  │  1883-2095) │  │  2204-2490) │  │     (lines 470-770)         │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Current Strengths

1. **Zero Dependencies**: Uses only Node.js built-ins (`http`, `fs`, `path`, `child_process`, `readline`)
2. **Cross-Platform**: Handles macOS, Linux, and Windows differences
3. **Comprehensive Error Handling**: Graceful handling of network failures, merge conflicts, detached HEAD
4. **Adaptive Behavior**: Polling interval adjusts to network conditions
5. **Security-Conscious**: Branch name validation, path traversal protection

### 1.3 Current Data Flow

```
CLI Args → Config Loading → Validation → Server Init → Polling Loop
                                              ↓
                                        State Updates
                                              ↓
User Input ←→ Input Handler ←→ Global State ←→ Render Loop
                                    ↑
                              Git Operations
```

---

## 2. Identified Concerns

### 2.1 High Priority Issues

#### 2.1.1 Global State Sprawl

**Location:** Lines 470-770
**Impact:** High

The application uses 50+ global variables to manage state:

```javascript
// Current pattern (problematic)
let branches = [];
let selectedIndex = 0;
let currentBranch = null;
let isPolling = false;
let previewMode = false;
let searchMode = false;
let serverProcess = null;
// ... 40+ more variables
```

**Problems:**
- Difficult to track state mutations
- Race conditions between async operations
- No clear ownership of state
- Makes testing nearly impossible

#### 2.1.2 Async Race Conditions

**Location:** Lines 1884, 636
**Impact:** High

```javascript
async function pollGitChanges() {
  if (isPolling) return;  // Simple guard, but not thread-safe
  isPolling = true;
  // ... polling logic
}
```

**Problems:**
- Multiple overlapping polls could corrupt branch list
- Server restart during branch switch could cause issues
- No proper locking mechanism

#### 2.1.3 Command Injection Risk (Command Mode)

**Location:** Lines 556-559
**Impact:** Medium-High

```javascript
const parts = SERVER_COMMAND.split(' ');
const cmd = parts[0];
const args = parts.slice(1);
```

**Problems:**
- Naive space splitting breaks commands with quoted arguments
- `npm run dev -- --flag="value with spaces"` fails
- Potential security issue with malformed commands

### 2.2 Medium Priority Issues

#### 2.2.1 Monolithic Rendering

**Location:** Lines 983-1614
**Impact:** Medium

The entire screen is redrawn on every state change:

```javascript
function render() {
  process.stdout.write(ansi.clearScreen);
  process.stdout.write(ansi.moveToTop);
  renderHeader();
  renderBranchList();
  renderActivityLog();
  renderFooter();
  // ... modals
}
```

**Problems:**
- Inefficient for large terminals
- Flickering possible on slower systems
- No differential rendering

#### 2.2.2 Inconsistent Error Handling

**Location:** Throughout
**Impact:** Medium

```javascript
// Pattern 1: Silent catch
} catch (e) {
  return null;
}

// Pattern 2: Log and continue
} catch (e) {
  console.error(`Error: ${e.message}`);
  return null;
}

// Pattern 3: User-facing error
} catch (e) {
  addLog(`Failed: ${e.message}`, 'error');
}
```

**Problems:**
- Inconsistent error recovery strategies
- Some errors silently swallowed
- Difficult to debug issues

#### 2.2.3 No Operation Timeouts

**Location:** Git operations throughout
**Impact:** Medium

Git operations can hang indefinitely on slow networks:

```javascript
async function getPreviewData(branchName) {
  // No timeout - could hang forever
  const commits = await new Promise((resolve, reject) => {
    exec(`git log ...`, (error, stdout) => {
      // ...
    });
  });
}
```

### 2.3 Low Priority Issues

| Issue | Location | Impact |
|-------|----------|--------|
| Sparkline cache lacks persistence | Lines 763-766 | Low |
| No session state recovery | N/A | Low |
| Hard-coded terminal minimum size | Lines 737-738 | Low |
| File watcher cleanup edge cases | Line 2510 | Low |

---

## 3. Recommended Refactoring

### 3.1 Proposed Architecture

Transform from monolithic to modular architecture while maintaining zero external dependencies:

```
src/
├── index.js              # Entry point, CLI parsing
├── config/
│   ├── loader.js         # Config file loading/saving
│   ├── wizard.js         # Interactive setup wizard
│   └── schema.js         # Config validation & defaults
├── git/
│   ├── commands.js       # Git command execution
│   ├── branch.js         # Branch operations
│   └── polling.js        # Polling loop logic
├── server/
│   ├── static.js         # Static file server
│   ├── process.js        # Command mode process management
│   └── livereload.js     # SSE live reload
├── ui/
│   ├── renderer.js       # Main render loop
│   ├── components/
│   │   ├── header.js
│   │   ├── branchList.js
│   │   ├── activityLog.js
│   │   ├── footer.js
│   │   └── modals/
│   │       ├── preview.js
│   │       ├── history.js
│   │       └── logs.js
│   ├── ansi.js           # ANSI escape codes
│   └── box.js            # Box drawing characters
├── input/
│   └── keyboard.js       # Input handling
├── state/
│   ├── store.js          # Centralized state management
│   └── actions.js        # State mutation functions
└── utils/
    ├── async.js          # Async helpers (timeout, mutex)
    ├── sound.js          # Sound notification
    └── sparkline.js      # Activity sparklines
```

### 3.2 State Management Refactoring

Replace global variables with a centralized state store:

```javascript
// src/state/store.js
class Store {
  constructor() {
    this.state = {
      // Git state
      branches: [],
      currentBranch: null,
      selectedIndex: 0,
      isPolling: false,

      // UI state
      mode: 'normal', // 'normal' | 'search' | 'preview' | 'history' | 'logs'
      searchQuery: '',
      flashMessage: null,

      // Server state
      serverRunning: false,
      serverLogs: [],

      // Network state
      isOffline: false,
      lastFetchDuration: 0,
    };

    this.listeners = new Set();
  }

  getState() {
    return { ...this.state }; // Return copy to prevent mutation
  }

  setState(updates) {
    const prevState = this.state;
    this.state = { ...this.state, ...updates };
    this.notify(prevState, this.state);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(prevState, newState) {
    this.listeners.forEach(listener => listener(prevState, newState));
  }
}

// Singleton instance
export const store = new Store();
```

### 3.3 Git Operations Refactoring

Encapsulate Git operations with proper error handling and timeouts:

```javascript
// src/git/commands.js
const { exec } = require('child_process');

const DEFAULT_TIMEOUT = 30000; // 30 seconds

class GitError extends Error {
  constructor(message, code, command) {
    super(message);
    this.name = 'GitError';
    this.code = code;
    this.command = command;
  }
}

async function execGit(command, options = {}) {
  const { timeout = DEFAULT_TIMEOUT, cwd = process.cwd() } = options;

  return new Promise((resolve, reject) => {
    const child = exec(
      command,
      { cwd, timeout },
      (error, stdout, stderr) => {
        if (error) {
          reject(new GitError(
            stderr || error.message,
            error.code,
            command
          ));
        } else {
          resolve(stdout.trim());
        }
      }
    );
  });
}

// src/git/branch.js
class BranchManager {
  constructor(remoteName = 'origin') {
    this.remoteName = remoteName;
  }

  async getCurrentBranch() {
    try {
      return await execGit('git rev-parse --abbrev-ref HEAD');
    } catch (error) {
      if (error.message.includes('HEAD')) {
        return null; // Detached HEAD
      }
      throw error;
    }
  }

  async getAllBranches() {
    const output = await execGit(
      `git for-each-ref --sort=-committerdate --format='%(refname:short)|%(objectname:short)|%(subject)|%(committerdate:iso8601)' refs/heads refs/remotes/${this.remoteName}`
    );

    return this.parseBranchOutput(output);
  }

  async switchTo(branchName) {
    if (!this.isValidBranchName(branchName)) {
      throw new GitError(`Invalid branch name: ${branchName}`);
    }

    await execGit(`git checkout "${branchName}"`);
  }

  // ... other methods
}

export { BranchManager, GitError };
```

### 3.4 Async Utilities

Add proper async control utilities:

```javascript
// src/utils/async.js

/**
 * Simple mutex for preventing concurrent operations
 */
class Mutex {
  constructor() {
    this.locked = false;
    this.queue = [];
  }

  async acquire() {
    return new Promise(resolve => {
      if (!this.locked) {
        this.locked = true;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  release() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next();
    } else {
      this.locked = false;
    }
  }

  async withLock(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

/**
 * Wrap a promise with a timeout
 */
function withTimeout(promise, ms, message = 'Operation timed out') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms)
    )
  ]);
}

/**
 * Retry with exponential backoff
 */
async function retry(fn, { maxAttempts = 3, baseDelay = 1000 } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

export { Mutex, withTimeout, retry };
```

### 3.5 Command Parsing Fix

Fix the naive command splitting:

```javascript
// src/server/process.js

/**
 * Parse a shell command string into command and arguments
 * Handles quoted strings properly
 */
function parseCommand(commandString) {
  const args = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < commandString.length; i++) {
    const char = commandString[i];

    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuotes) {
      inQuotes = false;
      quoteChar = '';
    } else if (char === ' ' && !inQuotes) {
      if (current) {
        args.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current) {
    args.push(current);
  }

  return {
    command: args[0],
    args: args.slice(1)
  };
}
```

---

## 4. Testability Improvements

### 4.1 Current Testing Challenges

1. **Global State**: Cannot isolate tests
2. **No Dependency Injection**: Hard-coded dependencies
3. **Side Effects**: Direct I/O operations mixed with logic
4. **No Seams**: No way to mock external systems

### 4.2 Recommended Test Structure

```
tests/
├── unit/
│   ├── config/
│   │   ├── loader.test.js
│   │   └── schema.test.js
│   ├── git/
│   │   ├── commands.test.js
│   │   └── branch.test.js
│   ├── state/
│   │   └── store.test.js
│   └── utils/
│       ├── async.test.js
│       └── sparkline.test.js
├── integration/
│   ├── git-operations.test.js
│   ├── server-modes.test.js
│   └── polling.test.js
├── e2e/
│   └── cli.test.js
├── fixtures/
│   ├── git-repos/          # Test git repositories
│   └── configs/            # Test config files
└── helpers/
    ├── mockGit.js          # Git command mocking
    ├── mockTerminal.js     # Terminal output capture
    └── testStore.js        # Test state store
```

### 4.3 Making Code Testable

#### 4.3.1 Dependency Injection Pattern

```javascript
// Instead of:
function pollGitChanges() {
  exec('git fetch', ...);  // Hard to test
}

// Use:
class GitPoller {
  constructor(gitCommands, store) {
    this.git = gitCommands;
    this.store = store;
  }

  async poll() {
    const branches = await this.git.getAllBranches();
    this.store.setState({ branches });
  }
}

// In production:
const poller = new GitPoller(new GitCommands(), store);

// In tests:
const mockGit = { getAllBranches: jest.fn().mockResolvedValue([...]) };
const mockStore = { setState: jest.fn() };
const poller = new GitPoller(mockGit, mockStore);
```

#### 4.3.2 Pure Functions for Logic

Extract pure logic that's easy to test:

```javascript
// src/git/branch.js

// Pure function - easy to test
function detectBranchChanges(oldBranches, newBranches) {
  const oldNames = new Set(oldBranches.map(b => b.name));
  const newNames = new Set(newBranches.map(b => b.name));

  return {
    added: newBranches.filter(b => !oldNames.has(b.name)),
    removed: oldBranches.filter(b => !newNames.has(b.name)),
    updated: newBranches.filter(b => {
      const old = oldBranches.find(ob => ob.name === b.name);
      return old && old.commit !== b.commit;
    })
  };
}

// Test:
test('detectBranchChanges identifies new branches', () => {
  const old = [{ name: 'main', commit: 'abc' }];
  const current = [
    { name: 'main', commit: 'abc' },
    { name: 'feature', commit: 'def' }
  ];

  const changes = detectBranchChanges(old, current);

  expect(changes.added).toHaveLength(1);
  expect(changes.added[0].name).toBe('feature');
});
```

#### 4.3.3 Renderer Testing with Snapshots

```javascript
// tests/unit/ui/branchList.test.js
const { renderBranchList } = require('../../../src/ui/components/branchList');

test('renders branch list correctly', () => {
  const mockState = {
    branches: [
      { name: 'main', commit: 'abc123', isCurrent: true },
      { name: 'feature', commit: 'def456', hasUpdates: true }
    ],
    selectedIndex: 0,
    terminalWidth: 80
  };

  const output = renderBranchList(mockState);

  expect(output).toMatchSnapshot();
});
```

### 4.4 Recommended Test Framework

Since the goal is zero external dependencies for production, use Node.js built-in test runner (available in Node 18+):

```javascript
// tests/unit/utils/async.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { Mutex, withTimeout } = require('../../../src/utils/async');

describe('Mutex', () => {
  it('prevents concurrent execution', async () => {
    const mutex = new Mutex();
    const results = [];

    const task = async (id) => {
      await mutex.acquire();
      results.push(`start-${id}`);
      await new Promise(r => setTimeout(r, 10));
      results.push(`end-${id}`);
      mutex.release();
    };

    await Promise.all([task(1), task(2)]);

    assert.deepStrictEqual(results, [
      'start-1', 'end-1', 'start-2', 'end-2'
    ]);
  });
});

describe('withTimeout', () => {
  it('rejects when timeout exceeded', async () => {
    const slowOperation = new Promise(r => setTimeout(r, 1000));

    await assert.rejects(
      withTimeout(slowOperation, 50),
      { message: 'Operation timed out' }
    );
  });
});
```

Add to package.json:

```json
{
  "scripts": {
    "test": "node --test tests/**/*.test.js",
    "test:watch": "node --test --watch tests/**/*.test.js"
  }
}
```

---

## 5. Implementation Roadmap

### Phase 1: Foundation (Low Risk)

**Goal:** Add test infrastructure and utilities without changing existing code.

1. Create `src/` directory structure
2. Add async utilities (`Mutex`, `withTimeout`, `retry`)
3. Add state store class
4. Add test framework and initial tests
5. No changes to `bin/git-watchtower.js`

**Estimated Effort:** Moderate
**Risk:** Very Low (additive only)

### Phase 2: Extract Pure Logic

**Goal:** Extract testable pure functions from monolith.

1. Extract branch change detection logic
2. Extract sparkline generation
3. Extract config validation
4. Extract ANSI/box drawing utilities
5. Write comprehensive unit tests

**Estimated Effort:** Moderate
**Risk:** Low (no behavioral changes)

### Phase 3: Introduce State Store

**Goal:** Replace global variables with centralized store.

1. Create store instance
2. Update render loop to use store
3. Update input handlers to use store actions
4. Update polling to use store
5. Deprecate global variables

**Estimated Effort:** Significant
**Risk:** Medium (core refactor)

### Phase 4: Modularize

**Goal:** Split monolith into modules.

1. Extract Git module
2. Extract Server module
3. Extract UI module
4. Extract Input module
5. Create thin entry point

**Estimated Effort:** Significant
**Risk:** Medium

### Phase 5: Add Integration Tests

**Goal:** Ensure system works as a whole.

1. Create test fixtures (mock git repos)
2. Add CLI integration tests
3. Add server mode tests
4. Add polling integration tests

**Estimated Effort:** Moderate
**Risk:** Low

---

## Appendix A: Quick Wins

Improvements that can be made immediately without major refactoring:

### A.1 Add Operation Timeouts

```javascript
// Wrap exec calls with timeout
function execWithTimeout(command, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const child = exec(command, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve(stdout);
    });

    setTimeout(() => {
      child.kill();
      reject(new Error(`Command timed out: ${command}`));
    }, timeout);
  });
}
```

### A.2 Add Polling Mutex

```javascript
let pollingLock = false;

async function pollGitChanges() {
  if (pollingLock) return;
  pollingLock = true;

  try {
    // ... existing polling logic
  } finally {
    pollingLock = false;
  }
}
```

### A.3 Fix Command Parsing

Replace simple split with proper parsing (see Section 3.5).

### A.4 Standardize Error Handling

Create consistent error handler:

```javascript
function handleError(error, context) {
  const message = error.message || 'Unknown error';

  // Log for debugging
  if (process.env.DEBUG) {
    console.error(`[${context}]`, error);
  }

  // User-facing message
  addLog(`${context}: ${message}`, 'error');

  // Return safe default
  return null;
}
```

---

## Appendix B: Metrics

### Current Code Metrics

| Metric | Value |
|--------|-------|
| Total Lines | ~2,660 |
| Global Variables | 50+ |
| Functions | ~80 |
| Async Functions | ~25 |
| Largest Function | `pollGitChanges` (~200 lines) |

### Target Metrics (Post-Refactor)

| Metric | Target |
|--------|--------|
| Max File Size | <300 lines |
| Max Function Size | <50 lines |
| Global Variables | 0 (use store) |
| Test Coverage | >80% |

---

## Conclusion

Git Watchtower is a well-designed tool that has outgrown its single-file architecture. The recommended refactoring will:

1. **Improve Maintainability**: Clear module boundaries and reduced coupling
2. **Enable Testing**: Dependency injection and pure functions
3. **Reduce Bugs**: Proper async control and error handling
4. **Support Growth**: Easy to add features without touching core code

The refactoring can be done incrementally, with each phase delivering value independently. The key is to start with the foundation (Phase 1) and build up gradually.
