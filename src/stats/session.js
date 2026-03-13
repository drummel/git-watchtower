/**
 * Session statistics tracker for Git Watchtower.
 *
 * Tracks real, grounded stats about repository activity during the current
 * session — independent of casino mode. These stats are always available
 * in normal mode.
 *
 * @module stats/session
 */

// ============================================================================
// Internal state
// ============================================================================

let sessionStart = Date.now();
let totalLinesAdded = 0;
let totalLinesDeleted = 0;
let totalPolls = 0;
let pollsWithUpdates = 0;
let lastUpdateTime = null;

// ============================================================================
// Recording
// ============================================================================

/**
 * Record that a poll cycle completed.
 * @param {boolean} hadUpdates - Whether any branch had updates
 */
function recordPoll(hadUpdates) {
  totalPolls++;
  if (hadUpdates) {
    pollsWithUpdates++;
    lastUpdateTime = Date.now();
  }
}

/**
 * Record line changes from a detected update.
 * @param {number} added - Lines added
 * @param {number} deleted - Lines deleted
 */
function recordChurn(added, deleted) {
  totalLinesAdded += added;
  totalLinesDeleted += deleted;
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Format a duration in ms to a human-readable string.
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Get current session stats snapshot.
 * @returns {{sessionDuration: string, linesAdded: number, linesDeleted: number, totalPolls: number, pollsWithUpdates: number, hitRate: number, lastUpdate: string|null}}
 */
function getStats() {
  const elapsed = Date.now() - sessionStart;

  const hitRate = totalPolls > 0
    ? Math.round((pollsWithUpdates / totalPolls) * 100)
    : 0;

  let lastUpdate = null;
  if (lastUpdateTime) {
    const sinceUpdate = Date.now() - lastUpdateTime;
    lastUpdate = formatDuration(sinceUpdate) + ' ago';
  }

  return {
    sessionDuration: formatDuration(elapsed),
    linesAdded: totalLinesAdded,
    linesDeleted: totalLinesDeleted,
    totalPolls,
    pollsWithUpdates,
    hitRate,
    lastUpdate,
  };
}

/**
 * Reset all session stats (e.g. for testing).
 */
function reset() {
  sessionStart = Date.now();
  totalLinesAdded = 0;
  totalLinesDeleted = 0;
  totalPolls = 0;
  pollsWithUpdates = 0;
  lastUpdateTime = null;
}

module.exports = {
  recordPoll,
  recordChurn,
  getStats,
  reset,
};
