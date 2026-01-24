# Git Watchtower

Monitor and switch between git branches in real-time. Built for working with web based AI coding agents, like Claude Code Web & Codex.

- **Live branch monitoring** - Watches your remote for new commits, branches, and deletions
- **Instant notifications** - Visual and audio alerts when any branch is updated
- **Quick switching** - Preview changes and jump to any branch with a keypress
- **Auto-pull** - Automatically pulls when your current branch has remote changes
- **Optional dev server** - Built-in static server with live reload, or run your own command (Next.js. Nuxt.js, Vite, etc)

![Git Watchtower Screenshot](assets/git-watchtower-screenshot.png)

## Why Git Watchtower?

When you're using AI coding agents on the web (Claude, OpenAI Codex, etc.) they create branches and push commits while you're not looking. You end up with multiple branches to check on and no easy way to know when they've been updated or what changed.

Git Watchtower watches your remote and notifies you when branches are updated. Preview what changed, switch with a keypress, undo if needed.

Also works for human collaborators, but the primary use case is keeping tabs on AI agents coding on different branches.

Git Watchtower supports **three server modes** to fit your workflow:
- **Static Site Mode** - Built-in server with live reload for HTML/CSS/JS
- **Custom Server Command Mode** - Run your own dev server (Next.js, Vite, Nuxt, etc.)
- **No Server Mode** - Branch monitoring only (ideal for watching multiple AI agents)

## Features

- **Full Terminal UI** - Clean interface with box drawing and colors
- **Activity Sparklines** - 7-day commit history visualization for each branch
- **Branch Search** - Quickly filter branches by name with `/`
- **Preview Pane** - See recent commits and changed files before switching
- **Session History** - Undo branch switches with `u`
- **Visual Alerts** - Flash notifications when updates arrive
- **Audio Notifications** - Optional sound alerts (works on macOS, Linux, Windows)
- **Auto-Pull** - Automatically pulls when your current branch has updates (configurable)
- **Merge Conflict Detection** - Warns you when auto-pull fails
- **Flexible Server Modes** - Static site, custom server command, or no server
- **Server Log View** - Press `l` to view your dev server output (custom server command mode)
- **Server Restart** - Press `R` to restart your dev server (custom server command mode)
- **Configurable Remote** - Works with any git remote name (not just `origin`)
- **Zero Dependencies** - Uses only Node.js built-in modules

## Installation

```bash
# Global install (recommended)
npm install -g git-watchtower

# Or run directly with npx
npx git-watchtower
```

## Quick Start

```bash
# Navigate to any git repository
cd your-project

# Start Git Watchtower
git-watchtower
```

On first run, you'll be guided through a configuration wizard.

## Usage

```bash
# Run with default settings (or saved config)
git-watchtower

# Run without dev server (branch monitoring only)
git-watchtower --no-server

# Specify a custom port for the dev server
git-watchtower --port 8080

# Re-run the configuration wizard
git-watchtower --init

# Show version
git-watchtower --version

# Show help
git-watchtower --help
```

## Server Modes

### Static Site Mode (Default)
Serves static files with automatic live reload. Good for static HTML/CSS/JS sites, projects without a build step, quick prototyping.

### Custom Server Command Mode
Runs your own dev server command (`next dev`, `npm run dev`, `vite`, etc.). Press `l` to view server logs, `R` to restart the server.

### No Server Mode
Branch monitoring only. Use this when watching AI agents push to multiple branches, or when you have your own dev server running separately.

## Configuration

On first run, Git Watchtower prompts you to configure:

| Setting | Description | Default |
|---------|-------------|---------|
| Server mode | static, command, or none | static |
| Port | Server port number | 3000 |
| Static directory | Directory to serve (static site mode) | public |
| Command | Dev server command (custom server command mode) | npm run dev |
| Restart on switch | Restart server on branch switch | true |
| Auto-pull | Auto-pull when current branch has updates | true |
| Polling interval | How often to check for git updates | 5 seconds |
| Sound notifications | Audio alerts for updates | true |
| Visible branches | Number of branches shown in list | 7 |

Settings are saved to `.watchtowerrc.json` in your project directory.

### Example Configuration

```json
{
  "server": {
    "mode": "command",
    "command": "npm run dev",
    "port": 3000,
    "restartOnSwitch": true,
    "staticDir": "public"
  },
  "remoteName": "origin",
  "autoPull": true,
  "gitPollInterval": 5000,
  "soundEnabled": true,
  "visibleBranches": 7
}
```

### Environment Variables

You can also use environment variables:

```bash
PORT=8080 git-watchtower
GIT_POLL_INTERVAL=10000 git-watchtower
```

## Keyboard Controls

### Navigation
| Key | Action |
|-----|--------|
| `↑` / `k` | Move selection up |
| `↓` / `j` | Move selection down |
| `Enter` | Switch to selected branch |
| `/` | Search/filter branches |
| `Esc` | Clear search / Close modal / Quit |

