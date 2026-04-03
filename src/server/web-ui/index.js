/**
 * Assembles the Git Watchtower web dashboard from its component parts.
 * Combines CSS, HTML, and JS into a single HTML document string.
 * @module server/web-ui
 */

const { getDashboardCss } = require('./css');
const { getDashboardHtml } = require('./html');
const { getDashboardJs } = require('./js');

/**
 * Generate the complete web dashboard HTML page.
 * @param {number} port - The web server port (accepted for API compatibility, currently unused)
 * @returns {string} Complete HTML document
 */
function getWebDashboardHtml(port) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Git Watchtower</title>
<style>
${getDashboardCss()}
</style>
</head>
<body>
${getDashboardHtml()}
<script>
${getDashboardJs()}
</script>
</body>
</html>`;
}

module.exports = { getWebDashboardHtml };
