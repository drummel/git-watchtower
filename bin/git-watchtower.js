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
 *   f       - Fetch all branches + refresh sparklines
 *   s       - Toggle sound notifications
 *   c       - Toggle casino mode (Vegas-style feedback)
 *   i       - Show server info (port, connections)
 *   1-0     - Set visible branch count (1-10)
 *   +/-     - Increase/decrease visible branches
 *   q/Esc   - Quit (Esc also clears search)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const readline = require('readline');

// Casino mode - Vegas-style feedback effects
const casino = require('../src/casino');
const casinoSounds = require('../src/casino/sounds');

// Package info for --version
const PACKAGE_VERSION = '1.0.0';

// ============================================================================
// Security & Validation
// ============================================================================

// Valid git branch name pattern (conservative)
const VALID_BRANCH_PATTERN = /^[a-zA-Z0-9_\-./]+$/;

function isValidBranchName(name) {
  if (!name || typeof name !== 'string') return false;
  if (name.length > 255) return false;
  if (!VALID_BRANCH_PATTERN.test(name)) return false;
  // Reject dangerous patterns
  if (name.includes('..')) return false;
  if (name.startsWith('-')) return false;
  if (name.startsWith('/') || name.endsWith('/')) return false;
  return true;
}

function sanitizeBranchName(name) {
  if (!isValidBranchName(name)) {
    throw new Error(`Invalid branch name: ${name}`);
  }
  return name;
}

async function checkGitAvailable() {
  return new Promise((resolve) => {
    exec('git --version', (error) => {
      resolve(!error);
    });
  });
}

// ============================================================================
// Configuration File Support
// ============================================================================

const CONFIG_FILE_NAME = '.watchtowerrc.json';
const PROJECT_ROOT = process.cwd();

function getConfigPath() {
  return path.join(PROJECT_ROOT, CONFIG_FILE_NAME);
}

function loadConfig() {
  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(content);
    } catch (e) {
      console.error(`Warning: Could not parse ${CONFIG_FILE_NAME}: ${e.message}`);
      return null;
    }
  }
  return null;
}

