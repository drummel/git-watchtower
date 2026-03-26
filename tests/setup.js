/**
 * Global test setup — loaded via --require in all test scripts.
 *
 * Stubs outbound HTTPS requests to PostHog so that tests never send
 * real analytics events to production.  Other HTTPS traffic (e.g.
 * integration tests that talk to a local server) passes through
 * unaffected.
 */

'use strict';

const https = require('https');
const { EventEmitter } = require('events');

const originalRequest = https.request;

https.request = function stubbedRequest(options, ...args) {
  const host =
    (typeof options === 'string' ? new URL(options).hostname : null) ||
    (options && options.hostname) ||
    (options && options.host) ||
    '';

  if (host.includes('posthog.com')) {
    // Return a no-op writable that satisfies the Node http.ClientRequest
    // interface just enough for analytics.js fire-and-forget calls.
    const noop = new EventEmitter();
    noop.end = () => {};
    noop.destroy = () => {};
    noop.write = () => true;
    return noop;
  }

  return originalRequest.call(this, options, ...args);
};
