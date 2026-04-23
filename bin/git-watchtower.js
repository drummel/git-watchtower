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
const { isGitAvailable: checkGitAvailable, execGit, execGitOptional, getDiffStats: getDiffStatsSafe, getAheadBehind, getDiffShortstat, hasUncommittedChanges: checkUncommittedChanges } = require('../src/git/commands');

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
const { Coordinator, Worker, generateProjectId, getActiveCoordinator, tryAcquireLock, finalizeLock, removeLock, removeSocket, isProcessAlive } = require('../src/server/coordinator');
const monitorLock = require('../src/utils/monitor-lock');
const { createPipeErrorHandler } = require('../src/utils/pipe-error');

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

// Timing constants (ms)
/** Grace period before SIGKILLing a process after SIGTERM. */
const FORCE_KILL_GRACE_MS = 3000;
/** Additional grace period added to a command's timeout before SIGKILL. */
const SIGKILL_GRACE_AFTER_TIMEOUT_MS = 5000;
/** Delay between stopping and restarting the dev server. */
const SERVER_RESTART_DELAY_MS = 500;
/** How long a transient flash message stays on screen. */
const FLASH_MESSAGE_DURATION_MS = 3000;
/** Debounce window for file watcher events before notifying clients. */
const FILE_WATCHER_DEBOUNCE_MS = 100;
/** Max time to wait for the static HTTP server to close on shutdown. */
const SERVER_CLOSE_TIMEOUT_MS = 2000;

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

// Periodic update check controller — hoisted to module scope so the exit
// handler can clean it up regardless of where in start() we are.
let periodicUpdateCheck = null;

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
  const prev = store.get('serverLogBuffer');
  // Drop the oldest entries to stay within MAX_SERVER_LOG_LINES after push
  const startIdx = Math.max(0, prev.length + 1 - MAX_SERVER_LOG_LINES);
  const serverLogBuffer = prev.slice(startIdx);
  serverLogBuffer.push(entry);
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

/**
 * Build a localhost URL for the given port.
 * Centralizes the `http://localhost:${port}` pattern so it's easy to adjust
 * (e.g. switch protocol or host) in one place.
 * @param {number} port
 * @returns {string}
 */
function localhostUrl(port) {
  return `http://localhost:${port}`;
}

// parseRemoteUrl, buildBranchUrl, detectPlatform, buildWebUrl, extractSessionUrl
// imported from src/git/remote.js

async function getRemoteWebUrl(branchName) {
  try {
    const { stdout } = await execGit(['remote', 'get-url', REMOTE_NAME], { cwd: PROJECT_ROOT });
    const parsed = parseRemoteUrl(stdout);
    return buildWebUrl(parsed, branchName);
  } catch (e) {
    // No remote configured, or URL isn't parseable as github/gitlab —
    // action modal hides the "view on web" link, nothing else breaks.
    return null;
  }
}

// Extract Claude Code session URL from the most recent commit on a branch
async function getSessionUrl(branchName) {
  // Try remote branch first, fall back to local
  const result = await execGitOptional(
    ['log', `${REMOTE_NAME}/${branchName}`, '-1', '--format=%B'],
    { cwd: PROJECT_ROOT }
  ) || await execGitOptional(
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
    } catch (e) { /* invalid webUrlBase — leave webUrl null, modal hides the link */ }
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

/**
 * Stop the user's dev-server child process and its entire process group.
 *
 * Returns a Promise that resolves when the process has actually exited (or a
 * hard cap elapses). Callers on async exit paths — shutdown(), uncaughtException,
 * unhandledRejection — must await this so the SIGKILL escalation timer fires
 * before process.exit() drops it. Synchronous callers (startServerProcess's
 * restart branch, the 'exit' fallback) can fire-and-forget; best effort only.
 */
function stopServerProcess() {
  if (!serverProcess) return Promise.resolve();

  addLog('Stopping server...', 'update');

  // Capture reference before nulling — needed for deferred SIGKILL
  const proc = serverProcess;
  serverProcess = null;
  store.setState({ serverRunning: false });

  // Resolves when the child actually exits
  const closedPromise = proc.exitCode !== null
    ? Promise.resolve()
    : new Promise((resolve) => { proc.once('close', () => resolve()); });

  // Hard cap so callers can never hang forever if 'close' never fires
  // (e.g. stdio pipe torn down, handle state corrupted). Grace period plus
  // a small buffer for SIGKILL delivery + OS reap of the process group.
  const hardCap = new Promise((resolve) => setTimeout(resolve, FORCE_KILL_GRACE_MS + 500));

  if (process.platform === 'win32') {
    // taskkill /f /t is already forceful and recursive; close should follow shortly
    spawn('taskkill', ['/pid', proc.pid.toString(), '/f', '/t']);
    return Promise.race([closedPromise, hardCap]);
  }

  // Kill the entire process group (negative PID) so that grandchildren
  // (e.g. npm -> node -> vite) are also terminated.
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
  }, FORCE_KILL_GRACE_MS);

  // Clear the force-kill timer if the process exits cleanly
  proc.once('close', () => {
    clearTimeout(forceKillTimeout);
  });

  return Promise.race([closedPromise, hardCap]);
}

