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
        getExtraState: () => ({ clientCount: 5, customField: 'test' }),
      });
      const state = server.getSerializableState();

      assert.equal(state.clientCount, 5);
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
});
