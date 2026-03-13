/**
 * Telemetry public API
 *
 * Usage:
 *   const telemetry = require('../src/telemetry');
 *   await telemetry.promptIfNeeded(promptYesNoFn);
 *   telemetry.init({ version: '1.6.1' });
 *   telemetry.capture('tool_launched', { os: 'linux' });
 *   await telemetry.shutdown();
 */

const analytics = require('./analytics');
const config = require('./config');

/**
 * Show opt-in telemetry prompt if the user hasn't been asked yet.
 *
 * Skips the prompt when:
 * - Already prompted (config file exists)
 * - Env var forces telemetry off
 * - No TTY (non-interactive / CI)
 *
 * @param {(question: string, defaultValue?: boolean) => Promise<boolean>} promptYesNo
 */
async function promptIfNeeded(promptYesNo) {
  // Already prompted — respect existing choice
  if (config.hasBeenPrompted()) {
    return;
  }

  // Env var forces off — no point asking
  if (config.isEnvDisabled()) {
    return;
  }

  // Non-interactive — default to disabled
  if (!process.stdin.isTTY) {
    return;
  }

  console.log('');
  console.log('\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510');
  console.log('\u2502  Help improve Git Watchtower                            \u2502');
  console.log('\u251c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524');
  console.log('\u2502  We\'d love to collect anonymous usage data to improve    \u2502');
  console.log('\u2502  Git Watchtower. This telemetry is used to improve the  \u2502');
  console.log('\u2502  product. It includes:                                  \u2502');
  console.log('\u2502    - Which features are used (not your code or data)    \u2502');
  console.log('\u2502    - Error types encountered (not stack traces)         \u2502');
  console.log('\u2502    - Session duration and OS/Node.js version            \u2502');
  console.log('\u2502                                                         \u2502');
  console.log('\u2502  No personal information, file contents, branch names,  \u2502');
  console.log('\u2502  or repository data is ever collected.                  \u2502');
  console.log('\u2502                                                         \u2502');
  console.log('\u2502  You can change this anytime by editing:                \u2502');
  console.log('\u2502    ~/.git-watchtower/config.json                        \u2502');
  console.log('\u2502  Or set GIT_WATCHTOWER_TELEMETRY=false                  \u2502');
  console.log('\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518');
  console.log('');

  const distinctId = config.getOrCreateDistinctId();

  // Fire analytics_prompt_shown event — always sent regardless of user's choice
  analytics.captureAlways('analytics_prompt_shown', {}, distinctId);

  const answer = await promptYesNo('Enable anonymous telemetry to help improve Git Watchtower?', false);

  // Fire analytics_decision event — always sent so we know opt-in/out rates
  analytics.captureAlways('analytics_decision', { opted_in: answer }, distinctId);

  config.saveTelemetryConfig({
    telemetryEnabled: answer,
    distinctId,
    promptedAt: new Date().toISOString(),
  });

  if (answer) {
    console.log('  Thank you! Telemetry enabled.\n');
  } else {
    console.log('  No problem! Telemetry disabled.\n');
  }
}

module.exports = {
  // Analytics
  init: analytics.init,
  capture: analytics.capture,
  captureError: analytics.captureError,
  captureAlways: analytics.captureAlways,
  shutdown: analytics.shutdown,
  isEnabled: analytics.isEnabled,

  // Prompt
  promptIfNeeded,

  // Config (for advanced use)
  isTelemetryEnabled: config.isTelemetryEnabled,
  hasBeenPrompted: config.hasBeenPrompted,
  loadTelemetryConfig: config.loadTelemetryConfig,
  saveTelemetryConfig: config.saveTelemetryConfig,
};
