# Audit Report: bin

**Scope:** `bin/git-watchtower.js` — a single 3763-line file containing 81 function declarations, 60 module-level `let` bindings, and 52 `catch` blocks. This is the application entry point and the place where **every "extract-then-don't-migrate"** pattern flagged in per-module reports actually lives.

Most bin findings are already catalogued in the per-module reports (`casino`, `git`, `server`, `state`, `stats`, `ui`). This report focuses on **bin-unique** observations and cross-links to the module reports for the duplicated work.

## Summary
- **Total findings:** 11 bin-unique + ~20 cross-references (H: 4, M: 5, L: 2)
- **Top 3 most concerning patterns:**
  1. **Three half-migrations converge here.** Bin imports `ProcessManager`, `MODES`, `Store.addServerLog` surface area, etc., from `src/*` but then hand-rolls the same logic inline. The bin is the site where every per-module report's "never adopted" refactor becomes visible.
  2. **60 module-level `let` bindings are the actual app state**, not `Store`. `Store` is imported (`line 100`) and used as a reactive shell, but most of the app's mutable state (timers, caches, IPC handles, terminal dimensions, flags) lives in free-floating `let`s. See the `state` report for the contract violation; see here for the sheer count.
  3. **The file has outgrown its own structure.** 81 functions with no inner sub-module organization, `renderer.js` already exists at 1596 lines as an extract-in-progress, and bin still holds rendering glue, command lifecycle, file-watcher logic, PR-status polling, update-check wiring, coordinator bootstrapping, and the entire casino integration. Half of it should move into `src/`; half of `src/` should be inlined here and deleted. A decision either way is overdue.

## Findings by category

### 1. Copy-paste duplication
- [ ] **`drawBox`/`clearArea` wrappers** at `bin/git-watchtower.js:1161-1167` — one-line wrappers over `renderBox`/`renderClearArea` (aliased on import at line 802). Pure rewrap. Full detail: **see `audit-report-ui.md` §1 + §7 (high).**
- [ ] **Local `generateSparkline` at `bin/git-watchtower.js:1027`** — third copy. Full detail: **see `audit-report-git.md` §1 and `audit-report-ui.md` §1 (high).**
- [ ] **Inline spawn/stdout/stderr/close lifecycle** at `bin/git-watchtower.js:692-793` — duplicates `ProcessManager.start/stop/restart`. Full detail: **see `audit-report-server.md` §1 (high).**
- [ ] **`SERVER_RESTART_DELAY_MS = 500`** at `bin/git-watchtower.js:399` — duplicates `src/server/process.js:31` `RESTART_DELAY = 500` (medium; also in server report).
- [ ] **Mode booleans** (`searchMode`, `previewMode`, `historyMode`, `infoMode`, `logViewMode`, `actionMode`) are scattered across bin; `src/ui/keybindings.js:23-31` `MODES` + `getCurrentMode` is the already-written-but-never-called replacement. **See `audit-report-ui.md` §5 (medium).**
- [ ] **`recordPoll`/`addServerLog`/session-stats-like writes** are duplicated between bin's inline mutations and `src/stats/session.js` + `src/casino/index.js:recordPoll`. **See `audit-report-stats.md` and `audit-report-casino.md`.**

### 2. Silent failures and swallowed exceptions
- [ ] **27 empty or near-empty `catch` blocks** in bin (grep for `} catch (e) {` returns 27 top-level matches, `} catch (err) {` returns 6 more). Examples at lines 289, 303, 329, 508, 531, 565, 916, 924, 1082, 1121, 1446, 1460, 1523, 1616, 2012, 2053, 2276, 2451, 2483, 2506, 2532, 3121, 3162, 3308. Some are legitimate (IPC dead-client cleanup, probe-style `fs.statSync` calls); most log nothing and have no DEBUG hook. Same observability gap flagged in every per-module report (high — the largest concentration in the codebase).

### 3. Lazy type assertions
- [ ] Bin uses `any`-ish patterns throughout — very few jsdoc annotations on the 81 functions. This is consistent with "bin is still the monolith"; extraction to `src/*` is where jsdoc gets added. Not called out per-site (low, but cross-cutting).

### 4. Promise misuse
- [ ] **Fire-and-forget `.catch(() => {})` patterns** exist around PR-status polling, update checks, and coordinator handshake. Not individually cataloged — needs its own pass if this area is prioritized (low).

### 5. Dead and orphaned code
- [ ] **`bin/git-watchtower.js` imports `monitorLock`** (line 105) from `src/utils/monitor-lock.js` AND the coordinator's `tryAcquireLock`/`finalizeLock`/`removeLock`/`isProcessAlive` (line 104). Two lock systems imported side-by-side into the same file. **See `audit-report-server.md` §1 (high).**
- [ ] **Commented-out delegation notes** at lines 1169, 1171 (`// renderHeader - now delegated to renderer.renderHeader()`, `// renderBranchList, renderActivityLog — now delegated to renderer module`). These are migration breadcrumbs — fine at the moment of extraction, but they've calcified. Either delete them or delete the functions they replaced (low).

