/**
 * CLI argument parsing
 * @module cli/args
 */

const PACKAGE_VERSION = '1.2.0';

/**
 * @typedef {object} CliArgs
 * @property {string|null} mode - Server mode override
 * @property {boolean} noServer - Shorthand for --mode none
 * @property {number|null} port - Port override
 * @property {string|null} staticDir - Static directory override
 * @property {string|null} command - Server command override
 * @property {boolean|null} restartOnSwitch - Restart on branch switch
 * @property {string|null} remote - Git remote name override
 * @property {boolean|null} autoPull - Auto-pull override
 * @property {number|null} pollInterval - Poll interval override in ms
 * @property {boolean|null} sound - Sound override
 * @property {number|null} visibleBranches - Visible branches override
 * @property {boolean} init - Run configuration wizard
 * @property {boolean} casino - Enable casino mode
 */

/**
 * Parse CLI arguments into a structured object.
 * @param {string[]} argv - Arguments array (typically process.argv.slice(2))
 * @param {object} [options]
 * @param {function} [options.onVersion] - Called when --version is encountered
 * @param {function} [options.onHelp] - Called when --help is encountered
 * @returns {CliArgs}
 */
function parseArgs(argv, options = {}) {
  const args = argv || [];
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
    casino: false,
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
    } else if (args[i] === '--casino') {
      result.casino = true;
    }
    // Actions and info
    else if (args[i] === '--init') {
      result.init = true;
    } else if (args[i] === '--version' || args[i] === '-v') {
      if (options.onVersion) {
        options.onVersion(PACKAGE_VERSION);
      }
    } else if (args[i] === '--help' || args[i] === '-h') {
      if (options.onHelp) {
        options.onHelp(PACKAGE_VERSION);
      }
    }
  }
  return result;
}

/**
 * Apply CLI args on top of a config object. CLI takes precedence.
 * @param {object} config - Base configuration
 * @param {CliArgs} cliArgs - Parsed CLI args
 * @returns {object} Merged config
 */
function applyCliArgsToConfig(config, cliArgs) {
  const merged = JSON.parse(JSON.stringify(config)); // deep clone

  // Server settings
  if (cliArgs.mode !== null) {
    merged.server.mode = cliArgs.mode;
  }
  if (cliArgs.noServer) {
    merged.server.mode = 'none';
  }
  if (cliArgs.port !== null) {
    merged.server.port = cliArgs.port;
  }
  if (cliArgs.staticDir !== null) {
    merged.server.staticDir = cliArgs.staticDir;
  }
  if (cliArgs.command !== null) {
    merged.server.command = cliArgs.command;
  }
  if (cliArgs.restartOnSwitch !== null) {
    merged.server.restartOnSwitch = cliArgs.restartOnSwitch;
  }

  // Git settings
  if (cliArgs.remote !== null) {
    merged.remoteName = cliArgs.remote;
  }
  if (cliArgs.autoPull !== null) {
    merged.autoPull = cliArgs.autoPull;
  }
  if (cliArgs.pollInterval !== null) {
    merged.gitPollInterval = cliArgs.pollInterval;
  }

  // UI settings
  if (cliArgs.sound !== null) {
    merged.soundEnabled = cliArgs.sound;
  }
  if (cliArgs.visibleBranches !== null) {
    merged.visibleBranches = cliArgs.visibleBranches;
  }
  if (cliArgs.casino) {
    merged.casinoMode = true;
  }

  return merged;
}

/**
 * Get the help text for the CLI.
 * @param {string} version
 * @returns {string}
 */
function getHelpText(version) {
  return `
Git Watchtower v${version} - Branch Monitor & Dev Server

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
  --casino                Enable casino mode

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
`;
}

module.exports = { parseArgs, applyCliArgsToConfig, getHelpText, PACKAGE_VERSION };
