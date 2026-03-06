/**
 * PostHog analytics wrapper (singleton)
 *
 * All methods are safe no-ops when telemetry is disabled.
 * Events are fire-and-forget — never blocks the TUI.
 */

const { isTelemetryEnabled, getOrCreateDistinctId } = require('./config');

const POSTHOG_API_KEY = 'phc_fdGL8TVN5aFPXmQ4f1hI8y6sqnscD7dy9j5SM5gTylG';
const POSTHOG_HOST = 'https://us.i.posthog.com';

/** @type {import('posthog-node').PostHog | null} */
let client = null;
let distinctId = '';
let appVersion = '';
let enabled = false;

// Debug mode: records captured events for on-screen inspection
let debugMode = false;
/** @type {Array<{timestamp: number, event: string, properties: Record<string, any>}>} */
let debugLog = [];
const DEBUG_LOG_MAX = 50;

/**
 * Initialize the PostHog client if telemetry is enabled
 * @param {{ version: string }} options
 */
function init({ version }) {
  appVersion = version;

  if (!isTelemetryEnabled()) {
    enabled = false;
    return;
  }

  try {
    const { PostHog } = require('posthog-node');
    distinctId = getOrCreateDistinctId();
    client = new PostHog(POSTHOG_API_KEY, {
      host: POSTHOG_HOST,
      flushAt: 10,
      flushInterval: 30000,
      requestTimeout: 5000,
      disableGeoip: true,
    });
    enabled = true;
  } catch {
    // If posthog-node fails to load, silently disable telemetry
    enabled = false;
    client = null;
  }
}

/**
 * Capture an analytics event (fire-and-forget)
 * @param {string} event - Event name
 * @param {Record<string, any>} [properties] - Event properties
 */
function capture(event, properties = {}) {
  if (debugMode) {
    debugLog.push({ timestamp: Date.now(), event, properties: { ...properties } });
    if (debugLog.length > DEBUG_LOG_MAX) debugLog.shift();
  }

  if (!enabled || !client) return;

  try {
    client.capture({
      distinctId,
      event,
      properties: {
        ...properties,
        $lib: 'git-watchtower',
        $lib_version: appVersion,
      },
    });
  } catch {
    // Never let telemetry errors affect the app
  }
}

/**
 * Capture an error for PostHog error tracking
 * @param {Error} error
 */
function captureError(error) {
  if (!enabled || !client) return;

  try {
    const errorType = error.constructor?.name || 'Error';
    const errorCode = /** @type {any} */ (error).code || '';
    const errorMessage = errorCode || (error.message || '').substring(0, 200);

    /** @type {Record<string, any>} */
    const properties = {
      $exception_type: errorType,
      $exception_message: errorMessage,
      $exception_source: 'node',
      $lib: 'git-watchtower',
      $lib_version: appVersion,
    };

    // Include stack trace — contains only our package's file paths and
    // line numbers, no user data. Required for PostHog error tracking
    // to group, deduplicate, and show useful backtraces.
    if (error.stack) {
      properties.$exception_stack_trace_raw = error.stack;
    }

    client.capture({
      distinctId,
      event: '$exception',
      properties,
    });
  } catch {
    // Never let telemetry errors affect the app
  }
}

/**
 * Flush pending events and shutdown the PostHog client
 * Call this before process exit to ensure events are sent.
 * @returns {Promise<void>}
 */
async function shutdown() {
  if (!enabled || !client) return;

  try {
    await client.shutdown();
  } catch {
    // Best-effort flush
  } finally {
    client = null;
    enabled = false;
  }
}

/**
 * Check if telemetry is currently active
 * @returns {boolean}
 */
function isEnabled() {
  return enabled;
}

/**
 * Toggle analytics debug mode on/off.
 * @returns {boolean} New debug mode state
 */
function toggleDebugMode() {
  debugMode = !debugMode;
  if (debugMode && debugLog.length === 0) {
    debugLog.push({ timestamp: Date.now(), event: '_debug_started', properties: { telemetryEnabled: enabled } });
  }
  return debugMode;
}

/**
 * Set analytics debug mode explicitly.
 * @param {boolean} value
 */
function setDebugMode(value) {
  debugMode = value;
  if (debugMode && debugLog.length === 0) {
    debugLog.push({ timestamp: Date.now(), event: '_debug_started', properties: { telemetryEnabled: enabled } });
  }
}

/**
 * Check if debug mode is active.
 * @returns {boolean}
 */
function isDebugMode() {
  return debugMode;
}

/**
 * Get the debug event log (most recent events).
 * @returns {Array<{timestamp: number, event: string, properties: Record<string, any>}>}
 */
function getDebugLog() {
  return debugLog;
}

/**
 * Clear the debug event log.
 */
function clearDebugLog() {
  debugLog = [];
}

module.exports = {
  init,
  capture,
  captureError,
  shutdown,
  isEnabled,
  toggleDebugMode,
  setDebugMode,
  isDebugMode,
  getDebugLog,
  clearDebugLog,
};
