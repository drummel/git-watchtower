/**
 * Tests for gitignore utilities
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  gitignorePatternToRegex,
  parseGitignoreFile,
  loadGitignorePatterns,
  isGitDirectory,
  shouldIgnoreFile,
} = require('../../../src/utils/gitignore');

describe('gitignorePatternToRegex', () => {
  describe('basic patterns', () => {
    it('should match simple filename', () => {
      const regex = gitignorePatternToRegex('foo.txt');
      assert.ok(regex.test('foo.txt'));
      assert.ok(regex.test('dir/foo.txt'));
      assert.ok(!regex.test('foo.txt.bak'));
    });

    it('should match wildcard patterns', () => {
      const regex = gitignorePatternToRegex('*.log');
      assert.ok(regex.test('error.log'));
      assert.ok(regex.test('dir/debug.log'));
      assert.ok(!regex.test('log'));
      assert.ok(!regex.test('logfile'));
    });

    it('should match single character wildcard', () => {
      const regex = gitignorePatternToRegex('file?.txt');
      assert.ok(regex.test('file1.txt'));
      assert.ok(regex.test('fileA.txt'));
      assert.ok(!regex.test('file12.txt'));
      assert.ok(!regex.test('file.txt'));
    });

    it('should match globstar patterns', () => {
      const regex = gitignorePatternToRegex('**/logs');
      assert.ok(regex.test('logs'));
      assert.ok(regex.test('dir/logs'));
      assert.ok(regex.test('a/b/c/logs'));
    });

    it('should match complex globstar patterns', () => {
      const regex = gitignorePatternToRegex('logs/**/*.log');
      assert.ok(regex.test('logs/debug.log'));
      assert.ok(regex.test('logs/monday/foo.log'));
      // Note: This simpler implementation matches logs/**/*.log anywhere in path
      // Full gitignore spec would anchor patterns with / to the root
      assert.ok(regex.test('build/logs/debug.log'));
    });
  });

  describe('anchored patterns', () => {
    it('should match anchored patterns (starting with /)', () => {
      const regex = gitignorePatternToRegex('/build');
      assert.ok(regex.test('build'));
      assert.ok(regex.test('build/output'));
      assert.ok(!regex.test('src/build'));
    });

    it('should match anchored file patterns', () => {
      const regex = gitignorePatternToRegex('/config.json');
      assert.ok(regex.test('config.json'));
      assert.ok(!regex.test('src/config.json'));
    });
  });

  describe('directory patterns', () => {
    it('should match directory-only patterns (ending with /)', () => {
      const regex = gitignorePatternToRegex('node_modules/');
      assert.ok(regex.test('node_modules'));
      assert.ok(regex.test('node_modules/package'));
      assert.ok(regex.test('src/node_modules'));
    });

    it('should match nested directory patterns', () => {
      const regex = gitignorePatternToRegex('dist/');
      assert.ok(regex.test('dist'));
      assert.ok(regex.test('dist/bundle.js'));
      assert.ok(regex.test('packages/app/dist'));
    });
  });

  describe('special characters', () => {
    it('should escape regex special characters', () => {
      const regex = gitignorePatternToRegex('file[1].txt');
      assert.ok(regex.test('file[1].txt'));
      assert.ok(!regex.test('file1.txt'));
    });

    it('should handle dots in patterns', () => {
      const regex = gitignorePatternToRegex('.env');
      assert.ok(regex.test('.env'));
      assert.ok(regex.test('config/.env'));
      assert.ok(!regex.test('env'));
    });
  });

  describe('negation patterns', () => {
    it('should return null for negation patterns', () => {
      const regex = gitignorePatternToRegex('!important.txt');
      assert.strictEqual(regex, null);
    });
  });

  describe('common gitignore patterns', () => {
    it('should match node_modules', () => {
      const regex = gitignorePatternToRegex('node_modules/');
      assert.ok(regex.test('node_modules'));
      assert.ok(regex.test('node_modules/lodash'));
    });

    it('should match .env files', () => {
      const regex = gitignorePatternToRegex('.env*');
      assert.ok(regex.test('.env'));
      assert.ok(regex.test('.env.local'));
      assert.ok(regex.test('.env.production'));
    });

    it('should match coverage directories', () => {
      const regex = gitignorePatternToRegex('coverage/');
      assert.ok(regex.test('coverage'));
      assert.ok(regex.test('coverage/lcov.info'));
    });
  });
});

