/**
 * Casino Mode - Vegas-style feedback for git-watchtower
 *
 * Adds slot machine animations, marquee lights, win celebrations,
 * and gamification stats to make waiting for CI/AI updates feel
 * like hitting the jackpot.
 */

const { ansi, box } = require('../ui/ansi');

// ============================================================================
// Casino Mode State
// ============================================================================

let casinoEnabled = false;
let casinoStats = {
  totalLinesAdded: 0,
  totalLinesDeleted: 0,
  consecutivePolls: 0,
  pollsWithUpdates: 0,
  bigWins: 0,          // 500+ line changes
  jackpots: 0,         // 1000+ line changes
  megaJackpots: 0,     // 5000+ line changes
  sessionStart: Date.now(),
  totalPolls: 0,       // Total lever pulls
  nearMisses: 0,       // Polls with no changes
  lastHitTime: null,   // Timestamp of last update
};

// Marquee animation state
let marqueeFrame = 0;
let marqueeInterval = null;

// Slot reel animation state
let slotReelFrame = 0;
let slotReelInterval = null;
let isSpinning = false;
let slotResult = null;           // Final symbols to display
let slotResultIsWin = false;     // Whether result was a win
let slotResultFlashFrame = 0;    // Flash animation frame
let slotResultInterval = null;   // Interval for result display/flash
let slotResultRenderCallback = null; // Callback for re-rendering
let slotResultLabel = null;      // "NOTHING", "WIN", "BIG WIN", "JACKPOT" etc
let slotResultClearTimeout = null; // No-win 2s auto-clear timer handle

// Win animation state
let winAnimationFrame = 0;
let winAnimationInterval = null;
let currentWinLevel = null;

// ============================================================================
// Configuration
// ============================================================================

const SLOT_SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '🔔', '💎', '7️⃣', '🎰'];
const MARQUEE_CHARS = ['◆', '◇', '●', '○', '★', '☆'];
const MARQUEE_COLORS = [
  ansi.brightRed,
  ansi.brightYellow,
  ansi.brightGreen,
  ansi.brightCyan,
  ansi.brightBlue,
  ansi.brightMagenta,
];

// Win level thresholds (lines added + deleted)
const WIN_LEVELS = {
  small: { min: 1, max: 49, label: 'WIN', color: ansi.green },
  medium: { min: 50, max: 199, label: 'NICE WIN!', color: ansi.yellow },
  large: { min: 200, max: 499, label: 'BIG WIN!', color: ansi.brightYellow },
  huge: { min: 500, max: 999, label: 'HUGE WIN!', color: ansi.brightMagenta },
  jackpot: { min: 1000, max: 4999, label: '💰 JACKPOT! 💰', color: ansi.brightCyan },
  mega: { min: 5000, max: Infinity, label: '🎰 MEGA JACKPOT!!! 🎰', color: ansi.brightRed },
};

// ============================================================================
// Mode Control
// ============================================================================

/**
 * Check if casino mode is enabled
 * @returns {boolean}
 */
function isEnabled() {
  return casinoEnabled;
}

/**
 * Enable casino mode
 */
function enable() {
  casinoEnabled = true;
  startMarquee();
}

/**
 * Disable casino mode
 */
function disable() {
  casinoEnabled = false;
  stopMarquee();
  // resetSlotState — not stopSlotReels — because stopSlotReels() runs the
  // end-of-poll result animation (labels a "NOTHING" panel and schedules a
  // 2s auto-clear). Calling that during disable paints a brand-new casino
  // effect on the way out, which the user just asked to stop.
  resetSlotState();
  stopWinAnimation();
  // resetLossState — stop the loss interval AND clear lossMessage. Without
  // this, a triggerLoss() in flight kept lossAnimationInterval firing for
  // up to ~15 frames × 120 ms = 1.8 s after disable, and lossMessage stayed
  // set so isLossAnimating() reported true into the next session.
  resetLossState();
}

/**
 * Clear all slot reel state and timers without scheduling any new effects.
 * Safe to call from disable() — unlike stopSlotReels(), it does not kick
 * off a result display or a delayed clear timer.
 * @private
 */
