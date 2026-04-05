## [1.10.12](https://github.com/drummel/git-watchtower/compare/v1.10.11...v1.10.12) (2026-04-05)


### Bug Fixes

* isGitDirectory false-positive on .github, .gitignore, etc. ([b46941a](https://github.com/drummel/git-watchtower/commit/b46941a7d967e52d4fa883474467e6101f652019))

## [1.10.11](https://github.com/drummel/git-watchtower/compare/v1.10.10...v1.10.11) (2026-04-05)


### Bug Fixes

* honor remoteName in fetch() when all:false ([e3cc20d](https://github.com/drummel/git-watchtower/commit/e3cc20d6c558dacb003d1bff253fd8d1ca99bc95))

## [1.10.10](https://github.com/drummel/git-watchtower/compare/v1.10.9...v1.10.10) (2026-04-05)


### Bug Fixes

* deduplicate sidebar toggle logic into a single function ([8f81574](https://github.com/drummel/git-watchtower/commit/8f81574b455d1035a3e5c09d5987aa67db6e25dd))

## [1.10.9](https://github.com/drummel/git-watchtower/compare/v1.10.8...v1.10.9) (2026-04-05)


### Bug Fixes

* escape single quotes in escHtml to prevent attribute breakout ([46cd857](https://github.com/drummel/git-watchtower/commit/46cd857b60c752511ff703b19854ea4336be309d)), closes [#39](https://github.com/drummel/git-watchtower/issues/39)

## [1.10.8](https://github.com/drummel/git-watchtower/compare/v1.10.7...v1.10.8) (2026-04-04)


### Bug Fixes

* debounce search input to avoid excessive DOM rebuilds ([9730b55](https://github.com/drummel/git-watchtower/commit/9730b55731a607c7b81075bd09f2537246afc9b7))

## [1.10.7](https://github.com/drummel/git-watchtower/compare/v1.10.6...v1.10.7) (2026-04-04)


### Bug Fixes

* extract keyboard mapping from handler into declarative KEY_MAP ([a2c91bf](https://github.com/drummel/git-watchtower/commit/a2c91bfe1ddfbaf22fdcec256446eafd544a7cd5))

## [1.10.6](https://github.com/drummel/git-watchtower/compare/v1.10.5...v1.10.6) (2026-04-03)


### Bug Fixes

* consolidate 19 UI state variables into single ui object ([d471fb2](https://github.com/drummel/git-watchtower/commit/d471fb292b9e87ef6e8f16ea6983981b8718ebc0))

## [1.10.5](https://github.com/drummel/git-watchtower/compare/v1.10.4...v1.10.5) (2026-04-03)


### Bug Fixes

* modernize web UI client JS to const/let and arrow functions ([799e9dc](https://github.com/drummel/git-watchtower/commit/799e9dc754795f266373394a2e7ff63072a5f9a3))

## [1.10.4](https://github.com/drummel/git-watchtower/compare/v1.10.3...v1.10.4) (2026-04-03)


### Bug Fixes

* use real newlines in SSE keepalive comment ([b875d4f](https://github.com/drummel/git-watchtower/commit/b875d4ff14242b01944a5e8857b5d625197a2d4f))

## [1.10.3](https://github.com/drummel/git-watchtower/compare/v1.10.2...v1.10.3) (2026-04-03)


### Bug Fixes

* filter SSE state updates to active project tab ([4f940ac](https://github.com/drummel/git-watchtower/commit/4f940ac34211330fd711260861e1ae5851d3c0ed))
* pin jsdom to v24 for Node 18 compatibility ([4c3e315](https://github.com/drummel/git-watchtower/commit/4c3e315e0d6d1e3dcb56fd11ebda0c57ee954664))

## [1.10.2](https://github.com/drummel/git-watchtower/compare/v1.10.1...v1.10.2) (2026-04-03)


### Bug Fixes

* align badge pills in same row as timestamp in web UI ([2a92ac9](https://github.com/drummel/git-watchtower/commit/2a92ac9dde6954bf4857accdc3e063317c7626a0))
* remove duplicate <style> tag from extracted CSS module ([ecb597a](https://github.com/drummel/git-watchtower/commit/ecb597a43d48d794e2735673981e0359e5181785))

## [1.10.1](https://github.com/drummel/git-watchtower/compare/v1.10.0...v1.10.1) (2026-04-02)


### Bug Fixes

* move badges to right column next to timestamp ([7843111](https://github.com/drummel/git-watchtower/commit/7843111badfb2efb389ad0ad5c8efb852e915e6f))

# [1.10.0](https://github.com/drummel/git-watchtower/compare/v1.9.20...v1.10.0) (2026-04-02)


### Bug Fixes

* address engineering review findings ([2f7d111](https://github.com/drummel/git-watchtower/commit/2f7d111ce42e5bdbc76ce5860619caa018354086))
* design overhaul for premium web dashboard ([5212627](https://github.com/drummel/git-watchtower/commit/521262761834ec848f27a006466ff37f8a9958b4))
* don't open duplicate browser tab for secondary web instances ([14cb40b](https://github.com/drummel/git-watchtower/commit/14cb40b6cff211d4785e6ca5c8c532935921d405))
* make current branch visually prominent in web dashboard ([857bdb6](https://github.com/drummel/git-watchtower/commit/857bdb606e76ba2f9e74b12676bf32679260da0d))
* remove confirmation dialog for branch switching in web UI ([c5f5587](https://github.com/drummel/git-watchtower/commit/c5f558785faf1112490208c9c4a15722fe411808))
* remove preview pane and auto-open browser on --web launch ([1c36caf](https://github.com/drummel/git-watchtower/commit/1c36cafe3903d292ade8e0721e8612a4b4b46795))
* resolve typecheck error for err.code in web server ([a1d86ee](https://github.com/drummel/git-watchtower/commit/a1d86ee1476997605ca8b34f44181780d450819a))


### Features

* add browser-exclusive web UI features ([5116866](https://github.com/drummel/git-watchtower/commit/511686638098f8c944249ed1182527d82e798113))
* add multi-instance coordination and bidirectional web actions ([084b71c](https://github.com/drummel/git-watchtower/commit/084b71c65841933b27be5b5665ee3fd912f84c69))
* add TUI features to web dashboard ([8a9c7c6](https://github.com/drummel/git-watchtower/commit/8a9c7c60024a940f4e79918439e5fc8902748c1f))
* add W key to toggle web dashboard from TUI ([fddb36a](https://github.com/drummel/git-watchtower/commit/fddb36a16965ca81a8d183fc0b141e1e01149db9))
* add web dashboard mode with --web flag ([6e7775f](https://github.com/drummel/git-watchtower/commit/6e7775f2b9e13ae52e8f62ca47efd9ea33862002))

## [1.9.20](https://github.com/drummel/git-watchtower/compare/v1.9.19...v1.9.20) (2026-03-31)


### Bug Fixes

* notify store after mutating branch objects in place ([5c71ab6](https://github.com/drummel/git-watchtower/commit/5c71ab6c1367c325b23c3b9cedbe8e896d99feca))

## [1.9.19](https://github.com/drummel/git-watchtower/compare/v1.9.18...v1.9.19) (2026-03-31)


### Bug Fixes

* update sparklineCache via setState instead of mutating in place ([c23cdab](https://github.com/drummel/git-watchtower/commit/c23cdabdb3f10c4b7ea02d8545b3c7f4f8031d8d))

## [1.9.18](https://github.com/drummel/git-watchtower/compare/v1.9.17...v1.9.18) (2026-03-31)


### Bug Fixes

* only create HTTP server in static mode ([120c0f6](https://github.com/drummel/git-watchtower/commit/120c0f6a1e939ab4acc356e603824313109038d6))

## [1.9.17](https://github.com/drummel/git-watchtower/compare/v1.9.16...v1.9.17) (2026-03-31)


### Bug Fixes

* make Store switch history methods use newest-first ordering ([c50ea98](https://github.com/drummel/git-watchtower/commit/c50ea9831471afd6942b8afad205faf577edfb4b))

## [1.9.16](https://github.com/drummel/git-watchtower/compare/v1.9.15...v1.9.16) (2026-03-30)


### Bug Fixes

* make Store.addLog prepend entries (newest first) to match bin/ ([03171ab](https://github.com/drummel/git-watchtower/commit/03171ab11b35d5b46076f50924e50c1baed4582e))

## [1.9.15](https://github.com/drummel/git-watchtower/compare/v1.9.14...v1.9.15) (2026-03-30)


### Bug Fixes

* remove restartPolling() calls from within pollGitChanges() ([486c886](https://github.com/drummel/git-watchtower/commit/486c886825d2126bc2d641058f9a4621cce2215c))

## [1.9.14](https://github.com/drummel/git-watchtower/compare/v1.9.13...v1.9.14) (2026-03-30)


### Bug Fixes

* use setTimeout-based polling to avoid queuing during slow fetches ([e48cf98](https://github.com/drummel/git-watchtower/commit/e48cf98526b04f74964983c630bb026a105b14d6))

## [1.9.13](https://github.com/drummel/git-watchtower/compare/v1.9.12...v1.9.13) (2026-03-29)


### Bug Fixes

* prune all branch caches for branches no longer in poll results ([5ba3c79](https://github.com/drummel/git-watchtower/commit/5ba3c7993ec1017ef04dbea0efb426910ea43176))

## [1.9.12](https://github.com/drummel/git-watchtower/compare/v1.9.11...v1.9.12) (2026-03-28)


### Bug Fixes

* remove unconditional git checkout -- . that could discard changes ([0eccb27](https://github.com/drummel/git-watchtower/commit/0eccb27616d054483f17a8751386305464cd62c9))

## [1.9.11](https://github.com/drummel/git-watchtower/compare/v1.9.10...v1.9.11) (2026-03-27)


### Bug Fixes

* use Mutex instead of boolean guard to prevent concurrent polling ([fbc5130](https://github.com/drummel/git-watchtower/commit/fbc51305707e3824ad8cf298d4cabb3db1667e9f))

## [1.9.10](https://github.com/drummel/git-watchtower/compare/v1.9.9...v1.9.10) (2026-03-27)


### Bug Fixes

* prune previousBranchStates entries for branches no longer in poll results ([41f1abf](https://github.com/drummel/git-watchtower/commit/41f1abf17dbb85d5721afff4c85a586989439f75))

## [1.9.9](https://github.com/drummel/git-watchtower/compare/v1.9.8...v1.9.9) (2026-03-27)


### Bug Fixes

* expire isNew badge after 30 seconds instead of persisting forever ([74f7988](https://github.com/drummel/git-watchtower/commit/74f7988a8408db7ade2e860ebe69b7af44343030))

## [1.9.8](https://github.com/drummel/git-watchtower/compare/v1.9.7...v1.9.8) (2026-03-26)


### Bug Fixes

* widen diff stats columns to prevent misalignment with large numbers ([4968fb4](https://github.com/drummel/git-watchtower/commit/4968fb46c9196b2ecf7e0f4893cabbac71366d96))

## [1.9.7](https://github.com/drummel/git-watchtower/compare/v1.9.6...v1.9.7) (2026-03-26)


### Bug Fixes

* prevent deleted branches from duplicating in the branch list ([e244630](https://github.com/drummel/git-watchtower/commit/e244630b924418f90e5acb9ccd3c511468191e8b))

## [1.9.6](https://github.com/drummel/git-watchtower/compare/v1.9.5...v1.9.6) (2026-03-26)


### Bug Fixes

* ensure analytics events are delivered on shutdown ([0d540ef](https://github.com/drummel/git-watchtower/commit/0d540ef6ae5b9acbd38cceca706252ae24c7343a))
* prevent tests from sending real analytics events to PostHog ([5b738e5](https://github.com/drummel/git-watchtower/commit/5b738e528689d5a68c39e5e9d2c154a417aaf9e5))

## [1.9.5](https://github.com/drummel/git-watchtower/compare/v1.9.4...v1.9.5) (2026-03-25)


### Bug Fixes

* clear justUpdated flag at start of each poll cycle ([b7935e7](https://github.com/drummel/git-watchtower/commit/b7935e729db142a0aa5a633e0d639777d3569b9e))

## [1.9.4](https://github.com/drummel/git-watchtower/compare/v1.9.3...v1.9.4) (2026-03-24)


### Bug Fixes

* use unit separator delimiter in getAllBranches to prevent data corruption ([f00c5d6](https://github.com/drummel/git-watchtower/commit/f00c5d68954e17f098df6c8315d48e9126dd89fd))

## [1.9.3](https://github.com/drummel/git-watchtower/compare/v1.9.2...v1.9.3) (2026-03-21)


### Bug Fixes

* prune stale branch entries from tracking maps and caches ([97a3a45](https://github.com/drummel/git-watchtower/commit/97a3a452b5c05aa554efb18f72804a53f5bb77a8))

## [1.9.2](https://github.com/drummel/git-watchtower/compare/v1.9.1...v1.9.2) (2026-03-20)


### Bug Fixes

* move try/catch inside sparkline refresh loop to prevent one branch failure from aborting all updates ([90b1968](https://github.com/drummel/git-watchtower/commit/90b19681706efb113361734d5d5ef3b8e1430b67))

## [1.9.1](https://github.com/drummel/git-watchtower/compare/v1.9.0...v1.9.1) (2026-03-13)


### Bug Fixes

* use unit separator instead of pipe delimiter in getAllBranches and getPreviewData ([5b897bd](https://github.com/drummel/git-watchtower/commit/5b897bdb760854a39d6c670c467fe7dbc1477998))

# [1.9.0](https://github.com/drummel/git-watchtower/compare/v1.8.6...v1.9.0) (2026-03-13)


### Bug Fixes

* resolve typecheck errors in store and analytics ([b16145b](https://github.com/drummel/git-watchtower/commit/b16145b77d046ea0d88c63b3efab46cf939c99e2))


### Features

* add ahead/behind counters, line diffs, and session stats panel ([d6fbd52](https://github.com/drummel/git-watchtower/commit/d6fbd523ea834dd889224a30f6db298c0948816f))
* remove posthog-node dependency, use direct HTTP API ([fb88536](https://github.com/drummel/git-watchtower/commit/fb885361bf661e0ec595ab03b9e08244c9edf504))

## [1.8.6](https://github.com/drummel/git-watchtower/compare/v1.8.5...v1.8.6) (2026-03-12)


### Bug Fixes

* anchor branch name prefix strip to start of string ([d924f40](https://github.com/drummel/git-watchtower/commit/d924f40fafa03455511a18d5929695debd4633e4))

## [1.8.5](https://github.com/drummel/git-watchtower/compare/v1.8.4...v1.8.5) (2026-03-11)


### Bug Fixes

* use parseCommand() for server command parsing ([e558ca4](https://github.com/drummel/git-watchtower/commit/e558ca4bb452c1b815f20a99f35fb6a3e21535cd))

## [1.8.4](https://github.com/drummel/git-watchtower/compare/v1.8.3...v1.8.4) (2026-03-10)


### Bug Fixes

* remove invalid stdio option from execFile calls in casino sounds ([b8b20b2](https://github.com/drummel/git-watchtower/commit/b8b20b2879b289587294895558a0067a8c824fb6))
* replace shell-interpolated exec() with execFile() in casino sounds ([e133801](https://github.com/drummel/git-watchtower/commit/e1338010af4131dcf167ac9ffcef7ed676babc34))

## [1.8.3](https://github.com/drummel/git-watchtower/compare/v1.8.2...v1.8.3) (2026-03-10)


### Bug Fixes

* replace shell-interpolated exec() with safe execFile() calls ([b80ba1c](https://github.com/drummel/git-watchtower/commit/b80ba1ce6f7f9f98db947262bd1c0dd3666a57f7))

## [1.8.2](https://github.com/drummel/git-watchtower/compare/v1.8.1...v1.8.2) (2026-03-06)


### Bug Fixes

* add update check with interactive update modal ([1dc283c](https://github.com/drummel/git-watchtower/commit/1dc283c487e96ac1c4e3335262fdbd39c719db3d))

## [1.8.1](https://github.com/drummel/git-watchtower/compare/v1.8.0...v1.8.1) (2026-03-06)


### Bug Fixes

* account for server status dot in header width calculation ([f390309](https://github.com/drummel/git-watchtower/commit/f390309365a782d04b436b4629d2e0409c9c51df))

# [1.8.0](https://github.com/drummel/git-watchtower/compare/v1.7.1...v1.8.0) (2026-03-06)


### Features

* add version update notification via npm registry check ([d48e723](https://github.com/drummel/git-watchtower/commit/d48e7230ee8d2ff3e2008d283127135d459ce7e5))

## [1.7.1](https://github.com/drummel/git-watchtower/compare/v1.7.0...v1.7.1) (2026-03-06)


### Bug Fixes

* add missing NPM_TOKEN to semantic-release step ([0a6bc13](https://github.com/drummel/git-watchtower/commit/0a6bc134c2a0678b0416bdf5ebbd3be2ae8d3d53))
* add resolveJsonModule to tsconfig for package.json import ([ebaea80](https://github.com/drummel/git-watchtower/commit/ebaea80d0588f01d0573881390a111fa27987871))
* display package version in header bar ([7c9e089](https://github.com/drummel/git-watchtower/commit/7c9e08951f323ec29691c289b5293a3295b5ace9))
* read package version from package.json instead of hardcoding it ([99a0fd1](https://github.com/drummel/git-watchtower/commit/99a0fd1bf43cae12cbc54a4f1e68b6d10a4316f6))
* restore semantic-release v25 for npm OIDC trusted publishing ([7b10af5](https://github.com/drummel/git-watchtower/commit/7b10af5fbc9f56f77f97cc766fdf97d2fe3ba243))
* updated packages ([eb5cd5d](https://github.com/drummel/git-watchtower/commit/eb5cd5db1c4ecad68dc6c5e239986bca023692ca))

# [1.7.0](https://github.com/drummel/git-watchtower/compare/v1.6.1...v1.7.0) (2026-03-05)


### Bug Fixes

* include stack traces in PostHog error reporting ([ac6003f](https://github.com/drummel/git-watchtower/commit/ac6003faafcf189dfe6d3786f3f05aeb3c0c26cd))


### Features

* add opt-in PostHog analytics and error reporting ([8326a6c](https://github.com/drummel/git-watchtower/commit/8326a6cd66691581f7ad60de1d7995aea3b671e1))

## [1.6.1](https://github.com/drummel/git-watchtower/compare/v1.6.0...v1.6.1) (2026-02-26)


### Bug Fixes

* add 30-second timeout to execAsync to prevent hung polling loop ([c0dc821](https://github.com/drummel/git-watchtower/commit/c0dc8213e520cb63da5d147960fe8e521f8a0321))
* add path traversal guard to static file server ([8a0fb1f](https://github.com/drummel/git-watchtower/commit/8a0fb1f81ed577a0995d338ad254fa3b4da92cf7))
* capture process reference before nulling to fix SIGKILL fallback ([6b762c3](https://github.com/drummel/git-watchtower/commit/6b762c3d99b5fc50610812390bd876992ea65a95))
* reject dangerous shell characters in server.command config ([335efc6](https://github.com/drummel/git-watchtower/commit/335efc6e719aa5d24af3b72bd4b5c9562d4573b0))
* reject path traversal in staticDir config validation ([28f0066](https://github.com/drummel/git-watchtower/commit/28f0066cfeed12f31a20b26295061c0040b42dcc))
* replace exec() with execFile() in browser.js to prevent injection ([2704921](https://github.com/drummel/git-watchtower/commit/27049215339fbdce888c47e432a4e5d91293e94b))
* replace exec() with execFile() to prevent command injection ([4645c81](https://github.com/drummel/git-watchtower/commit/4645c81559c101a4be8e0a1a93dbc0e1f88dc7e9))

# [1.6.0](https://github.com/drummel/git-watchtower/compare/v1.5.0...v1.6.0) (2026-02-26)


### Features

* add cleanup tool for branches with deleted remotes ([86e34aa](https://github.com/drummel/git-watchtower/commit/86e34aa277ccc5a61cd5d18e5302877b47fe77d8))

# [1.5.0](https://github.com/drummel/git-watchtower/compare/v1.4.0...v1.5.0) (2026-02-20)


### Bug Fixes

* prevent pendingDirtyOperation from being cleared prematurely and add stash feedback ([01845ee](https://github.com/drummel/git-watchtower/commit/01845ee845f0141af1edc72f74d5f1d9ec9f8355))


### Features

* replace stash error toast with interactive confirmation dialog ([c7858f5](https://github.com/drummel/git-watchtower/commit/c7858f52000141973b41f93ba1a60b6306c9e349))

# [1.4.0](https://github.com/drummel/git-watchtower/compare/v1.3.0...v1.4.0) (2026-02-10)


### Features

* add S key to stash changes when git operations fail due to dirty repo ([6d125d3](https://github.com/drummel/git-watchtower/commit/6d125d3fecd75fd6f230ff70180e88e04f343bb7))

# [1.3.0](https://github.com/drummel/git-watchtower/compare/v1.2.0...v1.3.0) (2026-02-10)


### Bug Fixes

* update Node.js version to 22 for semantic-release compatibility ([6b5ad1a](https://github.com/drummel/git-watchtower/commit/6b5ad1ae11b57c583563c181b5ef19520f387cc6))


### Features

* bump version to 1.3.0 ([24f636c](https://github.com/drummel/git-watchtower/commit/24f636cb458ab6e7c1a8c61a4a5a43a758775a57))

# [1.2.0](https://github.com/drummel/git-watchtower/compare/v1.1.0...v1.2.0) (2026-02-05)


### Features

* add keyboard shortcut to open live server in browser ([#23](https://github.com/drummel/git-watchtower/issues/23)) ([77b7300](https://github.com/drummel/git-watchtower/commit/77b7300ece66afa1e8cd63c8d62225cf3665d694))

# [1.1.0](https://github.com/drummel/git-watchtower/compare/v1.0.0...v1.1.0) (2026-02-03)


### Features

* add keyboard shortcut to open live server in browser ([#20](https://github.com/drummel/git-watchtower/issues/20)) ([1da7248](https://github.com/drummel/git-watchtower/commit/1da724810167cfb05fb7c4c402d21fdb18449bdc))

# 1.0.0 (2026-02-02)


### Bug Fixes

* update Node.js version to 22 for semantic-release compatibility ([#19](https://github.com/drummel/git-watchtower/issues/19)) ([09f8217](https://github.com/drummel/git-watchtower/commit/09f82171b51743b6250e7f12451b6a328b1f6082))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-23

### Added
- Terminal UI with branch dashboard
- 7-day activity sparklines for each branch
- Branch search and filtering with `/`
- Preview pane showing recent commits and changed files
- Session history with undo support (`u` key)
- Visual flash alerts for updates
- Audio notifications (macOS, Linux, Windows)
- **Three server modes:**
  - `static` - Built-in server with live reload for static files
  - `command` - Run your own dev server (Next.js, Vite, Nuxt, etc.)
  - `none` - Branch monitoring only
- Server log view (`l` key) for command mode
- Server restart (`R` key) for command mode
- Auto-restart on branch switch (configurable)
- Auto-pull when current branch has remote updates (configurable)
- Merge conflict detection
- Interactive configuration wizard on first run
- Configuration file support (`.watchtowerrc.json`)
- `--init` flag to re-run configuration wizard
- `--no-server` flag for branch monitoring only
- `--port` flag to override server port
- `--version` flag to show version
- Configurable remote name (not just `origin`)
- Adaptive polling (slows down on network issues)
- Offline detection and indicator
- Detached HEAD state handling
- Vim-style navigation (`j`/`k` keys)
- Port conflict detection with helpful error message
- Git binary availability check on startup
- Branch name validation for security (prevents command injection)

### Security
- Branch names are validated before use in shell commands
- Prevents potential command injection through malicious branch names
