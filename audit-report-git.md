# Audit Report: git

## Summary
- **Total findings:** 17 (H: 3, M: 8, L: 6)
- **Top 3 most concerning patterns:**
  1. **Three `generateSparkline` functions, two named identically.** `src/git/branch.js:315-333` exports `generateSparkline(branchName, options)` (async, shells to git). `src/ui/ansi.js:220` exports `generateSparkline(dataPoints, options)` (pure, takes numeric array). `bin/git-watchtower.js:1027` defines a **third** local `generateSparkline(commitCounts)` that the bin actually uses. The git-branch async version has no production caller (bin fetches counts via `getCommitsByDay` directly, then calls the bin's local formatter). Two of the three are production-dead; one of the pure-function pair is shadowed by the inline bin helper.
  2. **`branch.checkout`, `branch.getPreviewData`, and bin's inline equivalents are parallel.** `src/git/branch.js:210-254` exports `checkout()`, which encapsulates "sanitize name → check local-branch-list → check out or create-from-remote." `bin/git-watchtower.js:1486-1492` reimplements exactly that flow inline with raw `execGit` calls. Same story for `getPreviewData`: `src/git/branch.js:265-305` vs `bin/git-watchtower.js:1090` (the bin's version is what callers actually use at 2777, 3084). The module functions are dead.
  3. **`src/git/branch.js` has six dead exports.** Beyond `checkout` and `getPreviewData`: `detectBranchChanges`, `getLocalBranches`, `localBranchExists`, and the module's own `generateSparkline` are all exported, re-exported via `src/index.js`, and have zero production callers (grep hits only `src/index.js`, `src/git/branch.js` itself, and `tests/`). Six of twelve exports are consumed only by the test suite and the re-export barrel.

## Findings by category

