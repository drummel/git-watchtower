#!/usr/bin/env node

/**
 * Git Watchtower - Branch Monitor & Dev Server (Zero Dependencies)
 *
 * Features:
 * - Full terminal UI with branch dashboard
 * - Shows active branches with 7-day activity sparklines
 * - Arrow key navigation to switch between branches
 * - Search/filter branches by name
 * - Branch preview pane showing recent commits and changed files
 * - Session history with undo support
 * - Visual flash alerts when updates arrive
 * - Audio notifications (toggle with 's')
 * - Auto-pull and live reload via Server-Sent Events (SSE)
 * - Edge case handling: merge conflicts, dirty working dir, detached HEAD
 * - Network failure detection with offline indicator
 * - Graceful shutdown handling
 * - Support for custom dev server commands (Next.js, Vite, etc.)
 * - Casino Mode: Vegas-style feedback with slot reels, marquee lights,
 *   and win celebrations based on diff size (toggle with 'c' or --casino)
 *
 * Usage:
 *   git-watchtower              # Run with config or defaults
 *   git-watchtower --port 8080  # Override port
 *   git-watchtower --no-server  # Branch monitoring only
 *   git-watchtower --casino     # Enable casino mode
 *   git-watchtower --init       # Run configuration wizard
 *   git-watchtower --version    # Show version
 *
 * No npm install required - uses only Node.js built-in modules.
 *
 * Keyboard Controls:
 *   ↑/k     - Move selection up
 *   ↓/j     - Move selection down
 *   Enter   - Switch to selected branch
 *   /       - Search/filter branches
 *   v       - Preview selected branch (commits & files)
 *   h       - Show switch history
 *   u       - Undo last branch switch
 *   p       - Force pull current branch
 *   r       - Force reload all browsers (static mode)
 *   R       - Restart dev server (command mode)
 *   l       - View server logs (command mode)
 *   o       - Open live server in browser
 *   b       - Branch actions (open on GitHub, Claude session, create/approve/merge PR, CI)
 *   f       - Fetch all branches + refresh sparklines
 *   s       - Toggle sound notifications
 *   c       - Toggle casino mode (Vegas-style feedback)
 *   i       - Show server info (port, connections)
 *   W       - Toggle web dashboard (starts server + opens browser)
 *   1-0     - Set visible branch count (1-10)
 *   +/-     - Increase/decrease visible branches
 *   q/Esc   - Quit (Esc also clears search)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile, execSync, spawn } = require('child_process');
const readline = require('readline');

// Casino mode - Vegas-style feedback effects
const casino = require('../src/casino');
const casinoSounds = require('../src/casino/sounds');

// Gitignore utilities for file watcher
const { loadGitignorePatterns, shouldIgnoreFile } = require('../src/utils/gitignore');

// Telemetry (opt-in analytics via PostHog HTTP API — zero dependencies)
const telemetry = require('../src/telemetry');

// Extracted modules
const { formatTimeAgo } = require('../src/utils/time');
const { openInBrowser: openUrl } = require('../src/utils/browser');
const { playSound: playSoundEffect } = require('../src/utils/sound');
const { parseArgs: parseCliArgs, applyCliArgsToConfig: mergeCliArgs, getHelpText, PACKAGE_VERSION } = require('../src/cli/args');
const { checkForUpdate, startPeriodicUpdateCheck } = require('../src/utils/version-check');
const { parseRemoteUrl, buildBranchUrl, detectPlatform, buildWebUrl, extractSessionUrl } = require('../src/git/remote');
const { parseGitHubPr, parseGitLabMr, parseGitHubPrList, parseGitLabMrList, isBaseBranch } = require('../src/git/pr');

// ============================================================================
// Security & Validation (imported from src/git/branch.js and src/git/commands.js)
// ============================================================================
const { isValidBranchName, sanitizeBranchName, getGoneBranches, deleteGoneBranches, getCurrentBranch: getCurrentBranchRaw, getAllBranches: getAllBranchesRaw } = require('../src/git/branch');
const { pruneStaleEntries } = require('../src/polling/engine');
const { isGitAvailable: checkGitAvailable, execGit, execGitSilent, getDiffStats: getDiffStatsSafe, getAheadBehind, getDiffShortstat, hasUncommittedChanges: checkUncommittedChanges } = require('../src/git/commands');

// Session stats (always-on, non-casino stats)
const sessionStats = require('../src/stats/session');

// ============================================================================
// Configuration (imports from src/config/, inline wizard kept here)
// ============================================================================
const { getDefaultConfig, migrateConfig } = require('../src/config/schema');
const { getConfigPath, loadConfig: loadConfigFile, saveConfig: saveConfigFile, CONFIG_FILE_NAME } = require('../src/config/loader');

// Centralized state store
const { Store } = require('../src/state/store');
const store = new Store();

// Web dashboard server
const { WebDashboardServer } = require('../src/server/web');
const { Coordinator, Worker, generateProjectId, getActiveCoordinator, writeLock, removeLock } = require('../src/server/coordinator');

const PROJECT_ROOT = process.cwd();

function loadConfig() {
  return loadConfigFile(PROJECT_ROOT);
}

function saveConfig(config) {
  saveConfigFile(config, PROJECT_ROOT);
}

async function promptUser(question, defaultValue = '') {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const defaultHint = defaultValue !== '' ? ` (${defaultValue})` : '';
    rl.question(`${question}${defaultHint}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

async function promptYesNo(question, defaultValue = true) {
  const defaultHint = defaultValue ? 'Y/n' : 'y/N';
  const answer = await promptUser(`${question} [${defaultHint}]`, '');
  if (answer === '') return defaultValue;
  return answer.toLowerCase().startsWith('y');
}

async function runConfigurationWizard() {
  console.log('\n┌─────────────────────────────────────────────────────────┐');
  console.log('│  🏰 Git Watchtower Configuration Wizard                 │');
  console.log('├─────────────────────────────────────────────────────────┤');
  console.log('│  No configuration file found in this directory.        │');
  console.log('│  Let\'s set up Git Watchtower for this project.         │');
  console.log('└─────────────────────────────────────────────────────────┘\n');

  const config = getDefaultConfig();

  // Ask about server mode
  console.log('Server Mode Options:');
  console.log('  1. Static  - Serve static files with live reload (HTML/CSS/JS)');
  console.log('  2. Command - Run your own dev server (Next.js, Vite, etc.)');
  console.log('  3. None    - Branch monitoring only (no server)\n');

  const modeAnswer = await promptUser('Server mode (1/2/3)', '1');
  if (modeAnswer === '2' || modeAnswer.toLowerCase() === 'command') {
    config.server.mode = 'command';
  } else if (modeAnswer === '3' || modeAnswer.toLowerCase() === 'none') {
    config.server.mode = 'none';
  } else {
    config.server.mode = 'static';
  }

  if (config.server.mode === 'static') {
    // Ask about port
    const portAnswer = await promptUser('Server port', '3000');
    const port = parseInt(portAnswer, 10);
    if (!isNaN(port) && port > 0 && port < 65536) {
      config.server.port = port;
    }

    // Ask about static directory
    config.server.staticDir = await promptUser('Static files directory', 'public');
  } else if (config.server.mode === 'command') {
    // Ask about command
    console.log('\nExamples: npm run dev, next dev, nuxt dev, vite');
    config.server.command = await promptUser('Dev server command', 'npm run dev');

    // Ask about port (for display)
    const portAnswer = await promptUser('Server port (for display)', '3000');
    const port = parseInt(portAnswer, 10);
    if (!isNaN(port) && port > 0 && port < 65536) {
      config.server.port = port;
    }

    // Ask about restart on switch
    config.server.restartOnSwitch = await promptYesNo('Restart server when switching branches?', true);
  }

  // Ask about auto-pull
  config.autoPull = await promptYesNo('Auto-pull when current branch has updates?', true);

  // Ask about git polling interval
  const pollAnswer = await promptUser('Git polling interval in seconds', '5');
  const pollSec = parseFloat(pollAnswer);
  if (!isNaN(pollSec) && pollSec >= 1) {
    config.gitPollInterval = Math.round(pollSec * 1000);
  }

  // Ask about sound notifications
  config.soundEnabled = await promptYesNo('Enable sound notifications for updates?', true);

  // Ask about visible branches
  const branchesAnswer = await promptUser('Default number of visible branches', '7');
  const branches = parseInt(branchesAnswer, 10);
  if (!isNaN(branches) && branches >= 1 && branches <= 20) {
    config.visibleBranches = branches;
  }

  // Save configuration
  saveConfig(config);
  telemetry.capture('config_wizard_completed', { server_mode: config.server.mode });

  console.log('\n✓ Configuration saved to ' + CONFIG_FILE_NAME);
  console.log('  You can edit this file manually or delete it to reconfigure.\n');

  // Ask user how to handle the new config file in git
  await promptConfigFileHandling();

  return config;
}

/**
 * After creating .watchtowerrc.json, ask the user how to handle it in git.
 * This prevents the new config file from dirtying the working directory
 * and blocking branch switching.
 */
async function promptConfigFileHandling() {
  // Check if we're in a git repo
  try {
    execSync('git rev-parse --git-dir', { cwd: PROJECT_ROOT, stdio: 'pipe' });
  } catch {
    return; // Not a git repo, nothing to do
  }

  console.log('How should the config file be handled in git?\n');
  console.log('  1. Keep local (ignore via .git/info/exclude) [recommended]');
  console.log('  2. Track in repo (commit ' + CONFIG_FILE_NAME + ')');
  console.log('  3. Add to .gitignore (you\'ll need to commit .gitignore)');
  console.log('  4. Do nothing (handle manually)\n');

  const answer = await promptUser('Choice', '1');

  switch (answer) {
    case '1':
      handleConfigExcludeLocal();
      break;
    case '2':
      await handleConfigCommit();
      break;
    case '3':
      handleConfigGitignore();
      break;
    case '4':
    default:
      console.log('  Skipped. Note: the config file may block branch switching until handled.\n');
      break;
  }
}

/**
 * Add .watchtowerrc.json to .git/info/exclude (local-only gitignore)
 */
