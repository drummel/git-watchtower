const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const {
  classifyPath,
  getUpdateCommand,
  detectInstallSource,
  _resetForTests,
} = require('../../../src/utils/install-source');

describe('classifyPath', () => {
  it('classifies a homebrew Cellar path as homebrew', () => {
    assert.equal(
      classifyPath('/opt/homebrew/Cellar/git-watchtower/2.1.17/libexec/lib/node_modules/git-watchtower/bin/git-watchtower.js'),
      'homebrew'
    );
  });

  it('classifies a linuxbrew/homebrew path as homebrew', () => {
    assert.equal(
      classifyPath('/home/linuxbrew/.linuxbrew/Cellar/git-watchtower/2.1.17/bin/git-watchtower.js'),
      'homebrew'
    );
  });

  it('classifies an npm-global path as npm', () => {
    assert.equal(
      classifyPath('/usr/local/lib/node_modules/git-watchtower/bin/git-watchtower.js'),
      'npm'
    );
  });

  it('classifies a checkout path as source', () => {
    assert.equal(
      classifyPath('/home/user/projects/git-watchtower/bin/git-watchtower.js'),
      'source'
    );
  });

  it('case-insensitively matches Cellar segment', () => {
    assert.equal(
      classifyPath('/opt/HOMEBREW/cellar/git-watchtower/2.1.17/bin/git-watchtower.js'),
      'homebrew'
    );
  });

  it('does not match Cellar inside an unrelated path component', () => {
    // Substring "cellar" appears inside "wineCellar" but not as its own segment.
    assert.equal(
      classifyPath('/home/user/wineCellar/git-watchtower/bin/git-watchtower.js'),
      'source'
    );
  });
});

describe('getUpdateCommand', () => {
  it('returns brew command for homebrew', () => {
    assert.equal(getUpdateCommand('homebrew'), 'brew update && brew upgrade git-watchtower');
  });

  it('returns npm command for npm', () => {
    assert.equal(getUpdateCommand('npm'), 'npm i -g git-watchtower');
  });

  it('returns git pull command for source', () => {
    assert.equal(getUpdateCommand('source'), 'git pull && npm install');
  });

  it('falls back to npm command for unknown', () => {
    assert.equal(getUpdateCommand('unknown'), 'npm i -g git-watchtower');
  });
});

describe('detectInstallSource', () => {
  let originalRealpath;
  let originalArgv1;

  beforeEach(() => {
    _resetForTests();
    originalRealpath = fs.realpathSync;
    originalArgv1 = process.argv[1];
  });

  afterEach(() => {
    fs.realpathSync = originalRealpath;
    process.argv[1] = originalArgv1;
    _resetForTests();
  });

  it('returns "homebrew" when realpath resolves into a Cellar path', () => {
    process.argv[1] = '/opt/homebrew/bin/git-watchtower';
    fs.realpathSync = () => '/opt/homebrew/Cellar/git-watchtower/2.1.17/libexec/lib/node_modules/git-watchtower/bin/git-watchtower.js';
    assert.equal(detectInstallSource(), 'homebrew');
  });

  it('returns "npm" when realpath resolves into a node_modules path', () => {
    process.argv[1] = '/usr/local/bin/git-watchtower';
    fs.realpathSync = () => '/usr/local/lib/node_modules/git-watchtower/bin/git-watchtower.js';
    assert.equal(detectInstallSource(), 'npm');
  });

  it('returns "source" when realpath resolves into a plain checkout', () => {
    process.argv[1] = '/home/user/git-watchtower/bin/git-watchtower.js';
    fs.realpathSync = () => '/home/user/git-watchtower/bin/git-watchtower.js';
    assert.equal(detectInstallSource(), 'source');
  });

  it('returns "unknown" when realpath throws', () => {
    process.argv[1] = '/some/path';
    fs.realpathSync = () => { throw new Error('ENOENT'); };
    assert.equal(detectInstallSource(), 'unknown');
  });

  it('memoizes the result', () => {
    process.argv[1] = '/usr/local/bin/git-watchtower';
    let calls = 0;
    fs.realpathSync = () => {
      calls++;
      return '/usr/local/lib/node_modules/git-watchtower/bin/git-watchtower.js';
    };
    assert.equal(detectInstallSource(), 'npm');
    assert.equal(detectInstallSource(), 'npm');
    assert.equal(detectInstallSource(), 'npm');
    assert.equal(calls, 1);
  });
});
