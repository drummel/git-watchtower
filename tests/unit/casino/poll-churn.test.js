/**
 * Tests for casino/poll-churn — the helper that replaces the bin's old
 * `notifyBranches.length * 100` placeholder with real diff aggregation.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { sumPollChurn } = require('../../../src/casino/poll-churn');

describe('sumPollChurn', () => {
  it('returns 0/0 for empty input', async () => {
    const r = await sumPollChurn([], new Map(), async () => {
      throw new Error('diffFn should not be called');
    });
    assert.deepEqual(r, { added: 0, deleted: 0 });
  });

  it('returns 0/0 for null input', async () => {
    const r = await sumPollChurn(null, new Map(), async () => {
      throw new Error('diffFn should not be called');
    });
    assert.deepEqual(r, { added: 0, deleted: 0 });
  });

  it('skips branches with no recorded prev commit', async () => {
    let calls = 0;
    const r = await sumPollChurn(
      [{ name: 'feat/new', commit: 'abc' }],
      new Map(), // empty
      async () => { calls++; return { added: 999, deleted: 999 }; }
    );
    assert.deepEqual(r, { added: 0, deleted: 0 });
    assert.equal(calls, 0, 'diffFn should not be called for branches without a prev commit');
  });

  it('skips branches with no current commit', async () => {
    let calls = 0;
    const r = await sumPollChurn(
      [{ name: 'feat/odd', commit: '' }],
      new Map([['feat/odd', 'abc']]),
      async () => { calls++; return { added: 999, deleted: 999 }; }
    );
    assert.deepEqual(r, { added: 0, deleted: 0 });
    assert.equal(calls, 0);
  });

  it('runs the diff function for each branch with a recorded prev commit', async () => {
    const calls = [];
    const r = await sumPollChurn(
      [
        { name: 'feat/a', commit: 'aaa-new' },
        { name: 'feat/b', commit: 'bbb-new' },
      ],
      new Map([['feat/a', 'aaa-prev'], ['feat/b', 'bbb-prev']]),
      async (from, to) => {
        calls.push({ from, to });
        return from === 'aaa-prev'
          ? { added: 12, deleted: 3 }
          : { added: 5, deleted: 1 };
      }
    );
    assert.equal(calls.length, 2);
    assert.deepEqual(r, { added: 17, deleted: 4 });
  });

  it('runs diffs in parallel (does not serialise)', async () => {
    let activeCount = 0;
    let maxConcurrent = 0;
    const r = await sumPollChurn(
      [
        { name: 'a', commit: 'a-new' },
        { name: 'b', commit: 'b-new' },
        { name: 'c', commit: 'c-new' },
      ],
      new Map([['a', 'a-prev'], ['b', 'b-prev'], ['c', 'c-prev']]),
      async () => {
        activeCount++;
        maxConcurrent = Math.max(maxConcurrent, activeCount);
        await new Promise((res) => setImmediate(res));
        activeCount--;
        return { added: 1, deleted: 0 };
      }
    );
    assert.deepEqual(r, { added: 3, deleted: 0 });
    assert.ok(maxConcurrent > 1, `expected parallel diff calls, peak concurrency was ${maxConcurrent}`);
  });

  it('treats a thrown diff as 0/0 for that branch', async () => {
    const r = await sumPollChurn(
      [
        { name: 'good', commit: 'g-new' },
        { name: 'bad', commit: 'b-new' },
      ],
      new Map([['good', 'g-prev'], ['bad', 'b-prev']]),
      async (from) => {
        if (from === 'b-prev') throw new Error('git ref gone');
        return { added: 7, deleted: 2 };
      }
    );
    assert.deepEqual(r, { added: 7, deleted: 2 });
  });

  it('coerces non-finite diff fields to 0', async () => {
    // Defensive: a buggy/older diff fn could return NaN or undefined.
    const r = await sumPollChurn(
      [{ name: 'x', commit: 'x-new' }],
      new Map([['x', 'x-prev']]),
      async () => ({ added: NaN, deleted: undefined })
    );
    assert.deepEqual(r, { added: 0, deleted: 0 });
  });
});
