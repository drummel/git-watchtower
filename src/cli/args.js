/**
 * CLI argument parsing
 * @module cli/args
 */

const { version: PACKAGE_VERSION } = require('../../package.json');

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
 * @property {boolean} web - Enable web dashboard mode
 * @property {number|null} webPort - Web dashboard port override
 * @property {boolean} force - Bypass the single-instance lock for this repo
 * @property {string[]} errors - Validation errors encountered during parsing
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
    // Web dashboard
    web: false,
    webPort: null,
    // Actions
    init: false,
    casino: false,
    force: false,
    // Parsing errors
    errors: [],
  };

  for (let i = 0; i < args.length; i++) {
    // Server settings
    if (args[i] === '--mode' || args[i] === '-m') {
      const mode = args[i + 1];
      if (['static', 'command', 'none'].includes(mode)) {
        result.mode = mode;
      } else {
        result.errors.push(`Invalid value for ${args[i]}: "${mode || ''}" (expected: static, command, none)`);
      }
      i++;
    } else if (args[i] === '--port' || args[i] === '-p') {
      const portValue = parseInt(args[i + 1], 10);
      if (!isNaN(portValue) && portValue > 0 && portValue < 65536) {
        result.port = portValue;
      } else {
        result.errors.push(`Invalid value for ${args[i]}: "${args[i + 1] || ''}" (expected: port number 1-65535)`);
      }
      i++;
    } else if (args[i] === '--no-server' || args[i] === '-n') {
      result.noServer = true;
    } else if (args[i] === '--static-dir') {
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        result.staticDir = args[i + 1];
      } else {
        result.errors.push(`Missing value for ${args[i]}`);
      }
      i++;
    } else if (args[i] === '--command' || args[i] === '-c') {
      if (args[i + 1] !== undefined) {
        result.command = args[i + 1];
      } else {
        result.errors.push(`Missing value for ${args[i]}`);
      }
      i++;
    } else if (args[i] === '--restart-on-switch') {
      result.restartOnSwitch = true;
    } else if (args[i] === '--no-restart-on-switch') {
      result.restartOnSwitch = false;
    }
    // Git settings
    else if (args[i] === '--remote' || args[i] === '-r') {
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        result.remote = args[i + 1];
      } else {
        result.errors.push(`Missing value for ${args[i]}`);
      }
      i++;
    } else if (args[i] === '--auto-pull') {
      result.autoPull = true;
    } else if (args[i] === '--no-auto-pull') {
      result.autoPull = false;
    } else if (args[i] === '--poll-interval') {
      const interval = parseInt(args[i + 1], 10);
      if (!isNaN(interval) && interval > 0) {
        result.pollInterval = interval;
      } else {
        result.errors.push(`Invalid value for ${args[i]}: "${args[i + 1] || ''}" (expected: positive integer in ms)`);
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
      } else {
        result.errors.push(`Invalid value for ${args[i]}: "${args[i + 1] || ''}" (expected: positive integer)`);
      }
      i++;
    } else if (args[i] === '--casino') {
      result.casino = true;
    }
    // Web dashboard
    else if (args[i] === '--web' || args[i] === '-w') {
      result.web = true;
    } else if (args[i] === '--web-port') {
      const webPortValue = parseInt(args[i + 1], 10);
      if (!isNaN(webPortValue) && webPortValue > 0 && webPortValue < 65536) {
        result.webPort = webPortValue;
      } else {
        result.errors.push(`Invalid value for ${args[i]}: "${args[i + 1] || ''}" (expected: port number 1-65535)`);
      }
      i++;
    }
    // Actions and info
    else if (args[i] === '--init') {
      result.init = true;
    } else if (args[i] === '--force') {
      result.force = true;
    } else if (args[i] === '--version' || args[i] === '-v') {
      if (options.onVersion) {
        options.onVersion(PACKAGE_VERSION);
      }
    } else if (args[i] === '--help' || args[i] === '-h') {
      if (options.onHelp) {
        options.onHelp(PACKAGE_VERSION);
      }
    }
    // Unknown flag
    else if (args[i].startsWith('-')) {
      result.errors.push(`Unknown option: ${args[i]}`);
    }
  }

  // Cross-validation: if both --port and --web-port are explicit on the
  // CLI, they must differ. The web dashboard's EADDRINUSE-retry loop
  // would silently bump the web port to the next free slot, hiding the
  // misconfiguration — and the user thinks they're hitting :4000 when
  // it's actually :4001. Surface the conflict at parse time instead.
  if (result.port !== null && result.webPort !== null && result.port === result.webPort) {
    result.errors.push(
      `--port and --web-port cannot share the same value (${result.port}). ` +
      `Pick a different value for one of them.`,
    );
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
  // Shallow clone with nested object spreading — the config is at most two
  // levels deep and all values are primitives, so this is equivalent to a deep
  // clone but avoids the JSON round-trip (which silently drops `undefined`,
  // functions, and throws on circular refs).
  const merged = {
    ...config,
    server: { ...config.server },
    web: { ...config.web },
  };

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

  // Web dashboard
  if (cliArgs.web) {
    merged.web = { ...merged.web, enabled: true };
  }
  if (cliArgs.webPort !== null) {
    merged.web = { ...merged.web, port: cliArgs.webPort };
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
  -m, --mode <mode>       Server mode: static, command, or none (default: none)
  -p, --port <port>       Server port (default: 3000)
  -n, --no-server         Shorthand for --mode none (default)
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

Web Dashboard:
  -w, --web               Launch web dashboard alongside TUI
  --web-port <port>       Web dashboard port (default: 4000)

General:
  --init                  Run the configuration wizard
  --force                 Allow starting even if another instance is running
                          against this repo (not recommended)
  -v, --version           Show version number
  -h, --help              Show this help message

Server Modes:
  none     Branch monitoring only (default)
  static   Serve static files with live reload
  command  Run your own dev server (Next.js, Vite, Nuxt, etc.)

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
  git-watchtower --web                             # TUI + web dashboard on :4000
  git-watchtower --web --web-port 8080              # Web dashboard on custom port
  git-watchtower --no-sound --poll-interval 10000
`;
}

module.exports = { parseArgs, applyCliArgsToConfig, getHelpText, PACKAGE_VERSION };
