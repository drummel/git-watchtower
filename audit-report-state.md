# Audit Report: state

## Summary
- **Total findings:** 16 (H: 2, M: 8, L: 6)
- **Top 3 most concerning patterns:**
  1. **The Store's convenience methods are dead in production.** `setMode`, `flash`, `clearFlash`, `addLog`, `addToHistory`, `setBranches`, `setSelectedIndex`, `moveSelection`, `getSelectedBranch`, `getFilteredBranches`, `addServerLog`, `clearServerLogs`, `setTerminalSize` — none of these appear in `bin/git-watchtower.js`. The bin uses only `store.setState`/`store.get`/`store.getState`, and re-implements the convenience logic inline. This is a textbook abandoned refactor: the Store API was designed but the callers never migrated.
  2. **Duplicate `addServerLog` implementations.** `bin/git-watchtower.js:468-478` has a local `addServerLog` that writes to `serverLogBuffer`; `src/state/store.js:397-405` has a method `addServerLog` that writes to `serverLogs`. These are **two different state fields** (both exist in `getInitialState` at lines 88-89). The bin's version is authoritative in production; the Store's version is dead code.
  3. **Two parallel server-log fields in state.** The typedef, `getInitialState`, and the Store methods all reference both `serverLogs` (legacy per the doc comment) and `serverLogBuffer`. Classic "we renamed something but didn't delete the old version" smell.

## Findings by category

### 1. Copy-paste duplication
- [ ] `src/state/store.js:397-405` and `bin/git-watchtower.js:468-478` — two `addServerLog` functions with near-identical shape but different target fields (`serverLogs` vs `serverLogBuffer`) and different max-lines defaults (500 vs `MAX_SERVER_LOG_LINES`) (high).
- [ ] `src/state/store.js:356-360` (`addLog`) is duplicated inline in `bin/git-watchtower.js:1004-1024` as a local `addLog` function (medium).
- [ ] Selection clamping at `src/state/store.js:436-441` and `src/state/store.js:472` is duplicated between `setBranches` and `setSelectedIndex`. Extract a `clampIndex` helper (low).

### 2. Silent failures and swallowed exceptions
- [ ] `src/state/store.js:286-294` — `notify` wraps each listener in try/catch and logs `'Store listener error:'` with the error. This is reasonable for isolating listeners but the log is unstructured (no listener identity, no previous/new state context). When this fires in production you will not know which subscriber failed (medium — see Observability Gaps).
- [ ] `src/state/store.js:420-423` — `setBranches` silently returns on non-array input after logging with `console.error`. A thrown `TypeError` would surface the bug faster (low).
- [ ] `src/state/store.js:457-459` — same story for `setSelectedIndex` NaN input (low).

### 3. Lazy type assertions
- [ ] `src/state/store.js:265` — `// @ts-ignore - changedKeys are always valid State keys` has a comment, which is the preferred pattern per the audit rules — but the comment is asserting something the compiler can't check. Consider typing `changedKeys` as `(keyof State)[]` on `subscribe` to remove the need for the ignore (low).

### 4. Promise misuse
- _None found._ (Store is synchronous.)

### 5. Dead and orphaned code
- [ ] `src/state/store.js:531-533` — `createStore(initialState)` is exported and re-exported via `src/index.js:72` but has **zero** callers outside that re-export. `new Store()` is used directly in `bin/git-watchtower.js:100`. Factory abstracts nothing (medium).
- [ ] `src/state/store.js:115` — `getInitialState` is exported and re-exported but only used internally by the Store constructor and `reset()`. No external callers (medium).
- [ ] `src/state/store.js:262-270` (`subscribeToKeys`) — exported via the class but zero callers outside tests (low).
- [ ] `src/state/store.js:276-278` (`use(middleware)`) — middleware array is set up with full machinery (lines 208, 237-240) but no caller ever registers a middleware. Dead feature (medium).
- [ ] `src/state/store.js:314-330` (`setMode`) — not called anywhere in bin. UI-mode transitions are done via scattered boolean flags (`searchMode`, `previewMode`, etc.) in direct `setState` calls. Dead method (medium).
- [ ] `src/state/store.js:337-348` (`flash` / `clearFlash`) — bin uses `store.setState({ flashMessage: ... })` at `bin/git-watchtower.js:1367,1371` instead. Dead (medium).
- [ ] `src/state/store.js:368-372` (`addToHistory`) — not called in bin. Dead (medium).
- [ ] `src/state/store.js:418-448` (`setBranches`) — not called in bin. Dead (medium).
- [ ] `src/state/store.js:454-477` (`setSelectedIndex`) — not called in bin. Dead (medium).
- [ ] `src/state/store.js:483-489` (`moveSelection`) — not called in bin. Dead (low).
- [ ] `src/state/store.js:495-511` (`getSelectedBranch` / `getFilteredBranches`) — not called in bin (low).

### 6. Circular imports
- _None found._ (store.js has no imports.)

