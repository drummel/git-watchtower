/**
 * Web dashboard server for Git Watchtower.
 *
 * Runs alongside the TUI, serving a browser-based dashboard that mirrors
 * (and extends) the terminal UI. Uses SSE to push state updates to the
 * browser and accepts POST actions from the web frontend.
 *
 * Zero dependencies — uses only Node built-in http module.
 *
 * @module server/web
 */

const http = require('http');
const { getWebDashboardHtml } = require('./web-ui');
const { version: PACKAGE_VERSION } = require('../../package.json');
const sessionStats = require('../stats/session');
const casino = require('../casino');

/**
 * Default web dashboard port
 */
const DEFAULT_WEB_PORT = 4000;

/**
 * How often to push state to SSE clients (ms)
 */
const STATE_PUSH_INTERVAL = 500;

/**
 * Maximum number of port retries on EADDRINUSE
 */
const MAX_PORT_RETRIES = 20;

/**
 * SSE keepalive interval (ms) — prevents proxies from dropping idle connections
 */
const SSE_KEEPALIVE_INTERVAL = 15000;

/**
 * Actions the web dashboard is allowed to POST to /api/action. Every entry
 * here MUST be matched by a `case` in `handleWebAction` in bin/git-watchtower.js
 * — `tests/unit/server/web.test.js` enforces that link so a future addition
 * to the whitelist can't silently no-op the way `stash` / `stashPop` /
 * `deleteBranches` did before they were implemented.
 */
const ALLOWED_ACTIONS = Object.freeze([
  'switchBranch', 'pull', 'fetch', 'undo',
  'toggleSound', 'preview',
  'restartServer', 'reloadBrowsers', 'toggleCasino',
  'openBrowser',
  'stash', 'stashPop', 'deleteBranches', 'checkUpdate',
]);

/**
 * @typedef {Object} WebDashboardOptions
 * @property {number} [port=4000] - Port to listen on
 * @property {import('../state/store').Store} store - State store instance
 * @property {function} [onAction] - Callback for actions targeting the local project
 * @property {function} [sendCommand] - Routes (projectId, action, payload) to a remote
 *   project's worker. When omitted, every action is dispatched locally — preserves
 *   single-project behaviour for callers (and tests) that don't run a coordinator.
 * @property {function} [getExtraState] - Returns additional state to merge
 */

/**
 * Web dashboard server.
 * Manages an HTTP server, SSE connections, and state broadcasting.
 */
class WebDashboardServer {
  /**
   * @param {WebDashboardOptions} options
   */
  constructor(options) {
    this.port = options.port || DEFAULT_WEB_PORT;
    this.store = options.store;
    this.onAction = options.onAction || (() => {});
    this.sendCommand = options.sendCommand || null;
    this.getExtraState = options.getExtraState || (() => ({}));

    /** @type {Set<import('http').ServerResponse>} */
    this.clients = new Set();
    this.server = null;
    this.pushInterval = null;
    this.lastPushedJson = '';

    /** @type {Set<import('net').Socket>} Raw TCP sockets, tracked so stop() can force-close them */
    this._sockets = new Set();

    // Multi-project support (populated by coordinator)
    /** @type {Map<string, Object>} */
    this.projects = new Map();
    this.localProjectId = null;

    /** @type {string|null} Repository web URL for building links */
    this.repoWebUrl = null;

    // Cache the HTML (regenerated only if port changes)
    this._cachedHtml = getWebDashboardHtml(this.port);
  }

