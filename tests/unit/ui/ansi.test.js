/**
 * Tests for ANSI utilities
 *
 * Note: We don't exhaustively test every ANSI code string - those are just
 * constant definitions. Instead, we test the behavior of helper functions
 * and verify key codes work correctly when applied.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  ansi,
  box,
  sparkline,
  generateSparkline,
  indicators,
  stripAnsi,
  visibleLength,
  truncate,
  pad,
  wordWrap,
  horizontalLine,
  style,
  ESC,
  CSI,
} = require('../../../src/ui/ansi');

describe('ansi escape sequence building blocks', () => {
  it('should have correct ESC character', () => {
    assert.strictEqual(ESC, '\x1b');
  });

  it('should have correct CSI sequence', () => {
    assert.strictEqual(CSI, '\x1b[');
  });
});

describe('ansi.moveTo', () => {
  it('should generate correct cursor position sequence', () => {
    assert.strictEqual(ansi.moveTo(1, 1), '\x1b[1;1H');
    assert.strictEqual(ansi.moveTo(10, 20), '\x1b[10;20H');
  });
});

describe('ansi.moveUp/Down/Left/Right', () => {
  it('should generate correct movement sequences', () => {
    assert.strictEqual(ansi.moveUp(5), '\x1b[5A');
    assert.strictEqual(ansi.moveDown(3), '\x1b[3B');
    assert.strictEqual(ansi.moveRight(2), '\x1b[2C');
    assert.strictEqual(ansi.moveLeft(4), '\x1b[4D');
  });

  it('should default to 1 when no argument given', () => {
    assert.strictEqual(ansi.moveUp(), '\x1b[1A');
    assert.strictEqual(ansi.moveDown(), '\x1b[1B');
  });
});

describe('ansi.fg256 and bg256', () => {
  it('should generate 256-color foreground codes', () => {
    assert.strictEqual(ansi.fg256(0), '\x1b[38;5;0m');
    assert.strictEqual(ansi.fg256(196), '\x1b[38;5;196m');
    assert.strictEqual(ansi.fg256(255), '\x1b[38;5;255m');
  });

  it('should generate 256-color background codes', () => {
    assert.strictEqual(ansi.bg256(0), '\x1b[48;5;0m');
    assert.strictEqual(ansi.bg256(21), '\x1b[48;5;21m');
    assert.strictEqual(ansi.bg256(255), '\x1b[48;5;255m');
  });
});

describe('ansi.fgRgb and bgRgb', () => {
  it('should generate RGB foreground codes', () => {
    assert.strictEqual(ansi.fgRgb(255, 0, 0), '\x1b[38;2;255;0;0m');
    assert.strictEqual(ansi.fgRgb(0, 128, 255), '\x1b[38;2;0;128;255m');
  });

  it('should generate RGB background codes', () => {
    assert.strictEqual(ansi.bgRgb(255, 255, 255), '\x1b[48;2;255;255;255m');
    assert.strictEqual(ansi.bgRgb(0, 0, 0), '\x1b[48;2;0;0;0m');
  });
});

describe('box characters', () => {
  it('should have single line box characters', () => {
    assert.strictEqual(box.topLeft, '┌');
    assert.strictEqual(box.topRight, '┐');
    assert.strictEqual(box.bottomLeft, '└');
    assert.strictEqual(box.bottomRight, '┘');
    assert.strictEqual(box.horizontal, '─');
    assert.strictEqual(box.vertical, '│');
  });

  it('should have double line box characters', () => {
    assert.strictEqual(box.dTopLeft, '╔');
    assert.strictEqual(box.dTopRight, '╗');
    assert.strictEqual(box.dBottomLeft, '╚');
    assert.strictEqual(box.dBottomRight, '╝');
  });

  it('should have rounded corners', () => {
    assert.strictEqual(box.rTopLeft, '╭');
    assert.strictEqual(box.rTopRight, '╮');
    assert.strictEqual(box.rBottomLeft, '╰');
    assert.strictEqual(box.rBottomRight, '╯');
  });
});

describe('sparkline characters', () => {
  it('should have 8 height levels in ascending order', () => {
    assert.strictEqual(sparkline.chars.length, 8);
    assert.strictEqual(sparkline.chars[0], '▁');
    assert.strictEqual(sparkline.chars[7], '█');
  });

  it('should have empty character', () => {
    assert.strictEqual(sparkline.empty, ' ');
  });
});

describe('generateSparkline', () => {
  it('should generate sparkline from data points', () => {
    const result = generateSparkline([0, 1, 2, 3, 4, 5, 6, 7]);
    assert.strictEqual(result.length, 8);
    // First should be empty (0), last should be highest
    assert.strictEqual(result[0], ' ');
    assert.strictEqual(result[7], '█');
  });

  it('should return empty string for empty array', () => {
    assert.strictEqual(generateSparkline([]), '');
  });

  it('should return empty string for non-array input', () => {
    assert.strictEqual(generateSparkline(null), '');
    assert.strictEqual(generateSparkline(undefined), '');
    assert.strictEqual(generateSparkline('string'), '');
  });

  it('should handle all zeros', () => {
    const result = generateSparkline([0, 0, 0, 0]);
    assert.strictEqual(result, '    ');
  });

  it('should handle all same non-zero values', () => {
    const result = generateSparkline([5, 5, 5, 5]);
    // Should show middle level for uniform non-zero values
    assert.strictEqual(result.length, 4);
    assert.ok(result.split('').every((c) => c === result[0]));
  });

  it('should handle negative values', () => {
    const result = generateSparkline([-5, 0, 5]);
    assert.strictEqual(result.length, 3);
  });

  it('should handle custom min/max', () => {
    const result = generateSparkline([50], { min: 0, max: 100 });
    // 50 is halfway, should be middle character
    assert.strictEqual(result.length, 1);
  });

  it('should handle NaN values as zeros', () => {
    const result = generateSparkline([1, NaN, 2]);
    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[1], ' '); // NaN treated as 0
  });

  it('should use custom empty character', () => {
    const result = generateSparkline([0, 1, 0], { emptyChar: '·' });
    assert.ok(result.includes('·'));
  });

  it('should produce ascending heights for ascending values', () => {
    const result = generateSparkline([1, 2, 3, 4, 5, 6, 7, 8]);
    const chars = result.split('');
    // Each character should be >= the previous one
    for (let i = 1; i < chars.length; i++) {
      const prevIdx = sparkline.chars.indexOf(chars[i - 1]);
      const currIdx = sparkline.chars.indexOf(chars[i]);
      assert.ok(
        currIdx >= prevIdx,
        `Character at ${i} should be >= character at ${i - 1}`
      );
    }
  });
});

describe('indicators', () => {
  it('should have status symbols', () => {
    assert.strictEqual(indicators.check, '✓');
    assert.strictEqual(indicators.cross, '✗');
    assert.strictEqual(indicators.star, '★');
  });

  it('should have arrow symbols', () => {
    assert.strictEqual(indicators.arrow.right, '→');
    assert.strictEqual(indicators.arrow.left, '←');
    assert.strictEqual(indicators.arrow.up, '↑');
    assert.strictEqual(indicators.arrow.down, '↓');
  });

  it('should have spinner frames for animation', () => {
    assert.ok(Array.isArray(indicators.spinner));
    assert.ok(indicators.spinner.length >= 4);
  });
});

describe('stripAnsi', () => {
  it('should remove color codes', () => {
    assert.strictEqual(stripAnsi(`${ansi.red}Hello${ansi.reset}`), 'Hello');
  });

  it('should remove multiple style codes', () => {
    const styled = `${ansi.bold}${ansi.green}${ansi.bgBlue}Test${ansi.reset}`;
    assert.strictEqual(stripAnsi(styled), 'Test');
  });

  it('should leave plain strings unchanged', () => {
    assert.strictEqual(stripAnsi('Hello World'), 'Hello World');
  });

  it('should handle empty strings', () => {
    assert.strictEqual(stripAnsi(''), '');
  });

  it('should handle strings with only ANSI codes', () => {
    assert.strictEqual(stripAnsi(`${ansi.red}${ansi.reset}`), '');
  });

  it('should handle 256-color codes', () => {
    assert.strictEqual(stripAnsi(`${ansi.fg256(196)}text${ansi.reset}`), 'text');
  });

  it('should handle RGB color codes', () => {
    assert.strictEqual(
      stripAnsi(`${ansi.fgRgb(255, 0, 0)}text${ansi.reset}`),
      'text'
    );
  });
});

describe('visibleLength', () => {
  it('should return correct length excluding ANSI codes', () => {
    assert.strictEqual(visibleLength(`${ansi.red}Hello${ansi.reset}`), 5);
  });

  it('should return plain string length', () => {
    assert.strictEqual(visibleLength('Hello'), 5);
  });

  it('should handle complex nested styling', () => {
    const styled = `${ansi.bold}${ansi.bgBlue}${ansi.white}Hi${ansi.reset}`;
    assert.strictEqual(visibleLength(styled), 2);
  });

  it('should handle empty string', () => {
    assert.strictEqual(visibleLength(''), 0);
  });

  it('should handle unicode characters', () => {
    assert.strictEqual(visibleLength('Hello 世界'), 8);
  });
});

describe('truncate', () => {
  it('should not truncate short strings', () => {
    const result = truncate('Hello', 10);
    assert.strictEqual(stripAnsi(result), 'Hello');
  });

  it('should truncate long strings with ellipsis', () => {
    const result = truncate('Hello World', 8);
    assert.strictEqual(stripAnsi(result), 'Hello W…');
  });

  it('should use custom suffix', () => {
    const result = truncate('Hello World', 8, '...');
    assert.strictEqual(stripAnsi(result), 'Hello...');
  });

  it('should handle exact length', () => {
    const result = truncate('Hello', 5);
    assert.strictEqual(stripAnsi(result), 'Hello');
  });

  it('should handle suffix longer than available space', () => {
    const result = truncate('Hi', 1, '...');
    // With maxLen=1 and suffix='...', truncated would be negative length
    // Should handle gracefully
    assert.ok(result.length >= 0);
  });

  it('should handle empty string', () => {
    const result = truncate('', 10);
    assert.strictEqual(stripAnsi(result), '');
  });
});

describe('pad', () => {
  it('should pad string to right by default', () => {
    assert.strictEqual(pad('Hi', 5), 'Hi   ');
  });

  it('should pad to left', () => {
    assert.strictEqual(pad('Hi', 5, ' ', 'left'), '   Hi');
  });

  it('should pad to center', () => {
    assert.strictEqual(pad('Hi', 6, ' ', 'center'), '  Hi  ');
  });

  it('should handle odd-length center padding', () => {
    const result = pad('Hi', 5, ' ', 'center');
    assert.strictEqual(result.length, 5);
    assert.ok(result.includes('Hi'));
  });

  it('should not pad if already long enough', () => {
    assert.strictEqual(pad('Hello', 3), 'Hello');
  });

  it('should use custom padding character', () => {
    assert.strictEqual(pad('Hi', 5, '-'), 'Hi---');
  });

  it('should handle styled strings correctly', () => {
    const styled = `${ansi.red}Hi${ansi.reset}`;
    const result = pad(styled, 5);
    assert.strictEqual(visibleLength(result), 5);
  });

  it('should handle empty string', () => {
    assert.strictEqual(pad('', 3), '   ');
  });
});

describe('wordWrap', () => {
  it('should wrap text at word boundaries', () => {
    const lines = wordWrap('Hello World Foo Bar', 10);
    assert.deepStrictEqual(lines, ['Hello', 'World Foo', 'Bar']);
  });

  it('should not wrap short text', () => {
    const lines = wordWrap('Hello', 10);
    assert.deepStrictEqual(lines, ['Hello']);
  });

  it('should handle single long word', () => {
    const lines = wordWrap('Supercalifragilistic', 10);
    // Long words that can't be broken should stay intact
    assert.deepStrictEqual(lines, ['Supercalifragilistic']);
  });

  it('should handle empty string', () => {
    const lines = wordWrap('', 10);
    assert.deepStrictEqual(lines, []);
  });

  it('should handle multiple spaces between words', () => {
    const lines = wordWrap('Hello   World', 20);
    // Multiple spaces become single space after split/join
    assert.ok(lines[0].includes('Hello'));
    assert.ok(lines[0].includes('World'));
  });

  it('should handle exact width match', () => {
    const lines = wordWrap('Hello World', 11);
    assert.deepStrictEqual(lines, ['Hello World']);
  });
});

describe('horizontalLine', () => {
  it('should create line of specified width', () => {
    const line = horizontalLine(5);
    assert.strictEqual(line, '─────');
    assert.strictEqual(line.length, 5);
  });

  it('should use custom character', () => {
    const line = horizontalLine(3, '═');
    assert.strictEqual(line, '═══');
  });

  it('should handle zero width', () => {
    const line = horizontalLine(0);
    assert.strictEqual(line, '');
  });

  it('should handle width of 1', () => {
    const line = horizontalLine(1);
    assert.strictEqual(line, '─');
  });
});

describe('style', () => {
  it('should apply single style', () => {
    const result = style('Hello', ansi.bold);
    assert.ok(result.startsWith(ansi.bold));
    assert.ok(result.includes('Hello'));
    assert.ok(result.endsWith(ansi.reset));
  });

  it('should apply multiple styles', () => {
    const result = style('Hello', ansi.bold, ansi.red);
    assert.ok(result.includes(ansi.bold));
    assert.ok(result.includes(ansi.red));
    assert.ok(result.includes('Hello'));
    assert.ok(result.endsWith(ansi.reset));
  });

  it('should return plain text if no styles', () => {
    const result = style('Hello');
    assert.strictEqual(result, 'Hello');
  });

  it('should handle empty text', () => {
    const result = style('', ansi.bold);
    assert.ok(result.includes(ansi.bold));
    assert.ok(result.includes(ansi.reset));
  });

  it('should preserve visible content', () => {
    const result = style('Test', ansi.bold, ansi.red, ansi.bgWhite);
    assert.strictEqual(visibleLength(result), 4);
    assert.strictEqual(stripAnsi(result), 'Test');
  });
});
