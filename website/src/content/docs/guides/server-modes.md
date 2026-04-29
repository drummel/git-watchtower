---
title: Server Modes
description: Git Watchtower supports three server modes to fit your workflow.
---

Git Watchtower supports three server modes to fit your workflow. Set the mode during the configuration wizard, in `.watchtowerrc.json`, or via CLI flags.

## No Server Mode (Default)

Branch monitoring only. No dev server is started. This is the default for new installs — opt into one of the server modes below once you know which one fits your workflow.

```bash
git-watchtower --no-server
# or
git-watchtower --mode none
```

Use this when:
- Watching AI agents push to multiple branches
- You have your own dev server running separately
- You only need branch monitoring and notifications

## Static Site Mode

Serves static files with automatic live reload. Good for static HTML/CSS/JS sites, projects without a build step, and quick prototyping.

```bash
git-watchtower --mode static --static-dir public --port 3000
```

### Live Reload

The static server includes automatic live reload powered by Server-Sent Events (SSE). When you save a file, all connected browsers refresh instantly.

**How it works:**
1. A small script is automatically injected into HTML pages
2. The script opens an SSE connection to `/livereload`
3. When files change in your static directory, the server notifies all browsers
4. Browsers automatically reload to show your changes

**File watching behavior:**
- Uses Node.js native `fs.watch()` with recursive watching
- Changes are debounced (100ms) to prevent rapid reloads during saves
- Press `r` to manually trigger a reload for all connected browsers

### Ignored Files

The file watcher automatically ignores certain files to prevent unnecessary reloads:

| Ignored | Reason |
|---------|--------|
| `.git/` directory | Git internals change frequently during commits, fetches, etc. |
| `.gitignore` patterns | Respects your project's ignore rules |

If a `.gitignore` file exists in your static directory (or project root), those patterns are used to filter file change events. This means changes to `node_modules/`, build artifacts, log files, and other ignored paths won't trigger reloads.

**Supported `.gitignore` patterns:**
- Simple filenames: `foo.txt`
- Wildcards: `*.log`, `file?.txt`
- Globstar: `**/logs`, `logs/**/*.log`
- Directory patterns: `node_modules/`, `dist/`
- Anchored patterns: `/build` (root only)
- Comments and blank lines are ignored

## Custom Server Command Mode

Runs your own dev server command (`next dev`, `npm run dev`, `vite`, etc.).

```bash
git-watchtower --mode command --command "npm run dev"
```

| Key | Action |
|-----|--------|
| `l` | View server logs |
| `R` | Restart the dev server |

The server restarts automatically when you switch branches (configurable with `--restart-on-switch` / `--no-restart-on-switch`).
