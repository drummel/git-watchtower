<div align="center">

# Git Watchtower

## Keep up with your AI coding agents.

### Monitor git branches in real-time with activity sparklines, instant notifications, and a web dashboard.

Built for teams working with Claude Code, Codex, and other AI agents.

[![npm version](https://img.shields.io/npm/v/git-watchtower.svg)](https://www.npmjs.com/package/git-watchtower)
[![npm downloads](https://img.shields.io/npm/dm/git-watchtower.svg)](https://www.npmjs.com/package/git-watchtower)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

#### Visit our website

**[gitwatchtower.dev &rarr;](https://gitwatchtower.dev)**

[Quick Start](https://gitwatchtower.dev/guides/quick-start/) · [Configuration](https://gitwatchtower.dev/guides/configuration/) · [Web Dashboard](https://gitwatchtower.dev/guides/web-dashboard/) · [Keyboard Controls](https://gitwatchtower.dev/guides/keyboard-controls/) · [Server Modes](https://gitwatchtower.dev/guides/server-modes/) · [Troubleshooting](https://gitwatchtower.dev/guides/troubleshooting/)

</div>

![Git Watchtower Screenshot](assets/git-watchtower-screenshot.png)

## Features

- **Live branch monitoring** with activity sparklines and ahead/behind counters
- **Web dashboard** for browser-based branch management and PR workflows
- **Instant notifications** with visual and audio alerts when branches update
- **Quick switching** with preview pane, undo, and stash integration
- **Auto-pull** when your current branch has remote changes
- **Optional dev server** with live reload, or run your own command (Next.js, Vite, etc.)
- **Zero dependencies** — uses only Node.js built-in modules

## Why Git Watchtower?

When you're using AI coding agents on the web — Claude Code, OpenAI Codex, and others — they create branches and push commits while you're not looking. You end up with multiple branches to check on and no easy way to know when they've been updated or what changed.

Git Watchtower watches your remote and notifies you when branches are updated. Preview what changed, switch with a keypress, undo if needed.

Also works for human collaborators, but the primary use case is keeping tabs on AI agents coding on different branches.

## Installation

```bash
# Global install (recommended)
npm install -g git-watchtower

# Or run directly with npx
npx git-watchtower
```

## Quick Start

```bash
cd your-project
git-watchtower
```

On first run, you'll be guided through a configuration wizard.

## Usage

```bash
# Run with default settings (or saved config)
git-watchtower

# Run without dev server (branch monitoring only)
git-watchtower --no-server

# Launch with web dashboard
git-watchtower --web

# Specify custom ports
git-watchtower --port 8080 --web --web-port 9000

# Re-run the configuration wizard
git-watchtower --init

# Show help
git-watchtower --help
```

## Web Dashboard

Launch a browser-based dashboard alongside the terminal UI with `--web`:

```bash
git-watchtower --web
```

![Web Dashboard](assets/git-watchtower-web-ui.png)

Real-time branch monitoring, PR workflows, CI status, and session statistics — all in a rich browser interface. When running multiple instances across different projects, they coordinate automatically into a single multi-project dashboard. Press `W` in the TUI to toggle the web dashboard on or off at any time.

## Server Modes

| Mode | Flag | Description |
|------|------|-------------|
| **Static Site** | `--mode static` | Built-in server with live reload for HTML/CSS/JS (default) |
| **Custom Command** | `--mode command -c "npm run dev"` | Run your own dev server (Next.js, Vite, Nuxt, etc.) |
| **No Server** | `--no-server` | Branch monitoring only |

## 🎰 Casino Mode

Yes, it's a real feature. Every `git fetch` is a slot-machine spin, every commit is a payout. Enable with `--casino` or `"casinoMode": true`.

## Documentation

Full docs at **[gitwatchtower.dev](https://gitwatchtower.dev)**.

- [Quick Start](https://gitwatchtower.dev/guides/quick-start/) — install, first run, and the configuration wizard
- [Configuration](https://gitwatchtower.dev/guides/configuration/) — every setting, CLI flag, and environment variable
- [Web Dashboard](https://gitwatchtower.dev/guides/web-dashboard/) — browser UI with PR workflows and CI status
- [Keyboard Controls](https://gitwatchtower.dev/guides/keyboard-controls/) — full key reference
- [Server Modes](https://gitwatchtower.dev/guides/server-modes/) — static site, custom command, and no-server modes
- [Troubleshooting](https://gitwatchtower.dev/guides/troubleshooting/) — common issues and fixes

## Requirements

- **Node.js** 20.0.0 or higher
- **Git** installed and in PATH
- **Git remote** configured (any name, defaults to `origin`)
- **Terminal** with ANSI color support
- **Optional**: [`gh`](https://cli.github.com/) or [`glab`](https://gitlab.com/gitlab-org/cli) CLI for branch actions (PR create, approve, merge, CI status)

## How It Works

1. **Polling** — Runs `git fetch` periodically to check for updates
2. **Detection** — Compares commit hashes to detect new commits, branches, and deletions
3. **Auto-pull** — When your current branch has remote updates, pulls automatically (if enabled)
4. **Server** — Depending on mode, serves static files, runs your command, or does nothing
5. **Live Reload** — In static site mode, notifies connected browsers via SSE when files change
6. **Web Dashboard** — Optional browser UI that mirrors and extends the TUI via SSE

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Development

```bash
# Clone the repository
git clone https://github.com/drummel/git-watchtower.git
cd git-watchtower

# Create a global symlink (changes take effect immediately)
npm link

# Run from any git repository
git-watchtower

# Run tests
npm test

# Run directly without installing
node bin/git-watchtower.js
```

The documentation site lives in [`website/`](website/) and is built with Astro Starlight:

```bash
cd website
npm install
npm run dev
```

## License

MIT License — see [LICENSE](LICENSE) for details.
