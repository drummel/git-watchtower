/**
 * Gitignore pattern parsing and file filtering utilities
 * Used by the file watcher to ignore .git directory and .gitignore patterns
 */

const fs = require('fs');
const path = require('path');

/**
 * Convert a gitignore pattern to a RegExp
 * Supports basic gitignore syntax: *, **, ?, negation (!), directory markers (/)
 * @param {string} pattern - The gitignore pattern
 * @returns {RegExp|null} - The compiled regex or null if pattern is invalid/negation
 */
function gitignorePatternToRegex(pattern) {
  // Handle negation (we'll filter these out separately)
  if (pattern.startsWith('!')) {
    return null;
  }

  // Handle directory-only patterns (ending with /)
  const dirOnly = pattern.endsWith('/');
  if (dirOnly) {
    pattern = pattern.slice(0, -1);
  }

  // Handle patterns starting with / (anchored to root)
  const anchored = pattern.startsWith('/');
  if (anchored) {
    pattern = pattern.slice(1);
  }

  // Escape special regex characters except * and ?
  let regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    // Convert **/ to a placeholder (matches any path prefix including empty)
    .replace(/\*\*\//g, '{{GLOBSTAR_SLASH}}')
    // Convert ** to a placeholder (matches any path)
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    // Convert * to match anything except /
    .replace(/\*/g, '[^/]*')
    // Convert ? to match single character except /
    .replace(/\?/g, '[^/]')
    // Convert globstar placeholders back
    // {{GLOBSTAR_SLASH}} matches "any/path/" or empty string
    .replace(/\{\{GLOBSTAR_SLASH\}\}/g, '(.*\\/)?')
    // {{GLOBSTAR}} matches any path including slashes
    .replace(/\{\{GLOBSTAR\}\}/g, '.*');

  // Build the final regex
  if (anchored) {
    regexStr = '^' + regexStr;
  } else {
    // Match anywhere in path
    regexStr = '(^|/)' + regexStr;
  }

  if (dirOnly) {
    regexStr = regexStr + '(/|$)';
  } else {
    regexStr = regexStr + '($|/)';
  }

  try {
    return new RegExp(regexStr);
  } catch (e) {
    return null;
  }
}

/**
 * Parse a .gitignore file and return an array of compiled regex patterns
 * @param {string} gitignorePath - Path to the .gitignore file
 * @returns {RegExp[]} - Array of compiled regex patterns
 */
function parseGitignoreFile(gitignorePath) {
  const patterns = [];

  if (!fs.existsSync(gitignorePath)) {
    return patterns;
  }

  try {
    const content = fs.readFileSync(gitignorePath, 'utf8');
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const regex = gitignorePatternToRegex(trimmed);
      if (regex) {
        patterns.push(regex);
      }
    }
  } catch (err) {
    // Silently continue if we can't read .gitignore
  }

  return patterns;
}

/**
 * Load gitignore patterns from multiple possible locations
 * @param {string[]} searchPaths - Array of directories to search for .gitignore
 * @returns {RegExp[]} - Array of compiled regex patterns
 */
function loadGitignorePatterns(searchPaths) {
  for (const searchPath of searchPaths) {
    const gitignorePath = path.join(searchPath, '.gitignore');
    const patterns = parseGitignoreFile(gitignorePath);
    if (patterns.length > 0) {
      return patterns;
    }
  }
  return [];
}

/**
 * Check if a filename matches the .git directory
 * @param {string} filename - The filename to check
 * @returns {boolean} - True if the file is in the .git directory
 */
function isGitDirectory(filename) {
  if (filename === '.git' || filename.startsWith('.git/') || filename.startsWith('.git\\')) {
    return true;
  }

  // Normalize path separators for cross-platform support
  const normalizedPath = filename.replace(/\\/g, '/');

  // Check if path contains .git directory anywhere
  if (normalizedPath.includes('/.git/') || normalizedPath.includes('/.git')) {
    return true;
  }

  return false;
}

/**
 * Check if a file path should be ignored by the file watcher
 * @param {string} filename - The filename to check
 * @param {RegExp[]} ignorePatterns - Array of compiled gitignore patterns
 * @returns {boolean} - True if the file should be ignored
 */
function shouldIgnoreFile(filename, ignorePatterns = []) {
  // Always ignore .git directory
  if (isGitDirectory(filename)) {
    return true;
  }

  // Normalize path separators for cross-platform support
  const normalizedPath = filename.replace(/\\/g, '/');

  // Check against gitignore patterns
  for (const pattern of ignorePatterns) {
    if (pattern.test(normalizedPath)) {
      return true;
    }
  }

  return false;
}

module.exports = {
  gitignorePatternToRegex,
  parseGitignoreFile,
  loadGitignorePatterns,
  isGitDirectory,
  shouldIgnoreFile,
};
