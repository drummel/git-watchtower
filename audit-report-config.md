# Audit Report: config

## Summary
- **Total findings:** 14 (H: 3, M: 6, L: 5)
- **Top 3 most concerning patterns:**
  1. The `bin/git-watchtower.js` wizard hand-rolls port/poll/branches validation instead of calling the `validatePort` / `validatePollInterval` / `validateVisibleBranches` functions that schema.js already exports — drift is baked in.
  2. `visibleBranches` upper bound disagrees across files: wizard allows max `20` (`bin/git-watchtower.js:206`), schema allows `50` (`src/config/schema.js:75`), and CLI allows anything (`src/cli/args.js` — see the cli report).
  3. `migrateConfig` in `src/config/schema.js:288` is a migration for an "old format" that is itself silent about what version was being migrated from; likely dead code from a finished migration that nobody deleted.

## Findings by category

### 1. Copy-paste duplication
- [ ] `bin/git-watchtower.js:166-170` — port prompt re-implements `validatePort` inline (`parseInt` + magic `0..65536` bounds) instead of calling the already-imported schema helper (high).
- [ ] `bin/git-watchtower.js:180-184` — **same** port validation duplicated a second time within the same wizard function (high).
- [ ] `bin/git-watchtower.js:193-198` — poll-interval prompt re-implements `validatePollInterval` inline (`parseFloat` + `>= 1`) rather than calling the schema helper; silently clips anything invalid (medium).
- [ ] `bin/git-watchtower.js:203-208` — visible-branches prompt re-implements `validateVisibleBranches` inline and uses a different max (20 vs schema's 50) (high).

### 2. Silent failures and swallowed exceptions
- [ ] `bin/git-watchtower.js:168,182,196,206` — all four inline numeric validations silently discard invalid input (no error message, no re-prompt, just keeps the default). The wizard looks like it validated, but failed input is indistinguishable from accepted input (medium).
- [ ] `bin/git-watchtower.js:232-234` — `promptConfigFileHandling` catches `execSync` failure with an empty `catch {}` and bails out silently; fine as a "not a git repo" check but the comment and the catch together are doing two things at once (low).

### 3. Lazy type assertions
- [ ] `src/config/loader.js:54,98` — `error.message` is accessed without an `instanceof Error` guard. `fs` callbacks reliably return `Error`, so this is low risk, but the pattern breaks if a non-Error value is ever thrown (low).
- [ ] `src/config/schema.js:222` — the `dangerousPatterns` regex is a reasonable shell-injection allowlist but it is applied to `config.server.command` only; there is no equivalent check on `config.server.staticDir` beyond `path.isAbsolute`. Worth verifying that path traversal via symlink is out-of-scope (low).

### 4. Promise misuse
- _None found._ (config is fully synchronous; no promise code to misuse.)

### 5. Dead and orphaned code
- [ ] `src/config/loader.js:39-59` — `loadConfigRaw` is exported but has zero callers outside `loader.js` itself (`grep loadConfigRaw` returns only the definition, its one internal call site, and the export). Dead export (medium).
- [ ] `src/config/loader.js:110-119` — `deleteConfig` is only used by `tests/unit/config/loader.test.js` and the `src/index.js` re-export barrel. No production callers (medium; low if the barrel is a published library surface).
- [ ] `src/config/loader.js:29-31` — `configExists` same story: tests + re-export barrel only (low).
- [ ] `src/config/schema.js:320-322` — `SERVER_MODES` / `DEFAULTS` / `LIMITS` are re-exported but never imported by name in non-test code. The one place that *should* use `LIMITS` — the wizard — hardcodes the limits instead. Makes the schema's exports look vestigial (medium).
- [ ] `src/config/schema.js:288-317` — `migrateConfig` migrates an old pre-`server` shape to the current shape. The old format appears to have been gone for a while (no comments dating the migration, no callers outside `loadConfig`/`index.js`). Worth checking CHANGELOG to see if this is safe to delete (medium; flag low if kept for external config files in the wild).

### 6. Circular imports
- _None found._ (`loader.js` imports schema; schema imports utils/errors; no cycles.)

### 7. Abstractions that abstract nothing
- [ ] `src/config/schema.js:82-93` — `getDefaultConfig` exists to return a shallow-cloned `DEFAULTS`, but it still shares the nested `server`/`web` objects via spread. If callers mutate `result.server.staticDir` they mutate `DEFAULTS.server.staticDir` too. Either deep-clone or return the frozen `DEFAULTS` directly; the current half-measure is surprising (medium).

### 8. Hardcoded values that should be config
- [ ] `src/config/loader.js:13` — `CONFIG_FILE_NAME = '.watchtowerrc.json'` is fine as a constant, but the brand name "Git Watchtower" / "🏰 Git Watchtower" appears inline elsewhere (bin wizard lines 141-145). A single `BRAND_NAME` constant would prevent drift (low).
- [ ] `src/config/schema.js:74` — `gitPollInterval` bounds `1000..300000` are magic; if they move they must be kept in sync with `bin/git-watchtower.js:197` and with CLI help text (low).
- [ ] `bin/git-watchtower.js:206` — `visibleBranches <= 20` is a magic cap that contradicts `LIMITS.visibleBranches.max = 50` in schema (high — see duplication above).

### 9. Stale/deprecated vocabulary
- [ ] `src/config/schema.js:288-317` — `migrateConfig` references `config.noServer`, `config.port`, `config.staticDir` as top-level keys. These are the "old format". If pre-`server` configs are no longer supported, this function is stale. Flag for confirmation (low).

### 10. Observability gaps
- [ ] `src/config/loader.js:97-102` — `ConfigError('Failed to save configuration: ...', 'CONFIG_WRITE_ERROR', { path })` is good: structured code + context. Keep this pattern as the template (positive note, no fix needed).
- [ ] `bin/git-watchtower.js:290,304,330` — `console.error('  Warning: ...' + e.message)` logs only a string with no error code, no file path context, no stack trace. The `ConfigError` class exists; use it or at least pass `{ err, path }` to a structured logger (medium).

### 11. Drift and inconsistency
- [ ] See "Copy-paste duplication" — three different validation surfaces (schema, CLI, wizard) with three different rule sets for the same fields. This is the headline drift.
- [ ] `src/config/schema.js:101-109` uses `ValidationError.invalidPort(port)` while `validatePollInterval`/`validateVisibleBranches` use `ConfigError.invalid(...)`. Two different error types for the same "invalid config value" concept (medium).

## Cross-cutting observations

There are clear signs of an incomplete refactor: schema.js defines a clean validation API (`validatePort`, `validatePollInterval`, `validateVisibleBranches`, `LIMITS`, `DEFAULTS`), but the CLI wizard and the CLI arg parser both ignore it and reimplement the same logic with slightly different rules. This is the classic "extracted a module but never finished updating the callers" pattern. `migrateConfig` adds to the feeling — it is a migration whose endpoints nobody documented, and whose deletion nobody has risked.

The error-type story is also bifurcated: port is invalid via `ValidationError`, poll-interval is invalid via `ConfigError`. One of them was added later without checking the precedent.

## Recommended first 5 tickets

| # | Title | Scope |
|---|-------|-------|
| 1 | Wizard: call schema validators instead of hand-rolling | Replace the four inline `parseInt`/`parseFloat` + magic-bounds blocks in `bin/git-watchtower.js:166-208` with calls to `validatePort`, `validatePollInterval`, `validateVisibleBranches`. Also switch the "silently keep default on invalid input" behavior to a re-prompt with an error message — the wizard currently lies about what it accepted. |
| 2 | Pick one error type for invalid-config | `validatePort` throws `ValidationError`, sibling validators throw `ConfigError`. Unify on one (probably `ConfigError` since that's the dominant usage in loader.js). Fix in `src/config/schema.js:101-166`. |
| 3 | Delete or document `migrateConfig` | Confirm whether any user in the wild still has pre-`server` `.watchtowerrc.json` files (CHANGELOG check). If not, delete `migrateConfig` and its caller at `loader.js:75`. If yes, add a comment naming the version it migrates from. |
| 4 | Remove dead exports from `config/loader.js` | `loadConfigRaw` has zero callers outside its own file. Either inline it or delete it. Consider also narrowing the `src/index.js` re-export barrel to match actual library surface (see cross-cutting report). |
| 5 | Fix `getDefaultConfig` shallow-clone trap | Either deep-clone (`structuredClone(DEFAULTS)`) or freeze `DEFAULTS` and drop `getDefaultConfig`. The current behavior — shared nested refs — will eventually cause a bug when something mutates `result.server.command`. |
