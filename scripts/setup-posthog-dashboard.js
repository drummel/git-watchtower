#!/usr/bin/env node

/**
 * Provision PostHog insights for git-watchtower feature-usage tracking.
 *
 * Usage:
 *   # Create a new dashboard with all tiles:
 *   POSTHOG_API_KEY=phx_... npm run dashboard:setup
 *
 *   # Add tiles to an existing dashboard:
 *   POSTHOG_API_KEY=phx_... POSTHOG_DASHBOARD_ID=12345 npm run dashboard:setup
 *
 * Environment variables:
 *   POSTHOG_API_KEY      – Personal API key (not the project key) with project write access
 *   POSTHOG_HOST         – PostHog host (default: https://app.posthog.com)
 *   POSTHOG_PROJECT_ID   – Project ID (default: auto-detected from /api/projects/)
 *   POSTHOG_DASHBOARD_ID – Existing dashboard ID to add tiles to (default: creates a new one)
 */

const https = require('https');
const { URL } = require('url');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_KEY = process.env.POSTHOG_API_KEY;
const HOST = process.env.POSTHOG_HOST || 'https://app.posthog.com';
const PROJECT_ID = process.env.POSTHOG_PROJECT_ID || null;
const DASHBOARD_ID = process.env.POSTHOG_DASHBOARD_ID || null;

