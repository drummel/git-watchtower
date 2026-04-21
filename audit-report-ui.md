# Audit Report: ui

## Summary
- **Total findings:** 14 (H: 2, M: 6, L: 6)
- **Top 3 most concerning patterns:**
  1. **`drawBox` / `clearArea` re-aliased to be re-wrapped.** `bin/git-watchtower.js:802` imports them under new names (`renderBox`, `renderClearArea`), specifically so that `bin/git-watchtower.js:1161-1167` can define local `drawBox(...) { write(renderBox(...)); }` and `clearArea(...) { write(renderClearArea(...)); }` wrappers. Pure "rename on import so I can keep my old name" ceremony. The wrappers add `write(...)` — a single function call. Every caller in bin could have called `write(renderBox(...))` directly.
  2. **`generateSparkline` collision with `src/git/branch.js`.** (Flagged in the git audit; restating here for the ui lens.) `src/ui/ansi.js:220` is the pure "given counts → characters" version. `src/git/branch.js:315` is a dead async version. `bin/git-watchtower.js:1027` is a third local version that is what the bin actually uses. The pure `ui/ansi` one is sound; bin's local version shadows it for no semantic gain.
  3. **`src/ui/keybindings.js`'s `MODES` enum is the mode-system refactor that never shipped.** Same state audit flagged that bin uses scattered booleans (`searchMode`, `previewMode`, `historyMode`, `infoMode`, `logViewMode`, `actionMode`) for UI mode. `src/ui/keybindings.js:23-31` defines `MODES` as the string-enum replacement and `getCurrentMode(state)` at line 44-52 reads those **same booleans and picks a mode label**. Two parallel mode systems, and the new one is reached only via tests.

## Findings by category

### 1. Copy-paste duplication
- [ ] `bin/git-watchtower.js:1161-1167` one-line wrappers around `renderBox`/`renderClearArea` — pure rewrap (high — see top finding).
- [ ] `src/ui/ansi.js:220-257` `generateSparkline` vs `bin/git-watchtower.js:1027` local `generateSparkline` vs `src/git/branch.js:315` async version — three implementations, already flagged (high; see git report).
- [ ] `src/ui/actions.js` `getDisplayBranches(state)` and `src/state/store.js:504-511` `getFilteredBranches(state)` — different names, same logic: "filteredBranches if present, else branches". Two copies (medium).
- [ ] `src/ui/keybindings.js:44-52` `getCurrentMode(state)` — reads the same boolean flags bin uses directly. The function and the inline "if (searchMode)... if (previewMode)..." ladder in `bin/git-watchtower.js` duplicate the same logic (medium).

### 2. Silent failures and swallowed exceptions
- _None found_ — ui modules don't throw and don't IO (pure rendering).

### 3. Lazy type assertions
- [ ] `src/ui/ansi.js:289-293` (`stripAnsi`) uses a narrow regex `\x1b\[[0-9;]*m` that only strips SGR sequences. `src/ui/ansi.js:295-299` (`visibleLength`) uses the same regex to compute visible length. If any other ANSI escape (title-set, cursor-save, etc.) is ever emitted, visible length will be wrong. Narrow but undocumented assumption (low).

### 4. Promise misuse
- _None found_ — ui modules are synchronous.

