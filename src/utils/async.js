/**
 * Async utilities for Git Watchtower
 * Provides Mutex, timeout wrapper, and retry with exponential backoff
 */

/**
 * Simple mutex for preventing concurrent operations
 * Use this to prevent race conditions in polling and server operations
 *
 * Mutual exclusion is enforced by ownership tokens: acquire() returns a
 * unique Symbol, and release() requires the caller to hand that same
 * token back. Previously release() was just a zero-arg "drain the next
 * waiter" operation — so a double-release or a stray release() without
 * a matching acquire() would advance the queue twice, handing the lock
 * to two owners concurrently and silently breaking the invariant the
 * mutex exists to protect. Tokens make that misuse throw instead.
 */
class Mutex {
  constructor() {
    /** @type {symbol | null} */
    this._heldBy = null;
    /** @type {Array<(token: symbol) => void>} */
    this.queue = [];
  }

  /**
   * Acquire the lock. Resolves with an opaque token that must be passed
   * back to release(). Hold on to it and don't share it across callers.
   * @returns {Promise<symbol>}
   */
  async acquire() {
    return new Promise((resolve) => {
      if (this._heldBy === null) {
        this._heldBy = Symbol('mutex-token');
        resolve(this._heldBy);
      } else {
        this.queue.push(resolve);
      }
    });
  }

  /**
   * Release the lock. The token must be the one returned by the
   * corresponding acquire(). Throws for:
   *   - release() on an unlocked mutex (release-without-acquire)
   *   - release() with a token that doesn't match the current holder
   *     (double-release, or release from the wrong caller)
   *
   * @param {symbol} token
   */
  release(token) {
    if (this._heldBy === null) {
      throw new Error('Mutex.release(): called on an unlocked mutex');
    }
    if (token !== this._heldBy) {
      throw new Error('Mutex.release(): token does not match the current holder');
    }
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      const nextToken = Symbol('mutex-token');
      this._heldBy = nextToken;
      next(nextToken);
    } else {
      this._heldBy = null;
    }
  }

  /**
   * Execute a function while holding the lock
   * @template T
   * @param {() => Promise<T>} fn - Async function to execute
   * @returns {Promise<T>}
   */
  async withLock(fn) {
    const token = await this.acquire();
    try {
      return await fn();
    } finally {
      this.release(token);
    }
  }

  /**
   * Check if the mutex is currently locked
   * @returns {boolean}
   */
  isLocked() {
    return this._heldBy !== null;
  }

  /**
   * Get the number of waiters in the queue
   * @returns {number}
   */
  getQueueLength() {
    return this.queue.length;
  }
}

/**
 * Wrap a promise with a timeout
 * @template T
 * @param {Promise<T>} promise - The promise to wrap
 * @param {number} ms - Timeout in milliseconds
 * @param {string} [message] - Custom timeout error message
 * @returns {Promise<T>}
 * @throws {Error} If the timeout is exceeded
 */
function withTimeout(promise, ms, message = 'Operation timed out') {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(message));
    }, ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

/**
 * Retry an async function with exponential backoff
 * @template T
 * @param {() => Promise<T>} fn - Async function to retry
 * @param {Object} [options] - Retry options
 * @param {number} [options.maxAttempts=3] - Maximum number of attempts
 * @param {number} [options.baseDelay=1000] - Base delay in ms (doubles each retry)
 * @param {number} [options.maxDelay=30000] - Maximum delay between retries
 * @param {(error: Error) => boolean} [options.shouldRetry] - Function to determine if error is retryable
 * @returns {Promise<T>}
 * @throws {Error} The last error if all retries fail
 */
async function retry(fn, options = {}) {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    shouldRetry = () => true,
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry this error
      if (!shouldRetry(error)) {
        throw error;
      }

      // Don't wait after the last attempt
      if (attempt < maxAttempts) {
        const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Sleep for a given number of milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Debounce a function - only execute after delay with no calls
 *
 * cancel() both clears the pending timer and sets an internal flag
 * that the scheduled callback checks at the top. Without the flag,
 * cancel() racing with a timer whose callback has already been
 * dequeued (the timer fired, but the callback hadn't executed yet)
 * was a no-op — clearTimeout can't recall a callback that libuv
 * has already promoted — so fn would run anyway and write into
 * state the caller had just asked to abandon.
 *
 * Calling debounced(...) re-arms: the cancelled flag resets so a new
 * schedule is not pre-squelched by a prior cancel().
 *
 * @template {(...args: any[]) => void} T
 * @param {T} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {T & { cancel: () => void }}
 */
function debounce(fn, delay) {
  let timeoutId = null;
  let cancelled = false;

  const debounced = (...args) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    cancelled = false;
    timeoutId = setTimeout(() => {
      timeoutId = null;
      if (cancelled) return;
      fn(...args);
    }, delay);
  };

  debounced.cancel = () => {
    cancelled = true;
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  // @ts-ignore - TypeScript can't verify generic function augmentation
  return debounced;
}

/**
 * Throttle a function - execute at most once per interval
 *
 * Mirrors debounce() in returning a wrapped function with a `.cancel()`
 * method. If a trailing call has been scheduled (throttle fires on the
 * leading edge and coalesces further calls during the interval into a
 * single trailing call), cancel() drops it. Wire cancel() into shutdown
 * paths so a UI-event-driven throttle can't fire a deferred call after
 * the target module has torn down and leave state partially written.
 *
 * @template {(...args: any[]) => void} T
 * @param {T} fn - Function to throttle
 * @param {number} interval - Minimum interval between calls in milliseconds
 * @returns {T & { cancel: () => void }}
 */
function throttle(fn, interval) {
  let lastCall = 0;
  let timeoutId = null;

  const throttled = (...args) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    if (timeSinceLastCall >= interval) {
      lastCall = now;
      fn(...args);
    } else if (!timeoutId) {
      // Schedule a call for when the interval expires
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        timeoutId = null;
        fn(...args);
      }, interval - timeSinceLastCall);
    }
  };

  throttled.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  // @ts-ignore - TypeScript can't verify generic function augmentation
  return throttled;
}

module.exports = {
  Mutex,
  withTimeout,
  retry,
  sleep,
  debounce,
  throttle,
};
