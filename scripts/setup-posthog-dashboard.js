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
  console.error('Create a personal API key at https://us.posthog.com/settings/user-api-keys');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// HTTP helper
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
    const options = {
      method,
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
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
 * Each insight maps to one dashboard tile.
 * PostHog TrendsQuery / FunnelsQuery shapes are used.
 */
function buildInsights() {
  return [
    // -----------------------------------------------------------------------
    // 1. Feature Usage Breakdown — bar chart of all feature events
    // -----------------------------------------------------------------------
    {
      name: 'Feature Usage Breakdown',
      description: 'Side-by-side comparison of all interactive feature events',
      query: {
        kind: 'TrendsQuery',
        dateRange: { date_from: '-30d' },
        interval: 'week',
        series: [
          { event: 'branch_switched', kind: 'EventsNode', name: 'Branch Switched' },
          { event: 'stash_performed', kind: 'EventsNode', name: 'Stash' },
          { event: 'pull_forced', kind: 'EventsNode', name: 'Pull' },
          { event: 'cleanup_branches_deleted', kind: 'EventsNode', name: 'Branch Cleanup' },
          { event: 'preview_opened', kind: 'EventsNode', name: 'Preview' },
          { event: 'search_used', kind: 'EventsNode', name: 'Search' },
          { event: 'branch_actions_opened', kind: 'EventsNode', name: 'Branch Actions' },
          { event: 'undo_branch_switch', kind: 'EventsNode', name: 'Undo Switch' },
          { event: 'casino_mode_toggled', kind: 'EventsNode', name: 'Casino Toggle' },
          { event: 'sound_toggled', kind: 'EventsNode', name: 'Sound Toggle' },
        ],
        trendsFilter: {
          display: 'ActionsBar',
        },
      },
    },

    // -----------------------------------------------------------------------
    // 2. Casino Mode Engagement
    // -----------------------------------------------------------------------
    {
      name: 'Casino Mode — Toggle Events',
      description: 'How often casino mode is toggled on vs off',
      query: {
        kind: 'TrendsQuery',
        dateRange: { date_from: '-30d' },
        interval: 'week',
        series: [
          {
            event: 'casino_mode_toggled',
            kind: 'EventsNode',
            name: 'Casino Enabled',
            properties: [
              { key: 'enabled', value: ['true'], operator: 'exact', type: 'event' },
            ],
          },
          {
            event: 'casino_mode_toggled',
            kind: 'EventsNode',
            name: 'Casino Disabled',
            properties: [
              { key: 'enabled', value: ['false'], operator: 'exact', type: 'event' },
            ],
          },
        ],
        trendsFilter: {
          display: 'ActionsLineGraph',
        },
      },
    },
    {
      name: 'Casino Mode — Sessions Launched with Casino',
      description: 'Sessions started with casino mode already active',
      query: {
        kind: 'TrendsQuery',
        dateRange: { date_from: '-30d' },
        interval: 'week',
        series: [
          {
            event: 'tool_launched',
            kind: 'EventsNode',
            name: 'Launched with Casino',
            properties: [
              { key: 'casino_mode', value: ['true'], operator: 'exact', type: 'event' },
            ],
          },
          {
            event: 'tool_launched',
            kind: 'EventsNode',
            name: 'Launched without Casino',
            properties: [
              { key: 'casino_mode', value: ['false'], operator: 'exact', type: 'event' },
            ],
          },
        ],
        trendsFilter: {
          display: 'ActionsLineGraph',
        },
      },
    },

    // -----------------------------------------------------------------------
    // 3. Git Operations over time
    // -----------------------------------------------------------------------
    {
      name: 'Git Operations Over Time',
      description: 'Branch switches, stashes, pulls, and cleanups over time',
      query: {
        kind: 'TrendsQuery',
        dateRange: { date_from: '-30d' },
        interval: 'day',
        series: [
          { event: 'branch_switched', kind: 'EventsNode', name: 'Branch Switch' },
          { event: 'stash_performed', kind: 'EventsNode', name: 'Stash' },
          { event: 'pull_forced', kind: 'EventsNode', name: 'Pull' },
          { event: 'cleanup_branches_deleted', kind: 'EventsNode', name: 'Branch Cleanup' },
          { event: 'undo_branch_switch', kind: 'EventsNode', name: 'Undo Switch' },
        ],
        trendsFilter: {
          display: 'ActionsLineGraph',
        },
      },
    },
    {
      name: 'Branches Cleaned — Total Deleted',
      description: 'Sum of branches deleted via cleanup over time',
      query: {
        kind: 'TrendsQuery',
        dateRange: { date_from: '-30d' },
        interval: 'week',
        series: [
          {
            event: 'cleanup_branches_deleted',
            kind: 'EventsNode',
            name: 'Branches Deleted',
            math: 'sum',
            math_property: 'count',
          },
        ],
        trendsFilter: {
          display: 'ActionsBar',
        },
      },
    },
    {
      name: 'Dirty Repo Encounters',
      description: 'How often users hit uncommitted-changes blockers',
      query: {
        kind: 'TrendsQuery',
        dateRange: { date_from: '-30d' },
        interval: 'week',
        series: [
          { event: 'dirty_repo_encountered', kind: 'EventsNode', name: 'Dirty Repo' },
          { event: 'stash_performed', kind: 'EventsNode', name: 'Stash (resolved)' },
        ],
        trendsFilter: {
          display: 'ActionsLineGraph',
        },
      },
    },

    // -----------------------------------------------------------------------
    // 4. PR Actions breakdown
    // -----------------------------------------------------------------------
    {
      name: 'PR Actions — Create vs Approve vs Merge',
      description: 'Breakdown of PR actions by type',
      query: {
        kind: 'TrendsQuery',
        dateRange: { date_from: '-30d' },
        interval: 'week',
        series: [
          {
            event: 'pr_action',
            kind: 'EventsNode',
            name: 'Create PR',
            properties: [
              { key: 'action', value: ['create'], operator: 'exact', type: 'event' },
            ],
          },
          {
            event: 'pr_action',
            kind: 'EventsNode',
            name: 'Approve PR',
            properties: [
              { key: 'action', value: ['approve'], operator: 'exact', type: 'event' },
            ],
          },
          {
            event: 'pr_action',
            kind: 'EventsNode',
            name: 'Merge PR',
            properties: [
              { key: 'action', value: ['merge'], operator: 'exact', type: 'event' },
            ],
          },
        ],
        trendsFilter: {
          display: 'ActionsBar',
        },
      },
    },

    // -----------------------------------------------------------------------
    // 5. Session overview
    // -----------------------------------------------------------------------
    {
      name: 'Sessions — Launch Count',
      description: 'Total tool launches over time',
      query: {
        kind: 'TrendsQuery',
        dateRange: { date_from: '-30d' },
        interval: 'day',
        series: [
          { event: 'tool_launched', kind: 'EventsNode', name: 'Launches' },
        ],
        trendsFilter: {
          display: 'ActionsLineGraph',
        },
      },
    },
    {
      name: 'Sessions — Server Mode Breakdown',
      description: 'How sessions are launched by server mode',
      query: {
        kind: 'TrendsQuery',
        dateRange: { date_from: '-30d' },
        interval: 'week',
        series: [
          {
            event: 'tool_launched',
            kind: 'EventsNode',
            name: 'Launches',
          },
        ],
        breakdownFilter: {
          breakdown: 'server_mode',
          breakdown_type: 'event',
        },
        trendsFilter: {
          display: 'ActionsBar',
        },
      },
    },
    {
      name: 'Errors Over Time',
      description: 'Exception events captured by error tracking',
      query: {
        kind: 'TrendsQuery',
        dateRange: { date_from: '-30d' },
        interval: 'day',
        series: [
          { event: '$exception', kind: 'EventsNode', name: 'Errors' },
        ],
        trendsFilter: {
          display: 'ActionsLineGraph',
        },
      },
    },
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
