/**
 * Tests for fs.watch recursive-support detection.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseMajor, getRecursiveWatchSupport } = require('../../../src/utils/fs-watch');

describe('parseMajor', () => {
  it('parses a standard Node version string', () => {
    assert.equal(parseMajor('v20.11.1'), 20);
  });

  it('parses a version string without the leading v', () => {
    assert.equal(parseMajor('18.19.0'), 18);
  });

  it('parses a pre-release version string', () => {
    assert.equal(parseMajor('v22.0.0-nightly2024'), 22);
  });

  it('returns NaN for unparseable input', () => {
    assert.ok(Number.isNaN(parseMajor('')));
    assert.ok(Number.isNaN(parseMajor('nope')));
    assert.ok(Number.isNaN(parseMajor(null)));
    assert.ok(Number.isNaN(parseMajor(undefined)));
  });
});

describe('getRecursiveWatchSupport', () => {
  it('reports supported on darwin regardless of Node version', () => {
    const r = getRecursiveWatchSupport({ version: 'v14.21.3', platform: 'darwin' });
    assert.equal(r.supported, true);
    assert.equal(r.reason, null);
  });

  it('reports supported on win32 regardless of Node version', () => {
    const r = getRecursiveWatchSupport({ version: 'v16.20.2', platform: 'win32' });
    assert.equal(r.supported, true);
    assert.equal(r.reason, null);
  });

  it('reports supported on Linux with Node 20+', () => {
    const r20 = getRecursiveWatchSupport({ version: 'v20.0.0', platform: 'linux' });
    assert.equal(r20.supported, true);

    const r22 = getRecursiveWatchSupport({ version: 'v22.11.0', platform: 'linux' });
    assert.equal(r22.supported, true);
  });

  it('reports unsupported on Linux with Node < 20 and mentions the upgrade path', () => {
    const r = getRecursiveWatchSupport({ version: 'v18.20.0', platform: 'linux' });
    assert.equal(r.supported, false);
    assert.match(r.reason, /Node v18\.20\.0 on Linux/);
    assert.match(r.reason, /upgrade to Node >=20/);
  });

  it('reports unsupported on Linux when the version string is malformed', () => {
    const r = getRecursiveWatchSupport({ version: 'garbage', platform: 'linux' });
    assert.equal(r.supported, false);
    assert.match(r.reason, /could not parse Node version/);
  });

  it('reports unsupported on unrecognized platforms', () => {
    const r = getRecursiveWatchSupport({ version: 'v20.11.1', platform: 'aix' });
    assert.equal(r.supported, false);
    assert.match(r.reason, /platform "aix"/);
  });

  it('falls back to process.* when env is not injected', () => {
    // Sanity: real runtime should be supported (test suite runs on Node >=20).
    const r = getRecursiveWatchSupport();
    assert.equal(typeof r.supported, 'boolean');
  });
});
