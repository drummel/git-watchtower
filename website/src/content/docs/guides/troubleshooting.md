---
title: Troubleshooting
description: Common issues and solutions for Git Watchtower.
---

## Git Issues

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

Or use the CLI flag:

```bash
git-watchtower --remote upstream
```

### Slow fetches / High latency

Git Watchtower automatically reduces polling frequency on slow networks. You can also increase the interval:

```bash
git-watchtower --poll-interval 10000
```

### Dirty working directory errors

If branch switching fails because of uncommitted changes, press `S` to stash your changes. Git Watchtower will prompt for confirmation before stashing.

## Server Issues

### Port already in use

Try a different port:

```bash
git-watchtower -p 3001
```

### Server crashes immediately (custom server command mode)

- Check that your command works when run directly
- View logs with `l` to see error messages
- Try restarting with `R`

### Sound not working

- **macOS**: Uses system sounds via `afplay`
- **Linux**: Requires PulseAudio (`paplay`) or ALSA (`aplay`)
- **Windows**: Uses terminal bell

Toggle sound with `s` or set `"soundEnabled": false` in config.

## Web Dashboard Issues

### Web dashboard port conflict

If port 4000 is in use, the dashboard automatically tries the next port (up to 20 retries). Check the TUI status bar for the actual port.

You can also specify a custom port:

```bash
git-watchtower --web --web-port 8080
```

### Multiple instances not showing in dashboard

Multi-instance coordination uses Unix domain sockets at `~/.watchtower/web.sock`. If instances aren't appearing:

1. Check that `~/.watchtower/web.lock` exists and its PID is alive
2. If the lock file references a dead process, delete it and restart:
   ```bash
   rm ~/.watchtower/web.lock ~/.watchtower/web.sock
   ```
3. Restart your git-watchtower instances

### Browser not opening automatically

The web dashboard auto-opens a browser tab on first launch. If this doesn't work:
- Open `http://localhost:4000` manually (or the port shown in the TUI)
- On headless systems, the browser open is skipped automatically

## Version Updates

Git Watchtower checks for new versions via the npm registry and shows a notification in the TUI when an update is available. Update with:

```bash
npm install -g git-watchtower@latest
```