function handleConfigExcludeLocal() {
  try {
    const gitDir = execSync('git rev-parse --git-dir', { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();
    const excludePath = path.join(PROJECT_ROOT, gitDir, 'info', 'exclude');

    // Ensure the info directory exists
    const infoDir = path.dirname(excludePath);
    if (!fs.existsSync(infoDir)) {
      fs.mkdirSync(infoDir, { recursive: true });
    }

    // Check if already excluded
    if (fs.existsSync(excludePath)) {
      const content = fs.readFileSync(excludePath, 'utf8');
      if (content.includes(CONFIG_FILE_NAME)) {
        console.log('  Already excluded in .git/info/exclude.\n');
        return;
      }
    }

    // Append the exclusion
    const line = '\n# Git Watchtower config (local)\n' + CONFIG_FILE_NAME + '\n';
    fs.appendFileSync(excludePath, line, 'utf8');
    console.log('  ✓ Added ' + CONFIG_FILE_NAME + ' to .git/info/exclude');
    console.log('  Config file will be ignored locally without affecting the repo.\n');
  } catch (e) {
    console.error('  Warning: Could not update .git/info/exclude: ' + e.message);
    console.log('  You may need to handle the config file manually.\n');
  }
}

/**
 * Stage and commit .watchtowerrc.json
 */
async function handleConfigCommit() {
  try {
    execSync(`git add "${CONFIG_FILE_NAME}"`, { cwd: PROJECT_ROOT, stdio: 'pipe' });
    execSync(`git commit -m "Add git-watchtower configuration"`, { cwd: PROJECT_ROOT, stdio: 'pipe' });
    console.log('  ✓ Committed ' + CONFIG_FILE_NAME + ' to the repository.\n');
  } catch (e) {
    console.error('  Warning: Could not commit config file: ' + (e.message || 'unknown error'));
    console.log('  You may need to commit it manually: git add ' + CONFIG_FILE_NAME + ' && git commit\n');
  }
}

/**
 * Add .watchtowerrc.json to .gitignore
 */
function handleConfigGitignore() {
  try {
    const gitignorePath = path.join(PROJECT_ROOT, '.gitignore');

    // Check if already in .gitignore
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf8');
      if (content.includes(CONFIG_FILE_NAME)) {
        console.log('  Already listed in .gitignore.\n');
        return;
      }
    }

    const line = '\n# Git Watchtower config\n' + CONFIG_FILE_NAME + '\n';
    fs.appendFileSync(gitignorePath, line, 'utf8');
    console.log('  ✓ Added ' + CONFIG_FILE_NAME + ' to .gitignore');
    console.log('  Note: You\'ll need to commit the .gitignore change.\n');
  } catch (e) {
    console.error('  Warning: Could not update .gitignore: ' + e.message);
    console.log('  You may need to add it manually.\n');
  }
}

async function ensureConfig(cliArgs) {
  // Check if --init flag was passed (force reconfiguration)
  if (cliArgs.init) {
    const config = await runConfigurationWizard();
    return mergeCliArgs(config, cliArgs);
  }

  // Load existing config
  let config = loadConfig();

  // If no config exists, run the wizard or use defaults
  if (!config) {
    // Check if running non-interactively (no TTY)
    if (!process.stdin.isTTY) {
      console.log('No configuration file found. Using defaults.');
      console.log('Run interactively or create .watchtowerrc.json manually.\n');
      config = getDefaultConfig();
    } else {
      config = await runConfigurationWizard();
    }
  } else {
    // Migrate old config format if needed
    config = migrateConfig(config);
  }

  // Merge CLI args over config (CLI takes precedence)
  return mergeCliArgs(config, cliArgs);
}

// mergeCliArgs imported from src/cli/args.js as mergeCliArgs

// CLI argument parsing delegated to src/cli/args.js
const cliArgs = parseCliArgs(process.argv.slice(2), {
  onVersion: (v) => { console.log(`git-watchtower v${v}`); process.exit(0); },
  onHelp: (v) => { console.log(getHelpText(v)); process.exit(0); },
});

if (cliArgs.errors.length > 0) {
  for (const err of cliArgs.errors) {
    console.error(`Error: ${err}`);
  }
  console.error('\nRun git-watchtower --help for usage information.');
  process.exit(1);
}

// Configuration - these will be set after config is loaded
let SERVER_MODE = 'static';      // 'static' | 'command' | 'none'
let NO_SERVER = false;            // Derived from SERVER_MODE === 'none'
let SERVER_COMMAND = '';          // Command for command mode
let RESTART_ON_SWITCH = true;     // Restart server on branch switch
let PORT = 3000;
let GIT_POLL_INTERVAL = 5000;
let STATIC_DIR = path.join(PROJECT_ROOT, 'public');
let REMOTE_NAME = 'origin';
let AUTO_PULL = true;
const MAX_LOG_ENTRIES = 10;
const MAX_SERVER_LOG_LINES = 500;

// Telemetry session tracking
let branchSwitchCount = 0;
let sessionStartTime = null;

// Server process management (for command mode)
let serverProcess = null;

// Web dashboard
let WEB_ENABLED = false;
let WEB_PORT = 4000;
let webDashboard = null;
let coordinator = null;
let worker = null;
let projectId = null;
let webStateInterval = null;

function applyConfig(config) {
  // Server settings
  SERVER_MODE = config.server?.mode || 'static';
  NO_SERVER = SERVER_MODE === 'none';
  SERVER_COMMAND = config.server?.command || '';
  RESTART_ON_SWITCH = config.server?.restartOnSwitch !== false;
  PORT = config.server?.port || parseInt(process.env.PORT, 10) || 3000;
  STATIC_DIR = path.join(PROJECT_ROOT, config.server?.staticDir || 'public');

  // Git settings
  REMOTE_NAME = config.remoteName || 'origin';
  AUTO_PULL = config.autoPull !== false;
  GIT_POLL_INTERVAL = config.gitPollInterval || parseInt(process.env.GIT_POLL_INTERVAL, 10) || 5000;

  // UI settings via store
  const casinoEnabled = config.casinoMode === true;
  store.setState({
    visibleBranchCount: config.visibleBranches || 7,
    soundEnabled: config.soundEnabled !== false,
    casinoModeEnabled: casinoEnabled,
    serverMode: SERVER_MODE,
    noServer: NO_SERVER,
    port: PORT,
    maxLogEntries: MAX_LOG_ENTRIES,
    projectName: path.basename(PROJECT_ROOT),
    adaptivePollInterval: GIT_POLL_INTERVAL,
  });

  // Casino mode
  if (casinoEnabled) {
    casino.enable();
  }

  // Web dashboard
  if (config.web) {
    WEB_ENABLED = config.web.enabled === true;
    WEB_PORT = config.web.port || 4000;
  }
}

// Server log management
function addServerLog(line, isError = false) {
  const entry = { timestamp: new Date().toLocaleTimeString(), line, isError };
  const serverLogBuffer = [...store.get('serverLogBuffer'), entry].slice(-MAX_SERVER_LOG_LINES);
  store.setState({ serverLogBuffer });
}

function clearServerLog() {
  store.setState({ serverLogBuffer: [] });
}

// openInBrowser imported from src/utils/browser.js
function openInBrowser(url) {
  openUrl(url, (error) => {
    addLog(`Failed to open browser: ${error.message}`, 'error');
  });
}

// parseRemoteUrl, buildBranchUrl, detectPlatform, buildWebUrl, extractSessionUrl
// imported from src/git/remote.js

async function getRemoteWebUrl(branchName) {
  try {
    const { stdout } = await execGit(['remote', 'get-url', REMOTE_NAME], { cwd: PROJECT_ROOT });
    const parsed = parseRemoteUrl(stdout);
    return buildWebUrl(parsed, branchName);
  } catch (e) {
    return null;
  }
}

// Extract Claude Code session URL from the most recent commit on a branch
async function getSessionUrl(branchName) {
  // Try remote branch first, fall back to local
  const result = await execGitSilent(
    ['log', `${REMOTE_NAME}/${branchName}`, '-1', '--format=%B'],
    { cwd: PROJECT_ROOT }
  ) || await execGitSilent(
    ['log', branchName, '-1', '--format=%B'],
    { cwd: PROJECT_ROOT }
  );
  return result ? extractSessionUrl(result.stdout) : null;
}

// Check if a CLI tool is available
async function hasCommand(cmd) {
  try {
    await execCli('which', [cmd]);
    return true;
  } catch (e) {
    return false;
  }
}

// detectPlatform imported from src/git/remote.js

// Get PR info for a branch using gh or glab CLI (parsing delegated to src/git/pr.js)
async function getPrInfo(branchName, platform, hasGh, hasGlab) {
  if (platform === 'github' && hasGh) {
    try {
      const { stdout } = await execCli('gh', [
        'pr', 'list', '--head', branchName, '--state', 'all',
        '--json', 'number,title,state,reviewDecision,statusCheckRollup', '--limit', '1',
      ]);
      return parseGitHubPr(JSON.parse(stdout));
    } catch (e) { /* gh not authed or other error */ }
  }
  if (platform === 'gitlab' && hasGlab) {
    try {
      const { stdout } = await execCli('glab', [
        'mr', 'list', `--source-branch=${branchName}`, '--state', 'all', '--output', 'json',
      ]);
      return parseGitLabMr(JSON.parse(stdout));
    } catch (e) { /* glab not authed or other error */ }
  }
  return null;
}

// Check if gh/glab CLI is authenticated
async function checkCliAuth(cmd) {
  try {
    await execCli(cmd, ['auth', 'status']);
    return true;
  } catch (e) {
    return false;
  }
}

// Bulk-fetch PR statuses for all branches (parsing delegated to src/git/pr.js)
async function fetchAllPrStatuses() {
  if (!cachedEnv) return null;
  const { platform, hasGh, ghAuthed, hasGlab, glabAuthed } = cachedEnv;

  if (platform === 'github' && hasGh && ghAuthed) {
    try {
      const { stdout } = await execCli('gh', [
        'pr', 'list', '--state', 'all',
        '--json', 'headRefName,number,title,state', '--limit', '200',
      ]);
      return parseGitHubPrList(JSON.parse(stdout));
    } catch (e) { /* gh error */ }
  }

  if (platform === 'gitlab' && hasGlab && glabAuthed) {
    try {
      const { stdout } = await execCli('glab', [
        'mr', 'list', '--state', 'all', '--output', 'json',
      ]);
      return parseGitLabMrList(JSON.parse(stdout));
    } catch (e) { /* glab error */ }
  }

  return null;
}

// One-time environment detection (called at startup)
async function initActionCache() {
  const [hasGh, hasGlab, webUrlBase] = await Promise.all([
    hasCommand('gh'),
    hasCommand('glab'),
    getRemoteWebUrl(null), // base URL without branch
  ]);

  let ghAuthed = false;
  let glabAuthed = false;
  if (hasGh) ghAuthed = await checkCliAuth('gh');
  if (hasGlab) glabAuthed = await checkCliAuth('glab');

  const platform = detectPlatform(webUrlBase);

  cachedEnv = { hasGh, hasGlab, ghAuthed, glabAuthed, webUrlBase, platform };
}

// Phase 1: Instant local data for the modal (no network calls)
function gatherLocalActionData(branch) {
  const isClaudeBranch = /^claude\//.test(branch.name);
  const env = cachedEnv || { hasGh: false, hasGlab: false, ghAuthed: false, glabAuthed: false, webUrlBase: null, platform: 'github' };

  // Build branch-specific web URL from cached base
  let webUrl = null;
  if (env.webUrlBase) {
    try {
      const host = new URL(env.webUrlBase).hostname;
      webUrl = buildBranchUrl(env.webUrlBase, host, branch.name);
    } catch (e) { /* invalid URL, will be resolved in async phase */ }
  }

  // Check PR cache (instant if we've seen this branch+commit before)
  const cached = prInfoCache.get(branch.name);
  const prInfo = (cached && cached.commit === branch.commit) ? cached.prInfo : null;
  const prLoaded = !!(cached && cached.commit === branch.commit);

  return {
    branch, sessionUrl: null, prInfo, webUrl, isClaudeBranch,
    ...env,
    prLoaded, // false means PR info still needs to be fetched
  };
}

// Phase 2: Async data that requires network/git calls
async function loadAsyncActionData(branch, currentData) {
  const isClaudeBranch = currentData.isClaudeBranch;

  // Ensure env cache is populated (might have been in flight during Phase 1)
  if (!cachedEnv) {
    await initActionCache();
  }
  const env = cachedEnv || {};

  // Resolve webUrl if it wasn't available synchronously
  let webUrl = currentData.webUrl;
  if (!webUrl && env.webUrlBase) {
    try {
      const host = new URL(env.webUrlBase).hostname;
      webUrl = buildBranchUrl(env.webUrlBase, host, branch.name);
    } catch (e) { /* ignore */ }
  }

  // Fetch session URL (local git, fast but async)
  const sessionUrl = isClaudeBranch ? await getSessionUrl(branch.name) : null;

  // Fetch PR info if not cached
  let prInfo = currentData.prInfo;
  let prLoaded = currentData.prLoaded;
  if (!prLoaded) {
    const canQueryPr = (env.platform === 'github' && env.hasGh && env.ghAuthed) ||
                       (env.platform === 'gitlab' && env.hasGlab && env.glabAuthed);
    prInfo = canQueryPr ? await getPrInfo(branch.name, env.platform, env.hasGh && env.ghAuthed, env.hasGlab && env.glabAuthed) : null;
    // Cache the result, keyed by branch commit
    prInfoCache.set(branch.name, { commit: branch.commit, prInfo });
    prLoaded = true;
  }

  return { ...currentData, ...env, webUrl, sessionUrl, prInfo, prLoaded };
}

// Command mode server management
function startServerProcess() {
  if (SERVER_MODE !== 'command' || !SERVER_COMMAND) return;
  if (serverProcess) {
    stopServerProcess();
  }

  clearServerLog();
  store.setState({ serverCrashed: false, serverRunning: false });

  addLog(`Starting: ${SERVER_COMMAND}`, 'update');
  addServerLog(`$ ${SERVER_COMMAND}`);

  // Parse command and args (handles quoted arguments like `npm run "my script"`)
  const { command: cmd, args } = parseCommand(SERVER_COMMAND);

  // Use shell on Windows, direct spawn elsewhere
  const isWindows = process.platform === 'win32';
  const spawnOptions = {
    cwd: PROJECT_ROOT,
    env: { ...process.env, FORCE_COLOR: '1' },
    shell: isWindows,
    stdio: ['ignore', 'pipe', 'pipe'],
    // On Unix, create a new process group so we can kill the entire tree
    // (e.g. npm -> node -> next). On Windows, taskkill /t handles this.
    detached: !isWindows,
  };

  try {
    serverProcess = spawn(cmd, args, spawnOptions);
    store.setState({ serverRunning: true });

    serverProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean);
      lines.forEach(line => addServerLog(line));
    });

    serverProcess.stderr.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean);
      lines.forEach(line => addServerLog(line, true));
    });

    serverProcess.on('error', (err) => {
      store.setState({ serverRunning: false, serverCrashed: true });
      addServerLog(`Error: ${err.message}`, true);
      addLog(`Server error: ${err.message}`, 'error');
      render();
    });

    serverProcess.on('close', (code) => {
      store.setState({ serverRunning: false });
      if (code !== 0 && code !== null) {
        store.setState({ serverCrashed: true });
        addServerLog(`Process exited with code ${code}`, true);
        addLog(`Server exited with code ${code}`, 'error');
      } else {
        addServerLog('Process stopped');
        addLog('Server stopped', 'info');
      }
      serverProcess = null;
      render();
    });

    addLog(`Server started (pid: ${serverProcess.pid})`, 'success');
  } catch (err) {
    store.setState({ serverCrashed: true });
    addServerLog(`Failed to start: ${err.message}`, true);
    addLog(`Failed to start server: ${err.message}`, 'error');
  }
}

function stopServerProcess() {
  if (!serverProcess) return;

  addLog('Stopping server...', 'update');

  // Capture reference before nulling — needed for deferred SIGKILL
  const proc = serverProcess;

  // Try graceful shutdown first
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', proc.pid.toString(), '/f', '/t']);
  } else {
    // Kill the entire process group (negative PID) so that
    // grandchildren (e.g. npm -> node -> vite) are also terminated.
    try {
      process.kill(-proc.pid, 'SIGTERM');
    } catch (e) {
      // Process group may already be dead
    }
    // Force kill after grace period if process hasn't exited
    const forceKillTimeout = setTimeout(() => {
      try {
        process.kill(-proc.pid, 'SIGKILL');
      } catch (e) {
        // Process group may already be dead
      }
    }, 3000);

    // Clear the force-kill timer if the process exits cleanly
    proc.once('close', () => {
      clearTimeout(forceKillTimeout);
    });
  }

  serverProcess = null;
  store.setState({ serverRunning: false });
}

function restartServerProcess() {
  addLog('Restarting server...', 'update');
  stopServerProcess();
  setTimeout(() => {
    startServerProcess();
    render();
  }, 500);
}

// Network and polling state
let slowFetchWarningShown = false;
let verySlowFetchWarningShown = false;
let pollIntervalId = null;

// ANSI escape codes and box drawing imported from src/ui/ansi.js
const { ansi, box, truncate, sparkline: uiSparkline, visibleLength, stripAnsi, padRight, padLeft, getMaxBranchesForScreen: calcMaxBranches, drawBox: renderBox, clearArea: renderClearArea } = require('../src/ui/ansi');

// Error detection utilities imported from src/utils/errors.js
const { ErrorHandler, isAuthError, isMergeConflict, isNetworkError } = require('../src/utils/errors');
const { Mutex } = require('../src/utils/async');

// Keyboard handling utilities imported from src/ui/keybindings.js
const { filterBranches } = require('../src/ui/keybindings');

// Extracted renderer and action handlers
const renderer = require('../src/ui/renderer');
const actions = require('../src/ui/actions');

// Diff stats parsing and stash imported from src/git/commands.js
const { parseDiffStats, stash: gitStash, stashPop: gitStashPop } = require('../src/git/commands');

// Server process command parsing and static server utilities
const { parseCommand } = require('../src/server/process');
const { getMimeType, injectLiveReload } = require('../src/server/static');

// State (non-store globals)
let previousBranchStates = new Map(); // branch name -> commit hash
let knownBranchNames = new Set(); // Track known branches to detect NEW ones

// SSE clients for live reload
const clients = new Set();

// Flash/error toast timers
let flashTimeout = null;
let errorToastTimeout = null;

// Tracks the operation that failed due to dirty working directory.
// When set, pressing 'S' will stash changes and retry the operation.
// Shape: { type: 'switch', branch: string } | { type: 'pull' } | null
let pendingDirtyOperation = null;

