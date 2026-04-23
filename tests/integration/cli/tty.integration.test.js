/**
 * CLI startup behaviour when stdout is not a TTY.
 *
 * git-watchtower is a full-screen TUI; rendering to a pipe produces a
 * file full of ANSI escapes and burns CPU on a loop no human will see.
 * The entrypoint should refuse to start and exit non-zero with a clear
 * message so CI pipelines fail loudly instead of silently producing junk.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');

const BIN = path.join(__dirname, '..', '..', '..', 'bin', 'git-watchtower.js');

describe('CLI startup TTY guard', () => {
  it('exits non-zero with an explanatory message when stdout is piped', () => {
    // spawnSync with inherited pipes: stdout is a pipe, not a TTY. This is the
    // same situation as `git-watchtower | tee log.txt` or running under CI.
    const result = spawnSync('node', [BIN], {
      encoding: 'utf8',
      timeout: 5000,
      // stdio defaults to 'pipe' which is the scenario we're testing.
    });

    assert.notEqual(result.status, 0, 'expected non-zero exit');
    assert.ok(
      /stdout is not a TTY/i.test(result.stderr),
      `expected TTY warning on stderr; got: ${result.stderr}`,
    );
    // Critically, no ANSI frame garbage should have landed on stdout.
    assert.ok(
      !/\x1b\[\?25l|\x1b\[2J/.test(result.stdout),
      `expected no ANSI hideCursor/clearScreen on stdout; got: ${JSON.stringify(result.stdout)}`,
    );
  });
});
