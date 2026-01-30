/**
 * Tests for Casino Mode
 *
 * Tests the gambling psychology gamification layer for the variable reward
 * timing inherent in watching for CI/AI updates.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const casino = require('../../../src/casino');

describe('casino mode control', () => {
  beforeEach(() => {
    casino.disable();
    casino.resetStats();
  });

  afterEach(() => {
    casino.disable();
    casino.stopSlotReels();
    casino.stopMarquee();
  });

  it('should start disabled by default', () => {
    assert.strictEqual(casino.isEnabled(), false);
  });

  it('should enable casino mode', () => {
    casino.enable();
    assert.strictEqual(casino.isEnabled(), true);
  });

  it('should disable casino mode', () => {
    casino.enable();
    casino.disable();
    assert.strictEqual(casino.isEnabled(), false);
  });

  it('should toggle casino mode', () => {
    assert.strictEqual(casino.toggle(), true);
    assert.strictEqual(casino.isEnabled(), true);
    assert.strictEqual(casino.toggle(), false);
    assert.strictEqual(casino.isEnabled(), false);
  });
});

describe('casino stats tracking', () => {
  beforeEach(() => {
    casino.enable();
    casino.resetStats();
  });

  afterEach(() => {
    casino.disable();
  });

  it('should track polls', () => {
    casino.recordPoll(false);
    casino.recordPoll(false);
    casino.recordPoll(true);

    const stats = casino.getStats();
    assert.strictEqual(stats.totalPolls, 3);
  });

  it('should track near misses (polls without updates)', () => {
    casino.recordPoll(false);
    casino.recordPoll(false);
    casino.recordPoll(true);

    const stats = casino.getStats();
    assert.strictEqual(stats.nearMisses, 2);
  });

  it('should track consecutive polls with updates', () => {
    casino.recordPoll(true);
    casino.recordPoll(true);
    casino.recordPoll(true);

    const stats = casino.getStats();
    assert.strictEqual(stats.consecutivePolls, 3);
  });

  it('should reset streak on miss', () => {
    casino.recordPoll(true);
    casino.recordPoll(true);
    casino.recordPoll(false);

    const stats = casino.getStats();
    assert.strictEqual(stats.consecutivePolls, 0);
  });

  it('should update lastHitTime when updates found', () => {
    const before = Date.now();
    casino.recordPoll(true);
    const after = Date.now();

    const stats = casino.getStats();
    assert.ok(stats.lastHitTime >= before);
    assert.ok(stats.lastHitTime <= after);
  });
});

describe('casino getStats calculations', () => {
  beforeEach(() => {
    casino.enable();
    casino.resetStats();
  });

  afterEach(() => {
    casino.disable();
  });

  it('should calculate hit rate', () => {
    // Hit rate is based on pollsWithUpdates which is set by triggerWin
    casino.triggerWin(10, 0, () => {});
    casino.recordPoll(true);
    casino.recordPoll(false);
    casino.recordPoll(false);
    casino.recordPoll(false);

    const stats = casino.getStats();
    assert.strictEqual(stats.hitRate, 25); // 1/4 = 25%
  });

  it('should return 0 hit rate when no polls', () => {
    const stats = casino.getStats();
    assert.strictEqual(stats.hitRate, 0);
  });

  it('should calculate net winnings (lines - polls)', () => {
    // Simulate a win with triggerWin
    casino.triggerWin(100, 50, () => {}); // 100 added, 50 deleted
    casino.recordPoll(true);
    casino.recordPoll(false);

    const stats = casino.getStats();
    // Total lines: 150, Polls: 2, Net: 148
    assert.strictEqual(stats.totalLines, 150);
    assert.strictEqual(stats.totalPolls, 2);
    assert.strictEqual(stats.netWinnings, 148);
  });

  it('should have house edge between 55 and 100', () => {
    const stats = casino.getStats();
    assert.ok(stats.houseEdge >= 55, 'House edge should be >= 55');
    assert.ok(stats.houseEdge <= 100, 'House edge should be <= 100');
  });

  it('should have luck meter between 50 and 99', () => {
    const stats = casino.getStats();
    assert.ok(stats.luckMeter >= 50, 'Luck meter should be >= 50');
    assert.ok(stats.luckMeter <= 99, 'Luck meter should be <= 99');
  });

  it('should return vibes quality emoji', () => {
    const stats = casino.getStats();
    const vibesEmojis = ['😎', '🔥', '✨', '💫', '🌟', '⚡', '🎯', '💪', '🚀', '💯'];
    assert.ok(vibesEmojis.includes(stats.vibesQuality), 'Should be a valid vibes emoji');
  });

  it('should calculate dopamine hits based on updates and wins', () => {
    casino.triggerWin(600, 0, () => {}); // Big win (500+)
    casino.recordPoll(true);
    casino.triggerWin(50, 0, () => {});
    casino.recordPoll(true);

    const stats = casino.getStats();
    // pollsWithUpdates = 2, bigWins = 1 (x2 bonus)
    // dopamineHits = 2 + (1 * 2) = 4
    assert.strictEqual(stats.dopamineHits, 4);
  });

  it('should track session duration', () => {
    const stats = casino.getStats();
    assert.ok(stats.sessionDuration.includes('m'), 'Should include minutes');
  });
});

describe('casino win levels', () => {
  beforeEach(() => {
    casino.enable();
    casino.resetStats();
  });

  afterEach(() => {
    casino.disable();
  });

  it('should return null for zero lines', () => {
    assert.strictEqual(casino.getWinLevel(0), null);
  });

  it('should return small win for 1-49 lines', () => {
    const level = casino.getWinLevel(25);
    assert.ok(level, 'Should return a level');
    assert.strictEqual(level.key, 'small');
  });

  it('should return medium win for 50-199 lines', () => {
    const level = casino.getWinLevel(100);
    assert.ok(level, 'Should return a level');
    assert.strictEqual(level.key, 'medium');
  });

  it('should return large win for 200-499 lines', () => {
    const level = casino.getWinLevel(300);
    assert.ok(level, 'Should return a level');
    assert.strictEqual(level.key, 'large');
  });

  it('should return huge win for 500-999 lines', () => {
    const level = casino.getWinLevel(750);
    assert.ok(level, 'Should return a level');
    assert.strictEqual(level.key, 'huge');
  });

  it('should return jackpot for 1000-4999 lines', () => {
    const level = casino.getWinLevel(2500);
    assert.ok(level, 'Should return a level');
    assert.strictEqual(level.key, 'jackpot');
  });

  it('should return mega jackpot for 5000+ lines', () => {
    const level = casino.getWinLevel(10000);
    assert.ok(level, 'Should return a level');
    assert.strictEqual(level.key, 'mega');
  });
});

describe('slot reels', () => {
  beforeEach(() => {
    casino.enable();
    casino.resetStats();
  });

  afterEach(() => {
    casino.disable();
    casino.stopSlotReels();
  });

  it('should not be spinning initially', () => {
    assert.strictEqual(casino.isSlotSpinning(), false);
  });

  it('should start spinning when started', () => {
    casino.startSlotReels(() => {});
    assert.strictEqual(casino.isSlotSpinning(), true);
  });

  it('should stop spinning when stopped', () => {
    casino.startSlotReels(() => {});
    casino.stopSlotReels(false, () => {});
    assert.strictEqual(casino.isSlotSpinning(), false);
  });

  it('should return empty display when not active', () => {
    casino.stopSlotReels(false, () => {});
    // Wait for result to clear
    setTimeout(() => {
      assert.strictEqual(casino.getSlotReelDisplay(), '');
    }, 2500);
  });

  it('should return display when spinning', () => {
    casino.startSlotReels(() => {});
    const display = casino.getSlotReelDisplay();
    assert.ok(display.length > 0, 'Should return non-empty display');
  });

  it('should not start if disabled', () => {
    casino.disable();
    casino.startSlotReels(() => {});
    assert.strictEqual(casino.isSlotSpinning(), false);
  });

  it('isSlotsActive should return true when spinning', () => {
    casino.startSlotReels(() => {});
    assert.strictEqual(casino.isSlotsActive(), true);
  });
});

describe('marquee animation', () => {
  beforeEach(() => {
    casino.enable();
  });

  afterEach(() => {
    casino.disable();
    casino.stopMarquee();
  });

  it('should render marquee line when enabled', () => {
    const line = casino.renderMarqueeLine(40, 'top');
    assert.ok(line.length > 0, 'Should render marquee line');
  });

  it('should return empty when disabled', () => {
    casino.disable();
    const line = casino.renderMarqueeLine(40, 'top');
    assert.strictEqual(line, '');
  });

  it('should get side character when enabled', () => {
    const char = casino.getMarqueeSideChar(5, 20, 'left');
    assert.ok(char.length > 0, 'Should return side character');
  });
});

describe('stats reset', () => {
  beforeEach(() => {
    casino.enable();
  });

  afterEach(() => {
    casino.disable();
  });

  it('should reset all stats', () => {
    casino.recordPoll(true);
    casino.recordPoll(true);
    casino.triggerWin(100, 50, () => {});

    casino.resetStats();

    const stats = casino.getStats();
    assert.strictEqual(stats.totalPolls, 0);
    assert.strictEqual(stats.totalLinesAdded, 0);
    assert.strictEqual(stats.totalLinesDeleted, 0);
    assert.strictEqual(stats.nearMisses, 0);
    assert.strictEqual(stats.consecutivePolls, 0);
  });
});