// Cached environment info (populated once at startup, doesn't change during session)
let cachedEnv = null; // { hasGh, hasGlab, ghAuthed, glabAuthed, webUrlBase, platform }

// Per-branch PR info cache: Map<branchName, { commit, prInfo }>
// Invalidated when the branch's commit hash changes
const prInfoCache = new Map();

let lastPrStatusFetch = 0;
const PR_STATUS_POLL_INTERVAL = 60 * 1000; // 60 seconds
let prStatusFetchInFlight = false;

// BASE_BRANCH_RE and isBaseBranch imported from src/git/pr.js

const MAX_HISTORY = 20;

// Sparkline timing
let lastSparklineUpdate = 0;
const SPARKLINE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// MIME_TYPES and LIVE_RELOAD_SCRIPT imported from src/server/static.js (via getMimeType and injectLiveReload)

// ============================================================================
// Utility Functions
// ============================================================================

// Default timeout for CLI commands (30 seconds) — prevents hung commands
// from permanently blocking the polling loop
const CLI_TIMEOUT = 30000;

/**
 * Execute a non-git CLI command safely using execFile (no shell interpolation).
 * For git commands, use execGit/execGitSilent from src/git/commands.js instead.
 * @param {string} cmd - The executable (e.g. 'gh', 'glab', 'which')
 * @param {string[]} args - Arguments array (no shell interpolation)
 * @param {Object} [options] - Execution options
 * @param {number} [options.timeout] - Command timeout in ms
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
function execCli(cmd, args = [], options = {}) {
  const { timeout = CLI_TIMEOUT, ...restOptions } = options;
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { cwd: PROJECT_ROOT, timeout, ...restOptions }, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stdout, stderr });
      } else {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      }
    });
    // Force-kill if process outlives timeout grace period
    if (timeout > 0) {
      const killTimer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch (e) { /* already dead */ }
      }, timeout + 5000);
      child.on('close', () => clearTimeout(killTimer));
    }
  });
}

/**
 * Get diff stats between two commits (delegates to src/git/commands.js)
 * @param {string} fromCommit - Starting commit
 * @param {string} toCommit - Ending commit (default HEAD)
 * @returns {Promise<{added: number, deleted: number}>}
 */
async function getDiffStats(fromCommit, toCommit = 'HEAD') {
  return getDiffStatsSafe(fromCommit, toCommit, { cwd: PROJECT_ROOT });
}

// Ahead/behind: detect default branch and fetch counts
let detectedDefaultBranch = null;

async function detectDefaultBranch() {
  const candidates = ['main', 'master', 'develop', 'development', 'trunk'];
  for (const name of candidates) {
    try {
      await execGit(['rev-parse', '--verify', `${REMOTE_NAME}/${name}`], { cwd: PROJECT_ROOT });
      detectedDefaultBranch = `${REMOTE_NAME}/${name}`;
      return;
    } catch (e) {
      // Try next candidate
    }
  }
  // Fallback: try HEAD of remote
  try {
    const { stdout } = await execGit(['symbolic-ref', `refs/remotes/${REMOTE_NAME}/HEAD`], { cwd: PROJECT_ROOT });
    detectedDefaultBranch = stdout.trim().replace('refs/remotes/', '');
  } catch (e) {
    detectedDefaultBranch = null;
  }
}

async function fetchAheadBehindForBranches(branches) {
  if (!detectedDefaultBranch) return;
  const visible = branches.slice(0, store.get('visibleBranchCount'));
  const cache = new Map(store.get('aheadBehindCache'));
  const promises = visible.map(async (branch) => {
    if (isBaseBranch(branch.name)) return;
    // Use local ref if local, otherwise remote ref
    const branchRef = branch.isLocal ? branch.name : `${REMOTE_NAME}/${branch.name}`;
    const [abResult, diffResult] = await Promise.all([
      getAheadBehind(branchRef, detectedDefaultBranch, { cwd: PROJECT_ROOT }),
      getDiffShortstat(detectedDefaultBranch, branchRef, { cwd: PROJECT_ROOT }),
    ]);
    cache.set(branch.name, {
      ahead: abResult.ahead,
      behind: abResult.behind,
      linesAdded: diffResult.added,
      linesDeleted: diffResult.deleted,
    });
  });
  await Promise.all(promises);
  store.setState({ aheadBehindCache: cache });
  render();
}

// formatTimeAgo imported from src/utils/time.js

// truncate imported from src/ui/ansi.js

// padRight, padLeft imported from src/ui/ansi.js

function getMaxBranchesForScreen() {
  return calcMaxBranches(store.get('terminalHeight'), MAX_LOG_ENTRIES);
}

// Casino mode funny messages
const CASINO_WIN_MESSAGES = [
  "Here's your dopamine hit! 🎰",
  "The house always wins... and this is YOUR house!",
  "Cha-ching! Fresh code incoming!",
  "🎲 Lucky roll! New commits detected!",
  "Jackpot! Someone's been busy coding!",
  "💰 Cashing out some fresh changes!",
  "The slot gods smile upon you!",
  "Winner winner, chicken dinner! 🍗",
  "Your patience has been rewarded!",
  "🎯 Bullseye! Updates acquired!",
  "Dopamine delivery service! 📦",
  "The code fairy visited while you waited!",
  "🌟 Wish granted: new commits!",
  "Variable reward unlocked! 🔓",
];

const CASINO_PULL_MESSAGES = [
  "Pulling the lever... 🎰",
  "Spinning the reels of fate...",
  "Checking if luck is on your side...",
  "Rolling the dice on git fetch...",
  "Summoning the code spirits...",
  "Consulting the commit oracle...",
];

const CASINO_LOSS_MESSAGES = [
  "Better luck next merge!",
  "🎲 Snake eyes! Conflict detected!",
  "Busted! Time to resolve manually.",
  "The git gods are displeased...",
];

function getCasinoMessage(type) {
  const messages = type === 'win' ? CASINO_WIN_MESSAGES
    : type === 'pull' ? CASINO_PULL_MESSAGES
    : CASINO_LOSS_MESSAGES;
  return messages[Math.floor(Math.random() * messages.length)];
}

function addLog(message, type = 'info') {
  const icons = { info: '○', success: '✓', warning: '●', error: '✗', update: '⟳' };
  const colors = { info: 'white', success: 'green', warning: 'yellow', error: 'red', update: 'cyan' };
  const entry = {
    message, type,
    timestamp: new Date().toLocaleTimeString(),
    icon: icons[type] || '○',
    color: colors[type] || 'white',
  };
  const activityLog = [entry, ...store.get('activityLog')].slice(0, MAX_LOG_ENTRIES);
  store.setState({ activityLog });
}

// generateSparkline uses uiSparkline from src/ui/ansi.js
function generateSparkline(commitCounts) {
  if (!commitCounts || commitCounts.length === 0) return '       ';
  return uiSparkline(commitCounts);
}

async function getBranchSparkline(branchName) {
  // Check cache first
  const cached = store.get('sparklineCache').get(branchName);
  if (cached && (Date.now() - lastSparklineUpdate) < SPARKLINE_CACHE_TTL) {
    return cached;
  }
  return null; // Will be populated during sparkline refresh
}

async function refreshAllSparklines() {
  const now = Date.now();
  if ((now - lastSparklineUpdate) < SPARKLINE_CACHE_TTL) {
    return; // Don't refresh too often
  }

  const sparklineCache = new Map(store.get('sparklineCache'));
  const currentBranches = store.get('branches');
  for (const branch of currentBranches.slice(0, 20)) { // Limit to top 20
    if (branch.isDeleted) continue;

    try {
      // Get commit counts for last 7 days (try remote, fall back to local)
      const sparkResult = await execGitSilent(
        ['log', `origin/${branch.name}`, '--since=7 days ago', '--format=%ad', '--date=format:%Y-%m-%d'],
        { cwd: PROJECT_ROOT }
      ) || await execGitSilent(
        ['log', branch.name, '--since=7 days ago', '--format=%ad', '--date=format:%Y-%m-%d'],
        { cwd: PROJECT_ROOT }
      );
      const stdout = sparkResult ? sparkResult.stdout : '';

      // Count commits per day
      const dayCounts = new Map();
      const dates = stdout.split('\n').filter(Boolean);

      // Initialize last 7 days
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        dayCounts.set(key, 0);
      }

      // Count commits
      for (const date of dates) {
        dayCounts.set(date, (dayCounts.get(date) || 0) + 1);
      }

      const counts = Array.from(dayCounts.values());
      sparklineCache.set(branch.name, generateSparkline(counts));
    } catch (e) {
      // Skip this branch - don't let one failure abort all sparkline updates
    }
  }
  store.setState({ sparklineCache });
  lastSparklineUpdate = now;
}

async function getPreviewData(branchName) {
  try {
    // Get last 5 commits (try remote, fall back to local)
    const logResult = await execGitSilent(
      ['log', `origin/${branchName}`, '-5', '--oneline'],
      { cwd: PROJECT_ROOT }
    ) || await execGitSilent(
      ['log', branchName, '-5', '--oneline'],
      { cwd: PROJECT_ROOT }
    );
    const logOutput = logResult ? logResult.stdout : '';

    const commits = logOutput.split('\n').filter(Boolean).map(line => {
      const [hash, ...msgParts] = line.split(' ');
      return { hash, message: msgParts.join(' ') };
    });

    // Get files changed (comparing to current branch)
    let filesChanged = [];
    const diffResult = await execGitSilent(
      ['diff', '--stat', '--name-only', `HEAD...origin/${branchName}`],
      { cwd: PROJECT_ROOT }
    ) || await execGitSilent(
      ['diff', '--stat', '--name-only', `HEAD...${branchName}`],
      { cwd: PROJECT_ROOT }
    );
    if (diffResult) {
      filesChanged = diffResult.stdout.split('\n').filter(Boolean).slice(0, 8);
    }

    return { commits, filesChanged };
  } catch (e) {
    return { commits: [], filesChanged: [] };
  }
}

// playSound delegates to extracted src/utils/sound.js
function playSound() {
  if (!store.get('soundEnabled')) return;
  playSoundEffect({ cwd: PROJECT_ROOT });
}

// ============================================================================
// Terminal Rendering
// ============================================================================

function write(str) {
  process.stdout.write(str);
}

function setTerminalTitle(title) {
  // Set terminal tab/window title using ANSI escape sequence
  // \x1b]0;title\x07 sets both window and tab title (most compatible)
  process.stdout.write(`\x1b]0;${title}\x07`);
}

function restoreTerminalTitle() {
  // Restore default terminal title behavior by clearing it
  // Some terminals will revert to showing the running process
  process.stdout.write('\x1b]0;\x07');
}

function updateTerminalSize() {
  store.setState({
    terminalWidth: process.stdout.columns || 80,
    terminalHeight: process.stdout.rows || 24,
  });
}

function drawBox(row, col, width, height, title = '', titleColor = ansi.cyan) {
  write(renderBox(row, col, width, height, title, titleColor));
}

function clearArea(row, col, width, height) {
  write(renderClearArea(row, col, width, height));
}

// renderHeader - now delegated to renderer.renderHeader()

// renderBranchList, renderActivityLog — now delegated to renderer module (src/ui/renderer.js)

function renderCasinoStats(startRow) {
  if (!store.get('casinoModeEnabled')) return startRow;

  const boxWidth = store.get('terminalWidth');
  const height = 6; // Box with two content lines

  // Don't draw if not enough space
  if (startRow + height > store.get('terminalHeight') - 3) return startRow;

  drawBox(startRow, 1, boxWidth, height, '🎰 CASINO WINNINGS 🎰', ansi.brightMagenta);

  // Clear content area
  for (let i = 1; i < height - 1; i++) {
    write(ansi.moveTo(startRow + i, 2));
    write(' '.repeat(boxWidth - 2));
  }

  const stats = casino.getStats();

  // Net winnings color
  const netColor = stats.netWinnings >= 0 ? ansi.brightGreen : ansi.brightRed;
  const netSign = stats.netWinnings >= 0 ? '+' : '';

  // Line 1: Line Changes | Poll Cost | Net Earnings
  write(ansi.moveTo(startRow + 2, 3));
  write('📝 Line Changes: ');
  write(ansi.brightGreen + '+' + stats.totalLinesAdded + ansi.reset);
  write(' / ');
  write(ansi.brightRed + '-' + stats.totalLinesDeleted + ansi.reset);
  write(' = ' + ansi.brightYellow + '$' + stats.totalLines + ansi.reset);
  write('  |  💸 Poll Cost: ' + ansi.brightRed + '$' + stats.totalPolls + ansi.reset);
  write('  |  💰 Net Earnings: ' + netColor + netSign + '$' + stats.netWinnings + ansi.reset);

  // Line 2: House Edge | Vibes Quality | Luck Meter | Dopamine Hits
  write(ansi.moveTo(startRow + 3, 3));
  write('🎰 House Edge: ' + ansi.brightCyan + stats.houseEdge + '%' + ansi.reset);
  write('  |  😎 Vibes: ' + stats.vibesQuality);
  write('  |  🎲 Luck: ' + ansi.brightYellow + stats.luckMeter + '%' + ansi.reset);
  write('  |  🧠 Dopamine Hits: ' + ansi.brightGreen + stats.dopamineHits + ansi.reset);

  return startRow + height;
}

// renderFooter, renderFlash, renderErrorToast, renderPreview, renderHistory
// — now delegated to renderer module (src/ui/renderer.js)

// renderLogView, renderInfo, renderActionModal
// — now delegated to renderer module (src/ui/renderer.js)

// Build a state snapshot from the current globals for the renderer
function getRenderState() {
  const s = store.getState();
  s.clientCount = clients.size;
  s.sessionStats = sessionStats.getStats();
  return s;
}

