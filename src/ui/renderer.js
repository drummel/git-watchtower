/**
 * Extracted rendering functions for Git Watchtower terminal UI.
 *
 * Each function takes a `state` object (plain data, no globals) and a `write`
 * function (e.g. process.stdout.write bound to stdout).  This makes the
 * renderers pure-ish: they only read from `state` and only produce output
 * through `write`, which simplifies testing and decouples them from the
 * main process module.
 *
 * @module ui/renderer
 */

const {
  ansi,
  box,
  truncate,
  padRight,
  padLeft,
  drawBox,
  clearArea,
  visibleLength,
  stripAnsi,
} = require('../ui/ansi');
const { formatTimeAgo } = require('../utils/time');
const { isBaseBranch } = require('../git/pr');

// ---------------------------------------------------------------------------
// renderHeader
// ---------------------------------------------------------------------------

/**
 * Render the top header bar.
 *
 * @param {object} state
 * @param {function} write
 */
function renderHeader(state, write) {
  const width = state.terminalWidth;
  const headerRow = state.casinoModeEnabled ? 2 : 1;

  let statusIcon = { idle: ansi.green + '\u25CF', fetching: ansi.yellow + '\u27F3', error: ansi.red + '\u25CF' }[state.pollingStatus];
  if (state.isOffline) statusIcon = ansi.red + '\u2298';

  const soundIcon = state.soundEnabled ? ansi.green + '\uD83D\uDD14' : ansi.gray + '\uD83D\uDD15';

  write(ansi.moveTo(headerRow, 1));
  write(ansi.bgBlue + ansi.white + ansi.bold);

  const leftContent = ` \uD83C\uDFF0 Git Watchtower ${ansi.dim}\u2502${ansi.bold} ${state.projectName}`;
  const leftVisibleLen = 21 + state.projectName.length;
  write(leftContent);

  let badges = '';
  let badgesVisibleLen = 0;

  if (state.serverMode === 'command' && state.serverCrashed) {
    const label = ' CRASHED ';
    badges += ' ' + ansi.bgRed + ansi.white + label + ansi.bgBlue + ansi.white;
    badgesVisibleLen += 1 + label.length;
  }
  if (state.isOffline) {
    const label = ' OFFLINE ';
    badges += ' ' + ansi.bgRed + ansi.white + label + ansi.bgBlue + ansi.white;
    badgesVisibleLen += 1 + label.length;
  }
  if (state.isDetachedHead) {
    const label = ' DETACHED HEAD ';
    badges += ' ' + ansi.bgYellow + ansi.black + label + ansi.bgBlue + ansi.white;
    badgesVisibleLen += 1 + label.length;
  }
  if (state.hasMergeConflict) {
    const label = ' MERGE CONFLICT ';
    badges += ' ' + ansi.bgRed + ansi.white + label + ansi.bgBlue + ansi.white;
    badgesVisibleLen += 1 + label.length;
  }
  write(badges);

  let modeLabel = '';
  let modeBadge = '';
  if (state.serverMode === 'static') {
    modeLabel = ' STATIC ';
    modeBadge = ansi.bgCyan + ansi.black + modeLabel + ansi.bgBlue + ansi.white;
  } else if (state.serverMode === 'command') {
    modeLabel = ' COMMAND ';
    modeBadge = ansi.bgGreen + ansi.black + modeLabel + ansi.bgBlue + ansi.white;
  } else {
    modeLabel = ' MONITOR ';
    modeBadge = ansi.bgMagenta + ansi.white + modeLabel + ansi.bgBlue + ansi.white;
  }

  let serverInfo = '';
  let serverInfoVisible = '';
  if (state.serverMode === 'none') {
    serverInfoVisible = '';
  } else {
    const statusDot = state.serverRunning
      ? ansi.green + '\u25CF'
      : (state.serverCrashed ? ansi.red + '\u25CF' : ansi.gray + '\u25CB');
    serverInfoVisible = `localhost:${state.port} `;
    serverInfo = statusDot + ansi.white + ` localhost:${state.port} `;
  }

  const rightContent = `${modeBadge} ${serverInfo}${statusIcon}${ansi.bgBlue} ${soundIcon}${ansi.bgBlue} `;
  const rightVisibleLen = modeLabel.length + 1 + serverInfoVisible.length + 5;

  const usedSpace = leftVisibleLen + badgesVisibleLen + rightVisibleLen;
  const padding = Math.max(1, width - usedSpace);
  write(' '.repeat(padding));
  write(rightContent);
  write(ansi.reset);
}

// ---------------------------------------------------------------------------
// renderBranchList
// ---------------------------------------------------------------------------

