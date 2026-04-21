# Audit Report: server

## Summary
- **Total findings:** 15 (H: 3, M: 7, L: 5)
- **Top 3 most concerning patterns:**
  1. **`ProcessManager` class is fully dead in production.** `src/server/process.js:102-401` defines a 300-line `ProcessManager` with spawn/stop/restart/log-buffer/Mutex. `bin/git-watchtower.js:692-793` hand-rolls the same spawn → stdout/stderr pump → stop → restart lifecycle with its own `parseCommand` call + `spawn` + `SERVER_RESTART_DELAY_MS = 500` (duplicating `RESTART_DELAY = 500` from process.js:31). Zero `new ProcessManager(...)` anywhere outside tests.
  2. **Two parallel lock/IPC filesystems with two parallel `isProcessAlive` functions.** `src/server/coordinator.js:60-67` and `src/utils/monitor-lock.js:33-43` define the exact same `process.kill(pid, 0)` wrapper. Both are re-exported (coordinator.js:612, monitor-lock.js:170), both consumed separately by bin (bin:104 imports from coordinator; utils/monitor-lock is also imported). The `ensureDir`/`readLock`/`writeLock`/`removeLock` helpers are also duplicated across the two modules against two similar directories (`~/.watchtower/web.lock` in coordinator vs `~/.watchtower/monitor-*.lock` in monitor-lock).
  3. **Two `timeAgo` implementations.** `src/utils/time.js:formatTimeAgo` (Node) and `src/server/web-ui/pure.js:29:timeAgo` (browser, inlined via `Function.prototype.toString`). Slightly different output strings. `formatTimeAgo` is used by the TUI renderer; `timeAgo` is used by the web dashboard. One module could export a shared helper and re-inline it for the browser.

## Findings by category

### 1. Copy-paste duplication
- [ ] `bin/git-watchtower.js:692-793` reimplements the spawn/stdout/stderr/close lifecycle that `src/server/process.js:165-257` (`ProcessManager.start`) already provides (high).
- [ ] `src/server/coordinator.js:60-67` duplicates `src/utils/monitor-lock.js:33-43` (`isProcessAlive`) verbatim (high).
- [ ] `src/server/coordinator.js:49-53,78-87,95-98,114-145,163-165,170-172` and `src/utils/monitor-lock.js` parallel: `ensureDir`, `readLock`, `writeLock`, `tryAcquireLock`, `removeLock`, `removeSocket`. Two lock/file-handling systems (high).
- [ ] `bin/git-watchtower.js:399` `SERVER_RESTART_DELAY_MS = 500` duplicates `src/server/process.js:31` `RESTART_DELAY = 500` (medium).
- [ ] `src/server/web.js:83-160` (`getSerializableState`) manually converts three `Map` caches to plain objects (`sparklineCache`, `branchPrStatusMap`, `aheadBehindCache`). A one-line helper `mapToObj(m)` would remove the ~20 lines of boilerplate (low).
- [ ] `src/server/web.js:290-325` `flash` / `sendPreview` / `sendActionResult` are three copies of the same `for (client of this.clients) { client.write('event: X\\n'); client.write('data: ' + JSON.stringify(...) + '\\n\\n'); }` loop. Extract `_broadcastEvent(eventName, data)` (medium).

### 2. Silent failures and swallowed exceptions
- [ ] `src/server/coordinator.js:258,362,375,383,448,464,520,577` — eight blanket `catch (e) { /* ignore */ }` blocks. Acceptable for IPC (dead-socket cleanup is normal) but no DEBUG hook, so a genuine coordinator bug is invisible (medium).
- [ ] `src/server/web.js:275,296,310,324,443,538` — six `catch (e) { /* ignore dead clients */ }` blocks in the SSE push path. Same "it's fine until it isn't" story. A single `DEBUG=watchtower:sse` toggle would make dead-client tracing trivial (medium).
- [ ] `src/server/process.js:96-97` — `parseCommand` returns `{ command: args[0] || '', args: args.slice(1) }` with no indication that the input was malformed; `ProcessManager.start:188` reinterprets empty command as "Invalid command." Parsing/validating in two places with no shared contract (low).

