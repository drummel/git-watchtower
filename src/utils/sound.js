/**
 * Cross-platform system sound playback
 * @module utils/sound
 */

const { execFile } = require('child_process');

const noop = () => {};

const playBell = () => {
  process.stdout.write('\x07');
};

// Linux audio-tool cascade. Each entry is [command, args]; we try them in
// order and fall through on non-zero exit, ending in a terminal bell.
// Mirrors the previous shell `||` chain without spawning a shell.
const LINUX_ATTEMPTS = [
  ['paplay', ['/usr/share/sounds/freedesktop/stereo/message-new-instant.oga']],
  ['paplay', ['/usr/share/sounds/freedesktop/stereo/complete.oga']],
  ['aplay', ['-q', '/usr/share/sounds/sound-icons/prompt.wav']],
];

function cascade(attempts, onAllFailed, options) {
  if (attempts.length === 0) {
    onAllFailed();
    return;
  }
  const [cmd, args] = attempts[0];
  execFile(cmd, args, options, (err) => {
    if (err) cascade(attempts.slice(1), onAllFailed, options);
  });
}

/**
 * Play a system notification sound (non-blocking).
 *
 * Cross-platform: macOS (afplay), Linux (paplay/aplay cascade), Windows
 * (terminal bell). Uses execFile (no shell) to match the pattern in
 * casino/sounds.js — the previous exec calls passed fixed strings so
 * there was no injection surface either way, but dropping the shell
 * removes the per-call /bin/sh fork and makes the two sound modules
 * consistent.
 *
 * @param {object} [options]
 * @param {string} [options.cwd] - Working directory
 */
function playSound(options = {}) {
  const { platform } = process;
  const cwd = options.cwd || process.cwd();

  if (platform === 'darwin') {
    execFile('afplay', ['/System/Library/Sounds/Pop.aiff'], { cwd }, noop);
  } else if (platform === 'linux') {
    cascade(LINUX_ATTEMPTS, playBell, { cwd });
  } else {
    playBell();
  }
}

module.exports = { playSound };