/**
 * Render the branch list box.  Returns the row number at the bottom of the
 * box so that subsequent sections know where to start.
 *
 * @param {object} state
 * @param {function} write
 * @returns {number} The row immediately after the branch list box.
 */
function renderBranchList(state, write) {
  const startRow = state.casinoModeEnabled ? 4 : 3;
  const boxWidth = state.terminalWidth;
  const contentWidth = boxWidth - 4;
  const height = Math.min(state.visibleBranchCount * 2 + 4, Math.floor(state.terminalHeight * 0.5));

  const displayBranches = state.filteredBranches !== null ? state.filteredBranches : state.branches;
  const boxTitle = state.searchMode
    ? `BRANCHES (/${state.searchQuery}_)`
    : 'ACTIVE BRANCHES';

  write(drawBox(startRow, 1, boxWidth, height, boxTitle, ansi.cyan));

  // Clear content area
  for (let i = 1; i < height - 1; i++) {
    write(ansi.moveTo(startRow + i, 2));
    write(' '.repeat(contentWidth + 2));
  }

  // Header line
  write(ansi.moveTo(startRow + 1, 2));
  write(ansi.gray + '\u2500'.repeat(contentWidth + 2) + ansi.reset);

  if (displayBranches.length === 0) {
    write(ansi.moveTo(startRow + 3, 4));
    if (state.searchMode && state.searchQuery) {
      write(ansi.gray + `No branches matching "${state.searchQuery}"` + ansi.reset);
    } else {
      write(ansi.gray + "No branches found. Press 'f' to fetch." + ansi.reset);
    }
    return startRow + height;
  }

  let row = startRow + 2;
  for (let i = 0; i < displayBranches.length && i < state.visibleBranchCount; i++) {
    const branch = displayBranches[i];
    const isSelected = i === state.selectedIndex;
    const isCurrent = branch.name === state.currentBranch;
    const timeAgo = formatTimeAgo(branch.date);
    const sparkline = state.sparklineCache.get(branch.name) || '       ';
    const prStatus = state.branchPrStatusMap.get(branch.name);
    const isBranchBase = isBaseBranch(branch.name);
    const isMerged = !isBranchBase && prStatus && prStatus.state === 'MERGED';
    const hasOpenPr = prStatus && prStatus.state === 'OPEN';

    write(ansi.moveTo(row, 2));
    const cursor = isSelected ? ' \u25B6 ' : '   ';
    const maxNameLen = contentWidth - 38;
    const displayName = truncate(branch.name, maxNameLen);
    const namePadding = Math.max(1, maxNameLen - displayName.length + 2);

    if (isSelected) write(ansi.inverse);
    write(cursor);

    if (branch.isDeleted) {
      write(ansi.gray + ansi.dim + displayName + ansi.reset);
      if (isSelected) write(ansi.inverse);
    } else if (isMerged && !isCurrent) {
      write(ansi.dim + ansi.fg256(103) + displayName + ansi.reset);
      if (isSelected) write(ansi.inverse);
    } else if (isCurrent) {
      write(ansi.green + ansi.bold + displayName + ansi.reset);
      if (isSelected) write(ansi.inverse);
    } else if (branch.justUpdated) {
      write(ansi.yellow + displayName + ansi.reset);
      if (isSelected) write(ansi.inverse);
    } else {
      write(displayName);
    }

    write(' '.repeat(namePadding));

    // Sparkline
    if (isSelected) write(ansi.reset);
    if (isMerged && !isCurrent) {
      write(ansi.dim + ansi.fg256(60) + sparkline + ansi.reset);
    } else {
      write(ansi.fg256(39) + sparkline + ansi.reset);
    }
    if (isSelected) write(ansi.inverse);

    // PR status dot
    if (isSelected) write(ansi.reset);
    if (isMerged) {
      write(ansi.dim + ansi.magenta + '\u25CF' + ansi.reset);
    } else if (hasOpenPr) {
      write(ansi.brightGreen + '\u25CF' + ansi.reset);
    } else {
      write(' ');
    }
    if (isSelected) write(ansi.inverse);

    // Status badge
    if (branch.isDeleted) {
      if (isSelected) write(ansi.reset);
      write(ansi.red + ansi.dim + '\u2717 DELETED' + ansi.reset);
      if (isSelected) write(ansi.inverse);
    } else if (isMerged && !isCurrent && !branch.isNew && !branch.hasUpdates) {
      if (isSelected) write(ansi.reset);
      write(ansi.dim + ansi.magenta + '\u2713 MERGED ' + ansi.reset);
      if (isSelected) write(ansi.inverse);
    } else if (isCurrent) {
      if (isSelected) write(ansi.reset);
      write(ansi.green + '\u2605 CURRENT' + ansi.reset);
      if (isSelected) write(ansi.inverse);
    } else if (branch.isNew) {
      if (isSelected) write(ansi.reset);
      write(ansi.magenta + '\u2726 NEW    ' + ansi.reset);
      if (isSelected) write(ansi.inverse);
    } else if (branch.hasUpdates) {
      if (isSelected) write(ansi.reset);
      write(ansi.yellow + '\u2193 UPDATES' + ansi.reset);
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
    if (isMerged && !isCurrent) {
      write(ansi.dim + '      \u2514\u2500 ' + ansi.reset);
      write(ansi.dim + ansi.cyan + (branch.commit || '???????') + ansi.reset);
      write(ansi.dim + ' \u2022 ' + ansi.reset);
      const prTag = ansi.dim + ansi.magenta + '#' + prStatus.number + ansi.reset + ansi.dim + ' ';
      write(prTag + ansi.gray + ansi.dim + truncate(branch.subject || 'No commit message', contentWidth - 28) + ansi.reset);
    } else {
      write('      \u2514\u2500 ');
      write(ansi.cyan + (branch.commit || '???????') + ansi.reset);
      write(' \u2022 ');
      if (hasOpenPr) {
        const prTag = ansi.brightGreen + '#' + prStatus.number + ansi.reset + ' ';
        write(prTag + ansi.gray + truncate(branch.subject || 'No commit message', contentWidth - 28) + ansi.reset);
      } else {
        write(ansi.gray + truncate(branch.subject || 'No commit message', contentWidth - 22) + ansi.reset);
      }
    }

    row++;
  }

  return startRow + height;
}

// ---------------------------------------------------------------------------
// renderActivityLog
// ---------------------------------------------------------------------------

/**
 * Render the activity log box below the branch list.
 *
 * @param {object} state
 * @param {function} write
 * @param {number} startRow - Row where the box should begin.
 * @returns {number} The row immediately after the activity log box.
 */
function renderActivityLog(state, write, startRow) {
  const boxWidth = state.terminalWidth;
  const contentWidth = boxWidth - 4;
  const height = Math.min(state.maxLogEntries + 3, state.terminalHeight - startRow - 4);

  write(drawBox(startRow, 1, boxWidth, height, 'ACTIVITY LOG', ansi.gray));

  for (let i = 1; i < height - 1; i++) {
    write(ansi.moveTo(startRow + i, 2));
    write(' '.repeat(contentWidth + 2));
  }

  let row = startRow + 1;
  for (let i = 0; i < state.activityLog.length && i < height - 2; i++) {
    const entry = state.activityLog[i];
    write(ansi.moveTo(row, 3));
    write(ansi.gray + `[${entry.timestamp}]` + ansi.reset + ' ');
    write(ansi[entry.color] + entry.icon + ansi.reset + ' ');
    write(truncate(entry.message, contentWidth - 16));
    row++;
  }

  if (state.activityLog.length === 0) {
    write(ansi.moveTo(startRow + 1, 3));
    write(ansi.gray + 'No activity yet...' + ansi.reset);
  }

  return startRow + height;
}

// ---------------------------------------------------------------------------
// renderCasinoStats (stub)
// ---------------------------------------------------------------------------

/**
 * Placeholder for casino stats rendering.  The actual casino rendering
 * depends on the casino module and stays in bin/ for now.
 *
 * @param {object} state
 * @param {function} write
 * @param {number} startRow
 * @returns {number} The unchanged startRow (no-op).
 */
function renderCasinoStats(state, write, startRow) {
  if (!state.casinoModeEnabled) return startRow;
  // Delegates to casino module; actual rendering stays in bin/
  return startRow;
}

// ---------------------------------------------------------------------------
// renderFooter
// ---------------------------------------------------------------------------

/**
 * Render the bottom footer/key-binding bar.
 *
 * @param {object} state
 * @param {function} write
 */
function renderFooter(state, write) {
  const row = state.terminalHeight - 1;
  write(ansi.moveTo(row, 1));
  write(ansi.bgBlack + ansi.white);
  write('  ');
  write(ansi.gray + '[\u2191\u2193]' + ansi.reset + ansi.bgBlack + ' Nav  ');
  write(ansi.gray + '[/]' + ansi.reset + ansi.bgBlack + ' Search  ');
  write(ansi.gray + '[v]' + ansi.reset + ansi.bgBlack + ' Preview  ');
  write(ansi.gray + '[Enter]' + ansi.reset + ansi.bgBlack + ' Switch  ');
  write(ansi.gray + '[h]' + ansi.reset + ansi.bgBlack + ' History  ');
  write(ansi.gray + '[i]' + ansi.reset + ansi.bgBlack + ' Info  ');
  write(ansi.gray + '[b]' + ansi.reset + ansi.bgBlack + ' Actions  ');

  if (!state.noServer) {
    write(ansi.gray + '[l]' + ansi.reset + ansi.bgBlack + ' Logs  ');
    write(ansi.gray + '[o]' + ansi.reset + ansi.bgBlack + ' Open  ');
  }
  if (state.serverMode === 'static') {
    write(ansi.gray + '[r]' + ansi.reset + ansi.bgBlack + ' Reload  ');
  } else if (state.serverMode === 'command') {
    write(ansi.gray + '[R]' + ansi.reset + ansi.bgBlack + ' Restart  ');
  }

  write(ansi.gray + '[\u00B1]' + ansi.reset + ansi.bgBlack + ' List:' + ansi.cyan + state.visibleBranchCount + ansi.reset + ansi.bgBlack + '  ');

  if (state.casinoModeEnabled) {
    write(ansi.brightMagenta + '[c]' + ansi.reset + ansi.bgBlack + ' \uD83C\uDFB0  ');
  } else {
    write(ansi.gray + '[c]' + ansi.reset + ansi.bgBlack + ' Casino  ');
  }

  write(ansi.gray + '[q]' + ansi.reset + ansi.bgBlack + ' Quit  ');
  write(ansi.reset);
}

// ---------------------------------------------------------------------------
// renderFlash
// ---------------------------------------------------------------------------

/**
 * Render a centered flash notification overlay (e.g. "NEW UPDATE").
 *
 * @param {object} state
 * @param {function} write
 */
function renderFlash(state, write) {
  if (!state.flashMessage) return;

  const width = 50;
  const height = 5;
  const col = Math.floor((state.terminalWidth - width) / 2);
  const row = Math.floor((state.terminalHeight - height) / 2);

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
  write(ansi.yellow + ansi.bold + '\u26A1 NEW UPDATE \u26A1' + ansi.reset);

  write(ansi.moveTo(row + 2, col + 2));
  const truncMsg = truncate(state.flashMessage, width - 4);
  write(ansi.white + truncMsg + ansi.reset);

  write(ansi.moveTo(row + 3, col + Math.floor((width - 22) / 2)));
  write(ansi.gray + 'Press any key to dismiss' + ansi.reset);
}

// ---------------------------------------------------------------------------
// renderErrorToast
// ---------------------------------------------------------------------------

/**
 * Render a centered error toast overlay.
 *
 * @param {object} state
 * @param {function} write
 */
function renderErrorToast(state, write) {
  if (!state.errorToast) return;

  const width = Math.min(60, state.terminalWidth - 4);
  const col = Math.floor((state.terminalWidth - width) / 2);
  const row = 2; // Near the top, below header

  // Calculate height based on content
  const lines = [];
  lines.push(state.errorToast.title || 'Git Error');
  lines.push('');

  // Word wrap the message
  const msgWords = state.errorToast.message.split(' ');
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

  if (state.errorToast.hint) {
    lines.push('');
    lines.push(state.errorToast.hint);
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
      const lPadding = Math.floor((width - 4 - line.length) / 2);
      write(ansi.reset + ansi.bgRed + ansi.gray + ' '.repeat(lPadding) + line + ' '.repeat(width - 4 - lPadding - line.length));
    } else if (state.errorToast.hint && line === state.errorToast.hint) {
      // Hint line - yellow on red
      const lPadding = Math.floor((width - 4 - line.length) / 2);
      write(ansi.reset + ansi.bgRed + ansi.yellow + ' '.repeat(lPadding) + line + ' '.repeat(width - 4 - lPadding - line.length));
    } else {
      // Regular content
      write(padRight(line, width - 4));
    }
    write(ansi.reset);
    contentRow++;
  }
}