### 5. Dead and orphaned code
- [ ] `src/ui/ansi.js:493-515` exports — at least **five dead exports**: `wordWrap`, `horizontalLine`, `style`, `pad`, and `indicators` are only referenced in `tests/unit/ui/ansi.test.js`. Not imported by renderer.js, not imported by bin, not imported by actions.js (medium).
- [ ] `src/ui/ansi.js:206-209` (`sparkline` constants) — exported and re-imported by bin as `uiSparkline`. Fine as constants, but bin never actually reads them (the chars are re-hardcoded in bin's own `generateSparkline` function at line 1027). Dead import chain (low).
- [ ] `src/ui/keybindings.js:23-31` (`MODES`) — exported but no production consumer. `getCurrentMode(state)` returns a `MODES.*` value but `getCurrentMode` itself has no production callers either (tests only) (medium).
- [ ] `src/ui/keybindings.js:44-52` (`getCurrentMode`) — tests-only caller. Useful future abstraction, but today it's aspirational (medium).

### 6. Circular imports
- _None found._ (`actions.js` imports `keybindings.js`; `renderer.js` imports `ansi.js`; no cycles.)

### 7. Abstractions that abstract nothing
- [ ] `bin/git-watchtower.js:1161-1167` — the `drawBox`/`clearArea` wrappers (see top finding). Deleting them and calling `write(renderBox(...))` inline is both shorter and avoids the aliased import (high).
- [ ] `src/ui/ansi.js:411-425` — `padRight(str, len)` and `padLeft(str, len)` exist alongside `pad(str, len, char, side)`. `pad` is a generalized form of both. Three exported functions where one suffices (low).

### 8. Hardcoded values that should be config
- [ ] `src/ui/ansi.js:433-438` (`getMaxBranchesForScreen`) — magic formula: `availableHeight = terminalHeight - 2 - maxLogEntries - 5 - 2`, with the unexplained `5` and `2` constants (header/footer/borders). A named-constants object would make this self-documenting. The renderer's assumption about layout lives here, invisibly (medium).
- [ ] `src/ui/ansi.js:207` — `sparkline.chars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']` is duplicated in `src/server/web-ui/pure.js:52` (`var chars = '▁▂▃▄▅▆▇█'`) and in `bin/git-watchtower.js:1027`'s `generateSparkline`. Three places encode the same eight glyphs (medium).

### 9. Stale/deprecated vocabulary
- [ ] `src/state/store.js:61` marks `mode` as legacy; `src/ui/keybindings.js:23-31` `MODES` is the fresh-but-unadopted replacement. The UI mode concept drifts across three modules — state.mode (legacy), per-feature booleans (bin), MODES enum (keybindings) (medium — cross-cutting with state audit).

### 10. Observability gaps
- _None found_ — rendering should not log.

### 11. Drift and inconsistency
- [ ] `src/ui/ansi.js` exports both `padRight(str, len)` and `pad(str, len, char, side)`. Inconsistent API style (positional vs parameterized) (low).
- [ ] Three different names for "get the list currently on screen": `ui/actions.js:getDisplayBranches`, `state/store.js:getFilteredBranches`, and the web's `server/web-ui/pure.js:getDisplayBranches`. Same concept, three modules (medium).

## Cross-cutting observations

`src/ui/ansi.js` is well-engineered — pure functions, good test coverage, explicit about the SGR-only regex limitation. Half the surface is unused, but that's a "delete the dead exports" ticket, not a design flaw. The single clearest bad smell in ui/ is the wrapper pattern in bin: `renderBox → drawBox(row, col, ...) { write(renderBox(row, col, ...)) }` is the canonical "I imported it, renamed it, then wrapped it to keep using the old name." Deletion of the two three-line wrappers would signal intent.

`src/ui/keybindings.js:MODES + getCurrentMode` is another half-finished refactor — the replacement for the per-feature booleans exists, is tested, but is never called. Combined with `src/state/store.js:setMode` (also never called), there's a complete UI-mode abstraction sitting on the shelf that has to be either adopted or deleted.

`renderer.js` at 1596 lines is large enough to deserve its own deep-dive audit — out of scope for this pass, but flagging that it's the heaviest single src/ file by 3x.

## Recommended first 5 tickets

| # | Title | Scope |
|---|-------|-------|
| 1 | Delete bin's `drawBox` / `clearArea` wrappers | `bin/git-watchtower.js:1161-1167`. Replace callers (3 sites) with inline `write(drawBox(...))` / `write(clearArea(...))`. Remove the `renderBox`/`renderClearArea` aliases at line 802 — import the originals directly. |
| 2 | Delete `wordWrap`, `horizontalLine`, `style`, `pad`, `indicators` from `ansi.js` exports | No production caller. Keep them as private helpers or delete the tests if the functions have no future. One less "looks supported, isn't" export. |
| 3 | Decide: adopt `MODES` or delete it | Follow the state-audit's "pick one UI-mode model" ticket. If adopting: migrate bin from boolean flags to `state.mode: MODES.SEARCH` and use `getCurrentMode(state)` as the derivation. If deleting: drop `MODES`, `getCurrentMode`, and the corresponding test file. |
| 4 | Consolidate `generateSparkline` (see git report) | Delete bin's local (line 1027); delete `src/git/branch.js:315`; keep `src/ui/ansi.js:220` as the pure source of truth, called by bin on the counts returned from `getCommitsByDay`. |
| 5 | Unify sparkline glyphs into one constant | `src/ui/ansi.js:207` should be the only place those eight block characters appear. `src/server/web-ui/pure.js:52` should import or (since it's inlined at build time) reference a shared constant emitted into the browser bundle. |