  /**
   * Build a JSON-serializable snapshot of the store state.
   * Converts Maps to plain objects for JSON.stringify.
   * @returns {Object}
   */
  getSerializableState() {
    const s = this.store.getState();
    const extra = this.getExtraState();

    // Convert Maps to plain objects
    const sparklineCache = {};
    if (s.sparklineCache instanceof Map) {
      s.sparklineCache.forEach((v, k) => { sparklineCache[k] = v; });
    }

    const branchPrStatusMap = {};
    if (s.branchPrStatusMap instanceof Map) {
      s.branchPrStatusMap.forEach((v, k) => { branchPrStatusMap[k] = v; });
    }

    const aheadBehindCache = {};
    if (s.aheadBehindCache instanceof Map) {
      s.aheadBehindCache.forEach((v, k) => { aheadBehindCache[k] = v; });
    }

    return {
      // Git state
      branches: s.branches,
      currentBranch: s.currentBranch,
      isDetachedHead: s.isDetachedHead,
      hasMergeConflict: s.hasMergeConflict,

      // Polling
      pollingStatus: s.pollingStatus,
      isOffline: s.isOffline,

      // Server
      serverMode: s.serverMode,
      serverRunning: s.serverRunning,
      serverCrashed: s.serverCrashed,
      port: s.port,

      // UI
      soundEnabled: s.soundEnabled,
      casinoModeEnabled: s.casinoModeEnabled,
      // Casino stats track server-side regardless of which surface toggled
      // the mode on, so the web dashboard can render the same winnings box
      // the terminal does. Null when disabled — keeps payload small and
      // avoids ticking Math.random()/Date.now() into every SSE push when
      // nobody's asked for the effect. We use `getSerializableStats` (not
      // the full getStats) so the random/clock-driven decorative fields
      // (luckMeter, houseEdge, vibesQuality, timeSinceLastHit) don't
      // defeat the lastPushedJson dedup — the dashboard recomputes them
      // client-side from the stable counters that ARE in the payload.
      casinoStats: s.casinoModeEnabled ? casino.getSerializableStats() : null,
      projectName: s.projectName,

      // Activity
      activityLog: s.activityLog,
      switchHistory: s.switchHistory,

      // Server logs
      serverLogBuffer: s.serverLogBuffer || [],

      // Caches (as plain objects)
      sparklineCache,
      branchPrStatusMap,
      aheadBehindCache,

      // Metadata
      version: PACKAGE_VERSION,

      // Version update
      updateAvailable: s.updateAvailable || null,
      updateInProgress: s.updateInProgress || false,

      // Server info
      noServer: s.noServer || false,
      clientCount: this.clients.size,

      // Session stats
      sessionStats: sessionStats.getStats(),

      // Multi-project data
      projects: this._getProjectsList(),
      activeProjectId: this.localProjectId,

      // Repository web URL for building links in the web UI
      repoWebUrl: this.repoWebUrl || null,

      // Extra state from the main process
      ...extra,
    };
  }

  /**
   * Update the full projects list (called by coordinator).
   * @param {Array<{id: string, projectName: string, projectPath: string, state: Object}>} projects
   */
  setProjects(projects) {
    this.projects.clear();
    for (const p of projects) {
      this.projects.set(p.id, p);
    }
  }

  /**
   * Set the local project ID.
   * @param {string} id
   */
  setLocalProjectId(id) {
    this.localProjectId = id;
  }

  /**
   * Set the repository web URL for link building in the web UI.
   * @param {string|null} url - e.g. https://github.com/user/repo
   */
  setRepoWebUrl(url) {
    this.repoWebUrl = url || null;
  }

  /**
   * Get a serializable state for a specific project (by ID).
   * @param {string} projectId
   * @returns {Object|null}
   */
  getProjectState(projectId) {
    if (projectId === this.localProjectId) {
      return this.getSerializableState();
    }
    const project = this.projects.get(projectId);
    return project ? project.state : null;
  }

  /**
   * Get projects list for the frontend.
   * @returns {Array<{id: string, name: string, active: boolean}>}
   * @private
   */
  _getProjectsList() {
    const list = [];
    for (const [id, p] of this.projects) {
      list.push({
        id,
        name: p.projectName,
        path: p.projectPath,
        active: id === this.localProjectId,
      });
    }
    // If no projects from coordinator, at least show ourselves
    if (list.length === 0 && this.localProjectId) {
      const s = this.store.getState();
      list.push({
        id: this.localProjectId,
        name: s.projectName || 'unknown',
        path: '',
        active: true,
      });
    }
    return list;
  }

