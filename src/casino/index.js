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
};

// Marquee animation state
let marqueeFrame = 0;
let marqueeInterval = null;

// Slot reel animation state
let slotReelFrame = 0;
let slotReelInterval = null;
let isSpinning = false;

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
  stopSlotReels();
  stopWinAnimation();
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
 * Render a marquee border line
 * @param {number} width - Terminal width
 * @param {'top' | 'bottom'} position - Border position
 * @returns {string}
 */
function renderMarqueeLine(width, position) {
  if (!casinoEnabled) return '';

  let line = '';
  const startOffset = position === 'bottom' ? width : 0;

  for (let i = 0; i < width; i++) {
    line += getMarqueeChar(startOffset + i, width * 2);
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
  }, 80);
}

/**
 * Stop slot reel animation
 */
function stopSlotReels() {
  if (slotReelInterval) {
    clearInterval(slotReelInterval);
    slotReelInterval = null;
  }
  isSpinning = false;
}

/**
 * Check if slot reels are spinning
 * @returns {boolean}
 */
function isSlotSpinning() {
  return isSpinning;
}

/**
 * Get current slot reel display (3 reels)
 * @returns {string}
 */
function getSlotReelDisplay() {
  if (!isSpinning) return '';

  const symbols = [];
  for (let i = 0; i < 3; i++) {
    const idx = (slotReelFrame + i * 3) % SLOT_SYMBOLS.length;
    symbols.push(SLOT_SYMBOLS[idx]);
  }

  return `${ansi.bgBlack}${ansi.brightYellow} 🎰 ${symbols.join(' ')} 🎰 ${ansi.reset}`;
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
  return lossMessage !== null;
}

// ============================================================================
// Stats Tracking
// ============================================================================

/**
 * Record a successful poll
 * @param {boolean} hadUpdates - Whether updates were found
 */
function recordPoll(hadUpdates) {
  if (!casinoEnabled) return;

  if (hadUpdates) {
    casinoStats.consecutivePolls++;
  } else {
    // Reset streak if no updates (optional - could keep streak going)
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

  return {
    ...casinoStats,
    sessionDuration: hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`,
    totalLines: casinoStats.totalLinesAdded + casinoStats.totalLinesDeleted,
  };
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
  startMarquee,
  stopMarquee,

  // Slot reels
  startSlotReels,
  stopSlotReels,
  isSlotSpinning,
  getSlotReelDisplay,

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
  resetStats,
  getStatsDisplay,
};
