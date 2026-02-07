/**
 * Time formatting utilities
 * @module utils/time
 */

/**
 * Format a date as a human-readable relative time string.
 * @param {Date} date - The date to format
 * @returns {string} Relative time string (e.g., "just now", "5m ago", "2 days ago")
 */
function formatTimeAgo(date) {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 10) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return '1 day ago';
  return `${diffDay} days ago`;
}

module.exports = { formatTimeAgo };
