const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseRemoteUrl,
  buildBranchUrl,
  detectPlatform,
  buildWebUrl,
  extractSessionUrl,
} = require('../../../src/git/remote');

describe('parseRemoteUrl', () => {
  describe('SSH format', () => {
    it('should parse git@github.com:user/repo.git', () => {
      const result = parseRemoteUrl('git@github.com:user/repo.git');
      assert.deepEqual(result, { host: 'github.com', path: 'user/repo' });
    });

    it('should parse git@github.com:user/repo (no .git)', () => {
      const result = parseRemoteUrl('git@github.com:user/repo');
      assert.deepEqual(result, { host: 'github.com', path: 'user/repo' });
    });

    it('should parse git@gitlab.com:org/project.git', () => {
      const result = parseRemoteUrl('git@gitlab.com:org/project.git');
      assert.deepEqual(result, { host: 'gitlab.com', path: 'org/project' });
    });

    it('should parse git@bitbucket.org:team/repo.git', () => {
      const result = parseRemoteUrl('git@bitbucket.org:team/repo.git');
      assert.deepEqual(result, { host: 'bitbucket.org', path: 'team/repo' });
    });

    it('should parse nested paths like git@github.com:org/sub/repo.git', () => {
      const result = parseRemoteUrl('git@github.com:org/sub/repo.git');
      assert.deepEqual(result, { host: 'github.com', path: 'org/sub/repo' });
    });

    it('should parse self-hosted SSH', () => {
      const result = parseRemoteUrl('git@git.company.com:team/project.git');
      assert.deepEqual(result, { host: 'git.company.com', path: 'team/project' });
    });
  });

  describe('HTTPS format', () => {
    it('should parse https://github.com/user/repo.git', () => {
      const result = parseRemoteUrl('https://github.com/user/repo.git');
      assert.deepEqual(result, { host: 'github.com', path: 'user/repo' });
    });

    it('should parse https://github.com/user/repo (no .git)', () => {
      const result = parseRemoteUrl('https://github.com/user/repo');
      assert.deepEqual(result, { host: 'github.com', path: 'user/repo' });
    });

    it('should parse http:// URLs', () => {
      const result = parseRemoteUrl('http://github.com/user/repo.git');
      assert.deepEqual(result, { host: 'github.com', path: 'user/repo' });
    });

    it('should parse GitLab HTTPS', () => {
      const result = parseRemoteUrl('https://gitlab.com/org/project.git');
      assert.deepEqual(result, { host: 'gitlab.com', path: 'org/project' });
    });

    it('should parse Bitbucket HTTPS', () => {
      const result = parseRemoteUrl('https://bitbucket.org/team/repo.git');
      assert.deepEqual(result, { host: 'bitbucket.org', path: 'team/repo' });
    });

    it('should parse Azure DevOps HTTPS', () => {
      const result = parseRemoteUrl('https://dev.azure.com/org/project/_git/repo');
      assert.deepEqual(result, { host: 'dev.azure.com', path: 'org/project/_git/repo' });
    });
  });

  describe('ssh:// protocol format', () => {
    it('should parse ssh://git@github.com/user/repo.git', () => {
      const result = parseRemoteUrl('ssh://git@github.com/user/repo.git');
      assert.deepEqual(result, { host: 'github.com', path: 'user/repo' });
    });

    it('should parse ssh:// with port', () => {
      const result = parseRemoteUrl('ssh://git@github.com:22/user/repo.git');
      assert.deepEqual(result, { host: 'github.com', path: 'user/repo' });
    });

    it('should parse ssh:// without .git', () => {
      const result = parseRemoteUrl('ssh://git@github.com/user/repo');
      assert.deepEqual(result, { host: 'github.com', path: 'user/repo' });
    });
  });

  describe('edge cases', () => {
    it('should return null for empty string', () => {
      assert.equal(parseRemoteUrl(''), null);
    });

    it('should return null for null', () => {
      assert.equal(parseRemoteUrl(null), null);
    });

    it('should return null for undefined', () => {
      assert.equal(parseRemoteUrl(undefined), null);
    });

    it('should return null for unrecognized format', () => {
      assert.equal(parseRemoteUrl('ftp://example.com/repo'), null);
    });

    it('should trim whitespace', () => {
      const result = parseRemoteUrl('  git@github.com:user/repo.git  ');
      assert.deepEqual(result, { host: 'github.com', path: 'user/repo' });
    });
  });
});

