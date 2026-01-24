# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in Git Watchtower, please report it responsibly:

1. **Do not** open a public GitHub issue for security vulnerabilities
2. Email the maintainer directly at drummel@gmail.com
3. Include a detailed description of the vulnerability
4. If possible, include steps to reproduce or a proof of concept

## What to Expect

- You will receive an acknowledgment within 48 hours
- We will investigate and provide an estimated timeline for a fix
- Once fixed, we will credit you in the release notes (unless you prefer to remain anonymous)

## Scope

This security policy covers:
- The `git-watchtower` npm package
- The source code in this repository

## Security Considerations

Git Watchtower:
- Executes git commands on your local repository
- Optionally runs a local HTTP server for live reload
- Optionally executes custom dev server commands specified in your config

Always review your `.watchtowerrc.json` configuration, especially the `devServer.command` field, as it will be executed as a shell command.