function resetSlotState() {
  if (slotReelInterval) {
    clearInterval(slotReelInterval);
    slotReelInterval = null;
  }
  if (slotResultInterval) {
    clearInterval(slotResultInterval);
    slotResultInterval = null;
  }
  if (slotResultClearTimeout) {
    clearTimeout(slotResultClearTimeout);
    slotResultClearTimeout = null;
  }
  isSpinning = false;
  slotReelFrame = 0;
  slotResult = null;
  slotResultIsWin = false;
  slotResultFlashFrame = 0;
  slotResultLabel = null;
  slotResultRenderCallback = null;
}

/**
 * Toggle casino mode
 * @returns {boolean} New state
 */
function toggle() {
  if (casinoEnabled) {
    disable();
  } else {
    enable();
  }
  return casinoEnabled;
}

// ============================================================================
// Marquee Border Animation
// ============================================================================

let marqueeCallback = null;

/**
 * Set the render callback for marquee updates
 * @param {Function} callback
 */
function setRenderCallback(callback) {
  marqueeCallback = callback;
}

/**
 * Start the marquee animation
 */
function startMarquee() {
  if (marqueeInterval) return;
  marqueeInterval = setInterval(() => {
    marqueeFrame = (marqueeFrame + 1) % (MARQUEE_CHARS.length * MARQUEE_COLORS.length);
    // Only trigger re-render if there's a callback and we're enabled
    if (casinoEnabled && marqueeCallback) {
      marqueeCallback();
    }
  }, 150);
}

/**
 * Stop the marquee animation
 */
function stopMarquee() {
  if (marqueeInterval) {
    clearInterval(marqueeInterval);
    marqueeInterval = null;
  }
}

/**
 * Get the current marquee border characters for a position
 * @param {number} position - Position along the border (0-based)
 * @param {number} total - Total border length
 * @returns {string} Colored character
 */
function getMarqueeChar(position, total) {
  const offset = (marqueeFrame + position) % MARQUEE_COLORS.length;
  const charOffset = Math.floor((marqueeFrame + position) / 2) % MARQUEE_CHARS.length;
  return MARQUEE_COLORS[offset] + MARQUEE_CHARS[charOffset] + ansi.reset;
}

/**
 * Get a single marquee character for a specific position on the border
 * @param {number} row - Current row (for side borders)
 * @param {number} height - Terminal height
 * @param {'left' | 'right'} side - Which side
 * @returns {string}
 */
function getMarqueeSideChar(row, height, side) {
  if (!casinoEnabled) return ' ';

  // For side borders, offset based on row position
  const position = side === 'left' ? row : (height - row);
  const offset = (marqueeFrame + position) % MARQUEE_COLORS.length;
  const charOffset = Math.floor((marqueeFrame + position) / 2) % MARQUEE_CHARS.length;
  return MARQUEE_COLORS[offset] + MARQUEE_CHARS[charOffset] + ansi.reset;
}

/**
 * Get casino mode header badge
 * @returns {string}
 */
function getHeaderBadge() {
  if (!casinoEnabled) return '';

  // Flashing "MAX ADDICTION" badge
  const flash = Math.floor(marqueeFrame / 2) % 2 === 0;
  const colors = flash
    ? ansi.bgBrightMagenta + ansi.brightYellow + ansi.bold
    : ansi.bgBrightYellow + ansi.brightMagenta + ansi.bold;

  return ` ${colors} 🎰 MAX ADDICTION 🎰 ${ansi.reset}`;
}

/**
 * Render a marquee border line
 * @param {number} width - Terminal width
 * @param {'top' | 'bottom'} position - Border position
 * @returns {string}
 */
function renderMarqueeLine(width, position) {
  if (!casinoEnabled) return '';

  let line = '';

  for (let i = 0; i < width; i++) {
    // Top goes right (reverse direction), bottom goes left
    const pos = position === 'top' ? (width - 1 - i) : i;
    line += getMarqueeChar(pos, width * 2);
  }

  return line;
}

// ============================================================================
// Slot Reel Animation
// ============================================================================

/**
 * Start slot reel spinning animation
 * @param {Function} renderCallback - Called on each frame
 */
function startSlotReels(renderCallback) {
  if (slotReelInterval || !casinoEnabled) return;

  isSpinning = true;
  slotReelFrame = 0;

  slotReelInterval = setInterval(() => {
    slotReelFrame++;
    if (renderCallback) renderCallback();
  }, 100); // 25% slower than original 80ms
}

