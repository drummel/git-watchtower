# Audit Report: cli

_Scope: `/home/user/git-watchtower/src/cli/args.js` (311 lines, CommonJS)._

_References consulted: `bin/git-watchtower.js`, `src/index.js`, `src/config/schema.js`, `src/utils/errors.js`, `src/server/web.js`, `tests/unit/cli/args.test.js`._

## Summary

- **Total findings: 13** (H: 2, M: 6, L: 5)
- **Top 3 most concerning patterns:**
  1. **Inlined port validation that duplicates `validatePort` from `src/config/schema.js`** and is itself hand-rolled twice in `bin/git-watchtower.js` — three copies of the same `port > 0 && port < 65536` rule (H).
  2. **Giant if/else-if chain in `parseArgs`** (lines 65-171) uses a bespoke, stringly-typed hand-rolled parser with per-flag validation logic duplicated inline five times — a textbook "should be a table-driven spec" code smell (M).
  3. **Cross-module drift in limits and defaults**: `--visible-branches` accepts any positive int in `args.js`, 1-20 in the wizard inside `bin`, and 1-50 in `src/config/schema.js`. Three sources of truth, all diverging (M).

## Findings by category

### 1. Copy-paste duplication

- [x] `src/cli/args.js:77` + `src/cli/args.js:146` — **high.** The port-range check `!isNaN(x) && x > 0 && x < 65536` is inlined twice (for `--port` and `--web-port`) and the error message `"(expected: port number 1-65535)"` is a hand-copied string literal in both branches. Should call `validatePort` from `src/config/schema.js:101` (which exists and is already used by the schema validator at lines 192, 247, 301). That same literal also appears at `bin/git-watchtower.js:168` and `:182` inside the interactive wizard — **four copies** of the same rule.
- [x] `src/cli/args.js:75-82`, `:116-123`, `:130-137`, `:144-151` — **medium.** The "parseInt → isNaN → range-check → push error" flow is structurally identical for `--port`, `--poll-interval`, `--visible-branches`, and `--web-port`. Same pattern repeats four times with only the min/max and error string differing. Begs a `parseIntArg(argv, i, { min, max, label })` helper.
- [x] `src/cli/args.js:85-91`, `:105-111` — **low.** `--static-dir` and `--remote` both use an identical `args[i + 1] && !args[i + 1].startsWith('-')` guard followed by a "Missing value" push. Only differ in the destination key.
- [x] `src/cli/args.js:99-103`, `:112-115`, `:126-129` — **low.** The `--foo` / `--no-foo` pairs for `restartOnSwitch`, `autoPull`, and `sound` are three copies of the same two-line boolean-toggle pattern.

_Note: I specifically checked `bin/git-watchtower.js` for a duplicated `parseCliArgs` implementation. It does NOT duplicate the parser — line 77 imports from `src/cli/args.js` and line 367 calls it. The duplication is of validation rules (port range), not parsing structure._

### 2. Silent failures / swallowed exceptions

_None found._ The parser accumulates errors in `result.errors` and never swallows anything. `--version` / `--help` silently no-op when their callbacks are not provided (lines 158-166), which is arguably a form of silent failure (the flag does nothing with no feedback), but this is intentional and tested.

### 3. Lazy type assertions

- [x] `src/cli/args.js:68-69` — **low.** `const mode = args[i + 1]; if (['static', 'command', 'none'].includes(mode))` — `mode` may be `undefined`; `.includes(undefined)` returns false so it works, but relies on implicit coercion to fall through. The subsequent error message (`${mode || ''}`) has to paper over this.
- [x] `src/cli/args.js:86, :106` — **low.** `args[i + 1] && !args[i + 1].startsWith('-')` — if `args[i+1]` is the literal string `"-"` it fails the check, which is probably correct, but a path argument that legitimately starts with `-` (e.g., `--static-dir -weirdname`) is unreachable. Not obviously a bug but a type-loose heuristic.
- [x] `src/cli/args.js:168` — **low.** `args[i].startsWith('-')` — no guard that `args[i]` is a string. If `argv` were passed as an array containing a non-string (violating the JSDoc `@param {string[]}`), this throws. Low because runtime contract holds in practice.

### 4. Promise misuse

_None found._ `parseArgs` is fully synchronous. No promises, no `async` in this module.

### 5. Dead and orphaned code

