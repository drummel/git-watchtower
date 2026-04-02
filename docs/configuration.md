# Configuration

Git Watchtower can be configured through a wizard, config file, CLI flags, or environment variables. CLI flags take precedence over the config file for the current session.

## Configuration Wizard

On first run, Git Watchtower prompts you to configure settings interactively. Re-run it any time with:

```bash
git-watchtower --init
```

## Config File

Settings are saved to `.watchtowerrc.json` in your project directory.

### Settings Reference

| Setting | Description | Default |
|---------|-------------|---------|
| `server.mode` | Server mode: `static`, `command`, or `none` | `static` |
| `server.port` | Dev server port (1-65535) | `3000` |
| `server.staticDir` | Directory to serve (static mode) | `public` |
| `server.command` | Dev server command (command mode) | `""` |
| `server.restartOnSwitch` | Restart server on branch switch | `true` |
| `web.enabled` | Enable web dashboard | `false` |
| `web.port` | Web dashboard port (1-65535) | `4000` |
| `remoteName` | Git remote name | `origin` |
| `autoPull` | Auto-pull when current branch has updates | `true` |
| `gitPollInterval` | How often to check for git updates (1000-300000ms) | `5000` |
| `soundEnabled` | Audio alerts for updates | `true` |
| `visibleBranches` | Number of branches shown in list (1-50) | `7` |
| `casinoMode` | Enable casino mode | `false` |

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
  "web": {
    "enabled": true,
    "port": 4000
  },
  "remoteName": "origin",
  "autoPull": true,
  "gitPollInterval": 5000,
  "soundEnabled": true,
  "visibleBranches": 7
}
```

## CLI Flags

All settings can be overridden from the command line:

### Server Options

| Flag | Description |
|------|-------------|
| `-m, --mode <mode>` | Server mode: `static`, `command`, or `none` |
| `-p, --port <port>` | Server port (default: 3000) |
| `-n, --no-server` | Shorthand for `--mode none` |
| `--static-dir <dir>` | Directory for static file serving (default: `public`) |
| `-c, --command <cmd>` | Command to run in command mode (e.g., `"npm run dev"`) |
| `--restart-on-switch` | Restart server on branch switch (default) |
| `--no-restart-on-switch` | Don't restart server on branch switch |

### Git Options

| Flag | Description |
|------|-------------|
| `-r, --remote <name>` | Git remote name (default: `origin`) |
| `--auto-pull` | Auto-pull on current branch updates (default) |
| `--no-auto-pull` | Disable auto-pull |
| `--poll-interval <ms>` | Git polling interval in ms (default: 5000) |

### UI Options

| Flag | Description |
|------|-------------|
| `--sound` | Enable sound notifications (default) |
| `--no-sound` | Disable sound notifications |
| `--visible-branches <n>` | Number of branches to display (default: 7) |
| `--casino` | Enable casino mode |

### Web Dashboard

| Flag | Description |
|------|-------------|
| `-w, --web` | Launch web dashboard alongside TUI |
| `--web-port <port>` | Web dashboard port (default: 4000) |

### General

| Flag | Description |
|------|-------------|
| `--init` | Run the configuration wizard |
| `-v, --version` | Show version number |
| `-h, --help` | Show help message |

## Environment Variables

```bash
PORT=8080 git-watchtower
GIT_POLL_INTERVAL=10000 git-watchtower
```

## Telemetry

Git Watchtower includes opt-in anonymous usage analytics. Telemetry preferences are stored separately from project config in `~/.git-watchtower/config.json`. No data is collected unless you explicitly opt in.
