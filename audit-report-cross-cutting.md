# Audit Report: Cross-cutting observations

**Scope:** Roll-up of patterns that span multiple per-module reports. Use this file to plan cleanup campaigns that hit several modules at once; use the per-module reports (`audit-report-{area}.md`) for the line-by-line findings.

## The dominant pattern: half-migrated extractions

By far the most common AI-slop shape in this codebase is:

> A feature is extracted into `src/<module>/<feature>.js` with tests. Bin (or another consumer) retains the pre-extraction implementation. Bin imports the new module but calls it in a way that re-wraps the old behavior. Tests pass against both. Production runs the bin copy. The `src/*` version sits on the shelf.

Concrete occurrences across reports:

| Extracted (on the shelf) | Still live (in bin/consumer) | Flagged in |
|---|---|---|
| `src/server/process.js:ProcessManager` | `bin/git-watchtower.js:692-793` inline spawn/stop/restart | `server` §1, §5 |
| `src/ui/keybindings.js:MODES + getCurrentMode` | `bin` scattered `searchMode`/`previewMode`/etc. booleans | `ui` §5, `state` |
| `src/stats/session.js:recordPoll` | `bin` local counters + `src/casino/index.js:recordPoll` duplicate | `stats`, `casino` |
| `src/state/store.js:addServerLog` | `bin` inline `serverLogBuffer` append | `state` §5, `server` §9 |
| `src/ui/ansi.js:generateSparkline` | `bin:1027` local `generateSparkline` + `src/git/branch.js:315` async dead version | `ui` §1, `git` §1 |
| `src/ui/ansi.js:drawBox`/`clearArea` | `bin:1161-1167` one-line wrappers over the renamed imports | `ui` §1, §7 |
| `src/server/coordinator.js:isProcessAlive` | `src/utils/monitor-lock.js:isProcessAlive` — **both** imported by bin | `server` §1 |
| `src/state/store.js:setMode` + middleware/subscribe machinery | `bin`/inline imperative mutations | `state` |
| `src/server/web-ui/pure.js:timeAgo` | `src/utils/time.js:formatTimeAgo` | `server` §11 |

**Shared recommendation:** a single "adopt or delete" decision pass, not six independent migrations. The intermediate state — two implementations, one tested, one deployed — is strictly worse than either endpoint.

## The dominant anti-pattern within each module: silent catch + no DEBUG hook

Every per-module report's §2 (Silent failures) and §10 (Observability) flags the same thing:

- `server` — 8 blanket catches in coordinator + 6 in web.js.
- `bin` — 27+ `} catch (e) {` blocks, many empty.
- `git` — `execGitSilent` swallows non-zero exits with no log.
- `casino` — catches around sound-play and timer cleanup.
- `state`, `stats`, `telemetry` — fire-and-forget `.catch(() => {})` on async writes.

**Zero modules** have a `DEBUG=watchtower:*` or `NODE_DEBUG` hook. Telemetry exists for *product* analytics, not diagnostics.

**Shared recommendation:** one module-level `debug()` helper at `bin/git-watchtower.js` top (and a re-exported version for `src/*`), wired through every silent catch site in a single sweep. Unblocks every §10 finding at once.

## The dominant vocabulary drift: three names for "current UI mode"

- `src/state/store.js:61` — `mode` (marked legacy)
- `src/ui/keybindings.js:23-31` — `MODES` enum (fresh, unadopted)
- `bin/git-watchtower.js` — per-feature booleans (`searchMode`, `previewMode`, `historyMode`, `infoMode`, `logViewMode`, `actionMode`)

Plus three names for "branches visible on screen right now":
- `src/ui/actions.js:getDisplayBranches`
- `src/state/store.js:504-511:getFilteredBranches`
- `src/server/web-ui/pure.js:getDisplayBranches`

Plus two names for "server stdout buffer":
- bin + web.js read `serverLogBuffer`
- (dead) `Store.addServerLog` writes `serverLogs`

**Shared recommendation:** this is not a cosmetic renaming exercise — each drift corresponds to a half-migration (above). Fix the migration; the vocabulary collapses as a consequence.

## The dead-export dead-weight