if (!API_KEY) {
  console.error('Error: POSTHOG_API_KEY environment variable is required.');
  console.error('Create a personal API key at https://app.posthog.com/settings/user-api-keys');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// HTTP helper — authenticates via personal_api_key query parameter
// ---------------------------------------------------------------------------

/**
 * @param {'GET' | 'POST' | 'PATCH'} method
 * @param {string} path
 * @param {object} [body]
 * @returns {Promise<any>}
 */
function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, HOST);
    url.searchParams.set('personal_api_key', API_KEY);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${raw}`));
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch {
          resolve(raw);
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Insight definitions
// ---------------------------------------------------------------------------

/**
 * Helper to wrap a TrendsQuery source in the InsightVizNode envelope
 * that the PostHog insights API expects.
 */
function trendsInsight(name, description, source) {
  return {
    name,
    description,
    query: {
      kind: 'InsightVizNode',
      source: {
        kind: 'TrendsQuery',
        ...source,
      },
    },
  };
}

/** Shorthand for a simple EventsNode series entry */
function evt(event, name, opts = {}) {
  return { kind: 'EventsNode', event, math: 'total', name, ...opts };
}

function buildInsights() {
  return [
    // -----------------------------------------------------------------------
    // 1. Feature Usage Breakdown — bar chart of all feature events
    // -----------------------------------------------------------------------
    trendsInsight(
      'Feature Usage Breakdown',
      'Side-by-side comparison of all interactive feature events',
      {
        dateRange: { date_from: '-30d' },
        interval: 'week',
        series: [
          evt('branch_switched', 'Branch Switch'),
          evt('stash_performed', 'Stash'),
          evt('pull_forced', 'Pull'),
          evt('cleanup_branches_deleted', 'Branch Cleanup'),
          evt('preview_opened', 'Preview'),
          evt('search_used', 'Search'),
          evt('branch_actions_opened', 'Branch Actions'),
          evt('undo_branch_switch', 'Undo Switch'),
          evt('casino_mode_toggled', 'Casino Toggle'),
          evt('sound_toggled', 'Sound Toggle'),
        ],
        trendsFilter: { display: 'ActionsBar' },
      },
    ),

    // -----------------------------------------------------------------------
    // 2. Casino Mode Engagement
    // -----------------------------------------------------------------------
    trendsInsight(
      'Casino Mode — Toggle Events',
      'How often casino mode is toggled on vs off',
      {
        dateRange: { date_from: '-30d' },
        interval: 'week',
        series: [
          evt('casino_mode_toggled', 'Casino Enabled', {
            properties: [{ key: 'enabled', value: ['true'], operator: 'exact', type: 'event' }],
          }),
          evt('casino_mode_toggled', 'Casino Disabled', {
            properties: [{ key: 'enabled', value: ['false'], operator: 'exact', type: 'event' }],
          }),
        ],
        trendsFilter: { display: 'ActionsLineGraph' },
      },
    ),

    trendsInsight(
      'Casino Mode — Sessions with Casino Active',
      'Sessions started with casino mode already active vs not',
      {
        dateRange: { date_from: '-30d' },
        interval: 'week',
        series: [
          evt('tool_launched', 'Launched with Casino', {
            properties: [{ key: 'casino_mode', value: ['true'], operator: 'exact', type: 'event' }],
          }),
          evt('tool_launched', 'Launched without Casino', {
            properties: [
              { key: 'casino_mode', value: ['false'], operator: 'exact', type: 'event' },
            ],
          }),
        ],
        trendsFilter: { display: 'ActionsLineGraph' },
      },
    ),

    // -----------------------------------------------------------------------
    // 3. Git Operations over time
    // -----------------------------------------------------------------------
    trendsInsight(
      'Git Operations Over Time',
      'Branch switches, stashes, pulls, cleanups, and undos over time',
      {
        dateRange: { date_from: '-30d' },
        interval: 'day',
        series: [
          evt('branch_switched', 'Branch Switch'),
          evt('stash_performed', 'Stash'),
          evt('pull_forced', 'Pull'),
          evt('cleanup_branches_deleted', 'Branch Cleanup'),
          evt('undo_branch_switch', 'Undo Switch'),
        ],
        trendsFilter: { display: 'ActionsLineGraph' },
      },
    ),

    trendsInsight(
      'Dirty Repo Encounters vs Stash Resolutions',
      'How often users hit uncommitted-changes blockers and resolve them with stash',
      {
        dateRange: { date_from: '-30d' },
        interval: 'week',
        series: [
          evt('dirty_repo_encountered', 'Dirty Repo'),
          evt('stash_performed', 'Stash (resolved)'),
        ],
        trendsFilter: { display: 'ActionsLineGraph' },
      },
    ),

    // -----------------------------------------------------------------------
    // 4. PR Actions breakdown
    // -----------------------------------------------------------------------
    trendsInsight(
      'PR Actions — Create vs Approve vs Merge',
      'Breakdown of PR actions by type',
      {
        dateRange: { date_from: '-30d' },
        interval: 'week',
        series: [
          evt('pr_action', 'Create PR', {
            properties: [{ key: 'action', value: ['create'], operator: 'exact', type: 'event' }],
          }),
          evt('pr_action', 'Approve PR', {
            properties: [{ key: 'action', value: ['approve'], operator: 'exact', type: 'event' }],
          }),
          evt('pr_action', 'Merge PR', {
            properties: [{ key: 'action', value: ['merge'], operator: 'exact', type: 'event' }],
          }),
        ],
        trendsFilter: { display: 'ActionsBar' },
      },
    ),
  ];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Resolve project ID
  let projectId = PROJECT_ID;
  if (!projectId) {
    console.log('Detecting project ID...');
    const projects = await api('GET', '/api/projects/');
    if (!projects.results || projects.results.length === 0) {
      console.error('Error: No projects found. Set POSTHOG_PROJECT_ID manually.');
      process.exit(1);
    }
    projectId = projects.results[0].id;
    console.log(`Using project ID: ${projectId}`);
  }

  const basePath = `/api/projects/${projectId}`;

  // Use existing dashboard or create a new one
  let dashboardId = DASHBOARD_ID;
  if (dashboardId) {
    console.log(`\nAdding tiles to existing dashboard: ${dashboardId}...`);
  } else {
    console.log('\nCreating dashboard: "git-watchtower — Feature Usage"...');
    const dashboard = await api('POST', `${basePath}/dashboards/`, {
      name: 'git-watchtower — Feature Usage',
      description:
        'Feature-level analytics for git-watchtower: which tools are used, how often, and engagement trends.',
    });
    dashboardId = dashboard.id;
    console.log(`Dashboard created: ID ${dashboardId}`);
  }

  // Create insights and add to dashboard
  const insights = buildInsights();

  for (const insight of insights) {
    process.stdout.write(`  Adding tile: ${insight.name}... `);
    await api('POST', `${basePath}/insights/`, {
      name: insight.name,
      description: insight.description,
      query: insight.query,
      dashboards: [dashboardId],
    });
    console.log('done');
  }

  console.log(`\nDashboard ready with ${insights.length} tiles.`);
  console.log(`View it at: ${HOST}/project/${projectId}/dashboard/${dashboardId}`);
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
