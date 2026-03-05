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
    // Truncate message to avoid sending sensitive data
    const errorMessage = errorCode || (error.message || '').substring(0, 100);

    client.capture({
      distinctId,
      event: '$exception',
      properties: {
        $exception_type: errorType,
        $exception_message: errorMessage,
        $exception_source: 'node',
        $lib: 'git-watchtower',
        $lib_version: appVersion,
      },
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

module.exports = {
  init,
  capture,
  captureError,
  shutdown,
  isEnabled,
};
