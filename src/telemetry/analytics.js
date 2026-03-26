/**
 * Analytics wrapper using direct PostHog HTTP API (zero dependencies)
 *
 * All methods are safe no-ops when telemetry is disabled.
 * Events are fire-and-forget — never blocks the TUI.
 */

const https = require('https');
const { isTelemetryEnabled, getOrCreateDistinctId } = require('./config');

const POSTHOG_API_KEY = 'phc_fdGL8TVN5aFPXmQ4f1hI8y6sqnscD7dy9j5SM5gTylG';
const POSTHOG_HOST = 'us.i.posthog.com';

let distinctId = '';
let appVersion = '';
let enabled = false;

/** @type {Array<Record<string, any>>} */
let eventQueue = [];
let flushTimer = null;
const FLUSH_INTERVAL = 30000; // 30 seconds
const FLUSH_AT = 10; // flush when 10 events accumulated

/**
 * Send a batch of events to PostHog via HTTPS POST.
 * Returns a promise that resolves when the request completes (or fails).
 * Callers that don't need to wait can ignore the return value.
 * @param {Array<Record<string, any>>} events
 * @returns {Promise<void>}
 */
function sendBatch(events) {
  if (events.length === 0) return Promise.resolve();

  return new Promise((resolve) => {
    const payload = JSON.stringify({ api_key: POSTHOG_API_KEY, batch: events });

    const req = https.request({
      hostname: POSTHOG_HOST,
      port: 443,
      path: '/batch',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 5000,
    });

    req.on('error', () => resolve());
    req.on('timeout', () => { req.destroy(); resolve(); });
    req.on('response', () => resolve());
    req.end(payload);
  });
}

/**
 * Flush pending events.
 * @returns {Promise<void>} Resolves when the batch has been sent (or fails).
 */
function flush() {
  if (eventQueue.length === 0) return Promise.resolve();
  const batch = eventQueue;
  eventQueue = [];
  return sendBatch(batch);
}

/**
 * Queue an event for sending
 * @param {string} event - Event name
 * @param {Record<string, any>} properties - Event properties
 * @param {string} [overrideDistinctId] - Override distinct ID (for pre-consent events)
 */
function queueEvent(event, properties, overrideDistinctId) {
  eventQueue.push({
    event,
    distinct_id: overrideDistinctId || distinctId,
    properties: {
      ...properties,
      $lib: 'git-watchtower',
      $lib_version: appVersion,
    },
    timestamp: new Date().toISOString(),
  });

  if (eventQueue.length >= FLUSH_AT) {
    flush();
  }
}

/**
 * Set the app version so that even pre-init events include $lib_version.
 * Call this before promptIfNeeded() so consent events carry the version.
 * @param {string} version
 */
function setVersion(version) {
  appVersion = version;
}

/**
 * Initialize the analytics client if telemetry is enabled
 * @param {{ version: string }} options
 */
function init({ version }) {
  appVersion = version;

  if (!isTelemetryEnabled()) {
    enabled = false;
    return;
  }

  distinctId = getOrCreateDistinctId();
  enabled = true;

  // Periodic flush
  flushTimer = setInterval(flush, FLUSH_INTERVAL);
  if (flushTimer.unref) flushTimer.unref(); // Don't keep process alive
}

/**
 * Capture an analytics event (fire-and-forget)
 * @param {string} event - Event name
 * @param {Record<string, any>} [properties] - Event properties
 */
function capture(event, properties = {}) {
  if (!enabled) return;

  try {
    queueEvent(event, properties);
  } catch {
    // Never let telemetry errors affect the app
  }
}

/**
 * Capture an error for PostHog error tracking
 * @param {Error} error
 */
function captureError(error) {
  if (!enabled) return;

  try {
    const errorType = error.constructor?.name || 'Error';
    const errorCode = /** @type {any} */ (error).code || '';
    const errorMessage = errorCode || (error.message || '').substring(0, 200);

    /** @type {Record<string, any>} */
    const properties = {
      $exception_type: errorType,
      $exception_message: errorMessage,
      $exception_source: 'node',
    };

    if (error.stack) {
      properties.$exception_stack_trace_raw = error.stack;
    }

    queueEvent('$exception', properties);
  } catch {
    // Never let telemetry errors affect the app
  }
}

/**
 * Send a one-off event that bypasses the enabled check.
 * Used for prompt_shown and analytics_decision events that fire
 * before the user has made their telemetry choice.
 * @param {string} event - Event name
 * @param {string} userDistinctId - The user's distinct ID
 * @param {Record<string, any>} [properties] - Event properties
 */
function captureAlways(event, userDistinctId, properties = {}) {
  try {
    const payload = JSON.stringify({
      api_key: POSTHOG_API_KEY,
      batch: [{
        event,
        distinct_id: userDistinctId,
        properties: {
          ...properties,
          $lib: 'git-watchtower',
          $lib_version: appVersion,
        },
        timestamp: new Date().toISOString(),
      }],
    });

    const req = https.request({
      hostname: POSTHOG_HOST,
      port: 443,
      path: '/batch',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 5000,
    });

    req.on('error', () => {});
    req.on('timeout', () => req.destroy());
    req.end(payload);
  } catch {
    // Never let telemetry errors affect the app
  }
}

/**
 * Flush pending events and shutdown.
 * Call this before process exit to ensure events are sent.
 * @returns {Promise<void>}
 */
async function shutdown() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }

  if (!enabled) return;

  try {
    await flush();
  } catch {
    // Best-effort flush
  } finally {
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

module.exports = {
  setVersion,
  init,
  capture,
  captureError,
  captureAlways,
  shutdown,
  isEnabled,
};