function render() {
  updateTerminalSize();

  write(ansi.hideCursor);
  write(ansi.moveToTop);
  write(ansi.clearScreen);

  const state = getRenderState();
  const { casinoModeEnabled, terminalWidth, terminalHeight } = state;

  // Casino mode: top marquee border
  if (casinoModeEnabled) {
    write(ansi.moveTo(1, 1));
    write(casino.renderMarqueeLine(terminalWidth, 'top'));
  }

  // Delegate to extracted renderer module
  renderer.renderHeader(state, write);
  const logStart = renderer.renderBranchList(state, write);
  const statsStart = renderer.renderActivityLog(state, write, logStart);
  const casinoStart = renderer.renderSessionStats(state, write, statsStart);
  renderCasinoStats(casinoStart);
  renderer.renderFooter(state, write);

  // Casino mode: full border (top, bottom, left, right)
  if (casinoModeEnabled) {
    // Bottom marquee border
    write(ansi.moveTo(terminalHeight, 1));
    write(casino.renderMarqueeLine(terminalWidth, 'bottom'));

    // Left and right side borders
    for (let row = 2; row < terminalHeight; row++) {
      // Left side
      write(ansi.moveTo(row, 1));
      write(casino.getMarqueeSideChar(row, terminalHeight, 'left'));
      // Right side
      write(ansi.moveTo(row, terminalWidth));
      write(casino.getMarqueeSideChar(row, terminalHeight, 'right'));
    }
  }

  // Casino mode: slot reels on row 3 (below header) when polling or showing result
  if (casinoModeEnabled && casino.isSlotsActive()) {
    const slotDisplay = casino.getSlotReelDisplay();
    if (slotDisplay) {
      const resultLabel = casino.getSlotResultLabel();
      let leftLabel, rightLabel;

      if (casino.isSlotSpinning()) {
        leftLabel = ansi.bgBrightYellow + ansi.black + ansi.bold + ' POLLING ' + ansi.reset;
        rightLabel = '';
      } else if (resultLabel) {
        leftLabel = ansi.bgBrightGreen + ansi.black + ansi.bold + ' RESULT ' + ansi.reset;
        const flash = resultLabel.isJackpot && (Math.floor(Date.now() / 150) % 2 === 0);
        const bgColor = flash ? ansi.bgBrightYellow : ansi.bgWhite;
        rightLabel = ' ' + bgColor + resultLabel.color + ansi.bold + ' ' + resultLabel.text + ' ' + ansi.reset;
      } else {
        leftLabel = ansi.bgBrightGreen + ansi.black + ansi.bold + ' RESULT ' + ansi.reset;
        rightLabel = '';
      }

      const fullDisplay = leftLabel + ' ' + slotDisplay + rightLabel;
      const col = Math.floor((terminalWidth - 70) / 2);
      write(ansi.moveTo(3, Math.max(2, col)));
      write(fullDisplay);
    }
  }

  // Casino mode: win animation overlay
  if (casinoModeEnabled && casino.isWinAnimating()) {
    const winDisplay = casino.getWinDisplay(terminalWidth);
    if (winDisplay) {
      const row = Math.floor(terminalHeight / 2);
      write(ansi.moveTo(row, 1));
      write(winDisplay);
    }
  }

  // Casino mode: loss animation overlay
  if (casinoModeEnabled && casino.isLossAnimating()) {
    const lossDisplay = casino.getLossDisplay(terminalWidth);
    if (lossDisplay) {
      const row = Math.floor(terminalHeight / 2);
      write(ansi.moveTo(row, 1));
      write(lossDisplay);
    }
  }

  // Delegate modal/overlay rendering to extracted renderer
  if (state.flashMessage) {
    renderer.renderFlash(state, write);
  }

  if (state.previewMode && state.previewData) {
    renderer.renderPreview(state, write);
  }

  if (state.historyMode) {
    renderer.renderHistory(state, write);
  }

  if (state.infoMode) {
    renderer.renderInfo(state, write);
  }

  if (state.logViewMode) {
    renderer.renderLogView(state, write);
  }

  if (state.actionMode) {
    renderer.renderActionModal(state, write);
  }

  // Error toast renders on top of everything for maximum visibility
  if (state.errorToast) {
    renderer.renderErrorToast(state, write);
  }

  // Cleanup confirmation dialog
  if (state.cleanupConfirmMode) {
    renderer.renderCleanupConfirm(state, write);
  }

  // Stash confirmation dialog renders on top of everything
  if (state.stashConfirmMode) {
    renderer.renderStashConfirm(state, write);
  }

  // Update notification modal renders on top of everything
  if (state.updateModalVisible) {
    renderer.renderUpdateModal(state, write);
  }
}

function showFlash(message) {
  if (flashTimeout) clearTimeout(flashTimeout);

  store.setState({ flashMessage: message });
  render();

  flashTimeout = setTimeout(() => {
    store.setState({ flashMessage: null });
    render();
  }, 3000);
}

function hideFlash() {
  if (flashTimeout) {
    clearTimeout(flashTimeout);
    flashTimeout = null;
  }
  if (store.get('flashMessage')) {
    store.setState({ flashMessage: null });
    render();
  }
}

function showErrorToast(title, message, hint = null, duration = 8000) {
  if (errorToastTimeout) clearTimeout(errorToastTimeout);

  store.setState({ errorToast: { title, message, hint } });
  playSound(); // Alert sound for errors
  render();

  errorToastTimeout = setTimeout(() => {
    store.setState({ errorToast: null });
    render();
  }, duration);
}

function hideErrorToast() {
  if (errorToastTimeout) {
    clearTimeout(errorToastTimeout);
    errorToastTimeout = null;
  }
  if (store.get('errorToast')) {
    store.setState({ errorToast: null });
    render();
  }
}

function showStashConfirm(operationLabel) {
  store.setState({
    stashConfirmMode: true,
    stashConfirmSelectedIndex: 0,
    pendingDirtyOperationLabel: operationLabel,
  });
  render();
}

function hideStashConfirm() {
  if (store.get('stashConfirmMode')) {
    store.setState({
      stashConfirmMode: false,
      stashConfirmSelectedIndex: 0,
      pendingDirtyOperationLabel: null,
    });
    render();
  }
}

// ============================================================================
// Git Functions
// ============================================================================

async function getCurrentBranch() {
  const result = await getCurrentBranchRaw(PROJECT_ROOT);
  store.setState({ isDetachedHead: result.isDetached });
  return result.name;
}

async function checkRemoteExists() {
  try {
    const { stdout } = await execGit(['remote'], { cwd: PROJECT_ROOT });
    const remotes = stdout.split('\n').filter(Boolean);
    return remotes.length > 0;
  } catch (e) {
    return false;
  }
}

async function hasUncommittedChanges() {
  return checkUncommittedChanges(PROJECT_ROOT);
}

// isAuthError, isMergeConflict, isNetworkError imported from src/utils/errors.js

async function getAllBranches() {
  try {
    return await getAllBranchesRaw({ remoteName: REMOTE_NAME, fetch: true, cwd: PROJECT_ROOT });
  } catch (e) {
    addLog(`Failed to get branches: ${e.message || e}`, 'error');
    return [];
  }
}

async function switchToBranch(branchName, recordHistory = true) {
  try {
    // Validate branch name for security
    const safeBranchName = sanitizeBranchName(branchName);

    // Check for uncommitted changes first
    const isDirty = await hasUncommittedChanges();
    if (isDirty) {
      addLog(`Cannot switch: uncommitted changes in working directory`, 'error');
      pendingDirtyOperation = { type: 'switch', branch: branchName };
      showStashConfirm(`switch to ${branchName}`);
      telemetry.capture('dirty_repo_encountered');
      return { success: false, reason: 'dirty' };
    }

    const previousBranch = store.get('currentBranch');

    addLog(`Switching to ${safeBranchName}...`, 'update');
    render();

    const { stdout: localBranches } = await execGit(['branch', '--list'], { cwd: PROJECT_ROOT });
    const hasLocal = localBranches.split('\n').some(b => b.trim().replace(/^\* /, '') === safeBranchName);

    if (hasLocal) {
      await execGit(['checkout', safeBranchName], { cwd: PROJECT_ROOT });
    } else {
      await execGit(['checkout', '-b', safeBranchName, `${REMOTE_NAME}/${safeBranchName}`], { cwd: PROJECT_ROOT });
    }

    store.setState({ currentBranch: safeBranchName, isDetachedHead: false });

    // Clear NEW flag when branch becomes current
    const branches = store.get('branches');
    const branchInfo = branches.find(b => b.name === safeBranchName);
    if (branchInfo && branchInfo.isNew) {
      branchInfo.isNew = false;
      store.setState({ branches: [...branches] });
    }

    // Record in history (for undo)
    if (recordHistory && previousBranch && previousBranch !== safeBranchName) {
      const switchHistory = [{ from: previousBranch, to: safeBranchName, timestamp: Date.now() }, ...store.get('switchHistory')].slice(0, MAX_HISTORY);
      store.setState({ switchHistory });
    }

    addLog(`Switched to ${safeBranchName}`, 'success');
    telemetry.capture('branch_switched');
    branchSwitchCount++;
    pendingDirtyOperation = null;

    // Restart server if configured (command mode)
    if (SERVER_MODE === 'command' && RESTART_ON_SWITCH && serverProcess) {
      restartServerProcess();
    }

    notifyClients();
    return { success: true };
  } catch (e) {
    const errMsg = e.stderr || e.message || String(e);
    if (errMsg.includes('Invalid branch name')) {
      addLog(`Invalid branch name: ${branchName}`, 'error');
      showErrorToast(
        'Invalid Branch Name',
        `The branch name "${branchName}" is not valid.`,
        'Check for special characters or typos'
      );
    } else if (errMsg.includes('local changes') || errMsg.includes('overwritten')) {
      addLog(`Cannot switch: local changes would be overwritten`, 'error');
      pendingDirtyOperation = { type: 'switch', branch: branchName };
      showStashConfirm(`switch to ${branchName}`);
    } else {
      addLog(`Failed to switch: ${errMsg}`, 'error');
      showErrorToast(
        'Branch Switch Failed',
        truncate(errMsg, 100),
        'Check the activity log for details'
      );
      telemetry.captureError(e);
    }
    return { success: false };
  }
}

async function undoLastSwitch() {
  const currentHistory = store.get('switchHistory');
  if (currentHistory.length === 0) {
    addLog('No switch history to undo', 'warning');
    return { success: false };
  }

  const lastSwitch = currentHistory[0];
  addLog(`Undoing: going back to ${lastSwitch.from}`, 'update');

  const result = await switchToBranch(lastSwitch.from, false);
  if (result.success) {
    store.setState({ switchHistory: store.get('switchHistory').slice(1) });
    addLog(`Undone: back on ${lastSwitch.from}`, 'success');
  }
  return result;
}

async function pullCurrentBranch() {
  try {
    const branch = await getCurrentBranch();
    if (!branch) {
      addLog('Not in a git repository', 'error');
      showErrorToast('Pull Failed', 'Not in a git repository.');
      return { success: false };
    }

    // Validate branch name
    if (!isValidBranchName(branch) && !branch.startsWith('HEAD@')) {
      addLog('Cannot pull: invalid branch name', 'error');
      showErrorToast('Pull Failed', 'Cannot pull: invalid branch name.');
      return { success: false };
    }

    addLog(`Pulling from ${REMOTE_NAME}/${branch}...`, 'update');
    render();

    await execGit(['pull', REMOTE_NAME, branch], { cwd: PROJECT_ROOT, timeout: 60000 });
    addLog('Pulled successfully', 'success');
    pendingDirtyOperation = null;
    notifyClients();
    return { success: true };
  } catch (e) {
    const errMsg = e.stderr || e.message || String(e);
    addLog(`Pull failed: ${errMsg}`, 'error');

    if (errMsg.includes('local changes') || errMsg.includes('overwritten') || errMsg.includes('uncommitted changes')) {
      pendingDirtyOperation = { type: 'pull' };
      showStashConfirm('pull');
    } else if (isMergeConflict(errMsg)) {
      store.setState({ hasMergeConflict: true });
      showErrorToast(
        'Merge Conflict!',
        'Git pull resulted in merge conflicts that need manual resolution.',
        'Run: git status to see conflicts'
      );
    } else if (isAuthError(errMsg)) {
      showErrorToast(
        'Authentication Failed',
        'Could not authenticate with the remote repository.',
        'Check your Git credentials'
      );
    } else if (isNetworkError(errMsg)) {
      showErrorToast(
        'Network Error',
        'Could not connect to the remote repository.',
        'Check your internet connection'
      );
    } else {
      showErrorToast(
        'Pull Failed',
        truncate(errMsg, 100),
        'Check the activity log for details'
      );
    }
    return { success: false };
  }
}

async function stashAndRetry() {
  const operation = pendingDirtyOperation;
  if (!operation) {
    addLog('No pending operation to retry', 'warning');
    render();
    return;
  }

  pendingDirtyOperation = null;
  hideErrorToast();
  hideStashConfirm();

  addLog('Stashing uncommitted changes...', 'update');
  render();

  const stashResult = await gitStash({ message: 'git-watchtower: auto-stash before ' + (operation.type === 'switch' ? `switching to ${operation.branch}` : 'pull') });
  if (!stashResult.success) {
    addLog(`Stash failed: ${stashResult.error ? stashResult.error.message : 'unknown error'}`, 'error');
    showErrorToast('Stash Failed', stashResult.error ? stashResult.error.message : 'Could not stash changes.');
    render();
    return;
  }

  addLog('Changes stashed successfully', 'success');
  telemetry.capture('stash_performed');

  if (operation.type === 'switch') {
    const switchResult = await switchToBranch(operation.branch);
    if (!switchResult.success) {
      addLog('Branch switch failed after stash — restoring stashed changes...', 'warning');
      const popResult = await gitStashPop();
      if (popResult.success) {
        addLog('Stashed changes restored', 'info');
        showFlash('Stashed changes restored (switch failed)');
      } else {
        addLog('Warning: could not restore stashed changes. Run: git stash pop', 'error');
        showErrorToast('Stash Pop Failed', 'Could not restore stashed changes.', 'Run: git stash pop');
      }
    } else {
      showFlash(`Stashed & switched to ${operation.branch}`);
    }
    await pollGitChanges();
  } else if (operation.type === 'pull') {
    const pullResult = await pullCurrentBranch();
    if (!pullResult.success) {
      addLog('Pull failed after stash — restoring stashed changes...', 'warning');
      const popResult = await gitStashPop();
      if (popResult.success) {
        addLog('Stashed changes restored', 'info');
        showFlash('Stashed changes restored (pull failed)');
      } else {
        addLog('Warning: could not restore stashed changes. Run: git stash pop', 'error');
        showErrorToast('Stash Pop Failed', 'Could not restore stashed changes.', 'Run: git stash pop');
      }
    } else {
      showFlash('Stashed & pulled successfully');
    }
    await pollGitChanges();
  }

  render();
}

// ============================================================================
// Polling
// ============================================================================

