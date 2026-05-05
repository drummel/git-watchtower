/**
 * Git remote URL parsing and branch URL building
 * @module git/remote
 */

// Branch-URL building lives in the pure module so it can be inlined into
// the web dashboard bundle. We re-export it here so existing Node callers
// keep working without an extra hop.
const { buildBranchUrl } = require('../server/web-ui/pure');

/**
 * Parse a git remote URL into { host, path } components.
 * Supports SSH (git@host:path), HTTPS, and ssh:// protocol formats.
 * @param {string} remoteUrl - The raw remote URL from git
 * @returns {{ host: string, path: string } | null}
 */
function parseRemoteUrl(remoteUrl) {
  const url = (remoteUrl || '').trim();

  // SSH format: git@host:user/repo.git
  const sshMatch = url.match(/^[\w-]+@([^:]+):(.+?)(?:\.git)?$/);
  if (sshMatch) return { host: sshMatch[1], path: sshMatch[2] };

  // HTTPS/HTTP format: https://host/path.git
  const httpMatch = url.match(/^https?:\/\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (httpMatch) return { host: httpMatch[1], path: httpMatch[2] };

  // ssh:// format: ssh://git@host/user/repo.git or ssh://git@host:port/user/repo.git
  const sshProtoMatch = url.match(/^ssh:\/\/[\w-]+@([^/:]+)(?::\d+)?\/(.+?)(?:\.git)?$/);
  if (sshProtoMatch) return { host: sshProtoMatch[1], path: sshProtoMatch[2] };

  return null;
}

/**
 * Detect the git hosting platform from a web URL.
 * @param {string|null} webUrl - Web URL of the repository
 * @returns {string|null} Platform name: 'github' | 'gitlab' | 'bitbucket' | 'azure' | null
 */
function detectPlatform(webUrl) {
  if (!webUrl) return null;
  try {
    const host = new URL(webUrl).hostname.toLowerCase();
    const parts = host.split('.');
    if (host === 'github.com' || parts.includes('github')) return 'github';
    if (host === 'gitlab.com' || parts.includes('gitlab')) return 'gitlab';
    if (host === 'bitbucket.org' || parts.includes('bitbucket')) return 'bitbucket';
    if (host === 'dev.azure.com' || host.endsWith('.visualstudio.com')) return 'azure';
  } catch (e) { /* webUrl isn't a valid URL — fall through to the self-hosted default */ }
  return 'github'; // default assumption for self-hosted
}

/**
 * Build a web URL for a repository from a parsed remote.
 * Handles Azure DevOps SSH special case.
 * @param {{ host: string, path: string }} parsed - Parsed remote URL
 * @param {string|null} branchName - Optional branch name
 * @returns {string|null}
 */
function buildWebUrl(parsed, branchName) {
  if (!parsed) return null;

  let baseUrl;

  // Azure DevOps SSH uses org@ssh.dev.azure.com:v3/org/project/repo
  if (parsed.host === 'ssh.dev.azure.com') {
    const parts = parsed.path.replace(/^v3\//, '').split('/');
    if (parts.length >= 3) {
      baseUrl = `https://dev.azure.com/${parts[0]}/${parts[1]}/_git/${parts.slice(2).join('/')}`;
      if (branchName) return buildBranchUrl(baseUrl, 'dev.azure.com', branchName);
      return baseUrl;
    }
    return null;
  }

  baseUrl = `https://${parsed.host}/${parsed.path}`;
  if (branchName) return buildBranchUrl(baseUrl, parsed.host, branchName);
  return baseUrl;
}

/**
 * Extract a Claude Code session URL from a commit message body.
 * @param {string} commitBody - Full commit message body
 * @returns {string|null} Session URL or null
 */
function extractSessionUrl(commitBody) {
  const match = (commitBody || '').match(/https:\/\/claude\.ai\/code\/session_[\w]+/);
  return match ? match[0] : null;
}

module.exports = {
  parseRemoteUrl,
  buildBranchUrl,
  detectPlatform,
  buildWebUrl,
  extractSessionUrl,
};