### 3. Lazy type assertions
- [ ] `src/server/coordinator.js:193` — `/** @type {{pid:number,port:number,socketPath:string}} */ (lock)` jsdoc cast with no runtime check that the fields actually narrow. Reasonable but opaque (low).
- [ ] `src/server/web.js:242` — `(/** @type {Error & {code?: string}} */ err)` inline cast on error handler. Fine, but the pattern repeats (low).

### 4. Promise misuse
- [ ] `src/server/web.js:234-262` `start()` creates a server, attaches `on('error')` for `EADDRINUSE`, and on error does `this.server.listen(this.port, '127.0.0.1')` **without awaiting**. If the next listen also fails, the original promise is already resolved. Looks fragile — reject is only called after `MAX_PORT_RETRIES` is exhausted, but there's no outer timeout; a pathological case could leave the promise unresolved indefinitely (medium).
- [ ] `src/server/process.js:358-368` `restart()` uses `_restartMutex.withLock` — correct, but the callback does `this.stop()` (sync) then awaits a `setTimeout` sleep. If `stop()` throws (it doesn't currently, but the code doesn't guarantee that), the lock is released fine via `withLock`'s try/finally, but the error surfaces to the caller without any log (low).

### 5. Dead and orphaned code
- [ ] `src/server/process.js:102-401` (`ProcessManager` class) — zero production callers. The spawn lifecycle is duplicated inline in bin. Largest single dead-code finding in the codebase (high).
- [ ] `src/server/process.js:21,26,31` — `MAX_LOG_LINES`, `KILL_GRACE_PERIOD`, `RESTART_DELAY` are exported. Only referenced in tests (medium).
- [ ] `src/server/static.js:9-28` (`MIME_TYPES`) — exported but imported only by tests; `getMimeType` is the production entry point. Dead export (low).
- [ ] `src/server/static.js:43-52` (`LIVE_RELOAD_SCRIPT`) — exported but only tests import it; production uses `injectLiveReload` wrapper. Dead export (low).
- [ ] `src/server/coordinator.js:601-617` — the module exports `readLock`, `writeLock`, `ensureDir`, `removeLock`, `removeSocket`, `isProcessAlive`, `WATCHTOWER_DIR`, `LOCK_FILE`, `SOCKET_PATH` in addition to the `Coordinator` class and helpers. `writeLock`, `ensureDir`, `LOCK_FILE`, `SOCKET_PATH` are not referenced by bin. Large public surface that exists mainly for tests (medium).

### 6. Circular imports
- _None found._

### 7. Abstractions that abstract nothing
- [ ] `src/server/web-ui.js` (14-line file) — trivially re-exports `./web-ui/index`. If tests don't depend on the re-export path, this file is pure indirection (low).
- [ ] `src/server/process.js:48-97` (`parseCommand`) — reasonable abstraction for shell argument parsing, but the entire 50-line function exists to serve bin's one-line `spawn()` call. Since bin shells out anyway, it could just pass `shell: true` and let the OS parse. Kept because it's well-tested and worth the safety; noted for context (low).
- [ ] `src/server/coordinator.js:197-460` — the `Coordinator`/`Worker` pair is a zero-dependency IPC that re-invents half of socket.io. Worth keeping — but the registry-rebuilt-from-live-connections pattern makes every callback stateful; a proper event-emitter would simplify. Not slop but noted for context (low).

### 8. Hardcoded values that should be config
- [ ] `src/server/web.js:21` `DEFAULT_WEB_PORT = 4000` vs `src/config/schema.js` `DEFAULTS.web.port` — two sources for the web port default. The config doesn't reference `DEFAULT_WEB_PORT` (medium).
- [ ] `src/server/web.js:26,31,36` — `STATE_PUSH_INTERVAL = 500`, `MAX_PORT_RETRIES = 20`, `SSE_KEEPALIVE_INTERVAL = 15000`: magic numbers, no config override (medium).
- [ ] `src/server/coordinator.js:34` `MAX_IPC_BUFFER = 1024 * 1024` magic (low).
- [ ] `src/server/web.js:464` `body.length > 10240` — inline 10KB cap with no named constant (low).