  /**
   * Start the web dashboard server.
   * @returns {Promise<{port: number}>} Resolves when the server is listening
   */
  start() {
    return new Promise((resolve, reject) => {
      let retries = 0;

      this.server = http.createServer((req, res) => {
        this._handleRequest(req, res);
      });

      // Track raw TCP sockets so stop() can force-destroy lingering
      // connections (long-lived SSE, paused browsers, proxied clients)
      // instead of waiting for a full TCP FIN_WAIT2 timeout.
      this.server.on('connection', (/** @type {import('net').Socket} */ socket) => {
        this._sockets.add(socket);
        socket.once('close', () => this._sockets.delete(socket));
      });

      this.server.on('error', (/** @type {Error & {code?: string}} */ err) => {
        if (err.code === 'EADDRINUSE' && retries < MAX_PORT_RETRIES) {
          retries++;
          this.port++;
          this._cachedHtml = getWebDashboardHtml(this.port);
          this.server.listen(this.port, '127.0.0.1');
        } else {
          reject(err);
        }
      });

      this.server.listen(this.port, '127.0.0.1', () => {
        // Start pushing state to clients
        this.pushInterval = setInterval(() => {
          this._pushState();
        }, STATE_PUSH_INTERVAL);

        resolve({ port: this.port });
      });
    });
  }

  /**
   * Stop the web dashboard server.
   */
  stop() {
    if (this.pushInterval) {
      clearInterval(this.pushInterval);
      this.pushInterval = null;
    }

    // End SSE response streams gracefully (sends FIN).
    for (const client of this.clients) {
      try { client.end(); } catch (e) { /* SSE client may already be disconnected */ }
    }
    this.clients.clear();

    if (this.server) {
      this.server.close();

      // Force-destroy any TCP sockets that didn't close after the
      // graceful end() above. Without this, a paused browser, a
      // suspended tab, or a slow proxy can pin server.close() for the
      // full TCP FIN_WAIT2 timeout (typically 60 s), delaying shutdown.
      for (const socket of this._sockets) {
        try { socket.destroy(); } catch (e) { /* ignore */ }
      }
      this._sockets.clear();

      this.server = null;
    }
  }

  /**
   * Push a flash message to all connected web clients.
   * @param {string} text
   * @param {string} [type='info']
   */
  flash(text, type) {
    const data = JSON.stringify({ text, type: type || 'info' });
    for (const client of this.clients) {
      try {
        client.write('event: flash\n');
        client.write('data: ' + data + '\n\n');
      } catch (e) { /* SSE client disconnected — will be pruned when its response closes */ }
    }
  }

  /**
   * Send preview data to all connected clients.
   * @param {Object} data - Preview data
   */
  sendPreview(data) {
    const json = JSON.stringify(data);
    for (const client of this.clients) {
      try {
        client.write('event: preview\n');
        client.write('data: ' + json + '\n\n');
      } catch (e) { /* SSE client disconnected — will be pruned when its response closes */ }
    }
  }

  /**
   * Send action result feedback to all connected clients.
   * @param {Object} result - { action, success, message, type }
   */
  sendActionResult(result) {
    const json = JSON.stringify(result);
    for (const client of this.clients) {
      try {
        client.write('event: actionResult\n');
        client.write('data: ' + json + '\n\n');
      } catch (e) { /* SSE client disconnected — will be pruned when its response closes */ }
    }
  }

  /**
   * Get the number of connected web clients.
   * @returns {number}
   */
  getClientCount() {
    return this.clients.size;
  }

  // ─── Private ───────────────────────────────────────────────────

