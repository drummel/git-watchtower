const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { compareVersions } = require('../../../src/utils/version-check');

describe('compareVersions', () => {
  it('should return -1 when first version is older', () => {
    assert.equal(compareVersions('1.7.0', '1.8.0'), -1);
  });

  it('should return 1 when first version is newer', () => {
    assert.equal(compareVersions('1.8.0', '1.7.0'), 1);
  });

  it('should return 0 when versions are equal', () => {
    assert.equal(compareVersions('1.7.0', '1.7.0'), 0);
  });

  it('should compare major versions correctly', () => {
    assert.equal(compareVersions('2.0.0', '1.99.99'), 1);
  });

  it('should compare minor versions correctly', () => {
    assert.equal(compareVersions('1.10.0', '1.9.0'), 1);
  });

  it('should compare patch versions correctly', () => {
    assert.equal(compareVersions('1.7.1', '1.7.0'), 1);
    assert.equal(compareVersions('1.7.0', '1.7.1'), -1);
  });
});
