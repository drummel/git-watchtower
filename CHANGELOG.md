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