function restartServerProcess() {
  addLog('Restarting server...', 'update');
  stopServerProcess();
  setTimeout(() => {
    startServerProcess();
    render();
  }, SERVER_RESTART_DELAY_MS);
}

// Network and polling state
let slowFetchWarningShown = false;
let verySlowFetchWarningShown = false;
let pollIntervalId = null;

// ANSI escape codes and box drawing imported from src/ui/ansi.js
const { ansi, box, truncate, sparkline: uiSparkline, visibleLength, stripAnsi, padRight, padLeft, getMaxBranchesForScreen: calcMaxBranches, drawBox: renderBox, clearArea: renderClearArea } = require('../src/ui/ansi');

// Error detection utilities imported from src/utils/errors.js
const { ErrorHandler, isAuthError, isMergeConflict, isNetworkError } = require('../src/utils/errors');
const { Mutex, sleep } = require('../src/utils/async');

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
 * For git commands, use execGit/execGitOptional from src/git/commands.js instead.
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
      }, timeout + SIGKILL_GRACE_AFTER_TIMEOUT_MS);
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
    // No remote HEAD and none of the common names exist — ahead/behind
    // is hidden entirely (fetchAheadBehindForBranches short-circuits on
    // a null detectedDefaultBranch).
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
  // Collapse any whitespace (newlines, tabs, CRs) into a single space so that
  // multi-line content (e.g. git stderr from a failed auto-pull) cannot leak
  // cursor movement into the rendered box and corrupt the surrounding UI.
  const safeMessage = String(message == null ? '' : message).replace(/\s+/g, ' ').trim();
  const entry = {
    message: safeMessage, type,
    timestamp: new Date().toLocaleTimeString(),
    icon: icons[type] || '○',
    color: colors[type] || 'white',
  };
  const prev = store.get('activityLog');
  // Drop the oldest entries to stay within MAX_LOG_ENTRIES after prepend
  const keepCount = Math.min(prev.length, MAX_LOG_ENTRIES - 1);
  const activityLog = new Array(keepCount + 1);
  activityLog[0] = entry;
  for (let i = 0; i < keepCount; i++) activityLog[i + 1] = prev[i];
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
      const sparkResult = await execGitOptional(
        ['log', `origin/${branch.name}`, '--since=7 days ago', '--format=%ad', '--date=format:%Y-%m-%d'],
        { cwd: PROJECT_ROOT }
      ) || await execGitOptional(
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
    const logResult = await execGitOptional(
      ['log', `origin/${branchName}`, '-5', '--oneline'],
      { cwd: PROJECT_ROOT }
    ) || await execGitOptional(
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
    const diffResult = await execGitOptional(
      ['diff', '--stat', '--name-only', `HEAD...origin/${branchName}`],
      { cwd: PROJECT_ROOT }
    ) || await execGitOptional(
      ['diff', '--stat', '--name-only', `HEAD...${branchName}`],
      { cwd: PROJECT_ROOT }
    );
    if (diffResult) {
      filesChanged = diffResult.stdout.split('\n').filter(Boolean).slice(0, 8);
    }

    return { commits, filesChanged };
  } catch (e) {
    // Preview pane is best-effort — branch may not exist on the remote yet,
    // refs may have been pruned mid-fetch. Empty pane is better than an
    // error toast for a background UI enrichment.
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
  // Strip control characters to prevent escape sequence injection
  const safe = String(title).replace(/[\x00-\x1f\x7f]/g, '');
  process.stdout.write(`\x1b]0;${safe}\x07`);
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
  }, FLASH_MESSAGE_DURATION_MS);
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

    // Capture HEAD before pull so we can diff against it when git pull
    // doesn't put a clean "already up to date" message on stdout.
    const preHead = await execGitOptional(['rev-parse', 'HEAD'], { cwd: PROJECT_ROOT });
    const oldCommit = preHead && preHead.stdout ? preHead.stdout.trim() : null;

    const result = await execGit(['pull', REMOTE_NAME, branch], { cwd: PROJECT_ROOT, timeout: 60000 });
    const pullOutput = `${result.stdout || ''}\n${result.stderr || ''}`;

    if (/already up[- ]to[- ]date/i.test(pullOutput)) {
      addLog(`Already up to date with ${REMOTE_NAME}/${branch}`, 'success');
    } else {
      // Prefer the summary line from git's own output (it's locale-sensitive
      // but matches how git reports its work). Fall back to a diff against
      // the old HEAD when git's summary line is missing (e.g. merge commit
      // without --stat).
      let summary = '';
      const diffStats = parseDiffStats(pullOutput);
      if (diffStats.added || diffStats.deleted) {
        summary = ` (+${diffStats.added}/-${diffStats.deleted})`;
      } else if (oldCommit) {
        const fallback = await getDiffStats(oldCommit, 'HEAD');
        if (fallback.added || fallback.deleted) {
          summary = ` (+${fallback.added}/-${fallback.deleted})`;
        }
      }
      addLog(`Pulled ${REMOTE_NAME}/${branch}${summary}`, 'success');
    }
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
        // gh/glab errored (unauthed, rate-limited, network). PR indicators
        // keep their last-known state; the next poll tick will retry.
        prStatusFetchInFlight = false;
      });
    }

    // Background ahead/behind fetch for visible branches
    fetchAheadBehindForBranches(pollFilteredBranches).catch(() => { /* transient git/network error — next poll will retry */ });

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
        currentInfo.hasUpdates = false;
        // Update the stored commit to the new one
        const newCommit = await execGit(['rev-parse', '--short', 'HEAD'], { cwd: PROJECT_ROOT });
        currentInfo.commit = newCommit.stdout.trim();
        store.setState({ hasMergeConflict: false, branches: [...store.get('branches')] });
        previousBranchStates.set(autoPullBranchName, newCommit.stdout.trim());
        // Reload browsers
        notifyClients();

        // Calculate actual diff for stats tracking + status message
        let diffStats = { added: 0, deleted: 0 };
        if (oldCommit) {
          diffStats = await getDiffStats(oldCommit, 'HEAD');
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

        // Indicate what was updated so the log isn't just a generic "success"
        const summary = (diffStats.added || diffStats.deleted)
          ? ` (+${diffStats.added}/-${diffStats.deleted})`
          : '';
        addLog(`Auto-pulled ${autoPullBranchName}${summary}`, 'success');
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
  // Bail out if shutdown has started: both here (no new timer) and again
  // inside the timer callback after each await (the in-flight poll may
  // have started before shutdown() cleared pollIntervalId, and clearTimeout
  // on a timer whose callback is already executing is a no-op).
  if (isShuttingDown) return;
  pollIntervalId = setTimeout(async () => {
    if (isShuttingDown) return;
    await pollGitChanges();
    if (isShuttingDown) return;
    schedulePoll();
  }, store.get('adaptivePollInterval'));
}

