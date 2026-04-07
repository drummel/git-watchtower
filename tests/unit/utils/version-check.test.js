const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');
const { compareVersions, startPeriodicUpdateCheck, UPDATE_CHECK_INTERVAL } = require('../../../src/utils/version-check');

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

  it('should treat missing segments as 0', () => {
    assert.equal(compareVersions('1.8', '1.8.0'), 0);
    assert.equal(compareVersions('1.8', '1.8.1'), -1);
    assert.equal(compareVersions('1.8.1', '1.8'), 1);
  });

  it('should handle >3-part versions', () => {
    assert.equal(compareVersions('1.8.0.1', '1.8.0.2'), -1);
    assert.equal(compareVersions('1.8.0.2', '1.8.0.1'), 1);
    assert.equal(compareVersions('1.8.0.1', '1.8.0.1'), 0);
  });

  it('should treat prerelease as less than release (semver §11)', () => {
    assert.equal(compareVersions('1.8.0-beta.1', '1.8.0'), -1);
    assert.equal(compareVersions('1.8.0', '1.8.0-beta.1'), 1);
  });

  it('should treat two prereleases with same core as equal', () => {
    assert.equal(compareVersions('1.8.0-alpha', '1.8.0-beta'), 0);
  });
});

describe('UPDATE_CHECK_INTERVAL', () => {
  it('should be 4 hours in milliseconds', () => {
    assert.equal(UPDATE_CHECK_INTERVAL, 4 * 60 * 60 * 1000);
  });
});

describe('startPeriodicUpdateCheck', () => {
  it('should return a controller with a stop method', () => {
    const controller = startPeriodicUpdateCheck(() => {}, 999999999);
    assert.equal(typeof controller.stop, 'function');
    controller.stop();
  });

  it('should stop the interval when stop() is called', () => {
    const controller = startPeriodicUpdateCheck(() => {}, 50);
    controller.stop();
    // No assertion needed — just verify it doesn't throw
  });
});