const pollMutex = new Mutex();

async function pollGitChanges() {
  // Skip if a poll is already in progress (don't queue)
  if (pollMutex.isLocked()) return;
  await pollMutex.acquire();
  store.setState({ isPolling: true, pollingStatus: 'fetching' });

  // Casino mode: start slot reels spinning (no sound - too annoying)
  if (store.get('casinoModeEnabled')) {
    casino.startSlotReels(render);
  }

  render();

  const fetchStartTime = Date.now();

  try {
    const newCurrentBranch = await getCurrentBranch();
    const prevCurrentBranch = store.get('currentBranch');

    if (prevCurrentBranch && newCurrentBranch !== prevCurrentBranch) {
      addLog(`Branch switched externally: ${prevCurrentBranch} → ${newCurrentBranch}`, 'warning');
      notifyClients();
    }
    store.setState({ currentBranch: newCurrentBranch });

    const allBranches = await getAllBranches();

    // Track fetch duration
    const lastFetchDuration = Date.now() - fetchStartTime;
    store.setState({ lastFetchDuration });

    // Check for slow fetches
    if (lastFetchDuration > 30000 && !verySlowFetchWarningShown) {
      addLog(`⚠ Fetches taking ${Math.round(lastFetchDuration / 1000)}s - network may be slow`, 'warning');
      verySlowFetchWarningShown = true;
      // Slow down polling
      const newInterval = Math.min(store.get('adaptivePollInterval') * 2, 60000);
      store.setState({ adaptivePollInterval: newInterval });
      addLog(`Polling interval increased to ${newInterval / 1000}s`, 'info');
    } else if (lastFetchDuration > 15000 && !slowFetchWarningShown) {
      addLog(`Fetches taking ${Math.round(lastFetchDuration / 1000)}s`, 'warning');
      slowFetchWarningShown = true;
    } else if (lastFetchDuration < 5000) {
      // Reset warnings if fetches are fast again
      slowFetchWarningShown = false;
      verySlowFetchWarningShown = false;
      if (store.get('adaptivePollInterval') > GIT_POLL_INTERVAL) {
        store.setState({ adaptivePollInterval: GIT_POLL_INTERVAL });
        addLog(`Polling interval restored to ${GIT_POLL_INTERVAL / 1000}s`, 'info');
      }
    }

    // Network success - reset failure counter
    if (store.get('isOffline')) {
      addLog('Connection restored', 'success');
    }
    store.setState({ consecutiveNetworkFailures: 0, isOffline: false });

    const fetchedBranchNames = new Set(allBranches.map(b => b.name));
    const now = Date.now();
    const currentBranches = store.get('branches');

    // Detect NEW branches (not seen before)
    const NEW_BADGE_TTL = 30000; // 30 seconds
    const newBranchList = [];
    for (const branch of allBranches) {
      if (!knownBranchNames.has(branch.name)) {
        branch.isNew = true;
        branch.newAt = now;
        addLog(`New branch: ${branch.name}`, 'success');
        newBranchList.push(branch);
      } else {
        // Preserve isNew flag from previous poll cycle, but expire after TTL
        const prevBranch = currentBranches.find(b => b.name === branch.name);
        if (prevBranch && prevBranch.isNew && (now - prevBranch.newAt) < NEW_BADGE_TTL) {
          branch.isNew = true;
          branch.newAt = prevBranch.newAt;
        }
      }
      knownBranchNames.add(branch.name);
    }

    // Detect DELETED branches (were known but no longer exist in git)
    for (const knownName of knownBranchNames) {
      if (!fetchedBranchNames.has(knownName)) {
        // This branch was deleted from remote
        // Check if already present in allBranches (avoid duplicates)
        const alreadyInList = allBranches.some(b => b.name === knownName);
        if (alreadyInList) continue;

        const existingInList = currentBranches.find(b => b.name === knownName);
        if (existingInList) {
          if (!existingInList.isDeleted) {
            existingInList.isDeleted = true;
            existingInList.deletedAt = now;
            addLog(`Branch deleted: ${knownName}`, 'warning');
          }
          // Keep it in the list temporarily
          allBranches.push(existingInList);
        }
        // Remove from known set after a delay (handled below)
      }
    }

    // Prune stale entries: remove branches from tracking sets/caches
    // that no longer exist in git (deleted >30s ago or already gone)
    pruneStaleEntries({
      knownBranchNames,
      fetchedBranchNames,
      allBranches,
      caches: [previousBranchStates, prInfoCache, store.get('sparklineCache'), store.get('aheadBehindCache')],
      now,
    });

    // Note: isNew flag is only cleared when branch becomes current (see below)

    // Keep deleted branches in the list (don't remove them)
    const pollFilteredBranches = allBranches;

    // Detect updates on other branches (for flash notification)
    const updatedBranches = [];
    const currentBranchName = store.get('currentBranch');
    const activeBranchNames = new Set();
    for (const branch of pollFilteredBranches) {
      // Clear previous cycle's flag so only freshly-updated branches are highlighted
      branch.justUpdated = false;
      if (branch.isDeleted) continue;
      activeBranchNames.add(branch.name);
      const prevCommit = previousBranchStates.get(branch.name);
      if (prevCommit && prevCommit !== branch.commit && branch.name !== currentBranchName) {
        updatedBranches.push(branch);
        branch.justUpdated = true;
      }
      previousBranchStates.set(branch.name, branch.commit);
    }

    // Remove stale entries from caches for branches
    // that no longer exist in the current poll results
    const staleCaches = [previousBranchStates, prInfoCache, store.get('sparklineCache'), store.get('aheadBehindCache')];
    for (const cache of staleCaches) {
      if (!cache) continue;
      for (const name of cache.keys()) {
        if (!activeBranchNames.has(name)) {
          cache.delete(name);
        }
      }
    }

    // Flash and sound for updates or new branches
    const casinoOn = store.get('casinoModeEnabled');
    const notifyBranches = [...updatedBranches, ...newBranchList];
    if (notifyBranches.length > 0) {
      for (const branch of updatedBranches) {
        addLog(`Update on ${branch.name}: ${branch.commit}`, 'update');
      }

      // Casino mode: add funny commentary
      if (casinoOn) {
        addLog(`🎰 ${getCasinoMessage('win')}`, 'success');
      }

      const names = notifyBranches.map(b => b.name).join(', ');
      showFlash(names);
      playSound();

      // Casino mode: trigger win effect based on number of updated branches
      if (casinoOn) {
        // Estimate line changes: more branches = bigger "win"
        // Each branch update counts as ~100 lines (placeholder until we calculate actual diff)
        const estimatedLines = notifyBranches.length * 100;
        const winLevel = casino.getWinLevel(estimatedLines);
        casino.stopSlotReels(true, render, winLevel);  // Win - matching symbols + flash + label
        casino.triggerWin(estimatedLines, 0, render);
        if (winLevel) {
          casinoSounds.playForWinLevel(winLevel.key);
        }
        casino.recordPoll(true);
      }
    } else if (casinoOn) {
      // No updates - stop reels and show result briefly
      casino.stopSlotReels(false, render);
      casino.recordPoll(false);
    }

    // Session stats: always track polls (independent of casino mode)
    sessionStats.recordPoll(notifyBranches.length > 0);

    // Remember which branch was selected before updating the list
    const { selectedBranchName: prevSelName, selectedIndex: prevSelIdx } = store.getState();
    const previouslySelectedName = prevSelName || (currentBranches[prevSelIdx] ? currentBranches[prevSelIdx].name : null);

    // Sort: new branches first, then by date, merged branches near bottom, deleted at bottom
    const prStatusMap = store.get('branchPrStatusMap');
    pollFilteredBranches.sort((a, b) => {
      const aIsBase = isBaseBranch(a.name);
      const bIsBase = isBaseBranch(b.name);
      const aMerged = !aIsBase && prStatusMap.has(a.name) && prStatusMap.get(a.name).state === 'MERGED';
      const bMerged = !bIsBase && prStatusMap.has(b.name) && prStatusMap.get(b.name).state === 'MERGED';
      if (a.isDeleted && !b.isDeleted) return 1;
      if (!a.isDeleted && b.isDeleted) return -1;
      if (aMerged && !bMerged && !b.isDeleted) return 1;
      if (!aMerged && bMerged && !a.isDeleted) return -1;
      if (a.isNew && !b.isNew) return -1;
      if (!a.isNew && b.isNew) return 1;
      return b.date - a.date;
    });

    // Store all branches (no limit) - visibleBranchCount controls display
    // Restore selection to the same branch (by name) after reordering
    let newSelectedIndex = prevSelIdx;
    let newSelectedName = prevSelName;
    if (previouslySelectedName) {
      const foundIdx = pollFilteredBranches.findIndex(b => b.name === previouslySelectedName);
      if (foundIdx >= 0) {
        newSelectedIndex = foundIdx;
        newSelectedName = previouslySelectedName;
      } else {
        // Branch fell off the list, keep index at bottom or clamp
        newSelectedIndex = Math.min(prevSelIdx, Math.max(0, pollFilteredBranches.length - 1));
        newSelectedName = pollFilteredBranches[newSelectedIndex] ? pollFilteredBranches[newSelectedIndex].name : null;
      }
    } else if (prevSelIdx >= pollFilteredBranches.length) {
      newSelectedIndex = Math.max(0, pollFilteredBranches.length - 1);
      newSelectedName = pollFilteredBranches[newSelectedIndex] ? pollFilteredBranches[newSelectedIndex].name : null;
    }
    store.setState({ branches: pollFilteredBranches, selectedIndex: newSelectedIndex, selectedBranchName: newSelectedName });

    // Background PR status fetch (throttled to every PR_STATUS_POLL_INTERVAL)
    const now2 = Date.now();
    if (!prStatusFetchInFlight && cachedEnv && (now2 - lastPrStatusFetch > PR_STATUS_POLL_INTERVAL)) {
      prStatusFetchInFlight = true;
      fetchAllPrStatuses().then(map => {
        if (map) {
          store.setState({ branchPrStatusMap: map });
          render(); // re-render to show updated PR indicators
        }
        lastPrStatusFetch = Date.now();
        prStatusFetchInFlight = false;
      }).catch(() => {
        prStatusFetchInFlight = false;
      });
    }

    // Background ahead/behind fetch for visible branches
    fetchAheadBehindForBranches(pollFilteredBranches).catch(() => {});

    // AUTO-PULL: If current branch has remote updates, pull automatically (if enabled)
    const autoPullBranchName = store.get('currentBranch');
    const currentInfo = store.get('branches').find(b => b.name === autoPullBranchName);
    if (AUTO_PULL && currentInfo && currentInfo.hasUpdates && !store.get('hasMergeConflict')) {
      addLog(`Auto-pulling changes for ${autoPullBranchName}...`, 'update');
      render();

      // Save the old commit for diff calculation (casino mode)
      const oldCommit = currentInfo.commit;

      try {
        await execGit(['pull', REMOTE_NAME, autoPullBranchName], { cwd: PROJECT_ROOT, timeout: 60000 });
        addLog(`Pulled successfully from ${autoPullBranchName}`, 'success');
        currentInfo.hasUpdates = false;
        // Update the stored commit to the new one
        const newCommit = await execGit(['rev-parse', '--short', 'HEAD'], { cwd: PROJECT_ROOT });
        currentInfo.commit = newCommit.stdout.trim();
        store.setState({ hasMergeConflict: false, branches: [...store.get('branches')] });
        previousBranchStates.set(autoPullBranchName, newCommit.stdout.trim());
        // Reload browsers
        notifyClients();

        // Calculate actual diff for stats tracking
        if (oldCommit) {
          const diffStats = await getDiffStats(oldCommit, 'HEAD');
          const totalLines = diffStats.added + diffStats.deleted;
          // Always track session churn
          sessionStats.recordChurn(diffStats.added, diffStats.deleted);
          // Casino mode: trigger win effect
          if (store.get('casinoModeEnabled') && totalLines > 0) {
            casino.triggerWin(diffStats.added, diffStats.deleted, render);
            const winLevel = casino.getWinLevel(totalLines);
            if (winLevel) {
              addLog(`🎰 ${winLevel.label} +${diffStats.added}/-${diffStats.deleted} lines`, 'success');
              casinoSounds.playForWinLevel(winLevel.key);
            }
          }
        }
      } catch (e) {
        const errMsg = e.stderr || e.stdout || e.message || String(e);
        if (isMergeConflict(errMsg)) {
          store.setState({ hasMergeConflict: true });
          addLog(`MERGE CONFLICT detected!`, 'error');
          addLog(`Resolve conflicts manually, then commit`, 'warning');
          showErrorToast(
            'Merge Conflict!',
            'Auto-pull resulted in merge conflicts that need manual resolution.',
            'Run: git status to see conflicts'
          );
          // Casino mode: trigger loss effect
          if (store.get('casinoModeEnabled')) {
            casino.triggerLoss('MERGE CONFLICT!', render);
            casinoSounds.playLoss();
            addLog(`💀 ${getCasinoMessage('loss')}`, 'error');
          }
        } else if (isAuthError(errMsg)) {
          addLog(`Authentication failed during pull`, 'error');
          addLog(`Check your Git credentials`, 'warning');
          showErrorToast(
            'Authentication Failed',
            'Could not authenticate with the remote during auto-pull.',
            'Check your Git credentials'
          );
        } else {
          addLog(`Auto-pull failed: ${errMsg}`, 'error');
          showErrorToast(
            'Auto-Pull Failed',
            truncate(errMsg, 100),
            'Try pulling manually with [p]'
          );
        }
      }
    }

    store.setState({ pollingStatus: 'idle' });
    // Casino mode: stop slot reels if still spinning (already handled above, just cleanup)
    if (store.get('casinoModeEnabled') && casino.isSlotSpinning()) {
      casino.stopSlotReels(false, render);
    }
  } catch (err) {
    const errMsg = err.stderr || err.message || String(err);

    // Casino mode: stop slot reels and show loss on error
    if (store.get('casinoModeEnabled')) {
      casino.stopSlotReels(false, render);
      casino.triggerLoss('BUST!', render);
      casinoSounds.playLoss();
    }

    // Handle different error types
    if (isNetworkError(errMsg)) {
      const failures = store.get('consecutiveNetworkFailures') + 1;
      store.setState({ consecutiveNetworkFailures: failures });
      if (failures >= 3 && !store.get('isOffline')) {
        store.setState({ isOffline: true });
        addLog(`Network unavailable (${failures} failures)`, 'error');
        showErrorToast(
          'Network Unavailable',
          'Cannot connect to the remote repository. Git operations will fail until connection is restored.',
          'Check your internet connection'
        );
      }
      store.setState({ pollingStatus: 'error' });
    } else if (isAuthError(errMsg)) {
      addLog(`Authentication error - check credentials`, 'error');
      addLog(`Try: git config credential.helper store`, 'warning');
      showErrorToast(
        'Git Authentication Error',
        'Failed to authenticate with the remote repository.',
        'Run: git config credential.helper store'
      );
      store.setState({ pollingStatus: 'error' });
    } else {
      store.setState({ pollingStatus: 'error' });
      addLog(`Polling error: ${errMsg}`, 'error');
    }
  } finally {
    store.setState({ isPolling: false });
    pollMutex.release();
    render();
  }
}

