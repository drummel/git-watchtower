/**
 * Tests for multi-instance coordinator module
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  Coordinator,
  Worker,
  generateProjectId,
  getActiveCoordinator,
  readLock,
  writeLock,
  tryAcquireLock,
  finalizeLock,
  removeLock,
  removeSocket,
  isProcessAlive,
  ensureDir,
  WATCHTOWER_DIR,
  LOCK_FILE,
  SOCKET_PATH,
  MAX_IPC_BUFFER,
} = require('../../../src/server/coordinator');

describe('generateProjectId', () => {
  it('should return a 12-character hex string', () => {
    const id = generateProjectId('/home/user/my-project');
    assert.equal(typeof id, 'string');
    assert.equal(id.length, 12);
    assert.ok(/^[a-f0-9]+$/.test(id));
  });

  it('should be deterministic for the same path', () => {
    const id1 = generateProjectId('/home/user/my-project');
    const id2 = generateProjectId('/home/user/my-project');
    assert.equal(id1, id2);
  });

  it('should produce different IDs for different paths', () => {
    const id1 = generateProjectId('/home/user/project-a');
    const id2 = generateProjectId('/home/user/project-b');
    assert.notEqual(id1, id2);
  });
});

describe('isProcessAlive', () => {
  it('should return true for the current process', () => {
    assert.equal(isProcessAlive(process.pid), true);
  });

  it('should return false for a non-existent PID', () => {
    // Use a very high PID that's unlikely to exist
    assert.equal(isProcessAlive(999999999), false);
  });
});

describe('lock file operations', () => {
  afterEach(() => {
    removeLock();
  });

  it('should write and read a lock file', () => {
    ensureDir();
    writeLock(12345, 4000, '/tmp/test.sock');
    const lock = readLock();
    assert.ok(lock);
    assert.equal(lock.pid, 12345);
    assert.equal(lock.port, 4000);
    assert.equal(lock.socketPath, '/tmp/test.sock');
  });

  it('should return null when no lock exists', () => {
    removeLock();
    assert.equal(readLock(), null);
  });

  it('should remove lock file', () => {
    ensureDir();
    writeLock(12345, 4000, '/tmp/test.sock');
    removeLock();
    assert.equal(readLock(), null);
  });
});

describe('tryAcquireLock / finalizeLock', () => {
  afterEach(() => {
    removeLock();
  });

  it('should acquire when no lock exists', () => {
    removeLock();
    const result = tryAcquireLock(process.pid);
    assert.equal(result.acquired, true);
    // Placeholder lock should exist and name the acquiring pid
    const lock = readLock();
    assert.ok(lock);
    assert.equal(lock.pid, process.pid);
  });

  it('should refuse to acquire when a live owner holds the lock', () => {
    ensureDir();
    // First acquisition succeeds
    const first = tryAcquireLock(process.pid);
    assert.equal(first.acquired, true);
    // Second acquisition from the same process (which is still alive) must fail
    const second = tryAcquireLock(process.pid);
    assert.equal(second.acquired, false);
    assert.ok(second.existing);
    assert.equal(second.existing.pid, process.pid);
  });

  it('should clean up a stale lock and acquire', () => {
    ensureDir();
    // Write a lock for a pid that will never exist
    writeLock(999999999, 4000, '/tmp/stale.sock');
    const result = tryAcquireLock(process.pid);
    assert.equal(result.acquired, true);
    const lock = readLock();
    assert.ok(lock);
    assert.equal(lock.pid, process.pid);
  });

  it('finalizeLock should replace the placeholder with full info', () => {
    removeLock();
    const result = tryAcquireLock(process.pid);
    assert.equal(result.acquired, true);
    // Placeholder has no port
    assert.equal(readLock().port, undefined);

    finalizeLock(process.pid, 4242, '/tmp/final.sock');
    const lock = readLock();
    assert.ok(lock);
    assert.equal(lock.pid, process.pid);
    assert.equal(lock.port, 4242);
    assert.equal(lock.socketPath, '/tmp/final.sock');
  });

  it('should prevent two concurrent acquirers from both succeeding', () => {
    removeLock();
    // Simulate a race by attempting to acquire twice in sequence without
    // releasing. Even in the fastest possible interleaving on a single
    // process, the exclusive-create semantic ensures only one wins.
    const a = tryAcquireLock(process.pid);
    const b = tryAcquireLock(process.pid);
    assert.equal(a.acquired, true);
    assert.equal(b.acquired, false);
  });
});

describe('getActiveCoordinator', () => {
  afterEach(() => {
    removeLock();
  });

  it('should return null when no lock exists', () => {
    removeLock();
    assert.equal(getActiveCoordinator(), null);
  });

  it('should return null and clean up stale lock', () => {
    ensureDir();
    writeLock(999999999, 4000, '/tmp/stale.sock');
    assert.equal(getActiveCoordinator(), null);
    // Lock should be cleaned up
    assert.equal(readLock(), null);
  });

  it('should return lock data for alive process', () => {
    ensureDir();
    writeLock(process.pid, 4000, SOCKET_PATH);
    const result = getActiveCoordinator();
    assert.ok(result);
    assert.equal(result.pid, process.pid);
    assert.equal(result.port, 4000);
  });
});

describe('Coordinator', () => {
  let coord;

  afterEach(async () => {
    if (coord) {
      coord.stop();
      coord = null;
    }
    removeLock();
    removeSocket();
  });

  it('should start and stop cleanly', async () => {
    coord = new Coordinator({ socketPath: SOCKET_PATH + '.test' });
    await coord.start();
    coord.stop();
    coord = null;
  });

  it('should register a local project', async () => {
    coord = new Coordinator({ socketPath: SOCKET_PATH + '.test2' });
    await coord.start();

    coord.registerLocal('abc123', '/home/user/proj', 'proj', { branches: [] });
    const projects = coord.getProjects();
    assert.equal(projects.length, 1);
    assert.equal(projects[0].id, 'abc123');
    assert.equal(projects[0].projectName, 'proj');
  });

  it('should update a local project', async () => {
    coord = new Coordinator({ socketPath: SOCKET_PATH + '.test3' });
    await coord.start();

    coord.registerLocal('abc123', '/home/user/proj', 'proj', { branches: [] });
    coord.updateLocal('abc123', { branches: [{ name: 'main' }] });

    const project = coord.getProject('abc123');
    assert.ok(project);
    assert.equal(project.state.branches.length, 1);
  });

  it('should fire onProjectsChanged callback', async () => {
    coord = new Coordinator({ socketPath: SOCKET_PATH + '.test4' });
    let changeCount = 0;
    coord.onProjectsChanged = () => { changeCount++; };
    await coord.start();

    coord.registerLocal('abc', '/tmp/a', 'a', {});
    assert.equal(changeCount, 1);

    coord.updateLocal('abc', { branches: [] });
    assert.equal(changeCount, 2);
  });
});

describe('Worker', () => {
  let coord;
  let workerClient;

  afterEach(async () => {
    if (workerClient) {
      workerClient.disconnect();
      workerClient = null;
    }
    if (coord) {
      coord.stop();
      coord = null;
    }
    removeSocket();
  });

  it('should connect to coordinator and register', async () => {
    const sockPath = SOCKET_PATH + '.worker1';
    coord = new Coordinator({ socketPath: sockPath });
    await coord.start();

    workerClient = new Worker({
      id: 'wrk1',
      projectPath: '/tmp/proj1',
      projectName: 'proj1',
      socketPath: sockPath,
    });

    await workerClient.connect();
    assert.equal(workerClient.isConnected(), true);

    // Give coordinator time to process registration
    await new Promise(r => setTimeout(r, 50));

    const projects = coord.getProjects();
    assert.equal(projects.length, 1);
    assert.equal(projects[0].id, 'wrk1');
    assert.equal(projects[0].projectName, 'proj1');
  });

  it('should push state updates', async () => {
    const sockPath = SOCKET_PATH + '.worker2';
    coord = new Coordinator({ socketPath: sockPath });
    await coord.start();

    workerClient = new Worker({
      id: 'wrk2',
      projectPath: '/tmp/proj2',
      projectName: 'proj2',
      socketPath: sockPath,
    });

    await workerClient.connect();
    await new Promise(r => setTimeout(r, 50));

    workerClient.pushState({ branches: [{ name: 'feature' }] });
    await new Promise(r => setTimeout(r, 50));

    const project = coord.getProject('wrk2');
    assert.ok(project);
    assert.equal(project.state.branches.length, 1);
    assert.equal(project.state.branches[0].name, 'feature');
  });

  it('should receive commands from coordinator', async () => {
    const sockPath = SOCKET_PATH + '.worker3';
    coord = new Coordinator({ socketPath: sockPath });
    await coord.start();

    workerClient = new Worker({
      id: 'wrk3',
      projectPath: '/tmp/proj3',
      projectName: 'proj3',
      socketPath: sockPath,
    });

    let receivedCmd = null;
    workerClient.onCommand = (action, payload) => {
      receivedCmd = { action, payload };
    };

    await workerClient.connect();
    await new Promise(r => setTimeout(r, 50));

    coord.sendCommand('wrk3', 'switchBranch', { branch: 'main' });
    await new Promise(r => setTimeout(r, 50));

    assert.ok(receivedCmd);
    assert.equal(receivedCmd.action, 'switchBranch');
    assert.equal(receivedCmd.payload.branch, 'main');
  });

  it('should clean up on disconnect', async () => {
    const sockPath = SOCKET_PATH + '.worker4';
    coord = new Coordinator({ socketPath: sockPath });
    await coord.start();

    workerClient = new Worker({
      id: 'wrk4',
      projectPath: '/tmp/proj4',
      projectName: 'proj4',
      socketPath: sockPath,
    });

    await workerClient.connect();
    await new Promise(r => setTimeout(r, 50));
    assert.equal(coord.getProjects().length, 1);

    workerClient.disconnect();
    workerClient = null;
    await new Promise(r => setTimeout(r, 100));
    assert.equal(coord.getProjects().length, 0);
  });

  it('should handle multiple workers', async () => {
    const sockPath = SOCKET_PATH + '.worker5';
    coord = new Coordinator({ socketPath: sockPath });
    await coord.start();

    const w1 = new Worker({ id: 'w1', projectPath: '/tmp/p1', projectName: 'p1', socketPath: sockPath });
    const w2 = new Worker({ id: 'w2', projectPath: '/tmp/p2', projectName: 'p2', socketPath: sockPath });

    await w1.connect();
    await w2.connect();
    await new Promise(r => setTimeout(r, 50));

    assert.equal(coord.getProjects().length, 2);

    w1.disconnect();
    await new Promise(r => setTimeout(r, 100));
    assert.equal(coord.getProjects().length, 1);
    assert.equal(coord.getProject('w2').projectName, 'p2');

    w2.disconnect();
    await new Promise(r => setTimeout(r, 100));
    assert.equal(coord.getProjects().length, 0);
  });
});

describe('Coordinator outbound backpressure', () => {
  let coord;

  afterEach(() => {
    if (coord) { coord.stop(); coord = null; }
    removeSocket();
  });

  function fakeSocket(writableLength) {
    const calls = { write: 0, destroy: 0 };
    return {
      writableLength,
      write() { calls.write++; return true; },
      destroy() { calls.destroy++; },
      _calls: calls,
    };
  }

  it('writes normally when the outbound buffer is below MAX_IPC_BUFFER', () => {
    coord = new Coordinator({ socketPath: SOCKET_PATH + '.bp-ok' });
    const socket = fakeSocket(MAX_IPC_BUFFER - 1);
    coord.workerSockets.set('w-ok', socket);
    coord.projects.set('w-ok', { id: 'w-ok', projectPath: '/p', projectName: 'p', state: {}, lastUpdate: 0 });

    coord.sendCommand('w-ok', 'doThing', { x: 1 });
    assert.equal(socket._calls.write, 1);
    assert.equal(socket._calls.destroy, 0);
  });

  it('destroys the worker socket when its outbound buffer is at MAX_IPC_BUFFER', () => {
    // Pre-fix: socket.write() was called regardless of writableLength,
    // so a wedged worker would let coordinator memory grow on every
    // pushState / command broadcast. Post-fix: we drop the worker;
    // it'll reconnect when it can keep up.
    coord = new Coordinator({ socketPath: SOCKET_PATH + '.bp-full' });
    const socket = fakeSocket(MAX_IPC_BUFFER);
    coord.workerSockets.set('w-stuck', socket);
    coord.projects.set('w-stuck', { id: 'w-stuck', projectPath: '/p', projectName: 'p', state: {}, lastUpdate: 0 });

    coord.sendCommand('w-stuck', 'doThing', { x: 1 });
    assert.equal(socket._calls.write, 0, 'write should be skipped');
    assert.equal(socket._calls.destroy, 1, 'socket should be destroyed');
  });

  it('destroys the worker socket when its outbound buffer is above MAX_IPC_BUFFER', () => {
    coord = new Coordinator({ socketPath: SOCKET_PATH + '.bp-over' });
    const socket = fakeSocket(MAX_IPC_BUFFER + 4096);
    coord.workerSockets.set('w-over', socket);
    coord.projects.set('w-over', { id: 'w-over', projectPath: '/p', projectName: 'p', state: {}, lastUpdate: 0 });

    coord.sendCommand('w-over', 'doThing', {});
    assert.equal(socket._calls.write, 0);
    assert.equal(socket._calls.destroy, 1);
  });
});

describe('Coordinator.sendCommand to local project', () => {
  let coord;

  afterEach(() => {
    if (coord) { coord.stop(); coord = null; }
    removeSocket();
  });

  it('should dispatch to onActionRequest for local project', async () => {
    const sockPath = SOCKET_PATH + '.local1';
    coord = new Coordinator({ socketPath: sockPath });
    let received = null;
    coord.onActionRequest = (id, action, payload) => { received = { id, action, payload }; };
    await coord.start();
    coord.registerLocal('local1', '/tmp/p', 'p', {});

    coord.sendCommand('local1', 'pull', { force: true });
    assert.ok(received);
    assert.equal(received.id, 'local1');
    assert.equal(received.action, 'pull');
    assert.deepEqual(received.payload, { force: true });
  });

  it('should send command to worker socket', async () => {
    const sockPath = SOCKET_PATH + '.cmd1';
    coord = new Coordinator({ socketPath: sockPath });
    await coord.start();

    const w = new Worker({ id: 'wcmd1', projectPath: '/tmp/p', projectName: 'p', socketPath: sockPath });
    let receivedCmd = null;
    w.onCommand = (action, payload) => { receivedCmd = { action, payload }; };
    await w.connect();
    await new Promise(r => setTimeout(r, 50));

    coord.sendCommand('wcmd1', 'fetch', {});
    await new Promise(r => setTimeout(r, 50));

    assert.ok(receivedCmd);
    assert.equal(receivedCmd.action, 'fetch');
    w.disconnect();
  });
});

describe('Worker connection error', () => {
  it('should reject when socket path does not exist', async () => {
    const w = new Worker({
      id: 'fail1',
      projectPath: '/tmp/p',
      projectName: 'p',
      socketPath: '/tmp/nonexistent-watchtower-socket-test.sock',
    });
    await assert.rejects(() => w.connect());
    assert.equal(w.isConnected(), false);
  });
});

describe('Worker registration handshake', () => {
  const net = require('net');
  let fakeServer = null;
  let fakeSockPath = null;

  afterEach(async () => {
    if (fakeServer) {
      await new Promise((r) => fakeServer.close(r));
      fakeServer = null;
    }
    if (fakeSockPath) {
      try { fs.unlinkSync(fakeSockPath); } catch (_) { /* already cleaned */ }
      fakeSockPath = null;
    }
  });

  it('resolves only after receiving the registered ACK', async () => {
    fakeSockPath = SOCKET_PATH + '.ack-order';
    try { fs.unlinkSync(fakeSockPath); } catch (_) { /* not present */ }

    let registerReceived = false;
    let ackSentAt = 0;
    fakeServer = net.createServer((socket) => {
      let buf = '';
      socket.on('data', (d) => {
        buf += d.toString();
        const idx = buf.indexOf('\n');
        if (idx === -1) return;
        const msg = JSON.parse(buf.slice(0, idx));
        buf = buf.slice(idx + 1);
        if (msg.type === 'register') {
          registerReceived = true;
          // Deliberately delay the ACK so we can verify connect() waits.
          setTimeout(() => {
            ackSentAt = Date.now();
            socket.write(JSON.stringify({ type: 'registered', id: msg.id }) + '\n');
          }, 80);
        }
      });
    });
    await new Promise((r) => fakeServer.listen(fakeSockPath, r));

    const w = new Worker({
      id: 'handshake-order',
      projectPath: '/tmp/p',
      projectName: 'p',
      socketPath: fakeSockPath,
    });

    const start = Date.now();
    await w.connect();
    const elapsed = Date.now() - start;

    assert.equal(registerReceived, true);
    assert.ok(ackSentAt > 0, 'ACK should have been sent');
    assert.ok(elapsed >= 70, `connect() resolved too early (${elapsed}ms) — it did not wait for the ACK`);
    w.disconnect();
  });

  it('rejects if the coordinator never sends a registered ACK', async () => {
    fakeSockPath = SOCKET_PATH + '.ack-timeout';
    try { fs.unlinkSync(fakeSockPath); } catch (_) { /* not present */ }

    // Server accepts the connection and reads the register frame but never ACKs.
    fakeServer = net.createServer((socket) => {
      socket.on('data', () => { /* swallow register, send nothing back */ });
    });
    await new Promise((r) => fakeServer.listen(fakeSockPath, r));

    const w = new Worker({
      id: 'handshake-timeout',
      projectPath: '/tmp/p',
      projectName: 'p',
      socketPath: fakeSockPath,
    });

    await assert.rejects(
      () => w.connect(),
      /registration ACK timed out/,
    );
    assert.equal(w.isConnected(), false);
  });

  it('rejects if the coordinator closes the socket before ACK', async () => {
    fakeSockPath = SOCKET_PATH + '.ack-closed';
    try { fs.unlinkSync(fakeSockPath); } catch (_) { /* not present */ }

    fakeServer = net.createServer((socket) => {
      socket.on('data', () => {
        // Simulate coordinator crashing/rejecting before the ACK path runs.
        socket.end();
      });
    });
    await new Promise((r) => fakeServer.listen(fakeSockPath, r));

    const w = new Worker({
      id: 'handshake-closed',
      projectPath: '/tmp/p',
      projectName: 'p',
      socketPath: fakeSockPath,
    });

    await assert.rejects(() => w.connect());
    assert.equal(w.isConnected(), false);
  });
});

