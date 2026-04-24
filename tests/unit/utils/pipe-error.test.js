/**
 * Tests for stdio pipe-error handler.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createPipeErrorHandler } = require('../../../src/utils/pipe-error');

describe('createPipeErrorHandler', () => {
  it('invokes onEpipe when the error code is EPIPE', () => {
    let epipeCalls = 0;
    let otherCalls = 0;
    const handler = createPipeErrorHandler({
      onEpipe: () => { epipeCalls++; },
      onOther: () => { otherCalls++; },
    });

    const err = new Error('write EPIPE');
    err.code = 'EPIPE';
    handler(err);

    assert.equal(epipeCalls, 1);
    assert.equal(otherCalls, 0);
  });

  it('invokes onOther for non-EPIPE errors, passing the error through', () => {
    let received = null;
    const handler = createPipeErrorHandler({
      onEpipe: () => { throw new Error('onEpipe should not run'); },
      onOther: (err) => { received = err; },
    });

    const err = new Error('boom');
    err.code = 'EACCES';
    handler(err);

    assert.equal(received, err);
  });

  it('invokes onOther for errors without a code', () => {
    let otherCalls = 0;
    const handler = createPipeErrorHandler({
      onEpipe: () => { throw new Error('onEpipe should not run'); },
      onOther: () => { otherCalls++; },
    });

    handler(new Error('no code'));
    assert.equal(otherCalls, 1);
  });

  it('invokes onOther when called with null/undefined (paranoid)', () => {
    let otherCalls = 0;
    const handler = createPipeErrorHandler({
      onEpipe: () => { throw new Error('onEpipe should not run'); },
      onOther: () => { otherCalls++; },
    });

    handler(null);
    handler(undefined);
    assert.equal(otherCalls, 2);
  });
});
