/**
 * ANSI escape codes and box drawing characters for terminal UI
 * Provides consistent terminal styling across the application
 */

// ANSI escape sequence components
const ESC = '\x1b';
const CSI = `${ESC}[`;

/**
 * Whether color output is enabled.
 * Honors the NO_COLOR convention (https://no-color.org/) and TERM=dumb.
 * Structural codes (cursor movement, screen control) are still emitted
 * so the TUI layout remains functional — only color/style codes are stripped.
 */
const colorsEnabled = !(
  (process.env.NO_COLOR && process.env.NO_COLOR !== '') ||
  process.env.TERM === 'dumb'
);

/** Empty string for disabled color codes, or the given code when enabled. */
const c = (code) => (colorsEnabled ? code : '');
/** Empty-returning function for disabled color functions. */
const cFn = (fn) => (colorsEnabled ? fn : () => '');

/**
 * ANSI escape codes for terminal control and styling
 */
const ansi = {
  // Screen control
  clearScreen: `${CSI}2J`,
  clearLine: `${CSI}2K`,
  clearToEndOfLine: `${CSI}K`,
  clearToEndOfScreen: `${CSI}J`,

  /**
   * Move cursor to specific position (1-indexed)
   * @param {number} row - Row number (1-based)
   * @param {number} col - Column number (1-based)
   * @returns {string}
   */
  moveTo: (row, col) => `${CSI}${row};${col}H`,

  moveToTop: `${CSI}H`,
  moveUp: (n = 1) => `${CSI}${n}A`,
  moveDown: (n = 1) => `${CSI}${n}B`,
  moveRight: (n = 1) => `${CSI}${n}C`,
  moveLeft: (n = 1) => `${CSI}${n}D`,

  // Cursor visibility
  hideCursor: `${CSI}?25l`,
  showCursor: `${CSI}?25h`,

  // Alternate screen buffer (for full-screen TUI)
  saveScreen: `${CSI}?1049h`,
  restoreScreen: `${CSI}?1049l`,

  // Save/restore cursor position
  saveCursor: `${CSI}s`,
  restoreCursor: `${CSI}u`,

  // Text styles
  reset: c(`${CSI}0m`),
  bold: c(`${CSI}1m`),
  dim: c(`${CSI}2m`),
  italic: c(`${CSI}3m`),
  underline: c(`${CSI}4m`),
  blink: c(`${CSI}5m`),
  inverse: c(`${CSI}7m`),
  hidden: c(`${CSI}8m`),
  strikethrough: c(`${CSI}9m`),

  // Reset specific styles
  resetBold: c(`${CSI}22m`),
  resetDim: c(`${CSI}22m`),
  resetItalic: c(`${CSI}23m`),
  resetUnderline: c(`${CSI}24m`),
  resetBlink: c(`${CSI}25m`),
  resetInverse: c(`${CSI}27m`),
  resetHidden: c(`${CSI}28m`),
  resetStrikethrough: c(`${CSI}29m`),

  // Foreground colors (standard)
  black: c(`${CSI}30m`),
  red: c(`${CSI}31m`),
  green: c(`${CSI}32m`),
  yellow: c(`${CSI}33m`),
  blue: c(`${CSI}34m`),
  magenta: c(`${CSI}35m`),
  cyan: c(`${CSI}36m`),
  white: c(`${CSI}37m`),
  default: c(`${CSI}39m`),

  // Foreground colors (bright)
  gray: c(`${CSI}90m`),
  brightRed: c(`${CSI}91m`),
  brightGreen: c(`${CSI}92m`),
  brightYellow: c(`${CSI}93m`),
  brightBlue: c(`${CSI}94m`),
  brightMagenta: c(`${CSI}95m`),
  brightCyan: c(`${CSI}96m`),
  brightWhite: c(`${CSI}97m`),

  // Background colors (standard)
  bgBlack: c(`${CSI}40m`),
  bgRed: c(`${CSI}41m`),
  bgGreen: c(`${CSI}42m`),
  bgYellow: c(`${CSI}43m`),
  bgBlue: c(`${CSI}44m`),
  bgMagenta: c(`${CSI}45m`),
  bgCyan: c(`${CSI}46m`),
  bgWhite: c(`${CSI}47m`),
  bgDefault: c(`${CSI}49m`),

  // Background colors (bright)
  bgGray: c(`${CSI}100m`),
  bgBrightRed: c(`${CSI}101m`),
  bgBrightGreen: c(`${CSI}102m`),
  bgBrightYellow: c(`${CSI}103m`),
  bgBrightBlue: c(`${CSI}104m`),
  bgBrightMagenta: c(`${CSI}105m`),
  bgBrightCyan: c(`${CSI}106m`),
  bgBrightWhite: c(`${CSI}107m`),

  /**
   * Set foreground color using 256-color palette
   * @param {number} n - Color number (0-255)
   * @returns {string}
   */
  fg256: cFn((n) => `${CSI}38;5;${n}m`),

  /**
   * Set background color using 256-color palette
   * @param {number} n - Color number (0-255)
   * @returns {string}
   */
  bg256: cFn((n) => `${CSI}48;5;${n}m`),

  /**
   * Set foreground color using RGB
   * @param {number} r - Red (0-255)
   * @param {number} g - Green (0-255)
   * @param {number} b - Blue (0-255)
   * @returns {string}
   */
  fgRgb: cFn((r, g, b) => `${CSI}38;2;${r};${g};${b}m`),

  /**
   * Set background color using RGB
   * @param {number} r - Red (0-255)
   * @param {number} g - Green (0-255)
   * @param {number} b - Blue (0-255)
   * @returns {string}
   */
  bgRgb: cFn((r, g, b) => `${CSI}48;2;${r};${g};${b}m`),
};

