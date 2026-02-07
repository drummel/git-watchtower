/**
 * Cross-platform system sound playback
 * @module utils/sound
 */

const { exec } = require('child_process');

/**
 * Play a system notification sound (non-blocking).
 * Cross-platform: macOS (afplay), Linux (paplay/aplay), Windows (terminal bell).
 * @param {object} [options]
 * @param {string} [options.cwd] - Working directory for exec
 */
function playSound(options = {}) {
  const { platform } = process;
  const cwd = options.cwd || process.cwd();

  if (platform === 'darwin') {
    exec('afplay /System/Library/Sounds/Pop.aiff 2>/dev/null', { cwd });
  } else if (platform === 'linux') {
    exec(
      'paplay /usr/share/sounds/freedesktop/stereo/message-new-instant.oga 2>/dev/null || ' +
      'paplay /usr/share/sounds/freedesktop/stereo/complete.oga 2>/dev/null || ' +
      'aplay /usr/share/sounds/sound-icons/prompt.wav 2>/dev/null || ' +
      'printf "\\a"',
      { cwd }
    );
  } else {
    process.stdout.write('\x07');
  }
}

module.exports = { playSound };