function saveConfig(config) {
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

function getDefaultConfig() {
  return {
    // Server settings
    server: {
      mode: 'static',           // 'static' | 'command' | 'none'
      staticDir: 'public',      // Directory for static mode
      command: '',              // Command for command mode (e.g., 'npm run dev')
      port: 3000,               // Port for static mode / display for command mode
      restartOnSwitch: true,    // Restart server on branch switch (command mode)
    },
    // Git settings
    remoteName: 'origin',       // Git remote name
    autoPull: true,             // Auto-pull when current branch has updates
    gitPollInterval: 5000,      // Polling interval in ms
    // UI settings
    soundEnabled: true,
    visibleBranches: 7,
  };
}

// Migrate old config format to new format
function migrateConfig(config) {
  if (config.server) return config; // Already new format

  // Convert old format to new
  const newConfig = getDefaultConfig();

  if (config.noServer) {
    newConfig.server.mode = 'none';
  }
  if (config.port) {
    newConfig.server.port = config.port;
  }
  if (config.staticDir) {
    newConfig.server.staticDir = config.staticDir;
  }
  if (config.gitPollInterval) {
    newConfig.gitPollInterval = config.gitPollInterval;
  }
  if (typeof config.soundEnabled === 'boolean') {
    newConfig.soundEnabled = config.soundEnabled;
  }
  if (config.visibleBranches) {
    newConfig.visibleBranches = config.visibleBranches;
  }

  return newConfig;
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

  console.log('\n✓ Configuration saved to ' + CONFIG_FILE_NAME);
  console.log('  You can edit this file manually or delete it to reconfigure.\n');

  return config;
}

async function ensureConfig(cliArgs) {
  // Check if --init flag was passed (force reconfiguration)
  if (cliArgs.init) {
    const config = await runConfigurationWizard();
    return applyCliArgsToConfig(config, cliArgs);
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
  return applyCliArgsToConfig(config, cliArgs);
}

function applyCliArgsToConfig(config, cliArgs) {
  // Server settings
  if (cliArgs.mode !== null) {
    config.server.mode = cliArgs.mode;
  }
  if (cliArgs.noServer) {
    config.server.mode = 'none';
  }
  if (cliArgs.port !== null) {
    config.server.port = cliArgs.port;
  }
  if (cliArgs.staticDir !== null) {
    config.server.staticDir = cliArgs.staticDir;
  }
  if (cliArgs.command !== null) {
    config.server.command = cliArgs.command;
  }
  if (cliArgs.restartOnSwitch !== null) {
    config.server.restartOnSwitch = cliArgs.restartOnSwitch;
  }

  // Git settings
  if (cliArgs.remote !== null) {
    config.remoteName = cliArgs.remote;
  }
  if (cliArgs.autoPull !== null) {
    config.autoPull = cliArgs.autoPull;
  }
  if (cliArgs.pollInterval !== null) {
    config.gitPollInterval = cliArgs.pollInterval;
  }

  // UI settings
  if (cliArgs.sound !== null) {
    config.soundEnabled = cliArgs.sound;
  }
  if (cliArgs.visibleBranches !== null) {
    config.visibleBranches = cliArgs.visibleBranches;
  }

  return config;
}

// Parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    // Server settings
    mode: null,
    noServer: false,
    port: null,
    staticDir: null,
    command: null,
    restartOnSwitch: null,
    // Git settings
    remote: null,
    autoPull: null,
    pollInterval: null,
    // UI settings
    sound: null,
    visibleBranches: null,
    // Actions
    init: false,
  };

  for (let i = 0; i < args.length; i++) {
    // Server settings
    if (args[i] === '--mode' || args[i] === '-m') {
      const mode = args[i + 1];
      if (['static', 'command', 'none'].includes(mode)) {
        result.mode = mode;
      }
      i++;
    } else if (args[i] === '--port' || args[i] === '-p') {
      const portValue = parseInt(args[i + 1], 10);
      if (!isNaN(portValue) && portValue > 0 && portValue < 65536) {
        result.port = portValue;
      }
      i++;
    } else if (args[i] === '--no-server' || args[i] === '-n') {
      result.noServer = true;
    } else if (args[i] === '--static-dir') {
      result.staticDir = args[i + 1];
      i++;
    } else if (args[i] === '--command' || args[i] === '-c') {
      result.command = args[i + 1];
      i++;
    } else if (args[i] === '--restart-on-switch') {
      result.restartOnSwitch = true;
    } else if (args[i] === '--no-restart-on-switch') {
      result.restartOnSwitch = false;
    }
    // Git settings
    else if (args[i] === '--remote' || args[i] === '-r') {
      result.remote = args[i + 1];
      i++;
    } else if (args[i] === '--auto-pull') {
      result.autoPull = true;
    } else if (args[i] === '--no-auto-pull') {
      result.autoPull = false;
    } else if (args[i] === '--poll-interval') {
      const interval = parseInt(args[i + 1], 10);
      if (!isNaN(interval) && interval > 0) {
        result.pollInterval = interval;
      }
      i++;
    }
    // UI settings
    else if (args[i] === '--sound') {
      result.sound = true;
    } else if (args[i] === '--no-sound') {
      result.sound = false;
    } else if (args[i] === '--visible-branches') {
      const count = parseInt(args[i + 1], 10);
      if (!isNaN(count) && count > 0) {
        result.visibleBranches = count;
      }
      i++;
    }
    // Actions and info
    else if (args[i] === '--init') {
      result.init = true;
    } else if (args[i] === '--version' || args[i] === '-v') {
      console.log(`git-watchtower v${PACKAGE_VERSION}`);
      process.exit(0);
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Git Watchtower v${PACKAGE_VERSION} - Branch Monitor & Dev Server

Usage:
  git-watchtower [options]

Server Options:
  -m, --mode <mode>       Server mode: static, command, or none
  -p, --port <port>       Server port (default: 3000)
  -n, --no-server         Shorthand for --mode none
  --static-dir <dir>      Directory for static file serving (default: public)
  -c, --command <cmd>     Command to run in command mode (e.g., "npm run dev")
  --restart-on-switch     Restart server on branch switch (default)
  --no-restart-on-switch  Don't restart server on branch switch

Git Options:
  -r, --remote <name>     Git remote name (default: origin)
  --auto-pull             Auto-pull on branch switch (default)
  --no-auto-pull          Don't auto-pull on branch switch
  --poll-interval <ms>    Git polling interval in ms (default: 5000)

UI Options:
  --sound                 Enable sound notifications (default)
  --no-sound              Disable sound notifications
  --visible-branches <n>  Number of branches to display (default: 7)

General:
  --init                  Run the configuration wizard
  -v, --version           Show version number
  -h, --help              Show this help message

Server Modes:
  static   Serve static files with live reload (default)
  command  Run your own dev server (Next.js, Vite, Nuxt, etc.)
  none     Branch monitoring only

Configuration:
  On first run, Git Watchtower will prompt you to configure settings.
  Settings are saved to .watchtowerrc.json in your project directory.
  CLI options override config file settings for the current session.

Examples:
  git-watchtower                              # Start with config or defaults
  git-watchtower --init                       # Re-run configuration wizard
  git-watchtower --no-server                  # Branch monitoring only
  git-watchtower -p 8080                      # Override port
  git-watchtower -m command -c "npm run dev"  # Use custom dev server
  git-watchtower --no-sound --poll-interval 10000
`);
      process.exit(0);
    }
  }
  return result;
}

const cliArgs = parseArgs();

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

// Dynamic settings
let visibleBranchCount = 7;
let soundEnabled = true;
let casinoModeEnabled = false;

// Server process management (for command mode)
let serverProcess = null;
let serverLogBuffer = [];         // In-memory log buffer
let serverRunning = false;
let serverCrashed = false;
let logViewMode = false;          // Viewing logs modal
let logViewTab = 'server';        // 'activity' or 'server'
let logScrollOffset = 0;          // Scroll position in log view

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

  // UI settings
  visibleBranchCount = config.visibleBranches || 7;
  soundEnabled = config.soundEnabled !== false;

  // Casino mode
  casinoModeEnabled = config.casinoMode === true;
  if (casinoModeEnabled) {
    casino.enable();
  }
}

// Server log management
function addServerLog(line, isError = false) {
  const timestamp = new Date().toLocaleTimeString();
  serverLogBuffer.push({ timestamp, line, isError });
  if (serverLogBuffer.length > MAX_SERVER_LOG_LINES) {
    serverLogBuffer.shift();
  }
}

function clearServerLog() {
  serverLogBuffer = [];
}

// Command mode server management
function startServerProcess() {
  if (SERVER_MODE !== 'command' || !SERVER_COMMAND) return;
  if (serverProcess) {
    stopServerProcess();
  }

  clearServerLog();
  serverCrashed = false;
  serverRunning = false;

  addLog(`Starting: ${SERVER_COMMAND}`, 'update');
  addServerLog(`$ ${SERVER_COMMAND}`);

  // Parse command and args
  const parts = SERVER_COMMAND.split(' ');
  const cmd = parts[0];
  const args = parts.slice(1);

  // Use shell on Windows, direct spawn elsewhere
  const isWindows = process.platform === 'win32';
  const spawnOptions = {
    cwd: PROJECT_ROOT,
    env: { ...process.env, FORCE_COLOR: '1' },
    shell: isWindows,
    stdio: ['ignore', 'pipe', 'pipe'],
  };

  try {
    serverProcess = spawn(cmd, args, spawnOptions);
    serverRunning = true;

    serverProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean);
      lines.forEach(line => addServerLog(line));
    });

    serverProcess.stderr.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean);
      lines.forEach(line => addServerLog(line, true));
    });

    serverProcess.on('error', (err) => {
      serverRunning = false;
      serverCrashed = true;
      addServerLog(`Error: ${err.message}`, true);
      addLog(`Server error: ${err.message}`, 'error');
      render();
    });

    serverProcess.on('close', (code) => {
      serverRunning = false;
      if (code !== 0 && code !== null) {
        serverCrashed = true;
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
    serverCrashed = true;
    addServerLog(`Failed to start: ${err.message}`, true);
    addLog(`Failed to start server: ${err.message}`, 'error');
  }
}

function stopServerProcess() {
  if (!serverProcess) return;

  addLog('Stopping server...', 'update');

  // Try graceful shutdown first
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', serverProcess.pid, '/f', '/t']);
  } else {
    serverProcess.kill('SIGTERM');
    // Force kill after timeout
    setTimeout(() => {
      if (serverProcess) {
        serverProcess.kill('SIGKILL');
      }
    }, 3000);
  }

  serverProcess = null;
  serverRunning = false;
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
let consecutiveNetworkFailures = 0;
let isOffline = false;
let lastFetchDuration = 0;
let slowFetchWarningShown = false;
let verySlowFetchWarningShown = false;
let adaptivePollInterval = GIT_POLL_INTERVAL;
let pollIntervalId = null;

// Git state
let isDetachedHead = false;
let hasMergeConflict = false;

// ANSI escape codes
const ESC = '\x1b';
const CSI = `${ESC}[`;

const ansi = {
  // Screen
  clearScreen: `${CSI}2J`,
  clearLine: `${CSI}2K`,
  moveTo: (row, col) => `${CSI}${row};${col}H`,
  moveToTop: `${CSI}H`,
  hideCursor: `${CSI}?25l`,
  showCursor: `${CSI}?25h`,
  saveScreen: `${CSI}?1049h`,
  restoreScreen: `${CSI}?1049l`,

  // Colors
  reset: `${CSI}0m`,
  bold: `${CSI}1m`,
  dim: `${CSI}2m`,
  italic: `${CSI}3m`,
  underline: `${CSI}4m`,
  inverse: `${CSI}7m`,
  blink: `${CSI}5m`,

  // Foreground colors
  black: `${CSI}30m`,
  red: `${CSI}31m`,
  green: `${CSI}32m`,
  yellow: `${CSI}33m`,
  blue: `${CSI}34m`,
  magenta: `${CSI}35m`,
  cyan: `${CSI}36m`,
  white: `${CSI}37m`,
  gray: `${CSI}90m`,

  // Bright foreground colors
  brightRed: `${CSI}91m`,
  brightGreen: `${CSI}92m`,
  brightYellow: `${CSI}93m`,
  brightBlue: `${CSI}94m`,
  brightMagenta: `${CSI}95m`,
  brightCyan: `${CSI}96m`,
  brightWhite: `${CSI}97m`,

  // Background colors
  bgBlack: `${CSI}40m`,
  bgRed: `${CSI}41m`,
  bgGreen: `${CSI}42m`,
  bgYellow: `${CSI}43m`,
  bgBlue: `${CSI}44m`,
  bgMagenta: `${CSI}45m`,
  bgCyan: `${CSI}46m`,
  bgWhite: `${CSI}47m`,

  // Bright background colors
  bgBrightRed: `${CSI}101m`,
  bgBrightGreen: `${CSI}102m`,
  bgBrightYellow: `${CSI}103m`,
  bgBrightBlue: `${CSI}104m`,
  bgBrightMagenta: `${CSI}105m`,
  bgBrightCyan: `${CSI}106m`,
  bgBrightWhite: `${CSI}107m`,

  // 256 colors
  fg256: (n) => `${CSI}38;5;${n}m`,
  bg256: (n) => `${CSI}48;5;${n}m`,
};

// Box drawing characters
const box = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
  teeRight: '├',
  teeLeft: '┤',
  cross: '┼',

  // Double line for flash
  dTopLeft: '╔',
  dTopRight: '╗',
  dBottomLeft: '╚',
  dBottomRight: '╝',
  dHorizontal: '═',
  dVertical: '║',
};

// State
let branches = [];
let selectedIndex = 0;
let selectedBranchName = null; // Track selection by name, not just index
let currentBranch = null;
let previousBranchStates = new Map(); // branch name -> commit hash
let knownBranchNames = new Set(); // Track known branches to detect NEW ones
let isPolling = false;
let pollingStatus = 'idle';
let terminalWidth = process.stdout.columns || 80;
let terminalHeight = process.stdout.rows || 24;

// SSE clients for live reload
const clients = new Set();

// Activity log entries
const activityLog = [];

// Flash state
let flashMessage = null;
let flashTimeout = null;

// Error toast state (more prominent than activity log)
let errorToast = null;
let errorToastTimeout = null;

// Preview pane state
let previewMode = false;
let previewData = null;

// Search/filter state
let searchMode = false;
let searchQuery = '';
let filteredBranches = null;

// Session history for undo
const switchHistory = [];
const MAX_HISTORY = 20;

// Sparkline cache (conservative - only update on manual fetch)
const sparklineCache = new Map(); // branch name -> sparkline string
let lastSparklineUpdate = 0;
const SPARKLINE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// MIME types
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.pdf': 'application/pdf',
};

// Live reload script
const LIVE_RELOAD_SCRIPT = `
<script>
(function() {
  var source = new EventSource('/livereload');
  source.onmessage = function(e) {
    if (e.data === 'reload') location.reload();
  };
})();
</script>
</body>`;

// ============================================================================
// Utility Functions
// ============================================================================

function execAsync(command, options = {}) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd: PROJECT_ROOT, ...options }, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stdout, stderr });
      } else {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      }
    });
  });
}

/**
 * Get diff stats between two commits
 * @param {string} fromCommit - Starting commit
 * @param {string} toCommit - Ending commit (default HEAD)
 * @returns {Promise<{added: number, deleted: number}>}
 */
async function getDiffStats(fromCommit, toCommit = 'HEAD') {
  try {
    const { stdout } = await execAsync(`git diff --stat ${fromCommit}..${toCommit}`);
    // Parse the summary line: "X files changed, Y insertions(+), Z deletions(-)"
    const match = stdout.match(/(\d+) insertions?\(\+\).*?(\d+) deletions?\(-\)/);
    if (match) {
      return { added: parseInt(match[1], 10), deleted: parseInt(match[2], 10) };
    }
    // Try to match just insertions or just deletions
    const insertMatch = stdout.match(/(\d+) insertions?\(\+\)/);
    const deleteMatch = stdout.match(/(\d+) deletions?\(-\)/);
    return {
      added: insertMatch ? parseInt(insertMatch[1], 10) : 0,
      deleted: deleteMatch ? parseInt(deleteMatch[1], 10) : 0,
    };
  } catch (e) {
    return { added: 0, deleted: 0 };
  }
}

function formatTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 10) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return '1 day ago';
  return `${diffDay} days ago`;
}

function truncate(str, maxLen) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}

function padRight(str, len) {
  if (str.length >= len) return str.substring(0, len);
  return str + ' '.repeat(len - str.length);
}

function getMaxBranchesForScreen() {
  // Calculate max branches that fit: header(2) + branch box + log box(~12) + footer(2)
  // Each branch takes 2 rows, plus 4 for box borders
  const availableHeight = terminalHeight - 2 - MAX_LOG_ENTRIES - 5 - 2;
  return Math.max(1, Math.floor(availableHeight / 2));
}

function padLeft(str, len) {
  if (str.length >= len) return str.substring(0, len);
  return ' '.repeat(len - str.length) + str;
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
  const timestamp = new Date().toLocaleTimeString();
  const icons = { info: '○', success: '✓', warning: '●', error: '✗', update: '⟳' };
  const colors = { info: 'white', success: 'green', warning: 'yellow', error: 'red', update: 'cyan' };

  activityLog.unshift({ timestamp, message, icon: icons[type] || '○', color: colors[type] || 'white' });
  if (activityLog.length > MAX_LOG_ENTRIES) activityLog.pop();
}

// Sparkline characters (8 levels)
const SPARKLINE_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

function generateSparkline(commitCounts) {
  if (!commitCounts || commitCounts.length === 0) return '       ';
  const max = Math.max(...commitCounts, 1);
  return commitCounts.map(count => {
    const level = Math.floor((count / max) * 7);
    return SPARKLINE_CHARS[level];
  }).join('');
}

async function getBranchSparkline(branchName) {
  // Check cache first
  const cached = sparklineCache.get(branchName);
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

  try {
    for (const branch of branches.slice(0, 20)) { // Limit to top 20
      if (branch.isDeleted) continue;

      // Get commit counts for last 7 days
      const { stdout } = await execAsync(
        `git log origin/${branch.name} --since="7 days ago" --format="%ad" --date=format:"%Y-%m-%d" 2>/dev/null || git log ${branch.name} --since="7 days ago" --format="%ad" --date=format:"%Y-%m-%d" 2>/dev/null`
      ).catch(() => ({ stdout: '' }));

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
    }
    lastSparklineUpdate = now;
  } catch (e) {
    // Silently fail - sparklines are optional
  }
}

async function getPreviewData(branchName) {
  try {
    // Get last 5 commits
    const { stdout: logOutput } = await execAsync(
      `git log origin/${branchName} -5 --oneline 2>/dev/null || git log ${branchName} -5 --oneline 2>/dev/null`
    ).catch(() => ({ stdout: '' }));

    const commits = logOutput.split('\n').filter(Boolean).map(line => {
      const [hash, ...msgParts] = line.split(' ');
      return { hash, message: msgParts.join(' ') };
    });

    // Get files changed (comparing to current branch)
    let filesChanged = [];
    try {
      const { stdout: diffOutput } = await execAsync(
        `git diff --stat --name-only HEAD...origin/${branchName} 2>/dev/null || git diff --stat --name-only HEAD...${branchName} 2>/dev/null`
      );
      filesChanged = diffOutput.split('\n').filter(Boolean).slice(0, 8);
    } catch (e) {
      // No diff available
    }

    return { commits, filesChanged };
  } catch (e) {
    return { commits: [], filesChanged: [] };
  }
}

function playSound() {
  if (!soundEnabled) return;

  // Try to play a friendly system sound (non-blocking)
  const { platform } = process;

  if (platform === 'darwin') {
    // macOS: Use afplay with a gentle system sound
    // Options: Glass, Pop, Ping, Purr, Submarine, Tink, Blow, Bottle, Frog, Funk, Hero, Morse, Sosumi
    exec('afplay /System/Library/Sounds/Pop.aiff 2>/dev/null', { cwd: PROJECT_ROOT });
  } else if (platform === 'linux') {
    // Linux: Try paplay (PulseAudio) or aplay (ALSA) with a system sound
    // First try freedesktop sound theme, then fall back to terminal bell
    exec(
      'paplay /usr/share/sounds/freedesktop/stereo/message-new-instant.oga 2>/dev/null || ' +
      'paplay /usr/share/sounds/freedesktop/stereo/complete.oga 2>/dev/null || ' +
      'aplay /usr/share/sounds/sound-icons/prompt.wav 2>/dev/null || ' +
      'printf "\\a"',
      { cwd: PROJECT_ROOT }
    );
  } else {
    // Windows or other: Terminal bell
    process.stdout.write('\x07');
  }
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
  terminalWidth = process.stdout.columns || 80;
  terminalHeight = process.stdout.rows || 24;
}

function drawBox(row, col, width, height, title = '', titleColor = ansi.cyan) {
  // Top border
  write(ansi.moveTo(row, col));
  write(ansi.gray + box.topLeft + box.horizontal.repeat(width - 2) + box.topRight + ansi.reset);

  // Title
  if (title) {
    write(ansi.moveTo(row, col + 2));
    write(ansi.gray + ' ' + titleColor + title + ansi.gray + ' ' + ansi.reset);
  }

  // Sides
  for (let i = 1; i < height - 1; i++) {
    write(ansi.moveTo(row + i, col));
    write(ansi.gray + box.vertical + ansi.reset);
    write(ansi.moveTo(row + i, col + width - 1));
    write(ansi.gray + box.vertical + ansi.reset);
  }

  // Bottom border
  write(ansi.moveTo(row + height - 1, col));
  write(ansi.gray + box.bottomLeft + box.horizontal.repeat(width - 2) + box.bottomRight + ansi.reset);
}

function clearArea(row, col, width, height) {
  for (let i = 0; i < height; i++) {
    write(ansi.moveTo(row + i, col));
    write(' '.repeat(width));
  }
}

function renderHeader() {
  const width = terminalWidth;
  // Header row: 1 normally, 2 when casino mode (row 1 is marquee)
  const headerRow = casinoModeEnabled ? 2 : 1;

  let statusIcon = { idle: ansi.green + '●', fetching: ansi.yellow + '⟳', error: ansi.red + '●' }[pollingStatus];

  // Override status for special states
  if (isOffline) {
    statusIcon = ansi.red + '⊘';
  }

  const soundIcon = soundEnabled ? ansi.green + '🔔' : ansi.gray + '🔕';
  const projectName = path.basename(PROJECT_ROOT);

  write(ansi.moveTo(headerRow, 1));
  write(ansi.bgBlue + ansi.white + ansi.bold);

  // Left side: Title + separator + project name
  const leftContent = ` 🏰 Git Watchtower ${ansi.dim}│${ansi.bold} ${projectName}`;
  const leftVisibleLen = 21 + projectName.length; // " 🏰 Git Watchtower │ " + projectName

  write(leftContent);

  // Warning badges (center area)
  let badges = '';
  let badgesVisibleLen = 0;

  // Casino mode slot display moved to its own row below header (row 3)

  if (SERVER_MODE === 'command' && serverCrashed) {
    const label = ' CRASHED ';
    badges += ' ' + ansi.bgRed + ansi.white + label + ansi.bgBlue + ansi.white;
    badgesVisibleLen += 1 + label.length;
  }
  if (isOffline) {
    const label = ' OFFLINE ';
    badges += ' ' + ansi.bgRed + ansi.white + label + ansi.bgBlue + ansi.white;
    badgesVisibleLen += 1 + label.length;
  }
  if (isDetachedHead) {
    const label = ' DETACHED HEAD ';
    badges += ' ' + ansi.bgYellow + ansi.black + label + ansi.bgBlue + ansi.white;
    badgesVisibleLen += 1 + label.length;
  }
  if (hasMergeConflict) {
    const label = ' MERGE CONFLICT ';
    badges += ' ' + ansi.bgRed + ansi.white + label + ansi.bgBlue + ansi.white;
    badgesVisibleLen += 1 + label.length;
  }

  write(badges);

  // Right side: Server mode + URL + status icons
  let modeLabel = '';
  let modeBadge = '';
  if (SERVER_MODE === 'static') {
    modeLabel = ' STATIC ';
    modeBadge = ansi.bgCyan + ansi.black + modeLabel + ansi.bgBlue + ansi.white;
  } else if (SERVER_MODE === 'command') {
    modeLabel = ' COMMAND ';
    modeBadge = ansi.bgGreen + ansi.black + modeLabel + ansi.bgBlue + ansi.white;
  } else {
    modeLabel = ' MONITOR ';
    modeBadge = ansi.bgMagenta + ansi.white + modeLabel + ansi.bgBlue + ansi.white;
  }

  let serverInfo = '';
  let serverInfoVisible = '';
  if (SERVER_MODE === 'none') {
    serverInfoVisible = '';
  } else {
    const statusDot = serverRunning ? ansi.green + '●' : (serverCrashed ? ansi.red + '●' : ansi.gray + '○');
    serverInfoVisible = `localhost:${PORT} `;
    serverInfo = statusDot + ansi.white + ` localhost:${PORT} `;
  }

  const rightContent = `${modeBadge} ${serverInfo}${statusIcon}${ansi.bgBlue} ${soundIcon}${ansi.bgBlue} `;
  const rightVisibleLen = modeLabel.length + 1 + serverInfoVisible.length + 5; // mode + space + serverInfo + "● 🔔 "

  // Calculate padding to fill full width
  const usedSpace = leftVisibleLen + badgesVisibleLen + rightVisibleLen;
  const padding = Math.max(1, width - usedSpace);
  write(' '.repeat(padding));
  write(rightContent);
  write(ansi.reset);
}

function renderBranchList() {
  // Start row: 3 normally, 4 when casino mode (row 1 is marquee, row 2 is header)
  const startRow = casinoModeEnabled ? 4 : 3;
  const boxWidth = terminalWidth;
  const contentWidth = boxWidth - 4; // Space between borders
  const height = Math.min(visibleBranchCount * 2 + 4, Math.floor(terminalHeight * 0.5));

  // Determine which branches to show (filtered or all)
  const displayBranches = filteredBranches !== null ? filteredBranches : branches;
  const boxTitle = searchMode
    ? `BRANCHES (/${searchQuery}_)`
    : 'ACTIVE BRANCHES';

  drawBox(startRow, 1, boxWidth, height, boxTitle, ansi.cyan);

  // Clear content area first (fixes border gaps)
  for (let i = 1; i < height - 1; i++) {
    write(ansi.moveTo(startRow + i, 2));
    write(' '.repeat(contentWidth + 2));
  }

  // Header line
  write(ansi.moveTo(startRow + 1, 2));
  write(ansi.gray + '─'.repeat(contentWidth + 2) + ansi.reset);

  if (displayBranches.length === 0) {
    write(ansi.moveTo(startRow + 3, 4));
    if (searchMode && searchQuery) {
      write(ansi.gray + `No branches matching "${searchQuery}"` + ansi.reset);
    } else {
      write(ansi.gray + "No branches found. Press 'f' to fetch." + ansi.reset);
    }
    return startRow + height;
  }

  let row = startRow + 2;
  for (let i = 0; i < displayBranches.length && i < visibleBranchCount; i++) {
    const branch = displayBranches[i];
    const isSelected = i === selectedIndex;
    const isCurrent = branch.name === currentBranch;
    const timeAgo = formatTimeAgo(branch.date);
    const sparkline = sparklineCache.get(branch.name) || '       ';

    // Branch name line
    write(ansi.moveTo(row, 2));

    // Cursor indicator
    const cursor = isSelected ? ' ▶ ' : '   ';

    // Branch name - adjust for sparkline
    const maxNameLen = contentWidth - 38; // Extra space for sparkline
    const displayName = truncate(branch.name, maxNameLen);

    // Padding after name
    const namePadding = Math.max(1, maxNameLen - displayName.length + 2);

    // Write the line
    if (isSelected) write(ansi.inverse);
    write(cursor);

    if (branch.isDeleted) {
      write(ansi.gray + ansi.dim + displayName + ansi.reset);
      if (isSelected) write(ansi.inverse);
    } else if (isCurrent) {
      write(ansi.green + ansi.bold + displayName + ansi.reset);
      if (isSelected) write(ansi.inverse);
    } else if (branch.justUpdated) {
      write(ansi.yellow + displayName + ansi.reset);
      if (isSelected) write(ansi.inverse);
      branch.justUpdated = false;
    } else {
      write(displayName);
    }

    write(' '.repeat(namePadding));

    // Sparkline (7 chars)
    if (isSelected) write(ansi.reset);
    write(ansi.fg256(39) + sparkline + ansi.reset); // Nice blue color
    if (isSelected) write(ansi.inverse);
    write(' ');

    // Status badge
    if (branch.isDeleted) {
      if (isSelected) write(ansi.reset);
      write(ansi.red + ansi.dim + '✗ DELETED' + ansi.reset);
      if (isSelected) write(ansi.inverse);
    } else if (isCurrent) {
      if (isSelected) write(ansi.reset);
      write(ansi.green + '★ CURRENT' + ansi.reset);
      if (isSelected) write(ansi.inverse);
    } else if (branch.isNew) {
      if (isSelected) write(ansi.reset);
      write(ansi.magenta + '✦ NEW    ' + ansi.reset);
      if (isSelected) write(ansi.inverse);
    } else if (branch.hasUpdates) {
      if (isSelected) write(ansi.reset);
      write(ansi.yellow + '↓ UPDATES' + ansi.reset);
      if (isSelected) write(ansi.inverse);
    } else {
      write('         ');
    }

    // Time ago
    write('  ');
    if (isSelected) write(ansi.reset);
    write(ansi.gray + padLeft(timeAgo, 10) + ansi.reset);

    if (isSelected) write(ansi.reset);

    row++;

    // Commit info line
    write(ansi.moveTo(row, 2));
    write('      └─ ');
    write(ansi.cyan + (branch.commit || '???????') + ansi.reset);
    write(' • ');
    write(ansi.gray + truncate(branch.subject || 'No commit message', contentWidth - 22) + ansi.reset);

    row++;
  }

  return startRow + height;
}

function renderActivityLog(startRow) {
  const boxWidth = terminalWidth;
  const contentWidth = boxWidth - 4;
  const height = Math.min(MAX_LOG_ENTRIES + 3, terminalHeight - startRow - 4);

  drawBox(startRow, 1, boxWidth, height, 'ACTIVITY LOG', ansi.gray);

  // Clear content area first (fixes border gaps)
  for (let i = 1; i < height - 1; i++) {
    write(ansi.moveTo(startRow + i, 2));
    write(' '.repeat(contentWidth + 2));
  }

  let row = startRow + 1;
  for (let i = 0; i < activityLog.length && i < height - 2; i++) {
    const entry = activityLog[i];
    write(ansi.moveTo(row, 3));
    write(ansi.gray + `[${entry.timestamp}]` + ansi.reset + ' ');
    write(ansi[entry.color] + entry.icon + ansi.reset + ' ');
    write(truncate(entry.message, contentWidth - 16));
    row++;
  }

  if (activityLog.length === 0) {
    write(ansi.moveTo(startRow + 1, 3));
    write(ansi.gray + 'No activity yet...' + ansi.reset);
  }

  return startRow + height;
}

function renderCasinoStats(startRow) {
  if (!casinoModeEnabled) return startRow;

  const boxWidth = terminalWidth;
  const height = 6; // Box with two content lines

  // Don't draw if not enough space
  if (startRow + height > terminalHeight - 3) return startRow;

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
  write('Line Changes: ');
  write(ansi.brightGreen + '+' + stats.totalLinesAdded + ansi.reset);
  write(' / ');
  write(ansi.brightRed + '-' + stats.totalLinesDeleted + ansi.reset);
  write(' = ' + ansi.brightYellow + '$' + stats.totalLines + ansi.reset + ' 💵');
  write('  |  Poll Cost: ' + ansi.brightRed + '$' + stats.totalPolls + ansi.reset + ' 💸');
  write('  |  Net Earnings: ' + netColor + netSign + '$' + stats.netWinnings + ansi.reset + ' 🪙');

  // Line 2: House Edge | Vibes Quality | Luck Meter | Dopamine Hits
  write(ansi.moveTo(startRow + 3, 3));
  write('🎰 House Edge: ' + ansi.brightCyan + stats.houseEdge + '%' + ansi.reset);
  write('  |  ' + stats.vibesQuality + ' Vibes Quality: ' + ansi.brightMagenta + 'Immaculate' + ansi.reset);
  write('  |  🎲 Luck: ' + ansi.brightYellow + stats.luckMeter + '%' + ansi.reset);
  write('  |  🧠 Dopamine Hits: ' + ansi.brightGreen + stats.dopamineHits + ansi.reset);

  return startRow + height;
}

function renderFooter() {
  const row = terminalHeight - 1;

  write(ansi.moveTo(row, 1));
  write(ansi.bgBlack + ansi.white);
  write('  ');
  write(ansi.gray + '[↑↓]' + ansi.reset + ansi.bgBlack + ' Nav  ');
  write(ansi.gray + '[/]' + ansi.reset + ansi.bgBlack + ' Search  ');
  write(ansi.gray + '[v]' + ansi.reset + ansi.bgBlack + ' Preview  ');
  write(ansi.gray + '[Enter]' + ansi.reset + ansi.bgBlack + ' Switch  ');
  write(ansi.gray + '[h]' + ansi.reset + ansi.bgBlack + ' History  ');
  write(ansi.gray + '[i]' + ansi.reset + ansi.bgBlack + ' Info  ');

  // Mode-specific keys
  if (!NO_SERVER) {
    write(ansi.gray + '[l]' + ansi.reset + ansi.bgBlack + ' Logs  ');
  }
  if (SERVER_MODE === 'static') {
    write(ansi.gray + '[r]' + ansi.reset + ansi.bgBlack + ' Reload  ');
  } else if (SERVER_MODE === 'command') {
    write(ansi.gray + '[R]' + ansi.reset + ansi.bgBlack + ' Restart  ');
  }

  write(ansi.gray + '[±]' + ansi.reset + ansi.bgBlack + ' List:' + ansi.cyan + visibleBranchCount + ansi.reset + ansi.bgBlack + '  ');

  // Casino mode toggle indicator
  if (casinoModeEnabled) {
    write(ansi.brightMagenta + '[c]' + ansi.reset + ansi.bgBlack + ' 🎰  ');
  } else {
    write(ansi.gray + '[c]' + ansi.reset + ansi.bgBlack + ' Casino  ');
  }

  write(ansi.gray + '[q]' + ansi.reset + ansi.bgBlack + ' Quit  ');
  write(ansi.reset);
}

function renderFlash() {
  if (!flashMessage) return;

  const width = 50;
  const height = 5;
  const col = Math.floor((terminalWidth - width) / 2);
  const row = Math.floor((terminalHeight - height) / 2);

  // Draw double-line box
  write(ansi.moveTo(row, col));
  write(ansi.yellow + ansi.bold);
  write(box.dTopLeft + box.dHorizontal.repeat(width - 2) + box.dTopRight);

  for (let i = 1; i < height - 1; i++) {
    write(ansi.moveTo(row + i, col));
    write(box.dVertical + ' '.repeat(width - 2) + box.dVertical);
  }

  write(ansi.moveTo(row + height - 1, col));
  write(box.dBottomLeft + box.dHorizontal.repeat(width - 2) + box.dBottomRight);
  write(ansi.reset);

  // Content
  write(ansi.moveTo(row + 1, col + Math.floor((width - 16) / 2)));
  write(ansi.yellow + ansi.bold + '⚡ NEW UPDATE ⚡' + ansi.reset);

  write(ansi.moveTo(row + 2, col + 2));
  const truncMsg = truncate(flashMessage, width - 4);
  write(ansi.white + truncMsg + ansi.reset);

  write(ansi.moveTo(row + 3, col + Math.floor((width - 22) / 2)));
  write(ansi.gray + 'Press any key to dismiss' + ansi.reset);
}

function renderErrorToast() {
  if (!errorToast) return;

  const width = Math.min(60, terminalWidth - 4);
  const col = Math.floor((terminalWidth - width) / 2);
  const row = 2; // Near the top, below header

  // Calculate height based on content
  const lines = [];
  lines.push(errorToast.title || 'Git Error');
  lines.push('');

  // Word wrap the message
  const msgWords = errorToast.message.split(' ');
  let currentLine = '';
  for (const word of msgWords) {
    if ((currentLine + ' ' + word).length > width - 6) {
      lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine += (currentLine ? ' ' : '') + word;
    }
  }
  if (currentLine) lines.push(currentLine.trim());

  if (errorToast.hint) {
    lines.push('');
    lines.push(errorToast.hint);
  }
  lines.push('');
  lines.push('Press any key to dismiss');

  const height = lines.length + 2;

  // Draw red error box
  write(ansi.moveTo(row, col));
  write(ansi.red + ansi.bold);
  write(box.dTopLeft + box.dHorizontal.repeat(width - 2) + box.dTopRight);

  for (let i = 1; i < height - 1; i++) {
    write(ansi.moveTo(row + i, col));
    write(ansi.red + box.dVertical + ansi.reset + ansi.bgRed + ansi.white + ' '.repeat(width - 2) + ansi.reset + ansi.red + box.dVertical + ansi.reset);
  }

  write(ansi.moveTo(row + height - 1, col));
  write(ansi.red + box.dBottomLeft + box.dHorizontal.repeat(width - 2) + box.dBottomRight);
  write(ansi.reset);

  // Render content
  let contentRow = row + 1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    write(ansi.moveTo(contentRow, col + 2));
    write(ansi.bgRed + ansi.white);

    if (i === 0) {
      // Title line - centered and bold
      const titlePadding = Math.floor((width - 4 - line.length) / 2);
      write(' '.repeat(titlePadding) + ansi.bold + line + ansi.reset + ansi.bgRed + ansi.white + ' '.repeat(width - 4 - titlePadding - line.length));
    } else if (line === 'Press any key to dismiss') {
      // Instruction line - centered and dimmer
      const padding = Math.floor((width - 4 - line.length) / 2);
      write(ansi.reset + ansi.bgRed + ansi.gray + ' '.repeat(padding) + line + ' '.repeat(width - 4 - padding - line.length));
    } else if (errorToast.hint && line === errorToast.hint) {
      // Hint line - yellow on red
      const padding = Math.floor((width - 4 - line.length) / 2);
      write(ansi.reset + ansi.bgRed + ansi.yellow + ' '.repeat(padding) + line + ' '.repeat(width - 4 - padding - line.length));
    } else {
      // Regular content
      write(padRight(line, width - 4));
    }
    write(ansi.reset);
    contentRow++;
  }
}

function renderPreview() {
  if (!previewMode || !previewData) return;

  const width = Math.min(60, terminalWidth - 4);
  const height = 16;
  const col = Math.floor((terminalWidth - width) / 2);
  const row = Math.floor((terminalHeight - height) / 2);

  const displayBranches = filteredBranches !== null ? filteredBranches : branches;
  const branch = displayBranches[selectedIndex];
  if (!branch) return;

  // Draw box
  write(ansi.moveTo(row, col));
  write(ansi.cyan + ansi.bold);
  write(box.dTopLeft + box.dHorizontal.repeat(width - 2) + box.dTopRight);

  for (let i = 1; i < height - 1; i++) {
    write(ansi.moveTo(row + i, col));
    write(ansi.cyan + box.dVertical + ansi.reset + ' '.repeat(width - 2) + ansi.cyan + box.dVertical + ansi.reset);
  }

  write(ansi.moveTo(row + height - 1, col));
  write(ansi.cyan + box.dBottomLeft + box.dHorizontal.repeat(width - 2) + box.dBottomRight);
  write(ansi.reset);

  // Title
  const title = ` Preview: ${truncate(branch.name, width - 14)} `;
  write(ansi.moveTo(row, col + 2));
  write(ansi.cyan + ansi.bold + title + ansi.reset);

  // Commits section
  write(ansi.moveTo(row + 2, col + 2));
  write(ansi.white + ansi.bold + 'Recent Commits:' + ansi.reset);

  let contentRow = row + 3;
  if (previewData.commits.length === 0) {
    write(ansi.moveTo(contentRow, col + 3));
    write(ansi.gray + '(no commits)' + ansi.reset);
    contentRow++;
  } else {
    for (const commit of previewData.commits.slice(0, 5)) {
      write(ansi.moveTo(contentRow, col + 3));
      write(ansi.yellow + commit.hash + ansi.reset + ' ');
      write(ansi.gray + truncate(commit.message, width - 14) + ansi.reset);
      contentRow++;
    }
  }

  // Files section
  contentRow++;
  write(ansi.moveTo(contentRow, col + 2));
  write(ansi.white + ansi.bold + 'Files Changed vs HEAD:' + ansi.reset);
  contentRow++;

  if (previewData.filesChanged.length === 0) {
    write(ansi.moveTo(contentRow, col + 3));
    write(ansi.gray + '(no changes or same as current)' + ansi.reset);
  } else {
    for (const file of previewData.filesChanged.slice(0, 5)) {
      write(ansi.moveTo(contentRow, col + 3));
      write(ansi.green + '• ' + ansi.reset + truncate(file, width - 8));
      contentRow++;
    }
    if (previewData.filesChanged.length > 5) {
      write(ansi.moveTo(contentRow, col + 3));
      write(ansi.gray + `... and ${previewData.filesChanged.length - 5} more` + ansi.reset);
    }
  }

  // Instructions
  write(ansi.moveTo(row + height - 2, col + Math.floor((width - 26) / 2)));
  write(ansi.gray + 'Press [v] or [Esc] to close' + ansi.reset);
}

function renderHistory() {
  const width = Math.min(50, terminalWidth - 4);
  const height = Math.min(switchHistory.length + 5, 15);
  const col = Math.floor((terminalWidth - width) / 2);
  const row = Math.floor((terminalHeight - height) / 2);

  // Draw box
  write(ansi.moveTo(row, col));
  write(ansi.magenta + ansi.bold);
  write(box.dTopLeft + box.dHorizontal.repeat(width - 2) + box.dTopRight);

  for (let i = 1; i < height - 1; i++) {
    write(ansi.moveTo(row + i, col));
    write(ansi.magenta + box.dVertical + ansi.reset + ' '.repeat(width - 2) + ansi.magenta + box.dVertical + ansi.reset);
  }

  write(ansi.moveTo(row + height - 1, col));
  write(ansi.magenta + box.dBottomLeft + box.dHorizontal.repeat(width - 2) + box.dBottomRight);
  write(ansi.reset);

  // Title
  write(ansi.moveTo(row, col + 2));
  write(ansi.magenta + ansi.bold + ' Switch History ' + ansi.reset);

  // Content
  if (switchHistory.length === 0) {
    write(ansi.moveTo(row + 2, col + 3));
    write(ansi.gray + 'No branch switches yet' + ansi.reset);
  } else {
    let contentRow = row + 2;
    for (let i = 0; i < Math.min(switchHistory.length, height - 4); i++) {
      const entry = switchHistory[i];
      write(ansi.moveTo(contentRow, col + 3));
      if (i === 0) {
        write(ansi.yellow + '→ ' + ansi.reset); // Most recent
      } else {
        write(ansi.gray + '  ' + ansi.reset);
      }
      write(truncate(entry.from, 15) + ansi.gray + ' → ' + ansi.reset);
      write(ansi.cyan + truncate(entry.to, 15) + ansi.reset);
      contentRow++;
    }
  }

  // Instructions
  write(ansi.moveTo(row + height - 2, col + 2));
  write(ansi.gray + '[u] Undo last  [h]/[Esc] Close' + ansi.reset);
}

let historyMode = false;
let infoMode = false;

function renderLogView() {
  if (!logViewMode) return;

  const width = Math.min(terminalWidth - 4, 100);
  const height = Math.min(terminalHeight - 4, 30);
  const col = Math.floor((terminalWidth - width) / 2);
  const row = Math.floor((terminalHeight - height) / 2);

  // Determine which log to display
  const isServerTab = logViewTab === 'server';
  const logData = isServerTab ? serverLogBuffer : activityLog;

  // Draw box
  write(ansi.moveTo(row, col));
  write(ansi.yellow + ansi.bold);
  write(box.dTopLeft + box.dHorizontal.repeat(width - 2) + box.dTopRight);

  for (let i = 1; i < height - 1; i++) {
    write(ansi.moveTo(row + i, col));
    write(ansi.yellow + box.dVertical + ansi.reset + ' '.repeat(width - 2) + ansi.yellow + box.dVertical + ansi.reset);
  }

  write(ansi.moveTo(row + height - 1, col));
  write(ansi.yellow + box.dBottomLeft + box.dHorizontal.repeat(width - 2) + box.dBottomRight);
  write(ansi.reset);

  // Title with tabs
  const activityTab = logViewTab === 'activity'
    ? ansi.bgWhite + ansi.black + ' 1:Activity ' + ansi.reset + ansi.yellow
    : ansi.gray + ' 1:Activity ' + ansi.yellow;
  const serverTab = logViewTab === 'server'
    ? ansi.bgWhite + ansi.black + ' 2:Server ' + ansi.reset + ansi.yellow
    : ansi.gray + ' 2:Server ' + ansi.yellow;

  // Server status (only show on server tab)
  let statusIndicator = '';
  if (isServerTab && SERVER_MODE === 'command') {
    const statusText = serverRunning ? ansi.green + 'RUNNING' : (serverCrashed ? ansi.red + 'CRASHED' : ansi.gray + 'STOPPED');
    statusIndicator = ` [${statusText}${ansi.yellow}]`;
  } else if (isServerTab && SERVER_MODE === 'static') {
    statusIndicator = ansi.green + ' [STATIC]' + ansi.yellow;
  }

  write(ansi.moveTo(row, col + 2));
  write(ansi.yellow + ansi.bold + ' ' + activityTab + ' ' + serverTab + statusIndicator + ' ' + ansi.reset);

  // Content
  const contentHeight = height - 4;
  const maxScroll = Math.max(0, logData.length - contentHeight);
  logScrollOffset = Math.min(logScrollOffset, maxScroll);
  logScrollOffset = Math.max(0, logScrollOffset);

  let contentRow = row + 2;

  if (logData.length === 0) {
    write(ansi.moveTo(contentRow, col + 2));
    write(ansi.gray + (isServerTab ? 'No server output yet...' : 'No activity yet...') + ansi.reset);
  } else if (isServerTab) {
    // Server log: newest at bottom, scroll from bottom
    const startIndex = Math.max(0, serverLogBuffer.length - contentHeight - logScrollOffset);
    const endIndex = Math.min(serverLogBuffer.length, startIndex + contentHeight);

    for (let i = startIndex; i < endIndex; i++) {
      const entry = serverLogBuffer[i];
      write(ansi.moveTo(contentRow, col + 2));
      const lineText = truncate(entry.line, width - 4);
      if (entry.isError) {
        write(ansi.red + lineText + ansi.reset);
      } else {
        write(lineText);
      }
      contentRow++;
    }
  } else {
    // Activity log: newest first, scroll from top
    const startIndex = logScrollOffset;
    const endIndex = Math.min(activityLog.length, startIndex + contentHeight);

    for (let i = startIndex; i < endIndex; i++) {
      const entry = activityLog[i];
      write(ansi.moveTo(contentRow, col + 2));
      write(ansi.gray + `[${entry.timestamp}]` + ansi.reset + ' ');
      write(ansi[entry.color] + entry.icon + ansi.reset + ' ');
      write(truncate(entry.message, width - 18));
      contentRow++;
    }
  }

  // Scroll indicator
  if (logData.length > contentHeight) {
    const scrollPercent = isServerTab
      ? Math.round((1 - logScrollOffset / maxScroll) * 100)
      : Math.round((logScrollOffset / maxScroll) * 100);
    write(ansi.moveTo(row, col + width - 10));
    write(ansi.gray + ` ${scrollPercent}% ` + ansi.reset);
  }

  // Instructions
  write(ansi.moveTo(row + height - 2, col + 2));
  const restartHint = SERVER_MODE === 'command' ? '[R] Restart  ' : '';
  write(ansi.gray + '[1/2] Switch Tab  [↑↓] Scroll  ' + restartHint + '[l]/[Esc] Close' + ansi.reset);
}

function renderInfo() {
  const width = Math.min(50, terminalWidth - 4);
  const height = NO_SERVER ? 9 : 12;
  const col = Math.floor((terminalWidth - width) / 2);
  const row = Math.floor((terminalHeight - height) / 2);

  // Draw box
  write(ansi.moveTo(row, col));
  write(ansi.cyan + ansi.bold);
  write(box.dTopLeft + box.dHorizontal.repeat(width - 2) + box.dTopRight);

  for (let i = 1; i < height - 1; i++) {
    write(ansi.moveTo(row + i, col));
    write(ansi.cyan + box.dVertical + ansi.reset + ' '.repeat(width - 2) + ansi.cyan + box.dVertical + ansi.reset);
  }

  write(ansi.moveTo(row + height - 1, col));
  write(ansi.cyan + box.dBottomLeft + box.dHorizontal.repeat(width - 2) + box.dBottomRight);
  write(ansi.reset);

  // Title
  write(ansi.moveTo(row, col + 2));
  write(ansi.cyan + ansi.bold + (NO_SERVER ? ' Status Info ' : ' Server Info ') + ansi.reset);

  // Content
  let contentRow = row + 2;

  if (!NO_SERVER) {
    write(ansi.moveTo(contentRow, col + 3));
    write(ansi.white + ansi.bold + 'Dev Server' + ansi.reset);
    contentRow++;

    write(ansi.moveTo(contentRow, col + 3));
    write(ansi.gray + 'URL: ' + ansi.reset + ansi.green + `http://localhost:${PORT}` + ansi.reset);
    contentRow++;

    write(ansi.moveTo(contentRow, col + 3));
    write(ansi.gray + 'Port: ' + ansi.reset + ansi.yellow + PORT + ansi.reset);
    contentRow++;

    write(ansi.moveTo(contentRow, col + 3));
    write(ansi.gray + 'Connected browsers: ' + ansi.reset + ansi.cyan + clients.size + ansi.reset);
    contentRow++;

    contentRow++;
  }

  write(ansi.moveTo(contentRow, col + 3));
  write(ansi.white + ansi.bold + 'Git Polling' + ansi.reset);
  contentRow++;

  write(ansi.moveTo(contentRow, col + 3));
  write(ansi.gray + 'Interval: ' + ansi.reset + `${adaptivePollInterval / 1000}s`);
  contentRow++;

  write(ansi.moveTo(contentRow, col + 3));
  write(ansi.gray + 'Status: ' + ansi.reset + (isOffline ? ansi.red + 'Offline' : ansi.green + 'Online') + ansi.reset);
  contentRow++;

  if (NO_SERVER) {
    write(ansi.moveTo(contentRow, col + 3));
    write(ansi.gray + 'Mode: ' + ansi.reset + ansi.magenta + 'No-Server (branch monitor only)' + ansi.reset);
  }

  // Instructions
  write(ansi.moveTo(row + height - 2, col + Math.floor((width - 20) / 2)));
  write(ansi.gray + 'Press [i] or [Esc] to close' + ansi.reset);
}

function render() {
  updateTerminalSize();

  write(ansi.hideCursor);
  write(ansi.moveToTop);
  write(ansi.clearScreen);

  // Casino mode: top marquee border
  if (casinoModeEnabled) {
    write(ansi.moveTo(1, 1));
    write(casino.renderMarqueeLine(terminalWidth, 'top'));
  }

  renderHeader();
  const logStart = renderBranchList();
  const statsStart = renderActivityLog(logStart);
  renderCasinoStats(statsStart);
  renderFooter();

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
      // Row 3: below header (row 1 is marquee, row 2 is header)
      const resultLabel = casino.getSlotResultLabel();
      let leftLabel, rightLabel;

      if (casino.isSlotSpinning()) {
        leftLabel = ansi.bgBrightYellow + ansi.black + ansi.bold + ' POLLING ' + ansi.reset;
        rightLabel = '';
      } else if (resultLabel) {
        leftLabel = ansi.bgBrightGreen + ansi.black + ansi.bold + ' RESULT ' + ansi.reset;
        // Flash effect for jackpots
        const flash = resultLabel.isJackpot && (Math.floor(Date.now() / 150) % 2 === 0);
        const bgColor = flash ? ansi.bgBrightYellow : ansi.bgWhite;
        rightLabel = ' ' + bgColor + ansi.black + ansi.bold + ' ' + resultLabel.text + ' ' + ansi.reset;
      } else {
        leftLabel = ansi.bgBrightGreen + ansi.black + ansi.bold + ' RESULT ' + ansi.reset;
        rightLabel = '';
      }

      const fullDisplay = leftLabel + ' ' + slotDisplay + rightLabel;
      const col = Math.floor((terminalWidth - 70) / 2); // Center the display
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

  if (flashMessage) {
    renderFlash();
  }

  if (previewMode && previewData) {
    renderPreview();
  }

  if (historyMode) {
    renderHistory();
  }

  if (infoMode) {
    renderInfo();
  }

  if (logViewMode) {
    renderLogView();
  }

  // Error toast renders on top of everything for maximum visibility
  if (errorToast) {
    renderErrorToast();
  }
}

function showFlash(message) {
  if (flashTimeout) clearTimeout(flashTimeout);

  flashMessage = message;
  render();

  flashTimeout = setTimeout(() => {
    flashMessage = null;
    render();
  }, 3000);
}

function hideFlash() {
  if (flashTimeout) {
    clearTimeout(flashTimeout);
    flashTimeout = null;
  }
  if (flashMessage) {
    flashMessage = null;
    render();
  }
}

function showErrorToast(title, message, hint = null, duration = 8000) {
  if (errorToastTimeout) clearTimeout(errorToastTimeout);

  errorToast = { title, message, hint };
  playSound(); // Alert sound for errors
  render();

  errorToastTimeout = setTimeout(() => {
    errorToast = null;
    render();
  }, duration);
}

function hideErrorToast() {
  if (errorToastTimeout) {
    clearTimeout(errorToastTimeout);
    errorToastTimeout = null;
  }
  if (errorToast) {
    errorToast = null;
    render();
  }
}

// ============================================================================
// Git Functions
// ============================================================================

async function getCurrentBranch() {
  try {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD');
    // Check for detached HEAD state
    if (stdout === 'HEAD') {
      isDetachedHead = true;
      // Get the short commit hash instead
      const { stdout: commitHash } = await execAsync('git rev-parse --short HEAD');
      return `HEAD@${commitHash}`;
    }
    isDetachedHead = false;
    return stdout;
  } catch (e) {
    return null;
  }
}

async function checkRemoteExists() {
  try {
    const { stdout } = await execAsync('git remote');
    const remotes = stdout.split('\n').filter(Boolean);
    return remotes.length > 0;
  } catch (e) {
    return false;
  }
}

async function hasUncommittedChanges() {
  try {
    const { stdout } = await execAsync('git status --porcelain');
    return stdout.length > 0;
  } catch (e) {
    return false;
  }
}

function isAuthError(errorMessage) {
  const authErrors = [
    'Authentication failed',
    'could not read Username',
    'could not read Password',
    'Permission denied',
    'invalid credentials',
    'authorization failed',
    'fatal: Authentication',
    'HTTP 401',
    'HTTP 403',
  ];
  const msg = (errorMessage || '').toLowerCase();
  return authErrors.some(err => msg.includes(err.toLowerCase()));
}

function isMergeConflict(errorMessage) {
  const conflictIndicators = [
    'CONFLICT',
    'Automatic merge failed',
    'fix conflicts',
    'Merge conflict',
  ];
  return conflictIndicators.some(ind => (errorMessage || '').includes(ind));
}

function isNetworkError(errorMessage) {
  const networkErrors = [
    'Could not resolve host',
    'unable to access',
    'Connection refused',
    'Network is unreachable',
    'Connection timed out',
    'Failed to connect',
    'no route to host',
    'Temporary failure in name resolution',
  ];
  const msg = (errorMessage || '').toLowerCase();
  return networkErrors.some(err => msg.includes(err.toLowerCase()));
}

async function getAllBranches() {
  try {
    await execAsync('git fetch --all --prune 2>/dev/null').catch(() => {});

    const branchList = [];
    const seenBranches = new Set();

    // Get local branches
    const { stdout: localOutput } = await execAsync(
      'git for-each-ref --sort=-committerdate --format="%(refname:short)|%(committerdate:iso8601)|%(objectname:short)|%(subject)" refs/heads/'
    );

    for (const line of localOutput.split('\n').filter(Boolean)) {
      const [name, dateStr, commit, subject] = line.split('|');
      if (!seenBranches.has(name) && isValidBranchName(name)) {
        seenBranches.add(name);
        branchList.push({
          name,
          commit,
          subject: subject || '',
          date: new Date(dateStr),
          isLocal: true,
          hasRemote: false,
          hasUpdates: false,
        });
      }
    }

    // Get remote branches (using configured remote name)
    const { stdout: remoteOutput } = await execAsync(
      `git for-each-ref --sort=-committerdate --format="%(refname:short)|%(committerdate:iso8601)|%(objectname:short)|%(subject)" refs/remotes/${REMOTE_NAME}/`
    ).catch(() => ({ stdout: '' }));

    const remotePrefix = `${REMOTE_NAME}/`;
    for (const line of remoteOutput.split('\n').filter(Boolean)) {
      const [fullName, dateStr, commit, subject] = line.split('|');
      const name = fullName.replace(remotePrefix, '');
      if (name === 'HEAD') continue;
      if (!isValidBranchName(name)) continue;

      const existing = branchList.find(b => b.name === name);
      if (existing) {
        existing.hasRemote = true;
        existing.remoteCommit = commit;
        existing.remoteDate = new Date(dateStr);
        existing.remoteSubject = subject || '';
        if (commit !== existing.commit) {
          existing.hasUpdates = true;
          // Use remote's date when it has updates (so it sorts to top)
          existing.date = new Date(dateStr);
          existing.subject = subject || existing.subject;
        }
      } else if (!seenBranches.has(name)) {
        seenBranches.add(name);
        branchList.push({
          name,
          commit,
          subject: subject || '',
          date: new Date(dateStr),
          isLocal: false,
          hasRemote: true,
          hasUpdates: false,
        });
      }
    }

    branchList.sort((a, b) => b.date - a.date);
    return branchList; // Return all branches, caller will slice
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
      addLog(`Commit or stash your changes first`, 'warning');
      showErrorToast(
        'Cannot Switch Branch',
        'You have uncommitted changes in your working directory that would be lost.',
        'Run: git stash or git commit'
      );
      return { success: false, reason: 'dirty' };
    }

    const previousBranch = currentBranch;

    addLog(`Switching to ${safeBranchName}...`, 'update');
    render();

    const { stdout: localBranches } = await execAsync('git branch --list');
    const hasLocal = localBranches.split('\n').some(b => b.trim().replace('* ', '') === safeBranchName);

    if (hasLocal) {
      await execAsync(`git checkout -- . 2>/dev/null; git checkout "${safeBranchName}"`);
    } else {
      await execAsync(`git checkout -b "${safeBranchName}" "${REMOTE_NAME}/${safeBranchName}"`);
    }

    currentBranch = safeBranchName;
    isDetachedHead = false; // Successfully switched to branch

    // Clear NEW flag when branch becomes current
    const branchInfo = branches.find(b => b.name === safeBranchName);
    if (branchInfo && branchInfo.isNew) {
      branchInfo.isNew = false;
    }

    // Record in history (for undo)
    if (recordHistory && previousBranch && previousBranch !== safeBranchName) {
      switchHistory.unshift({ from: previousBranch, to: safeBranchName, timestamp: Date.now() });
      if (switchHistory.length > MAX_HISTORY) switchHistory.pop();
    }

    addLog(`Switched to ${safeBranchName}`, 'success');

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
      addLog(`Commit or stash your changes first`, 'warning');
      showErrorToast(
        'Cannot Switch Branch',
        'Your local changes would be overwritten by checkout.',
        'Run: git stash or git commit'
      );
    } else {
      addLog(`Failed to switch: ${errMsg}`, 'error');
      showErrorToast(
        'Branch Switch Failed',
        truncate(errMsg, 100),
        'Check the activity log for details'
      );
    }
    return { success: false };
  }
}