/**
 * Box drawing characters for terminal UI borders
 */
const box = {
  // Single line box (light)
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
  teeRight: '├',
  teeLeft: '┤',
  teeDown: '┬',
  teeUp: '┴',
  cross: '┼',

  // Double line box
  dTopLeft: '╔',
  dTopRight: '╗',
  dBottomLeft: '╚',
  dBottomRight: '╝',
  dHorizontal: '═',
  dVertical: '║',
  dTeeRight: '╠',
  dTeeLeft: '╣',
  dTeeDown: '╦',
  dTeeUp: '╩',
  dCross: '╬',

  // Rounded corners
  rTopLeft: '╭',
  rTopRight: '╮',
  rBottomLeft: '╰',
  rBottomRight: '╯',

  // Heavy (thick) box
  hTopLeft: '┏',
  hTopRight: '┓',
  hBottomLeft: '┗',
  hBottomRight: '┛',
  hHorizontal: '━',
  hVertical: '┃',
};

/**
 * Sparkline characters for activity visualization
 */
const sparkline = {
  chars: ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'],
  empty: ' ',
};

/**
 * Generate a sparkline visualization from data points
 * @param {number[]} dataPoints - Array of numeric values
 * @param {Object} [options] - Generation options
 * @param {number} [options.min] - Minimum value (defaults to data min)
 * @param {number} [options.max] - Maximum value (defaults to data max)
 * @param {string} [options.emptyChar=' '] - Character for zero/empty values
 * @returns {string} Sparkline string
 */
function generateSparkline(dataPoints, options = {}) {
  if (!Array.isArray(dataPoints) || dataPoints.length === 0) {
    return '';
  }

  const { emptyChar = sparkline.empty } = options;
  const chars = sparkline.chars;
  const levels = chars.length;

  // Filter to valid numbers
  const validPoints = dataPoints.map((p) => (typeof p === 'number' && !isNaN(p) ? p : 0));

  // Determine range
  const dataMin = Math.min(...validPoints);
  const dataMax = Math.max(...validPoints);
  const min = options.min !== undefined ? options.min : dataMin;
  const max = options.max !== undefined ? options.max : dataMax;

  // Handle edge case where all values are the same
  const range = max - min;
  if (range === 0) {
    // All same value - if all zeros, show empty; otherwise show middle level
    return validPoints.map((p) => (p === 0 ? emptyChar : chars[Math.floor(levels / 2)])).join('');
  }

  // Map each point to a character
  return validPoints
    .map((value) => {
      if (value === 0) {
        return emptyChar;
      }
      // Normalize to 0-1 range, then map to character index
      const normalized = (value - min) / range;
      const index = Math.min(Math.floor(normalized * levels), levels - 1);
      return chars[index];
    })
    .join('');
}

/**
 * Status indicator characters
 */
const indicators = {
  bullet: '•',
  circle: '○',
  circleFilled: '●',
  check: '✓',
  cross: '✗',
  star: '★',
  starEmpty: '☆',
  diamond: '◆',
  diamondEmpty: '◇',
  arrow: {
    right: '→',
    left: '←',
    up: '↑',
    down: '↓',
  },
  spinner: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
};

/**
 * Helper functions for working with ANSI codes
 */

// Match any ECMA-48 CSI sequence: ESC [ <params> <intermediates> <final byte>.
// final byte is in 0x40-0x7E. Covers SGR (m), cursor movement (A-H), erase
// (J/K), scroll, mode set/reset (h/l), and everything else terminals
// recognise via CSI.
// eslint-disable-next-line no-control-regex
const CSI_RE = /\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g;