| Module | Dead exports |
|---|---|
| `src/ui/ansi.js` | `wordWrap`, `horizontalLine`, `style`, `pad`, `indicators` (5) |
| `src/git/branch.js` | `checkout`, `getPreviewData`, `detectBranchChanges`, `getLocalBranches`, `localBranchExists`, `generateSparkline` (6) |
| `src/casino/sounds.js` | `playSpin`, direct `playWin`, direct `playMegaJackpot`, `getSoundPath`, `SOUNDS_DIR` (5) |
| `src/server/process.js` | `ProcessManager` class + `MAX_LOG_LINES`, `KILL_GRACE_PERIOD`, `RESTART_DELAY` (the whole class + 3 consts) |
| `src/server/static.js` | `MIME_TYPES`, `LIVE_RELOAD_SCRIPT` (2) |
| `src/server/coordinator.js` | `writeLock`, `ensureDir`, `LOCK_FILE`, `SOCKET_PATH` (4) |
| `src/ui/keybindings.js` | `MODES`, `getCurrentMode` (tests-only callers) |
| `src/index.js` | The entire 190-line barrel (zero production consumers) |

**~30 exported symbols** that exist for tests only or for no one. Each was added for a reason (extract-for-testing, API hedge), but together they form a false signal of what's supported.

**Shared recommendation:** one cleanup PR per module (not one monster PR). Order: `src/index.js` first (widest blast radius, simplest delete), then per-module in the order of `ui → git → server → casino`.

## The configuration duplication

Per-module reports collectively list **three separate "same constant in multiple places"** sites:

- Sparkline glyphs `['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']` — `src/ui/ansi.js:207`, `src/server/web-ui/pure.js:52`, `bin:1027` (`ui` §8, `git` §1).
- `RESTART_DELAY = 500` vs `SERVER_RESTART_DELAY_MS = 500` — `src/server/process.js:31` vs `bin:399` (`server` §1).
- `DEFAULT_WEB_PORT = 4000` vs `DEFAULTS.web.port` — `src/server/web.js:21` vs `src/config/schema.js` (`server` §8).

Plus 14 unconfigurable magic numbers in bin that probably deserve config exposure (`bin` §8).

**Shared recommendation:** the sparkline-glyph constant is the cheapest win — one file, emit-into-browser pattern already established in `pure.js`. The config-vs-constant duplications are a 20-minute audit sweep.

## The largest single unaudited risk

`src/ui/renderer.js` — 1596 lines, 3x the next-largest `src/*` file, not deeply audited in this pass. Flagged in `ui` and implicitly in `bin`. Next audit pass should start here.

## Prioritized meta-plan

Rather than tackling 5 tickets from each of 9 per-module reports (~45 tickets), the cross-cutting view suggests this sequence:

1. **Ship the `DEBUG=watchtower:*` hook.** One PR. Unblocks every §10 finding. Makes the next tickets safer to review because we can see what previously-silent paths are actually hit.
2. **Decide `src/index.js`: library or delete.** Binary question, small blast radius, de-risks the cleanup of ~30 dead exports that currently look "public."
3. **One "adopt-or-delete" meeting** to resolve all 9 half-migrations above in a single batch. Pick a direction per row; schedule each as a follow-up.
4. **Dead-export cleanup sweep** per module, in dependency order (barrel first, then ui, git, server, casino).
5. **Start the `renderer.js` deep-dive audit** — unresolved scope that's probably hiding the next three reports' worth of findings.

## Per-module report index

| Report | Findings | Top concerns |
|---|---|---|
| `audit-report-casino.md` | 18 (H3, M9, L6) | `recordPoll` duplication, `WIN_LEVELS` label ladder, 20+ module-level `let`s |
| `audit-report-config.md` | (from prior session) | See file |
| `audit-report-git.md` | 17 | `generateSparkline` triplet, `execGitSilent` silent swallow, 6 dead branch exports |
| `audit-report-polling.md` | (from prior session) | See file |
| `audit-report-server.md` | 15 (H3, M7, L5) | `ProcessManager` fully dead, duplicate `isProcessAlive`, two parallel lock systems |
| `audit-report-src-index.md` | 4 (H1, M2, L1) | The entire barrel is unused |
| `audit-report-state.md` | (from prior session) | Legacy `mode`, dead Store methods |
| `audit-report-stats.md` | (from prior session) | `recordPoll` parallel to casino |
| `audit-report-telemetry.md` | (from prior session) | See file |
| `audit-report-ui.md` | 14 (H2, M6, L6) | `drawBox`/`clearArea` wrappers, 5 dead ansi exports, `MODES` unadopted |
| `audit-report-utils.md` | (from prior session) | See file |
| `audit-report-bin.md` | 11 unique + ~20 cross-refs (H4, M5, L2) | 27 empty catches, 14 module magic numbers, 60 module-level `let`s |
