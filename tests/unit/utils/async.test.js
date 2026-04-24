/**
 * Tests for async utilities
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  Mutex,
  withTimeout,
  retry,
  sleep,
  debounce,
  throttle,
} = require('../../../src/utils/async');

describe('Mutex', () => {
  let mutex;

  beforeEach(() => {
    mutex = new Mutex();
  });

  it('should start unlocked', () => {
    assert.strictEqual(mutex.isLocked(), false);
    assert.strictEqual(mutex.getQueueLength(), 0);
  });

  it('should lock when acquired', async () => {
    await mutex.acquire();
    assert.strictEqual(mutex.isLocked(), true);
  });

  it('acquire() resolves with a unique symbol token', async () => {
    const t1 = await mutex.acquire();
    assert.strictEqual(typeof t1, 'symbol');
    mutex.release(t1);

    const t2 = await mutex.acquire();
    assert.notStrictEqual(t1, t2);
    mutex.release(t2);
  });

  it('should unlock when released', async () => {
    const token = await mutex.acquire();
    mutex.release(token);
    assert.strictEqual(mutex.isLocked(), false);
  });

  it('should queue waiters when locked', async () => {
    const firstToken = await mutex.acquire();

    // Start a second acquire (will be queued)
    const secondAcquire = mutex.acquire();
    assert.strictEqual(mutex.getQueueLength(), 1);

    // Release to let second through
    mutex.release(firstToken);
    const secondToken = await secondAcquire;
    assert.strictEqual(mutex.getQueueLength(), 0);
    assert.strictEqual(mutex.isLocked(), true);
    assert.notStrictEqual(firstToken, secondToken);
    mutex.release(secondToken);
  });

  it('should enforce sequential execution with withLock', async () => {
    const results = [];

    const task = async (id, delay) => {
      await mutex.withLock(async () => {
        results.push(`start-${id}`);
        await sleep(delay);
        results.push(`end-${id}`);
      });
    };

    // Run two tasks concurrently - they should execute sequentially
    await Promise.all([task(1, 20), task(2, 10)]);

    // Task 1 should complete before task 2 starts
    assert.deepStrictEqual(results, ['start-1', 'end-1', 'start-2', 'end-2']);
  });

  it('should release lock even if function throws', async () => {
    try {
      await mutex.withLock(async () => {
        throw new Error('test error');
      });
    } catch (e) {
      // Expected
    }

    assert.strictEqual(mutex.isLocked(), false);
  });

  it('release() on an unlocked mutex throws', () => {
    assert.throws(
      () => mutex.release(Symbol('bogus')),
      /unlocked mutex/,
    );
  });

  it('release() with a wrong token throws and does not hand off to waiters', async () => {
    const realToken = await mutex.acquire();
    const waiter = mutex.acquire(); // queued

    // An attacker / buggy caller releases with a token they made up.
    // Pre-fix: this drained the next waiter, letting two holders run
    // concurrently. Post-fix: it throws and the waiter stays queued.
    assert.throws(
      () => mutex.release(Symbol('not-the-real-token')),
      /does not match the current holder/,
    );

    assert.strictEqual(mutex.isLocked(), true);
    assert.strictEqual(mutex.getQueueLength(), 1);

    // A proper release still works and hands off normally.
    mutex.release(realToken);
    const waiterToken = await waiter;
    assert.strictEqual(mutex.isLocked(), true);
    mutex.release(waiterToken);
  });

  it('release() called twice with the same token throws the second time', async () => {
    const token = await mutex.acquire();
    mutex.release(token);

    // Second release with the (now stale) token must throw — otherwise
    // we'd drain a waiter on behalf of someone who no longer holds the
    // lock, silently breaking exclusion.
    assert.throws(
      () => mutex.release(token),
      /unlocked mutex/,
    );
  });

  it('double-release during contention does not hand off to two waiters', async () => {
    const firstToken = await mutex.acquire();
    const waiterA = mutex.acquire();
    const waiterB = mutex.acquire();
    assert.strictEqual(mutex.getQueueLength(), 2);

    mutex.release(firstToken); // hands off to A
    const aToken = await waiterA;
    assert.strictEqual(mutex.getQueueLength(), 1);

    // Now caller incorrectly releases again with the *old* token. Pre-fix
    // this would have drained B too, so A and B would both think they
    // held the lock. Post-fix: throws.
    assert.throws(() => mutex.release(firstToken), /does not match/);

    // B is still queued, A still holds the lock.
    assert.strictEqual(mutex.isLocked(), true);
    assert.strictEqual(mutex.getQueueLength(), 1);

    mutex.release(aToken);
    const bToken = await waiterB;
    mutex.release(bToken);
  });
});

describe('withTimeout', () => {
  it('should resolve if promise completes before timeout', async () => {
    const result = await withTimeout(
      Promise.resolve('success'),
      100
    );
    assert.strictEqual(result, 'success');
  });

  it('should reject with timeout error if promise takes too long', async () => {
    await assert.rejects(
      withTimeout(sleep(200), 50),
      { message: 'Operation timed out' }
    );
  });

  it('should use custom timeout message', async () => {
    await assert.rejects(
      withTimeout(sleep(200), 50, 'Custom timeout'),
      { message: 'Custom timeout' }
    );
  });

  it('should propagate promise rejection', async () => {
    await assert.rejects(
      withTimeout(Promise.reject(new Error('original error')), 100),
      { message: 'original error' }
    );
  });

  it('should clear timeout when promise resolves', async () => {
    // This test ensures no memory leak from dangling timeouts
    const start = Date.now();
    await withTimeout(Promise.resolve('fast'), 1000);
    const elapsed = Date.now() - start;

    // Should complete quickly, not wait for timeout
    assert.ok(elapsed < 100, `Expected fast resolution, got ${elapsed}ms`);
  });
});

describe('retry', () => {
  it('should return result on first success', async () => {
    let attempts = 0;
    const result = await retry(async () => {
      attempts++;
      return 'success';
    });

    assert.strictEqual(result, 'success');
    assert.strictEqual(attempts, 1);
  });

  it('should retry on failure', async () => {
    let attempts = 0;
    const result = await retry(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('not yet');
        return 'success';
      },
      { maxAttempts: 3, baseDelay: 10 }
    );

    assert.strictEqual(result, 'success');
    assert.strictEqual(attempts, 3);
  });

  it('should throw after max attempts', async () => {
    let attempts = 0;
    await assert.rejects(
      retry(
        async () => {
          attempts++;
          throw new Error('always fails');
        },
        { maxAttempts: 3, baseDelay: 10 }
      ),
      { message: 'always fails' }
    );

    assert.strictEqual(attempts, 3);
  });

  it('should respect shouldRetry predicate', async () => {
    let attempts = 0;

    await assert.rejects(
      retry(
        async () => {
          attempts++;
          const error = new Error('not retryable');
          error.code = 'FATAL';
          throw error;
        },
        {
          maxAttempts: 5,
          baseDelay: 10,
          shouldRetry: (err) => err.code !== 'FATAL',
        }
      ),
      { message: 'not retryable' }
    );

    // Should only try once since error is not retryable
    assert.strictEqual(attempts, 1);
  });

  it('should use exponential backoff', async () => {
    const delays = [];
    let lastTime = Date.now();
    let attempts = 0;

    await assert.rejects(
      retry(
        async () => {
          const now = Date.now();
          if (attempts > 0) {
            delays.push(now - lastTime);
          }
          lastTime = now;
          attempts++;
          throw new Error('fail');
        },
        { maxAttempts: 4, baseDelay: 50 }
      )
    );

    // Check delays are approximately doubling (with some tolerance)
    assert.ok(delays[0] >= 40 && delays[0] < 100, `First delay ${delays[0]} not ~50ms`);
    assert.ok(delays[1] >= 80 && delays[1] < 200, `Second delay ${delays[1]} not ~100ms`);
    assert.ok(delays[2] >= 160 && delays[2] < 400, `Third delay ${delays[2]} not ~200ms`);
  });
});

describe('sleep', () => {
  it('should delay execution', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;

    assert.ok(elapsed >= 45, `Expected at least 45ms, got ${elapsed}ms`);
    assert.ok(elapsed < 100, `Expected less than 100ms, got ${elapsed}ms`);
  });
});

describe('debounce', () => {
  it('should delay execution until quiet period', async () => {
    let callCount = 0;
    const fn = debounce(() => callCount++, 50);

    fn();
    fn();
    fn();

    assert.strictEqual(callCount, 0);
    await sleep(100);
    assert.strictEqual(callCount, 1);
  });

  it('should reset timer on each call', async () => {
    let callCount = 0;
    const fn = debounce(() => callCount++, 50);

    fn();
    await sleep(30);
    fn();
    await sleep(30);
    fn();
    await sleep(100);

    assert.strictEqual(callCount, 1);
  });

  it('should be cancelable', async () => {
    let callCount = 0;
    const fn = debounce(() => callCount++, 50);

    fn();
    fn.cancel();
    await sleep(100);

    assert.strictEqual(callCount, 0);
  });

  it('should pass arguments to function', async () => {
    let receivedArgs;
    const fn = debounce((...args) => {
      receivedArgs = args;
    }, 50);

    fn('a', 'b', 'c');
    await sleep(100);

    assert.deepStrictEqual(receivedArgs, ['a', 'b', 'c']);
  });
});

describe('throttle', () => {
  it('should execute immediately on first call', () => {
    let callCount = 0;
    const fn = throttle(() => callCount++, 100);

    fn();
    assert.strictEqual(callCount, 1);
  });

  it('should throttle subsequent calls', async () => {
    let callCount = 0;
    const fn = throttle(() => callCount++, 50);

    fn(); // Executes immediately
    fn(); // Scheduled
    fn(); // Ignored (already scheduled)

    assert.strictEqual(callCount, 1);

    await sleep(100);
    assert.strictEqual(callCount, 2);
  });

  it('should allow calls after interval passes', async () => {
    let callCount = 0;
    const fn = throttle(() => callCount++, 50);

    fn();
    assert.strictEqual(callCount, 1);

    await sleep(60);

    fn();
    assert.strictEqual(callCount, 2);
  });

  it('exposes a cancel() method that drops a pending trailing call', async () => {
    let callCount = 0;
    const fn = throttle(() => callCount++, 50);

    fn(); // Leading edge fires immediately.
    assert.strictEqual(callCount, 1);

    fn(); // Coalesced — schedules a trailing call.

    // Cancel before the trailing call fires. Without cancel(), this
    // deferred setTimeout would fire after the process/module under
    // test had torn down, writing into stale state.
    fn.cancel();

    await sleep(80);
    assert.strictEqual(callCount, 1, 'trailing call should not have fired after cancel');
  });

  it('cancel() is a no-op when nothing is pending', () => {
    const fn = throttle(() => {}, 50);
    assert.doesNotThrow(() => fn.cancel());
    fn();
    assert.doesNotThrow(() => fn.cancel());
  });

  it('throttle() can be re-used after cancel()', async () => {
    let callCount = 0;
    const fn = throttle(() => callCount++, 50);

    fn();
    fn();        // trailing scheduled
    fn.cancel(); // trailing dropped
    await sleep(60);
    assert.strictEqual(callCount, 1);

    // After the interval has expired, a fresh call must still fire
    // on the leading edge.
    fn();
    assert.strictEqual(callCount, 2);
  });
});