- [x] `src/index.js:174` re-exports `CLI_PACKAGE_VERSION: cliArgs.PACKAGE_VERSION` — **medium.** Grep for `CLI_PACKAGE_VERSION` shows zero consumers (only the definition itself). `PACKAGE_VERSION` is also imported directly from `src/cli/args.js` in `bin/git-watchtower.js:77`, bypassing `src/index.js`. The re-export under an alias is orphaned public API surface.
- [x] `src/cli/args.js:311` — **low.** Exporting `PACKAGE_VERSION` from the CLI args module is itself a smell: the same constant is independently required from `package.json` in `src/ui/renderer.js:26` and `src/server/web.js:15`. Three paths to the same value; `src/cli/args.js` is not a natural "owner" for the package version.

### 6. Circular imports

_None found._ `src/cli/args.js` only requires `../../package.json`. It is a leaf module.

### 7. Abstractions that abstract nothing

- [x] `src/cli/args.js:37` `parseArgs(argv, options = {})` with `onVersion` / `onHelp` callbacks — **low.** Callers (`bin/git-watchtower.js:367-370` and tests) always pass trivial callbacks that just log and exit, or no-ops. The callback indirection exists only so the module can avoid calling `console.log` / `process.exit` itself. Reasonable for testability, but the net effect is that both call sites re-implement the same `console.log(...) ; process.exit(0)` two-liner inline. Could be one default implementation plus a `--quiet-exit` test hook.
- [x] `src/cli/args.js:181-243` `applyCliArgsToConfig` — **low.** This is ~60 lines of `if (cliArgs.foo !== null) { merged.x = cliArgs.foo }` with no transformation beyond renaming (`remote` → `remoteName`, `pollInterval` → `gitPollInterval`, `sound` → `soundEnabled`, `casino` → `casinoMode`). It is essentially a manual field mapping, which argues for a declarative map `{ cliKey: 'configPath' }` rather than a 60-line function.

### 8. Hardcoded values that should be config

- [x] `src/cli/args.js:77, :146` — **high.** Magic numbers `0` (exclusive min) and `65536` (exclusive max) for port range, literally duplicated. `src/config/schema.js:73` already exports `LIMITS.port = { min: 1, max: 65535 }`. CLI should reuse it.
- [x] `src/cli/args.js:69` — **medium.** The allowed-modes list `['static', 'command', 'none']` is a magic literal. `src/config/schema.js` has a schema; a shared `VALID_MODES` constant would prevent drift if a fourth mode is added.
- [x] `src/cli/args.js:250-308` `getHelpText` — **medium.** Every default in the help text (`default: 3000`, `default: 5000`, `default: 7`, `default: origin`, `default: public`, `default: 4000`) is hardcoded in the help string. `src/config/schema.js:60-66` is the real source of truth (`DEFAULTS`). If a default changes, the help text will silently lie. Should interpolate from `DEFAULTS`.
- [x] `src/cli/args.js:118` — **low.** `interval > 0` has no upper bound, while `src/config/schema.js:74` clamps to `{ min: 1000, max: 300000 }`. CLI accepts `--poll-interval 1` (one millisecond); the config layer then rejects on save. Quiet drift.
- [x] `src/cli/args.js:132` — **low.** `--visible-branches` requires `count > 0` with no max. `src/config/schema.js:75` caps at 50; the interactive wizard at `bin/git-watchtower.js:206` caps at 20. **Three different upper bounds** across three code paths.

### 9. Stale/deprecated vocabulary

- [x] `src/cli/args.js:22` / `:230-232` — **low.** `casino` as a CLI flag and `casinoMode` as a config key: both coexist and the mapping is manual. Fine, but it's a sign of ad-hoc naming drift (config prefers `<thing>Enabled` / `<thing>Mode` suffixes; CLI uses bare nouns). Similar: `sound` vs `soundEnabled`, `remote` vs `remoteName`, `pollInterval` vs `gitPollInterval`.

### 10. Observability gaps

- [x] `src/cli/args.js:72, :80, :89, :96, :109, :121, :135, :149, :169` — **medium.** Error strings are flat text (`"Invalid value for --port: "foo" (expected: port number 1-65535)"`). There is no structured context object; consumers can only string-match on the message. Compare with `src/utils/errors.js:334`, which uses a proper `ValidationError` with fields. Having the CLI accumulate plain strings and the rest of the app use typed errors is a split-brain observability pattern.
- [x] `src/cli/args.js:372-377` (consumer side in `bin`) — **low.** The consumer dumps each error via `console.error(\`Error: ${err}\`)`. Prefixed with the generic word "Error:" with no context. Arguably out of scope for `args.js` itself, but the API shape forces it.

### 11. Drift and inconsistency

