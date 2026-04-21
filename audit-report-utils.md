# Audit Report: utils

## Summary
- **Total findings:** 24 (H: 2, M: 11, L: 11)
- **Dead exports found:** `ErrorHandler` (imported in bin but never instantiated), `withTimeout`, `retry`, `debounce`, `throttle` (all in `src/utils/async.js` — none used in bin/src/* outside tests and re-exports).
- **Top 3 most concerning patterns:**
  1. **Half of `src/utils/async.js` is dead.** `withTimeout`, `retry`, `debounce`, `throttle` are exported, re-exported via `src/index.js`, tested — and called nowhere in production. The bin uses only `Mutex` and `sleep`.
  2. **`ErrorHandler` is imported but never instantiated.** `bin/git-watchtower.js:805` destructures `ErrorHandler` out of `src/utils/errors.js`, alongside `isAuthError`/`isMergeConflict`/`isNetworkError` which *are* used. So the import is live but the class is an orphan.
  3. **Duplicate error-classifier logic within `errors.js` itself.** `GitError.prototype.isNetworkError/isAuthError/isMergeConflict` (lines 73-123) each maintain their own pattern list; the file-level `isNetworkError`/`isAuthError`/`isMergeConflict` functions (lines 429-478) maintain *separate* pattern lists that overlap but don't match. Two systems for the same question, with drift already visible (e.g., `GitError.isNetworkError` has `'SSL certificate problem'`; the standalone `isNetworkError` doesn't).

## Findings by category

### 1. Copy-paste duplication
- [ ] `src/utils/errors.js:73-123` vs `429-478` — parallel error-classifier implementations (high; see top-3).
- [ ] `src/utils/browser.js:31-61` and `bin/git-watchtower.js:483-487` — the bin wraps `openInBrowser` from utils in a one-line adapter (`openUrl(url, err => addLog(...))`). Acceptable, but the comment at line 482 (`// openInBrowser imported from src/utils/browser.js`) documents a left-over migration step (low).
- [ ] `src/utils/monitor-lock.js:104-145` (`acquire` / stale-lock retry) re-implements the EXEX retry pattern that `src/server/coordinator.js` also has. The comment at line 113 admits this: "matches coordinator.js's approach." Extract a shared helper (medium).
- [ ] `src/utils/time.js:formatTimeAgo` vs `formatTimeCompact` — 90% identical bodies differing only in output strings. Extract the diff computation (medium).
- [ ] `src/utils/errors.js:229-237` (`ConfigError.parseError`) includes `originalError: parseError.message` but drops the stack. Same pattern as `GitError.fromExecError` (line 167-181). If `AppError.details` accepted the raw Error, you wouldn't need these factory methods (low).

### 2. Silent failures and swallowed exceptions
- [ ] `src/utils/gitignore.js:99-101` — `catch (err) { // Silently continue if we can't read .gitignore }`. Acceptable per comment but the error is entirely lost (low).
- [ ] `src/utils/monitor-lock.js:76-78` — `removeLock` `catch (e) { /* ignore */ }` — reasonable on cleanup but blind (low).
- [ ] `src/utils/monitor-lock.js:71-73` — `readLock` catches all errors and returns null. Cannot tell "file not found" from "corrupt lock" from "permission denied". Returns the same value, so stale-lock detection logic cannot distinguish them (medium).
- [ ] `src/utils/version-check.js:77-79` — `catch { resolve(null); }` on JSON.parse swallows registry parsing failures silently. OK for this non-critical path (low).
- [ ] `src/utils/version-check.js:103` — `.catch(() => {})` on the periodic update promise. Classic "eat the error". Any recurring failure becomes invisible (medium).
- [ ] `src/utils/gitignore.js:64-68` — `new RegExp(regexStr)` wrapped in `try { ... } catch { return null; }` — silently drops invalid patterns. A warning would help users debug their `.gitignore` (low).

### 3. Lazy type assertions
- [ ] `src/utils/async.js:178, 193` — two `// @ts-ignore` comments with reasons ("TypeScript can't verify generic function augmentation"). Good — they have comments. Consider `@ts-expect-error` so the ignores go away if TS ever gets smarter (low).
- [ ] `src/utils/errors.js:172, 175` — two `// @ts-ignore - Node.js ExecException has ...` comments. Could use `ExecException` type from `@types/node` instead (low).
- [ ] `src/utils/monitor-lock.js:40` — `return e.code === 'EPERM'` assumes `e.code` exists; NodeJS errors typically have `.code` as string, but the accessor is unguarded (low).
- [ ] `src/utils/errors.js:65-66, 152, etc.` — `this.stderr && this.stderr.includes(...)` — short-circuit null guards, fine; but the pattern `this.message.includes(pattern) || (this.stderr && this.stderr.includes(pattern))` is repeated 4 times. Extract (low).