/**
 * Stop slot reel animation and show result
 * @param {boolean} hadUpdates - Whether this poll found updates (win)
 * @param {Function} renderCallback - Called to re-render display
 * @param {Object|null} winLevel - The win level object from getWinLevel()
 */
function stopSlotReels(hadUpdates = false, renderCallback = null, winLevel = null) {
  // No-op when casino mode is off. The bin's polling path captures
  // `casinoOn` once at the top of pollGitChanges and continues to use that
  // snapshot for the rest of the cycle, so a poll completing AFTER the
  // user toggled casino off would otherwise install a fresh
  // slotResultInterval that fires render() ~20× over the next 3s. The
  // display getters are already guarded by `casinoEnabled`, so the user
  // sees nothing — but render() still burns full-screen redraws and the
  // interval keeps a closure alive. Drop the call cleanly here instead.
  if (!casinoEnabled) return;

  if (slotReelInterval) {
    clearInterval(slotReelInterval);
    slotReelInterval = null;
  }
  isSpinning = false;

  // Clear any existing result display
  if (slotResultInterval) {
    clearInterval(slotResultInterval);
    slotResultInterval = null;
  }

  slotResultIsWin = hadUpdates;
  slotResultFlashFrame = 0;
  slotResultRenderCallback = renderCallback;

  // Set result label based on win level
  if (!hadUpdates) {
    slotResultLabel = { text: 'NOTHING', color: ansi.gray, emoji: '😴' };
  } else if (!winLevel || winLevel.key === 'small') {
    slotResultLabel = { text: 'WIN', color: ansi.green, emoji: '✨' };
  } else if (winLevel.key === 'medium') {
    slotResultLabel = { text: 'NICE WIN', color: ansi.yellow, emoji: '🎉' };
  } else if (winLevel.key === 'large') {
    slotResultLabel = { text: 'BIG WIN', color: ansi.brightYellow, emoji: '🔥' };
  } else if (winLevel.key === 'huge') {
    slotResultLabel = { text: 'HUGE WIN', color: ansi.brightMagenta, emoji: '💥' };
  } else if (winLevel.key === 'jackpot') {
    slotResultLabel = { text: '💰 JACKPOT 💰', color: ansi.brightCyan, emoji: '7️⃣', isJackpot: true };
  } else if (winLevel.key === 'mega') {
    slotResultLabel = { text: '🎰💰 MEGA JACKPOT 💰🎰', color: ansi.brightRed, emoji: '7️⃣', isJackpot: true };
  } else {
    slotResultLabel = { text: 'WIN', color: ansi.green, emoji: '✨' };
  }

  if (hadUpdates) {
    // WIN: Pick symbol based on win level
    let winSymbol;
    if (slotResultLabel.isJackpot) {
      winSymbol = '7️⃣'; // Classic jackpot sevens
    } else {
      winSymbol = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
    }
    slotResult = [winSymbol, winSymbol, winSymbol, winSymbol, winSymbol];

    // Flash animation for wins (longer for jackpots)
    const flashDuration = slotResultLabel.isJackpot ? 40 : 20;
    slotResultInterval = setInterval(() => {
      slotResultFlashFrame++;
      if (slotResultFlashFrame > flashDuration) {
        clearInterval(slotResultInterval);
        slotResultInterval = null;
        slotResult = null;
        slotResultLabel = null;
        if (slotResultRenderCallback) slotResultRenderCallback();
      } else if (slotResultRenderCallback) {
        slotResultRenderCallback();
      }
    }, 150);
  } else {
    // NO WIN: Show random final symbols
    slotResult = [];
    for (let i = 0; i < 5; i++) {
      const idx = (slotReelFrame + i * 3) % SLOT_SYMBOLS.length;
      slotResult.push(SLOT_SYMBOLS[idx]);
    }

    // Display for 2 seconds then fade. Store the handle so disable() /
    // resetSlotState() can cancel it — otherwise a delayed clear fires
    // mid-way through the next enabled session and nulls live state.
    slotResultClearTimeout = setTimeout(() => {
      slotResultClearTimeout = null;
      slotResult = null;
      slotResultLabel = null;
      if (slotResultRenderCallback) slotResultRenderCallback();
    }, 2000);
  }
}

