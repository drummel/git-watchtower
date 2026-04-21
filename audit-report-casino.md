# Audit Report: casino

## Summary
- **Total findings:** 18 (H: 2, M: 8, L: 8)
- **Top 3 most concerning patterns:**
  1. **Massive module-level mutable state.** `src/casino/index.js:15-48` declares `let casinoEnabled`, `casinoStats`, `marqueeFrame`, `marqueeInterval`, `slotReelFrame`, `slotReelInterval`, `isSpinning`, `slotResult`, `slotResultIsWin`, `slotResultFlashFrame`, `slotResultInterval`, `slotResultRenderCallback`, `slotResultLabel`, `winAnimationFrame`, `winAnimationInterval`, `currentWinLevel`, `marqueeCallback`, `lossAnimationFrame`, `lossAnimationInterval`, `lossMessage`. **Twenty+ module-scoped mutable bindings** — the whole module is one big singleton, no constructor, impossible to instantiate twice. Parallel to the same smell in `src/stats/session.js`.
  2. **Parallel tracking with `src/stats/session.js`.** Already captured in the stats audit, but restating for this audit's scope: `casino.recordPoll(hadUpdates)` and `sessionStats.recordPoll(hadUpdates)` are called back-to-back at `bin/git-watchtower.js:1898,1903,1907`. The casino version also tracks `totalLines`, `consecutivePolls`, `hitRate`, etc. which overlap with `sessionStats.totalLinesAdded/Deleted/recordChurn`. Two counters for every lever pull.
  3. **Dead sound API surface.** `playWin`, `playMegaJackpot`, `playSpin`, `getSoundPath`, `SOUNDS_DIR` are all exported from `src/casino/sounds.js` but have **zero callers outside the file itself** (grep confirms only `playForWinLevel`, `playLoss`, and `playJackpot` are called from `bin/git-watchtower.js`). The dead exports include `playMegaJackpot`, which is still reachable because `playForWinLevel` calls it internally — but `playSpin`, `playWin` (direct), `getSoundPath`, and `SOUNDS_DIR` have no consumer at all.

## Findings by category

### 1. Copy-paste duplication
- [ ] `src/casino/index.js:556-569` (`recordPoll`) parallels `src/stats/session.js:30-55` and is called adjacent to it at `bin/git-watchtower.js:1898-1907`. Same signature, overlapping stats (high — already in stats report).
- [ ] `src/casino/index.js:17-28` (`casinoStats` fields `totalLinesAdded`, `totalLinesDeleted`, `sessionStart`) duplicates `src/stats/session.js` state 1:1. Two separate accumulators for the same numbers (medium).
- [ ] `src/casino/index.js:17-28` vs `633-647` (`resetStats`) — the `casinoStats` initial object is duplicated verbatim between the module-load initializer and the `resetStats` body. Extract an `initialStats()` helper (low).
- [ ] `bin/git-watchtower.js:964-995` — `CASINO_WIN_MESSAGES`, `CASINO_PULL_MESSAGES`, `CASINO_LOSS_MESSAGES` and `getCasinoMessage` live in `bin` while the rest of the casino surface lives in `src/casino/`. Split-brain ownership — the one data table that is easiest to extend is parked in the opposite module from the feature (medium).
- [ ] `src/casino/index.js:263-281` — a chained `if / else if / else if` ladder maps `winLevel.key → { text, color, emoji, isJackpot }` while lines 66-73 already hold exactly that data in `WIN_LEVELS`. The label table should be one source of truth — read it off `WIN_LEVELS[key]` instead of re-encoding (medium).
- [ ] `src/casino/index.js:401-408` (`getWinLevel`) and `src/casino/index.js:263-281` both switch on the same win-level boundaries / keys. If thresholds move in `WIN_LEVELS`, the second ladder must be hand-edited (medium).

### 2. Silent failures and swallowed exceptions
- [ ] `src/casino/sounds.js:74-76` — blanket `catch (e) { /* Silently fail - sounds are optional */ }`. Acceptable policy but identical to the telemetry catches; no `DEBUG=watchtower:sounds` hook, no way to diagnose "my sound doesn't play" in production (low).
- [ ] `src/casino/sounds.js:60,63-67,70-72` — every `execFile` callback is `() => {}`. The `paplay → aplay` fallback silently eats the reason `paplay` failed; if `paplay` is installed but the default sink is broken, the user gets no signal (low).

### 3. Lazy type assertions
- _None found._ (Module is internal; inputs are trusted.)