function schedulePoll() {
  pollIntervalId = setTimeout(async () => {
    await pollGitChanges();
    schedulePoll();
  }, store.get('adaptivePollInterval'));
}

function restartPolling() {
  if (pollIntervalId) {
    clearTimeout(pollIntervalId);
  }
  schedulePoll();
}

// ============================================================================
// HTTP Server
// ============================================================================

function notifyClients() {
  if (NO_SERVER) return; // No clients in no-server mode
  clients.forEach(client => client.write('data: reload\n\n'));
  if (clients.size > 0) {
    addLog(`Reloading ${clients.size} browser(s)`, 'info');
  }
}

function handleLiveReload(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write('data: connected\n\n');
  clients.add(res);
  addServerLog(`Browser connected (${clients.size} active)`);
  render();
  req.on('close', () => {
    clients.delete(res);
    addServerLog(`Browser disconnected (${clients.size} active)`);
    render();
  });
}

function serveFile(res, filePath, logPath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = getMimeType(ext);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h1>404 Not Found</h1>');
      addServerLog(`GET ${logPath} → 404`, true);
      return;
    }

    if (mimeType === 'text/html') {
      const html = injectLiveReload(data.toString());
      res.writeHead(200, { 'Content-Type': mimeType });
      res.end(html);
    } else {
      res.writeHead(200, { 'Content-Type': mimeType });
      res.end(data);
    }
    addServerLog(`GET ${logPath} → 200`);
  });
}

let server = null;

function createStaticServer() {
  return http.createServer((req, res) => {
  // DNS-rebinding protection: reject requests with non-loopback Host headers
  const host = (req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '[::1]') {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden: invalid Host header');
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = url.pathname;
  const logPath = pathname; // Keep original for logging

  if (pathname === '/livereload') {
    handleLiveReload(req, res);
    return;
  }

  pathname = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(STATIC_DIR, pathname);

  // Security: ensure resolved path stays within STATIC_DIR to prevent path traversal.
  // Use realpath to follow symlinks — without this, a symlink inside STATIC_DIR
  // pointing outside would bypass the startsWith check.
  const resolvedStaticDir = path.resolve(STATIC_DIR);
  let resolvedPath = path.resolve(filePath);
  try {
    resolvedPath = fs.realpathSync(resolvedPath);
  } catch {
    // File doesn't exist — path.resolve is sufficient since there's no symlink to follow.
  }
  let realStaticDir;
  try {
    realStaticDir = fs.realpathSync(resolvedStaticDir);
  } catch {
    realStaticDir = resolvedStaticDir;
  }
  if (!resolvedPath.startsWith(realStaticDir + path.sep) && resolvedPath !== realStaticDir) {
    res.writeHead(403, { 'Content-Type': 'text/html' });
    res.end('<h1>403 Forbidden</h1>');
    addServerLog(`GET ${logPath} → 403 (path traversal blocked)`, true);
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    if (fs.existsSync(filePath + '.html')) {
      filePath = filePath + '.html';
    } else {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h1>404 Not Found</h1>');
      addServerLog(`GET ${logPath} → 404`, true);
      return;
    }
  }

  serveFile(res, filePath, logPath);
  });
}

// ============================================================================
// File Watcher
// ============================================================================

let fileWatcher = null;
let debounceTimer = null;
let ignorePatterns = [];

function setupFileWatcher() {
  if (fileWatcher) fileWatcher.close();

  // Load gitignore patterns before setting up the watcher
  ignorePatterns = loadGitignorePatterns([STATIC_DIR, PROJECT_ROOT]);
  if (ignorePatterns.length > 0) {
    addLog(`Loaded ${ignorePatterns.length} ignore patterns from .gitignore`, 'info');
  }

  try {
    fileWatcher = fs.watch(STATIC_DIR, { recursive: true }, (eventType, filename) => {
      if (!filename) return;

      // Skip ignored files (.git directory and gitignore patterns)
      if (shouldIgnoreFile(filename, ignorePatterns)) {
        return;
      }

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        addLog(`File changed: ${filename}`, 'info');
        notifyClients();
        render();
      }, 100);
    });

    fileWatcher.on('error', (err) => {
      addLog(`File watcher error: ${err.message}`, 'error');
    });
  } catch (err) {
    addLog(`Could not set up file watcher: ${err.message}`, 'error');
  }
}

// ============================================================================
// Keyboard Input
// ============================================================================

// applySearchFilter — replaced by filterBranches import (src/ui/renderer.js)

// Apply state updates from action handlers to store
function applyUpdates(updates) {
  if (!updates) return false;
  store.setState(updates);
  return true;
}

// Build current state snapshot for action handlers
function getActionState() {
  return store.getState();
}

