/**
 * Tests for casino sound effects, focused on the cancelAll() path that
 * lets casino.disable() stop in-flight bell chains and multi-play
 * jackpot sequences. Audio playback itself is a no-op without bundled
 * sound files; these tests exercise the timeout-tracking layer.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

// Resolve a fresh copy of the sounds module per test so the internal
// _pendingTimeouts set doesn't bleed state between cases.
const SOUNDS_PATH = path.join(__dirname, '..', '..', '..', 'src', 'casino', 'sounds.js');

function freshSounds() {
  delete require.cache[require.resolve(SOUNDS_PATH)];
  return require(SOUNDS_PATH);
}

describe('casino sounds: cancelAll', () => {
  let sounds;
  let originalWrite;
  let originalExistsSync;
  let bellCount;

  beforeEach(() => {
    bellCount = 0;
    originalWrite = process.stdout.write.bind(process.stdout);
    // Count terminal bells (BEL = \x07). The bell-chain fallback fires
    // these from setTimeout callbacks, so a successful cancelAll should
    // freeze the count after the immediate first bell.
    process.stdout.write = (s) => {
      if (typeof s === 'string' && s.includes('\x07')) bellCount++;
      // Don't pollute test output with bells — swallow.
      return true;
    };
    // Force the bell-chain fallback so we're not playing real audio.
    // sounds.js's getSoundPath uses fs.existsSync to probe both bundled
    // and system sound paths; on Ubuntu CI runners the freedesktop
    // sounds (bell.oga, complete.oga, etc.) ARE installed at the system
    // paths, so we have to make existsSync return false to force the
    // bell-chain fallback. Stubbing the export of `sounds.getSoundPath`
    // doesn't work — the internal call site captures the module-local
    // reference, not the export property.
    originalExistsSync = fs.existsSync;
    fs.existsSync = () => false;

    sounds = freshSounds();
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
    fs.existsSync = originalExistsSync;
    sounds.cancelAll();
  });

  it('is safe to call when no timeouts are pending', () => {
    sounds.cancelAll();
    sounds.cancelAll(); // idempotent
    assert.equal(bellCount, 0);
  });

  it('cancels pending playJackpot bell chain so post-disable bells do not fire', async () => {
    sounds.playJackpot();
    // playJackpot fires one immediate bell + 2 deferred bells (200ms, 400ms).
    assert.equal(bellCount, 1, 'first bell should fire immediately');

    sounds.cancelAll();

    // Wait past the longest scheduled delay; no further bells should land.
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(
      bellCount,
      1,
      `cancelAll() must stop deferred bells; bellCount=${bellCount}`
    );
  });

  it('cancels pending playMegaJackpot bell chain (5 bells over 600ms)', async () => {
    sounds.playMegaJackpot();
    // The fallback bell-chain schedules 5 bells at i*150ms (0, 150, 300,
    // 450, 600) — all via _scheduleTracked, including the i=0 case
    // because the loop is `for (let i = 0; i < 5; i++)`.
    // A microtask's worth of latency means none have fired yet.
    sounds.cancelAll();

    await new Promise((r) => setTimeout(r, 800));
    assert.equal(
      bellCount,
      0,
      `cancelAll() must stop ALL mega-jackpot bells; bellCount=${bellCount}`
    );
  });

  it('lets pending timeouts complete naturally if cancelAll is not called', async () => {
    sounds.playJackpot();
    await new Promise((r) => setTimeout(r, 500));
    // 1 immediate + 2 deferred (200ms, 400ms) = 3 total.
    assert.equal(bellCount, 3);
  });

  it('does not affect future calls after cancelAll', async () => {
    sounds.playJackpot();
    sounds.cancelAll();
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(bellCount, 1, 'prior chain stayed cancelled');

    // Subsequent playJackpot should still schedule timers normally.
    sounds.playJackpot();
    await new Promise((r) => setTimeout(r, 500));
    // Original immediate (1) + new immediate (1) + 2 deferred = 4.
    assert.equal(bellCount, 4);
  });
});