  /**
   * Handle an incoming HTTP request.
   * @param {import('http').IncomingMessage} req
   * @param {import('http').ServerResponse} res
   * @private
   */
  _handleRequest(req, res) {
    // DNS-rebinding protection: only allow requests whose Host header
    // matches a known loopback address.  Without this, a malicious page
    // could resolve an attacker-controlled hostname to 127.0.0.1 and
    // POST to /api/action to trigger destructive actions.
    const host = (req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
    if (host !== 'localhost' && host !== '127.0.0.1' && host !== '[::1]') {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden: invalid Host header');
      return;
    }

    const url = new URL(req.url, `http://localhost:${this.port}`);
    const pathname = url.pathname;

    // CORS — restrict to own origin
    const origin = `http://localhost:${this.port}`;
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Routes
    if (pathname === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(this._cachedHtml);
      return;
    }

    if (pathname === '/api/state' && req.method === 'GET') {
      const state = this.getSerializableState();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(state));
      return;
    }

    if (pathname === '/api/events' && req.method === 'GET') {
      this._handleSSE(req, res);
      return;
    }

    if (pathname === '/api/projects' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this._getProjectsList()));
      return;
    }

    // /api/projects/:id/state
    const projectStateMatch = pathname.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)\/state$/);
    if (projectStateMatch && req.method === 'GET') {
      const projectState = this.getProjectState(projectStateMatch[1]);
      if (projectState) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(projectState));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Project not found' }));
      }
      return;
    }

    if (pathname === '/api/action' && req.method === 'POST') {
      this._handleAction(req, res);
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  /**
   * Set up an SSE connection.
   * @param {import('http').IncomingMessage} req
   * @param {import('http').ServerResponse} res
   * @private
   */
  _handleSSE(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Send initial state immediately
    const state = this.getSerializableState();
    res.write('event: state\n');
    res.write('data: ' + JSON.stringify(state) + '\n\n');

    this.clients.add(res);

    // Keepalive heartbeat to prevent proxy/LB timeouts
    const keepalive = setInterval(() => {
      try { res.write(': keepalive\n\n'); } catch (e) { clearInterval(keepalive); }
    }, SSE_KEEPALIVE_INTERVAL);

    req.on('close', () => {
      clearInterval(keepalive);
      this.clients.delete(res);
    });
  }

  /**
   * Handle a POST action from the web UI.
   * @param {import('http').IncomingMessage} req
   * @param {import('http').ServerResponse} res
   * @private
   */
  _handleAction(req, res) {
    let body = '';
    let aborted = false;
    req.on('data', (chunk) => {
      body += chunk;
      // Limit body size to 10KB
      if (body.length > 10240 && !aborted) {
        aborted = true;
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large' }));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (aborted) return;
      try {
        const data = JSON.parse(body);
        const action = data.action;
        const payload = data.payload || {};

        if (!action || typeof action !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing action' }));
          return;
        }

        if (!ALLOWED_ACTIONS.includes(action)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unknown action: ' + action }));
          return;
        }

        // Multi-project routing: when the request targets a project that is
        // not the coordinator's own (the user is on a different tab in the
        // dashboard), forward to that project's worker via sendCommand
        // instead of running the action against the coordinator's repo.
        const projectId = data.projectId || this.localProjectId;
        payload._projectId = projectId;

        if (
          projectId &&
          this.localProjectId &&
          projectId !== this.localProjectId &&
          typeof this.sendCommand === 'function'
        ) {
          this.sendCommand(projectId, action, payload);
        } else {
          this.onAction(action, payload);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  }

  /**
   * Push current state to all SSE clients (if changed).
   * @private
   */
  _pushState() {
    if (this.clients.size === 0) {
      this.lastPushedJson = ''; // Invalidate so next client gets immediate state
      return;
    }

    const state = this.getSerializableState();
    const json = JSON.stringify(state);

    // Only push if state changed
    if (json === this.lastPushedJson) return;
    this.lastPushedJson = json;

    const message = 'event: state\ndata: ' + json + '\n\n';
    for (const client of this.clients) {
      try {
        client.write(message);
      } catch (e) {
        // Write failed — proactively prune the dead client instead of
        // waiting for req.on('close') to fire. On abrupt socket resets
        // 'close' can be delayed long enough that subsequent frames
        // hit the same failed write, accumulating exception work and
        // keeping clientCount misleadingly high. Set.delete during
        // iteration is safe; the for-of iterator handles it.
        try { client.end(); } catch (_) { /* already torn down */ }
        this.clients.delete(client);
      }
    }
  }
}

module.exports = {
  WebDashboardServer,
  DEFAULT_WEB_PORT,
  STATE_PUSH_INTERVAL,
  ALLOWED_ACTIONS,
};
