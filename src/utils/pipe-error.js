/**
 * Stdio pipe error handling.
 *
 * The TUI writes ANSI frames to stdout continuously. If the downstream
 * consumer goes away — SSH drops, the terminal window closes, or the
 * user intentionally short-circuits via `| head` on a non-guarded
 * invocation — the next write() emits an async 'error' event with
 * code EPIPE on the stream. Without a handler, Node promotes that to
 * uncaughtException, which logs a crash report, generates telemetry
 * noise, and clutters the user's prompt on exit.
 *
 * A normal pipe-closed condition is not a crash; the correct response
 * is to clean up and exit quietly with status 0.
 *
 * @module utils/pipe-error
 */

'use strict';

/**
 * Build an 'error' handler for process.stdout / process.stderr.
 *
 * @param {Object} callbacks
 * @param {() => void} callbacks.onEpipe - Invoked when the pipe is closed
 *   from the other end. Typically runs cleanupResources() and exits 0.
 * @param {(err: Error) => void} callbacks.onOther - Invoked for any other
 *   stream error. Typically re-raises via setImmediate so the existing
 *   uncaughtException handler can capture telemetry.
 * @returns {(err: Error & { code?: string }) => void}
 */
function createPipeErrorHandler({ onEpipe, onOther }) {
  return function pipeErrorHandler(err) {
    if (err && err.code === 'EPIPE') {
      onEpipe();
      return;
    }
    onOther(err);
  };
}

module.exports = {
  createPipeErrorHandler,
};