function setupKeyboardInput() {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', async (key) => {
    // Handle search mode input via actions module
    if (store.get('searchMode')) {
      const searchResult = actions.handleSearchInput(getActionState(), key);
      if (searchResult) {
        applyUpdates(searchResult);
        render();
        return;
      }
      // Allow nav keys in search mode
      if (key !== '\u001b[A' && key !== '\u001b[B') {
        return;
      }
    }

    // Handle modal modes
    if (store.get('previewMode')) {
      if (key === 'v' || key === '\u001b' || key === '\r' || key === '\n') {
        applyUpdates(actions.togglePreview(getActionState()));
        render();
        return;
      }
      return; // Ignore other keys in preview mode
    }

    if (store.get('historyMode')) {
      if (key === 'h' || key === '\u001b') {
        applyUpdates(actions.toggleHistory(getActionState()));
        render();
        return;
      }
      if (key === 'u') {
        store.setState({ historyMode: false });
        await undoLastSwitch();
        await pollGitChanges();
        return;
      }
      return; // Ignore other keys in history mode
    }

    if (store.get('infoMode')) {
      if (key === 'i' || key === '\u001b') {
        applyUpdates(actions.toggleInfo(getActionState()));
        render();
        return;
      }
      return; // Ignore other keys in info mode
    }

    if (store.get('logViewMode')) {
      if (key === 'l' || key === '\u001b') {
        applyUpdates(actions.toggleLogView(getActionState()));
        render();
        return;
      }
      if (key === '1') { // Switch to activity tab
        applyUpdates(actions.switchLogTab(getActionState(), 'activity'));
        render();
        return;
      }
      if (key === '2') { // Switch to server tab
        applyUpdates(actions.switchLogTab(getActionState(), 'server'));
        render();
        return;
      }
      if (key === '\u001b[A' || key === 'k') { // Up - scroll
        applyUpdates(actions.scrollLog(getActionState(), 'up'));
        render();
        return;
      }
      if (key === '\u001b[B' || key === 'j') { // Down - scroll
        applyUpdates(actions.scrollLog(getActionState(), 'down'));
        render();
        return;
      }
      if (key === 'R' && SERVER_MODE === 'command') { // Restart server from log view
        restartServerProcess();
        render();
        return;
      }
      return; // Ignore other keys in log view mode
    }

    if (store.get('actionMode')) {
      if (key === '\u001b') { // Escape to close
        applyUpdates(actions.closeActionModal(getActionState()));
        render();
        return;
      }
      const currentActionData = store.get('actionData');
      if (!currentActionData) return;
      const { branch: aBranch, sessionUrl, prInfo, hasGh, hasGlab, ghAuthed, glabAuthed, webUrl, platform, prLoaded } = currentActionData;
      const cliReady = (platform === 'gitlab') ? (hasGlab && glabAuthed) : (hasGh && ghAuthed);
      const prLabel = platform === 'gitlab' ? 'MR' : 'PR';

      // Helper to extract the base repo URL from a branch-specific URL
      const repoUrl = webUrl ? webUrl.replace(/\/tree\/.*$/, '') : null;

      if (key === 'b' && webUrl) { // Open branch on web host
        addLog(`Opening ${webUrl}`, 'info');
        openInBrowser(webUrl);
        render();
        return;
      }
      if (key === 'c' && sessionUrl) { // Open Claude session
        addLog(`Opening Claude session...`, 'info');
        openInBrowser(sessionUrl);
        render();
        return;
      }
      if (key === 'p') { // Create or view PR
        if (prInfo && repoUrl) {
          // View existing PR on web
          const prUrl = platform === 'gitlab'
            ? `${repoUrl}/-/merge_requests/${prInfo.number}`
            : `${repoUrl}/pull/${prInfo.number}`;
          addLog(`Opening ${prLabel} #${prInfo.number}...`, 'info');
          openInBrowser(prUrl);
        } else if (!prInfo && prLoaded && cliReady) {
          // Create PR — only if we've confirmed no PR exists (prLoaded=true)
          telemetry.capture('pr_action', { action: 'create' });
          addLog(`Creating ${prLabel} for ${aBranch.name}...`, 'update');
          render();
          try {
            let result;
            if (platform === 'gitlab') {
              result = await execCli('glab', ['mr', 'create', `--source-branch=${aBranch.name}`, '--fill', '--yes']);
            } else {
              result = await execCli('gh', ['pr', 'create', '--head', aBranch.name, '--fill']);
            }
            addLog(`${prLabel} created: ${(result.stdout || '').trim().split('\n').pop()}`, 'success');
            // Invalidate cache and refresh modal data
            prInfoCache.delete(aBranch.name);
            const refreshedData = gatherLocalActionData(aBranch);
            store.setState({ actionData: refreshedData, actionLoading: true });
            render();
            loadAsyncActionData(aBranch, refreshedData).then((fullData) => {
              if (store.get('actionMode') && store.get('actionData') && store.get('actionData').branch.name === aBranch.name) {
                store.setState({ actionData: fullData, actionLoading: false });
                render();
              }
            }).catch(() => {});
          } catch (e) {
            const msg = (e && e.stderr) || (e && e.message) || String(e);
            addLog(`Failed to create ${prLabel}: ${msg.split('\n')[0]}`, 'error');
          }
        } else if (!prLoaded) {
          addLog(`Still loading ${prLabel} info...`, 'info');
        }
        render();
        return;
      }
      if (key === 'd' && prInfo && repoUrl) { // View diff on web
        const diffUrl = platform === 'gitlab'
          ? `${repoUrl}/-/merge_requests/${prInfo.number}/diffs`
          : `${repoUrl}/pull/${prInfo.number}/files`;
        addLog(`Opening ${prLabel} #${prInfo.number} diff...`, 'info');
        openInBrowser(diffUrl);
        render();
        return;
      }
      if (key === 'a' && prInfo && cliReady) { // Approve PR
        telemetry.capture('pr_action', { action: 'approve' });
        addLog(`Approving ${prLabel} #${prInfo.number}...`, 'update');
        render();
        try {
          if (platform === 'gitlab') {
            await execCli('glab', ['mr', 'approve', String(prInfo.number)]);
          } else {
            await execCli('gh', ['pr', 'review', String(prInfo.number), '--approve']);
          }
          addLog(`${prLabel} #${prInfo.number} approved`, 'success');
          // Refresh PR info to show updated status
          prInfoCache.delete(aBranch.name);
        } catch (e) {
          const msg = (e && e.stderr) || (e && e.message) || String(e);
          addLog(`Failed to approve: ${msg.split('\n')[0]}`, 'error');
        }
        render();
        return;
      }
      if (key === 'm' && prInfo && cliReady) { // Merge PR
        telemetry.capture('pr_action', { action: 'merge' });
        addLog(`Merging ${prLabel} #${prInfo.number}...`, 'update');
        render();
        try {
          if (platform === 'gitlab') {
            await execCli('glab', ['mr', 'merge', String(prInfo.number), '--squash', '--remove-source-branch', '--yes']);
          } else {
            await execCli('gh', ['pr', 'merge', String(prInfo.number), '--squash', '--delete-branch']);
          }
          addLog(`${prLabel} #${prInfo.number} merged`, 'success');
          store.setState({ actionMode: false, actionData: null, actionLoading: false });
          prInfoCache.delete(aBranch.name);
          // Force-refresh bulk PR statuses so inline indicators update immediately
          lastPrStatusFetch = 0;
          await pollGitChanges();
        } catch (e) {
          const msg = (e && e.stderr) || (e && e.message) || String(e);
          addLog(`Failed to merge: ${msg.split('\n')[0]}`, 'error');
        }
        render();
        return;
      }
      if (key === 'i' && cliReady) { // CI status
        addLog(`Checking CI for ${aBranch.name}...`, 'info');
        render();
        try {
          if (platform === 'gitlab') {
            const result = await execCli('glab', ['ci', 'status', '--branch', aBranch.name]);
            const lines = (result.stdout || '').trim().split('\n');
            for (const line of lines.slice(0, 3)) {
              addLog(line.trim(), 'info');
            }
          } else if (prInfo) {
            const result = await execCli('gh', ['pr', 'checks', String(prInfo.number)]);
            const lines = (result.stdout || '').trim().split('\n');
            for (const line of lines.slice(0, 5)) {
              addLog(line.trim(), 'info');
            }
          } else {
            addLog(`No open ${prLabel} — CI status requires an open ${prLabel} on GitHub`, 'info');
          }
        } catch (e) {
          // gh pr checks exits non-zero when checks fail — stdout still has useful info
          const output = (e && e.stdout) || '';
          if (output.trim()) {
            const lines = output.trim().split('\n');
            for (const line of lines.slice(0, 5)) {
              addLog(line.trim(), 'info');
            }
          } else {
            const msg = (e && e.stderr) || (e && e.message) || String(e);
            addLog(`CI check failed: ${msg.split('\n')[0]}`, 'error');
          }
        }
        render();
        return;
      }
      return; // Ignore other keys in action mode
    }

    // Handle cleanup confirmation dialog
    if (store.get('cleanupConfirmMode')) {
      const cleanupBranches = store.get('cleanupBranches') || [];
      const maxOptions = cleanupBranches.length > 0 ? 3 : 1;
      if (key === '\u001b[A' || key === 'k') { // Up
        const idx = store.get('cleanupSelectedIndex') || 0;
        if (idx > 0) {
          store.setState({ cleanupSelectedIndex: idx - 1 });
          render();
        }
        return;
      }
      if (key === '\u001b[B' || key === 'j') { // Down
        const idx = store.get('cleanupSelectedIndex') || 0;
        if (idx < maxOptions - 1) {
          store.setState({ cleanupSelectedIndex: idx + 1 });
          render();
        }
        return;
      }
      if (key === '\r' || key === '\n') { // Enter — execute selected option
        const idx = store.get('cleanupSelectedIndex') || 0;
        applyUpdates(actions.closeCleanupConfirm(getActionState()));
        render();
        if (cleanupBranches.length === 0 || idx === maxOptions - 1) {
          // Cancel or Close (no branches)
          return;
        }
        const force = idx === 1; // 0=safe delete, 1=force delete, 2=cancel
        addLog(`Cleaning up ${cleanupBranches.length} stale branch${cleanupBranches.length === 1 ? '' : 'es'}${force ? ' (force)' : ''}...`, 'update');
        render();
        const result = await deleteGoneBranches(cleanupBranches, { force });
        for (const name of result.deleted) {
          addLog(`Deleted branch: ${name}`, 'success');
        }
        for (const f of result.failed) {
          addLog(`Failed to delete ${f.name}: ${f.error}`, 'error');
        }
        if (result.deleted.length > 0) {
          telemetry.capture('cleanup_branches_deleted', { count: result.deleted.length });
          addLog(`Cleaned up ${result.deleted.length} branch${result.deleted.length === 1 ? '' : 'es'}`, 'success');
          await pollGitChanges();
        }
        render();
        return;
      }
      if (key === '\u001b') { // Escape — cancel
        applyUpdates(actions.closeCleanupConfirm(getActionState()));
        render();
        return;
      }
      return; // Ignore other keys in cleanup mode
    }

    // Handle update notification modal
    if (store.get('updateModalVisible')) {
      if (store.get('updateInProgress')) {
        return; // Block all keys while update is running
      }
      if (key === '\u001b') {
        store.setState({ updateModalVisible: false, updateModalSelectedIndex: 0 });
        render();
        return;
      }
      if (key === '\u001b[A' || key === 'k') { // Up
        const idx = store.get('updateModalSelectedIndex');
        if (idx > 0) {
          store.setState({ updateModalSelectedIndex: idx - 1 });
          render();
        }
        return;
      }
      if (key === '\u001b[B' || key === 'j') { // Down
        const idx = store.get('updateModalSelectedIndex');
        if (idx < 1) {
          store.setState({ updateModalSelectedIndex: idx + 1 });
          render();
        }
        return;
      }
      if (key === '\r' || key === '\n') {
        const selectedIdx = store.get('updateModalSelectedIndex') || 0;
        if (selectedIdx === 0) {
          // Update now — run npm i -g git-watchtower
          store.setState({ updateInProgress: true });
          render();
          const { spawn } = require('child_process');
          const child = spawn('npm', ['i', '-g', 'git-watchtower'], {
            stdio: 'ignore',
            detached: false,
            shell: process.platform === 'win32',
          });
          child.on('close', (code) => {
            store.setState({ updateInProgress: false, updateModalVisible: false, updateModalSelectedIndex: 0 });
            if (code === 0) {
              store.setState({ updateAvailable: null });
              addLog('Successfully updated git-watchtower! Restart to use new version.', 'update');
              showFlash('Updated! Restart to use new version.');
            } else {
              addLog(`Update failed (exit code ${code}). Run manually: npm i -g git-watchtower`, 'error');
              showFlash('Update failed. Try manually: npm i -g git-watchtower');
            }
            render();
          });
          child.on('error', (err) => {
            store.setState({ updateInProgress: false, updateModalVisible: false, updateModalSelectedIndex: 0 });
            addLog(`Update failed: ${err.message}. Run manually: npm i -g git-watchtower`, 'error');
            showFlash('Update failed. Try manually: npm i -g git-watchtower');
            render();
          });
        } else {
          // Show update command — dismiss modal with flash showing the command
          store.setState({ updateModalVisible: false, updateModalSelectedIndex: 0 });
          showFlash('Run: npm i -g git-watchtower');
        }
        return;
      }
      return; // Block all other keys while modal is shown
    }

    // Handle stash confirmation dialog
    if (store.get('stashConfirmMode')) {
      if (key === '\u001b[A' || key === 'k') { // Up
        const idx = store.get('stashConfirmSelectedIndex');
        if (idx > 0) {
          store.setState({ stashConfirmSelectedIndex: idx - 1 });
          render();
        }
        return;
      }
      if (key === '\u001b[B' || key === 'j') { // Down
        const idx = store.get('stashConfirmSelectedIndex');
        if (idx < 1) {
          store.setState({ stashConfirmSelectedIndex: idx + 1 });
          render();
        }
        return;
      }
      if (key === '\r' || key === '\n') { // Enter — execute selected option
        const idx = store.get('stashConfirmSelectedIndex');
        hideStashConfirm();
        if (idx === 0 && pendingDirtyOperation) {
          await stashAndRetry();
        } else {
          addLog('Stash cancelled — handle changes manually', 'info');
          pendingDirtyOperation = null;
        }
        return;
      }
      if (key === 'S') { // S shortcut — stash directly
        hideStashConfirm();
        if (pendingDirtyOperation) {
          await stashAndRetry();
        }
        return;
      }
      if (key === '\u001b') { // Escape — cancel
        hideStashConfirm();
        addLog('Stash cancelled — handle changes manually', 'info');
        pendingDirtyOperation = null;
        render();
        return;
      }
      return; // Ignore other keys in stash confirm mode
    }

    // Dismiss flash on any key
    if (store.get('flashMessage')) {
      hideFlash();
      if (key !== '\u001b[A' && key !== '\u001b[B' && key !== '\r' && key !== 'q') {
        return;
      }
    }

    // Dismiss error toast on any key (S triggers stash if pending)
    if (store.get('errorToast')) {
      if (key === 'S' && pendingDirtyOperation) {
        await stashAndRetry();
        return;
      }
      hideErrorToast();
      if (key !== '\u001b[A' && key !== '\u001b[B' && key !== '\r' && key !== 'q') {
        return;
      }
    }

    const { filteredBranches: currentFiltered, branches: currentBranchList, selectedIndex: curSelIdx } = store.getState();
    const displayBranches = currentFiltered !== null ? currentFiltered : currentBranchList;
    const actionState = getActionState();

    switch (key) {
      case '\u001b[A': // Up arrow
      case 'k': {
        const result = actions.moveUp(actionState);
        if (result) { applyUpdates(result); render(); }
        break;
      }

      case '\u001b[B': // Down arrow
      case 'j': {
        const result = actions.moveDown(actionState);
        if (result) { applyUpdates(result); render(); }
        break;
      }

      case '\r': // Enter
      case '\n':
        if (displayBranches.length > 0 && curSelIdx < displayBranches.length) {
          const branch = displayBranches[curSelIdx];
          if (branch.isDeleted) {
            addLog(`Cannot switch to deleted branch: ${branch.name}`, 'error');
            render();
          } else if (branch.name !== store.get('currentBranch')) {
            // Clear search when switching
            store.setState({ searchQuery: '', filteredBranches: null, searchMode: false });
            await switchToBranch(branch.name);
            await pollGitChanges();
          }
        }
        break;

      case 'v': // Preview pane
        if (displayBranches.length > 0 && curSelIdx < displayBranches.length) {
          const branch = displayBranches[curSelIdx];
          addLog(`Loading preview for ${branch.name}...`, 'info');
          render();
          const pvData = await getPreviewData(branch.name);
          store.setState({ previewData: pvData, previewMode: true });
          telemetry.capture('preview_opened');
          render();
        }
        break;

      case '/': // Search mode
        applyUpdates(actions.enterSearchMode(actionState));
        telemetry.capture('search_used');
        render();
        break;

      case 'h': // History
        applyUpdates(actions.toggleHistory(actionState));
        render();
        break;

      case 'i': // Server info
        applyUpdates(actions.toggleInfo(actionState));
        render();
        break;

      case 'u': // Undo last switch
        telemetry.capture('undo_branch_switch');
        await undoLastSwitch();
        await pollGitChanges();
        break;

      case 'p':
        telemetry.capture('pull_forced');
        await pullCurrentBranch();
        await pollGitChanges();
        break;

      case 'r':
        if (SERVER_MODE === 'static') {
          addLog('Force reloading all browsers...', 'update');
          notifyClients();
          render();
        }
        break;

      case 'R': // Restart server (command mode)
        if (SERVER_MODE === 'command') {
          restartServerProcess();
          render();
        }
        break;

      case 'l': { // View server logs
        const logResult = actions.toggleLogView(actionState);
        if (logResult) { applyUpdates(logResult); render(); }
        break;
      }

      case 'o': // Open live server in browser
        if (!NO_SERVER) {
          const serverUrl = `http://localhost:${PORT}`;
          addLog(`Opening ${serverUrl} in browser...`, 'info');
          openInBrowser(serverUrl);
          render();
        }
        break;

      case 'b': { // Branch action modal
        const branch = displayBranches.length > 0 && curSelIdx < displayBranches.length
          ? displayBranches[curSelIdx] : null;
        if (branch) {
          telemetry.capture('branch_actions_opened');
          // Phase 1: Open modal instantly with local/cached data
          const localData = gatherLocalActionData(branch);
          store.setState({ actionData: localData, actionMode: true, actionLoading: !localData.prLoaded });
          render();

          // Phase 2: Load async data (session URL, PR info) in background
          loadAsyncActionData(branch, localData).then((fullData) => {
            // Only update if modal is still open for the same branch
            if (store.get('actionMode') && store.get('actionData') && store.get('actionData').branch.name === branch.name) {
              store.setState({ actionData: fullData, actionLoading: false });
              render();
            }
          }).catch(() => {
            if (store.get('actionMode') && store.get('actionData') && store.get('actionData').branch.name === branch.name) {
              store.setState({ actionLoading: false });
              render();
            }
          });
        }
        break;
      }

      case 'f':
        addLog('Fetching all branches...', 'update');
        await pollGitChanges();
        // Refresh sparklines on manual fetch
        addLog('Refreshing activity sparklines...', 'info');
        lastSparklineUpdate = 0; // Force refresh
        await refreshAllSparklines();
        render();
        break;

      case 's': {
        applyUpdates(actions.toggleSound(actionState));
        const soundNowEnabled = store.get('soundEnabled');
        addLog(`Sound notifications ${soundNowEnabled ? 'enabled' : 'disabled'}`, 'info');
        telemetry.capture('sound_toggled', { enabled: soundNowEnabled });
        if (soundNowEnabled) playSound();
        render();
        break;
      }

      case 'S': // Stash changes — open confirm dialog or show hint
        if (pendingDirtyOperation) {
          const label = pendingDirtyOperation.type === 'switch'
            ? `switch to ${pendingDirtyOperation.branch}`
            : 'pull';
          showStashConfirm(label);
        } else {
          showFlash('No pending operation — stash with S after a failed switch or pull');
        }
        break;

      case 'c': { // Toggle casino mode
        const newCasinoState = casino.toggle();
        store.setState({ casinoModeEnabled: newCasinoState });
        telemetry.capture('casino_mode_toggled', { enabled: newCasinoState });
        addLog(`Casino mode ${newCasinoState ? '🎰 ENABLED' : 'disabled'}`, newCasinoState ? 'success' : 'info');
        if (newCasinoState) {
          addLog(`Have you noticed this game has that 'variable rewards' thing going on? 🤔😉`, 'info');
          if (store.get('soundEnabled')) {
            casinoSounds.playJackpot();
          }
        }
        render();
        break;
      }

      case 'd': { // Cleanup stale branches (remotes deleted)
        addLog('Scanning for stale branches...', 'info');
        render();
        const goneBranches = await getGoneBranches();
        applyUpdates(actions.openCleanupConfirm(actionState, goneBranches));
        render();
        break;
      }

      case 'W': { // Toggle web dashboard
        if (webDashboard || worker) {
          const wasPort = stopWebDashboard();
          addLog(`Web dashboard stopped (was on :${wasPort})`, 'info');
          showFlash('Web dashboard stopped');
          render();
        } else {
          startWebDashboard(true).then(() => {
            showFlash(`Web dashboard on :${WEB_PORT}`);
          }).catch(() => {});
        }
        break;
      }

      // Number keys to set visible branch count
      case '1': case '2': case '3': case '4': case '5':
      case '6': case '7': case '8': case '9':
        applyUpdates(actions.setVisibleBranchCount(actionState, parseInt(key, 10)));
        addLog(`Showing ${store.get('visibleBranchCount')} branches`, 'info');
        render();
        break;

      case '0': // 0 = 10 branches
        applyUpdates(actions.setVisibleBranchCount(actionState, 10));
        addLog(`Showing ${store.get('visibleBranchCount')} branches`, 'info');
        render();
        break;

      case '+':
      case '=': { // = key (same key as + without shift)
        const incResult = actions.increaseVisibleBranches(actionState, getMaxBranchesForScreen());
        if (incResult) {
          applyUpdates(incResult);
          addLog(`Showing ${store.get('visibleBranchCount')} branches`, 'info');
          render();
        }
        break;
      }

      case '-':
      case '_': { // _ key (same key as - with shift)
        const decResult = actions.decreaseVisibleBranches(actionState);
        if (decResult) {
          applyUpdates(decResult);
          addLog(`Showing ${store.get('visibleBranchCount')} branches`, 'info');
          render();
        }
        break;
      }

      case 'q':
      case '\u0003': // Ctrl+C
        await shutdown();
        break;

      case '\u001b': { // Escape - clear search if active, otherwise quit
        const escResult = actions.handleEscape(actionState);
        if (escResult && escResult._quit) {
          await shutdown();
        } else if (escResult) {
          applyUpdates(escResult);
          render();
        }
        break;
      }
    }
  });
}

// ============================================================================
// Web Dashboard
// ============================================================================

/**
 * Handle an action from the web dashboard.
 */