// Match CSI sequences that are NOT SGR (final byte 'm' / 0x6D). Used by the
// render-safe sanitiser to drop dangerous controls while preserving colour.
// eslint-disable-next-line no-control-regex
const NON_SGR_CSI_RE = /\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x6c\x6e-\x7e]/g;

// Match OSC sequences: ESC ] ... terminator (BEL or ESC \). These set
// terminal title, hyperlinks, etc. — all undesirable in untrusted input.
// eslint-disable-next-line no-control-regex
const OSC_RE = /\x1b\][\s\S]*?(?:\x07|\x1b\\)/g;

// Match other 2-byte ESC sequences (Fe codes 0x40-0x5F) excluding CSI ([)
// and OSC (]) which are handled separately above.
// eslint-disable-next-line no-control-regex
const ESC_RE = /\x1b[@-Z\\-_]/g;

// Match dangerous C0 control characters. Whitespace (\t, \n, \r) and ESC
// (\x1b) are excluded — ESC is consumed by the escape-sequence regexes
// above, and SGR codes preserved by sanitizeForRender contain it. Bell,
// BS, VT, FF, SO, SI, DEL, etc. all get stripped.
// eslint-disable-next-line no-control-regex
const C0_RE = /[\x00-\x08\x0b\x0c\x0e-\x1a\x1c-\x1f\x7f]/g;

/**
 * Strip ALL ANSI escape sequences and dangerous C0 control characters.
 * Use this for measuring display width or for fully sanitising untrusted
 * input that won't be styled (e.g. JSON pushed to the web dashboard).
 *
 * Catches CSI (cursor moves, screen clears, SGR colour), OSC (terminal
 * title), other 2-byte ESC sequences, and dangerous C0 controls (bell,
 * backspace, etc). Preserves whitespace (\t, \n, \r).
 *
 * @param {string} str - String potentially containing ANSI codes
 * @returns {string} String with ANSI codes removed
 */
function stripAnsi(str) {
  return String(str)
    .replace(OSC_RE, '')
    .replace(CSI_RE, '')
    .replace(ESC_RE, '')
    .replace(C0_RE, '')
    // Final pass: any stray ESC bytes left over from malformed sequences.
    // Display surfaces that ask for "no escapes" should never see one.
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b/g, '');
}

/**
 * Sanitise a string for safe terminal rendering: strip dangerous escape
 * sequences (cursor moves, screen clears, OSC terminal-title, bell, etc.)
 * while PRESERVING SGR colour/style codes so legitimate styling we built
 * ourselves still renders.
 *
 * Use this on any string that came from outside (commit subjects, branch
 * names, git stderr, PR titles) before it flows to the renderer. A
 * malicious commit subject containing `\x1b[2J` would otherwise clear the
 * screen on every render.
 *
 * @param {string} str - Untrusted string that will be written to a TTY
 * @returns {string} String with dangerous escapes removed, SGR preserved
 */
function sanitizeForRender(str) {
  return String(str)
    .replace(OSC_RE, '')
    .replace(NON_SGR_CSI_RE, '')
    .replace(ESC_RE, '')
    .replace(C0_RE, '');
}

/**
 * Get the visible length of a string (excluding ANSI codes)
 * @param {string} str - String potentially containing ANSI codes
 * @returns {number} Visible character count
 */
function visibleLength(str) {
  return stripAnsi(str).length;
}

/**
 * Truncate a string to a maximum visible length, preserving SGR colour
 * codes but stripping any other escape sequences (cursor movement, screen
 * clears, OSC, bell, etc.). This guarantees that even short, non-truncated
 * strings cannot leak terminal-corrupting escapes to the renderer.
 *
 * @param {string} str - String to truncate (may contain SGR + dangerous escapes)
 * @param {number} maxLen - Maximum visible length
 * @param {string} [suffix='…'] - Suffix to append if truncated
 * @returns {string} Truncated string
 */
function truncate(str, maxLen, suffix = '…') {
  // Strip dangerous escapes up front so the fast-path can never return a
  // raw input with cursor/screen-control sequences in it. SGR survives.
  const safeStr = sanitizeForRender(str);
  const visible = stripAnsi(safeStr);
  if (visible.length <= maxLen) {
    return safeStr;
  }

  // Long-string path: drop ALL escapes (including SGR), truncate, append
  // ellipsis + reset. Existing behaviour, kept for layout determinism.
  const truncated = visible.slice(0, maxLen - suffix.length);
  return truncated + suffix + ansi.reset;
}

/**
 * Pad a string to a specific visible length
 * @param {string} str - String to pad
 * @param {number} len - Target visible length
 * @param {string} [char=' '] - Padding character
 * @param {'left' | 'right' | 'center'} [align='right'] - Alignment
 * @returns {string} Padded string
 */