- [x] `src/cli/args.js` entire module — **medium.** The file ignores `src/config/schema.js` completely. It neither imports `validatePort`, `LIMITS`, nor `DEFAULTS`, all of which exist and cover exactly the ranges and values being re-implemented here. The two modules evolved in parallel.
- [x] `src/cli/args.js:67, :83, :105` — **low.** Flag-to-short-flag mapping is inconsistent: `--mode/-m`, `--port/-p`, `--no-server/-n`, `--command/-c`, `--remote/-r`, `--web/-w`, `--version/-v`, `--help/-h` have short forms. `--static-dir`, `--restart-on-switch`, `--auto-pull`, `--poll-interval`, `--sound`, `--visible-branches`, `--casino`, `--web-port`, `--init`, `--force` do not. No obvious principle (length, frequency, conflict avoidance). The help text in `getHelpText` documents the asymmetry but doesn't justify it.
- [x] `src/cli/args.js:305-306` — **low.** The help text example lines `git-watchtower --web                             # TUI + web dashboard on :4000` and `git-watchtower --web --web-port 8080              # Web dashboard on custom port` have uneven trailing whitespace / hash alignment (extra spaces before `#`). Visual drift from the earlier examples that are aligned to column 47.

## Cross-cutting observations

- **Parallel validation universes.** `src/cli/args.js` and `src/config/schema.js` each implement their own port, poll-interval, and visible-branches validators with subtly different ranges. This looks like a partially-completed extraction: someone pulled CLI parsing into its own module but stopped short of also consolidating validation rules. The `validatePort` export in `src/config/schema.js` is the obvious target, and the CLI should delegate to it.
- **Help text hand-maintenance.** Defaults inside the help string are hardcoded rather than interpolated from `DEFAULTS` in the config schema. Typical outcome of copy-pasting documentation from an earlier version of the config; guaranteed to rot.
- **Orphaned public surface.** `CLI_PACKAGE_VERSION` is exposed through `src/index.js` but has no consumer. Suggests the public API of the library-shaped `src/index.js` is accumulating exports without audit. This is a library smell in a project that ships a CLI.
- **"Lift-and-shift, mission accomplished" pattern.** The module was extracted from `bin/git-watchtower.js` cleanly — the bin file is well-behaved about delegating. But the extraction didn't refactor the contents: the hand-rolled if/else chain, inline validation, and string error messages are all preserved as-is from whatever pre-extraction version existed. Extraction without refactoring is a common AI-assisted pattern.
- **No negative-path test for schema drift.** `tests/unit/cli/args.test.js` verifies `--visible-branches 0` is rejected but not `--visible-branches 9999`, leaving the lack-of-upper-bound drift uncaught by tests.

## Recommended first 5 tickets (impact-to-effort ranking)

| # | Title | Scope (2-3 sentences) |
|---|-------|------------------------|
| 1 | Unify port validation across CLI, wizard, and schema | Replace the inline `port > 0 && port < 65536` checks at `src/cli/args.js:77` and `:146` with a call to `validatePort` from `src/config/schema.js:101` (or a thin wrapper that returns null instead of throwing). Remove the two duplicate checks at `bin/git-watchtower.js:168` and `:182`. Adds a single source of truth for port range. |
| 2 | Reconcile limit drift for `--poll-interval` and `--visible-branches` | Apply `LIMITS.gitPollInterval` and `LIMITS.visibleBranches` from `src/config/schema.js:74-75` inside `src/cli/args.js:118` and `:132`. Fix the wizard in `bin/git-watchtower.js:206` (`<= 20`) to match. Add negative-path tests for values above each max. |
| 3 | Drive help text defaults from the schema | Import `DEFAULTS` from `src/config/schema.js` into `src/cli/args.js` and interpolate into `getHelpText` (lines 259, 261, 267, 270, 275, 280). Prevents the help text from lying when defaults change. |
| 4 | Replace hand-rolled flag loop with a declarative spec | Convert the if/else chain at `src/cli/args.js:65-171` into a flag table `{ flag, alias, type, target, min?, max?, values? }` and a generic dispatcher. Collapses the four duplicate "parseInt + range check + error push" blocks into one helper. Reduces the file to roughly half its size and makes adding a new flag a one-line change. |
| 5 | Remove orphan `CLI_PACKAGE_VERSION` and centralize `PACKAGE_VERSION` | Delete the re-export at `src/index.js:174`. Move the "read version from package.json" call into a single shared module (e.g. `src/utils/version.js`) and import it from `src/cli/args.js`, `src/ui/renderer.js:26`, and `src/server/web.js:15`, all of which currently re-read `package.json` independently. |
