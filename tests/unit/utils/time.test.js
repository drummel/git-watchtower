const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { formatTimeAgo } = require('../../../src/utils/time');

describe('formatTimeAgo', () => {
  let realDateNow;

  beforeEach(() => {
    realDateNow = Date.now;
  });

  afterEach(() => {
    Date.now = realDateNow;
  });

  it('should return "just now" for dates less than 10 seconds ago', () => {
    const date = new Date(Date.now() - 5000);
    assert.equal(formatTimeAgo(date), 'just now');
  });

  it('should return seconds ago for dates 10-59 seconds ago', () => {
    const date = new Date(Date.now() - 30000);
    const result = formatTimeAgo(date);
    assert.match(result, /^\d+s ago$/);
  });

  it('should return minutes ago for dates 1-59 minutes ago', () => {
    const date = new Date(Date.now() - 5 * 60 * 1000);
    assert.equal(formatTimeAgo(date), '5m ago');
  });

  it('should return hours ago for dates 1-23 hours ago', () => {
    const date = new Date(Date.now() - 3 * 60 * 60 * 1000);
    assert.equal(formatTimeAgo(date), '3h ago');
  });

  it('should return "1 day ago" for dates 24-47 hours ago', () => {
    const date = new Date(Date.now() - 30 * 60 * 60 * 1000);
    assert.equal(formatTimeAgo(date), '1 day ago');
  });

  it('should return "X days ago" for dates 2+ days ago', () => {
    const date = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    assert.equal(formatTimeAgo(date), '5 days ago');
  });

  it('should handle exact boundary: 0 seconds ago', () => {
    const date = new Date();
    assert.equal(formatTimeAgo(date), 'just now');
  });

  it('should handle exact boundary: 60 seconds ago', () => {
    const date = new Date(Date.now() - 60 * 1000);
    assert.equal(formatTimeAgo(date), '1m ago');
  });

  it('should handle exact boundary: 60 minutes ago', () => {
    const date = new Date(Date.now() - 60 * 60 * 1000);
    assert.equal(formatTimeAgo(date), '1h ago');
  });

  it('should handle exact boundary: 24 hours ago', () => {
    const date = new Date(Date.now() - 24 * 60 * 60 * 1000);
    assert.equal(formatTimeAgo(date), '1 day ago');
  });

  it('should handle large values (100 days)', () => {
    const date = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    assert.equal(formatTimeAgo(date), '100 days ago');
  });
});