### 4. Promise misuse
- _None found._ (The module is callback-driven; no Promise use to misuse.)

### 5. Dead and orphaned code
- [ ] `src/casino/sounds.js:237-244` — exported but uncalled outside this file: `playWin` (direct), `playSpin`, `playMegaJackpot` (direct), `getSoundPath`, `SOUNDS_DIR`. All only reached internally via `playForWinLevel`. Five dead exports (medium).
- [ ] `src/casino/sounds.js:164-170` (`playSpin`) — referenced by no caller. The comment even admits "No fallback for spin - it would be annoying" — nothing calls it to begin with (medium).
- [ ] `bin/git-watchtower.js:981-988` — `CASINO_PULL_MESSAGES` is declared but `getCasinoMessage('pull')` is never called (only `'win'` at line 1880 and `'loss'` at line 2027). The whole pull-message array is dead (medium).
- [ ] `src/casino/index.js:633-647` (`resetStats`) — exported but grep shows only test usage (5 call sites in `tests/unit/casino/index.test.js`). No production caller (low).
- [ ] `src/casino/index.js:678-721` — the full exports list includes `getHeaderBadge`, `startMarquee`, `stopMarquee`, `hasSlotResult`, `getSlotResultLabel`, `isWinAnimating`, `isLossAnimating`. Quick spot-check against bin grep output shows `getHeaderBadge`, `startMarquee`, `stopMarquee`, `hasSlotResult`, `isWinAnimating`, `isLossAnimating` are not called from `bin/git-watchtower.js`. Tests may cover them, but they look externally dead (low — verify).

### 6. Circular imports
- _None found._ (`casino/index.js` imports `../ui/ansi` only; `casino/sounds.js` imports only node stdlib.)

### 7. Abstractions that abstract nothing
- [ ] `src/casino/index.js:122-130` — `setRenderCallback(callback)` is a one-line setter (`marqueeCallback = callback`) that could be inlined. The module-level `let marqueeCallback` plus the setter plus the consumer is a three-line mini-Observer pattern for one subscriber (low).
- [ ] `src/casino/sounds.js:47-77` (`playFile`) — 30-line cross-platform dispatcher that could be collapsed to a small platform→command table. Not slop per se, but the shape (`if darwin ... else if linux ... else if win32 ...`) is exactly where a `const PLATFORM_PLAYERS = { darwin: ..., linux: ..., win32: ... }` would shine (low).

### 8. Hardcoded values that should be config
- [ ] `src/casino/index.js:143` — `setInterval(..., 150)` marquee tick magic; `src/casino/index.js:238` — `setInterval(..., 100)` slot reel tick magic (comment even says "25% slower than original 80ms"); `src/casino/index.js:306` — `setInterval(..., 150)` flash magic; `src/casino/index.js:320` — `setTimeout(..., 2000)` display duration magic; `src/casino/index.js:444` — `setInterval(..., 100)` win-animation magic; `src/casino/index.js:509` — `setInterval(..., 120)` loss-animation magic. Six different intervals, all tuned independently. A `TIMING` table would make Casino mode configurable and consistent (medium).
- [ ] `src/casino/index.js:294` — `flashDuration = slotResultLabel.isJackpot ? 40 : 20` magic; `src/casino/index.js:439` — `winAnimationFrame > 20` magic; `src/casino/index.js:504` — `lossAnimationFrame > 15` magic. Frame-count durations have to be kept in sync with the intervals above (low).
- [ ] `src/casino/index.js:429-431` — `500`, `1000`, `5000` line thresholds for `bigWins`/`jackpots`/`megaJackpots` duplicate the `WIN_LEVELS.huge.min` / `.jackpot.min` / `.mega.min` thresholds. If `WIN_LEVELS` changes, these stat counters silently drift (medium).
- [ ] `src/casino/sounds.js:36-41` — `VOLUME` table hardcoded; never overridable (low).
- [ ] `src/casino/index.js:595-600` — `baseLuck = 50 + Math.random() * 30`, `streakBonus = Math.min(...*5, 20)`, `houseEdge = 55 + Math.random() * 45` — pure magic numbers with no comments on why these ranges. Fine as UI flavor, but the mix of tuned constants with no name suggests these will be tweaked again (low).

### 9. Stale/deprecated vocabulary
- [ ] `src/casino/index.js:71` — `WIN_LEVELS.jackpot` vs `WIN_LEVELS.mega` are both labeled "JACKPOT" in the display ladder. The term is overloaded — "jackpot" is one of two jackpot-tier levels, AND a synonym for `bigWins ≥ 500`. Rename one (low).

