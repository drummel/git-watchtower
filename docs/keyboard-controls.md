# Keyboard Controls

Complete reference for all keyboard shortcuts in Git Watchtower's terminal UI.

## Navigation

| Key | Action |
|-----|--------|
| `Up` / `k` | Move selection up |
| `Down` / `j` | Move selection down |
| `Enter` | Switch to selected branch |
| `/` | Search/filter branches |
| `Esc` | Clear search / Close modal / Quit |

## Actions

| Key | Action |
|-----|--------|
| `v` | Preview selected branch (commits & files) |
| `h` | Show switch history |
| `u` | Undo last branch switch |
| `p` | Force pull current branch |
| `f` | Fetch all branches + refresh sparklines |
| `b` | Branch actions modal (see below) |
| `S` | Stash working directory changes |
| `d` | Clean up branches with deleted remotes |
| `o` | Open browser (static/web server) |
| `W` | Toggle web dashboard on/off |

## Branch Actions (`b`)

Press `b` on any branch to open an interactive action modal. All actions are always visible — unavailable ones are grayed out with reasons (e.g., "Requires gh CLI", "Run: gh auth login").

| Key | Action | Requires |
|-----|--------|----------|
| `b` | Open branch on GitHub/GitLab/Bitbucket/Azure DevOps | - |
| `c` | Open Claude Code session in browser | Claude branch with session URL |
| `p` | Create PR (or view existing PR) | `gh` or `glab` CLI |
| `d` | View PR diff on GitHub/GitLab | Open PR |
| `a` | Approve pull request | `gh` or `glab` CLI + open PR |
| `m` | Merge pull request (squash + delete branch) | `gh` or `glab` CLI + open PR |
| `i` | Check CI status | `gh` or `glab` CLI |
| `Esc` | Close modal | - |

The modal opens instantly and loads PR info in the background. Results are cached per branch and invalidated when the branch receives new commits. The modal auto-detects:
- **Claude Code branches** (`claude/` prefix) and extracts session URLs from commit messages
- **Git hosting platform** from the remote URL (GitHub, GitLab, Bitbucket, Azure DevOps)
- **Existing PRs** and their review/CI status
- **CLI tool availability** — shows install/auth hints when `gh` or `glab` isn't set up

## Server Controls

| Key | Mode | Action |
|-----|------|--------|
| `r` | Static site | Force reload all browsers |
| `l` | Custom server command | View server logs |
| `R` | Custom server command | Restart dev server |

## Display

| Key | Action |
|-----|--------|
| `s` | Toggle sound notifications |
| `i` | Show server/status info and session stats |
| `1-0` | Set visible branch count (1-10) |
| `+` / `-` | Increase/decrease visible branches |

## Quit

| Key | Action |
|-----|--------|
| `q` | Quit |
| `Ctrl+C` | Quit |

## Status Indicators

| Badge | Meaning |
|-------|---------|
| `CURRENT` | Currently checked-out branch |
| `NEW` | Branch created since Watchtower started |
| `UPDATES` | Remote has new commits to pull |
| `DELETED` | Branch was deleted from remote |
| `NO-SERVER` | Running in branch-monitor-only mode |
| `SERVER CRASHED` | Dev server process crashed (custom server command mode) |
| `OFFLINE` | Network connectivity issues detected |
| `DETACHED HEAD` | Not on a branch (commit checkout) |
| `MERGE CONFLICT` | Auto-pull failed due to conflicts |
