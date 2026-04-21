# Audit Report: polling

## Summary

- **Total findings:** 18 (H: 5, M: 8, L: 5)
- **Top 3 most concerning patterns:**
  1. **Massive copy/paste duplication** between `src/polling/engine.js` and `bin/git-watchtower.js`. Six of the seven exported engine functions (`detectNewBranches`, `detectDeletedBranches`, `detectUpdatedBranches`, `sortBranches`, `calculateAdaptiveInterval`, `restoreSelection`) have full inline re-implementations in `bin/git-watchtower.js` — only `pruneStaleEntries` is actually consumed. The module was extracted but never integrated.
  2. **Silent drift** between the two implementations. The engine's `sortBranches` has a `(b.date || 0) - (a.date || 0)` NaN guard referenced by `CHANGELOG.md:125` ("handle missing dates in sortBranches to prevent NaN comparisons"); the live inline copy in `bin/git-watchtower.js:1926` still reads `return b.date - a.date` — the bug fix only landed in dead code.
  3. **Hard-coded magic numbers duplicated in two places.** `30000`, `15000`, `5000`, `60000` appear both in the engine (`calculateAdaptiveInterval`) and in the inline branch in `bin/git-watchtower.js:1754–1772`, and `NEW_BADGE_TTL` / `retentionMs` both default to 30000 without a shared constant.

## Findings by category

### 1. Copy-paste duplication

- **H — `detectNewBranches` inlined.** `bin/git-watchtower.js:1786–1802` re-implements `src/polling/engine.js:14–25` (adds a small TTL-preservation branch, but the "detect new" logic is the same). The import is never pulled in.
- **H — `detectDeletedBranches` inlined.** `bin/git-watchtower.js:1804–1824` mirrors `src/polling/engine.js:34–48` with minor behavioral drift (the inline version pushes `existingInList` back into `allBranches`, the engine does not). Both can't be the intended contract.
- **H — `detectUpdatedBranches` inlined.** `bin/git-watchtower.js:1841–1856` is a near-line-for-line copy of `src/polling/engine.js:57–70`. The only differences are `addLog` side-effects and storing the commit in `previousBranchStates`.
- **H — `sortBranches` inlined.** `bin/git-watchtower.js:1915–1927` duplicates `src/polling/engine.js:78–92`. See Drift (§11) for the NaN bug that was only fixed in the engine version.
- **H — `calculateAdaptiveInterval` inlined.** `bin/git-watchtower.js:1754–1772` duplicates `src/polling/engine.js:101–124` with its own thresholds and its own warning state (`slowFetchWarningShown`, `verySlowFetchWarningShown` at `bin/git-watchtower.js:797–798`). Engine's return shape (`{ interval, warning }`) is not consumed anywhere.
- **M — `restoreSelection` inlined.** `bin/git-watchtower.js:1910–1946` reimplements `src/polling/engine.js:133–150`. Same shape, same semantics; the engine function is never called.

### 2. Silent failures / swallowed exceptions

- **M — Orphaned poll-side promise chains swallow all errors.** `bin/git-watchtower.js:1960–1962` (`.catch(() => { prStatusFetchInFlight = false; })` — resets state but logs nothing), `bin/git-watchtower.js:1966` (`fetchAheadBehindForBranches(...).catch(() => {})`). Repeated failures during polling are invisible to the user.
- **L — Shutdown cascade swallows.** `bin/git-watchtower.js:3443` (`try { clearTimeout(pollIntervalId); } catch (_) { /* ignore */ }`). Acceptable here but typical of the `catch(_) { /* ignore */ }` pattern scattered through the file (see also 3436–3477).
- **Observation:** the engine itself has no try/catch (pure functions) — the silent-failure surface is all in the inline polling loop.

### 3. Lazy type assertions

- **M — `pruneStaleEntries` retentionMs default is silently coerced.** `src/polling/engine.js:164` — `retentionMs = 30000` is fine, but `now ?? Date.now()` at line 165 accepts `0`, `NaN`, strings; no validation. Tests pass `now: 100000` as a plain number; production passes `Date.now()`. A caller passing a `Date` object would produce `NaN` arithmetic at line 171.
- **L — `calculateAdaptiveInterval` accepts NaN freely.** `src/polling/engine.js:101` — no validation that `fetchDuration`, `currentInterval`, `baseInterval` are finite numbers. A `NaN` fetch duration would drop through to the `warning: null` branch and freeze the adaptive logic silently.
- **L — `sortBranches` assumes `.date` is numeric.** `src/polling/engine.js:90` — `(b.date || 0) - (a.date || 0)` works if `.date` is a number, but tests at `tests/unit/polling/engine.test.js:126` pass `new Date(...)` objects, which subtract correctly only because of implicit `valueOf()`. Contract ambiguity.
- **L — `detectNewBranches` mutates input and trusts shape.** `src/polling/engine.js:19–20` — sets `branch.isNew` / `branch.newAt` on every new branch. JSDoc marks these optional (`?`), but the function assumes `branch` is a plain, extensible object; frozen objects would throw.