### 10. Observability gaps
- [ ] `src/casino/sounds.js` — no logging at all. In production, "sounds don't work" is nearly impossible to debug (low).
- [ ] `src/casino/index.js:140-142` — the marquee tick calls `marqueeCallback()` every 150ms with no try/catch. If the callback throws, the whole interval will be uncatchable at the caller. Store's listener pattern at `src/state/store.js:287-294` wraps listeners in try/catch — the casino callback should do the same (low).

### 11. Drift and inconsistency
- [ ] `src/casino/index.js` singleton model vs `src/state/store.js` Store class vs `src/stats/session.js` module singleton — three patterns for "this module has session-scoped state" (medium — cross-cutting).
- [ ] `casino.recordPoll` and `stats.recordPoll` are called from bin back-to-back; both accept the same `hadUpdates` argument; both mutate overlapping fields — but they live in separate modules and are consumed by separate renderers. Classic drift (medium).
- [ ] `casinoStats.totalLinesAdded/totalLinesDeleted` vs `stats.totalLinesAdded/totalLinesDeleted` — the same names in two singletons, both updated by bin. Which is the "real" session total? (medium).

## Cross-cutting observations

Casino is the largest example of "entertainment feature layered onto the domain layer." It has its own stats table that duplicates `sessionStats`, its own render loop that must be coordinated with the main renderer via callbacks, its own sound system, its own set of message-flavor constants (split across bin and the casino module), and its own win-level ladder repeated in at least two places (`WIN_LEVELS` + the `stopSlotReels` label mapper + the `bigWins/jackpots/megaJackpots` thresholds).

The `setRenderCallback` + module-level `marqueeCallback` pattern is an early sketch of what the `Store` middleware hook was *supposed* to provide. If the Store had actually been adopted, casino would have subscribed to state keys and rendered from there, instead of maintaining a parallel callback wire.

Sound effects are the one area with no obvious duplication elsewhere in the codebase (browser/sound utilities in `utils/` are for "update" chimes, not win/loss). But the five dead exports in `src/casino/sounds.js` show the same "build the surface, then only wire up part of it" pattern seen in `src/utils/async.js`.

The `casinoStats` + `resetStats` pair is an accidental class — take those bindings, wrap them in a `new CasinoStats()` constructor, and the whole module becomes testable without the test having to remember to call `resetStats()` between cases (as all 28 casino tests currently do).

## Recommended first 5 tickets

| # | Title | Scope |
|---|-------|-------|
| 1 | Collapse `casino.recordPoll` into `sessionStats` | Make `sessionStats` the single source of poll + line-change truth. Casino should consume stats for display (streaks, hit rate, totals) instead of tracking them separately. Touches `src/casino/index.js:556-647`, `src/stats/session.js`, `bin/git-watchtower.js:1898-1907,1970-2005`. |
| 2 | Delete dead exports in `src/casino/sounds.js` | `playSpin`, `playWin` (direct export), `playMegaJackpot` (direct export), `getSoundPath`, `SOUNDS_DIR` have no external callers. Keep them as private helpers inside the module; export only `playForWinLevel`, `playLoss`, and `playJackpot`. Delete `CASINO_PULL_MESSAGES` in bin while you're in there — it's never read. |
| 3 | Drive the label ladder from `WIN_LEVELS` | Move the `text`/`emoji`/`isJackpot` metadata into `WIN_LEVELS` entries so `stopSlotReels:263-281` can read `WIN_LEVELS[winLevel.key].text` instead of re-encoding the ladder. Same for the `500`/`1000`/`5000` line thresholds at lines 429-431 — reference `WIN_LEVELS.huge.min` etc. Two places that must agree today; one place after this ticket. |
| 4 | Move `CASINO_*_MESSAGES` into `src/casino/index.js` | They are casino feature data; they belong in the casino module, not bin. Export `getCasinoMessage(type)` from `src/casino/index.js` and re-point the two bin callers (lines 1880, 2027). |
| 5 | Extract `TIMING` constants table | One object — `{ marqueeTickMs: 150, slotSpinTickMs: 100, flashTickMs: 150, winTickMs: 100, lossTickMs: 120, noWinDisplayMs: 2000, flashFramesWin: 20, flashFramesJackpot: 40, winFrames: 20, lossFrames: 15 }` — at the top of `src/casino/index.js`. All six `setInterval` / `setTimeout` calls and all three frame-count loops read from this. Unlocks a `--casino-speed=fast|normal|slow` flag later. |