describe('isGitDirectory', () => {
  it('should return true for .git', () => {
    assert.strictEqual(isGitDirectory('.git'), true);
  });

  it('should return true for .git/ paths', () => {
    assert.strictEqual(isGitDirectory('.git/config'), true);
    assert.strictEqual(isGitDirectory('.git/objects/pack'), true);
  });

  it('should return true for .git\\ paths (Windows)', () => {
    assert.strictEqual(isGitDirectory('.git\\config'), true);
    assert.strictEqual(isGitDirectory('.git\\objects\\pack'), true);
  });

  it('should return true for nested .git paths', () => {
    assert.strictEqual(isGitDirectory('submodule/.git'), true);
    assert.strictEqual(isGitDirectory('submodule/.git/config'), true);
  });

  it('should return false for non-.git paths', () => {
    assert.strictEqual(isGitDirectory('src/index.js'), false);
    assert.strictEqual(isGitDirectory('.github/workflows'), false);
    assert.strictEqual(isGitDirectory('.gitignore'), false);
    assert.strictEqual(isGitDirectory('.gitattributes'), false);
  });

  it('should return false for files with .git in name', () => {
    assert.strictEqual(isGitDirectory('my.github.io'), false);
    assert.strictEqual(isGitDirectory('.gitkeep'), false);
  });
});

describe('shouldIgnoreFile', () => {
  it('should ignore .git directory', () => {
    assert.strictEqual(shouldIgnoreFile('.git', []), true);
    assert.strictEqual(shouldIgnoreFile('.git/config', []), true);
    assert.strictEqual(shouldIgnoreFile('submodule/.git', []), true);
  });

  it('should not ignore regular files without patterns', () => {
    assert.strictEqual(shouldIgnoreFile('src/index.js', []), false);
    assert.strictEqual(shouldIgnoreFile('package.json', []), false);
  });

  it('should ignore files matching patterns', () => {
    const patterns = [gitignorePatternToRegex('*.log')];
    assert.strictEqual(shouldIgnoreFile('error.log', patterns), true);
    assert.strictEqual(shouldIgnoreFile('debug.log', patterns), true);
    assert.strictEqual(shouldIgnoreFile('src/app.log', patterns), true);
  });

  it('should not ignore files not matching patterns', () => {
    const patterns = [gitignorePatternToRegex('*.log')];
    assert.strictEqual(shouldIgnoreFile('index.js', patterns), false);
    assert.strictEqual(shouldIgnoreFile('README.md', patterns), false);
  });

  it('should handle multiple patterns', () => {
    const patterns = [
      gitignorePatternToRegex('*.log'),
      gitignorePatternToRegex('node_modules/'),
      gitignorePatternToRegex('.env*'),
    ];
    assert.strictEqual(shouldIgnoreFile('error.log', patterns), true);
    assert.strictEqual(shouldIgnoreFile('node_modules/lodash', patterns), true);
    assert.strictEqual(shouldIgnoreFile('.env.local', patterns), true);
    assert.strictEqual(shouldIgnoreFile('src/app.js', patterns), false);
  });

  it('should handle Windows path separators', () => {
    const patterns = [gitignorePatternToRegex('dist/')];
    assert.strictEqual(shouldIgnoreFile('dist\\bundle.js', patterns), true);
  });
});