async function handleWebAction(action, payload) {
  const sendResult = (success, message) => {
    if (webDashboard) webDashboard.sendActionResult({ action, success, message });
  };

  try {
    switch (action) {
      case 'switchBranch':
        if (payload.branch && payload.branch !== store.get('currentBranch')) {
          await switchToBranch(payload.branch);
          await pollGitChanges();
          sendResult(true, `Switched to ${payload.branch}`);
        }
        break;
      case 'pull':
        addLog('Force pulling (from web)...', 'update');
        render();
        await pullCurrentBranch();
        await pollGitChanges();
        sendResult(true, 'Pull complete');
        break;
      case 'fetch':
        addLog('Fetching all branches (from web)...', 'info');
        render();
        await pollGitChanges();
        await refreshAllSparklines();
        render();
        sendResult(true, 'Fetch complete');
        break;
      case 'undo': {
        const last = store.getLastSwitch();
        if (last) {
          await switchToBranch(last.from);
          store.popHistory();
          await pollGitChanges();
          sendResult(true, `Switched back to ${last.from}`);
        } else {
          sendResult(false, 'No switch to undo');
        }
        break;
      }
      case 'toggleSound': {
        const current = store.get('soundEnabled');
        store.setState({ soundEnabled: !current });
        render();
        sendResult(true, current ? 'Sound off' : 'Sound on');
        break;
      }
      case 'toggleCasino': {
        const casinoOn = store.get('casinoModeEnabled');
        store.setState({ casinoModeEnabled: !casinoOn });
        if (!casinoOn) casino.enable(); else casino.disable();
        render();
        sendResult(true, casinoOn ? 'Casino mode off' : 'Casino mode on');
        break;
      }
      case 'restartServer':
        if (SERVER_MODE === 'command') {
          addLog('Restarting server (from web)...', 'update');
          restartServerProcess();
          render();
          sendResult(true, 'Server restarting');
        } else {
          sendResult(false, 'Not in command mode');
        }
        break;
      case 'reloadBrowsers':
        if (SERVER_MODE === 'static') {
          addLog('Force reloading browsers (from web)...', 'update');
          notifyClients();
          render();
          sendResult(true, 'Browsers reloaded');
        } else {
          sendResult(false, 'Not in static mode');
        }
        break;
      case 'openBrowser':
        if (!NO_SERVER) {
          openInBrowser(`http://localhost:${PORT}`);
          sendResult(true, 'Opened in browser');
        }
        break;
      case 'preview':
        if (payload.branch) {
          const pvData = await getPreviewData(payload.branch);
          if (webDashboard) {
            webDashboard.sendPreview({ branch: payload.branch, ...pvData });
          }
        }
        break;
    }
  } catch (err) {
    addLog(`Web action error: ${err.message}`, 'error');
    sendResult(false, err.message);
    render();
  }
}

/**
 * Create and start the web dashboard, with coordinator support.
 * @param {boolean} openBrowser - Whether to auto-open the browser
 */
async function startWebDashboard(openBrowser) {
  projectId = generateProjectId(PROJECT_ROOT);

  webDashboard = new WebDashboardServer({
    port: WEB_PORT,
    store,
    getExtraState: () => ({
      clientCount: clients.size,
      sessionStats: sessionStats.getStats(),
    }),
    onAction: handleWebAction,
  });
  webDashboard.setLocalProjectId(projectId);

  // Resolve and cache the repo web URL for link building in the web UI
  getRemoteWebUrl(null).then((url) => {
    if (url) webDashboard.setRepoWebUrl(url);
  }).catch(() => {});

  // Check if a coordinator is already running
  const existing = getActiveCoordinator();

  if (existing) {
    // Connect as a worker to the existing coordinator
    try {
      worker = new Worker({
        id: projectId,
        projectPath: PROJECT_ROOT,
        projectName: path.basename(PROJECT_ROOT),
        socketPath: existing.socketPath,
      });
      worker.onCommand = (action, payload) => handleWebAction(action, payload);
      await worker.connect();
      addLog(`Joined web dashboard at http://localhost:${existing.port} (tab)`, 'success');

      // Push state periodically
      webStateInterval = setInterval(() => {
        if (worker && worker.isConnected()) {
          worker.pushState(webDashboard.getSerializableState());
        } else {
          clearInterval(webStateInterval);
          webStateInterval = null;
        }
      }, 500);

      // Don't start our own server — piggyback on the coordinator's.
      // Don't open browser either — the existing tab will show this project automatically.
      WEB_PORT = existing.port;
      render();
      return;
    } catch (err) {
      // Couldn't connect — become coordinator instead
      worker = null;
    }
  }

  // We are the coordinator
  try {
    coordinator = new Coordinator();
    coordinator.onProjectsChanged = (projects) => {
      if (webDashboard) webDashboard.setProjects(projects);
    };
    coordinator.onActionRequest = (pId, action, payload) => {
      if (pId === projectId) {
        handleWebAction(action, payload);
      }
    };
    await coordinator.start();
    coordinator.registerLocal(projectId, PROJECT_ROOT, path.basename(PROJECT_ROOT), webDashboard.getSerializableState());

    // Update coordinator with our latest state periodically
    webStateInterval = setInterval(() => {
      if (coordinator && webDashboard) {
        coordinator.updateLocal(projectId, webDashboard.getSerializableState());
      } else {
        clearInterval(webStateInterval);
        webStateInterval = null;
      }
    }, 500);

    const { port } = await webDashboard.start();
    WEB_PORT = port;
    writeLock(process.pid, port, coordinator.socketPath);

    addLog(`Web dashboard: http://localhost:${port}`, 'success');
    if (openBrowser) openInBrowser(`http://localhost:${port}`);
    render();
  } catch (err) {
    addLog(`Web dashboard failed: ${err.message}`, 'error');
    webDashboard = null;
    coordinator = null;
    render();
  }
}

/**
 * Stop the web dashboard and coordinator/worker.
 */
function stopWebDashboard() {
  const wasPort = webDashboard ? webDashboard.port : WEB_PORT;

  if (webStateInterval) {
    clearInterval(webStateInterval);
    webStateInterval = null;
  }
  if (worker) {
    worker.disconnect();
    worker = null;
  }
  if (coordinator) {
    coordinator.stop();
    coordinator = null;
  }
  if (webDashboard) {
    webDashboard.stop();
    webDashboard = null;
  }
  projectId = null;

  return wasPort;
}

// ============================================================================
// Shutdown
// ============================================================================

let isShuttingDown = false;

async function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  // Restore terminal
  write(ansi.showCursor);
  write(ansi.restoreScreen);
  restoreTerminalTitle();

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }

  if (fileWatcher) fileWatcher.close();
  if (pollIntervalId) clearTimeout(pollIntervalId);

  // Stop server based on mode
  if (SERVER_MODE === 'command') {
    stopServerProcess();
  } else if (SERVER_MODE === 'static') {
    clients.forEach(client => client.end());
    clients.clear();

    const serverClosePromise = new Promise(resolve => server.close(resolve));
    const timeoutPromise = new Promise(resolve => setTimeout(resolve, 2000));
    await Promise.race([serverClosePromise, timeoutPromise]);
  }

  // Stop web dashboard and coordinator
  stopWebDashboard();

  // Flush telemetry
  telemetry.capture('session_ended', {
    duration_seconds: sessionStartTime ? Math.round((Date.now() - sessionStartTime) / 1000) : 0,
    branch_switches: branchSwitchCount,
    branches_count: store.get('branches').length,
  });
  await telemetry.shutdown();

  console.log('\n✓ Git Watchtower stopped\n');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', async (err) => {
  telemetry.captureError(err);
  write(ansi.showCursor);
  write(ansi.restoreScreen);
  restoreTerminalTitle();
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  console.error('Uncaught exception:', err);
  await telemetry.shutdown();
  process.exit(1);
});

// ============================================================================
// Startup
// ============================================================================

async function start() {
  // Check if git is available
  const gitAvailable = await checkGitAvailable();
  if (!gitAvailable) {
    console.error('\n' + ansi.red + ansi.bold + '✗ Error: Git is not installed or not in PATH' + ansi.reset);
    console.error('\n  Git Watchtower requires Git to be installed.');
    console.error('  Install Git from: https://git-scm.com/downloads\n');
    process.exit(1);
  }

  // Load or create configuration
  const config = await ensureConfig(cliArgs);
  applyConfig(config);

  // Telemetry: set version early so consent events include $lib_version
  telemetry.setVersion(PACKAGE_VERSION);
  await telemetry.promptIfNeeded(promptYesNo);
  telemetry.init({ version: PACKAGE_VERSION });
  sessionStartTime = Date.now();
  telemetry.capture('tool_launched', {
    version: PACKAGE_VERSION,
    node_version: process.version,
    os: process.platform,
    server_mode: SERVER_MODE,
    has_config: !!loadConfig(),
    casino_mode: config.casinoMode || false,
  });

  // Set up casino mode render callback for animations
  casino.setRenderCallback(render);

  // Check for remote before starting TUI
  const hasRemote = await checkRemoteExists();
  if (!hasRemote) {
    console.error('\n' + ansi.red + ansi.bold + '✗ Error: No Git remote configured' + ansi.reset);
    console.error('\n  Git Watchtower requires a Git remote to watch for updates.');
    console.error('  Add a remote with:\n');
    console.error(`    git remote add ${REMOTE_NAME} <repository-url>\n`);
    process.exit(1);
  }

  // Save screen and hide cursor
  write(ansi.saveScreen);
  write(ansi.hideCursor);

  // Set terminal tab title to show project name
  const projectName = path.basename(PROJECT_ROOT);
  setTerminalTitle(`Git Watchtower - ${projectName}`);

  // Check static directory (only needed when static server is running)
  if (SERVER_MODE === 'static' && !fs.existsSync(STATIC_DIR)) {
    fs.mkdirSync(STATIC_DIR, { recursive: true });
  }

  // Get initial state
  const initBranch = await getCurrentBranch();
  store.setState({ currentBranch: initBranch });

  // Warn if in detached HEAD state
  if (store.get('isDetachedHead')) {
    addLog(`Warning: In detached HEAD state`, 'warning');
  }
  const initBranches = await getAllBranches();
  store.setState({ branches: initBranches });

  // Initialize previous states and known branches
  for (const branch of initBranches) {
    previousBranchStates.set(branch.name, branch.commit);
    knownBranchNames.add(branch.name);
  }

  // Find current branch in list and select it
  const currentIndex = initBranches.findIndex(b => b.name === initBranch);
  if (currentIndex >= 0) {
    store.setState({ selectedIndex: currentIndex, selectedBranchName: initBranch });
  } else if (initBranches.length > 0) {
    store.setState({ selectedBranchName: initBranches[0].name });
  }

  // Detect default branch for ahead/behind counts, then fetch initial data
  detectDefaultBranch().then(() => {
    fetchAheadBehindForBranches(initBranches).catch(() => {});
  }).catch(() => {});

  // Load sparklines and action cache in background
  refreshAllSparklines().catch(() => {});
  initActionCache().then(() => {
    // Once env is known, kick off initial PR status fetch
    fetchAllPrStatuses().then(map => {
      if (map) {
        store.setState({ branchPrStatusMap: map });
        lastPrStatusFetch = Date.now();
        render();
      }
    }).catch(() => {});
  }).catch(() => {});

  // Start server based on mode
  const startBranchName = store.get('currentBranch');
  if (SERVER_MODE === 'none') {
    addLog(`Running in no-server mode (branch monitoring only)`, 'info');
    addLog(`Current branch: ${startBranchName}`, 'info');
    render();
  } else if (SERVER_MODE === 'command') {
    addLog(`Command mode: ${SERVER_COMMAND}`, 'info');
    addLog(`Current branch: ${startBranchName}`, 'info');
    render();
    // Start the user's dev server
    startServerProcess();
  } else {
    // Static mode
    server = createStaticServer();
    server.listen(PORT, '127.0.0.1', () => {
      addLog(`Server started on http://localhost:${PORT}`, 'success');
      addLog(`Serving ${STATIC_DIR.replace(PROJECT_ROOT, '.')}`, 'info');
      addLog(`Current branch: ${store.get('currentBranch')}`, 'info');
      // Add server log entries for static server
      addServerLog(`Static server started on http://localhost:${PORT}`);
      addServerLog(`Serving files from: ${STATIC_DIR.replace(PROJECT_ROOT, '.')}`);
      addServerLog(`Live reload enabled - waiting for browser connections...`);
      render();
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        addLog(`Port ${PORT} is already in use`, 'error');
        addLog(`Try a different port: git-watchtower -p ${PORT + 1}`, 'warning');
        addServerLog(`Error: Port ${PORT} is already in use`, true);
      } else {
        addLog(`Server error: ${err.message}`, 'error');
        addServerLog(`Error: ${err.message}`, true);
      }
      render();
    });

    // Setup file watcher (only for static mode)
    setupFileWatcher();
  }

  // Start web dashboard if enabled
  if (WEB_ENABLED) {
    await startWebDashboard(true);
  }

  // Setup keyboard input
  setupKeyboardInput();

  // Handle terminal resize
  process.stdout.on('resize', () => {
    updateTerminalSize();
    render();
  });

  // Start polling with adaptive interval (setTimeout-based to avoid queuing)
  schedulePoll();

  // Initial render
  render();

  // Check for newer version on npm (non-blocking, silent on failure)
  checkForUpdate().then((latestVersion) => {
    if (latestVersion) {
      store.setState({ updateAvailable: latestVersion, updateModalVisible: true });
      addLog(`New version available: ${latestVersion} \u2192 npm i -g git-watchtower`, 'update');
      render();
    }
  }).catch(() => {});

  // Re-check for updates periodically (every 4 hours) while running
  const periodicCheck = startPeriodicUpdateCheck((latestVersion) => {
    const alreadyKnown = store.get('updateAvailable');
    store.setState({ updateAvailable: latestVersion });
    if (!alreadyKnown) {
      // First time discovering an update during this session — show modal
      store.setState({ updateModalVisible: true });
      addLog(`New version available: ${latestVersion} \u2192 npm i -g git-watchtower`, 'update');
    }
    render();
  });

  // Clean up periodic check on exit
  process.on('exit', () => periodicCheck.stop());
}

start().catch(err => {
  write(ansi.showCursor);
  write(ansi.restoreScreen);
  restoreTerminalTitle();
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  console.error('Failed to start:', err);
  process.exit(1);
});
