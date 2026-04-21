# Audit Report: stats

## Summary
- **Total findings:** 7 (H: 1, M: 3, L: 3)
- **Top 3 most concerning patterns:**
  1. Parallel implementation: `stats/session.js` exports `recordPoll(hadUpdates)` and `recordChurn(added, deleted)` — `src/casino/index.js` exports an identically-named `recordPoll(hadUpdates)` and maintains its own churn counters. `bin/git-watchtower.js:1898-1907` calls both, consecutively, every poll. Two parallel trackers for the same event is textbook slop.
  2. Module-level mutable state. `sessionStart`, `totalLinesAdded`, etc. are file-scoped `let`s, which means the module is a de-facto singleton and cannot be tested without `reset()`. The `reset()` function at line 95 is explicitly commented "e.g. for testing" — giving up encapsulation to buy testability.
  3. `formatDuration` duplicates work already done elsewhere: `src/utils/time.js` has `formatTimeAgo`, and the UI does its own time formatting in the renderer. Three formatters, three output styles.

## Findings by category

### 1. Copy-paste duplication
- [ ] `src/stats/session.js:30` — `recordPoll(hadUpdates)` has the same signature and purpose as `src/casino/index.js`'s `recordPoll`. They are called back-to-back at `bin/git-watchtower.js:1898-1907`. Parallel implementation of the same concept (high).
- [ ] `src/stats/session.js:57-62` — `formatDuration` overlaps with `src/utils/time.js:formatTimeAgo` and with whatever the renderer uses. Flag for consolidation (medium).

### 2. Silent failures and swallowed exceptions
- _None found._

### 3. Lazy type assertions
- _None found._ (inputs are trusted as numbers; module is internal)

### 4. Promise misuse
- _None found._ (all sync)

### 5. Dead and orphaned code
- [ ] `src/stats/session.js:95-102` — `reset()` is exported but never called outside tests (grep returns zero non-test hits). Expose it only for tests or rename with a `_reset` convention (low).

### 6. Circular imports
- _None found._ (no imports at all)

### 7. Abstractions that abstract nothing
- _None found._ in this file alone, but see the cross-cutting note: the whole module is a thin bag of counters that could be an object created once per session by `bin/git-watchtower.js` instead of a singleton.

### 8. Hardcoded values that should be config
- [ ] `src/stats/session.js:58-59` — magic numbers `3600000` and `60000`. Fine individually, but these same constants reappear in multiple files; a shared `ms.HOUR`/`ms.MINUTE` constant would help (low).

### 9. Stale/deprecated vocabulary
- _None found._

### 10. Observability gaps
- _None found._ (module doesn't log)

### 11. Drift and inconsistency
- [ ] Singleton module state vs. the `Store` pattern used by `src/state/store.js`. The project has two models for "session-scoped mutable data" — a class with injected state for branches and a module-level singleton for stats. Pick one (medium).
- [ ] The `formatDuration(ms)` output format (`1h 5m` / `5m`) differs from whatever the renderer shows elsewhere — audit UI for consistency (low).

## Cross-cutting observations

This module is small and internally clean but participates in the bigger problem: every time git-watchtower poll fires, **three** systems record that poll event (casino counters, session stats, and whatever the renderer tracks). Refactors have added trackers without retiring the old ones. A unified `TelemetryEmitter` / `SessionMetrics` façade would eliminate the parallel implementations across `src/casino/index.js`, `src/stats/session.js`, and whatever the telemetry module does.

## Recommended first 5 tickets

| # | Title | Scope |
|---|-------|-------|
| 1 | Unify `recordPoll` across casino + stats | Decide whether `casino.recordPoll` is a presentation-layer counter or a domain event. If domain event, collapse into `stats/session.js` and have casino consume the stats. Touches `src/casino/index.js`, `src/stats/session.js`, `bin/git-watchtower.js:1898-1907`. |
| 2 | Replace module singleton with `SessionStats` class | Follow the `Store` pattern — export a constructor, instantiate once in `bin/git-watchtower.js`, remove `reset()` from the public surface. Makes testing natural and aligns with `src/state/store.js`. |
| 3 | Consolidate duration/time formatters | Move `formatDuration` out of stats and into `src/utils/time.js`; replace with shared `formatDuration`/`formatTimeAgo` helpers and delete duplicates in the renderer. |
| 4 | Document or delete `reset()` | If only tests use it, add a JSDoc tag `@internal` and/or rename to `_resetForTesting`. If nothing else in the codebase needs it, consider pushing state into the test via a class instead. |
| 5 | Add telemetry hook | With a class, it's trivial to attach `telemetry.capture('poll_complete', stats)` on each `recordPoll`. Today that has to be done in the bin alongside the stats call. |
