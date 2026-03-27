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
