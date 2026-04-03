/**
 * Embedded HTML/CSS/JS for the Git Watchtower web dashboard.
 * Returns a complete HTML page as a string — no external dependencies.
 *
 * Implementation split into sub-modules for maintainability:
 *   - ./web-ui/css.js  — dashboard styles
 *   - ./web-ui/html.js — body markup & modal templates
 *   - ./web-ui/js.js   — client-side behaviour
 *   - ./web-ui/index.js — assembles the above into a full HTML page
 *
 * @module server/web-ui
 */

module.exports = require('./web-ui/index');
