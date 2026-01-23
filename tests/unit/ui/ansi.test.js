/**
 * Tests for ANSI utilities
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  ansi,
  box,
  sparkline,
  indicators,
  stripAnsi,
  visibleLength,
  truncate,
  pad,
  wordWrap,
  horizontalLine,
  style,
} = require('../../../src/ui/ansi');

describe('ansi codes', () => {
  it('should have screen control codes', () => {
    assert.ok(ansi.clearScreen.includes('[2J'));
    assert.ok(ansi.clearLine.includes('[2K'));
    assert.ok(ansi.hideCursor.includes('?25l'));
    assert.ok(ansi.showCursor.includes('?25h'));
  });

  it('should have moveTo function', () => {
    const code = ansi.moveTo(5, 10);
    assert.ok(code.includes('5;10H'));
  });

  it('should have text style codes', () => {
    assert.ok(ansi.bold.includes('[1m'));
    assert.ok(ansi.dim.includes('[2m'));
    assert.ok(ansi.reset.includes('[0m'));
  });

  it('should have foreground color codes', () => {
    assert.ok(ansi.red.includes('[31m'));
    assert.ok(ansi.green.includes('[32m'));
    assert.ok(ansi.blue.includes('[34m'));
    assert.ok(ansi.gray.includes('[90m'));
  });

  it('should have background color codes', () => {
    assert.ok(ansi.bgRed.includes('[41m'));
    assert.ok(ansi.bgGreen.includes('[42m'));
    assert.ok(ansi.bgBlue.includes('[44m'));
  });

  it('should generate 256-color codes', () => {
    const fg = ansi.fg256(196);
    const bg = ansi.bg256(21);
    assert.ok(fg.includes('38;5;196'));
    assert.ok(bg.includes('48;5;21'));
  });

  it('should generate RGB color codes', () => {
    const fg = ansi.fgRgb(255, 128, 0);
    const bg = ansi.bgRgb(0, 128, 255);
    assert.ok(fg.includes('38;2;255;128;0'));
    assert.ok(bg.includes('48;2;0;128;255'));
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
    assert.strictEqual(box.dHorizontal, '═');
    assert.strictEqual(box.dVertical, '║');
  });

  it('should have rounded corners', () => {
    assert.strictEqual(box.rTopLeft, '╭');
    assert.strictEqual(box.rTopRight, '╮');
    assert.strictEqual(box.rBottomLeft, '╰');
    assert.strictEqual(box.rBottomRight, '╯');
  });
});

describe('sparkline', () => {
  it('should have 8 height levels', () => {
    assert.strictEqual(sparkline.chars.length, 8);
    assert.strictEqual(sparkline.chars[0], '▁');
    assert.strictEqual(sparkline.chars[7], '█');
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

  it('should have spinner frames', () => {
    assert.strictEqual(indicators.spinner.length, 10);
  });
});

describe('stripAnsi', () => {
  it('should remove ANSI codes from string', () => {
    const colored = `${ansi.red}Hello${ansi.reset}`;
    assert.strictEqual(stripAnsi(colored), 'Hello');
  });

  it('should handle multiple ANSI codes', () => {
    const styled = `${ansi.bold}${ansi.green}Test${ansi.reset}`;
    assert.strictEqual(stripAnsi(styled), 'Test');
  });

  it('should return plain strings unchanged', () => {
    assert.strictEqual(stripAnsi('Hello World'), 'Hello World');
  });

  it('should handle empty strings', () => {
    assert.strictEqual(stripAnsi(''), '');
  });
});

describe('visibleLength', () => {
  it('should return length excluding ANSI codes', () => {
    const colored = `${ansi.red}Hello${ansi.reset}`;
    assert.strictEqual(visibleLength(colored), 5);
  });

  it('should return plain string length', () => {
    assert.strictEqual(visibleLength('Hello'), 5);
  });

  it('should handle complex styling', () => {
    const styled = `${ansi.bold}${ansi.bgBlue}${ansi.white}Hi${ansi.reset}`;
    assert.strictEqual(visibleLength(styled), 2);
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
});

describe('pad', () => {
  it('should pad string to right by default', () => {
    const result = pad('Hi', 5);
    assert.strictEqual(result, 'Hi   ');
  });

  it('should pad to left', () => {
    const result = pad('Hi', 5, ' ', 'left');
    assert.strictEqual(result, '   Hi');
  });

  it('should pad to center', () => {
    const result = pad('Hi', 6, ' ', 'center');
    assert.strictEqual(result, '  Hi  ');
  });

  it('should not pad if already long enough', () => {
    const result = pad('Hello', 3);
    assert.strictEqual(result, 'Hello');
  });

  it('should use custom padding character', () => {
    const result = pad('Hi', 5, '-');
    assert.strictEqual(result, 'Hi---');
  });

  it('should handle styled strings', () => {
    const styled = `${ansi.red}Hi${ansi.reset}`;
    const result = pad(styled, 5);
    assert.strictEqual(visibleLength(result), 5);
    assert.ok(result.includes('Hi'));
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
    assert.deepStrictEqual(lines, ['Supercalifragilistic']);
  });

  it('should handle empty string', () => {
    const lines = wordWrap('', 10);
    assert.deepStrictEqual(lines, []);
  });
});

describe('horizontalLine', () => {
  it('should create line of specified width', () => {
    const line = horizontalLine(5);
    assert.strictEqual(line, '─────');
  });

  it('should use custom character', () => {
    const line = horizontalLine(3, '═');
    assert.strictEqual(line, '═══');
  });
});

describe('style', () => {
  it('should apply single style', () => {
    const result = style('Hello', ansi.bold);
    assert.ok(result.includes(ansi.bold));
    assert.ok(result.includes('Hello'));
    assert.ok(result.includes(ansi.reset));
  });

  it('should apply multiple styles', () => {
    const result = style('Hello', ansi.bold, ansi.red);
    assert.ok(result.includes(ansi.bold));
    assert.ok(result.includes(ansi.red));
    assert.ok(result.includes('Hello'));
    assert.ok(result.includes(ansi.reset));
  });

  it('should return plain text if no styles', () => {
    const result = style('Hello');
    assert.strictEqual(result, 'Hello');
  });
});