function restartPolling() {
  if (isShuttingDown) return;
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

  const url = new URL(req.url, localhostUrl(PORT));
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
  } catch (e) {
    // STATIC_DIR comes from our own package layout, so a realpath failure
    // means the install is broken (missing dir, permissions, etc.) — worth
    // diagnosing. Fall back to the unresolved path so the request still
    // gets its 403 rather than crashing.
    telemetry.captureError(e);
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
      }, FILE_WATCHER_DEBOUNCE_MS);
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

  // Suppress EIO errors that occur when the PTY is torn down during exit
  process.stdin.on('error', () => {});

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
            }).catch(() => { /* PR was created; modal refresh is a nice-to-have, user can reopen */ });
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
          // Update & restart — run npm i -g git-watchtower, then re-exec
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
              addLog('Successfully updated git-watchtower! Restarting...', 'update');
              restartProcess();
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
          const serverUrl = localhostUrl(PORT);
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
            // Async enrichment failed (no remote, gh/glab errored, etc.).
            // Drop the spinner so the modal shows what we have from phase 1.
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
          }).catch(() => { /* startWebDashboard surfaces its own errors via addLog/showErrorToast */ });
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
          openInBrowser(localhostUrl(PORT));
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
      case 'checkUpdate':
        if (payload && payload.install) {
          store.setState({ updateInProgress: true });
          render();
          const { spawn: spawnUpdate } = require('child_process');
          const updateChild = spawnUpdate('npm', ['i', '-g', 'git-watchtower'], {
            stdio: 'ignore',
            detached: false,
          });
          updateChild.on('close', (code) => {
            store.setState({ updateInProgress: false });
            if (code === 0) {
              store.setState({ updateAvailable: null });
              sendResult(true, 'Updated! Restarting...');
              addLog('Successfully updated git-watchtower! Restarting...', 'update');
              restartProcess();
            } else {
              sendResult(false, `Update failed (exit code ${code})`);
              addLog(`Update failed (exit code ${code}). Run manually: npm i -g git-watchtower`, 'error');
              render();
            }
          });
          updateChild.on('error', (err2) => {
            store.setState({ updateInProgress: false });
            sendResult(false, err2.message);
            addLog(`Update failed: ${err2.message}`, 'error');
            render();
          });
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
 * Maximum attempts to connect to an existing coordinator as a worker
 * before giving up (or reclaiming the lock if the coordinator is dead).
 */
const WORKER_CONNECT_MAX_ATTEMPTS = 3;

/**
 * Base delay for exponential backoff between worker-connect attempts (ms).
 * Delays are 200ms, 400ms — total added latency ~600ms in the worst case.
 */
const WORKER_CONNECT_BASE_DELAY_MS = 200;

/**
 * Attempt to connect to an existing coordinator as a worker, with bounded
 * exponential backoff. Returns the connected Worker on success, or null if
 * every attempt failed. Between attempts, if the coordinator's process is
 * no longer alive, we stop retrying so the caller can reclaim the lock.
 *
 * @param {{pid: number, port: number, socketPath: string}} existing - Coordinator lock info
 * @param {string} projectIdArg - Project ID for worker registration
 * @returns {Promise<Worker|null>}
 */
async function connectWorkerWithRetry(existing, projectIdArg) {
  for (let attempt = 1; attempt <= WORKER_CONNECT_MAX_ATTEMPTS; attempt++) {
    try {
      const w = new Worker({
        id: projectIdArg,
        projectPath: PROJECT_ROOT,
        projectName: path.basename(PROJECT_ROOT),
        socketPath: existing.socketPath,
      });
      w.onCommand = (action, payload) => handleWebAction(action, payload);
      await w.connect();
      return w;
    } catch (err) {
      if (attempt >= WORKER_CONNECT_MAX_ATTEMPTS) return null;
      // Stop early if the coordinator has exited — caller will reclaim.
      if (!isProcessAlive(existing.pid)) return null;
      await sleep(WORKER_CONNECT_BASE_DELAY_MS * Math.pow(2, attempt - 1));
    }
  }
  return null;
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
  }).catch(() => { /* no remote or unreachable — web UI falls back to branch names without links */ });

  // Atomically try to claim the coordinator role. If another live instance
  // already owns the lock, connect as a worker instead. This prevents a
  // TOCTOU race where two instances both pass a "no coordinator" check and
  // then clobber each other's socket in Coordinator.start().
  //
  // The outer loop runs at most twice so we can reclaim the coordinator
  // role if the existing coordinator dies while we're retrying the worker
  // handshake (e.g. it crashed just before we attached). Without this, a
  // transient connect failure (peer not yet accepting, EPIPE, slow fork)
  // against a coordinator that later crashes would leave us with no web
  // dashboard even though we could safely take over.
  let acquired = false;
  let existing = null;
  for (let outer = 0; outer < 2 && !acquired; outer++) {
    const lockResult = tryAcquireLock(process.pid);
    if (lockResult.acquired) {
      acquired = true;
      break;
    }

    existing = lockResult.existing || getActiveCoordinator();
    if (!existing) {
      // Lock exists but we couldn't claim it and couldn't read the owner.
      // Bail out rather than race a concurrent startup.
      addLog('Web dashboard unavailable: could not acquire coordinator lock', 'error');
      webDashboard = null;
      render();
      return;
    }

    // Try to connect as a worker with bounded retry + exponential backoff.
    // The coordinator may still be finishing its bind after finalizeLock()
    // writes the real socket path, or temporarily unresponsive.
    const connectedWorker = await connectWorkerWithRetry(existing, projectId);
    if (connectedWorker) {
      worker = connectedWorker;
      addLog(`Joined web dashboard at ${localhostUrl(existing.port)} (tab)`, 'success');

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
    }

    // Every connect attempt failed. If the coordinator process died while
    // we were retrying, clean up the stale lock/socket and loop once to
    // claim the coordinator role ourselves. Otherwise abort — do NOT take
    // over a live coordinator's socket.
    if (!isProcessAlive(existing.pid)) {
      removeLock();
      removeSocket();
      continue;
    }

    addLog(`Could not join web dashboard at ${localhostUrl(existing.port)}: coordinator unreachable`, 'error');
    webDashboard = null;
    render();
    return;
  }

  if (!acquired) {
    addLog('Web dashboard unavailable: could not acquire coordinator lock after retry', 'error');
    webDashboard = null;
    render();
    return;
  }

  // We hold the lock — it is now safe to remove any leftover socket and
  // start listening. The lock file contains a placeholder pid-only entry
  // until finalizeLock() writes the real port/socketPath after a successful
  // bind.
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

    const { port } = await webDashboard.start();
    WEB_PORT = port;
    finalizeLock(process.pid, port, coordinator.socketPath);

    // Update coordinator with our latest state periodically. Started only
    // after a successful bind so a failed start doesn't leak an interval.
    webStateInterval = setInterval(() => {
      if (coordinator && webDashboard) {
        coordinator.updateLocal(projectId, webDashboard.getSerializableState());
      } else {
        clearInterval(webStateInterval);
        webStateInterval = null;
      }
    }, 500);

    addLog(`Web dashboard: ${localhostUrl(port)}`, 'success');
    if (openBrowser) openInBrowser(localhostUrl(port));
    render();
  } catch (err) {
    addLog(`Web dashboard failed: ${err.message}`, 'error');
    // Defensive: if we got far enough to arm the state-push interval,
    // clear it. The current ordering starts the interval only after
    // webDashboard.start() resolves, but this keeps cleanup robust
    // against future reordering and against failures in the
    // post-bind statements (e.g. openInBrowser, addLog).
    if (webStateInterval) {
      clearInterval(webStateInterval);
      webStateInterval = null;
    }
    if (webDashboard) {
      try { webDashboard.stop(); } catch (_) { /* web server may not have bound yet — nothing to stop */ }
    }
    if (coordinator) {
      try { coordinator.stop(); } catch (_) { /* coordinator may not have started its IPC server */ }
    }
    removeLock();
    removeSocket();
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
// Restart after update
// ============================================================================

/**
 * Restart the process after a successful update by re-execing with the same
 * arguments. Cleans up terminal state and spawns a replacement process,
 * then exits the current one.
 */
function restartProcess() {
  // Restore terminal state
  write(ansi.showCursor);
  write(ansi.restoreScreen);
  restoreTerminalTitle();
  if (process.stdin.isTTY) process.stdin.setRawMode(false);

  // Silence the parent before the replacement takes over the TTY. The parent
  // stays alive waiting on child.on('close') to forward the exit code, and
  // stdio is inherited — so any stray listener here will race with the child
  // (keystrokes consumed twice, render() drawing frames on top of the child's
  // UI, Ctrl+C intercepted by both, etc.).
  try { process.stdin.removeAllListeners('data'); } catch (_) { /* stdin may be detached */ }
  try { process.stdin.pause(); } catch (_) { /* stdin may already be paused */ }
  try { process.stdout.removeAllListeners('resize'); } catch (_) { /* stdout may be detached */ }
  try { process.removeAllListeners('SIGWINCH'); } catch (_) { /* no SIGWINCH handler registered */ }
  try { process.removeAllListeners('SIGINT'); } catch (_) { /* no SIGINT handler registered */ }
  try { process.removeAllListeners('SIGTERM'); } catch (_) { /* no SIGTERM handler registered */ }

  // Stop every scheduler that can trigger a render while we're waiting on the
  // child. periodicUpdateCheck in particular will fire render() on completion
  // and would draw over the replacement's frames.
  if (pollIntervalId) {
    try { clearTimeout(pollIntervalId); } catch (_) { /* defensive */ }
    pollIntervalId = null;
  }
  if (periodicUpdateCheck) {
    try { periodicUpdateCheck.stop(); } catch (_) { /* interval may already be cleared */ }
  }
  if (fileWatcher) {
    try { fileWatcher.close(); } catch (_) { /* watcher may already be closed */ }
    fileWatcher = null;
  }

  // Stop server, SSE clients, web dashboard
  if (SERVER_MODE === 'command') stopServerProcess();
  else if (SERVER_MODE === 'static') {
    clients.forEach(client => client.end());
    clients.clear();
  }
  stopWebDashboard();

  // Release the per-repo monitor lock before spawning the replacement, so the
  // child can acquire it. The parent stays alive waiting on child.on('close'),
  // so without this the child sees the parent as an active owner and refuses.
  if (monitorLockFile) {
    try { monitorLock.release(monitorLockFile); } catch (_) { /* lock file may have already been unlinked */ }
    monitorLockFile = null;
  }

  // The parent's 'exit' handler (process.on('exit', cleanupResources)) writes
  // ANSI escapes — showCursor / restoreScreen — to the shared TTY. Once the
  // child owns the screen those writes would corrupt its UI on parent exit,
  // so mark cleanup as already done.
  _resourcesCleaned = true;

  console.log('\n♻ Restarting git-watchtower...\n');

  const { spawn: spawnChild } = require('child_process');
  const child = spawnChild(process.argv[0], process.argv.slice(1), {
    stdio: 'inherit',
    detached: false,
  });
  child.on('error', () => {
    console.error('Failed to restart. Please run git-watchtower manually.');
    process.exit(1);
  });
  // Forward the child's exit code when it finishes
  child.on('close', (code) => process.exit(code || 0));
}

// ============================================================================
// Shutdown
// ============================================================================

let isShuttingDown = false;
let _resourcesCleaned = false;
// Path of the per-repo monitor lock we own, if any. Set during start() and
// cleared in cleanupResources() after release.
let monitorLockFile = null;

/**
 * Idempotent, best-effort cleanup of every long-lived resource we own:
 * terminal state, timers, file watcher, live-reload SSE clients, the
 * user's dev-server child process, and the web-dashboard / coordinator
 * (which unlinks the lock file and IPC socket). Safe to call multiple
 * times and from any exit path (shutdown, uncaughtException, 'exit').
 *
 * Every step is wrapped in try/catch so a failure in one resource does
 * not prevent the rest from being cleaned up. The body is synchronous
 * so it still runs inside an 'exit' handler where async callbacks won't
 * execute; the dev-server close promise is bubbled up so async callers
 * can await it before process.exit().
 *
 * @returns {Promise<void>} resolves when the dev-server child has exited
 *   (or a hard cap elapses). Synchronous callers may ignore it.
 */
function cleanupResources() {
  if (_resourcesCleaned) return Promise.resolve();
  _resourcesCleaned = true;

  // Restore terminal first so the user sees a clean prompt even if a
  // later step throws.
  try { write(ansi.showCursor); } catch (_) { /* stdout may be closed during crash cleanup */ }
  try { write(ansi.restoreScreen); } catch (_) { /* stdout may be closed during crash cleanup */ }
  try { restoreTerminalTitle(); } catch (_) { /* stdout may be closed during crash cleanup */ }
  try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch (_) { /* stdin may already be unraw or detached */ }
  try { process.stdin.pause(); } catch (_) { /* stdin may already be paused or destroyed */ }

  if (pollIntervalId) {
    try { clearTimeout(pollIntervalId); } catch (_) { /* defensive — clearTimeout normally won't throw */ }
    pollIntervalId = null;
  }

  if (periodicUpdateCheck) {
    try { periodicUpdateCheck.stop(); } catch (_) { /* interval handle may already be cleared */ }
  }

  if (fileWatcher) {
    try { fileWatcher.close(); } catch (_) { /* watcher may already be closed by OS or previous cleanup */ }
    fileWatcher = null;
  }

  // Live-reload SSE clients (static mode)
  if (SERVER_MODE === 'static') {
    try {
      clients.forEach((client) => {
        try { client.end(); } catch (_) { /* SSE client socket already closed */ }
      });
      clients.clear();
    } catch (_) { /* clients set may have mutated mid-iteration during shutdown */ }
  }

  // User's dev-server process (command mode). Capture the close promise so
  // async callers (shutdown/uncaughtException/unhandledRejection) can await
  // it before process.exit() — otherwise the SIGKILL escalation timer gets
  // dropped and a dev server that ignored SIGTERM survives as a detached
  // orphan (it was spawned in its own process group on Unix).
  let serverStopPromise = Promise.resolve();
  if (SERVER_MODE === 'command') {
    try { serverStopPromise = stopServerProcess(); } catch (_) { /* dev-server child may already be gone */ }
  }

  // Web dashboard + worker/coordinator (unlinks lock file + IPC socket)
  try { stopWebDashboard(); } catch (_) { /* web dashboard may never have been started */ }

  // Per-repo monitor lock — release last so the slot stays reserved for the
  // entire lifetime of this process, including any errors in the steps above.
  if (monitorLockFile) {
    try { monitorLock.release(monitorLockFile); } catch (_) { /* lock file may have been unlinked externally */ }
    monitorLockFile = null;
  }

  return serverStopPromise;
}

async function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  const serverStopPromise = cleanupResources();

  // For the static HTTP server, give in-flight connections a brief
  // grace period to drain. cleanupResources ended the SSE clients; this
  // races server.close against SERVER_CLOSE_TIMEOUT_MS so we never hang
  // forever on a stuck browser.
  if (SERVER_MODE === 'static' && server) {
    const serverClosePromise = new Promise((resolve) => server.close(resolve));
    const timeoutPromise = new Promise((resolve) => setTimeout(resolve, SERVER_CLOSE_TIMEOUT_MS));
    await Promise.race([serverClosePromise, timeoutPromise]);
  }

  // Wait for the user's dev-server child to actually exit (SIGTERM +
  // FORCE_KILL_GRACE_MS SIGKILL escalation inside stopServerProcess).
  // Without this the escalation timer gets dropped by process.exit() below
  // and a dev server that ignored SIGTERM survives as a detached orphan.
  try { await serverStopPromise; } catch (_) { /* best-effort */ }

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
// Belt-and-suspenders: if we exit via a path that didn't call
// cleanupResources (e.g. a hard crash in startup before handlers were
// registered), still do synchronous best-effort cleanup.
process.on('exit', () => {
  cleanupResources();
});

// Defense-in-depth against a stdio pipe closing mid-run. The #13 TTY guard
// stops `git-watchtower | head` at startup, but a TTY can still disappear
// later (SSH drops, terminal window closes, pty tears down). Without this,
// the next write() emits an async EPIPE which Node promotes to
// uncaughtException — producing a crash report and telemetry noise for
// what is a benign pipe-closed condition.
const stdioPipeErrorHandler = createPipeErrorHandler({
  onEpipe: () => {
    isShuttingDown = true;
    try { cleanupResources(); } catch (_) { /* best-effort during pipe-close */ }
    process.exit(0);
  },
  onOther: (err) => {
    // Any other stdio error is unexpected — re-raise so the existing
    // uncaughtException handler can capture telemetry and restore terminal.
    setImmediate(() => { throw err; });
  },
});
process.stdout.on('error', stdioPipeErrorHandler);
process.stderr.on('error', stdioPipeErrorHandler);
process.on('uncaughtException', async (err) => {
  isShuttingDown = true;

  // Synchronous teardown first — so the coordinator socket, lock file,
  // dev-server child process group, and SSE clients are released even
  // if telemetry shutdown hangs or throws.
  const serverStopPromise = cleanupResources();

  try { telemetry.captureError(err); } catch (_) { /* telemetry must never prevent crash cleanup */ }
  console.error('Uncaught exception:', err);
  try { await telemetry.shutdown(); } catch (_) { /* telemetry must never prevent crash cleanup */ }
  // Wait for the dev-server SIGKILL escalation before exiting — otherwise
  // process.exit() drops the pending timer and a stuck server orphans.
  try { await serverStopPromise; } catch (_) { /* best-effort */ }
  process.exit(1);
});

// Mirror of uncaughtException for unhandled promise rejections. Without this,
// Node 15+ crashes the process on a missed .catch() tail with no telemetry
// and no terminal restore — leaving the TUI user in a broken terminal. Also
// high-signal: an unhandled rejection reaching here means we missed a .catch()
// somewhere and telemetry will tell us where.
process.on('unhandledRejection', async (reason) => {
  isShuttingDown = true;

  const serverStopPromise = cleanupResources();

  const err = reason instanceof Error ? reason : new Error(String(reason));
  try { telemetry.captureError(err); } catch (_) { /* telemetry must never prevent crash cleanup */ }
  console.error('Unhandled rejection:', reason);
  try { await telemetry.shutdown(); } catch (_) { /* telemetry must never prevent crash cleanup */ }
  // Wait for the dev-server SIGKILL escalation before exiting — otherwise
  // process.exit() drops the pending timer and a stuck server orphans.
  try { await serverStopPromise; } catch (_) { /* best-effort */ }
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

  // Single-instance guard (per repo). Two TUIs rendering to the same terminal
  // stomp on each other's frames — selection cursor bounces between their
  // independent selectedIndex values, the activity log flips between two
  // buffers, and each sees the other's `git checkout` as an "external" switch.
  // Acquire before any TTY writes so a refusal leaves the user's prompt clean.
  const lockResult = monitorLock.acquire(PROJECT_ROOT);
  if (!lockResult.acquired) {
    if (cliArgs.force) {
      console.error(
        ansi.yellow + '⚠ Warning: another git-watchtower (PID ' +
        lockResult.existing.pid + ') is already running against this repo. ' +
        'Continuing due to --force.' + ansi.reset
      );
    } else {
      const existing = lockResult.existing || {};
      console.error('\n' + ansi.red + ansi.bold +
        '✗ Error: git-watchtower is already running against this repository' + ansi.reset);
      console.error('\n  Existing PID: ' + ansi.bold + (existing.pid || 'unknown') + ansi.reset);
      if (existing.startedAt) {
        const ageMs = Date.now() - existing.startedAt;
        const ageStr = ageMs < 60000
          ? Math.round(ageMs / 1000) + 's'
          : Math.round(ageMs / 60000) + 'm';
        console.error('  Started:      ' + ageStr + ' ago');
      }
      console.error('  Repo:         ' + PROJECT_ROOT);
      console.error('  Lock file:    ' + lockResult.file);
      console.error('\n  Running two instances against the same repo makes the TUI');
      console.error('  unusable (selection bouncing, flipping logs, CURRENT label');
      console.error('  snap-back). Stop the other instance first:');
      console.error('\n    ' + ansi.bold + 'kill ' + (existing.pid || '<pid>') + ansi.reset);
      console.error('\n  Or pass --force to override (not recommended).\n');
      process.exit(1);
    }
  } else {
    monitorLockFile = lockResult.file;
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
    fetchAheadBehindForBranches(initBranches).catch(() => { /* ahead/behind is background-only — stale counts are better than a noisy startup */ });
  }).catch(() => { /* no default branch detectable (no remote refs yet) — ahead/behind stays hidden */ });

  // Load sparklines and action cache in background
  refreshAllSparklines().catch(() => { /* sparkline cache stays empty — activity column just renders blank */ });
  initActionCache().then(() => {
    // Once env is known, kick off initial PR status fetch
    fetchAllPrStatuses().then(map => {
      if (map) {
        store.setState({ branchPrStatusMap: map });
        lastPrStatusFetch = Date.now();
        render();
      }
    }).catch(() => { /* gh/glab unreachable — inline PR indicators stay hidden, poller will retry */ });
  }).catch(() => { /* cliEnv detection failed — PR actions fall back to web links where possible */ });

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
      addLog(`Server started on ${localhostUrl(PORT)}`, 'success');
      addLog(`Serving ${STATIC_DIR.replace(PROJECT_ROOT, '.')}`, 'info');
      addLog(`Current branch: ${store.get('currentBranch')}`, 'info');
      // Add server log entries for static server
      addServerLog(`Static server started on ${localhostUrl(PORT)}`);
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
  }).catch(() => { /* npm registry unreachable — periodic check will try again in 4h */ });

  // Re-check for updates periodically (every 4 hours) while running.
  // Assigned to module scope so the top-level exit handler can stop it.
  periodicUpdateCheck = startPeriodicUpdateCheck((latestVersion) => {
    const alreadyKnown = store.get('updateAvailable');
    store.setState({ updateAvailable: latestVersion });
    if (!alreadyKnown) {
      // First time discovering an update during this session — show modal
      store.setState({ updateModalVisible: true });
      addLog(`New version available: ${latestVersion} \u2192 npm i -g git-watchtower`, 'update');
    }
    render();
  });
}

start().catch(err => {
  write(ansi.showCursor);
  write(ansi.restoreScreen);
  restoreTerminalTitle();
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  console.error('Failed to start:', err);
  process.exit(1);
});