/**
 * Get the current slot result label
 * @returns {Object|null}
 */
function getSlotResultLabel() {
  if (!casinoEnabled) return null;
  return slotResultLabel;
}

/**
 * Check if slot reels are spinning
 * @returns {boolean}
 */
function isSlotSpinning() {
  if (!casinoEnabled) return false;
  return isSpinning;
}

/**
 * Check if there's a slot result being displayed
 * @returns {boolean}
 */
function hasSlotResult() {
  if (!casinoEnabled) return false;
  return slotResult !== null;
}

/**
 * Check if slots are active (spinning or showing result)
 * @returns {boolean}
 */
function isSlotsActive() {
  if (!casinoEnabled) return false;
  return isSpinning || slotResult !== null;
}

/**
 * Get current slot reel display (5 reels) with emojis on white backgrounds
 * @returns {string}
 */
function getSlotReelDisplay() {
  // Defense-in-depth: even if stale state survived a disable/enable cycle,
  // don't paint casino UI when the mode is off.
  if (!casinoEnabled) return '';

  // Show result if we have one
  if (slotResult) {
    const reels = [];
    for (let i = 0; i < 5; i++) {
      if (slotResultIsWin) {
        // Flashing effect for wins - alternate between bright and dim
        const flash = slotResultFlashFrame % 2 === 0;
        const bg = flash ? ansi.bgBrightYellow : ansi.bgBrightWhite;
        reels.push(`${bg} ${slotResult[i]} ${ansi.reset}`);
      } else {
        // Static pure white background for no-win results
        reels.push(`${ansi.bgBrightWhite} ${slotResult[i]} ${ansi.reset}`);
      }
    }
    return reels.join(`${ansi.bgBlack} ${ansi.reset}`);
  }

  // Show spinning reels
  if (!isSpinning) return '';

  const reels = [];
  for (let i = 0; i < 5; i++) {
    const idx = (slotReelFrame + i * 3) % SLOT_SYMBOLS.length;
    // Each emoji on pure white background
    reels.push(`${ansi.bgBrightWhite} ${SLOT_SYMBOLS[idx]} ${ansi.reset}`);
  }

  // Join with black background space between
  return reels.join(`${ansi.bgBlack} ${ansi.reset}`);
}

// ============================================================================
// Win Animations
// ============================================================================

/**
 * Get win level based on total lines changed
 * @param {number} linesChanged - Total lines (added + deleted)
 * @returns {Object|null}
 */
function getWinLevel(linesChanged) {
  for (const [key, level] of Object.entries(WIN_LEVELS)) {
    if (linesChanged >= level.min && linesChanged <= level.max) {
      return { key, ...level };
    }
  }
  return null;
}

/**
 * Trigger a win animation
 * @param {number} linesAdded
 * @param {number} linesDeleted
 * @param {Function} renderCallback
 */
function triggerWin(linesAdded, linesDeleted, renderCallback) {
  if (!casinoEnabled) return;

  const totalLines = linesAdded + linesDeleted;
  currentWinLevel = getWinLevel(totalLines);

  if (!currentWinLevel) return;

  // Update stats
  casinoStats.totalLinesAdded += linesAdded;
  casinoStats.totalLinesDeleted += linesDeleted;
  casinoStats.pollsWithUpdates++;

  if (totalLines >= 500) casinoStats.bigWins++;
  if (totalLines >= 1000) casinoStats.jackpots++;
  if (totalLines >= 5000) casinoStats.megaJackpots++;

  // Start animation
  winAnimationFrame = 0;
  stopWinAnimation();

  winAnimationInterval = setInterval(() => {
    winAnimationFrame++;
    if (winAnimationFrame > 20) {
      stopWinAnimation();
      currentWinLevel = null;
    }
    if (renderCallback) renderCallback();
  }, 100);
}

/**
 * Stop win animation
 */
function stopWinAnimation() {
  if (winAnimationInterval) {
    clearInterval(winAnimationInterval);
    winAnimationInterval = null;
  }
}

/**
 * Get current win animation display
 * @param {number} width - Available width
 * @returns {string}
 */
