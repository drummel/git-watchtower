# Audit Report: telemetry

## Summary
- **Total findings:** 14 (H: 1, M: 7, L: 6)
- **Analytics providers referenced:** **PostHog** only (`phc_fdGL8TVN5aFPXmQ4f1hI8y6sqnscD7dy9j5SM5gTylG` via `us.i.posthog.com`). No Mixpanel/Segment/Amplitude references found. **Flag for user:** confirm PostHog is still your active provider.
- **Top 3 most concerning patterns:**
  1. **Hardcoded PostHog API key and host** live at module scope in `src/telemetry/analytics.js:11-12`. If the project forks or the key ever rotates, there is no env-var override. Checked into the npm package.
  2. **`captureAlways` duplicates `sendBatch`/`queueEvent`** — it rebuilds the whole HTTPS request + payload inline at lines 171-205 rather than reusing `sendBatch([event])`. Two codepaths for "send an event to PostHog," which diverge in subtle ways (timeout handler, $lib metadata).
  3. **`captureError`'s `errorMessage` is built by OR-ing `errorCode || error.message`.** Line 144: `const errorMessage = errorCode || (error.message || '').substring(0, 200);`. This means an error with a `.code` sends **only the code** as the message — you lose the human-readable text. Likely a subtle bug from a rushed edit.

## Findings by category

### 1. Copy-paste duplication
- [ ] `src/telemetry/analytics.js:171-205` (`captureAlways`) — duplicates the HTTPS request/payload construction from `sendBatch` (lines 31-54). `captureAlways` is only called in 2 places (`telemetry/index.js:64,69`); it could trivially delegate to `sendBatch([event])` with a `distinctId` override (medium).
- [ ] `src/telemetry/config.js:13-14` — defines its own `CONFIG_DIR_NAME` / `CONFIG_FILE_NAME` constants that shadow the project-wide `CONFIG_FILE_NAME` from `src/config/loader.js:13`. Same-name constants with different meanings in sibling modules (low).
- [ ] `src/telemetry/config.js:84-86` and `src/telemetry/config.js:109-111` — identical "is env var set to false?" logic in `isTelemetryEnabled` and `isEnvDisabled`. Extract to a helper (low).

### 2. Silent failures and swallowed exceptions
- [ ] `src/telemetry/analytics.js:127-131`, `141-160`, `172-204`, `220-224` — every public entry point is wrapped in `try { ... } catch {}`. For telemetry this is correct policy, **but** none of them emit a `console.debug` or surface the failure even via a flag. If the first capture fails at startup, subsequent captures will silently no-op with no way for the developer to know. Recommend a `DEBUG=watchtower:telemetry` hook (medium).
- [ ] `src/telemetry/analytics.js:49-51` — `req.on('error', () => resolve())` and `req.on('timeout', () => { req.destroy(); resolve(); })` both swallow the network failure and resolve quietly. Same note as above: acceptable policy, but logging the count of failures would be trivial (low).
- [ ] `src/telemetry/config.js:36-47` — `loadTelemetryConfig` catch-all: `catch { return null; }`. Cannot distinguish "file doesn't exist" from "file is corrupted JSON." If the config ever gets corrupted, the user gets re-prompted on every launch with no indication why (medium).

### 3. Lazy type assertions
- [ ] `src/telemetry/analytics.js:143` — `const errorCode = /** @type {any} */ (error).code || '';` — explicit `any` cast. Works but documents a missing type (low).
- [ ] `src/telemetry/analytics.js:144` — `(error.message || '').substring(0, 200)` assumes `error.message` is a string. On thrown non-Error values (which `captureError` accepts as `@param {Error}`) this would throw inside the try/catch. Fine in practice, but the type annotation lies (low).
- [ ] `src/telemetry/config.js:84` — `process.env.GIT_WATCHTOWER_TELEMETRY` is read without validation; any value other than exactly `"false"` (case-insensitive) is treated as "enabled-if-configured". Common footgun — `"0"`, `"no"`, `"off"` all enable telemetry (medium).

### 4. Promise misuse
- [ ] `src/telemetry/analytics.js:86` — `flush()` inside `queueEvent` is fire-and-forget (no `.catch` and no `await`). Acceptable for telemetry's no-blocking policy but note the async function isn't awaited anywhere else either — ensure the Node process can exit even with pending timers (confirmed: `flushTimer.unref()` at line 116) (low).
- [ ] `src/telemetry/index.js:25` — `async function promptIfNeeded` contains multiple early-return paths that are synchronous; the `async` is only justified by the single `await promptYesNo` call. Not slop, noted for context (low).

### 5. Dead and orphaned code
- [ ] `src/telemetry/index.js:100-101` — `loadTelemetryConfig` and `saveTelemetryConfig` are exposed on the public telemetry module "for advanced use" but have zero non-test callers. The only consumer is `promptIfNeeded` which calls them internally. Dead surface (low).
- [ ] `src/telemetry/config.js:115-116` — `getConfigDir` and `getConfigPath` are exported but only called from within this file. Dead exports (low).
- [ ] `src/telemetry/analytics.js:60-65` — `flush` is not exported. Check whether `shutdown` is the only intended external flush point — if so, noted good; if not, flush should probably be exported for testing (low).