function pad(str, len, char = ' ', align = 'right') {
  const visible = visibleLength(str);
  if (visible >= len) {
    return str;
  }

  const padding = char.repeat(len - visible);

  switch (align) {
    case 'left':
      return padding + str;
    case 'center': {
      const left = Math.floor(padding.length / 2);
      const right = padding.length - left;
      return char.repeat(left) + str + char.repeat(right);
    }
    case 'right':
    default:
      return str + padding;
  }
}

/**
 * Wrap text to a maximum width
 * @param {string} text - Text to wrap
 * @param {number} width - Maximum line width
 * @returns {string[]} Array of wrapped lines
 */
function wordWrap(text, width) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (visibleLength(testLine) <= width) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Create a horizontal line
 * @param {number} width - Line width
 * @param {string} [char=box.horizontal] - Character to use
 * @returns {string}
 */
function horizontalLine(width, char = box.horizontal) {
  return char.repeat(width);
}

/**
 * Create a styled text string
 * @param {string} text - Text to style
 * @param {...string} styles - ANSI style codes to apply
 * @returns {string}
 */
function style(text, ...styles) {
  if (styles.length === 0) {
    return text;
  }
  return styles.join('') + text + ansi.reset;
}

/**
 * Pad a string on the right, truncating if too long (uses raw string length)
 * @param {string} str - String to pad
 * @param {number} len - Target length
 * @returns {string}
 */
function padRight(str, len) {
  if (str.length >= len) return str.substring(0, len);
  return str + ' '.repeat(len - str.length);
}

/**
 * Pad a string on the left, truncating if too long (uses raw string length)
 * @param {string} str - String to pad
 * @param {number} len - Target length
 * @returns {string}
 */
function padLeft(str, len) {
  if (str.length >= len) return str.substring(0, len);
  return ' '.repeat(len - str.length) + str;
}

/**
 * Calculate maximum branches that fit on screen
 * @param {number} terminalHeight - Terminal height in rows
 * @param {number} [maxLogEntries=10] - Max activity log entries shown
 * @returns {number}
 */
function getMaxBranchesForScreen(terminalHeight, maxLogEntries = 10) {
  // header(2) + branch box + log box(~12) + footer(2)
  // Each branch takes 2 rows, plus 4 for box borders
  const availableHeight = terminalHeight - 2 - maxLogEntries - 5 - 2;
  return Math.max(1, Math.floor(availableHeight / 2));
}

/**
 * Draw a box at a specific position (returns ANSI string)
 * @param {number} row - Starting row
 * @param {number} col - Starting column
 * @param {number} width - Box width
 * @param {number} height - Box height
 * @param {string} [title=''] - Optional title
 * @param {string} [titleColor] - ANSI color code for title
 * @returns {string} ANSI escape sequence string for the box
 */
function drawBox(row, col, width, height, title = '', titleColor = ansi.cyan) {
  let out = '';
  // Top border
  out += ansi.moveTo(row, col);
  out += ansi.gray + box.topLeft + box.horizontal.repeat(width - 2) + box.topRight + ansi.reset;

  // Title
  if (title) {
    out += ansi.moveTo(row, col + 2);
    out += ansi.gray + ' ' + titleColor + title + ansi.gray + ' ' + ansi.reset;
  }

  // Sides
  for (let i = 1; i < height - 1; i++) {
    out += ansi.moveTo(row + i, col);
    out += ansi.gray + box.vertical + ansi.reset;
    out += ansi.moveTo(row + i, col + width - 1);
    out += ansi.gray + box.vertical + ansi.reset;
  }

  // Bottom border
  out += ansi.moveTo(row + height - 1, col);
  out += ansi.gray + box.bottomLeft + box.horizontal.repeat(width - 2) + box.bottomRight + ansi.reset;
  return out;
}

/**
 * Clear a rectangular area (returns ANSI string)
 * @param {number} row - Starting row
 * @param {number} col - Starting column
 * @param {number} width - Area width
 * @param {number} height - Area height
 * @returns {string}
 */
function clearArea(row, col, width, height) {
  let out = '';
  for (let i = 0; i < height; i++) {
    out += ansi.moveTo(row + i, col);
    out += ' '.repeat(width);
  }
  return out;
}

module.exports = {
  ansi,
  box,
  sparkline,
  generateSparkline,
  indicators,
  stripAnsi,
  sanitizeForRender,
  visibleLength,
  truncate,
  pad,
  padRight,
  padLeft,
  getMaxBranchesForScreen,
  drawBox,
  clearArea,
  wordWrap,
  horizontalLine,
  style,
  colorsEnabled,
  // Export constants for direct use
  ESC,
  CSI,
};