### 4. Promise misuse

- **M — `setTimeout(async () => ...)` recurring scheduler.** `bin/git-watchtower.js:2103–2108` (`schedulePoll`): passes an async function into `setTimeout` and `await`s `pollGitChanges()`, then recurses. Acceptable pattern (avoids overlap), but nothing in the engine helps express it — if `pollGitChanges` rejects synchronously before its own try/catch, the rejection is unhandled.
- **L — `restartPolling` doesn't cancel an already-running callback.** `bin/git-watchtower.js:2111–2117` clears the pending `setTimeout`, but an in-flight `await pollGitChanges()` will still call `schedulePoll()` again (the comment at `2098–2101` even acknowledges this). There's a guard (`isShuttingDown`) but not a `isRestarting` guard, so a double-schedule is theoretically possible.
- **L — No `Promise.allSettled` where orphan fire-and-forget is used.** `bin/git-watchtower.js:3655–3669, 3740` chain `.catch(() => {})` on independent promises; `Promise.allSettled` would at least preserve per-task errors for logging.

### 5. Dead and orphaned code

- **H — Six of seven engine exports are unused in production.** Only `pruneStaleEntries` is imported by `bin/git-watchtower.js:86`. `detectNewBranches`, `detectDeletedBranches`, `detectUpdatedBranches`, `sortBranches`, `calculateAdaptiveInterval`, `restoreSelection` are exercised only by `tests/unit/polling/engine.test.js`. Cross-checked via grep across `src/`, `bin/`, `tests/`.
- **L — `isBaseBranch` import.** `src/polling/engine.js:6` only feeds `sortBranches`, which is itself unused — effectively dead at runtime.

### 6. Circular imports

- **None found.** `src/polling/engine.js` imports only `src/git/pr.js`, which has no `require` edges back into `polling` (`src/git/pr.js:100` defines `isBaseBranch` locally with no external deps). No cycles.

### 7. Abstractions that abstract nothing

- **M — `schedulePoll` / `restartPolling` split.** `bin/git-watchtower.js:2097–2117` — `restartPolling` is a one-line clearTimeout + `schedulePoll()`. Because the engine owns none of the scheduling, these two functions are the only "abstraction" and they still live in the 3763-line bin file. Good candidate for extraction into the engine.
- **L — `calculateAdaptiveInterval` returns a `{ interval, warning }` shape no caller uses.** `src/polling/engine.js:101–124`. The "warning" string enum (`very_slow`, `slow`, `restored`) adds ceremony but the inline caller at `bin/git-watchtower.js:1754–1772` emits its own log strings instead.

### 8. Hardcoded values

- **H — Duplicated thresholds across engine and bin.**
  - `30000` ms (very-slow fetch): `src/polling/engine.js:102` and `bin/git-watchtower.js:1754`.
  - `60000` ms (max cap): `src/polling/engine.js:104` and `bin/git-watchtower.js:1758`.
  - `15000` ms (slow warning): `src/polling/engine.js:108` and `bin/git-watchtower.js:1761`.
  - `5000` ms (restore threshold): `src/polling/engine.js:114` and `bin/git-watchtower.js:1764`.
  - `30000` ms (`retentionMs` default AND `NEW_BADGE_TTL`): `src/polling/engine.js:164` and `bin/git-watchtower.js:1785`. Two semantically distinct 30s windows; easy to desync.
- **M — No named constants.** Every threshold is an anonymous literal; no `const SLOW_FETCH_MS = 15_000` in either module.
- **L — `GIT_POLL_INTERVAL` default only lives in the bin.** `bin/git-watchtower.js:386,439` — the engine's `baseInterval` parameter has no default and no sentinel.

### 9. Stale/deprecated vocabulary

- **L — "known"/"fetched" naming is ambiguous.** `knownBranchNames` vs `fetchedBranchNames` reads like tense drift: both describe branch sets, one means "seen previously" and one means "in the latest fetch". Comments at `src/polling/engine.js:30,34–47` help, but the names don't.
- **L — `justUpdated`, `isNew`, `isDeleted` booleans are stored on branch objects and mutated across calls.** The engine treats branches as mutable state containers (`src/polling/engine.js:19–20, 41–42, 61, 65`); comments like "Clear previous cycle's flag" hint that these are poll-cycle transients, but the shape is shared with branch-fetch code. No "poll state" type boundary.

### 10. Observability gaps

