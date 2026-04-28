## [2.1.12](https://github.com/drummel/git-watchtower/compare/v2.1.11...v2.1.12) (2026-04-28)


### Bug Fixes

* cap coordinator IPC connections to prevent local FD exhaustion ([33b14f8](https://github.com/drummel/git-watchtower/commit/33b14f8a325895970724578bef3cc0ca2ca3981b))

## [2.1.11](https://github.com/drummel/git-watchtower/compare/v2.1.10...v2.1.11) (2026-04-28)


### Bug Fixes

* await dev-server exit before respawn to prevent EADDRINUSE ([c76b5f3](https://github.com/drummel/git-watchtower/commit/c76b5f32df3f96c32d84c96c6664607646f97b6d))

## [2.1.10](https://github.com/drummel/git-watchtower/compare/v2.1.9...v2.1.10) (2026-04-27)


### Performance Improvements

* skip git fetch when ls-remote shows no ref changes ([3d8d1f3](https://github.com/drummel/git-watchtower/commit/3d8d1f37bb001d972383d15b488b136fa56669db))

## [2.1.9](https://github.com/drummel/git-watchtower/compare/v2.1.8...v2.1.9) (2026-04-27)


### Performance Improvements

* O(n) branch matching in getAllBranches via Map lookup ([69aee88](https://github.com/drummel/git-watchtower/commit/69aee8858160eaa1f0f2a3edfd1dbdc892628263))

## [2.1.8](https://github.com/drummel/git-watchtower/compare/v2.1.7...v2.1.8) (2026-04-27)


### Bug Fixes

* restore detached HEAD on undo instead of failing validation ([69d123c](https://github.com/drummel/git-watchtower/commit/69d123c76984cb54b67420c5912c87200011c00b))

## [2.1.7](https://github.com/drummel/git-watchtower/compare/v2.1.6...v2.1.7) (2026-04-26)


### Bug Fixes

* don't ship telemetry events when user declines consent ([abed523](https://github.com/drummel/git-watchtower/commit/abed52388408e625583a5c3c38e94e4e19894c1d))
* mark distinctId optional in telemetry config types ([db4ed9c](https://github.com/drummel/git-watchtower/commit/db4ed9c6df88b560e6eed4593156e2134ba296cb))

## [2.1.6](https://github.com/drummel/git-watchtower/compare/v2.1.5...v2.1.6) (2026-04-26)


### Bug Fixes

* guard fs.statSync in static handler against TOCTOU races ([a1dba16](https://github.com/drummel/git-watchtower/commit/a1dba16011ba9f15090a01623eea07e1549cabc1))

## [2.1.5](https://github.com/drummel/git-watchtower/compare/v2.1.4...v2.1.5) (2026-04-26)


### Bug Fixes

* use 'where' on Windows for CLI availability checks ([42b5a07](https://github.com/drummel/git-watchtower/commit/42b5a0702726257706e85db875ce9cd0cead79b6))

## [2.1.4](https://github.com/drummel/git-watchtower/compare/v2.1.3...v2.1.4) (2026-04-26)


### Bug Fixes

* use configured REMOTE_NAME for sparkline and preview lookups ([24f343f](https://github.com/drummel/git-watchtower/commit/24f343fbaae2eb7fbdda3d900986b5a9b7485929))

## [2.1.3](https://github.com/drummel/git-watchtower/compare/v2.1.2...v2.1.3) (2026-04-25)


### Bug Fixes

* prevent dev-server close handler from clobbering replacement process ([50ef9bb](https://github.com/drummel/git-watchtower/commit/50ef9bbbf1db5085daadf5b8374b64643f5187b4))

## [2.1.2](https://github.com/drummel/git-watchtower/compare/v2.1.1...v2.1.2) (2026-04-25)


### Bug Fixes

* enforce outbound MAX_IPC_BUFFER on coordinator and worker writes ([56066bc](https://github.com/drummel/git-watchtower/commit/56066bc2db1cd5b9336dff65d7882970168b6d38))

## [2.1.1](https://github.com/drummel/git-watchtower/compare/v2.1.0...v2.1.1) (2026-04-24)


### Bug Fixes

* use strict ISO 8601 for git timestamps so Date() parse is portable ([be1420d](https://github.com/drummel/git-watchtower/commit/be1420d5e0fe81e9702c373b882ff7c74edab19a))

# [2.1.0](https://github.com/drummel/git-watchtower/compare/v2.0.3...v2.1.0) (2026-04-24)


### Features

* bring casino mode and session stats to the web dashboard ([bd6bf76](https://github.com/drummel/git-watchtower/commit/bd6bf761c5133464aa1829a20eb963e9503d8160))

## [2.0.3](https://github.com/drummel/git-watchtower/compare/v2.0.2...v2.0.3) (2026-04-24)


### Bug Fixes

* guard debounce().cancel() against the already-queued callback race ([c7e4de0](https://github.com/drummel/git-watchtower/commit/c7e4de02e88b6e78dcb091fb79ecc38283226acb))

## [2.0.2](https://github.com/drummel/git-watchtower/compare/v2.0.1...v2.0.2) (2026-04-24)


### Bug Fixes

* expose cancel() on throttle() so shutdown can drop pending trailing calls ([5a75864](https://github.com/drummel/git-watchtower/commit/5a75864775642d592ea1da14e4a54860b124ad7c))

## [2.0.1](https://github.com/drummel/git-watchtower/compare/v2.0.0...v2.0.1) (2026-04-24)


### Bug Fixes

* require an ownership token on Mutex.release() ([387d123](https://github.com/drummel/git-watchtower/commit/387d1234766d8387d8a361b88a187d533707a5d6))

# [2.0.0](https://github.com/drummel/git-watchtower/compare/v1.14.18...v2.0.0) (2026-04-24)


### Bug Fixes

* correct Node.js version requirement on website ([f9f09d6](https://github.com/drummel/git-watchtower/commit/f9f09d6248bad48a7077320bda2685534d0ab878))


### chore

* visual overhaul and upgrade all packages to latest stable ([2d72f66](https://github.com/drummel/git-watchtower/commit/2d72f66c827a07f6642c182f53d5656fbd7a5a98))


### Features

* add project website with Astro Starlight ([c9acc0c](https://github.com/drummel/git-watchtower/commit/c9acc0cd1673b2311d9e82e692beb69d70449936))


### BREAKING CHANGES

* fixes:
- social config: object → array format (Starlight 0.33+)
- Remove 404.md (no longer needed with Astro 6 built-in handling)

https://claude.ai/code/session_018wwhEtYasbZnCSvQbc78RQ

## [1.14.18](https://github.com/drummel/git-watchtower/compare/v1.14.17...v1.14.18) (2026-04-23)


### Bug Fixes

* pin git child processes to the C locale so diff --stat parses ([d895140](https://github.com/drummel/git-watchtower/commit/d8951407d631924f7826270ab46140dae24d720e))

## [1.14.17](https://github.com/drummel/git-watchtower/compare/v1.14.16...v1.14.17) (2026-04-23)


### Bug Fixes

* close static-server TOCTOU between realpath check and file read ([5f6baa0](https://github.com/drummel/git-watchtower/commit/5f6baa04f2b9bae9122da04587ad16639cb5e123))

## [1.14.16](https://github.com/drummel/git-watchtower/compare/v1.14.15...v1.14.16) (2026-04-23)


### Bug Fixes

* warn clearly when fs.watch recursive mode is unreliable ([a42d70b](https://github.com/drummel/git-watchtower/commit/a42d70bee986ac4283f67eb190811b3e08b27424))

## [1.14.15](https://github.com/drummel/git-watchtower/compare/v1.14.14...v1.14.15) (2026-04-23)


### Bug Fixes

* stop loss animation when casino mode is disabled ([1503d6b](https://github.com/drummel/git-watchtower/commit/1503d6b276bfee257be12411ff7b04ae43adbebe))

## [1.14.14](https://github.com/drummel/git-watchtower/compare/v1.14.13...v1.14.14) (2026-04-23)


### Bug Fixes

* stop painting a "NOTHING" casino panel after disable() ([c7f31ef](https://github.com/drummel/git-watchtower/commit/c7f31eff16de8b06d84d9455928089a0827445db))

## [1.14.13](https://github.com/drummel/git-watchtower/compare/v1.14.12...v1.14.13) (2026-04-23)


### Bug Fixes

* exit cleanly on stdout/stderr EPIPE instead of crashing ([d17595f](https://github.com/drummel/git-watchtower/commit/d17595f5959323d3c54942f001cc2aab6324fbb4))

## [1.14.12](https://github.com/drummel/git-watchtower/compare/v1.14.11...v1.14.12) (2026-04-23)


### Bug Fixes

* refuse to start when stdout is not a TTY ([b4c4555](https://github.com/drummel/git-watchtower/commit/b4c45557edf46aa7cf00656a2c5f13aa63660eb8))

## [1.14.11](https://github.com/drummel/git-watchtower/compare/v1.14.10...v1.14.11) (2026-04-23)


### Bug Fixes

* wait for coordinator ACK before resolving Worker.connect() ([d4ce0f7](https://github.com/drummel/git-watchtower/commit/d4ce0f7f4a29684f3e0d465e0ac6d726c6df4acd))

## [1.14.10](https://github.com/drummel/git-watchtower/compare/v1.14.9...v1.14.10) (2026-04-23)


### Bug Fixes

* force-destroy lingering TCP sockets in WebDashboardServer.stop() ([e1909c0](https://github.com/drummel/git-watchtower/commit/e1909c022c420fcd9f3a595c67efe88e690c11a1))

## [1.14.9](https://github.com/drummel/git-watchtower/compare/v1.14.8...v1.14.9) (2026-04-22)


### Bug Fixes

* wait for dev-server SIGKILL escalation before process.exit ([41435dc](https://github.com/drummel/git-watchtower/commit/41435dca685242296c97274d83869cc3ec71779b))

## [1.14.8](https://github.com/drummel/git-watchtower/compare/v1.14.7...v1.14.8) (2026-04-22)


### Bug Fixes

* silence parent process during self-restart to avoid TTY races ([4a933b7](https://github.com/drummel/git-watchtower/commit/4a933b785234da39743df4d1cabac2b8afd5d3a2))

## [1.14.7](https://github.com/drummel/git-watchtower/compare/v1.14.6...v1.14.7) (2026-04-22)


### Bug Fixes

* propagate real git errors from getAllBranches instead of silencing ([14a9557](https://github.com/drummel/git-watchtower/commit/14a95577c9ebfec6c0bb2f902859a7cbf6180c95))

## [1.14.6](https://github.com/drummel/git-watchtower/compare/v1.14.5...v1.14.6) (2026-04-22)


### Bug Fixes

* await old process exit in restart() instead of a static 500ms sleep ([067792f](https://github.com/drummel/git-watchtower/commit/067792fbed0e1f2b1655fa599db185fadfe8af14))

## [1.14.5](https://github.com/drummel/git-watchtower/compare/v1.14.4...v1.14.5) (2026-04-22)


### Bug Fixes

* handle unhandledRejection so missed .catch() tails don't wreck the TUI ([bc4ebe3](https://github.com/drummel/git-watchtower/commit/bc4ebe347599b122ddd49f3263d1518e8ff56938)), closes [hi#signal](https://github.com/hi/issues/signal)

## [1.14.4](https://github.com/drummel/git-watchtower/compare/v1.14.3...v1.14.4) (2026-04-22)


### Bug Fixes

* surface coordinator IPC and static-dir anomalies via telemetry ([0b4bcfb](https://github.com/drummel/git-watchtower/commit/0b4bcfbd8523944d06ea575ac997302a020ddfa6))

## [1.14.3](https://github.com/drummel/git-watchtower/compare/v1.14.2...v1.14.3) (2026-04-21)


### Bug Fixes

* parse branch-action data from dataset instead of silently dropping it ([bcba481](https://github.com/drummel/git-watchtower/commit/bcba4817e54a55725415871db9ed9546e783f80a))

## [1.14.2](https://github.com/drummel/git-watchtower/compare/v1.14.1...v1.14.2) (2026-04-21)


### Bug Fixes

* unref SIGKILL grace timer and add Windows force-kill fallback ([efa07d9](https://github.com/drummel/git-watchtower/commit/efa07d97cbf4fc15a2079778bd1f54d37400fee9))

## [1.14.1](https://github.com/drummel/git-watchtower/compare/v1.14.0...v1.14.1) (2026-04-18)


### Bug Fixes

* use calendar-date bucketing in getCommitsByDay to avoid DST errors ([4f88227](https://github.com/drummel/git-watchtower/commit/4f88227d8f05ec0f844cddec197d70203681ecdf))

# [1.14.0](https://github.com/drummel/git-watchtower/compare/v1.13.1...v1.14.0) (2026-04-18)


### Features

* report "already up to date" and +/- diff summary on successful pulls ([5c21fc7](https://github.com/drummel/git-watchtower/commit/5c21fc76228428e709d1aeecf9eb59e1ea63f7b9))

## [1.13.1](https://github.com/drummel/git-watchtower/compare/v1.13.0...v1.13.1) (2026-04-14)


### Bug Fixes

* release monitor lock before self-upgrade restart ([3fae71d](https://github.com/drummel/git-watchtower/commit/3fae71de6923b3faa9144a1238c8f3510db740d1))

# [1.13.0](https://github.com/drummel/git-watchtower/compare/v1.12.7...v1.13.0) (2026-04-14)


### Bug Fixes

* sanitize multi-line activity log messages ([4700e4a](https://github.com/drummel/git-watchtower/commit/4700e4a3bc5be6a6748de85406abc8e0484f0103))


### Features

* prevent concurrent monitors against the same repo ([f507b28](https://github.com/drummel/git-watchtower/commit/f507b284ff533350ba78c5d4e35eb5907fe25f74))

## [1.12.7](https://github.com/drummel/git-watchtower/compare/v1.12.6...v1.12.7) (2026-04-14)


### Bug Fixes

* clear webStateInterval and stop webDashboard in startWebDashboard catch ([9b0c61e](https://github.com/drummel/git-watchtower/commit/9b0c61ea9d9332f7012281dd91582d990322e1b8))

## [1.12.6](https://github.com/drummel/git-watchtower/compare/v1.12.5...v1.12.6) (2026-04-14)


### Bug Fixes

* route uncaughtException through shared idempotent cleanup ([8acbbfa](https://github.com/drummel/git-watchtower/commit/8acbbfa0817e6c940a394758c2eaace1471ef50b))

## [1.12.5](https://github.com/drummel/git-watchtower/compare/v1.12.4...v1.12.5) (2026-04-14)


### Bug Fixes

* guard schedulePoll against running after shutdown() has started ([2e864e7](https://github.com/drummel/git-watchtower/commit/2e864e716b2b1205c1b8b3cda048fb36b327f9dd))

## [1.12.4](https://github.com/drummel/git-watchtower/compare/v1.12.3...v1.12.4) (2026-04-13)


### Bug Fixes

* retry worker connect with backoff, never take over a live coordinator ([ca39640](https://github.com/drummel/git-watchtower/commit/ca396408fddacc7cdbe6ec90609459ebd740ee32)), closes [#1](https://github.com/drummel/git-watchtower/issues/1)

## [1.12.3](https://github.com/drummel/git-watchtower/compare/v1.12.2...v1.12.3) (2026-04-13)


### Bug Fixes

* atomically claim coordinator lock to prevent socket clobbering race ([519d902](https://github.com/drummel/git-watchtower/commit/519d9022b35db7fa35749bf611a2fe8e6081db92))
* broaden tryAcquireLock JSDoc return type to match readLock ([1189891](https://github.com/drummel/git-watchtower/commit/11898919c58098c973ba697754497fb41aa334c1))

## [1.12.2](https://github.com/drummel/git-watchtower/compare/v1.12.1...v1.12.2) (2026-04-13)


### Bug Fixes

* register exit handler at module scope for periodic update check (L10) ([9b96246](https://github.com/drummel/git-watchtower/commit/9b962461aed407f28cbbf4a5c86fcc86b1c67513))

## [1.12.1](https://github.com/drummel/git-watchtower/compare/v1.12.0...v1.12.1) (2026-04-12)


### Bug Fixes

* handle escaped quotes and backslashes in parseCommand (L7) ([9c4f3c8](https://github.com/drummel/git-watchtower/commit/9c4f3c81ef55001aecbe8dd2770fe26dd415d38c))

# [1.12.0](https://github.com/drummel/git-watchtower/compare/v1.11.10...v1.12.0) (2026-04-12)


### Features

* honor NO_COLOR and TERM=dumb in ANSI module ([c4a4ba7](https://github.com/drummel/git-watchtower/commit/c4a4ba723dd8b511c57c0e39621dddb4a0056fc0))

## [1.11.10](https://github.com/drummel/git-watchtower/compare/v1.11.9...v1.11.10) (2026-04-11)


### Performance Improvements

* avoid double-copy in addLog and addServerLog ([10262d2](https://github.com/drummel/git-watchtower/commit/10262d21c4b9cb09b362f8156e0e09adbfd99047))

## [1.11.9](https://github.com/drummel/git-watchtower/compare/v1.11.8...v1.11.9) (2026-04-09)


### Bug Fixes

* suppress EIO error on stdin during shutdown ([a3b4224](https://github.com/drummel/git-watchtower/commit/a3b42249a90e12f6eeaed1b5431b0707481fdd88))

## [1.11.8](https://github.com/drummel/git-watchtower/compare/v1.11.7...v1.11.8) (2026-04-09)


### Bug Fixes

* sanitize terminal title to prevent escape sequence injection ([0d4fd1b](https://github.com/drummel/git-watchtower/commit/0d4fd1b05166a5501704aed2980a23b28315ede2))
* use segment-based hostname matching in detectPlatform ([bbfab31](https://github.com/drummel/git-watchtower/commit/bbfab3198c441648522a31f4199184efadbdb0b4))

## [1.11.7](https://github.com/drummel/git-watchtower/compare/v1.11.6...v1.11.7) (2026-04-09)


### Bug Fixes

* handle missing dates in sortBranches to prevent NaN comparisons ([8fd19c7](https://github.com/drummel/git-watchtower/commit/8fd19c7b44eb372714d95677d6c4a363328b8a72))

## [1.11.6](https://github.com/drummel/git-watchtower/compare/v1.11.5...v1.11.6) (2026-04-09)


### Bug Fixes

* cap npm registry response size in checkForUpdate ([4fbc3f0](https://github.com/drummel/git-watchtower/commit/4fbc3f03a6ae07372b01100e85c53ebba33c3090))

## [1.11.5](https://github.com/drummel/git-watchtower/compare/v1.11.4...v1.11.5) (2026-04-08)


### Bug Fixes

* run validateConfig on loaded config files ([482dd5f](https://github.com/drummel/git-watchtower/commit/482dd5fc8d7e8f12d6915c6775279d7e83918304))

## [1.11.4](https://github.com/drummel/git-watchtower/compare/v1.11.3...v1.11.4) (2026-04-08)


### Bug Fixes

* prevent coordinator register message spoofing ([d750fce](https://github.com/drummel/git-watchtower/commit/d750fceebdfd87916d3d2a0de5734ba4d2cace81))

## [1.11.3](https://github.com/drummel/git-watchtower/compare/v1.11.2...v1.11.3) (2026-04-08)


### Bug Fixes

* use realpath in static server path traversal guard to block symlink escape ([ee26e3f](https://github.com/drummel/git-watchtower/commit/ee26e3f492230b879ab11fa96d6db87145a37ee2))

## [1.11.2](https://github.com/drummel/git-watchtower/compare/v1.11.1...v1.11.2) (2026-04-07)


### Bug Fixes

* handle prereleases and variable-length versions in compareVersions ([4acfd28](https://github.com/drummel/git-watchtower/commit/4acfd28adbfbe7a00047790f5d082e075e6f9636))

## [1.11.1](https://github.com/drummel/git-watchtower/compare/v1.11.0...v1.11.1) (2026-04-07)


### Bug Fixes

* validate URLs before passing to OS open command ([feb098e](https://github.com/drummel/git-watchtower/commit/feb098e076261b4b45fb8d6530ff945396c8ecb5))

# [1.11.0](https://github.com/drummel/git-watchtower/compare/v1.10.20...v1.11.0) (2026-04-07)


### Features

* auto-restart after successful update instead of requiring manual restart ([504ad7c](https://github.com/drummel/git-watchtower/commit/504ad7c0a73df0c09f77ca525f459bd0a5888b6b))

## [1.10.20](https://github.com/drummel/git-watchtower/compare/v1.10.19...v1.10.20) (2026-04-07)


### Bug Fixes

* serialize ProcessManager.restart() with mutex to prevent race condition ([1e44743](https://github.com/drummel/git-watchtower/commit/1e447435c0d439503d6429567a315faa3d45611d))

## [1.10.19](https://github.com/drummel/git-watchtower/compare/v1.10.18...v1.10.19) (2026-04-07)


### Bug Fixes

* report errors for unknown flags and malformed CLI values ([bbb6bdb](https://github.com/drummel/git-watchtower/commit/bbb6bdb39282433944e61a6a003f716c58f78ce8))

## [1.10.18](https://github.com/drummel/git-watchtower/compare/v1.10.17...v1.10.18) (2026-04-06)


### Bug Fixes

* cap IPC receive buffers to prevent unbounded memory growth ([f9128b9](https://github.com/drummel/git-watchtower/commit/f9128b934e95d50a7893fa3b1c90aebba94d65e1))

## [1.10.17](https://github.com/drummel/git-watchtower/compare/v1.10.16...v1.10.17) (2026-04-06)


### Bug Fixes

* use shell mode for npm spawn on Windows to resolve .cmd shims ([c2d4db6](https://github.com/drummel/git-watchtower/commit/c2d4db6fba395a013ab9fcf550636506d8f64778))

## [1.10.16](https://github.com/drummel/git-watchtower/compare/v1.10.15...v1.10.16) (2026-04-06)


### Bug Fixes

* add Host-header validation to prevent DNS-rebinding attacks ([ca9bd70](https://github.com/drummel/git-watchtower/commit/ca9bd70fef536d8f0ee84dc6639e1807bcaff1fc))

## [1.10.15](https://github.com/drummel/git-watchtower/compare/v1.10.14...v1.10.15) (2026-04-06)


### Bug Fixes

* bind static server to localhost instead of all interfaces ([166690c](https://github.com/drummel/git-watchtower/commit/166690cda9a9001a3872d7148d666de393f00009))

## [1.10.14](https://github.com/drummel/git-watchtower/compare/v1.10.13...v1.10.14) (2026-04-06)


### Bug Fixes

* kill entire process group on dev-server stop to prevent orphans ([ac50c10](https://github.com/drummel/git-watchtower/commit/ac50c1076890309f1e50de17cd548a71d118d41c))

## [1.10.13](https://github.com/drummel/git-watchtower/compare/v1.10.12...v1.10.13) (2026-04-06)


### Bug Fixes

* use execFile native timeout to kill hung git processes ([1ecbfa1](https://github.com/drummel/git-watchtower/commit/1ecbfa17554079f1cf98aa475cb8adbfed335f50))

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