function getWinDisplay(width) {
  if (!currentWinLevel || !casinoEnabled) return '';

  const flashOn = winAnimationFrame % 2 === 0;
  const label = currentWinLevel.label;
  const color = flashOn ? currentWinLevel.color : ansi.dim + currentWinLevel.color;

  const padding = Math.max(0, Math.floor((width - label.length) / 2));

  return color + ' '.repeat(padding) + label + ' '.repeat(padding) + ansi.reset;
}

/**
 * Check if win animation is active
 * @returns {boolean}
 */
function isWinAnimating() {
  return currentWinLevel !== null;
}

// ============================================================================
// Loss/Failure Effects
// ============================================================================

let lossAnimationFrame = 0;
let lossAnimationInterval = null;
let lossMessage = null;

/**
 * Trigger a loss animation (merge conflict, switch failure)
 * @param {string} message - Loss message
 * @param {Function} renderCallback
 */
function triggerLoss(message, renderCallback) {
  if (!casinoEnabled) return;

  lossMessage = message;
  lossAnimationFrame = 0;
  stopLossAnimation();

  lossAnimationInterval = setInterval(() => {
    lossAnimationFrame++;
    if (lossAnimationFrame > 15) {
      stopLossAnimation();
      lossMessage = null;
    }
    if (renderCallback) renderCallback();
  }, 120);
}

/**
 * Stop loss animation
 */
function stopLossAnimation() {
  if (lossAnimationInterval) {
    clearInterval(lossAnimationInterval);
    lossAnimationInterval = null;
  }
}

/**
 * Clear all loss animation state without side effects. Used by disable()
 * so a loss in flight at the moment casino mode is turned off doesn't
 * keep its interval running or leave lossMessage set for isLossAnimating().
 * @private
 */
function resetLossState() {
  stopLossAnimation();
  lossMessage = null;
  lossAnimationFrame = 0;
}

/**
 * Get loss animation display
 * @param {number} width
 * @returns {string}
 */
function getLossDisplay(width) {
  if (!lossMessage || !casinoEnabled) return '';

  const flashOn = lossAnimationFrame % 2 === 0;
  const symbols = '💀 ';
  const display = `${symbols}${lossMessage}${symbols}`;
  const color = flashOn ? ansi.bgRed + ansi.white : ansi.bgBlack + ansi.red;

  const padding = Math.max(0, Math.floor((width - display.length) / 2));

  return color + ' '.repeat(padding) + display + ' '.repeat(padding) + ansi.reset;
}

/**
 * Check if loss animation is active
 * @returns {boolean}
 */
function isLossAnimating() {
  if (!casinoEnabled) return false;
  return lossMessage !== null;
}

// ============================================================================
// Stats Tracking
// ============================================================================

/**
 * Record a poll (each pull of the lever)
 * @param {boolean} hadUpdates - Whether updates were found
 */
function recordPoll(hadUpdates) {
  if (!casinoEnabled) return;

  casinoStats.totalPolls++;

  if (hadUpdates) {
    casinoStats.consecutivePolls++;
    casinoStats.lastHitTime = Date.now();
  } else {
    casinoStats.nearMisses++;
    // Reset streak on miss
    casinoStats.consecutivePolls = 0;
  }
}

/**
 * Get current session stats
 * @returns {Object}
 */