### Actions
| Key | Action |
|-----|--------|
| `v` | Preview selected branch (commits & files) |
| `h` | Show switch history |
| `u` | Undo last branch switch |
| `p` | Force pull current branch |
| `f` | Fetch all branches + refresh sparklines |

### Server Controls
| Key | Mode | Action |
|-----|------|--------|
| `r` | Static site | Force reload all browsers |
| `l` | Custom server command | View server logs |
| `R` | Custom server command | Restart dev server |

### Display
| Key | Action |
|-----|--------|
| `s` | Toggle sound notifications |
| `i` | Show server/status info |
| `1-0` | Set visible branch count (1-10) |
| `+` / `-` | Increase/decrease visible branches |

### Quit
| Key | Action |
|-----|--------|
| `q` | Quit |
| `Ctrl+C` | Quit |

## Status Indicators

| Badge | Meaning |
|-------|---------|
| `★ CURRENT` | Currently checked-out branch |
| `✦ NEW` | Branch created since Watchtower started |
| `↓ UPDATES` | Remote has new commits to pull |
| `✗ DELETED` | Branch was deleted from remote |
| `NO-SERVER` | Running in branch-monitor-only mode |
| `SERVER CRASHED` | Dev server process crashed (custom server command mode) |
| `OFFLINE` | Network connectivity issues detected |
| `DETACHED HEAD` | Not on a branch (commit checkout) |
| `MERGE CONFLICT` | Auto-pull failed due to conflicts |

## Requirements

- **Node.js** 14.0.0 or higher
- **Git** installed and in PATH
- **Git remote** configured (any name, defaults to `origin`)
- **Terminal** with ANSI color support

## How It Works

1. **Polling**: Git Watchtower runs `git fetch` periodically to check for updates
2. **Detection**: Compares commit hashes to detect new commits, branches, and deletions
3. **Auto-pull**: When your current branch has remote updates, it pulls automatically (if enabled)
4. **Server**: Depending on mode, either serves static files, runs your command, or does nothing
5. **Live Reload**: In static site mode, notifies connected browsers via SSE when files change

## Troubleshooting

### "Git is not installed or not in PATH"
Git Watchtower requires Git. Install it from: https://git-scm.com/downloads

### "No Git remote configured"
Git Watchtower requires a remote to watch. Add one with:
```bash
git remote add origin <repository-url>
```

### Using a different remote name
If your remote isn't called `origin`, update your config:
```json
{
  "remoteName": "upstream"
}
```

### Port already in use
Try a different port:
```bash
git-watchtower -p 3001
```

### Slow fetches / High latency
Git Watchtower will automatically reduce polling frequency on slow networks. You can also increase the interval in your config.

### Sound not working
- **macOS**: Uses system sounds via `afplay`
- **Linux**: Requires PulseAudio (`paplay`) or ALSA (`aplay`)
- **Windows**: Uses terminal bell

Toggle sound with `s` or set `"soundEnabled": false` in config.

### Server crashes immediately (custom server command mode)
- Check that your command works when run directly
- View logs with `l` to see error messages
- Try restarting with `R`

## Contributing

Contributions are welcome! There are several ways to contribute to Git Watchtower:

### Reporting Bugs

If you find a bug, please [open an issue](https://github.com/drummel/git-watchtower/issues/new) on GitHub with:
- A clear, descriptive title
- Steps to reproduce the issue
- Expected vs actual behavior
- Your environment (OS, Node.js version, terminal)
- Any relevant error messages or screenshots

### Requesting Features

Have an idea to improve Git Watchtower? [Submit a feature request](https://github.com/drummel/git-watchtower/issues/new) with:
- A clear description of the feature
- The problem it would solve or use case it addresses
- Any implementation ideas (optional)

### Submitting Pull Requests

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please ensure your PR:
- Includes a clear description of the changes
- Maintains the zero-dependency philosophy (Node.js built-ins only)
- Works across platforms (macOS, Linux, Windows) when applicable

## Development

### Local Installation

For local development and testing:

```bash
# Clone the repository
git clone https://github.com/drummel/git-watchtower.git
cd git-watchtower

# Option 1: npm link (recommended)
# Creates a global symlink - changes take effect immediately
npm link

# Now you can run from any git repository:
git-watchtower

# Option 2: Run directly without installing
node bin/git-watchtower.js
```

### After Making Code Changes

| Install Method | Update Process |
|----------------|----------------|
| `npm link` | Nothing - changes apply immediately |
| `npm install -g .` | Run `npm install -g .` again |
| Direct `node bin/...` | Nothing - always runs current code |

### Unlinking

To remove the global symlink:

```bash
npm unlink -g git-watchtower
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- Built with Node.js built-in modules only (no external dependencies)