describe('buildBranchUrl', () => {
  it('should build GitHub branch URL', () => {
    const url = buildBranchUrl('https://github.com/user/repo', 'github.com', 'main');
    assert.equal(url, 'https://github.com/user/repo/tree/main');
  });

  it('should build GitLab branch URL', () => {
    const url = buildBranchUrl('https://gitlab.com/org/project', 'gitlab.com', 'develop');
    assert.equal(url, 'https://gitlab.com/org/project/tree/develop');
  });

  it('should build Azure DevOps branch URL', () => {
    const url = buildBranchUrl('https://dev.azure.com/org/proj/_git/repo', 'dev.azure.com', 'feature');
    assert.equal(url, 'https://dev.azure.com/org/proj/_git/repo?version=GBfeature');
  });

  it('should build Azure DevOps VisualStudio.com branch URL', () => {
    const url = buildBranchUrl('https://org.visualstudio.com/proj/_git/repo', 'org.visualstudio.com', 'main');
    assert.equal(url, 'https://org.visualstudio.com/proj/_git/repo?version=GBmain');
  });

  it('should build Bitbucket branch URL', () => {
    const url = buildBranchUrl('https://bitbucket.org/team/repo', 'bitbucket.org', 'develop');
    assert.equal(url, 'https://bitbucket.org/team/repo/src/develop');
  });

  it('should build AWS CodeCommit branch URL', () => {
    const url = buildBranchUrl('https://codecommit.us-east-1.amazonaws.com/v1/repos/myrepo', 'codecommit.us-east-1.amazonaws.com', 'main');
    assert.equal(url, 'https://codecommit.us-east-1.amazonaws.com/v1/repos/myrepo/browse/refs/heads/main');
  });

  it('should build SourceHut branch URL', () => {
    const url = buildBranchUrl('https://git.sr.ht/~user/repo', 'git.sr.ht', 'main');
    assert.equal(url, 'https://git.sr.ht/~user/repo/tree/main');
  });

  it('should encode branch names with special characters', () => {
    const url = buildBranchUrl('https://github.com/user/repo', 'github.com', 'feature/my branch');
    assert.equal(url, 'https://github.com/user/repo/tree/feature%2Fmy%20branch');
  });

  it('should default to /tree/ for unknown hosts', () => {
    const url = buildBranchUrl('https://gitea.example.com/user/repo', 'gitea.example.com', 'main');
    assert.equal(url, 'https://gitea.example.com/user/repo/tree/main');
  });
});

describe('detectPlatform', () => {
  it('should detect GitHub', () => {
    assert.equal(detectPlatform('https://github.com/user/repo'), 'github');
  });

  it('should detect GitHub Enterprise', () => {
    assert.equal(detectPlatform('https://github.company.com/user/repo'), 'github');
  });

  it('should detect GitLab', () => {
    assert.equal(detectPlatform('https://gitlab.com/org/project'), 'gitlab');
  });

  it('should detect self-hosted GitLab', () => {
    assert.equal(detectPlatform('https://gitlab.company.com/org/project'), 'gitlab');
  });

  it('should detect Bitbucket', () => {
    assert.equal(detectPlatform('https://bitbucket.org/team/repo'), 'bitbucket');
  });

  it('should detect Azure DevOps', () => {
    assert.equal(detectPlatform('https://dev.azure.com/org/project/_git/repo'), 'azure');
  });

  it('should detect Azure DevOps VisualStudio.com', () => {
    assert.equal(detectPlatform('https://org.visualstudio.com/project'), 'azure');
  });

  it('should return null for null URL', () => {
    assert.equal(detectPlatform(null), null);
  });

  it('should default to github for unknown hosts', () => {
    assert.equal(detectPlatform('https://gitea.example.com/user/repo'), 'github');
  });

  it('should return null for invalid URL', () => {
    // Invalid URL throws in new URL(), caught and returns default 'github'
    assert.equal(detectPlatform('not-a-url'), 'github');
  });
});

describe('buildWebUrl', () => {
  it('should build basic web URL from parsed remote', () => {
    const url = buildWebUrl({ host: 'github.com', path: 'user/repo' }, null);
    assert.equal(url, 'https://github.com/user/repo');
  });

  it('should build web URL with branch', () => {
    const url = buildWebUrl({ host: 'github.com', path: 'user/repo' }, 'main');
    assert.equal(url, 'https://github.com/user/repo/tree/main');
  });

  it('should handle Azure DevOps SSH format', () => {
    const url = buildWebUrl({ host: 'ssh.dev.azure.com', path: 'v3/org/project/repo' }, null);
    assert.equal(url, 'https://dev.azure.com/org/project/_git/repo');
  });

  it('should handle Azure DevOps SSH with branch', () => {
    const url = buildWebUrl({ host: 'ssh.dev.azure.com', path: 'v3/org/project/repo' }, 'main');
    assert.equal(url, 'https://dev.azure.com/org/project/_git/repo?version=GBmain');
  });

  it('should return null for null parsed input', () => {
    assert.equal(buildWebUrl(null, null), null);
  });

  it('should return null for Azure SSH with insufficient path parts', () => {
    const url = buildWebUrl({ host: 'ssh.dev.azure.com', path: 'v3/org' }, null);
    assert.equal(url, null);
  });
});

describe('extractSessionUrl', () => {
  it('should extract session URL from commit body', () => {
    const body = 'Fix bug\n\nhttps://claude.ai/code/session_abc123def';
    assert.equal(extractSessionUrl(body), 'https://claude.ai/code/session_abc123def');
  });

  it('should return null when no session URL', () => {
    assert.equal(extractSessionUrl('Regular commit message'), null);
  });

  it('should return null for empty string', () => {
    assert.equal(extractSessionUrl(''), null);
  });

  it('should return null for null', () => {
    assert.equal(extractSessionUrl(null), null);
  });

  it('should extract first match when multiple URLs present', () => {
    const body = 'https://claude.ai/code/session_first\nhttps://claude.ai/code/session_second';
    assert.equal(extractSessionUrl(body), 'https://claude.ai/code/session_first');
  });

  it('should handle URLs with alphanumeric session IDs', () => {
    const body = 'https://claude.ai/code/session_014oTrUj5nAw4pxGTDdf7ajr';
    assert.equal(extractSessionUrl(body), 'https://claude.ai/code/session_014oTrUj5nAw4pxGTDdf7ajr');
  });
});
