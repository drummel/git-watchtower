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