### 7. Abstractions that abstract nothing
- [ ] `src/state/store.js:531-533` — `createStore` is a pass-through factory over `new Store(...)`. No benefit (medium).
- [ ] `src/state/store.js:208, 237-240, 276-278` — the entire middleware machinery: pipeline wired up, zero consumers. Delete or use it (medium).

### 8. Hardcoded values that should be config
- [ ] `src/state/store.js:159` — `adaptivePollInterval: 5000` magic number, duplicates the schema's `gitPollInterval` default. If the user configures a different poll interval, the initial `adaptivePollInterval` will not reflect it (medium).
- [ ] `src/state/store.js:169-170` — `process.stdout.columns || 80` and `process.stdout.rows || 24` — the fallback size is duplicated elsewhere in the codebase. Extract a constant (low).
- [ ] `src/state/store.js:173-175` — `visibleBranchCount: 7`, `soundEnabled: true`, `casinoModeEnabled: false` all duplicate the schema DEFAULTS. If DEFAULTS change, this will silently drift (medium).
- [ ] `src/state/store.js:185-186` — `port: 3000`, `maxLogEntries: 10` — same drift story (low).
- [ ] `src/state/store.js:354, 366, 395` — default `maxEntries` / `maxLines` params (10, 20, 500) duplicate the `MAX_LOG_ENTRIES`/`MAX_HISTORY`/`MAX_SERVER_LOG_LINES` constants in bin. Pick one source of truth (medium).

### 9. Stale/deprecated vocabulary
- [ ] `src/state/store.js:61` — JSDoc: `mode: UIMode - Current UI mode (legacy)`. The comment admits `mode` is legacy but the field is still there, still set (line 127 `mode: 'normal'`), and `setMode` still checks it. Finish removing it (medium).
- [ ] `src/state/store.js:88` — JSDoc: `serverLogs: ServerLogEntry[] - Server log buffer (legacy)`. Admitted-legacy field, still present (high — schedule for deletion).
- [ ] `src/state/store.js:504-511` — `getFilteredBranches` checks BOTH `searchMode` and `mode === 'search'`. The dual check is a bandage around the in-progress mode migration (low).

### 10. Observability gaps
- [ ] `src/state/store.js:291` — `console.error('Store listener error:', error)` prints the error but not which listener or what state key triggered the notify. Add `{ changedKeys, listenerIndex }` context (medium).
- [ ] `src/state/store.js:421, 458` — `console.error('Store.setBranches: expected array, got', typeof branches)` — better than nothing, but logs a string + string; no stack, no caller info. Use `new TypeError(...)` or structured logger (low).

### 11. Drift and inconsistency
- [ ] `serverLogs` vs `serverLogBuffer` — two fields for the same concept (high; see top finding).
- [ ] UI-mode: `mode` enum field vs individual boolean flags (`searchMode`, `previewMode`, `historyMode`, `infoMode`, `logViewMode`, `actionMode`, `stashConfirmMode`) — two parallel mode systems (medium).
- [ ] `setState` direct usage (in bin) vs convenience methods (dead) — two styles of interacting with the Store, and only one is actually used (medium).

## Cross-cutting observations

This module is the smoking gun for "abstraction that abstracts nothing plus an abandoned migration." `Store` was clearly meant to own state mutations via typed helper methods — `flash`, `setMode`, `addLog`, `setBranches`, etc. — but nobody ported `bin/git-watchtower.js` to use them. The result is a large, well-documented class whose public API is ~60% dead code, while the bin directly manipulates state fields (including a field `serverLogBuffer` that the Store doesn't even know about).

The comments `(legacy)` in the typedef are literally markers of an in-progress refactor that stalled. Every method that isn't called externally has a partner implementation in the bin.

The middleware hook is the most extreme example: the class has a pipeline, middleware array, and a `use()` registration method, but nothing ever calls `use()`. That is pure infrastructure with no consumer.

## Recommended first 5 tickets

| # | Title | Scope |
|---|-------|-------|
| 1 | Collapse `serverLogs` and `serverLogBuffer` | Decide which field wins, update the Store method, the typedef, the `getInitialState` defaults, and the bin's inline `addServerLog`. Delete the loser. This is the most dangerous inconsistency in state — two code paths write to two different buffers, and the renderer reads from only one. |
| 2 | Migrate bin to Store convenience methods (or delete them) | For each of `flash`, `addLog`, `addServerLog`, `setBranches`, `setSelectedIndex`, pick: either replace the bin's inline version with the Store method, or delete the Store method. Either way, stop maintaining two parallel implementations. |
| 3 | Delete dead `createStore` factory and `getInitialState` export | `createStore` has zero external callers. Export the `Store` class and let callers do `new Store()`. Remove `getInitialState` from the public surface (it's internal). |
| 4 | Rip out the middleware pipeline | `use()`, the `middlewares` array, and the middleware loop in `setState` — all dead infrastructure. Delete unless there is a concrete use case in the next two weeks. |
| 5 | Pick one UI-mode model | Decide: is `state.mode` the canonical UI mode (string enum) or is it the per-feature booleans? Finish the migration and delete the loser. This is a precondition to making `setMode` safe to use again. |