### 1. Copy-paste duplication
- [ ] `bin/git-watchtower.js:1486-1492` duplicates `src/git/branch.js:228-245` (checkout) — both do `execGit(['branch','--list'])` → split → check → `checkout safeName` / `checkout -b safeName remote/safeName` (high).
- [ ] `bin/git-watchtower.js:1090` defines a local `getPreviewData` that parallels `src/git/branch.js:265-305`. Same name, same purpose, different call sites (high).
- [ ] `bin/git-watchtower.js:1591,1979` hand-roll `execGit(['pull', REMOTE_NAME, branch], { cwd, timeout: 60000 })` instead of calling `src/git/commands.js:164-174` `pull(remoteName, branchName, cwd)`. Same timeout, same command shape, twice in the bin (medium).
- [ ] `bin/git-watchtower.js:1027` defines `generateSparkline(commitCounts)` shadowing both the pure `src/ui/ansi.js:220` and the async `src/git/branch.js:315`. Three implementations of the same idea (high).
- [ ] `src/git/branch.js:104-105` and `src/git/branch.js:129-130` — the `for-each-ref` format string `"%(refname:short)${delimiter}%(committerdate:iso8601)${delimiter}%(objectname:short)${delimiter}%(subject)"` is duplicated verbatim for local and remote refs. Extract a constant (low).
- [ ] `src/git/branch.js:225-229` (checkout's `execGit(['branch', '--list'])` + `split('\n').replace(/^\* /, '')`) duplicates `src/git/branch.js:340-350` (`getLocalBranches`). The `checkout` function could call `getLocalBranches` instead (low).

### 2. Silent failures and swallowed exceptions
- [ ] `src/git/commands.js:70-76` (`execGitSilent`) — pure swallow: `catch (error) { return null; }`. Caller must null-check every result. Grep shows `execGitSilent` callers are mostly in `branch.js` and bin; several bin sites use `if (result)` guards, but the pattern (null-to-mean-failure) hides whether the operation truly returned empty vs. errored. Medium-risk policy (medium).
- [ ] `src/git/branch.js:75-77,174-178` — `getCurrentBranch` returns `{ name: null, ... }` on any error; `getAllBranches` wraps in `throw new GitError` — **inconsistent error strategies across sibling functions in the same module**. Callers can't rely on "if it throws it's a git problem" (medium).
- [ ] `src/git/branch.js:296-299` — "May fail if branches have no common ancestor" empty catch — acceptable, but any other error is also swallowed (low).
- [ ] `src/git/branch.js:302-304` — outer `catch { return { commits: [], files: [] }; }` — validates the pattern: the whole function is "best effort" but nothing logs or signals failure (low).
- [ ] `src/git/commands.js:243-245` (`getCommitsByDay`) — `catch (error) { /* Return zeros on error */ }`. Zero-array silently means "no activity" OR "git failed" — the sparkline cannot distinguish (low).
- [ ] `src/git/remote.js:79-80` — `catch (e) { /* ignore */ }` for invalid URLs. Returns `'github'` as default, which is a strong assumption; a log line under DEBUG would help (low).

### 3. Lazy type assertions
- [ ] `src/git/branch.js:143` — `/** @type {Branch|undefined} */ (branchList.find(...))` is a reasonable jsdoc cast (find's return type is widened); acceptable (low).
- [ ] `src/git/commands.js:44-45` — attaches `error.stderr = stderr` on the raw Node error object. Low risk, but it's a lazy tack-on (no typedef, pattern spreads to `GitError.fromExecError` via `error.stderr`) (low).

### 4. Promise misuse
- _None found._ (All async functions are properly awaited; no floating promises in this module.)

### 5. Dead and orphaned code
- [ ] `src/git/branch.js:210-254` (`checkout`) — zero callers outside `src/index.js` re-export and tests. Bin reimplements inline (high).
- [ ] `src/git/branch.js:265-305` (`getPreviewData`) — same story; bin has its own at 1090 (high).
- [ ] `src/git/branch.js:187-199` (`detectBranchChanges`) — re-exported via `src/index.js:128` but no production consumer (medium).
- [ ] `src/git/branch.js:340-350` (`getLocalBranches`) — tests + barrel only (medium).
- [ ] `src/git/branch.js:358-361` (`localBranchExists`) — tests + barrel only (medium).
- [ ] `src/git/branch.js:315-333` (`generateSparkline`) — tests + barrel only; bin uses the inline version. Note: this is the async/git-shelling version; the pure one in `ui/ansi.js` is what the bin sparkline really wraps (medium).
- [ ] `src/git/commands.js:82-89` (`isGitAvailable`) — only referenced by bin as `checkGitAvailable` (line 87) for an early guard. OK — confirmed used. Positive note; not dead.
- [ ] `src/git/commands.js:96-103` (`isGitRepository`) — no production caller (bin does its own `.git` check inline elsewhere). Re-exported via `src/index.js` (low).
- [ ] `src/git/commands.js:110-117` (`getRemotes`) — no production caller; bin at line 1443 runs its own `execGit(['remote'])`. Dead (low).
- [ ] `src/git/commands.js:125-128` (`remoteExists`) — no production caller (low).
- [ ] `src/git/commands.js:185-198` (`log`) — exported, used once internally by `src/git/branch.js:273`. If `getPreviewData` is dead, `log` is dead by extension (low).

### 6. Circular imports
- _None found._ (`commands.js` has no cross-module imports besides `utils/errors`; `branch.js` imports `commands.js`; `pr.js` / `remote.js` have no cross-module imports.)

### 7. Abstractions that abstract nothing
- [ ] `src/git/pr.js:100-102` — `isBaseBranch(name)` is a one-line `return BASE_BRANCH_RE.test(name)`. Fine, but the regex and the helper are both exported — a caller could do either. Two ways to do the same check (low).
- [ ] `src/git/commands.js:70-76` (`execGitSilent`) — a three-line try-wrap of `execGit`. Whether this helper adds enough value over `.catch(() => null)` at the call site is debatable. Kept in as a "convenience abstraction that could just be inline" (low).

### 8. Hardcoded values that should be config
- [ ] `src/git/commands.js:10-16` — `DEFAULT_TIMEOUT = 30000`, `FETCH_TIMEOUT = 60000`, `SHORT_TIMEOUT = 5000` are exported, but `FETCH_TIMEOUT` is used inline at `bin/git-watchtower.js:1591,1979` as `timeout: 60000` rather than the imported constant (medium).
- [ ] `src/git/commands.js:40` — `maxBuffer: 10 * 1024 * 1024` magic (10MB) — fine, but undocumented (low).
- [ ] `src/git/commands.js:219` — `timeout: 10000` magic inside `getCommitsByDay` — inconsistent with `DEFAULT_TIMEOUT/SHORT_TIMEOUT/FETCH_TIMEOUT` naming scheme; just an inline number (low).
- [ ] `src/git/branch.js:10` — `VALID_BRANCH_PATTERN = /^[a-zA-Z0-9_\-./]+$/` is exported but "valid git branch name" varies by context. Reasonable conservative allowlist; keep (positive note).

### 9. Stale/deprecated vocabulary
- _None found._ (Terminology is internally consistent — no ghosts of "origin"/"upstream"/"tracking" confusion.)

### 10. Observability gaps
- [ ] `src/git/commands.js:73` (`execGitSilent`) — "silent" really means "returns null". No debug hook, no indication of how many silent failures have happened. See the same issue under Silent Failures (low).
- [ ] `src/git/branch.js:174-178` — the thrown `GitError` includes `originalError: error` in details — good. Keep this pattern (positive note).
- [ ] `src/git/commands.js:57-61` — `GitError.fromExecError(error, command, error.stderr)` rehydrates a structured error with command + stderr context. Good. Keep (positive note).

### 11. Drift and inconsistency
- [ ] `hasUncommittedChanges` is imported as `checkUncommittedChanges` at bin:87 — rename at the import site for no clear reason. Bin has three such aliasings (`checkGitAvailable`, `getCurrentBranchRaw`, `getAllBranchesRaw`) at lines 85-87, suggesting these names collide with local bin helpers. Worth investigating whether the locals can be deleted in favor of the src imports (medium).
- [ ] Error style: `src/git/branch.js` mixes **return-result** (`checkout`, `deleteGoneBranches`), **return-default-on-error** (`getCurrentBranch`, `getPreviewData`, `getLocalBranches`, `getGoneBranches`, `generateSparkline`), and **throw** (`getAllBranches`, `sanitizeBranchName`). Three error strategies in one module (medium).
- [ ] `src/git/commands.js:fetch` returns `{success, error?}` while `src/git/commands.js:pull` also returns `{success, error?}` — consistent there. But `log` throws and `getCommitsByDay` returns zeros on error — four functions, three error strategies (medium).
- [ ] `BASE_BRANCH_RE = /^(main|master|develop|development|staging|production|trunk|release)$/` at `src/git/pr.js:93` — no `next`, no `preprod`, no `canary`. Likely fine, but this list is the kind of thing that ages poorly without a config escape hatch (low).

## Cross-cutting observations

`src/git/` is the most cleanly-structured module in the codebase (clear separation: `commands.js` = raw exec, `branch.js` = domain objects, `remote.js` = URL parsing, `pr.js` = PR JSON parsing). The test coverage is strong (every function in branch.js has integration tests, every function in pr.js and remote.js has unit tests).

And yet half of `branch.js` is production-dead, because the bin — which is where the refactor should have landed — kept its own inline implementations. The bin adopted the submodules for parsing (`parseGitHubPr`, `parseGitLabMr`, `parseRemoteUrl`, `buildWebUrl`), but not for any of the *action* functions (`checkout`, `getPreviewData`, `pull`). This is the same pattern as `src/state/store.js` — an extracted class whose methods were never called by the consumer they were extracted from.

Three `generateSparkline` functions, two named identically, is the single most alarming finding. The pure one in `ui/ansi.js` is what you'd want — but bin shadows it with its own, and `git/branch.js`'s async version is unused. The ambiguity here is the exact kind of thing that leads to "I fixed the sparkline rendering but it didn't change anything" bug reports.

The `execGitSilent` pattern deserves a re-think: it's convenient, but it's the codebase's largest single source of "why isn't git doing anything?" opacity. A `DEBUG=watchtower:git` hook that logged the (operation, exit code, stderr) tuple would pay off immediately.

## Recommended first 5 tickets

| # | Title | Scope |
|---|-------|-------|
| 1 | Resolve the three-way `generateSparkline` collision | Delete `src/git/branch.js:315-333` (the async, git-shelling one) since nothing calls it. Delete `bin/git-watchtower.js:1027` (the local formatter) and have bin import `generateSparkline` from `src/ui/ansi.js` — that is the "given counts, return characters" contract, which is what the bin actually needs. Keep the pure one as the single source of truth. |
| 2 | Migrate bin's inline `checkout` to `gitBranch.checkout` | Replace `bin/git-watchtower.js:1469-1494` with a single call to `require('../src/git/branch').checkout(branchName, { remoteName: REMOTE_NAME, cwd: PROJECT_ROOT })`. Delete the duplicated branch-listing + fork logic. |
| 3 | Remove dead exports from `src/git/branch.js` | After ticket #2 lands, `detectBranchChanges`, `getLocalBranches`, `localBranchExists`, `getPreviewData`, and the branch-module `generateSparkline` have no non-test callers. Decide: either delete them (and their tests), or inline the bin's versions and keep. Either way, one less layer of "exported but not used." |
| 4 | Unify error strategies in `src/git/branch.js` | Pick one: "all branch-action functions return `{ success, error }`; all reader functions throw". Today it's a 3-way split. This affects `getCurrentBranch`, `getLocalBranches`, `getGoneBranches`, `generateSparkline`, `getPreviewData`. The inconsistent error-handling policy makes `execGitSilent` harder to remove because callers depend on the default-on-error behavior. |
| 5 | Add `DEBUG=watchtower:git` logging to `execGitSilent` | Inside `src/git/commands.js:70-76`, when `DEBUG` is set, `console.error` the command, exit code, and stderr before returning null. Zero production impact; huge debuggability win for any "sparkline is empty / PR status stale" report. |