- **M — Poll failures logged without context.** `bin/git-watchtower.js:2088` (`addLog(`Polling error: ${errMsg}`, 'error')`) — no branch name, no last-success timestamp, no current adaptive interval, no failure count. Engine has no hooks for observability either.
- **M — Adaptive-interval transitions emit inconsistent logs.** `bin/git-watchtower.js:1755,1762,1770` — the "increased" log includes seconds, the "slow warning" log does not, and the "restored" log is only emitted when returning to base. Engine's `warning: 'very_slow' | 'slow' | 'restored'` enum suggests a unified structured event — unused.
- **M — `pruneStaleEntries` returns `string[]` but caller ignores it.** `bin/git-watchtower.js:1828–1834` — the pruned branch names are never logged; if the prune loop ever misbehaves (e.g. evicts live branches) there is no trace.
- **L — `lastFetchDuration` is stored but never surfaced on error.** `bin/git-watchtower.js:1750–1751` — good signal, but the catch block at 2053–2089 doesn't include it in any error log or error toast.

### 11. Drift and inconsistency

- **H — `sortBranches` NaN-guard drift.** Engine: `(b.date || 0) - (a.date || 0)` at `src/polling/engine.js:90`. Bin: `b.date - a.date` at `bin/git-watchtower.js:1926`. `CHANGELOG.md:125` references a fix for this exact bug ("handle missing dates in sortBranches to prevent NaN comparisons"). The fix landed in the unused extracted copy, not in production.
- **M — `detectDeletedBranches` semantic drift.** Engine at `src/polling/engine.js:34–48` only toggles `isDeleted` on existing entries and returns them; the inline copy at `bin/git-watchtower.js:1804–1824` additionally skips work if the branch is `alreadyInList` and re-pushes to `allBranches`. Behavior isn't identical.
- **M — `detectNewBranches` semantic drift.** Inline copy (`bin/git-watchtower.js:1794–1799`) preserves the `isNew` flag for 30s across polls; engine (`src/polling/engine.js:14–25`) does not. Tests for the engine lock in behavior that production doesn't use.
- **L — Engine exports in one order, tests import in the same order — but the bin imports only one.** Minor, but it signals the module has no single owner.

## Cross-cutting observations

- The polling engine appears to be a **partially-completed refactor**. Someone extracted pure logic into `src/polling/engine.js` and wrote thorough tests, but only wired `pruneStaleEntries` back into the bin. The rest of the 3700-line bin still runs its own near-identical polling flow inline. This is the single biggest source of slop in the file: the dead exports give a false sense of modularity and actively hide bugs (the NaN fix).
- The scheduler (`schedulePoll` / `restartPolling`) does not live in the engine at all — so the engine is "pure branch-diff helpers" by accident, not by design. There is no test for the actual polling cadence or the adaptive interval transitions in production code.
- Error handling is structurally siloed: the engine throws nothing, the bin swallows everything. Neither side logs structured context (branch, interval, duration, last-success).
- The engine file uses JSDoc well, which makes the duplication easier to spot — but the types on `branch` objects (`isNew?`, `isDeleted?`, `justUpdated?`, `newAt?`, `deletedAt?`) have grown organically. No single source of truth for "branch".

## Recommended first 5 tickets (impact-to-effort ranking)

| # | Title | Scope |
|---|-------|-------|
| 1 | Replace inline poll logic in `bin/git-watchtower.js` with engine imports | Swap `bin/git-watchtower.js:1784–1856, 1915–1946` to call `detectNewBranches`, `detectDeletedBranches`, `detectUpdatedBranches`, `sortBranches`, `restoreSelection`. Preserve `isNew` TTL and addLog side-effects by returning deltas from engine and logging in bin. Ships the NaN fix (CHANGELOG.md:125) to production. |
| 2 | Replace inline adaptive-interval math with `calculateAdaptiveInterval` | Replace `bin/git-watchtower.js:1754–1772` with a call to `calculateAdaptiveInterval`; map `warning` enum to existing `addLog` strings. Removes duplicated `30000/15000/5000/60000` literals and the two module-level `*WarningShown` flags (`bin/git-watchtower.js:797–798`). |
| 3 | Extract named constants into `src/polling/constants.js` | Centralize `DEFAULT_POLL_INTERVAL_MS`, `SLOW_FETCH_MS`, `VERY_SLOW_FETCH_MS`, `FAST_FETCH_MS`, `MAX_POLL_INTERVAL_MS`, `NEW_BADGE_TTL_MS`, `DELETED_RETENTION_MS`, `PR_STATUS_POLL_INTERVAL_MS`. Import from both engine and bin. Disambiguate the two 30s windows. |
| 4 | Add structured poll-failure observability | In the `catch` at `bin/git-watchtower.js:2053–2089`, include `{ branch: currentBranch, interval: adaptivePollInterval, lastFetchDuration, consecutiveNetworkFailures }` in the log. Log `pruneStaleEntries` return value when non-empty. Replace orphan `.catch(() => {})` at 1960–1966 with scoped, logged handlers. |
| 5 | Move `schedulePoll` / `restartPolling` into `src/polling/scheduler.js` with tests | Extract the setTimeout-recursion pattern (`bin/git-watchtower.js:2097–2117`), take `getInterval`, `onTick`, `shouldStop` callbacks; add unit tests for cadence, cancel, and no-overlap behavior. Removes "abstraction that abstracts nothing" #7 and gives the polling area a complete boundary. |