// ---------------------------------------------------------------------------
// renderPreview
// ---------------------------------------------------------------------------

/**
 * Render the branch preview overlay showing recent commits and changed files.
 *
 * @param {object} state
 * @param {function} write
 */
function renderPreview(state, write) {
  if (!state.previewMode || !state.previewData) return;

  const width = Math.min(60, state.terminalWidth - 4);
  const height = 16;
  const col = Math.floor((state.terminalWidth - width) / 2);
  const row = Math.floor((state.terminalHeight - height) / 2);

  const displayBranches = state.filteredBranches !== null ? state.filteredBranches : state.branches;
  const branch = displayBranches[state.selectedIndex];
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
  if (state.previewData.commits.length === 0) {
    write(ansi.moveTo(contentRow, col + 3));
    write(ansi.gray + '(no commits)' + ansi.reset);
    contentRow++;
  } else {
    for (const commit of state.previewData.commits.slice(0, 5)) {
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

  if (state.previewData.filesChanged.length === 0) {
    write(ansi.moveTo(contentRow, col + 3));
    write(ansi.gray + '(no changes or same as current)' + ansi.reset);
  } else {
    for (const file of state.previewData.filesChanged.slice(0, 5)) {
      write(ansi.moveTo(contentRow, col + 3));
      write(ansi.green + '\u2022 ' + ansi.reset + truncate(file, width - 8));
      contentRow++;
    }
    if (state.previewData.filesChanged.length > 5) {
      write(ansi.moveTo(contentRow, col + 3));
      write(ansi.gray + `... and ${state.previewData.filesChanged.length - 5} more` + ansi.reset);
    }
  }

  // Instructions
  write(ansi.moveTo(row + height - 2, col + Math.floor((width - 26) / 2)));
  write(ansi.gray + 'Press [v] or [Esc] to close' + ansi.reset);
}

// ---------------------------------------------------------------------------
// renderHistory
// ---------------------------------------------------------------------------

/**
 * Render the branch-switch history overlay.
 *
 * @param {object} state
 * @param {function} write
 */
function renderHistory(state, write) {
  const width = Math.min(50, state.terminalWidth - 4);
  const height = Math.min(state.switchHistory.length + 5, 15);
  const col = Math.floor((state.terminalWidth - width) / 2);
  const row = Math.floor((state.terminalHeight - height) / 2);

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
  if (state.switchHistory.length === 0) {
    write(ansi.moveTo(row + 2, col + 3));
    write(ansi.gray + 'No branch switches yet' + ansi.reset);
  } else {
    let contentRow = row + 2;
    for (let i = 0; i < Math.min(state.switchHistory.length, height - 4); i++) {
      const entry = state.switchHistory[i];
      write(ansi.moveTo(contentRow, col + 3));
      if (i === 0) {
        write(ansi.yellow + '\u2192 ' + ansi.reset); // Most recent
      } else {
        write(ansi.gray + '  ' + ansi.reset);
      }
      write(truncate(entry.from, 15) + ansi.gray + ' \u2192 ' + ansi.reset);
      write(ansi.cyan + truncate(entry.to, 15) + ansi.reset);
      contentRow++;
    }
  }

  // Instructions
  write(ansi.moveTo(row + height - 2, col + 2));
  write(ansi.gray + '[u] Undo last  [h]/[Esc] Close' + ansi.reset);
}

// ---------------------------------------------------------------------------
// renderLogView
// ---------------------------------------------------------------------------

/**
 * Render the full-screen log viewer overlay with activity/server tabs.
 *
 * NOTE: The original bin/ version mutates `logScrollOffset` in place to
 * clamp it.  Since we receive state as a plain object the caller is
 * responsible for clamping before calling this function, or the caller
 * can read back the clamped value from the returned object if we decide
 * to return one in the future.  For now we treat `logScrollOffset` as
 * already clamped.
 *
 * @param {object} state
 * @param {function} write
 */
function renderLogView(state, write) {
  if (!state.logViewMode) return;

  const width = Math.min(state.terminalWidth - 4, 100);
  const height = Math.min(state.terminalHeight - 4, 30);
  const col = Math.floor((state.terminalWidth - width) / 2);
  const row = Math.floor((state.terminalHeight - height) / 2);

  // Determine which log to display
  const isServerTab = state.logViewTab === 'server';
  const logData = isServerTab ? state.serverLogBuffer : state.activityLog;

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
  const activityTab = state.logViewTab === 'activity'
    ? ansi.bgWhite + ansi.black + ' 1:Activity ' + ansi.reset + ansi.yellow
    : ansi.gray + ' 1:Activity ' + ansi.yellow;
  const serverTab = state.logViewTab === 'server'
    ? ansi.bgWhite + ansi.black + ' 2:Server ' + ansi.reset + ansi.yellow
    : ansi.gray + ' 2:Server ' + ansi.yellow;

  // Server status (only show on server tab)
  let statusIndicator = '';
  if (isServerTab && state.serverMode === 'command') {
    const statusText = state.serverRunning ? ansi.green + 'RUNNING' : (state.serverCrashed ? ansi.red + 'CRASHED' : ansi.gray + 'STOPPED');
    statusIndicator = ` [${statusText}${ansi.yellow}]`;
  } else if (isServerTab && state.serverMode === 'static') {
    statusIndicator = ansi.green + ' [STATIC]' + ansi.yellow;
  }

  write(ansi.moveTo(row, col + 2));
  write(ansi.yellow + ansi.bold + ' ' + activityTab + ' ' + serverTab + statusIndicator + ' ' + ansi.reset);

  // Content
  const contentHeight = height - 4;
  const maxScroll = Math.max(0, logData.length - contentHeight);
  const logScrollOffset = Math.min(Math.max(0, state.logScrollOffset), maxScroll);

  let contentRow = row + 2;

  if (logData.length === 0) {
    write(ansi.moveTo(contentRow, col + 2));
    write(ansi.gray + (isServerTab ? 'No server output yet...' : 'No activity yet...') + ansi.reset);
  } else if (isServerTab) {
    // Server log: newest at bottom, scroll from bottom
    const startIndex = Math.max(0, state.serverLogBuffer.length - contentHeight - logScrollOffset);
    const endIndex = Math.min(state.serverLogBuffer.length, startIndex + contentHeight);

    for (let i = startIndex; i < endIndex; i++) {
      const entry = state.serverLogBuffer[i];
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
    const endIndex = Math.min(state.activityLog.length, startIndex + contentHeight);

    for (let i = startIndex; i < endIndex; i++) {
      const entry = state.activityLog[i];
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
  const restartHint = state.serverMode === 'command' ? '[R] Restart  ' : '';
  write(ansi.gray + '[1/2] Switch Tab  [\u2191\u2193] Scroll  ' + restartHint + '[l]/[Esc] Close' + ansi.reset);
}

// ---------------------------------------------------------------------------
// renderInfo
// ---------------------------------------------------------------------------

/**
 * Render the server/status info overlay.
 *
 * @param {object} state
 * @param {function} write
 */
function renderInfo(state, write) {
  const width = Math.min(50, state.terminalWidth - 4);
  const height = state.noServer ? 9 : 12;
  const col = Math.floor((state.terminalWidth - width) / 2);
  const row = Math.floor((state.terminalHeight - height) / 2);

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
  write(ansi.cyan + ansi.bold + (state.noServer ? ' Status Info ' : ' Server Info ') + ansi.reset);

  // Content
  let contentRow = row + 2;

  if (!state.noServer) {
    write(ansi.moveTo(contentRow, col + 3));
    write(ansi.white + ansi.bold + 'Dev Server' + ansi.reset);
    contentRow++;

    write(ansi.moveTo(contentRow, col + 3));
    write(ansi.gray + 'URL: ' + ansi.reset + ansi.green + `http://localhost:${state.port}` + ansi.reset);
    contentRow++;

    write(ansi.moveTo(contentRow, col + 3));
    write(ansi.gray + 'Port: ' + ansi.reset + ansi.yellow + state.port + ansi.reset);
    contentRow++;

    write(ansi.moveTo(contentRow, col + 3));
    write(ansi.gray + 'Connected browsers: ' + ansi.reset + ansi.cyan + state.clientCount + ansi.reset);
    contentRow++;

    contentRow++;
  }

  write(ansi.moveTo(contentRow, col + 3));
  write(ansi.white + ansi.bold + 'Git Polling' + ansi.reset);
  contentRow++;

  write(ansi.moveTo(contentRow, col + 3));
  write(ansi.gray + 'Interval: ' + ansi.reset + `${state.adaptivePollInterval / 1000}s`);
  contentRow++;

  write(ansi.moveTo(contentRow, col + 3));
  write(ansi.gray + 'Status: ' + ansi.reset + (state.isOffline ? ansi.red + 'Offline' : ansi.green + 'Online') + ansi.reset);
  contentRow++;

  if (state.noServer) {
    write(ansi.moveTo(contentRow, col + 3));
    write(ansi.gray + 'Mode: ' + ansi.reset + ansi.magenta + 'No-Server (branch monitor only)' + ansi.reset);
  }

  // Instructions
  write(ansi.moveTo(row + height - 2, col + Math.floor((width - 20) / 2)));
  write(ansi.gray + 'Press [i] or [Esc] to close' + ansi.reset);
}

// ---------------------------------------------------------------------------
// renderActionModal
// ---------------------------------------------------------------------------

/**
 * Render the branch-actions modal with PR/CI/Claude integration.
 *
 * @param {object} state
 * @param {function} write
 */
function renderActionModal(state, write) {
  if (!state.actionMode || !state.actionData) return;

  const { branch, sessionUrl, prInfo, hasGh, hasGlab, ghAuthed, glabAuthed, webUrl, isClaudeBranch, platform, prLoaded } = state.actionData;

  const width = Math.min(64, state.terminalWidth - 4);
  const innerW = width - 6;

  const platformLabel = platform === 'gitlab' ? 'GitLab' : platform === 'bitbucket' ? 'Bitbucket' : platform === 'azure' ? 'Azure DevOps' : 'GitHub';
  const prLabel = platform === 'gitlab' ? 'MR' : 'PR';
  const cliTool = platform === 'gitlab' ? 'glab' : 'gh';
  const hasCli = platform === 'gitlab' ? hasGlab : hasGh;
  const cliAuthed = platform === 'gitlab' ? glabAuthed : ghAuthed;
  const cliReady = hasCli && cliAuthed;
  const loading = state.actionLoading;

  // Build actions list - ALL actions always shown, grayed out with reasons when unavailable
  const actions = [];

  // Open on web
  actions.push({
    key: 'b', label: `Open branch on ${platformLabel}`,
    available: !!webUrl, reason: !webUrl ? 'Could not parse remote URL' : null,
  });

  // Claude session - always shown so users know it exists
  actions.push({
    key: 'c', label: 'Open Claude Code session',
    available: !!sessionUrl,
    reason: !isClaudeBranch ? 'Not a Claude branch' : !sessionUrl && !loading ? 'No session URL in commits' : null,
    loading: isClaudeBranch && !sessionUrl && loading,
  });

  // PR: create or view depending on state
  const prIsMerged = prInfo && (prInfo.state === 'MERGED' || prInfo.state === 'merged');
  const prIsOpen = prInfo && (prInfo.state === 'OPEN' || prInfo.state === 'open');
  if (prInfo) {
    actions.push({ key: 'p', label: `View ${prLabel} #${prInfo.number}`, available: !!webUrl, reason: null });
  } else {
    actions.push({
      key: 'p', label: `Create ${prLabel}`,
      available: cliReady && prLoaded,
      reason: !hasCli ? `Requires ${cliTool} CLI` : !cliAuthed ? `Run: ${cliTool} auth login` : null,
      loading: cliReady && !prLoaded,
    });
  }

  // Diff - opens on web, just needs a PR and webUrl
  actions.push({
    key: 'd', label: `View ${prLabel} diff on ${platformLabel}`,
    available: !!prInfo && !!webUrl,
    reason: !prInfo && prLoaded ? `No ${prLabel}` : !webUrl ? 'Could not parse remote URL' : null,
    loading: !prLoaded && (cliReady || !!webUrl),
  });

  // Approve - disabled for merged PRs
  actions.push({
    key: 'a', label: `Approve ${prLabel}`,
    available: !!prInfo && prIsOpen && cliReady,
    reason: prIsMerged ? `${prLabel} already merged` : !hasCli ? `Requires ${cliTool} CLI` : !cliAuthed ? `Run: ${cliTool} auth login` : !prInfo && prLoaded ? `No open ${prLabel}` : null,
    loading: cliReady && !prLoaded,
  });

  // Merge - disabled for already-merged PRs
  actions.push({
    key: 'm', label: `Merge ${prLabel} (squash)`,
    available: !!prInfo && prIsOpen && cliReady,
    reason: prIsMerged ? `${prLabel} already merged` : !hasCli ? `Requires ${cliTool} CLI` : !cliAuthed ? `Run: ${cliTool} auth login` : !prInfo && prLoaded ? `No open ${prLabel}` : null,
    loading: cliReady && !prLoaded,
  });

  // CI
  actions.push({
    key: 'i', label: 'Check CI status',
    available: cliReady && (!!prInfo || platform === 'gitlab'),
    reason: !hasCli ? `Requires ${cliTool} CLI` : !cliAuthed ? `Run: ${cliTool} auth login` : !prInfo && prLoaded && platform !== 'gitlab' ? `No open ${prLabel}` : null,
    loading: cliReady && !prLoaded && platform !== 'gitlab',
  });

  // Calculate height
  let contentLines = 0;
  contentLines += 2; // spacing + branch name
  contentLines += 1; // separator
  contentLines += actions.length;
  contentLines += 1; // separator

  // Status info
  const statusInfoLines = [];
  if (prInfo) {
    let prStatus = `${prLabel} #${prInfo.number}: ${truncate(prInfo.title, innerW - 20)}`;
    const badges = [];
    if (prIsMerged) badges.push('merged');
    if (prInfo.approved) badges.push('approved');
    if (prInfo.checksPass) badges.push('checks pass');
    if (prInfo.checksFail) badges.push('checks fail');
    if (badges.length) prStatus += ` [${badges.join(', ')}]`;
    statusInfoLines.push({ color: prIsMerged ? 'magenta' : 'green', text: prStatus });
  } else if (loading) {
    statusInfoLines.push({ color: 'gray', text: `Loading ${prLabel} info...` });
  } else if (cliReady) {
    statusInfoLines.push({ color: 'gray', text: `No ${prLabel} for this branch` });
  }

  if (isClaudeBranch) {
    if (sessionUrl) {
      const shortSession = sessionUrl.replace('https://claude.ai/code/', '');
      statusInfoLines.push({ color: 'magenta', text: `Session: ${truncate(shortSession, innerW - 10)}` });
    } else if (!loading) {
      statusInfoLines.push({ color: 'gray', text: 'Claude branch (no session URL in commits)' });
    }
  }

  contentLines += statusInfoLines.length;

  // Setup hints
  const hints = [];
  if (!hasCli) {
    if (platform === 'gitlab') {
      hints.push('Install glab: https://gitlab.com/gitlab-org/cli');
      hints.push('Then run: glab auth login');
    } else {
      hints.push('Install gh:   https://cli.github.com');
      hints.push('Then run: gh auth login');
    }
  } else if (!cliAuthed) {
    hints.push(`${cliTool} is installed but not authenticated`);
    hints.push(`Run: ${cliTool} auth login`);
  }

  if (hints.length > 0) {
    contentLines += 1;
    contentLines += hints.length;
  }

  contentLines += 2; // blank + close instructions

  const modalHeight = contentLines + 3;
  const modalCol = Math.floor((state.terminalWidth - width) / 2);
  const modalRow = Math.floor((state.terminalHeight - modalHeight) / 2);

  // Draw box
  const borderColor = ansi.brightCyan;
  write(ansi.moveTo(modalRow, modalCol));
  write(borderColor + ansi.bold);
  write(box.dTopLeft + box.dHorizontal.repeat(width - 2) + box.dTopRight);

  for (let i = 1; i < modalHeight - 1; i++) {
    write(ansi.moveTo(modalRow + i, modalCol));
    write(borderColor + box.dVertical + ansi.reset + ' '.repeat(width - 2) + borderColor + box.dVertical + ansi.reset);
  }

  write(ansi.moveTo(modalRow + modalHeight - 1, modalCol));
  write(borderColor + box.dBottomLeft + box.dHorizontal.repeat(width - 2) + box.dBottomRight);
  write(ansi.reset);

  // Title
  const title = ' Branch Actions ';
  write(ansi.moveTo(modalRow, modalCol + 2));
  write(borderColor + ansi.bold + title + ansi.reset);

  let r = modalRow + 2;

  // Branch name with type indicator
  write(ansi.moveTo(r, modalCol + 3));
  write(ansi.white + ansi.bold + truncate(branch.name, innerW - 10) + ansi.reset);
  if (isClaudeBranch) {
    write(ansi.magenta + ' [Claude]' + ansi.reset);
  }
  r++;

  // Separator
  r++;

  // Actions list - all always visible
  for (const action of actions) {
    write(ansi.moveTo(r, modalCol + 3));
    if (action.loading) {
      write(ansi.gray + '[' + action.key + '] ' + action.label + '  ' + ansi.dim + ansi.cyan + 'loading...' + ansi.reset);
    } else if (action.available) {
      write(ansi.brightCyan + '[' + action.key + ']' + ansi.reset + ' ' + action.label);
    } else {
      write(ansi.gray + '[' + action.key + '] ' + action.label);
      if (action.reason) {
        write('  ' + ansi.dim + ansi.yellow + action.reason + ansi.reset);
      }
      write(ansi.reset);
    }
    r++;
  }

  // Separator
  r++;

  // Status info
  for (const info of statusInfoLines) {
    write(ansi.moveTo(r, modalCol + 3));
    write(ansi[info.color] + truncate(info.text, innerW) + ansi.reset);
    r++;
  }

  // Setup hints
  if (hints.length > 0) {
    r++;
    for (const hint of hints) {
      write(ansi.moveTo(r, modalCol + 3));
      write(ansi.yellow + truncate(hint, innerW) + ansi.reset);
      r++;
    }
  }

  // Close instructions
  write(ansi.moveTo(modalRow + modalHeight - 2, modalCol + Math.floor((width - 18) / 2)));
  write(ansi.gray + 'Press [Esc] to close' + ansi.reset);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  renderHeader,
  renderBranchList,
  renderActivityLog,
  renderCasinoStats,
  renderFooter,
  renderFlash,
  renderErrorToast,
  renderPreview,
  renderHistory,
  renderLogView,
  renderInfo,
  renderActionModal,
};
