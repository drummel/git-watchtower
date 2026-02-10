# CLAUDE.md

## Project Overview

git-watchtower is a terminal-based Git branch monitor with activity sparklines and an optional dev server with live reload. It's a zero-dependency Node.js CLI application.

## Development

- **Entry point:** `bin/git-watchtower.js`
- **Node.js:** Requires >= 18.0.0
- **Dependencies:** None (zero runtime dependencies)
- **Run:** `npm start`
- **Tests:** `npm test`
- **Unit tests only:** `npm run test:unit`
- **Integration tests only:** `npm run test:integration`
- **Coverage:** `npm run test:coverage`
- **Type check:** `npm run typecheck`

## Commit Message Convention

This project uses **semantic-release** to automate versioning and publishing. All commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>: <description>

[optional body]
```

### Types and their effect on versioning:

| Type | Version Bump | When to use |
|------|-------------|-------------|
| `feat:` | Minor (1.2.0 -> 1.3.0) | New features or capabilities |
| `fix:` | Patch (1.2.0 -> 1.2.1) | Bug fixes |
| `feat!:` or `fix!:` | Major (1.2.0 -> 2.0.0) | Breaking changes (note the `!`) |
| `chore:` | No release | Maintenance, deps, config (not released) |
| `docs:` | No release | Documentation only |
| `refactor:` | No release | Code changes that don't fix bugs or add features |
| `test:` | No release | Adding or updating tests |
| `ci:` | No release | CI/CD changes |

### Important:
- Use `feat:` or `fix:` when the change should trigger a new npm release
- Use `chore:`, `docs:`, `refactor:`, `test:`, or `ci:` for changes that should NOT trigger a release
- For breaking changes, add `!` after the type (e.g., `feat!: remove legacy API`) or include `BREAKING CHANGE:` in the commit body

## Release Process

Releases are fully automated via semantic-release on the `main` branch. When commits land on `main`:
1. Commit messages are analyzed to determine the version bump
2. `CHANGELOG.md` is updated automatically
3. `package.json` version is updated
4. Package is published to npm
5. A GitHub release is created