function getStats() {
  const elapsed = Date.now() - casinoStats.sessionStart;
  const hours = Math.floor(elapsed / 3600000);
  const minutes = Math.floor((elapsed % 3600000) / 60000);

  // Calculate hit rate (percentage of polls that had updates)
  const hitRate = casinoStats.totalPolls > 0
    ? Math.round((casinoStats.pollsWithUpdates / casinoStats.totalPolls) * 100)
    : 0;

  // Time since last hit
  let timeSinceLastHit = 'Never';
  if (casinoStats.lastHitTime) {
    const sinceHit = Date.now() - casinoStats.lastHitTime;
    const hitMins = Math.floor(sinceHit / 60000);
    const hitSecs = Math.floor((sinceHit % 60000) / 1000);
    timeSinceLastHit = hitMins > 0 ? `${hitMins}m ${hitSecs}s` : `${hitSecs}s`;
  }

  // Luck meter - weighted random that trends with recent activity
  const baseLuck = 50 + Math.random() * 30;
  const streakBonus = Math.min(casinoStats.consecutivePolls * 5, 20);
  const luckMeter = Math.min(Math.round(baseLuck + streakBonus), 99);

  // House edge - oscillates between 55% and 100%
  const houseEdge = Math.round(55 + Math.random() * 45);

  // Vibes quality - random emoji that changes slowly (based on seconds)
  const vibesEmojis = ['😎', '🔥', '✨', '💫', '🌟', '⚡', '🎯', '💪', '🚀', '💯'];
  const vibesIndex = Math.floor(Date.now() / 3000) % vibesEmojis.length;
  const vibesQuality = vibesEmojis[vibesIndex];

  // Dopamine hits - based on updates received, with multiplier for big wins
  const baseHits = casinoStats.pollsWithUpdates;
  const bonusHits = casinoStats.bigWins * 2 + casinoStats.jackpots * 5 + casinoStats.megaJackpots * 10;
  const dopamineHits = baseHits + bonusHits;

  // Net winnings: total lines gained minus poll cost (1 per poll)
  const totalLines = casinoStats.totalLinesAdded + casinoStats.totalLinesDeleted;
  const netWinnings = totalLines - casinoStats.totalPolls;

  return {
    ...casinoStats,
    sessionDuration: hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`,
    totalLines,
    hitRate,
    timeSinceLastHit,
    luckMeter,
    houseEdge,
    vibesQuality,
    dopamineHits,
    netWinnings,
  };
}

/**
 * Stats payload safe for SSE serialization. Excludes the random/clock-driven
 * decorative fields (luckMeter, houseEdge, vibesQuality, timeSinceLastHit)
 * because they tick on every call — leaving them in the payload defeats
 * web.js's `lastPushedJson` dedup, so the full ~100 KB state is shipped to
 * every connected client every 500 ms even when nothing has actually
 * changed. The dashboard recomputes these client-side at render time.
 *
 * Stable but slow-ticking fields (sessionDuration, which changes once per
 * minute) are kept — the cost is at most one extra push per minute.
 *
 * @returns {Object}
 */
function getSerializableStats() {
  const { luckMeter, houseEdge, vibesQuality, timeSinceLastHit, ...stable } = getStats();
  return stable;
}

/**
 * Reset session stats
 */
function resetStats() {
  casinoStats = {
    totalLinesAdded: 0,
    totalLinesDeleted: 0,
    consecutivePolls: 0,
    pollsWithUpdates: 0,
    bigWins: 0,
    jackpots: 0,
    megaJackpots: 0,
    sessionStart: Date.now(),
    totalPolls: 0,
    nearMisses: 0,
    lastHitTime: null,
  };
}

/**
 * Get stats display for footer
 * @returns {string}
 */
function getStatsDisplay() {
  if (!casinoEnabled) return '';

  const stats = getStats();
  const linesDisplay = stats.totalLines > 0
    ? `${ansi.brightGreen}+${stats.totalLinesAdded}${ansi.reset}/${ansi.brightRed}-${stats.totalLinesDeleted}${ansi.reset}`
    : '0';

  let display = `${ansi.yellow}🎰 Winnings: ${linesDisplay} lines`;

  if (stats.consecutivePolls > 1) {
    display += ` ${ansi.brightMagenta}(${stats.consecutivePolls}x streak!)${ansi.reset}`;
  }

  if (stats.jackpots > 0) {
    display += ` ${ansi.brightCyan}💰×${stats.jackpots}${ansi.reset}`;
  }

  return display + ansi.reset;
}

// ============================================================================
// Module Exports
// ============================================================================

module.exports = {
  // Mode control
  isEnabled,
  enable,
  disable,
  toggle,

  // Render callback
  setRenderCallback,

  // Marquee
  renderMarqueeLine,
  getMarqueeSideChar,
  getHeaderBadge,
  startMarquee,
  stopMarquee,

  // Slot reels
  startSlotReels,
  stopSlotReels,
  isSlotSpinning,
  hasSlotResult,
  isSlotsActive,
  getSlotReelDisplay,
  getSlotResultLabel,

  // Win effects
  triggerWin,
  getWinDisplay,
  isWinAnimating,
  getWinLevel,
  WIN_LEVELS,

  // Loss effects
  triggerLoss,
  getLossDisplay,
  isLossAnimating,

  // Stats
  recordPoll,
  getStats,
  getSerializableStats,
  resetStats,
  getStatsDisplay,
};
