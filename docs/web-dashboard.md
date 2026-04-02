# Web Dashboard

Git Watchtower includes a browser-based dashboard that runs alongside the terminal UI. It provides real-time branch monitoring, PR workflows, and session statistics in a rich web interface.

![Web Dashboard](../assets/git-watchtower-web-ui.png)

## Getting Started

```bash
# Launch TUI + web dashboard
git-watchtower --web

# Specify a custom port (default: 4000)
git-watchtower --web --web-port 8080

# Toggle the web dashboard from within the TUI
# Press W while running
```

The browser opens automatically when the dashboard starts. The web UI is served at `http://localhost:4000` by default.

You can also enable the web dashboard in your `.watchtowerrc.json`:

```json
{
  "web": {
    "enabled": true,
    "port": 4000
  }
}
```

## Features

The web dashboard mirrors the TUI and adds browser-exclusive features:

- **Real-time branch list** with activity sparklines, ahead/behind counters, and status badges
- **Branch switching** directly from the browser
- **Pull, fetch, and undo** actions via clickable buttons
- **PR status** and CI status at a glance
- **Session statistics** including lines added/deleted, poll counts, and session duration
- **Activity log** showing recent events
- **Server log viewer** (when running in custom server command mode)
- **Sound toggle** and other settings
- **Link to GitHub/GitLab** branch pages and PRs
- **Dark theme** styled after GitHub's dark mode

## Architecture

The web dashboard uses only Node.js built-in modules (zero dependencies):

- **HTTP server** serves a single self-contained HTML page with inline CSS and JavaScript
- **Server-Sent Events (SSE)** push state updates to the browser every 500ms (only when state changes)
- **POST `/api/action`** endpoint accepts actions from the web UI (branch switch, pull, fetch, etc.)
- **REST endpoints** for state (`/api/state`), events (`/api/events`), and project listing (`/api/projects`)

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Web dashboard HTML page |
| `/api/state` | GET | Current state snapshot (JSON) |
| `/api/events` | GET | SSE event stream |
| `/api/projects` | GET | List of monitored projects |
| `/api/projects/:id/state` | GET | State for a specific project |
| `/api/action` | POST | Dispatch an action (e.g., switch branch, pull) |

### Available Actions

The `/api/action` endpoint accepts the following actions:

| Action | Description |
|--------|-------------|
| `switchBranch` | Switch to a branch (payload: `{ branch }`) |
| `pull` | Pull current branch |
| `fetch` | Fetch all remotes |
| `undo` | Undo last branch switch |
| `toggleSound` | Toggle sound notifications |
| `preview` | Request branch preview data |
| `restartServer` | Restart the dev server |
| `reloadBrowsers` | Reload connected browsers (static mode) |
| `stash` | Stash working directory changes |
| `stashPop` | Pop the most recent stash |
| `deleteBranches` | Clean up branches with deleted remotes |
| `checkUpdate` | Check for version updates |

## Multi-Instance Mode

When you run `git-watchtower --web` in multiple project directories, instances coordinate automatically:

1. The **first instance** becomes the coordinator and starts the web server
2. **Subsequent instances** connect as workers via Unix domain socket IPC
3. All projects appear in a single web dashboard with a project switcher
4. Actions dispatched from the web UI are routed to the correct instance

### How It Works

- Runtime files are stored in `~/.watchtower/`:
  - `web.lock` — JSON file with the coordinator's PID, port, and socket path
  - `web.sock` — Unix domain socket for IPC
- When a new instance starts, it checks the lock file. If a coordinator is already running, it connects as a worker.
- If the coordinator process dies, the lock file is automatically cleaned up and the next instance to start becomes the new coordinator.
- Each project is identified by an MD5 hash of its absolute path.

### Port Conflicts

If port 4000 is already in use, the web server automatically tries the next port (up to 20 retries). The actual port is displayed in the TUI status bar.

## Toggling from the TUI

Press `W` in the terminal UI to toggle the web dashboard on or off without restarting. When toggled on, the browser opens automatically. When toggled off, the web server shuts down and all connected browsers lose their connection.