### 6. Circular imports
- _None found._ (`telemetry/index.js` → `analytics.js` + `config.js`; `analytics.js` → `config.js`; `config.js` has no cross-module imports.)

### 7. Abstractions that abstract nothing
- [ ] `src/telemetry/index.js:84-102` — the whole module is a re-export barrel with one function (`promptIfNeeded`) added. Could be collapsed into `analytics.js` unless `index.js` is the documented public API (low).
- [ ] `src/telemetry/analytics.js:95-97` — `setVersion` and `init({ version })` both set `appVersion`. Two setters for the same field; `setVersion` was added to fix the "pre-init events miss version" problem. Consolidate (low).

### 8. Hardcoded values that should be config
- [ ] `src/telemetry/analytics.js:11` — `POSTHOG_API_KEY = 'phc_fdGL8TVN5aFPXmQ4f1hI8y6sqnscD7dy9j5SM5gTylG'` hardcoded. Allow override via env var `GIT_WATCHTOWER_TELEMETRY_API_KEY` or similar (high — fork-hostile).
- [ ] `src/telemetry/analytics.js:12` — `POSTHOG_HOST = 'us.i.posthog.com'` hardcoded; some users may need `eu.i.posthog.com` or a self-hosted instance (medium).
- [ ] `src/telemetry/analytics.js:21-22` — `FLUSH_INTERVAL = 30000` / `FLUSH_AT = 10` magic (low).
- [ ] `src/telemetry/analytics.js:46,196` — `timeout: 5000` magic (low).
- [ ] `src/telemetry/analytics.js:144` — `.substring(0, 200)` magic truncation (low).
- [ ] `src/telemetry/config.js:13-14` — `.git-watchtower` / `config.json` should arguably be exported so users can point at them. Currently undiscoverable if the user wants to inspect (low).

### 9. Stale/deprecated vocabulary
- [ ] No old analytics lib references found — cleanly on PostHog with no ghosts of Mixpanel/Segment/Amplitude. Confirm PostHog is the intended current provider (the user asked to flag analytics providers — see summary) (low).

### 10. Observability gaps
- [ ] `src/telemetry/analytics.js:127-131` etc. — as noted under Silent Failures, every catch is empty. A single `const DEBUG = process.env.DEBUG?.includes('watchtower:telemetry')` toggle and conditional `console.error(err)` inside each catch would make this debuggable without changing production behavior (medium).

### 11. Drift and inconsistency
- [ ] `captureAlways` sends synchronously (no queueing) while `capture` queues. They serve different needs but the split-brain is subtle; the caller has to remember which to use (low).
- [ ] `setVersion` and `init({ version })` are both entry points for the version string. Picked up one from `setVersion(PACKAGE_VERSION)` (`bin/git-watchtower.js:3589`) then immediately re-set via `init`. Redundant (low).

## Cross-cutting observations

The telemetry layer is reasonably mature — opt-in prompt, zero-dep HTTPS, fire-and-forget semantics — but it wears its iteration history on its sleeve. `setVersion` was bolted on after `init` to support events that fire before `init`. `captureAlways` was bolted on because `capture` checks `enabled` and the consent events need to fire regardless. Each fix was additive; none was consolidated. A clean refactor would fold `captureAlways` into `capture` via an `{ overrideDistinctId, bypassEnabled }` option and drop `setVersion`.

The `errorMessage = errorCode || error.message` bug at line 144 is the kind of tiny inversion an LLM loves to produce — technically valid, passes tests that only check that *some* string is sent, but lossy in production (you lose the message when the error has a code). Easy fix, high-value.

The hardcoded API key is a real fork blocker. The project is MIT-licensed and open-source; anyone running a fork will be sending events into the upstream PostHog. Worth prioritizing an env-var override.

## Recommended first 5 tickets

| # | Title | Scope |
|---|-------|-------|
| 1 | Allow PostHog key/host override via env | Change `src/telemetry/analytics.js:11-12` to read `process.env.GIT_WATCHTOWER_TELEMETRY_API_KEY` and `_HOST` with fallback to the hardcoded defaults. Unblocks forks and self-hosters. |
| 2 | Fix `captureError` message loss | `src/telemetry/analytics.js:144` — change `errorCode \|\| (error.message \|\| '').substring(0, 200)` to concatenate both, e.g. `errorCode ? \`${errorCode}: ${error.message}\` : error.message`. Add a unit test. |
| 3 | Collapse `captureAlways` into `capture` | Add `{ overrideDistinctId, bypassEnabled }` params to `capture`. Delete the duplicated HTTPS logic in `captureAlways`. Touches `analytics.js` and `index.js:64,69`. |
| 4 | Add debug-mode logging to all telemetry catches | Behind `DEBUG=watchtower:telemetry`, emit the swallowed error to stderr. No production impact, huge debuggability win. |
| 5 | Distinguish "no config" from "corrupt config" in `loadTelemetryConfig` | `src/telemetry/config.js:36-47` — return `null` only on `ENOENT`; on `SyntaxError` log a one-line warning so users know why they're being re-prompted. |
