/**
 * Tests for server process module — parseCommand only.
 *
 * Note: this file previously also covered a ProcessManager class, which
 * was deleted alongside the rest of the dead generality. parseCommand
 * is the only export bin/git-watchtower.js actually uses.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { parseCommand } = require('../../../src/server/process');

describe('parseCommand', () => {
  it('should parse simple command', () => {
    const result = parseCommand('npm start');
    assert.strictEqual(result.command, 'npm');
    assert.deepStrictEqual(result.args, ['start']);
  });

  it('should parse command with multiple args', () => {
    const result = parseCommand('npm run dev --port 3000');
    assert.strictEqual(result.command, 'npm');
    assert.deepStrictEqual(result.args, ['run', 'dev', '--port', '3000']);
  });

  it('should handle double-quoted arguments', () => {
    const result = parseCommand('npm run "dev server"');
    assert.strictEqual(result.command, 'npm');
    assert.deepStrictEqual(result.args, ['run', 'dev server']);
  });

  it('should handle single-quoted arguments', () => {
    const result = parseCommand("npm run 'dev server'");
    assert.strictEqual(result.command, 'npm');
    assert.deepStrictEqual(result.args, ['run', 'dev server']);
  });

  it('should handle mixed quotes', () => {
    const result = parseCommand('echo "hello" \'world\'');
    assert.strictEqual(result.command, 'echo');
    assert.deepStrictEqual(result.args, ['hello', 'world']);
  });

  it('should handle empty command', () => {
    const result = parseCommand('');
    assert.strictEqual(result.command, '');
    assert.deepStrictEqual(result.args, []);
  });

  it('should handle command with only spaces', () => {
    const result = parseCommand('   ');
    assert.strictEqual(result.command, '');
    assert.deepStrictEqual(result.args, []);
  });

  it('should handle command with extra spaces', () => {
    const result = parseCommand('npm   run   dev');
    assert.strictEqual(result.command, 'npm');
    assert.deepStrictEqual(result.args, ['run', 'dev']);
  });

  it('should handle path with spaces in quotes', () => {
    const result = parseCommand('node "/path/with spaces/script.js"');
    assert.strictEqual(result.command, 'node');
    assert.deepStrictEqual(result.args, ['/path/with spaces/script.js']);
  });

  it('should handle complex npm command', () => {
    const result = parseCommand('npm run dev -- --host 0.0.0.0 --port 3000');
    assert.strictEqual(result.command, 'npm');
    assert.deepStrictEqual(result.args, [
      'run',
      'dev',
      '--',
      '--host',
      '0.0.0.0',
      '--port',
      '3000',
    ]);
  });

  it('should handle escaped double quotes inside double quotes', () => {
    // Input: echo "hello \"world\""
    const result = parseCommand('echo "hello \\"world\\""');
    assert.strictEqual(result.command, 'echo');
    assert.deepStrictEqual(result.args, ['hello "world"']);
  });

  it('should handle escaped backslash inside double quotes', () => {
    // Input: echo "path\\file"  →  arg: path\file
    const result = parseCommand('echo "path\\\\file"');
    assert.strictEqual(result.command, 'echo');
    assert.deepStrictEqual(result.args, ['path\\file']);
  });

  it('should handle backslash-escaped space outside quotes', () => {
    // Input: echo hello\ world  →  arg: "hello world"
    const result = parseCommand('echo hello\\ world');
    assert.strictEqual(result.command, 'echo');
    assert.deepStrictEqual(result.args, ['hello world']);
  });

  it('should handle escaped quote character outside quotes', () => {
    // Input: echo \"quoted\"  →  arg: "quoted"
    const result = parseCommand('echo \\"quoted\\"');
    assert.strictEqual(result.command, 'echo');
    assert.deepStrictEqual(result.args, ['"quoted"']);
  });

  it('should treat backslashes as literal inside single quotes (POSIX)', () => {
    // Input: echo 'literal\n'  →  arg: literal\n (two chars: \ and n)
    const result = parseCommand("echo 'literal\\n'");
    assert.strictEqual(result.command, 'echo');
    assert.deepStrictEqual(result.args, ['literal\\n']);
  });

  it('should preserve empty double-quoted argument', () => {
    const result = parseCommand('command ""');
    assert.strictEqual(result.command, 'command');
    assert.deepStrictEqual(result.args, ['']);
  });

  it('should preserve empty single-quoted argument', () => {
    const result = parseCommand("command ''");
    assert.strictEqual(result.command, 'command');
    assert.deepStrictEqual(result.args, ['']);
  });

  it('should handle trailing backslash without crashing', () => {
    // Input: echo trailing\  →  arg: trailing\
    const result = parseCommand('echo trailing\\');
    assert.strictEqual(result.command, 'echo');
    assert.deepStrictEqual(result.args, ['trailing\\']);
  });

  it('should handle adjacent quoted and unquoted segments', () => {
    // Input: cmd foo"bar baz"qux  →  arg: foobar bazqux
    const result = parseCommand('cmd foo"bar baz"qux');
    assert.strictEqual(result.command, 'cmd');
    assert.deepStrictEqual(result.args, ['foobar bazqux']);
  });

  it('should handle escaped quote inside double quotes with mixed content', () => {
    // Input: node -e "console.log(\"hi\")"
    const result = parseCommand('node -e "console.log(\\"hi\\")"');
    assert.strictEqual(result.command, 'node');
    assert.deepStrictEqual(result.args, ['-e', 'console.log("hi")']);
  });
});