### 9. Stale/deprecated vocabulary
- [ ] `src/server/web.js:129` — `serverLogBuffer: s.serverLogBuffer || []` references one of the two parallel server-log fields flagged in the `state` audit report. The web dashboard only reads `serverLogBuffer`; the dead Store `addServerLog` writes to `serverLogs`. If anyone ever migrates to the Store method, the dashboard goes blank (medium).

### 10. Observability gaps
- [ ] See the eight silent-catch sites in coordinator and six in web.js. No `DEBUG=watchtower:web|ipc` hook anywhere. Same finding as every other module (medium).

### 11. Drift and inconsistency
- [ ] The TUI renderer uses `formatTimeAgo` from `src/utils/time.js`. The web dashboard uses `timeAgo` from `src/server/web-ui/pure.js`. Output formats differ slightly: `formatTimeAgo` may say `"just now"` for small deltas while `timeAgo` always returns `"Ns ago"`. Two clocks (medium).
- [ ] `src/server/web.js:129` pulls `serverLogBuffer` from state; `src/server/web.js:147` pulls `sessionStats.getStats()` directly by module import — inconsistent data sourcing (state vs direct module call) inside the same serializer (low).

## Cross-cutting observations

`ProcessManager` is the clearest case of "extract-then-don't-migrate" in the codebase, right up there with the Store convenience methods. An entire class with a mutex, log rotation, SIGTERM→SIGKILL fallback, cross-platform stop (`_stopUnix`/`_stopWindows`), and 50+ tests — and the bin doesn't use a single byte of it. The bin's inline implementation at lines 692-793 is simpler but also less correct (no mutex on restart, no Windows-specific taskkill handling).

The two parallel lock systems (coordinator's `~/.watchtower/web.lock` and monitor-lock's `~/.watchtower/monitor-*.lock`) are both well-tested and both correct — they just share ~80 lines of near-identical filesystem helpers. A `src/utils/pidLock.js` factory that returned `{ tryAcquire, finalize, release, readLock, isAlive }` bound to a path would eliminate both copies.

The `Function.prototype.toString()` approach for inlining `pure.js` into the browser is clever and well-defended (the module banner says "every function here MUST be self-contained"). Keep this pattern — but also: `formatTimeAgo` and `timeAgo` should be merged into `pure.js` and shared by both surfaces.

## Recommended first 5 tickets

| # | Title | Scope |
|---|-------|-------|
| 1 | Migrate bin server lifecycle to `ProcessManager` | Replace `bin/git-watchtower.js:692-793` with `new ProcessManager({ cwd, onLog, onStateChange }).start(SERVER_COMMAND)`. Delete the inline spawn/stop/restart logic. Gets mutex-safe restart, log rotation, and Windows taskkill for free. |
| 2 | Extract `pidLock` utility shared by coordinator + monitor-lock | One factory, two instances (`webLock`, `monitorLock`). Eliminates the duplicated `isProcessAlive`, `ensureDir`, `readLock`, `writeLock`, `removeLock` in both modules. |
| 3 | Merge `formatTimeAgo` and `timeAgo` | Move `timeAgo` into `src/server/web-ui/pure.js` as the single source of truth; have `src/utils/time.js:formatTimeAgo` delegate to the same function. Both TUI and browser display identical relative times. |
| 4 | Delete dead re-exports in `src/server/coordinator.js` | `writeLock`, `ensureDir`, `LOCK_FILE`, `SOCKET_PATH` have no non-test callers. Narrow the export list. |
| 5 | Extract `_broadcastEvent` in `WebDashboardServer` | The three copies of the SSE-write loop in `flash` / `sendPreview` / `sendActionResult` collapse into one line each. Small but removes a consistently-forgotten place to add error logging. |
