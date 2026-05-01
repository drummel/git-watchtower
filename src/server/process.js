/**
 * Server process management — command parsing for command mode
 *
 * Note: the bin's `startServerProcess` / `stopServerProcess` /
 * `restartServerProcess` implement the actual lifecycle inline; this
 * file only exports the parseCommand helper they use.
 */

/**
 * Parse a command string into command and arguments.
 * Handles quoted strings, backslash escapes (e.g. `\"`, `\\`, `\ `),
 * and empty quoted arguments (`""`).
 *
 * Rules (POSIX-ish):
 * - Inside single quotes, characters are literal — backslashes do NOT escape.
 * - Inside double quotes or outside any quotes, a backslash causes the next
 *   character to be treated literally (so `\"` yields `"`, `\\` yields `\`,
 *   and `\ ` yields a literal space that doesn't split the argument).
 * - A trailing backslash with no following character is left literal.
 *
 * @param {string} commandString - Command string to parse
 * @returns {{command: string, args: string[]}}
 */
function parseCommand(commandString) {
  const args = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';
  // Tracks whether we've started accumulating an argument — distinguishes
  // `""` (empty argument) from whitespace between arguments.
  let hasCurrent = false;

  for (let i = 0; i < commandString.length; i++) {
    const char = commandString[i];

    // Backslash escapes: unless we're inside single quotes, a backslash
    // causes the next character to be treated literally. A trailing
    // backslash (no following character) falls through and is kept literal.
    if (char === '\\' && quoteChar !== "'" && i + 1 < commandString.length) {
      current += commandString[i + 1];
      hasCurrent = true;
      i++;
      continue;
    }

    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
      hasCurrent = true;
    } else if (char === quoteChar && inQuotes) {
      inQuotes = false;
      quoteChar = '';
    } else if (char === ' ' && !inQuotes) {
      if (hasCurrent) {
        args.push(current);
        current = '';
        hasCurrent = false;
      }
    } else {
      current += char;
      hasCurrent = true;
    }
  }

  if (hasCurrent) {
    args.push(current);
  }

  return {
    command: args[0] || '',
    args: args.slice(1),
  };
}

module.exports = {
  parseCommand,
};