describe('Coordinator worker state validation', () => {
  let coord;
  let w;

  afterEach(async () => {
    if (w) { w.disconnect(); w = null; }
    if (coord) { coord.stop(); coord = null; }
    removeSocket();
  });

  it('should reject state updates from wrong worker ID', async () => {
    const sockPath = SOCKET_PATH + '.spoof1';
    coord = new Coordinator({ socketPath: sockPath });
    await coord.start();

    coord.registerLocal('local', '/tmp/l', 'local', { v: 1 });

    w = new Worker({ id: 'wrk_real', projectPath: '/tmp/w', projectName: 'w', socketPath: sockPath });
    await w.connect();
    await new Promise(r => setTimeout(r, 50));
    assert.equal(coord.getProjects().length, 2);

    // Manually send a spoofed state message for a different ID
    w.socket.write(JSON.stringify({ type: 'state', id: 'local', state: { hacked: true } }) + '\\n');
    await new Promise(r => setTimeout(r, 50));

    // The local project state should NOT have been overwritten
    const localProject = coord.getProject('local');
    assert.equal(localProject.state.hacked, undefined);
    assert.equal(localProject.state.v, 1);
  });
});

describe('readLock edge cases', () => {
  afterEach(() => { removeLock(); });

  it('should return null for corrupt JSON', () => {
    ensureDir();
    fs.writeFileSync(LOCK_FILE, 'not-json!!!', 'utf8');
    assert.equal(readLock(), null);
  });

  it('should return null for JSON missing pid', () => {
    ensureDir();
    fs.writeFileSync(LOCK_FILE, JSON.stringify({ port: 4000 }), 'utf8');
    assert.equal(readLock(), null);
  });
});
