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

describe('casino getSerializableStats', () => {
  beforeEach(() => {
    casino.disable();
    casino.resetStats();
    casino.enable();
  });

  afterEach(() => {
    casino.disable();
  });

  it('should EXCLUDE the random/clock-driven decorative fields', () => {
    const stats = casino.getSerializableStats();
    // These four are random or Date.now()-driven and would defeat the
    // SSE lastPushedJson dedup — the dashboard recomputes them locally.
    assert.strictEqual(stats.luckMeter, undefined);
    assert.strictEqual(stats.houseEdge, undefined);
    assert.strictEqual(stats.vibesQuality, undefined);
    assert.strictEqual(stats.timeSinceLastHit, undefined);
  });

  it('should KEEP the stable counter and derived fields', () => {
    casino.recordPoll(true);
    casino.triggerWin(100, 0, () => {});
    const stats = casino.getSerializableStats();
    assert.equal(typeof stats.totalLinesAdded, 'number');
    assert.equal(typeof stats.totalLinesDeleted, 'number');
    assert.equal(typeof stats.totalPolls, 'number');
    assert.equal(typeof stats.consecutivePolls, 'number');
    assert.equal(typeof stats.pollsWithUpdates, 'number');
    assert.equal(typeof stats.bigWins, 'number');
    assert.equal(typeof stats.jackpots, 'number');
    assert.equal(typeof stats.megaJackpots, 'number');
    assert.equal(typeof stats.totalLines, 'number');
    assert.equal(typeof stats.netWinnings, 'number');
    assert.equal(typeof stats.dopamineHits, 'number');
    assert.equal(typeof stats.hitRate, 'number');
    assert.equal(typeof stats.sessionDuration, 'string');
  });

  it('should produce identical JSON across consecutive calls when state is unchanged', () => {
    // Regression for the audit finding: getStats() returns random/clock
    // fields that defeat dedup. getSerializableStats must not.
    const samples = [];
    for (let i = 0; i < 5; i++) {
      samples.push(JSON.stringify(casino.getSerializableStats()));
    }
    assert.equal(
      new Set(samples).size,
      1,
      'getSerializableStats should be deterministic when no state has changed'
    );
  });

  it('should change when an underlying counter changes', () => {
    const before = JSON.stringify(casino.getSerializableStats());
    casino.recordPoll(true);
    const after = JSON.stringify(casino.getSerializableStats());
    assert.notEqual(before, after, 'recordPoll should make the payload change');
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

describe('disable() slot cleanup', () => {
  beforeEach(() => {
    casino.disable();
    casino.resetStats();
  });

  afterEach(() => {
    casino.disable();
  });

  it('does not leave a "NOTHING" result on screen after disable mid-spin', () => {
    casino.enable();
    casino.startSlotReels(() => {});
    assert.strictEqual(casino.isSlotSpinning(), true);

    casino.disable();

    // Pre-fix: disable() called stopSlotReels() which set slotResultLabel
    // to "NOTHING" and scheduled a 2s setTimeout to null it. During those
    // 2s, getSlotReelDisplay() would paint a casino panel even though
    // casino mode is off.
    assert.strictEqual(casino.getSlotResultLabel(), null);
    assert.strictEqual(casino.hasSlotResult(), false);
    assert.strictEqual(casino.isSlotsActive(), false);
    assert.strictEqual(casino.getSlotReelDisplay(), '');
  });

  it('getSlotReelDisplay returns empty when disabled even if state is stale', () => {
    casino.enable();
    casino.startSlotReels(() => {});
    // Sanity: display is non-empty while spinning + enabled
    assert.ok(casino.getSlotReelDisplay().length > 0);

    casino.disable();
    assert.strictEqual(casino.getSlotReelDisplay(), '');
  });

  it('cancels the pending no-win 2s clear timeout so it does not fire into the next session', async () => {
    casino.enable();
    casino.startSlotReels(() => {});
    // Simulate an end-of-poll with no updates — schedules the 2s clear.
    casino.stopSlotReels(false, () => {});
    // The no-win branch sets slotResult; this confirms we're in that state.
    assert.strictEqual(casino.hasSlotResult(), true);

    casino.disable();
    // Re-enable and start a new spin immediately. If the old 2s timeout
    // weren't cancelled, it would fire 2s into this fresh session and
    // null the live spin state. Verify the spin survives past 2s.
    casino.enable();
    casino.startSlotReels(() => {});
    await new Promise((r) => setTimeout(r, 2050));
    assert.strictEqual(casino.isSlotSpinning(), true,
      'the old disable()ed session\'s 2s timeout fired and clobbered the new spin');
    casino.disable();
  });

  // Regression for the audit finding: the bin's pollGitChanges() captures
  // `casinoOn` once at the top and continues using the snapshot for the
  // rest of the poll. If the user toggles casino mode off mid-poll, the
  // post-poll `stopSlotReels(true, render, winLevel)` call still fires
  // — and used to install a fresh slotResultInterval that ran for ~3s,
  // calling render() ~20 times. Display getters were already guarded,
  // so the user saw nothing, but render() burned redraws.
  it('stopSlotReels(true, …) called after disable does not invoke renderCallback', async () => {
    casino.enable();
    casino.startSlotReels(() => {});
    casino.disable();

    // Simulate the bin's race: poll completes after disable and calls
    // stopSlotReels with hadUpdates=true (the win path that schedules
    // a 150ms × ~20-frame flash interval).
    let callbackInvocations = 0;
    casino.stopSlotReels(
      true,
      () => { callbackInvocations++; },
      { key: 'small', label: 'WIN', color: '\x1b[32m' }
    );

    // Wait long enough for several frames of the now-non-existent interval.
    await new Promise((r) => setTimeout(r, 500));

    assert.strictEqual(
      callbackInvocations,
      0,
      'stopSlotReels(true, …) post-disable installed a phantom interval that fired render()'
    );
    // Defense-in-depth: also confirm display getters stay clean.
    assert.strictEqual(casino.isSlotsActive(), false);
    assert.strictEqual(casino.getSlotReelDisplay(), '');
    assert.strictEqual(casino.getSlotResultLabel(), null);
  });

  it('stopSlotReels(false, …) called after disable does not schedule the 2s clear timer', async () => {
    casino.enable();
    casino.startSlotReels(() => {});
    casino.disable();

    let callbackInvocations = 0;
    casino.stopSlotReels(false, () => { callbackInvocations++; });

    // The no-win path schedules a setTimeout(..., 2000). Wait past it.
    await new Promise((r) => setTimeout(r, 2050));

    assert.strictEqual(
      callbackInvocations,
      0,
      'stopSlotReels(false, …) post-disable scheduled a phantom 2s clear timer'
    );
  });
});

describe('disable() loss animation cleanup', () => {
  beforeEach(() => {
    casino.disable();
    casino.resetStats();
  });

  afterEach(() => {
    casino.disable();
  });

  it('stops a loss animation in flight and clears the message', () => {
    casino.enable();
    casino.triggerLoss('merge conflict', () => {});
    assert.strictEqual(casino.isLossAnimating(), true);

    casino.disable();

    assert.strictEqual(casino.isLossAnimating(), false);
    assert.strictEqual(casino.getLossDisplay(120), '');
  });

  it('loss interval does not keep firing after disable', async () => {
    casino.enable();

    let renderCalls = 0;
    casino.triggerLoss('switch failed', () => { renderCalls++; });

    // Wait a few frames so the interval has definitely started firing.
    await new Promise((r) => setTimeout(r, 250));
    assert.ok(renderCalls >= 1,
      'pre-disable sanity: loss interval should have fired at least once');

    casino.disable();
    const atDisable = renderCalls;

    // The loss interval fires every 120 ms and self-terminates at frame 15
    // (~1.8 s). If disable() leaked the interval, we'd see more renderCalls.
    await new Promise((r) => setTimeout(r, 600));
    assert.strictEqual(renderCalls, atDisable,
      'loss interval kept firing after disable() — stopLossAnimation was not called');
  });

  it('isLossAnimating returns false when disabled even with stale state', () => {
    casino.enable();
    casino.triggerLoss('boom', () => {});
    assert.strictEqual(casino.isLossAnimating(), true);

    casino.disable();
    assert.strictEqual(casino.isLossAnimating(), false);
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

  // Regression for the audit hygiene finding: disable() previously left
  // marqueeCallback set, so a stale closure to a previous session's render
  // function survived across enable/disable cycles. In production it's
  // benign (the bin sets the callback exactly once at startup against a
  // singleton render fn), but tests that exercised setRenderCallback per
  // iteration saw the previous test's callback fire during the next
  // enable() before its own setRenderCallback overwrote it.
  it('disable() should null the marquee callback so it does not survive into the next session', async () => {
    let firstCallbackInvocations = 0;
    casino.setRenderCallback(() => { firstCallbackInvocations++; });
    // Wait long enough for the marquee interval (150 ms) to fire at least once.
    await new Promise((r) => setTimeout(r, 200));
    assert.ok(firstCallbackInvocations > 0, 'sanity: first callback should be invoked while enabled');

    casino.disable();
    const beforeReenable = firstCallbackInvocations;

    // Re-enable WITHOUT setting a new render callback. If disable() didn't
    // null marqueeCallback, the stale first-callback closure would fire
    // again from the new marquee interval.
    casino.enable();
    await new Promise((r) => setTimeout(r, 250));
    assert.equal(
      firstCallbackInvocations,
      beforeReenable,
      'first session\'s render callback must NOT fire from a fresh enable()'
    );
    casino.disable();
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