async function undoLastSwitch() {
  if (switchHistory.length === 0) {
    addLog('No switch history to undo', 'warning');
    return { success: false };
  }

  const lastSwitch = switchHistory[0];
  addLog(`Undoing: going back to ${lastSwitch.from}`, 'update');

  const result = await switchToBranch(lastSwitch.from, false);
  if (result.success) {
    switchHistory.shift(); // Remove the undone entry
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

    await execAsync(`git pull "${REMOTE_NAME}" "${branch}"`);
    addLog('Pulled successfully', 'success');
    notifyClients();
    return { success: true };
  } catch (e) {
    const errMsg = e.stderr || e.message || String(e);
    addLog(`Pull failed: ${errMsg}`, 'error');

    if (isMergeConflict(errMsg)) {
      hasMergeConflict = true;
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

// ============================================================================
// Polling
// ============================================================================

async function pollGitChanges() {
  if (isPolling) return;
  isPolling = true;
  pollingStatus = 'fetching';

  // Casino mode: start slot reels spinning (no sound - too annoying)
  if (casinoModeEnabled) {
    casino.startSlotReels(render);
  }

  render();

  const fetchStartTime = Date.now();

  try {
    const newCurrentBranch = await getCurrentBranch();

    if (currentBranch && newCurrentBranch !== currentBranch) {
      addLog(`Branch switched externally: ${currentBranch} → ${newCurrentBranch}`, 'warning');
      notifyClients();
    }
    currentBranch = newCurrentBranch;

    const allBranches = await getAllBranches();

    // Track fetch duration
    lastFetchDuration = Date.now() - fetchStartTime;

    // Check for slow fetches
    if (lastFetchDuration > 30000 && !verySlowFetchWarningShown) {
      addLog(`⚠ Fetches taking ${Math.round(lastFetchDuration / 1000)}s - network may be slow`, 'warning');
      verySlowFetchWarningShown = true;
      // Slow down polling
      adaptivePollInterval = Math.min(adaptivePollInterval * 2, 60000);
      addLog(`Polling interval increased to ${adaptivePollInterval / 1000}s`, 'info');
      restartPolling();
    } else if (lastFetchDuration > 15000 && !slowFetchWarningShown) {
      addLog(`Fetches taking ${Math.round(lastFetchDuration / 1000)}s`, 'warning');
      slowFetchWarningShown = true;
    } else if (lastFetchDuration < 5000) {
      // Reset warnings if fetches are fast again
      slowFetchWarningShown = false;
      verySlowFetchWarningShown = false;
      if (adaptivePollInterval > GIT_POLL_INTERVAL) {
        adaptivePollInterval = GIT_POLL_INTERVAL;
        addLog(`Polling interval restored to ${adaptivePollInterval / 1000}s`, 'info');
        restartPolling();
      }
    }

    // Network success - reset failure counter
    consecutiveNetworkFailures = 0;
    if (isOffline) {
      isOffline = false;
      addLog('Connection restored', 'success');
    }
    const fetchedBranchNames = new Set(allBranches.map(b => b.name));
    const now = Date.now();

    // Detect NEW branches (not seen before)
    const newBranchList = [];
    for (const branch of allBranches) {
      if (!knownBranchNames.has(branch.name)) {
        branch.isNew = true;
        branch.newAt = now;
        addLog(`New branch: ${branch.name}`, 'success');
        newBranchList.push(branch);
      } else {
        // Preserve isNew flag from previous poll cycle for branches not yet switched to
        const prevBranch = branches.find(b => b.name === branch.name);
        if (prevBranch && prevBranch.isNew) {
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
        const existingInList = branches.find(b => b.name === knownName);
        if (existingInList && !existingInList.isDeleted) {
          existingInList.isDeleted = true;
          existingInList.deletedAt = now;
          addLog(`Branch deleted: ${knownName}`, 'warning');
          // Keep it in the list temporarily
          allBranches.push(existingInList);
        }
        // Remove from known set after a delay (handled below)
      }
    }

    // Note: isNew flag is only cleared when branch becomes current (see below)

    // Keep deleted branches in the list (don't remove them)
    const filteredBranches = allBranches;

    // Detect updates on other branches (for flash notification)
    const updatedBranches = [];
    for (const branch of filteredBranches) {
      if (branch.isDeleted) continue;
      const prevCommit = previousBranchStates.get(branch.name);
      if (prevCommit && prevCommit !== branch.commit && branch.name !== currentBranch) {
        updatedBranches.push(branch);
        branch.justUpdated = true;
      }
      previousBranchStates.set(branch.name, branch.commit);
    }

    // Flash and sound for updates or new branches
    const notifyBranches = [...updatedBranches, ...newBranchList];
    if (notifyBranches.length > 0) {
      for (const branch of updatedBranches) {
        addLog(`Update on ${branch.name}: ${branch.commit}`, 'update');
      }

      // Casino mode: add funny commentary
      if (casinoModeEnabled) {
        addLog(`🎰 ${getCasinoMessage('win')}`, 'success');
      }

      const names = notifyBranches.map(b => b.name).join(', ');
      showFlash(names);
      playSound();

      // Casino mode: trigger win effect based on number of updated branches
      if (casinoModeEnabled) {
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
    } else if (casinoModeEnabled) {
      // No updates - stop reels and show result briefly
      casino.stopSlotReels(false, render);
      casino.recordPoll(false);
    }

    // Remember which branch was selected before updating the list
    const previouslySelectedName = selectedBranchName || (branches[selectedIndex] ? branches[selectedIndex].name : null);

    // Sort: new branches first, then by date, deleted branches at the bottom
    filteredBranches.sort((a, b) => {
      if (a.isDeleted && !b.isDeleted) return 1;
      if (!a.isDeleted && b.isDeleted) return -1;
      if (a.isNew && !b.isNew) return -1;
      if (!a.isNew && b.isNew) return 1;
      return b.date - a.date;
    });

    // Store all branches (no limit) - visibleBranchCount controls display
    branches = filteredBranches;

    // Restore selection to the same branch (by name) after reordering
    if (previouslySelectedName) {
      const newIndex = branches.findIndex(b => b.name === previouslySelectedName);
      if (newIndex >= 0) {
        selectedIndex = newIndex;
        selectedBranchName = previouslySelectedName;
      } else {
        // Branch fell off the list, keep index at bottom or clamp
        selectedIndex = Math.min(selectedIndex, Math.max(0, branches.length - 1));
        selectedBranchName = branches[selectedIndex] ? branches[selectedIndex].name : null;
      }
    } else if (selectedIndex >= branches.length) {
      selectedIndex = Math.max(0, branches.length - 1);
      selectedBranchName = branches[selectedIndex] ? branches[selectedIndex].name : null;
    }

    // AUTO-PULL: If current branch has remote updates, pull automatically (if enabled)
    const currentInfo = branches.find(b => b.name === currentBranch);
    if (AUTO_PULL && currentInfo && currentInfo.hasUpdates && !hasMergeConflict) {
      addLog(`Auto-pulling changes for ${currentBranch}...`, 'update');
      render();

      // Save the old commit for diff calculation (casino mode)
      const oldCommit = currentInfo.commit;

      try {
        await execAsync(`git pull "${REMOTE_NAME}" "${currentBranch}"`);
        addLog(`Pulled successfully from ${currentBranch}`, 'success');
        currentInfo.hasUpdates = false;
        hasMergeConflict = false;
        // Update the stored commit to the new one
        const newCommit = await execAsync('git rev-parse --short HEAD');
        currentInfo.commit = newCommit.stdout.trim();
        previousBranchStates.set(currentBranch, newCommit.stdout.trim());
        // Reload browsers
        notifyClients();

        // Casino mode: calculate actual diff and trigger win effect
        if (casinoModeEnabled && oldCommit) {
          const diffStats = await getDiffStats(oldCommit, 'HEAD');
          const totalLines = diffStats.added + diffStats.deleted;
          if (totalLines > 0) {
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
          hasMergeConflict = true;
          addLog(`MERGE CONFLICT detected!`, 'error');
          addLog(`Resolve conflicts manually, then commit`, 'warning');
          showErrorToast(
            'Merge Conflict!',
            'Auto-pull resulted in merge conflicts that need manual resolution.',
            'Run: git status to see conflicts'
          );
          // Casino mode: trigger loss effect
          if (casinoModeEnabled) {
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

    pollingStatus = 'idle';
    // Casino mode: stop slot reels if still spinning (already handled above, just cleanup)
    if (casinoModeEnabled && casino.isSlotSpinning()) {
      casino.stopSlotReels(false, render);
    }
  } catch (err) {
    const errMsg = err.stderr || err.message || String(err);

    // Casino mode: stop slot reels and show loss on error
    if (casinoModeEnabled) {
      casino.stopSlotReels(false, render);
      casino.triggerLoss('BUST!', render);
      casinoSounds.playLoss();
    }

    // Handle different error types
    if (isNetworkError(errMsg)) {
      consecutiveNetworkFailures++;
      if (consecutiveNetworkFailures >= 3 && !isOffline) {
        isOffline = true;
        addLog(`Network unavailable (${consecutiveNetworkFailures} failures)`, 'error');
        showErrorToast(
          'Network Unavailable',
          'Cannot connect to the remote repository. Git operations will fail until connection is restored.',
          'Check your internet connection'
        );
      }
      pollingStatus = 'error';
    } else if (isAuthError(errMsg)) {
      addLog(`Authentication error - check credentials`, 'error');
      addLog(`Try: git config credential.helper store`, 'warning');
      showErrorToast(
        'Git Authentication Error',
        'Failed to authenticate with the remote repository.',
        'Run: git config credential.helper store'
      );
      pollingStatus = 'error';
    } else {
      pollingStatus = 'error';
      addLog(`Polling error: ${errMsg}`, 'error');
    }
  } finally {
    isPolling = false;
    render();
  }
}

function restartPolling() {
  if (pollIntervalId) {
    clearInterval(pollIntervalId);
  }
  pollIntervalId = setInterval(pollGitChanges, adaptivePollInterval);
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
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h1>404 Not Found</h1>');
      addServerLog(`GET ${logPath} → 404`, true);
      return;
    }

    if (mimeType === 'text/html') {
      let html = data.toString();
      if (html.includes('</body>')) {
        html = html.replace('</body>', LIVE_RELOAD_SCRIPT);
      }
      res.writeHead(200, { 'Content-Type': mimeType });
      res.end(html);
    } else {
      res.writeHead(200, { 'Content-Type': mimeType });
      res.end(data);
    }
    addServerLog(`GET ${logPath} → 200`);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = url.pathname;
  const logPath = pathname; // Keep original for logging

  if (pathname === '/livereload') {
    handleLiveReload(req, res);
    return;
  }

  pathname = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(STATIC_DIR, pathname);

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

// ============================================================================
// File Watcher
// ============================================================================

let fileWatcher = null;
let debounceTimer = null;

function setupFileWatcher() {
  if (fileWatcher) fileWatcher.close();

  try {
    fileWatcher = fs.watch(STATIC_DIR, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
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

function applySearchFilter() {
  if (!searchQuery) {
    filteredBranches = null;
    return;
  }
  const query = searchQuery.toLowerCase();
  filteredBranches = branches.filter(b => b.name.toLowerCase().includes(query));
  // Reset selection if out of bounds
  if (selectedIndex >= filteredBranches.length) {
    selectedIndex = Math.max(0, filteredBranches.length - 1);
  }
}

function setupKeyboardInput() {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', async (key) => {
    // Handle search mode input
    if (searchMode) {
      if (key === '\u001b' || key === '\r' || key === '\n') { // Escape or Enter exits search
        searchMode = false;
        if (key === '\u001b') {
          // Escape clears search
          searchQuery = '';
          filteredBranches = null;
        }
        render();
        return;
      } else if (key === '\u007f' || key === '\b') { // Backspace
        searchQuery = searchQuery.slice(0, -1);
        applySearchFilter();
        render();
        return;
      } else if (key.length === 1 && key >= ' ' && key <= '~') { // Printable chars
        searchQuery += key;
        applySearchFilter();
        render();
        return;
      }
      // Allow nav keys in search mode
      if (key !== '\u001b[A' && key !== '\u001b[B') {
        return;
      }
    }

    // Handle modal modes
    if (previewMode) {
      if (key === 'v' || key === '\u001b' || key === '\r' || key === '\n') {
        previewMode = false;
        previewData = null;
        render();
        return;
      }
      return; // Ignore other keys in preview mode
    }

    if (historyMode) {
      if (key === 'h' || key === '\u001b') {
        historyMode = false;
        render();
        return;
      }
      if (key === 'u') {
        historyMode = false;
        await undoLastSwitch();
        await pollGitChanges();
        return;
      }
      return; // Ignore other keys in history mode
    }

    if (infoMode) {
      if (key === 'i' || key === '\u001b') {
        infoMode = false;
        render();
        return;
      }
      return; // Ignore other keys in info mode
    }

    if (logViewMode) {
      if (key === 'l' || key === '\u001b') {
        logViewMode = false;
        logScrollOffset = 0;
        render();
        return;
      }
      if (key === '1') { // Switch to activity tab
        logViewTab = 'activity';
        logScrollOffset = 0;
        render();
        return;
      }
      if (key === '2') { // Switch to server tab
        logViewTab = 'server';
        logScrollOffset = 0;
        render();
        return;
      }
      // Get current log data for scroll bounds
      const currentLogData = logViewTab === 'server' ? serverLogBuffer : activityLog;
      const maxScroll = Math.max(0, currentLogData.length - 10);
      if (key === '\u001b[A' || key === 'k') { // Up - scroll
        logScrollOffset = Math.min(logScrollOffset + 1, maxScroll);
        render();
        return;
      }
      if (key === '\u001b[B' || key === 'j') { // Down - scroll
        logScrollOffset = Math.max(0, logScrollOffset - 1);
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

    // Dismiss flash on any key
    if (flashMessage) {
      hideFlash();
      if (key !== '\u001b[A' && key !== '\u001b[B' && key !== '\r' && key !== 'q') {
        return;
      }
    }

    // Dismiss error toast on any key
    if (errorToast) {
      hideErrorToast();
      if (key !== '\u001b[A' && key !== '\u001b[B' && key !== '\r' && key !== 'q') {
        return;
      }
    }

    const displayBranches = filteredBranches !== null ? filteredBranches : branches;

    switch (key) {
      case '\u001b[A': // Up arrow
      case 'k':
        if (selectedIndex > 0) {
          selectedIndex--;
          selectedBranchName = displayBranches[selectedIndex] ? displayBranches[selectedIndex].name : null;
          render();
        }
        break;

      case '\u001b[B': // Down arrow
      case 'j':
        if (selectedIndex < displayBranches.length - 1) {
          selectedIndex++;
          selectedBranchName = displayBranches[selectedIndex] ? displayBranches[selectedIndex].name : null;
          render();
        }
        break;

      case '\r': // Enter
      case '\n':
        if (displayBranches.length > 0 && selectedIndex < displayBranches.length) {
          const branch = displayBranches[selectedIndex];
          if (branch.isDeleted) {
            addLog(`Cannot switch to deleted branch: ${branch.name}`, 'error');
            render();
          } else if (branch.name !== currentBranch) {
            // Clear search when switching
            searchQuery = '';
            filteredBranches = null;
            searchMode = false;
            await switchToBranch(branch.name);
            await pollGitChanges();
          }
        }
        break;

      case 'v': // Preview pane
        if (displayBranches.length > 0 && selectedIndex < displayBranches.length) {
          const branch = displayBranches[selectedIndex];
          addLog(`Loading preview for ${branch.name}...`, 'info');
          render();
          previewData = await getPreviewData(branch.name);
          previewMode = true;
          render();
        }
        break;

      case '/': // Search mode
        searchMode = true;
        searchQuery = '';
        selectedIndex = 0;
        render();
        break;

      case 'h': // History
        historyMode = true;
        render();
        break;

      case 'i': // Server info
        infoMode = true;
        render();
        break;

      case 'u': // Undo last switch
        await undoLastSwitch();
        await pollGitChanges();
        break;

      case 'p':
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

      case 'l': // View server logs
        if (!NO_SERVER) {
          logViewMode = true;
          logScrollOffset = 0;
          render();
        }
        break;

      case 'f':
        addLog('Fetching all branches...', 'update');
        await pollGitChanges();
        // Refresh sparklines on manual fetch
        addLog('Refreshing activity sparklines...', 'info');
        lastSparklineUpdate = 0; // Force refresh
        await refreshAllSparklines();
        render();
        break;

      case 's':
        soundEnabled = !soundEnabled;
        addLog(`Sound notifications ${soundEnabled ? 'enabled' : 'disabled'}`, 'info');
        if (soundEnabled) playSound();
        render();
        break;

      case 'c': // Toggle casino mode
        casinoModeEnabled = casino.toggle();
        addLog(`Casino mode ${casinoModeEnabled ? '🎰 ENABLED' : 'disabled'}`, casinoModeEnabled ? 'success' : 'info');
        if (casinoModeEnabled) {
          // Add vibe coding commentary
          addLog(`Ever notice vibe coding is just variable reward timing? 🎲`, 'info');
          if (soundEnabled) {
            casinoSounds.playJackpot();
          }
        }
        render();
        break;

      // Number keys to set visible branch count
      case '1': case '2': case '3': case '4': case '5':
      case '6': case '7': case '8': case '9':
        visibleBranchCount = parseInt(key, 10);
        addLog(`Showing ${visibleBranchCount} branches`, 'info');
        render();
        break;

      case '0': // 0 = 10 branches
        visibleBranchCount = 10;
        addLog(`Showing ${visibleBranchCount} branches`, 'info');
        render();
        break;

      case '+':
      case '=': // = key (same key as + without shift)
        if (visibleBranchCount < getMaxBranchesForScreen()) {
          visibleBranchCount++;
          addLog(`Showing ${visibleBranchCount} branches`, 'info');
          render();
        }
        break;

      case '-':
      case '_': // _ key (same key as - with shift)
        if (visibleBranchCount > 1) {
          visibleBranchCount--;
          addLog(`Showing ${visibleBranchCount} branches`, 'info');
          render();
        }
        break;

      case 'q':
      case '\u0003': // Ctrl+C
        await shutdown();
        break;

      case '\u001b': // Escape - clear search if active, otherwise quit
        if (searchQuery || filteredBranches) {
          searchQuery = '';
          filteredBranches = null;
          render();
        } else {
          await shutdown();
        }
        break;
    }
  });
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
  if (pollIntervalId) clearInterval(pollIntervalId);

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

  console.log('\n✓ Git Watchtower stopped\n');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (err) => {
  write(ansi.showCursor);
  write(ansi.restoreScreen);
  restoreTerminalTitle();
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  console.error('Uncaught exception:', err);
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
  currentBranch = await getCurrentBranch();

  // Warn if in detached HEAD state
  if (isDetachedHead) {
    addLog(`Warning: In detached HEAD state`, 'warning');
  }
  branches = await getAllBranches();

  // Initialize previous states and known branches
  for (const branch of branches) {
    previousBranchStates.set(branch.name, branch.commit);
    knownBranchNames.add(branch.name);
  }

  // Find current branch in list and select it
  const currentIndex = branches.findIndex(b => b.name === currentBranch);
  if (currentIndex >= 0) {
    selectedIndex = currentIndex;
    selectedBranchName = currentBranch;
  } else if (branches.length > 0) {
    selectedBranchName = branches[0].name;
  }

  // Load sparklines in background
  refreshAllSparklines().catch(() => {});

  // Start server based on mode
  if (SERVER_MODE === 'none') {
    addLog(`Running in no-server mode (branch monitoring only)`, 'info');
    addLog(`Current branch: ${currentBranch}`, 'info');
    render();
  } else if (SERVER_MODE === 'command') {
    addLog(`Command mode: ${SERVER_COMMAND}`, 'info');
    addLog(`Current branch: ${currentBranch}`, 'info');
    render();
    // Start the user's dev server
    startServerProcess();
  } else {
    // Static mode
    server.listen(PORT, () => {
      addLog(`Server started on http://localhost:${PORT}`, 'success');
      addLog(`Serving ${STATIC_DIR.replace(PROJECT_ROOT, '.')}`, 'info');
      addLog(`Current branch: ${currentBranch}`, 'info');
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

  // Setup keyboard input
  setupKeyboardInput();

  // Handle terminal resize
  process.stdout.on('resize', () => {
    updateTerminalSize();
    render();
  });

  // Start polling with adaptive interval
  pollIntervalId = setInterval(pollGitChanges, adaptivePollInterval);

  // Initial render
  render();
}

start().catch(err => {
  write(ansi.showCursor);
  write(ansi.restoreScreen);
  restoreTerminalTitle();
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  console.error('Failed to start:', err);
  process.exit(1);
});
