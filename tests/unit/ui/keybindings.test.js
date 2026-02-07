const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  KEYS,
  MODES,
  getCurrentMode,
  isPrintableChar,
  isNavKey,
  isEscapeKey,
  isEnterKey,
  isBackspaceKey,
  isDigitKey,
  getNormalModeAction,
  filterBranches,
} = require('../../../src/ui/keybindings');

describe('KEYS constants', () => {
  it('should define all expected key constants', () => {
    assert.ok(KEYS.UP);
    assert.ok(KEYS.DOWN);
    assert.ok(KEYS.ENTER);
    assert.ok(KEYS.ESCAPE);
    assert.ok(KEYS.BACKSPACE);
    assert.ok(KEYS.CTRL_C);
  });
});

describe('getCurrentMode', () => {
  it('should return NORMAL when no mode flags are set', () => {
    assert.equal(getCurrentMode({}), MODES.NORMAL);
  });

  it('should return SEARCH when searchMode is true', () => {
    assert.equal(getCurrentMode({ searchMode: true }), MODES.SEARCH);
  });

  it('should return PREVIEW when previewMode is true', () => {
    assert.equal(getCurrentMode({ previewMode: true }), MODES.PREVIEW);
  });

  it('should return HISTORY when historyMode is true', () => {
    assert.equal(getCurrentMode({ historyMode: true }), MODES.HISTORY);
  });

  it('should return INFO when infoMode is true', () => {
    assert.equal(getCurrentMode({ infoMode: true }), MODES.INFO);
  });

  it('should return LOG_VIEW when logViewMode is true', () => {
    assert.equal(getCurrentMode({ logViewMode: true }), MODES.LOG_VIEW);
  });

  it('should return ACTION when actionMode is true', () => {
    assert.equal(getCurrentMode({ actionMode: true }), MODES.ACTION);
  });

  it('should prioritize search over other modes', () => {
    assert.equal(getCurrentMode({ searchMode: true, historyMode: true }), MODES.SEARCH);
  });
});

describe('isPrintableChar', () => {
  it('should return true for letters', () => {
    assert.ok(isPrintableChar('a'));
    assert.ok(isPrintableChar('Z'));
  });

  it('should return true for digits', () => {
    assert.ok(isPrintableChar('5'));
  });

  it('should return true for space', () => {
    assert.ok(isPrintableChar(' '));
  });

  it('should return true for symbols', () => {
    assert.ok(isPrintableChar('!'));
    assert.ok(isPrintableChar('/'));
    assert.ok(isPrintableChar('~'));
  });

  it('should return false for multi-char strings', () => {
    assert.equal(isPrintableChar('ab'), false);
  });

  it('should return false for escape sequences', () => {
    assert.equal(isPrintableChar(KEYS.UP), false);
  });

  it('should return false for control chars', () => {
    assert.equal(isPrintableChar('\x01'), false);
  });
});

describe('isNavKey', () => {
  it('should recognize up arrow', () => {
    assert.ok(isNavKey(KEYS.UP));
  });

  it('should recognize down arrow', () => {
    assert.ok(isNavKey(KEYS.DOWN));
  });

  it('should recognize k (vim up)', () => {
    assert.ok(isNavKey('k'));
  });

  it('should recognize j (vim down)', () => {
    assert.ok(isNavKey('j'));
  });

  it('should not recognize other keys', () => {
    assert.equal(isNavKey('a'), false);
    assert.equal(isNavKey(KEYS.ENTER), false);
  });
});

describe('isEscapeKey', () => {
  it('should recognize escape', () => {
    assert.ok(isEscapeKey(KEYS.ESCAPE));
  });

  it('should not recognize other keys', () => {
    assert.equal(isEscapeKey('q'), false);
  });
});

describe('isEnterKey', () => {
  it('should recognize carriage return', () => {
    assert.ok(isEnterKey(KEYS.ENTER));
  });

  it('should recognize newline', () => {
    assert.ok(isEnterKey(KEYS.NEWLINE));
  });

  it('should not recognize other keys', () => {
    assert.equal(isEnterKey(' '), false);
  });
});

describe('isBackspaceKey', () => {
  it('should recognize backspace', () => {
    assert.ok(isBackspaceKey(KEYS.BACKSPACE));
  });

  it('should recognize alt backspace', () => {
    assert.ok(isBackspaceKey(KEYS.BACKSPACE_ALT));
  });
});

describe('isDigitKey', () => {
  it('should recognize 0-9', () => {
    for (let i = 0; i <= 9; i++) {
      assert.ok(isDigitKey(String(i)));
    }
  });

  it('should not recognize letters', () => {
    assert.equal(isDigitKey('a'), false);
  });

  it('should not recognize multi-digit strings', () => {
    assert.equal(isDigitKey('12'), false);
  });
});

