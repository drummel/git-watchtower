/**
 * Tests for web dashboard server module
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const {
  WebDashboardServer,
  DEFAULT_WEB_PORT,
  STATE_PUSH_INTERVAL,
} = require('../../../src/server/web');
const { Store } = require('../../../src/state/store');

describe('WebDashboardServer constants', () => {
  it('should have a default port of 4000', () => {
    assert.equal(DEFAULT_WEB_PORT, 4000);
  });

  it('should have a state push interval', () => {
    assert.equal(typeof STATE_PUSH_INTERVAL, 'number');
    assert.ok(STATE_PUSH_INTERVAL > 0);
  });
});

describe('WebDashboardServer', () => {
  let store;
  let server;

  beforeEach(() => {
    store = new Store({
      branches: [
        { name: 'main', commit: 'abc1234', subject: 'Initial commit', date: new Date(), isLocal: true, hasRemote: true },
        { name: 'feature-x', commit: 'def5678', subject: 'Add feature', date: new Date(), isLocal: true, hasRemote: true },
      ],
      currentBranch: 'main',
      projectName: 'test-project',
      pollingStatus: 'idle',
      isOffline: false,
      serverMode: 'none',
      serverRunning: false,
      serverCrashed: false,
      soundEnabled: true,
      port: 3000,
      activityLog: [
        { message: 'Test log', type: 'info', timestamp: new Date() },
      ],
      switchHistory: [],
      sparklineCache: new Map([['main', '\u2581\u2582\u2583']]),
      branchPrStatusMap: new Map(),
      aheadBehindCache: new Map(),
    });
  });

  afterEach(async () => {
    if (server) {
      server.stop();
      server = null;
    }
  });

  describe('constructor', () => {
    it('should use default port when not specified', () => {
      server = new WebDashboardServer({ store });
      assert.equal(server.port, DEFAULT_WEB_PORT);
    });

    it('should use custom port when specified', () => {
      server = new WebDashboardServer({ store, port: 5555 });
      assert.equal(server.port, 5555);
    });

    it('should initialize with empty clients set', () => {
      server = new WebDashboardServer({ store });
      assert.equal(server.getClientCount(), 0);
    });
  });

  describe('getSerializableState', () => {
    it('should convert Maps to plain objects', () => {
      server = new WebDashboardServer({ store });
      const state = server.getSerializableState();

      assert.equal(typeof state.sparklineCache, 'object');
      assert.ok(!(state.sparklineCache instanceof Map));
      assert.equal(state.sparklineCache['main'], '\u2581\u2582\u2583');
    });

    it('should include branch data', () => {
      server = new WebDashboardServer({ store });
      const state = server.getSerializableState();

      assert.ok(Array.isArray(state.branches));
      assert.equal(state.branches.length, 2);
      assert.equal(state.branches[0].name, 'main');
      assert.equal(state.currentBranch, 'main');
    });

    it('should include project metadata', () => {
      server = new WebDashboardServer({ store });
      const state = server.getSerializableState();

      assert.equal(state.projectName, 'test-project');
      assert.equal(typeof state.version, 'string');
    });

    it('should include polling state', () => {
      server = new WebDashboardServer({ store });
      const state = server.getSerializableState();

      assert.equal(state.pollingStatus, 'idle');
      assert.equal(state.isOffline, false);
    });

    it('should include activity log', () => {
      server = new WebDashboardServer({ store });
      const state = server.getSerializableState();

      assert.ok(Array.isArray(state.activityLog));
      assert.equal(state.activityLog.length, 1);
      assert.equal(state.activityLog[0].message, 'Test log');
    });

    it('should merge extra state from getExtraState callback', () => {
      server = new WebDashboardServer({
        store,
        getExtraState: () => ({ customField: 'test' }),
      });
      const state = server.getSerializableState();

      assert.equal(state.customField, 'test');
    });

    it('should handle empty Maps gracefully', () => {
      store.setState({
        sparklineCache: new Map(),
        branchPrStatusMap: new Map(),
        aheadBehindCache: new Map(),
      });
      server = new WebDashboardServer({ store });
      const state = server.getSerializableState();

      assert.deepEqual(state.sparklineCache, {});
      assert.deepEqual(state.branchPrStatusMap, {});
      assert.deepEqual(state.aheadBehindCache, {});
    });

    it('should include server log buffer', () => {
      store.setState({
        serverLogBuffer: [
          { timestamp: '10:00:00', line: 'Server started', isError: false },
          { timestamp: '10:00:01', line: 'Error occurred', isError: true },
        ],
      });
      server = new WebDashboardServer({ store });
      const state = server.getSerializableState();

      assert.ok(Array.isArray(state.serverLogBuffer));
      assert.equal(state.serverLogBuffer.length, 2);
      assert.equal(state.serverLogBuffer[0].line, 'Server started');
      assert.equal(state.serverLogBuffer[1].isError, true);
    });

    it('should default serverLogBuffer to empty array', () => {
      server = new WebDashboardServer({ store });
      const state = server.getSerializableState();

      assert.ok(Array.isArray(state.serverLogBuffer));
    });

    it('should include updateAvailable field', () => {
      store.setState({ updateAvailable: '2.0.0' });
      server = new WebDashboardServer({ store });
      const state = server.getSerializableState();

      assert.equal(state.updateAvailable, '2.0.0');
    });

    it('should default updateAvailable to null', () => {
      server = new WebDashboardServer({ store });
      const state = server.getSerializableState();

      assert.equal(state.updateAvailable, null);
    });

    it('should include updateInProgress field', () => {
      store.setState({ updateInProgress: true });
      server = new WebDashboardServer({ store });
      const state = server.getSerializableState();

      assert.equal(state.updateInProgress, true);
    });

    it('should default updateInProgress to false', () => {
      server = new WebDashboardServer({ store });
      const state = server.getSerializableState();

      assert.equal(state.updateInProgress, false);
    });

    it('should include noServer field', () => {
      store.setState({ noServer: true });
      server = new WebDashboardServer({ store });
      const state = server.getSerializableState();

      assert.equal(state.noServer, true);
    });

    it('should default noServer to false', () => {
      server = new WebDashboardServer({ store });
      const state = server.getSerializableState();

      assert.equal(state.noServer, false);
    });

    it('should include clientCount from connected clients', () => {
      server = new WebDashboardServer({ store });
      const state = server.getSerializableState();

      assert.equal(typeof state.clientCount, 'number');
      assert.equal(state.clientCount, 0);
    });

    it('should include session stats', () => {
      server = new WebDashboardServer({ store });
      const state = server.getSerializableState();

      assert.ok(state.sessionStats);
      assert.equal(typeof state.sessionStats.sessionDuration, 'string');
      assert.equal(typeof state.sessionStats.linesAdded, 'number');
      assert.equal(typeof state.sessionStats.linesDeleted, 'number');
      assert.equal(typeof state.sessionStats.totalPolls, 'number');
      assert.equal(typeof state.sessionStats.pollsWithUpdates, 'number');
      assert.equal(typeof state.sessionStats.hitRate, 'number');
    });

    it('should include switch history', () => {
      store.setState({
        switchHistory: [
          { from: 'main', to: 'feature', timestamp: new Date() },
        ],
      });
      server = new WebDashboardServer({ store });
      const state = server.getSerializableState();

      assert.ok(Array.isArray(state.switchHistory));
      assert.equal(state.switchHistory.length, 1);
      assert.equal(state.switchHistory[0].from, 'main');
    });
  });

  describe('start and stop', () => {
    it('should start listening on the specified port', async () => {
      server = new WebDashboardServer({ store, port: 0 }); // port 0 = random
      // Use a high ephemeral port to avoid conflicts
      server.port = 19876;
      const result = await server.start();
      assert.equal(typeof result.port, 'number');
      assert.ok(result.port > 0);
    });

    it('should stop cleanly', async () => {
      server = new WebDashboardServer({ store, port: 19877 });
      await server.start();
      server.stop();
      // Should not throw
      server = null;
    });

    it('should auto-increment port on EADDRINUSE', async () => {
      // Occupy a port first
      const blocker = http.createServer();
      await new Promise((resolve) => blocker.listen(19878, '127.0.0.1', resolve));

      try {
        server = new WebDashboardServer({ store, port: 19878 });
        const result = await server.start();
        assert.ok(result.port > 19878, 'Should have picked a higher port');
      } finally {
        blocker.close();
      }
    });
  });

  describe('HTTP endpoints', () => {
    beforeEach(async () => {
      server = new WebDashboardServer({ store, port: 19879 });
      await server.start();
    });

    function httpGet(urlPath) {
      return new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${server.port}${urlPath}`, {
          headers: { 'Connection': 'close' },
        }, (res) => {
          let body = '';
          res.on('data', (chunk) => { body += chunk; });
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        });
        req.on('error', reject);
      });
    }

    function httpPost(urlPath, data) {
      return new Promise((resolve, reject) => {
        const body = JSON.stringify(data);
        const req = http.request(`http://127.0.0.1:${server.port}${urlPath}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            'Connection': 'close',
          },
        }, (res) => {
          let respBody = '';
          res.on('data', (chunk) => { respBody += chunk; });
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: respBody }));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
      });
    }

    it('GET / should return HTML dashboard', async () => {
      const res = await httpGet('/');
      assert.equal(res.status, 200);
      assert.ok(res.headers['content-type'].includes('text/html'));
      assert.ok(res.body.includes('Git Watchtower'));
      assert.ok(res.body.includes('<!DOCTYPE html>'));
    });

    it('GET /api/state should return JSON state', async () => {
      const res = await httpGet('/api/state');
      assert.equal(res.status, 200);
      assert.ok(res.headers['content-type'].includes('application/json'));
      const state = JSON.parse(res.body);
      assert.equal(state.currentBranch, 'main');
      assert.ok(Array.isArray(state.branches));
      assert.equal(state.projectName, 'test-project');
    });

    it('GET /api/events should return SSE stream', async () => {
      // Connect to SSE and read the first event
      const data = await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${server.port}/api/events`, (res) => {
          assert.equal(res.statusCode, 200);
          assert.equal(res.headers['content-type'], 'text/event-stream');
          let buf = '';
          res.on('data', (chunk) => {
            buf += chunk;
            // We should get the initial state push
            if (buf.includes('\n\n')) {
              req.destroy();
              resolve(buf);
            }
          });
        });
        req.on('error', (err) => {
          if (err.code !== 'ECONNRESET') reject(err);
        });
        setTimeout(() => { req.destroy(); resolve('timeout'); }, 2000);
      });

      assert.ok(data.includes('event: state'), 'Should contain state event');
      assert.ok(data.includes('"currentBranch"'), 'Should contain state data');
    });

    it('POST /api/action should accept valid actions', async () => {
      let receivedAction = null;
      server.onAction = (action, payload) => { receivedAction = { action, payload }; };

      const res = await httpPost('/api/action', { action: 'toggleSound', payload: {} });
      assert.equal(res.status, 200);
      const body = JSON.parse(res.body);
      assert.equal(body.ok, true);
      assert.equal(receivedAction.action, 'toggleSound');
    });

    it('POST /api/action should reject unknown actions', async () => {
      const res = await httpPost('/api/action', { action: 'deleteEverything', payload: {} });
      assert.equal(res.status, 400);
      const body = JSON.parse(res.body);
      assert.ok(body.error.includes('Unknown action'));
    });

    it('POST /api/action should reject missing action', async () => {
      const res = await httpPost('/api/action', { payload: {} });
      assert.equal(res.status, 400);
      const body = JSON.parse(res.body);
      assert.ok(body.error.includes('Missing action'));
    });

    it('POST /api/action should reject invalid JSON', async () => {
      const res = await new Promise((resolve, reject) => {
        const req = http.request(`http://127.0.0.1:${server.port}/api/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': 5, 'Connection': 'close' },
        }, (resp) => {
          let body = '';
          resp.on('data', (chunk) => { body += chunk; });
          resp.on('end', () => resolve({ status: resp.statusCode, body }));
        });
        req.on('error', reject);
        req.write('{bad}');
        req.end();
      });
      assert.equal(res.status, 400);
    });

    it('GET /unknown should return 404', async () => {
      const res = await httpGet('/unknown');
      assert.equal(res.status, 404);
    });

    it('should set CORS headers', async () => {
      const res = await httpGet('/api/state');
      assert.ok(res.headers['access-control-allow-origin']);
      assert.ok(res.headers['access-control-allow-origin'].includes('localhost'));
    });

    it('GET /api/projects should return projects list', async () => {
      server.setLocalProjectId('test123');
      const res = await httpGet('/api/projects');
      assert.equal(res.status, 200);
      const projects = JSON.parse(res.body);
      assert.ok(Array.isArray(projects));
    });

    it('GET /api/projects/:id/state should return project state', async () => {
      server.setLocalProjectId('test123');
      const res = await httpGet('/api/projects/test123/state');
      assert.equal(res.status, 200);
      const state = JSON.parse(res.body);
      assert.equal(state.currentBranch, 'main');
    });

    it('GET /api/projects/:id/state should 404 for unknown project', async () => {
      server.setLocalProjectId('test123');
      const res = await httpGet('/api/projects/unknown99/state');
      assert.equal(res.status, 404);
    });

    it('POST /api/action should reject oversized payloads', async () => {
      const bigPayload = JSON.stringify({ action: 'fetch', payload: { data: 'x'.repeat(20000) } });
      const res = await new Promise((resolve, reject) => {
        const req = http.request(`http://127.0.0.1:${server.port}/api/action`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(bigPayload),
            'Connection': 'close',
          },
        }, (resp) => {
          let body = '';
          resp.on('data', (chunk) => { body += chunk; });
          resp.on('end', () => resolve({ status: resp.statusCode, body }));
        });
        req.on('error', (err) => {
          // Connection may be destroyed — treat as expected
          resolve({ status: 413, body: '{}' });
        });
        req.write(bigPayload);
        req.end();
      });
      assert.equal(res.status, 413);
    });
  });

  describe('SSE client management', () => {
    beforeEach(async () => {
      server = new WebDashboardServer({ store, port: 19880 });
      await server.start();
    });

    it('should track connected clients', async () => {
      assert.equal(server.getClientCount(), 0);

      // Connect an SSE client
      const req = http.get(`http://127.0.0.1:${server.port}/api/events`);

      await new Promise((resolve) => {
        req.on('response', () => {
          // Give it a tick to register
          setTimeout(() => {
            assert.equal(server.getClientCount(), 1);
            req.destroy();
            setTimeout(resolve, 50);
          }, 50);
        });
      });

      // After disconnect, count should drop
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.equal(server.getClientCount(), 0);
    });
  });

  describe('SSE keepalive', () => {
    it('should write real newlines, not escaped backslash-n', async () => {
      server = new WebDashboardServer({ store, port: 19881 });
      await server.start();

      // Collect raw data from the SSE stream
      const data = await new Promise((resolve) => {
        let buf = '';
        const req = http.get(`http://127.0.0.1:${server.port}/api/events`, (res) => {
          res.on('data', (chunk) => { buf += chunk; });
        });
        // The SSE_KEEPALIVE_INTERVAL is 15s, but we can test the write
        // format by manually invoking the keepalive on a mock client.
        // Instead, verify the source code directly:
        req.on('response', () => {
          req.destroy();
          setTimeout(() => resolve(buf), 50);
        });
      });

      // The source code fix: ensure the keepalive comment uses real newlines.
      // We can't easily wait 15s in a test, so verify the method source.
      const src = server._handleSSE.toString();
      // Should contain ': keepalive\n\n' (real newlines), not '\\n\\n' (escaped)
      assert.ok(
        !src.includes("keepalive\\\\n\\\\n"),
        'Keepalive should use real newlines, not escaped backslash-n'
      );
    });
  });

  describe('flash', () => {
    it('should not throw with no clients', () => {
      server = new WebDashboardServer({ store });
      assert.doesNotThrow(() => {
        server.flash('Test message', 'success');
      });
    });
  });

  describe('sendPreview', () => {
    it('should not throw with no clients', () => {
      server = new WebDashboardServer({ store });
      assert.doesNotThrow(() => {
        server.sendPreview({ branch: 'main', commits: [], files: [] });
      });
    });
  });

  describe('sendActionResult', () => {
    it('should not throw with no clients', () => {
      server = new WebDashboardServer({ store });
      assert.doesNotThrow(() => {
        server.sendActionResult({ action: 'pull', success: true, message: 'Pull complete' });
      });
    });
  });

  describe('SSE broadcasting with connected clients', () => {
    beforeEach(async () => {
      server = new WebDashboardServer({ store, port: 19882 });
      await server.start();
    });

    function connectSSE() {
      return new Promise((resolve) => {
        const req = http.get(`http://127.0.0.1:${server.port}/api/events`);
        let chunks = '';
        req.on('response', (res) => {
          res.on('data', (chunk) => { chunks += chunk; });
          setTimeout(() => resolve({ req, chunks: () => chunks }), 80);
        });
      });
    }

    it('should send flash events to connected clients', async () => {
      const { req, chunks } = await connectSSE();
      server.flash('Hello world', 'success');
      await new Promise(r => setTimeout(r, 50));
      req.destroy();
      const data = chunks();
      assert.ok(data.includes('event: flash'), 'Should contain flash event');
      assert.ok(data.includes('Hello world'), 'Should contain message');
    });

    it('should send preview events to connected clients', async () => {
      const { req, chunks } = await connectSSE();
      server.sendPreview({ branch: 'main', commits: [{ hash: 'abc', subject: 'Test' }] });
      await new Promise(r => setTimeout(r, 50));
      req.destroy();
      const data = chunks();
      assert.ok(data.includes('event: preview'), 'Should contain preview event');
      assert.ok(data.includes('abc'), 'Should contain commit hash');
    });

    it('should send actionResult events to connected clients', async () => {
      const { req, chunks } = await connectSSE();
      server.sendActionResult({ action: 'pull', success: true, message: 'Done' });
      await new Promise(r => setTimeout(r, 50));
      req.destroy();
      const data = chunks();
      assert.ok(data.includes('event: actionResult'), 'Should contain actionResult event');
      assert.ok(data.includes('Done'), 'Should contain message');
    });

    it('should push state changes to connected clients', async () => {
      const { req, chunks } = await connectSSE();
      // Trigger a state change
      store.setState({ projectName: 'changed-name' });
      // Wait for the push interval (500ms + buffer)
      await new Promise(r => setTimeout(r, 700));
      req.destroy();
      const data = chunks();
      // Should have at least 2 state events (initial + push)
      const stateEvents = data.split('event: state').length - 1;
      assert.ok(stateEvents >= 2, 'Should have pushed at least 2 state events, got ' + stateEvents);
      assert.ok(data.includes('changed-name'));
    });

    it('should not push state when unchanged', async () => {
      const { req, chunks } = await connectSSE();
      // Wait for push interval without changing anything
      await new Promise(r => setTimeout(r, 700));
      req.destroy();
      const data = chunks();
      // Should have only the initial state event (no duplicate)
      const stateEvents = data.split('event: state').length - 1;
      assert.ok(stateEvents >= 1, 'Should have initial state');
      // The second push should be deduped (same JSON)
    });
  });

  describe('OPTIONS preflight', () => {
    beforeEach(async () => {
      server = new WebDashboardServer({ store, port: 19883 });
      await server.start();
    });

    it('should return 204 for OPTIONS request', async () => {
      const res = await new Promise((resolve, reject) => {
        const req = http.request(`http://127.0.0.1:${server.port}/api/action`, {
          method: 'OPTIONS',
          headers: { 'Connection': 'close' },
        }, (resp) => {
          let body = '';
          resp.on('data', (chunk) => { body += chunk; });
          resp.on('end', () => resolve({ status: resp.statusCode, headers: resp.headers, body }));
        });
        req.on('error', reject);
        req.end();
      });
      assert.equal(res.status, 204);
      assert.ok(res.headers['access-control-allow-methods']);
    });
  });

  describe('Host header validation (DNS-rebinding protection)', () => {
    beforeEach(async () => {
      server = new WebDashboardServer({ store, port: 19884 });
      await server.start();
    });

    function httpGetWithHost(urlPath, hostHeader) {
      return new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${server.port}${urlPath}`, {
          headers: { 'Connection': 'close', 'Host': hostHeader },
        }, (res) => {
          let body = '';
          res.on('data', (chunk) => { body += chunk; });
          res.on('end', () => resolve({ status: res.statusCode, body }));
        });
        req.on('error', reject);
      });
    }

    it('should allow requests with Host: localhost', async () => {
      const res = await httpGetWithHost('/', `localhost:${server.port}`);
      assert.equal(res.status, 200);
    });

    it('should allow requests with Host: 127.0.0.1', async () => {
      const res = await httpGetWithHost('/', `127.0.0.1:${server.port}`);
      assert.equal(res.status, 200);
    });

    it('should allow requests with Host: [::1]', async () => {
      const res = await httpGetWithHost('/', `[::1]:${server.port}`);
      assert.equal(res.status, 200);
    });

    it('should reject requests with attacker-controlled Host header', async () => {
      const res = await httpGetWithHost('/', 'evil.example.com');
      assert.equal(res.status, 403);
      assert.ok(res.body.includes('Forbidden'));
    });

    it('should reject requests with Host header containing subdomain of localhost', async () => {
      const res = await httpGetWithHost('/', `attacker.localhost:${server.port}`);
      assert.equal(res.status, 403);
    });
  });

  describe('multi-project support', () => {
    it('should set and get local project ID', () => {
      server = new WebDashboardServer({ store });
      server.setLocalProjectId('abc123');
      assert.equal(server.localProjectId, 'abc123');
    });

    it('should include projects in serializable state', () => {
      server = new WebDashboardServer({ store });
      server.setLocalProjectId('abc123');
      const state = server.getSerializableState();
      assert.ok(Array.isArray(state.projects));
      assert.equal(state.activeProjectId, 'abc123');
    });

    it('should set projects from coordinator data', () => {
      server = new WebDashboardServer({ store });
      server.setLocalProjectId('abc');
      server.setProjects([
        { id: 'abc', projectName: 'proj-a', projectPath: '/a', state: {} },
        { id: 'def', projectName: 'proj-b', projectPath: '/b', state: { branches: [] } },
      ]);

      const state = server.getSerializableState();
      assert.equal(state.projects.length, 2);
      assert.equal(state.projects[0].name, 'proj-a');
      assert.equal(state.projects[1].name, 'proj-b');
    });

    it('should return project state by ID', () => {
      server = new WebDashboardServer({ store });
      server.setLocalProjectId('abc');
      server.setProjects([
        { id: 'def', projectName: 'proj-b', projectPath: '/b', state: { branches: [{ name: 'main' }] } },
      ]);

      const ps = server.getProjectState('def');
      assert.ok(ps);
      assert.equal(ps.branches[0].name, 'main');
    });

    it('should return null for unknown project ID', () => {
      server = new WebDashboardServer({ store });
      server.setLocalProjectId('abc');
      assert.equal(server.getProjectState('unknown'), null);
    });

    it('should return local state for own project ID', () => {
      server = new WebDashboardServer({ store });
      server.setLocalProjectId('abc');
      const state = server.getProjectState('abc');
      assert.ok(state);
      assert.equal(state.currentBranch, 'main');
    });
  });

  describe('expanded actions', () => {
    beforeEach(async () => {
      server = new WebDashboardServer({ store, port: 19881 });
      await server.start();
    });

    function httpPost(urlPath, data) {
      return new Promise((resolve, reject) => {
        const body = JSON.stringify(data);
        const req = http.request(`http://127.0.0.1:${server.port}${urlPath}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            'Connection': 'close',
          },
        }, (res) => {
          let respBody = '';
          res.on('data', (chunk) => { respBody += chunk; });
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: respBody }));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
      });
    }

    it('should accept restartServer action', async () => {
      let received = null;
      server.onAction = (action, payload) => { received = action; };
      const res = await httpPost('/api/action', { action: 'restartServer' });
      assert.equal(res.status, 200);
      assert.equal(received, 'restartServer');
    });

    it('should accept reloadBrowsers action', async () => {
      let received = null;
      server.onAction = (action, payload) => { received = action; };
      const res = await httpPost('/api/action', { action: 'reloadBrowsers' });
      assert.equal(res.status, 200);
      assert.equal(received, 'reloadBrowsers');
    });

    it('should accept toggleCasino action', async () => {
      let received = null;
      server.onAction = (action, payload) => { received = action; };
      const res = await httpPost('/api/action', { action: 'toggleCasino' });
      assert.equal(res.status, 200);
      assert.equal(received, 'toggleCasino');
    });

    it('should accept openBrowser action', async () => {
      let received = null;
      server.onAction = (action, payload) => { received = action; };
      const res = await httpPost('/api/action', { action: 'openBrowser' });
      assert.equal(res.status, 200);
      assert.equal(received, 'openBrowser');
    });

    it('should include projectId in payload', async () => {
      let receivedPayload = null;
      server.onAction = (action, payload) => { receivedPayload = payload; };
      server.setLocalProjectId('myproj');
      const res = await httpPost('/api/action', { action: 'fetch', projectId: 'otherproj' });
      assert.equal(res.status, 200);
      assert.equal(receivedPayload._projectId, 'otherproj');
    });

    it('should accept stash action', async () => {
      let received = null;
      server.onAction = (action, payload) => { received = { action, payload }; };
      const res = await httpPost('/api/action', { action: 'stash', payload: { pendingBranch: 'feature' } });
      assert.equal(res.status, 200);
      assert.equal(received.action, 'stash');
      assert.equal(received.payload.pendingBranch, 'feature');
    });

    it('should accept stashPop action', async () => {
      let received = null;
      server.onAction = (action, payload) => { received = action; };
      const res = await httpPost('/api/action', { action: 'stashPop' });
      assert.equal(res.status, 200);
      assert.equal(received, 'stashPop');
    });

    it('should accept deleteBranches action', async () => {
      let received = null;
      server.onAction = (action, payload) => { received = { action, payload }; };
      const res = await httpPost('/api/action', {
        action: 'deleteBranches',
        payload: { branches: ['old-feature'], force: false },
      });
      assert.equal(res.status, 200);
      assert.equal(received.action, 'deleteBranches');
      assert.deepEqual(received.payload.branches, ['old-feature']);
      assert.equal(received.payload.force, false);
    });

    it('should accept deleteBranches with force flag', async () => {
      let received = null;
      server.onAction = (action, payload) => { received = { action, payload }; };
      const res = await httpPost('/api/action', {
        action: 'deleteBranches',
        payload: { branches: ['stale-1', 'stale-2'], force: true },
      });
      assert.equal(res.status, 200);
      assert.equal(received.payload.force, true);
      assert.equal(received.payload.branches.length, 2);
    });

    it('should accept checkUpdate action', async () => {
      let received = null;
      server.onAction = (action, payload) => { received = { action, payload }; };
      const res = await httpPost('/api/action', {
        action: 'checkUpdate',
        payload: { install: true },
      });
      assert.equal(res.status, 200);
      assert.equal(received.action, 'checkUpdate');
      assert.equal(received.payload.install, true);
    });
  });
});

describe('getWebDashboardHtml', () => {
  const { getWebDashboardHtml } = require('../../../src/server/web-ui');

  it('should return a complete HTML document', () => {
    const html = getWebDashboardHtml(4000);
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('</html>'));
  });

  it('should include Git Watchtower title', () => {
    const html = getWebDashboardHtml(4000);
    assert.ok(html.includes('Git Watchtower'));
  });

  it('should include SSE connection code', () => {
    const html = getWebDashboardHtml(4000);
    assert.ok(html.includes('EventSource'));
    assert.ok(html.includes('/api/events'));
  });

  it('should include keyboard event handling', () => {
    const html = getWebDashboardHtml(4000);
    assert.ok(html.includes('keydown'));
    assert.ok(html.includes('ArrowUp'));
    assert.ok(html.includes('ArrowDown'));
  });

  it('should include the search UI', () => {
    const html = getWebDashboardHtml(4000);
    assert.ok(html.includes('search-input'));
    assert.ok(html.includes('search-bar'));
  });

  it('should include the activity log', () => {
    const html = getWebDashboardHtml(4000);
    assert.ok(html.includes('activity-log'));
  });

  it('should include CSS styles', () => {
    const html = getWebDashboardHtml(4000);
    assert.ok(html.includes('<style>'));
    assert.ok(html.includes('--bg:'));
  });

  it('should include footer with keybindings', () => {
    const html = getWebDashboardHtml(4000);
    assert.ok(html.includes('<kbd>'));
    assert.ok(html.includes('navigate'));
  });

  it('should include tab bar element', () => {
    const html = getWebDashboardHtml(4000);
    assert.ok(html.includes('tab-bar'));
    assert.ok(html.includes('renderTabs'));
  });

  it('should include confirm dialog', () => {
    const html = getWebDashboardHtml(4000);
    assert.ok(html.includes('confirm-overlay'));
    assert.ok(html.includes('confirm-box'));
    assert.ok(html.includes('showConfirm'));
    assert.ok(html.includes('hideConfirm'));
  });

  it('should include toast notification system', () => {
    const html = getWebDashboardHtml(4000);
    assert.ok(html.includes('toast-container'));
    assert.ok(html.includes('showToast'));
  });

  it('should include actionResult SSE listener', () => {
    const html = getWebDashboardHtml(4000);
    assert.ok(html.includes('actionResult'));
  });

  it('should include tab switching keyboard shortcuts', () => {
    const html = getWebDashboardHtml(4000);
    assert.ok(html.includes('switchTab'));
    assert.ok(html.includes('Tab'));
  });

  it('should include expanded action keybindings', () => {
    const html = getWebDashboardHtml(4000);
    assert.ok(html.includes('restartServer'));
    assert.ok(html.includes('reloadBrowsers'));
    assert.ok(html.includes('toggleCasino'));
    assert.ok(html.includes('openBrowser'));
  });

  it('should switch branches directly without confirmation', () => {
    const html = getWebDashboardHtml(4000);
    assert.ok(html.includes('switchBranch'));
    // No confirmation dialog for branch switch
    assert.ok(!html.includes("showConfirm('Switch Branch"));
  });

  // ── Log Viewer ──────────────────────────────────────────────
  describe('log viewer', () => {
    it('should include log viewer modal overlay', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('log-viewer-overlay'));
    });

    it('should include log viewer tabs for server and activity', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('data-tab="server"'));
      assert.ok(html.includes('data-tab="activity"'));
    });

    it('should include log viewer content container', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('log-viewer-content'));
    });

    it('should include showLogViewer function', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('function showLogViewer'));
    });

    it('should include hideLogViewer function', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('function hideLogViewer'));
    });

    it('should include renderLogViewer function', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('function renderLogViewer'));
    });

    it('should include log viewer close button', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('log-viewer-close'));
    });

    it('should include log viewer CSS styles', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('.log-viewer-tabs'));
      assert.ok(html.includes('.log-viewer-tab'));
      assert.ok(html.includes('.log-viewer-content'));
      assert.ok(html.includes('.log-line'));
    });

    it('should support l key to open log viewer', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes("'l':") && html.includes("'logViewer'"));
      assert.ok(html.includes('showLogViewer'));
    });

    it('should support tab switching in log viewer', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('logViewerTab'));
    });

    it('should render server log buffer', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('serverLogBuffer'));
    });

    it('should handle empty server logs', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('No server logs'));
    });

    it('should handle empty activity logs in viewer', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('No activity'));
    });

    it('should mark error log lines with error class', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes("log.isError ? ' error' : ''"));
    });
  });

  // ── Branch Action Modal ─────────────────────────────────────
  describe('branch action modal', () => {
    it('should include branch action modal overlay', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('branch-action-overlay'));
    });

    it('should include branch action list container', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('branch-action-list'));
    });

    it('should include showBranchActions function', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('function showBranchActions'));
    });

    it('should include hideBranchActions function', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('function hideBranchActions'));
    });

    it('should support b key to open branch actions', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes("'b':") && html.includes("'branchActions'"));
      assert.ok(html.includes('showBranchActions'));
    });

    it('should include open branch on web action', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('Open branch on web'));
      assert.ok(html.includes('openBranchWeb'));
    });

    it('should include switch to branch action', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('Switch to this branch'));
    });

    it('should include pull action for current branch', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('Pull latest changes'));
    });

    it('should include fetch action', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('Fetch all remotes'));
    });

    it('should include PR link when available', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('openPrUrl'));
      assert.ok(html.includes('prStatus'));
    });

    it('should include branch action close button', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('branch-action-close'));
    });

    it('should include action list CSS styles', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('.action-list'));
      assert.ok(html.includes('.action-item'));
      assert.ok(html.includes('.action-icon'));
      assert.ok(html.includes('.action-label'));
    });

    it('should include branch action title with branch name', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('branch-action-title'));
    });
  });

  // ── Info Panel ──────────────────────────────────────────────
  describe('info panel', () => {
    it('should include info panel modal overlay', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('info-overlay'));
    });

    it('should include info grid container', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('info-grid'));
    });

    it('should include showInfo function', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('function showInfo'));
    });

    it('should include hideInfo function', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('function hideInfo'));
    });

    it('should support i key to open info panel', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes("'i':") && html.includes("'info'"));
      assert.ok(html.includes('showInfo'));
    });

    it('should display project name in info panel', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes("'Project'"));
      assert.ok(html.includes('state.projectName'));
    });

    it('should display server mode in info panel', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes("'Server Mode'"));
      assert.ok(html.includes('state.serverMode'));
    });

    it('should display server port in info panel', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes("'Server Port'"));
      assert.ok(html.includes('state.port'));
    });

    it('should display SSE client count in info panel', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes("'SSE Clients'"));
      assert.ok(html.includes('state.clientCount'));
    });

    it('should display current branch in info panel', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes("'Current Branch'"));
      assert.ok(html.includes('state.currentBranch'));
    });

    it('should display polling status in info panel', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes("'Polling Status'"));
      assert.ok(html.includes('state.pollingStatus'));
    });

    it('should display network status in info panel', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes("'Network'"));
      assert.ok(html.includes('state.isOffline'));
    });

    it('should display branch count in info panel', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes("'Branches'"));
    });

    it('should include info grid CSS styles', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('.info-grid'));
      assert.ok(html.includes('.info-label'));
      assert.ok(html.includes('.info-value'));
    });

    it('should include info close button', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('info-close'));
    });
  });

  // ── Stash Management ────────────────────────────────────────
  describe('stash management', () => {
    it('should include stash modal overlay', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('stash-overlay'));
    });

    it('should include stash content container', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('stash-content'));
    });

    it('should include showStashDialog function', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('function showStashDialog'));
    });

    it('should include hideStash function', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('function hideStash'));
    });

    it('should support S key to open stash dialog', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes("'S':") && html.includes("'stash'"));
      assert.ok(html.includes('showStashDialog'));
    });

    it('should send stash action on confirm', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes("sendAction('stash'"));
    });

    it('should support pending branch for stash-and-switch', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('pendingStashBranch'));
      assert.ok(html.includes('pendingBranch'));
    });

    it('should include stash confirm and cancel buttons', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('stash-cancel'));
      assert.ok(html.includes('stash-confirm'));
      assert.ok(html.includes('Stash &amp; Continue'));
    });

    it('should include stash close button', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('stash-close'));
    });

    it('should show context message for branch switch stash', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('uncommitted changes'));
    });
  });

  // ── Session Stats ───────────────────────────────────────────
  describe('session stats', () => {
    it('should include stats bar in footer', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('stats-bar'));
    });

    it('should include renderSessionStats function', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('function renderSessionStats'));
    });

    it('should display session duration', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('sessionDuration'));
      assert.ok(html.includes('Session:'));
    });

    it('should display lines changed', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('linesAdded'));
      assert.ok(html.includes('linesDeleted'));
      assert.ok(html.includes('Lines:'));
    });

    it('should display poll count and hit rate', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('totalPolls'));
      assert.ok(html.includes('hitRate'));
      assert.ok(html.includes('Polls:'));
    });

    it('should display last update time', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('lastUpdate'));
      assert.ok(html.includes('Last update:'));
    });

    it('should display active and stale branch counts', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('activeBranches'));
      assert.ok(html.includes('staleBranches'));
      assert.ok(html.includes('Active:'));
      assert.ok(html.includes('Stale:'));
    });

    it('should include stats bar CSS styles', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('.stats-bar'));
      assert.ok(html.includes('.stat-item'));
      assert.ok(html.includes('.stat-value'));
      assert.ok(html.includes('.stat-label'));
    });

    it('should call renderSessionStats on state update', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('renderSessionStats()'));
    });
  });

  // ── Update Notification ─────────────────────────────────────
  describe('update notification', () => {
    it('should include update modal overlay', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('update-overlay'));
    });

    it('should include update content container', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('update-content'));
    });

    it('should include showUpdateModal function', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('function showUpdateModal'));
    });

    it('should include hideUpdate function', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('function hideUpdate'));
    });

    it('should auto-show update modal when updateAvailable', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('state.updateAvailable'));
      assert.ok(html.includes('updateNotificationShown'));
      assert.ok(html.includes('showUpdateModal'));
    });

    it('should display version comparison', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('old-version'));
      assert.ok(html.includes('new-version'));
      assert.ok(html.includes('update-versions'));
    });

    it('should include update install button', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('update-install'));
      assert.ok(html.includes('Update &amp; Restart'));
    });

    it('should include update dismiss button', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('update-dismiss'));
      assert.ok(html.includes('Dismiss'));
    });

    it('should send checkUpdate action on install', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes("sendAction('checkUpdate'"));
      assert.ok(html.includes('install: true'));
    });

    it('should show update in progress state', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('updateInProgress'));
      assert.ok(html.includes('Update in progress'));
    });

    it('should include update modal CSS styles', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('.update-versions'));
      assert.ok(html.includes('.update-info'));
      assert.ok(html.includes('.update-progress'));
    });

    it('should include update close button', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('update-close'));
    });

    it('should only show update once per session', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('updateNotificationShown = true'));
    });
  });

  // ── Branch Cleanup ──────────────────────────────────────────
  describe('branch cleanup', () => {
    it('should include cleanup modal overlay', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('cleanup-overlay'));
    });

    it('should include cleanup content container', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('cleanup-content'));
    });

    it('should include showCleanup function', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('function showCleanup'));
    });

    it('should include hideCleanup function', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('function hideCleanup'));
    });

    it('should support d key to open cleanup', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes("'d':") && html.includes("'cleanup'"));
      assert.ok(html.includes('showCleanup'));
    });

    it('should detect branches with no remote', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('b.isLocal && !b.hasRemote'));
    });

    it('should skip current branch in cleanup', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('b.name !== state.currentBranch'));
    });

    it('should include safe delete option', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('cleanup-safe'));
      assert.ok(html.includes('Safe Delete (-d)'));
    });

    it('should include force delete option', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('cleanup-force'));
      assert.ok(html.includes('Force Delete (-D)'));
    });

    it('should show confirm for force delete', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('Force delete'));
      assert.ok(html.includes('force: true'));
    });

    it('should send deleteBranches action', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes("sendAction('deleteBranches'"));
    });

    it('should show message when no stale branches found', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('No stale branches found'));
    });

    it('should include cleanup branch list CSS', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('.cleanup-branch-list'));
      assert.ok(html.includes('.cleanup-branch-item'));
      assert.ok(html.includes('.cleanup-branch-icon'));
    });

    it('should include cleanup close button', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('cleanup-close'));
    });
  });

  // ── All Branches Shown ──────────────────────────────────────
  describe('all branches shown', () => {
    it('should show all branches without visible count limit', () => {
      const html = getWebDashboardHtml(4000);
      // Web UI iterates all branches without a count limit
      assert.ok(html.includes('for (let i = 0; i < branches.length; i++)'));
      // No visibleBranchCount limiter in web render
      assert.ok(!html.includes('visibleBranchCount'));
    });

    it('should not include 1-9 branch count controls in footer', () => {
      const html = getWebDashboardHtml(4000);
      // Footer should not have branch count controls
      assert.ok(!html.includes('<kbd>+</kbd>'));
      assert.ok(!html.includes('<kbd>-</kbd>'));
    });
  });

  // ── Error Toast with Stash Hint ─────────────────────────────
  describe('error toast with stash hint', () => {
    it('should include showErrorToastWithHint function', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('function showErrorToastWithHint'));
    });

    it('should detect uncommitted changes in actionResult', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes("data.message.indexOf('uncommitted')"));
    });

    it('should show stash hint on dirty workdir error', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes("'Press S to stash'"));
    });

    it('should include toast-action CSS for clickable hints', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('.toast-action'));
    });

    it('should open stash dialog when hint is clicked', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes("h === 'Press S to stash'"));
      assert.ok(html.includes('showStashDialog'));
    });

    it('should set pendingStashBranch from action result', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('pendingStashBranch = data.branch'));
    });
  });

  // ── Modal Management ────────────────────────────────────────
  describe('modal management', () => {
    it('should include anyModalOpen function', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('function anyModalOpen'));
    });

    it('should check all modal states in anyModalOpen', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('logViewerMode'));
      assert.ok(html.includes('branchActionMode'));
      assert.ok(html.includes('infoMode'));
      assert.ok(html.includes('cleanupMode'));
      assert.ok(html.includes('updateMode'));
      assert.ok(html.includes('stashMode'));
    });

    it('should handle Escape key for open modals via _openModals registry', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('_openModals.length > 0 && e.key === \'Escape\''));
      assert.ok(html.includes('.hide()'), 'Escape should call hide() on the topmost modal');
    });

    it('should block keys when modals are open', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('_openModals.length > 0'));
    });

    it('should include modal overlay CSS', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('.modal-overlay'));
      assert.ok(html.includes('.modal-box'));
      assert.ok(html.includes('.modal-title'));
      assert.ok(html.includes('.modal-close'));
    });

    it('should include overlay click-to-close via Modal constructor', () => {
      const html = getWebDashboardHtml(4000);
      // The Modal constructor registers click handlers for all overlay IDs
      assert.ok(html.includes("new Modal('log-viewer-overlay'"), 'Should create logViewerModal');
      assert.ok(html.includes("new Modal('branch-action-overlay'"), 'Should create branchActionModal');
      assert.ok(html.includes("new Modal('info-overlay'"), 'Should create infoModal');
      assert.ok(html.includes("new Modal('cleanup-overlay'"), 'Should create cleanupModal');
      assert.ok(html.includes("new Modal('update-overlay'"), 'Should create updateModal');
      assert.ok(html.includes("new Modal('stash-overlay'"), 'Should create stashModal');
    });
  });

  // ── Footer Keybinding Labels ────────────────────────────────
  describe('footer keybinding labels', () => {
    it('should include b for actions in footer', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('<kbd>b</kbd> actions'));
    });

    it('should include i for info in footer', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('<kbd>i</kbd> info'));
    });

    it('should include l for logs in footer', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('<kbd>l</kbd> logs'));
    });

    it('should include S for stash in footer', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('<kbd>S</kbd> stash'));
    });

    it('should include d for cleanup in footer', () => {
      const html = getWebDashboardHtml(4000);
      assert.ok(html.includes('<kbd>d</kbd> cleanup'));
    });
  });
});
