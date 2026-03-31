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

/**
 * Default web dashboard port
 */
const DEFAULT_WEB_PORT = 4000;

/**
 * How often to push state to SSE clients (ms)
 */
const STATE_PUSH_INTERVAL = 500;

/**
 * @typedef {Object} WebDashboardOptions
 * @property {number} [port=4000] - Port to listen on
 * @property {import('../state/store').Store} store - State store instance
 * @property {function} [onAction] - Callback for web UI actions
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
    this.getExtraState = options.getExtraState || (() => ({}));

    /** @type {Set<import('http').ServerResponse>} */
    this.clients = new Set();
    this.server = null;
    this.pushInterval = null;
    this.lastPushedJson = '';

    // Multi-project support (populated by coordinator)
    /** @type {Map<string, Object>} */
    this.projects = new Map();
    this.localProjectId = null;

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
      projectName: s.projectName,

      // Activity
      activityLog: s.activityLog,
      switchHistory: s.switchHistory,

      // Caches (as plain objects)
      sparklineCache,
      branchPrStatusMap,
      aheadBehindCache,

      // Metadata
      version: PACKAGE_VERSION,

      // Multi-project data
      projects: this._getProjectsList(),
      activeProjectId: this.localProjectId,

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
      this.server = http.createServer((req, res) => {
        this._handleRequest(req, res);
      });

      this.server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          // Try next port
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

    // Close all SSE connections
    for (const client of this.clients) {
      try { client.end(); } catch (e) { /* ignore */ }
    }
    this.clients.clear();

    if (this.server) {
      this.server.close();
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
      } catch (e) { /* ignore dead clients */ }
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
      } catch (e) { /* ignore dead clients */ }
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
      } catch (e) { /* ignore dead clients */ }
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
    const projectStateMatch = pathname.match(/^\/api\/projects\/([a-f0-9]+)\/state$/);
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

    req.on('close', () => {
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
    req.on('data', (chunk) => {
      body += chunk;
      // Limit body size to 10KB
      if (body.length > 10240) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large' }));
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const action = data.action;
        const payload = data.payload || {};

        if (!action || typeof action !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing action' }));
          return;
        }

        // Whitelist allowed actions
        const allowedActions = [
          'switchBranch', 'pull', 'fetch', 'undo',
          'toggleSound', 'preview',
          'restartServer', 'reloadBrowsers', 'toggleCasino',
          'openBrowser',
        ];

        if (!allowedActions.includes(action)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unknown action: ' + action }));
          return;
        }

        // Include projectId if provided (for multi-project routing)
        const projectId = data.projectId || this.localProjectId;
        payload._projectId = projectId;

        // Dispatch to the main process
        this.onAction(action, payload);

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
    if (this.clients.size === 0) return;

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
        // Dead client — will be cleaned up on 'close'
      }
    }
  }
}

module.exports = {
  WebDashboardServer,
  DEFAULT_WEB_PORT,
  STATE_PUSH_INTERVAL,
};
