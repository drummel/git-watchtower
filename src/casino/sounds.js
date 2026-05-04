/**
 * Casino Mode Sound Effects
 *
 * Plays casino-themed sounds for wins, jackpots, and losses.
 * Uses system audio tools when available, falls back gracefully.
 */

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Pending setTimeout handles for the multi-bell / multi-play chains used
 * by playJackpot and playMegaJackpot. Tracked so casino.disable() (and
 * shutdown) can cancel any in-flight chain instead of letting up to ~600
 * ms of post-disable audio leak through.
 * @type {Set<NodeJS.Timeout>}
 */
const _pendingTimeouts = new Set();

/**
 * Schedule a callback like setTimeout, but auto-track the handle so it
 * can be cancelled by cancelAll() and auto-removes itself on fire.
 * @param {Function} fn
 * @param {number} delay
 * @returns {NodeJS.Timeout}
 * @private
 */
function _scheduleTracked(fn, delay) {
  const handle = setTimeout(() => {
    _pendingTimeouts.delete(handle);
    try { fn(); } catch (e) { /* sounds are optional */ }
  }, delay);
  _pendingTimeouts.add(handle);
  return handle;
}

/**
 * Cancel every pending sound timeout. Idempotent. Called from
 * casino.disable() so a jackpot fired moments before the user toggled
 * casino mode off doesn't keep playing afterward.
 */
function cancelAll() {
  for (const handle of _pendingTimeouts) {
    clearTimeout(handle);
  }
  _pendingTimeouts.clear();
}

// ============================================================================
// Sound Configuration
// ============================================================================

// Path to bundled sound files (if we add them)
const SOUNDS_DIR = path.join(__dirname, '../../sounds');

// System sound fallbacks by platform
const SYSTEM_SOUNDS = {
  darwin: {
    win: '/System/Library/Sounds/Glass.aiff',
    jackpot: '/System/Library/Sounds/Hero.aiff',
    spin: '/System/Library/Sounds/Pop.aiff',
    loss: '/System/Library/Sounds/Basso.aiff',
  },
  linux: {
    win: '/usr/share/sounds/freedesktop/stereo/complete.oga',
    jackpot: '/usr/share/sounds/freedesktop/stereo/bell.oga',
    spin: '/usr/share/sounds/freedesktop/stereo/message.oga',
    loss: '/usr/share/sounds/freedesktop/stereo/dialog-error.oga',
  },
};

// Volume levels (0.0 - 1.0, not all platforms support this)
const VOLUME = {
  win: 0.5,
  jackpot: 0.8,
  spin: 0.3,
  loss: 0.6,
};

// ============================================================================
// Sound Playback
// ============================================================================

/**
 * Play a sound file (non-blocking)
 * @param {string} soundPath - Path to sound file
 * @param {number} [volume=0.5] - Volume level (0.0-1.0)
 */
function playFile(soundPath, volume = 0.5) {
  if (!soundPath) return;

  const { platform } = process;

  try {
    if (platform === 'darwin') {
      // macOS: afplay with volume — args passed as array (no shell)
      execFile('afplay', ['-v', String(volume), soundPath], () => {});
    } else if (platform === 'linux') {
      // Linux: paplay (PulseAudio), fall back to aplay (ALSA)
      execFile('paplay', [soundPath], (err) => {
        if (err) {
          execFile('aplay', ['-q', soundPath], () => {});
        }
      });
    } else if (platform === 'win32') {
      // Windows: Use PowerShell to play sound — path passed as argument
      execFile('powershell', [
        '-c', `(New-Object Media.SoundPlayer $args[0]).PlaySync()`, '-args', soundPath,
      ], { windowsHide: true }, () => {});
    }
  } catch (e) {
    // Silently fail - sounds are optional
  }
}

/**
 * Play terminal bell as fallback
 */
function playBell() {
  process.stdout.write('\x07');
}

/**
 * Get the appropriate sound file for a sound type
 * @param {string} soundType - 'win', 'jackpot', 'spin', or 'loss'
 * @returns {string|null}
 */
