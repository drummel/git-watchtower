# Audit Report: src/index.js

**Scope:** `src/index.js` — a 190-line re-export barrel that surfaces ~80 symbols from 18 src/ submodules under a single `require('./src')` interface.

## Summary
- **Total findings:** 4 (H: 1, M: 2, L: 1)
- **Top 3 most concerning patterns:**
  1. **Zero production consumers.** Grep for `require('./src')`, `require('../src')`, `require('../../src')` returns only the three example lines inside `src/index.js`'s own JSDoc (lines 8-10). Bin imports from the deep paths (`require('../src/state/store')`, `require('../src/server/web')`, etc.) and so do the tests. **The barrel is unused.**
  2. **The barrel re-exports dead symbols.** Because it re-exports *everything* each submodule offers, it also re-exports the dead-export findings flagged in every per-module report: `wordWrap`, `horizontalLine`, `style`, `pad`, `indicators` (ui), `checkout`, `getPreviewData`, `detectBranchChanges`, `getLocalBranches`, `localBranchExists`, `generateSparkline` (git/branch), `ProcessManager` (server/process), `DEFAULT_WEB_PORT`. The barrel gives these dead exports a second "supported" veneer.
  3. **JSDoc promises a public API that doesn't exist.** Lines 1-11 describe `src/index.js` as "the main entry point for the refactored modules. Import what you need from this file." No one does. No README points at it; no `package.json` `main` field exposes it (package.json `main` points at `bin/git-watchtower.js`).

## Findings by category

### 1. Copy-paste duplication
- _None_ — barrel is pure re-export; no logic duplicated.

### 2. Silent failures and swallowed exceptions
- _N/A_ — no logic.

### 3. Lazy type assertions
- _N/A_ — no runtime code.

### 4. Promise misuse
- _N/A_.

### 5. Dead and orphaned code
- [ ] **The entire file is dead.** `src/index.js` has no consumers in production (bin) or tests. Both import from the deep paths. Deleting this file would be a no-op for runtime; only the aspirational JSDoc goes with it (high).

### 6. Circular imports
- [ ] **Risk amplifier.** Because the barrel imports every submodule at load time, if it *were* ever imported, it would force-load all of `src/*` in one shot. Not a cycle today, but any future `src/* → src/index.js` edge would instantly become one (low — hypothetical).

### 7. Abstractions that abstract nothing
- [ ] **The barrel is the abstraction.** `require('./src').Store` vs `require('./src/state/store').Store` — one level of indirection, zero semantic benefit, and a sync-burden: every new export in a submodule must be manually listed here or it's "missing from the public API" (medium).

### 8. Hardcoded values that should be config
- _N/A_.

### 9. Stale/deprecated vocabulary
- [ ] `src/index.js:174` — `CLI_PACKAGE_VERSION: cliArgs.PACKAGE_VERSION` renames-on-export. The source is `PACKAGE_VERSION`; the barrel exposes it as `CLI_PACKAGE_VERSION`. Two names for one value, divided by the barrel (low; see `drift`).

### 10. Observability gaps
- _N/A_.

### 11. Drift and inconsistency
- [ ] **Re-export style is inconsistent.** Most symbols keep their original name (`Store: state.Store`); some are renamed (`CLI_PACKAGE_VERSION: cliArgs.PACKAGE_VERSION`); whole modules are re-exported as objects (`renderer: rendererModule`, `actions: actionsModule`, `telemetry: telemetryModule`). Three shapes of re-export in one file — a caller of `src/index` cannot predict whether a subsystem is flat-destructured or nested (medium).

## Cross-cutting observations

This file is what happens when an architect drafts the "how I'd like callers to consume this library" facade before confirming that any caller exists. The facade is well-intentioned: a single import point is genuinely useful for a library. But `git-watchtower` is a *CLI application*, not a library — `package.json:main` points at `bin/git-watchtower.js`, not at `src/index.js`; there is no `module` field, no `exports` map, no published TypeScript defs. The barrel was a hedge against "we might publish this as a library someday," and the day has not arrived.

The barrel amplifies every other audit report's §5 finding by re-surfacing dead exports as "official API." Deleting `src/index.js` would, at a stroke, remove the implicit contract that makes some of the dead exports feel load-bearing.

## Recommended first 5 tickets

| # | Title | Scope |
|---|-------|-------|
| 1 | Decide: publish as library, or delete `src/index.js` | The binary question. If "library someday," add `main`/`exports` to package.json, write an API doc, and make bin consume from `./src`. If not, delete the file. Today's state is the worst of both. |
| 2 | If deleting: remove `src/index.js` and update the JSDoc examples in affected modules | One PR, one-line delta per file at most. |
| 3 | If keeping: rename `CLI_PACKAGE_VERSION` back to `PACKAGE_VERSION` (or remove the alias) | Eliminate drift §11. |
| 4 | If keeping: drop the five dead ui/ansi re-exports (`wordWrap`, `horizontalLine`, `style`, `pad`, `indicators`) and the six dead git/branch re-exports | Aligns the barrel with what's actually supported. Pairs with the `ui` and `git` reports' dead-export tickets. |
| 5 | If keeping: pick one re-export shape (flat destructure vs. module-as-object) and apply it uniformly | `renderer: rendererModule` plus 80 flat symbols is a signal of unfinished thought, not a design choice. |