describe('getNormalModeAction', () => {
  it('should map up arrow to move_up', () => {
    assert.equal(getNormalModeAction(KEYS.UP), 'move_up');
  });

  it('should map k to move_up', () => {
    assert.equal(getNormalModeAction('k'), 'move_up');
  });

  it('should map down arrow to move_down', () => {
    assert.equal(getNormalModeAction(KEYS.DOWN), 'move_down');
  });

  it('should map j to move_down', () => {
    assert.equal(getNormalModeAction('j'), 'move_down');
  });

  it('should map Enter to select_branch', () => {
    assert.equal(getNormalModeAction(KEYS.ENTER), 'select_branch');
  });

  it('should map v to preview', () => {
    assert.equal(getNormalModeAction('v'), 'preview');
  });

  it('should map / to search', () => {
    assert.equal(getNormalModeAction('/'), 'search');
  });

  it('should map h to history', () => {
    assert.equal(getNormalModeAction('h'), 'history');
  });

  it('should map i to info', () => {
    assert.equal(getNormalModeAction('i'), 'info');
  });

  it('should map u to undo', () => {
    assert.equal(getNormalModeAction('u'), 'undo');
  });

  it('should map p to pull', () => {
    assert.equal(getNormalModeAction('p'), 'pull');
  });

  it('should map r to reload_browsers', () => {
    assert.equal(getNormalModeAction('r'), 'reload_browsers');
  });

  it('should map R to restart_server', () => {
    assert.equal(getNormalModeAction('R'), 'restart_server');
  });

  it('should map l to view_logs', () => {
    assert.equal(getNormalModeAction('l'), 'view_logs');
  });

  it('should map o to open_browser', () => {
    assert.equal(getNormalModeAction('o'), 'open_browser');
  });

  it('should map b to branch_actions', () => {
    assert.equal(getNormalModeAction('b'), 'branch_actions');
  });

  it('should map f to fetch', () => {
    assert.equal(getNormalModeAction('f'), 'fetch');
  });

  it('should map s to toggle_sound', () => {
    assert.equal(getNormalModeAction('s'), 'toggle_sound');
  });

  it('should map c to toggle_casino', () => {
    assert.equal(getNormalModeAction('c'), 'toggle_casino');
  });

  it('should map q to quit', () => {
    assert.equal(getNormalModeAction('q'), 'quit');
  });

  it('should map Ctrl+C to quit', () => {
    assert.equal(getNormalModeAction(KEYS.CTRL_C), 'quit');
  });

  it('should map Escape to escape', () => {
    assert.equal(getNormalModeAction(KEYS.ESCAPE), 'escape');
  });

  it('should map + and = to increase_visible', () => {
    assert.equal(getNormalModeAction('+'), 'increase_visible');
    assert.equal(getNormalModeAction('='), 'increase_visible');
  });

  it('should map - and _ to decrease_visible', () => {
    assert.equal(getNormalModeAction('-'), 'decrease_visible');
    assert.equal(getNormalModeAction('_'), 'decrease_visible');
  });

  it('should map digit keys to set_visible_count', () => {
    assert.equal(getNormalModeAction('1'), 'set_visible_count');
    assert.equal(getNormalModeAction('0'), 'set_visible_count');
  });

  it('should return null for unrecognized keys', () => {
    assert.equal(getNormalModeAction('x'), null);
    assert.equal(getNormalModeAction('Z'), null);
  });
});

describe('filterBranches', () => {
  const branches = [
    { name: 'main' },
    { name: 'feature/login' },
    { name: 'feature/signup' },
    { name: 'bugfix/crash' },
    { name: 'claude/improve-test' },
  ];

  it('should filter branches by name substring', () => {
    const result = filterBranches(branches, 'feature');
    assert.equal(result.length, 2);
    assert.ok(result.every(b => b.name.includes('feature')));
  });

  it('should be case-insensitive', () => {
    const result = filterBranches(branches, 'FEATURE');
    assert.equal(result.length, 2);
  });

  it('should return null for empty query', () => {
    assert.equal(filterBranches(branches, ''), null);
  });

  it('should return null for undefined query', () => {
    assert.equal(filterBranches(branches, undefined), null);
  });

  it('should return empty array for no matches', () => {
    const result = filterBranches(branches, 'xyz');
    assert.equal(result.length, 0);
  });

  it('should match partial names', () => {
    const result = filterBranches(branches, 'bug');
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'bugfix/crash');
  });

  it('should match single character', () => {
    const result = filterBranches(branches, 'm');
    assert.ok(result.length >= 1);
    assert.ok(result.some(b => b.name === 'main'));
  });
});
