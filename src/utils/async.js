/**
 * Async utilities for Git Watchtower
 * Provides Mutex, timeout wrapper, and retry with exponential backoff
 */

/**
 * Simple mutex for preventing concurrent operations
 * Use this to prevent race conditions in polling and server operations
 */
class Mutex {
  constructor() {
    this.locked = false;
    this.queue = [];
  }

  /**
   * Acquire the lock. Returns a promise that resolves when lock is acquired.
   * @returns {Promise<void>}
   */
  async acquire() {
    return new Promise((resolve) => {
      if (!this.locked) {
        this.locked = true;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  /**
   * Release the lock. If there are waiting acquirers, the next one gets the lock.
   */
  release() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next();
    } else {
      this.locked = false;
    }
  }

  /**
   * Execute a function while holding the lock
   * @template T
   * @param {() => Promise<T>} fn - Async function to execute
   * @returns {Promise<T>}
   */
  async withLock(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  /**
   * Check if the mutex is currently locked
   * @returns {boolean}
   */
  isLocked() {
    return this.locked;
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
 * @template {(...args: any[]) => void} T
 * @param {T} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {T & { cancel: () => void }}
 */
function debounce(fn, delay) {
  let timeoutId = null;

  const debounced = (...args) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };

  debounced.cancel = () => {
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
 * @template {(...args: any[]) => void} T
 * @param {T} fn - Function to throttle
 * @param {number} interval - Minimum interval between calls in milliseconds
 * @returns {T}
 */
function throttle(fn, interval) {
  let lastCall = 0;
  let timeoutId = null;

  // @ts-ignore - TypeScript can't verify generic function return type
  return (...args) => {
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
}

module.exports = {
  Mutex,
  withTimeout,
  retry,
  sleep,
  debounce,
  throttle,
};