describe('parseGitignoreFile', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitignore-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return empty array for non-existent file', () => {
    const patterns = parseGitignoreFile('/nonexistent/.gitignore');
    assert.deepStrictEqual(patterns, []);
  });

  it('should parse gitignore file', () => {
    const gitignorePath = path.join(tempDir, '.gitignore');
    fs.writeFileSync(gitignorePath, '*.log\nnode_modules/\n.env\n');

    const patterns = parseGitignoreFile(gitignorePath);
    assert.strictEqual(patterns.length, 3);
  });

  it('should skip empty lines and comments', () => {
    const gitignorePath = path.join(tempDir, '.gitignore');
    fs.writeFileSync(gitignorePath, '# Comment\n\n*.log\n\n# Another comment\n.env\n');

    const patterns = parseGitignoreFile(gitignorePath);
    assert.strictEqual(patterns.length, 2);
  });

  it('should skip negation patterns', () => {
    const gitignorePath = path.join(tempDir, '.gitignore');
    fs.writeFileSync(gitignorePath, '*.log\n!important.log\n.env\n');

    const patterns = parseGitignoreFile(gitignorePath);
    assert.strictEqual(patterns.length, 2);
  });

  it('should handle whitespace in patterns', () => {
    const gitignorePath = path.join(tempDir, '.gitignore');
    fs.writeFileSync(gitignorePath, '  *.log  \n  node_modules/  \n');

    const patterns = parseGitignoreFile(gitignorePath);
    assert.strictEqual(patterns.length, 2);
  });
});

describe('loadGitignorePatterns', () => {
  let tempDir1;
  let tempDir2;

  beforeEach(() => {
    tempDir1 = fs.mkdtempSync(path.join(os.tmpdir(), 'gitignore-test1-'));
    tempDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'gitignore-test2-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir1, { recursive: true, force: true });
    fs.rmSync(tempDir2, { recursive: true, force: true });
  });

  it('should return empty array if no gitignore found', () => {
    const patterns = loadGitignorePatterns([tempDir1, tempDir2]);
    assert.deepStrictEqual(patterns, []);
  });

  it('should load from first directory with gitignore', () => {
    const gitignorePath = path.join(tempDir1, '.gitignore');
    fs.writeFileSync(gitignorePath, '*.log\n');

    const patterns = loadGitignorePatterns([tempDir1, tempDir2]);
    assert.strictEqual(patterns.length, 1);
  });

  it('should prefer first directory over second', () => {
    fs.writeFileSync(path.join(tempDir1, '.gitignore'), '*.log\n');
    fs.writeFileSync(path.join(tempDir2, '.gitignore'), '*.txt\n*.md\n*.json\n');

    const patterns = loadGitignorePatterns([tempDir1, tempDir2]);
    assert.strictEqual(patterns.length, 1);
  });

  it('should fall back to second directory if first has no gitignore', () => {
    fs.writeFileSync(path.join(tempDir2, '.gitignore'), '*.log\n*.txt\n');

    const patterns = loadGitignorePatterns([tempDir1, tempDir2]);
    assert.strictEqual(patterns.length, 2);
  });
});

describe('integration: full ignore workflow', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitignore-integration-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should correctly filter files using loaded patterns', () => {
    const gitignorePath = path.join(tempDir, '.gitignore');
    fs.writeFileSync(gitignorePath, `
# Dependencies
node_modules/

# Build output
dist/
build/

# Logs
*.log

# Environment
.env*

# IDE
.idea/
.vscode/
`);

    const patterns = loadGitignorePatterns([tempDir]);

    // Should be ignored
    assert.strictEqual(shouldIgnoreFile('.git', patterns), true);
    assert.strictEqual(shouldIgnoreFile('.git/config', patterns), true);
    assert.strictEqual(shouldIgnoreFile('node_modules/lodash/index.js', patterns), true);
    assert.strictEqual(shouldIgnoreFile('dist/bundle.js', patterns), true);
    assert.strictEqual(shouldIgnoreFile('error.log', patterns), true);
    assert.strictEqual(shouldIgnoreFile('.env', patterns), true);
    assert.strictEqual(shouldIgnoreFile('.env.local', patterns), true);
    assert.strictEqual(shouldIgnoreFile('.idea/workspace.xml', patterns), true);

    // Should NOT be ignored
    assert.strictEqual(shouldIgnoreFile('src/index.js', patterns), false);
    assert.strictEqual(shouldIgnoreFile('package.json', patterns), false);
    assert.strictEqual(shouldIgnoreFile('README.md', patterns), false);
    assert.strictEqual(shouldIgnoreFile('.gitignore', patterns), false);
  });
});