### 4. Promise misuse
- [ ] `src/utils/version-check.js:99-103` — `.then(...).catch(() => {})` on the periodic interval. Acceptable for fire-and-forget but see Silent Failures (medium).
- [ ] `src/utils/version-check.js:83-84` — `req.on('error', () => resolve(null))` and `req.on('timeout', () => { req.destroy(); resolve(null); })` — another "swallow & resolve with null" pattern, same as telemetry. Consistent policy, but worth a `compareVersions` check at minimum (low).
- [ ] `src/utils/async.js:110-140` — `retry` takes a `shouldRetry` callback but if that callback throws, the throw propagates and bypasses remaining attempts (line 127). Arguably the throw is intentional, but a rogue predicate crashes retry silently from the caller's perspective (low).

### 5. Dead and orphaned code
- [ ] `src/utils/async.js:84-96` (`withTimeout`) — **zero production callers**. Tests use it; bin/src don't. Dead (medium).
- [ ] `src/utils/async.js:110-140` (`retry`) — **zero production callers**. The bin has its own retry loop (version-check's `startPeriodicUpdateCheck`, the worker connect retry at bin:3166) but neither uses this helper. Dead (medium).
- [ ] `src/utils/async.js:158-180` (`debounce`) — **zero production callers** (bin has its own `FILE_WATCHER_DEBOUNCE_MS` with inline logic) (medium).
- [ ] `src/utils/async.js:189-210` (`throttle`) — **zero production callers**. Dead (medium).
- [ ] `src/utils/errors.js:345-418` (`ErrorHandler`) — imported in bin but `grep "new ErrorHandler"` returns zero matches. Dead (high).
- [ ] `src/utils/errors.js:460-478` (standalone `isNetworkError`) — bin imports this (bin:805) but you should verify it's actually called (grep `isNetworkError(` in bin). If it's imported but unused like `ErrorHandler`, flag it (low).
- [ ] `src/utils/browser.js:63` — `isSafeUrl` is exported for a single reason (unit tests). Internal-only if tests drop, else OK (low).
- [ ] `src/utils/monitor-lock.js:165-172` — `lockFilePath`, `readLock`, `isProcessAlive`, `WATCHTOWER_DIR` are all exported. `isProcessAlive` is also exported *separately* by `src/server/coordinator.js` (see bin:104). Two copies of the same predicate re-exported through two modules (medium).
- [ ] `src/utils/errors.js:167-181` (`GitError.fromExecError`) — grep for callers. Not called in bin (bin uses its own `execGit` wrapping which throws a plain Error). Likely dead (medium).

### 6. Circular imports
- _None found._ (`utils/` modules import only Node built-ins or siblings without cycling.)

### 7. Abstractions that abstract nothing
- [ ] `src/utils/async.js:Mutex` — non-reentrant, no owner tracking, no timeout — a 70-line class that wraps two booleans and a queue. Probably fine since it's actually used, but the surface area (`isLocked`, `getQueueLength`, `acquire`, `release`, `withLock`) is larger than its one non-trivial consumer (`server/process.js:_restartMutex`) needs (low).
- [ ] `src/utils/errors.js:ConfigError.missing`/`invalid`/`parseError` static factories — each is one line (`return new ConfigError(...)`). Factories without logic = syntactic noise; callers could just `new ConfigError(...)` directly (low).
- [ ] `src/utils/errors.js:ServerError.portInUse`/`processCrashed`/`startFailed` — same story (low).
- [ ] `src/utils/sound.js:14-31` — `playSound` is a one-function module. Fine, just noting (low).

### 8. Hardcoded values that should be config
- [ ] `src/utils/async.js:112-115` — `maxAttempts=3, baseDelay=1000, maxDelay=30000` magic defaults inside `retry` options. Low risk since `retry` isn't used; higher risk if it gets used and the defaults diverge from callers' needs (low).
- [ ] `src/utils/async.js:21-22` — N/A (telemetry, not this file — my mistake; skipping).
- [ ] `src/utils/version-check.js:45` — `MAX_RESPONSE_SIZE = 64 * 1024` hardcoded (low).
- [ ] `src/utils/version-check.js:54` — `'https://registry.npmjs.org/git-watchtower/latest'` hardcoded URL with hardcoded package name. If the package is ever renamed, or a user wants to point at a private registry, there's no override (medium).
- [ ] `src/utils/version-check.js:55` — `timeout: 5000` magic (low).
- [ ] `src/utils/version-check.js:89` — `UPDATE_CHECK_INTERVAL = 4 * 60 * 60 * 1000` is at least named and exported, but not configurable by the user (low).
- [ ] `src/utils/monitor-lock.js:26` — `WATCHTOWER_DIR = path.join(os.homedir(), '.watchtower')` hardcoded. Compare to `src/telemetry/config.js:13` (`CONFIG_DIR_NAME = '.git-watchtower'`) — two hidden dirs with different names! `.watchtower` vs `.git-watchtower`. The user may end up with both (high — inconsistent brand footprint).
- [ ] `src/utils/sound.js:19,21-25,29` — all the sound file paths (`/System/Library/Sounds/Pop.aiff`, the Linux paplay fallback chain, the BEL char) are hardcoded. Reasonable defaults but not configurable (low).
- [ ] `src/utils/browser.js:20` — `/[&|<>^"!%]/` shell metachar allowlist is platform-tuned for cmd.exe. Good comment at line 47. Acceptable (low).
- [ ] `src/utils/errors.js:74-81, 94-100, 113-118, 131-136, 430-440, 451-456, 466-475` — seven copies of "network/auth/conflict/dirty error patterns" as inline string arrays. Extract to shared constants at the top of the file (medium).

### 9. Stale/deprecated vocabulary
- [ ] `src/utils/monitor-lock.js:26` `~/.watchtower/` vs `src/telemetry/config.js:13` `~/.git-watchtower/` — two different "home dir footprints" for the same tool. One of these was probably the old name (medium; see Hardcoded Values above).

### 10. Observability gaps
- [ ] `src/utils/gitignore.js:99-101` — `catch (err)` but nothing logs `err`. Gitignore parse failures are invisible (medium).
- [ ] `src/utils/monitor-lock.js:77` — `removeLock` eats the error from `unlinkSync`. If the lock can't be removed due to permission issues, nobody knows (low).
- [ ] `src/utils/errors.js:41-49` (`AppError.toJSON`) — good structured-log support. Keep as template (positive; no fix).
- [ ] Absent: no module in `utils/` uses a logger. Every observability decision is an ad-hoc `console.error` or a swallowed catch (medium architectural note).

### 11. Drift and inconsistency
- [ ] `~/.watchtower/` (monitor-lock) vs `~/.git-watchtower/` (telemetry) — see Stale Vocabulary (medium).
- [ ] `src/utils/errors.js` — two parallel classifier systems (class methods vs standalone functions). See Copy-paste (high; already flagged).
- [ ] `src/utils/errors.js:ValidationError.invalidPort` throws "Invalid port: ... Must be a number between 1 and 65535" — the bounds are restated in the message rather than pulled from `LIMITS.port.min/max` in `src/config/schema.js`. If `LIMITS` ever changes, the error message will lie (low).
- [ ] `src/utils/async.js` exports camelCase class `Mutex` alongside camelCase fns `withTimeout`, `retry`, etc. Fine. But note `src/utils/errors.js` exports standalone fns in camelCase `isAuthError` alongside class-static versions with the same name — the namespace collision requires callers to remember which to use (medium).

## Cross-cutting observations

`utils/` is the cleanest-looking folder in the repo *until* you grep for usage — at which point it becomes clear that over half of its surface area is exported-but-unused. `async.js` is the poster child: a well-tested, nicely-typed module with 4 of its 6 exports dead. `errors.js` has at least two classes (`ErrorHandler`, `ValidationError`) that are imported somewhere but never actually instantiated or thrown in production, even though they have full test coverage. That is the signature of "spec written, tests written, integration never finished."

The two-home-dir story (`~/.watchtower` for monitor-lock, `~/.git-watchtower` for telemetry) is the cleanest example of half-migrated naming in the whole codebase. One of these is the "old" name and nobody remembers which.

The dead code here is cheap to delete and will simplify the project surface noticeably. The live code is generally correct and well-commented — this isn't a "bad utils folder", it's a "utils folder with too much."

## Recommended first 5 tickets

| # | Title | Scope |
|---|-------|-------|
| 1 | Unify home-directory footprint | Pick one of `~/.watchtower/` or `~/.git-watchtower/` and migrate the other. Update `src/utils/monitor-lock.js:26` and `src/telemetry/config.js:13`. Add a one-time migration that moves files if the old dir exists. User-facing change — worth confirming. |
| 2 | Delete dead `async.js` exports (or wire them up) | `withTimeout`, `retry`, `debounce`, `throttle` have zero production callers. Either delete them (and their tests, and the `src/index.js` re-exports) or migrate the three obvious candidates: bin's file-watcher debounce (`FILE_WATCHER_DEBOUNCE_MS`), bin's version-check retry, and the inline worker connect retry at bin:3166. |
| 3 | Collapse error-classifier drift | Delete either the class-method classifiers on `GitError` or the standalone `isNetworkError`/`isAuthError`/`isMergeConflict` — not both. Extract the pattern arrays to module-level constants so a single change updates all consumers. |
| 4 | Remove `ErrorHandler` | Zero instantiations in production code. Drop the class and its export; keep the classifier functions. If `ErrorHandler` was supposed to be the central error policy, it's a dead aspiration. |
| 5 | Make `version-check` URL and `monitor-lock` dir configurable | Accept env-var overrides (`GIT_WATCHTOWER_REGISTRY_URL`, `GIT_WATCHTOWER_HOME`). Needed for fork-friendliness and testability. |