### 6. Circular imports
- _None found_ — bin is the leaf; it imports src/* but src/* does not import bin.

### 7. Abstractions that abstract nothing
- [ ] `drawBox`/`clearArea` wrappers (see §1).
- [ ] **`loadConfig` / `saveConfig` wrappers** at `bin/git-watchtower.js:109-115` — two-line wrappers that inject `PROJECT_ROOT`. Reasonable if `PROJECT_ROOT` were volatile, but it's captured once at line 107 and never changes. Could be `const loadConfig = () => loadConfigFile(PROJECT_ROOT)` one-liners or inlined at call sites (low).

### 8. Hardcoded values that should be config
- [ ] **14 `const [A-Z_]+ = <number>` module-level magic numbers** in bin (lines 390, 391, 395, 397, 399, 401, 403, 405, 846, 851, 855, 865, 3132, 3138). Timers, retries, buffer sizes, grace periods — none of these are surfaced as config overrides, though several (like `PR_STATUS_POLL_INTERVAL = 60s`, `CLI_TIMEOUT = 30s`, `MAX_SERVER_LOG_LINES = 500`) are values a user might reasonably want to tune (medium).
- [ ] **`FORCE_KILL_GRACE_MS = 3000`** at line 395 and **`SIGKILL_GRACE_AFTER_TIMEOUT_MS = 5000`** at line 397 are closely-related timings with no shared documentation of the intended escalation ladder. Adjacent magic numbers that together encode a policy — would be clearer as `SHUTDOWN_TIMEOUTS = { soft: 3000, hard: 5000 }` (low).

### 9. Stale/deprecated vocabulary
- [ ] **Per-feature mode booleans vs `state.mode` vs `MODES` enum** — three vocabularies for the same concept, with bin using the one that was explicitly marked legacy. **See `audit-report-state.md` + `audit-report-ui.md`.**
- [ ] **`serverLogBuffer` (bin/web read) vs `serverLogs` (Store method writes to)** — bin reads and writes `serverLogBuffer`; `Store.addServerLog` (dead) writes to `serverLogs`. Two field names. **See `audit-report-state.md` §9 and `audit-report-server.md` §9.**

### 10. Observability gaps
- [ ] **No `DEBUG` / `NODE_DEBUG` / conditional-log hook anywhere in bin.** 52 catches, 0 logged. Telemetry is for *usage* events, not runtime diagnostics. A single `const debug = process.env.DEBUG?.includes('watchtower') ? console.error : () => {};` at the top of bin would unlock every silent catch site at once (high — same gap every module report flags, but bin is where the user-facing impact lands).

### 11. Drift and inconsistency
- [ ] **Import style varies** — some modules are imported whole (`const casino = require('../src/casino')`), some destructured with renames (`const { parseArgs: parseCliArgs, ... } = require('../src/cli/args')`), some destructured with re-exports (`const { WebDashboardServer } = require('../src/server/web')`). Low-value consistency nit, but for a file that imports from ~20 modules the grep-ability suffers (low).
- [ ] **Function-definition style varies** — bin mixes `async function name()`, `function name()`, `const name = () => ...`, and module-level arrow assignments depending on era. No systematic pattern (low).

## Cross-cutting observations

Everything that every per-module report says about "never-adopted refactor" converges in this file. The pattern is always the same:

1. Someone extracted `FeatureX` into `src/*/featureX.js` with good tests.
2. Bin still has the pre-extraction implementation.
3. Bin imports the extracted module but calls it in a wrapper that re-implements the pre-extraction behavior.
4. Tests pass, production runs the bin version, `src/*/featureX.js` sits on the shelf.

Concrete instances:
- `src/server/process.js:ProcessManager` vs bin lines 692-793 (inline spawn lifecycle)
- `src/ui/keybindings.js:MODES + getCurrentMode` vs bin's scattered mode booleans
- `src/stats/session.js:recordPoll` vs bin's local counters + `src/casino/index.js:recordPoll`
- `src/state/store.js:addServerLog` vs bin's `serverLogBuffer` inline append
- `src/ui/ansi.js:generateSparkline` + `src/git/branch.js:generateSparkline` vs bin line 1027
- `src/ui/ansi.js:drawBox` vs `bin:drawBox` wrapper
- `src/server/coordinator.js:isProcessAlive` vs `src/utils/monitor-lock.js:isProcessAlive` — bin imports **both**

The bin has become a graveyard of "old way" implementations that outlived their replacements because no one flipped the switch. Every per-module report's §5 (Dead and orphaned code) is, in effect, "the replacement module for something that still lives in bin."

## Recommended first 5 tickets

| # | Title | Scope |
|---|-------|-------|
| 1 | Add a `DEBUG=watchtower:*` hook and flip every silent `catch` to route through it | One module-level `debug()` helper at bin's top; audit the 27 empty `catch (e) {}` sites and either log or annotate-with-reason. Unblocks every other module's §10 finding simultaneously. |
| 2 | Consolidate the "half-migrated" backlog into a single tracking issue | The six per-module reports each flag a different "never-adopted refactor." A cross-cutting ticket lets the decision — "adopt or delete" — be made for all of them as one batch rather than six independent migrations that each leave a worse intermediate state. |
| 3 | Delete `drawBox`/`clearArea` wrappers + the aliased imports | `bin:802, 1161-1167`. Smallest possible migration, ships confidence. |
| 4 | Promote `PR_STATUS_POLL_INTERVAL`, `CLI_TIMEOUT`, `MAX_SERVER_LOG_LINES`, `FORCE_KILL_GRACE_MS` to config with env overrides | Four of the 14 bin magic numbers have a plausible user-tuning use case. The rest can stay named constants. |
| 5 | Extract one more module — `bin/file-watcher.js` or `bin/pr-status-poller.js` | Bin's 3763 lines include at least two self-contained subsystems (file watcher + PR status poller) that could extract cleanly with the patterns already established. Continuing the extraction cadence signals direction; stalling at today's bin size signals "give up." |