function getSoundPath(soundType) {
  const { platform } = process;

  // First check for bundled sounds
  const bundledPath = path.join(SOUNDS_DIR, `${soundType}.wav`);
  if (fs.existsSync(bundledPath)) {
    return bundledPath;
  }

  // Fall back to system sounds
  const systemSounds = SYSTEM_SOUNDS[platform];
  if (systemSounds && systemSounds[soundType]) {
    const systemPath = systemSounds[soundType];
    if (fs.existsSync(systemPath)) {
      return systemPath;
    }
  }

  return null;
}

// ============================================================================
// Casino Sound Effects
// ============================================================================

/**
 * Play a win sound (small to medium wins)
 */
function playWin() {
  const soundPath = getSoundPath('win');
  if (soundPath) {
    playFile(soundPath, VOLUME.win);
  } else {
    playBell();
  }
}

/**
 * Play a jackpot sound (big wins)
 */
function playJackpot() {
  const soundPath = getSoundPath('jackpot');
  if (soundPath) {
    playFile(soundPath, VOLUME.jackpot);
  } else {
    // Multiple bells for jackpot! Tracked so casino.disable() can
    // cancel mid-chain — see _scheduleTracked / cancelAll.
    playBell();
    _scheduleTracked(playBell, 200);
    _scheduleTracked(playBell, 400);
  }
}

/**
 * Play a mega jackpot sound (huge wins)
 */
function playMegaJackpot() {
  const soundPath = getSoundPath('jackpot');
  if (soundPath) {
    // Play jackpot sound multiple times. Tracked for cancellation.
    playFile(soundPath, VOLUME.jackpot);
    _scheduleTracked(() => playFile(soundPath, VOLUME.jackpot), 300);
    _scheduleTracked(() => playFile(soundPath, VOLUME.jackpot), 600);
  } else {
    // Lots of bells!
    for (let i = 0; i < 5; i++) {
      _scheduleTracked(playBell, i * 150);
    }
  }
}

/**
 * Play slot spin sound
 */
function playSpin() {
  const soundPath = getSoundPath('spin');
  if (soundPath) {
    playFile(soundPath, VOLUME.spin);
  }
  // No fallback for spin - it would be annoying
}

/**
 * Play loss/failure sound (sad trombone effect)
 */
function playLoss() {
  const soundPath = getSoundPath('loss');
  if (soundPath) {
    playFile(soundPath, VOLUME.loss);
  } else {
    // Low-pitched bell equivalent
    playBell();
  }
}

/**
 * Play sound based on win level
 * @param {string} levelKey - 'small', 'medium', 'large', 'huge', 'jackpot', 'mega'
 */
function playForWinLevel(levelKey) {
  switch (levelKey) {
    case 'small':
    case 'medium':
      playWin();
      break;
    case 'large':
    case 'huge':
      playJackpot();
      break;
    case 'jackpot':
      playJackpot();
      break;
    case 'mega':
      playMegaJackpot();
      break;
    default:
      playWin();
  }
}

// ============================================================================
// Sound Sources Documentation
// ============================================================================

/**
 * For users who want to add custom sounds:
 *
 * Create a 'sounds' directory in the git-watchtower root with:
 *   - win.wav      - Short victory sound
 *   - jackpot.wav  - Exciting jackpot fanfare
 *   - spin.wav     - Slot machine spinning
 *   - loss.wav     - Sad trombone / failure sound
 *
 * Free sound sources:
 *   - https://freesound.org/
 *   - https://mixkit.co/free-sound-effects/
 *   - https://www.zapsplat.com/
 *
 * Recommended search terms:
 *   - "slot machine win"
 *   - "casino jackpot"
 *   - "coin drop"
 *   - "sad trombone"
 *   - "game over"
 */

module.exports = {
  playWin,
  playJackpot,
  playMegaJackpot,
  playSpin,
  playLoss,
  playForWinLevel,
  cancelAll,
  getSoundPath,
  SOUNDS_DIR,
};
