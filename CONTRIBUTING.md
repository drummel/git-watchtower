# Contributing to git-watchtower

Thanks for your interest in contributing! This guide will get you up and running.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).
By participating, you are expected to uphold this code.

## How to Contribute

### Reporting Bugs

Open a [GitHub issue](https://github.com/drummel/git-watchtower/issues) with:

- Your Node.js version (`node -v`) and OS
- Steps to reproduce the problem
- What you expected vs. what happened

### Suggesting Features

Open an issue describing the feature and why it would be useful. Keep in mind
this is a zero-dependency project by design — proposals that require adding
runtime dependencies will need a strong justification.

### Submitting Code

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Add or update tests as needed
4. Run the full check suite (see below)
5. Open a pull request

## Development Setup

```sh
git clone https://github.com/<your-fork>/git-watchtower.git
cd git-watchtower
npm install
```

**Requirements:** Node.js >= 20.0.0

### Useful Commands

| Command | Description |
|---------|-------------|
| `npm start` | Run the app |
| `npm test` | Run all tests |
| `npm run test:unit` | Run unit tests only |
| `npm run test:integration` | Run integration tests only |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run typecheck` | TypeScript type checking |

Please make sure `npm test` and `npm run typecheck` pass before submitting a PR.

### Documentation Site

The documentation at [gitwatchtower.dev](https://gitwatchtower.dev) is built from `website/` with Astro Starlight:

```sh
cd website
npm install
npm run dev      # local preview at http://localhost:4321
npm run build    # production build to website/dist
```

If your change adds, removes, or alters a user-facing feature, please update the relevant page under `website/src/content/docs/`. Each docs page also has an "Edit this page" link in the footer that drops you straight into the GitHub editor.

## Commit Messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/)
with [semantic-release](https://github.com/semantic-release/semantic-release)
for automated versioning. Your commit messages **must** follow this format:

```
<type>: <description>
```

| Type | Version Bump | Use for |
|------|-------------|---------|
| `feat:` | Minor | New features |
| `fix:` | Patch | Bug fixes |
| `feat!:` / `fix!:` | Major | Breaking changes |
| `chore:` | None | Maintenance, config |
| `docs:` | None | Documentation |
| `refactor:` | None | Code restructuring |
| `test:` | None | Adding/updating tests |

## Pull Request Guidelines

- Keep PRs focused — one concern per PR
- Describe *what* changed and *why*
- Reference any related issues (e.g., `Closes #42`)
- All CI checks must pass

## Questions?

Open an issue — we're happy to help.
