import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import stringWidth from 'string-width';

export interface OpenCodePromptOptions {
  mode: 'build' | 'plan';
  model: string;
  provider?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Box width: responsive between 42..94, locked per prompt session
// ─────────────────────────────────────────────────────────────────────────────
function getSafeBoxWidth(): number {
  const termCols = process.stdout.columns || 80;
  return Math.max(42, Math.min(termCols - 4, 94));
}

// ─────────────────────────────────────────────────────────────────────────────
// 100% Mathematically Exact Border Renderers (using string-width)
// ─────────────────────────────────────────────────────────────────────────────

function renderTopBorder(
  width: number,
  isBuild: boolean,
  model: string,
  borderColor: (s: string) => string
): string {
  const modeText = isBuild ? ' ⚡ BUILD ' : ' 📋 PLAN ';
  const modeBadge = isBuild
    ? chalk.bgHex('#00C853').black.bold(modeText)
    : chalk.bgHex('#FFB300').black.bold(modeText);
  const modeWidth = stringWidth(modeText);

  // Responsive right hint
  let rightText = ' (Tab: model • Esc: clear) ';
  if (width < 86) rightText = ' (Tab: model) ';
  if (width < 66) rightText = '';

  let rightWidth = stringWidth(rightText);

  // Available room for model badge
  // Overhead: '╭── ' (4) + modeWidth + ' ── ' (4) + ' ' (1) + min 1 dash (1) + rightWidth + '──╮' (3)
  let availForModel = width - (4 + modeWidth + 4 + 1 + 1 + rightWidth + 3);
  if (availForModel < 8) {
    rightText = '';
    rightWidth = 0;
    availForModel = width - (4 + modeWidth + 4 + 1 + 1 + rightWidth + 3);
  }

  // Model text truncation
  let modelDisplay = model;
  let modelText = ` 🤖 ${modelDisplay} `;
  if (stringWidth(modelText) > availForModel) {
    let short = modelDisplay.includes('/')
      ? modelDisplay.split('/').pop() || modelDisplay
      : modelDisplay;
    while (short.length > 0 && stringWidth(` 🤖 ${short}… `) > availForModel) {
      short = short.slice(0, -1);
    }
    modelDisplay = short ? `${short}…` : '…';
    modelText = ` 🤖 ${modelDisplay} `;
  }

  // Ultra-narrow fallback
  while (stringWidth(modelText) > availForModel && modelDisplay.length > 1) {
    modelDisplay = modelDisplay.slice(0, -1);
    modelText = ` 🤖 ${modelDisplay}… `;
  }

  const modelBadge = chalk.bgHex('#1A237E').white.bold(modelText);
  const modelWidth = stringWidth(modelText);

  const leftPrefix =
    borderColor('╭── ') + modeBadge + borderColor(' ── ') + modelBadge + borderColor(' ');
  const leftWidth = 4 + modeWidth + 4 + modelWidth + 1;
  const rightSuffix = (rightText ? chalk.dim(rightText) : '') + borderColor('──╮');
  const rightTotalWidth = rightWidth + 3;

  const dashesCount = Math.max(1, width - leftWidth - rightTotalWidth);
  return leftPrefix + borderColor('─'.repeat(dashesCount)) + rightSuffix;
}

function renderBottomBorder(
  width: number,
  borderColor: (s: string) => string,
  customHint?: string
): string {
  let hintText =
    customHint || ' Enter: send • Tab: switch model • Shift+Enter: newline • /help ';

  if (!customHint) {
    if (width < 90) hintText = ' Enter: send • Tab: model • Shift+Enter: newline • /help ';
    if (width < 76) hintText = ' Enter: send • Tab: model • /help ';
    if (width < 60) hintText = ' Enter: send • Tab: model ';
    if (width < 46) hintText = ' Enter: send ';
  }

  const prefixWidth = 4; // '╰── '
  const suffixWidth = 3; // '──╯'
  const minDashes = 1;
  const maxHintWidth = width - prefixWidth - suffixWidth - minDashes;

  while (stringWidth(hintText) > maxHintWidth && hintText.length > 0) {
    if (hintText.includes('•')) {
      hintText = hintText.slice(0, hintText.lastIndexOf('•')).trim() + ' ';
    } else {
      hintText = ' Enter ';
      if (stringWidth(hintText) > maxHintWidth) {
        hintText = '';
      }
      break;
    }
  }

  const hintWidth = stringWidth(hintText);
  const dashesCount = Math.max(1, width - prefixWidth - hintWidth - suffixWidth);

  return (
    borderColor('╰── ') +
    (hintText ? chalk.gray(hintText) : '') +
    borderColor('─'.repeat(dashesCount)) +
    borderColor('──╯')
  );
}

function renderContentLine(
  width: number,
  lineText: string,
  isFirst: boolean,
  isBuild: boolean,
  borderColor: (s: string) => string
): string {
  const promptArrow = isBuild
    ? chalk.hex('#00FF7F').bold('❯ ')
    : chalk.hex('#FFB300').bold('❯ ');
  const prefix = isFirst
    ? borderColor('│ ') + promptArrow
    : borderColor('│ ') + chalk.dim('· ');
  const prefixWidth = 4;
  const rightBorder = borderColor(' │');
  const rightWidth = 2;
  const textCapacity = Math.max(1, width - prefixWidth - rightWidth);

  let visibleText = lineText;
  while (stringWidth(visibleText) > textCapacity && visibleText.length > 0) {
    visibleText = visibleText.slice(1);
  }

  const textWidth = stringWidth(visibleText);
  const padding = Math.max(0, textCapacity - textWidth);
  return prefix + chalk.white(visibleText) + ' '.repeat(padding) + rightBorder;
}

function renderStatusLine(
  width: number,
  statusText: string,
  borderColor: (s: string) => string
): string {
  const prefix = borderColor('│ ') + chalk.cyan('⏳ ');
  const prefixWidth = 4;
  const rightBorder = borderColor(' │');
  const rightWidth = 2;
  const textCapacity = Math.max(1, width - prefixWidth - rightWidth);

  let visibleText = statusText;
  while (stringWidth(visibleText) > textCapacity && visibleText.length > 0) {
    visibleText = visibleText.slice(1);
  }

  const textWidth = stringWidth(visibleText);
  const padding = Math.max(0, textCapacity - textWidth);
  return prefix + chalk.yellow(visibleText) + ' '.repeat(padding) + rightBorder;
}

// ─────────────────────────────────────────────────────────────────────────────
// restoreTerminalViewport: reset scroll margins + show cursor
// ─────────────────────────────────────────────────────────────────────────────
export function restoreTerminalViewport(): void {
  try {
    process.stdout.write('\x1b[r\x1b[?25h');
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// updateFixedBottomStatus: update status line inside fixed dock
// ─────────────────────────────────────────────────────────────────────────────
export function updateFixedBottomStatus(
  statusText: string,
  options?: { mode?: 'build' | 'plan'; model?: string }
): void {
  if (!process.stdout.isTTY || !process.stdout.rows || process.stdout.rows < 14) return;
  const H = process.stdout.rows;
  const boxWidth = getSafeBoxWidth();
  const isBuildMode = (options?.mode || 'build') === 'build';
  const borderColor = isBuildMode ? chalk.hex('#00FF7F') : chalk.hex('#FFB300');
  const statusLine = renderStatusLine(boxWidth, statusText, borderColor);
  process.stdout.write(`\x1b[s\x1b[${H - 2};1H\x1b[2K${statusLine}\x1b[u`);
}

// ─────────────────────────────────────────────────────────────────────────────
// STICKY HEADER & FIXED DOCK SYSTEM (OpenCode / Antigravity Style)
//
// Top Rows 1-3: Permanently Pinned Header (Banner & Developer Info)
//   Row 1: 🇧🇩 BANGLACLI v2.0  •  Developer: Rakib Hasan Shuvo (@rakibhasanshuvo712-hub)
//   Row 2: Next-Gen Autonomous BYOK Coding Agent • Speaks বাংলা, Banglish & English
//   Row 3: ───────────────────────────────────────────────────────────────────────
//
// Middle Rows 4..(H - 4): Active Workspace (DECSTBM Scrolling Region)
//   All execution, streaming chat, markdown, and tools render here cleanly.
//
// Bottom Rows (H - 3)..(H - 1): Permanently Pinned Docked Box
//   Row H - 3: ╭── ⚡ BUILD ── 🤖 model ───────────────────────── (Tab: model) ──╮
//   Row H - 2: │ ❯ input...                                                      │
//   Row H - 1: ╰── Enter: send • Tab: switch model • Shift+Enter: newline ───────╯
// ─────────────────────────────────────────────────────────────────────────────

let _dockedActive = false;
let _dockedRows = 0;
let _dockedCols = 0;
let _dockedModel = '';
let _dockedMode: 'build' | 'plan' = 'build';

const HEADER_ROWS = 3; // rows 1, 2, 3
const BOX_ROWS = 4;    // blank gap + top border + content + bottom border

function writeStickyHeader(cols: number): void {
  const w = cols;

  // Row 1: Brand badge, developer name, workspace
  const badge = chalk.bgHex('#006A4E').white.bold(' 🇧🇩 BANGLACLI v2.0 ');
  const devLabel = chalk.dim(' Developer: ');
  const devName = chalk.bold.hex('#00FF7F')('Rakib Hasan Shuvo');
  const devHandle = chalk.dim(' (@rakibhasanshuvo712-hub)');
  const row1Left = `${badge} ${devLabel}${devName}${devHandle}`;
  const row1LeftWidth = stringWidth(' 🇧🇩 BANGLACLI v2.0  Developer: Rakib Hasan Shuvo (@rakibhasanshuvo712-hub)');

  let cwd = process.cwd();
  const maxCwdWidth = Math.max(0, w - row1LeftWidth - 5);
  if (stringWidth(cwd) > maxCwdWidth && maxCwdWidth > 8) {
    cwd = '…' + cwd.slice(-(maxCwdWidth - 2));
  } else if (maxCwdWidth <= 8) {
    cwd = '';
  }
  const cwdTag = cwd ? chalk.dim(` 📁 ${cwd}`) : '';
  const row1Padding = Math.max(0, w - row1LeftWidth - (cwd ? stringWidth(` 📁 ${cwd}`) : 0));

  // Row 2: Subtitle & capabilities
  const subText = chalk.dim('Next-Gen Autonomous BYOK Coding Agent • Speaks ') +
    chalk.hex('#FFDF00').bold('বাংলা') + chalk.dim(', ') +
    chalk.cyan.bold('Banglish') + chalk.dim(' & ') +
    chalk.white.bold('English');
  const subPlain = 'Next-Gen Autonomous BYOK Coding Agent • Speaks বাংলা, Banglish & English';
  const row2Padding = Math.max(0, w - stringWidth(subPlain));

  // Row 3: Accent border line
  const divider = chalk.hex('#00FF7F').dim('─'.repeat(Math.max(1, w)));

  // Write all 3 rows cleanly
  process.stdout.write(`\x1b[1;1H\x1b[2K${row1Left}${' '.repeat(row1Padding)}${cwdTag}`);
  process.stdout.write(`\x1b[2;1H\x1b[2K  ${subText}${' '.repeat(Math.max(0, row2Padding - 2))}`);
  process.stdout.write(`\x1b[3;1H\x1b[2K${divider}`);
}

function writeDockedBox(rows: number, cols: number, model: string, mode: 'build' | 'plan'): void {
  const isBuild = mode === 'build';
  const borderColor = isBuild ? chalk.hex('#00FF7F') : chalk.hex('#FFB300');
  const boxWidth = Math.max(42, Math.min(cols - 4, 94));

  const topRow = rows - 3;
  const contentRow = rows - 2;
  const bottomRow = rows - 1;

  const topBorder = renderTopBorder(boxWidth, isBuild, model, borderColor);
  const contentLine = renderContentLine(boxWidth, '', true, isBuild, borderColor);
  const bottomBorder = renderBottomBorder(boxWidth, borderColor);

  // Clear blank separator above box
  process.stdout.write(`\x1b[${topRow - 1};1H\x1b[2K`);
  // Render box lines
  process.stdout.write(`\x1b[${topRow};1H\x1b[2K${topBorder}`);
  process.stdout.write(`\x1b[${contentRow};1H\x1b[2K${contentLine}`);
  process.stdout.write(`\x1b[${bottomRow};1H\x1b[2K${bottomBorder}`);
  // Clear bottom-most line
  process.stdout.write(`\x1b[${rows};1H\x1b[2K`);
}

/**
 * Activates fixed-dock layout with DECSTBM scrolling region.
 */
export function activateFixedDock(model: string, mode: 'build' | 'plan'): boolean {
  const rows = process.stdout.rows;
  const cols = process.stdout.columns;
  if (!process.stdout.isTTY || !rows || rows < 14 || !cols) return false;

  _dockedActive = true;
  _dockedRows = rows;
  _dockedCols = cols;
  _dockedModel = model;
  _dockedMode = mode;

  process.stdout.write('\x1b[?25l'); // hide cursor

  // Write sticky top header
  writeStickyHeader(cols);

  // Write docked bottom box
  writeDockedBox(rows, cols, model, mode);

  // Set DECSTBM scroll region: rows 4..(rows - 4)
  const scrollTop = HEADER_ROWS + 1;  // row 4
  const scrollBottom = rows - BOX_ROWS; // row H - 4

  if (scrollBottom > scrollTop) {
    process.stdout.write(`\x1b[${scrollTop};${scrollBottom}r`);
  }

  // Position cursor inside scroll region
  process.stdout.write(`\x1b[${scrollBottom};1H\x1b[?25h`);

  process.stdout.on('resize', onDockedResize);
  return true;
}

function onDockedResize(): void {
  if (!_dockedActive) return;
  const rows = process.stdout.rows;
  const cols = process.stdout.columns;
  if (!rows || !cols || rows < 14) return;

  _dockedRows = rows;
  _dockedCols = cols;

  process.stdout.write('\x1b[?25l');
  writeStickyHeader(cols);
  writeDockedBox(rows, cols, _dockedModel, _dockedMode);

  const scrollTop = HEADER_ROWS + 1;
  const scrollBottom = rows - BOX_ROWS;
  if (scrollBottom > scrollTop) {
    process.stdout.write(`\x1b[${scrollTop};${scrollBottom}r`);
  }
  process.stdout.write(`\x1b[${scrollBottom};1H\x1b[?25h`);
}

export function updateDockedModel(model: string, mode: 'build' | 'plan'): void {
  _dockedModel = model;
  _dockedMode = mode;
  if (!_dockedActive) return;
  const rows = process.stdout.rows;
  const cols = process.stdout.columns;
  if (!rows || !cols) return;
  const isBuild = mode === 'build';
  const borderColor = isBuild ? chalk.hex('#00FF7F') : chalk.hex('#FFB300');
  const boxWidth = Math.max(42, Math.min(cols - 4, 94));
  const topRow = rows - 3;
  process.stdout.write(`\x1b[s\x1b[${topRow};1H\x1b[2K${renderTopBorder(boxWidth, isBuild, model, borderColor)}\x1b[u`);
}

export function deactivateFixedDock(): void {
  if (!_dockedActive) return;
  _dockedActive = false;
  process.stdout.removeListener('resize', onDockedResize);
  restoreTerminalViewport();
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCKED PROMPT — Interactive reader inside the fixed bottom box
// ─────────────────────────────────────────────────────────────────────────────
async function readDockedPrompt(options: OpenCodePromptOptions): Promise<string | null> {
  const isBuildMode = options.mode === 'build';
  const borderColor = isBuildMode ? chalk.hex('#00FF7F') : chalk.hex('#FFB300');

  return new Promise((resolve) => {
    const rows = process.stdout.rows!;
    const cols = process.stdout.columns!;
    const boxWidth = Math.max(42, Math.min(cols - 4, 94));

    const topRow = rows - 3;
    const contentRow = rows - 2;
    const bottomRow = rows - 1;
    const startCol = 5; // after '│ ❯ '

    // Reset input box to empty
    const topBorder = renderTopBorder(boxWidth, isBuildMode, options.model, borderColor);
    const line0 = renderContentLine(boxWidth, '', true, isBuildMode, borderColor);
    const bottom = renderBottomBorder(boxWidth, borderColor);

    process.stdout.write('\x1b[?25l');
    process.stdout.write(`\x1b[${topRow};1H\x1b[2K${topBorder}`);
    process.stdout.write(`\x1b[${contentRow};1H\x1b[2K${line0}`);
    process.stdout.write(`\x1b[${bottomRow};1H\x1b[2K${bottom}`);
    process.stdout.write(`\x1b[${contentRow};${startCol}H\x1b[?25h`);

    let bufferLines = [''];
    let cursorLine = 0;
    let cursorCol = 0;
    let inBracketedPaste = false;
    let pasteBuffer = '';

    const wasRaw = process.stdin.isRaw;
    try {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdout.write('\x1b[?2004h');
    } catch {}

    const updateActiveLine = () => {
      const lineStr = renderContentLine(
        boxWidth,
        bufferLines[cursorLine],
        cursorLine === 0,
        isBuildMode,
        borderColor
      );
      const absCol = startCol + Math.min(cursorCol, boxWidth - 8);
      process.stdout.write(`\x1b[${contentRow};1H\x1b[2K${lineStr}\x1b[${contentRow};${absCol}H`);
    };

    const cleanup = () => {
      try { process.stdout.write('\x1b[?2004l'); } catch {}
      process.stdin.removeListener('data', onData);
      try {
        if (!wasRaw) process.stdin.setRawMode(false);
        process.stdin.pause();
      } catch {}
    };

    const submit = () => {
      cleanup();
      const fullContent = bufferLines.join('\n').trim();

      // Show temporary status inside dock while output streams above
      const statusLine = renderStatusLine(boxWidth, 'Processing request...', borderColor);
      process.stdout.write(`\x1b[${contentRow};1H\x1b[2K${statusLine}`);

      // Write user transcript line into scrolling workspace
      const scrollBottom = rows - BOX_ROWS;
      const promptArrow = isBuildMode
        ? chalk.hex('#00FF7F').bold('❯ ')
        : chalk.hex('#FFB300').bold('❯ ');

      process.stdout.write(`\x1b[${scrollBottom};1H`);
      for (let i = 0; i < bufferLines.length; i++) {
        const pfx = i === 0 ? promptArrow : chalk.dim('· ');
        process.stdout.write(`\r\n${pfx}${chalk.white.bold(bufferLines[i])}`);
      }
      process.stdout.write('\r\n\x1b[?25h');
      resolve(fullContent);
    };

    const cancel = () => {
      cleanup();
      const emptyLine = renderContentLine(boxWidth, '', true, isBuildMode, borderColor);
      process.stdout.write(`\x1b[${contentRow};1H\x1b[2K${emptyLine}`);
      process.stdout.write(`\x1b[${contentRow};${startCol}H\x1b[?25h`);
      resolve(null);
    };

    const handlePastedText = (pasted: string) => {
      const normalized = pasted.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const pastedLines = normalized.split('\n');
      const cur = bufferLines[cursorLine];
      if (pastedLines.length === 1) {
        bufferLines[cursorLine] = cur.slice(0, cursorCol) + pastedLines[0] + cur.slice(cursorCol);
        cursorCol += pastedLines[0].length;
      } else {
        bufferLines[cursorLine] = cur.slice(0, cursorCol) + pastedLines.join(' ') + cur.slice(cursorCol);
        cursorCol += pastedLines.join(' ').length;
      }
      updateActiveLine();
    };

    const onData = (data: Buffer) => {
      const str = data.toString('utf-8');

      // Bracketed paste
      if (str.includes('\x1b[200~')) {
        inBracketedPaste = true;
        const afterStart = str.split('\x1b[200~')[1] || '';
        if (afterStart.includes('\x1b[201~')) {
          const [pastedContent] = afterStart.split('\x1b[201~');
          inBracketedPaste = false;
          handlePastedText(pastedContent);
          return;
        } else {
          pasteBuffer += afterStart;
          return;
        }
      }
      if (inBracketedPaste) {
        if (str.includes('\x1b[201~')) {
          const [beforeEnd] = str.split('\x1b[201~');
          pasteBuffer += beforeEnd;
          inBracketedPaste = false;
          const full = pasteBuffer;
          pasteBuffer = '';
          handlePastedText(full);
          return;
        } else {
          pasteBuffer += str;
          return;
        }
      }

      // Burst paste
      if (str.length > 2 && (str.includes('\n') || str.includes('\r'))) {
        handlePastedText(str);
        return;
      }

      // Ctrl+C: Exit
      if (str === '\x03') {
        cleanup();
        deactivateFixedDock();
        process.stdout.write('\r\n' + chalk.yellow('Exiting banglacli...\n'));
        process.exit(0);
      }

      // Tab / F2: Model switcher
      if (str === '\t' || str === '\x09' || str === '\x1bOQ' || str === '\x1b[12~') {
        cleanup();
        const emptyLine = renderContentLine(boxWidth, '', true, isBuildMode, borderColor);
        process.stdout.write(`\x1b[${contentRow};1H\x1b[2K${emptyLine}`);
        process.stdout.write(`\x1b[${contentRow};${startCol}H`);
        resolve('/model');
        return;
      }

      // Ctrl+D
      if (str === '\x04') {
        if (bufferLines.join('').length === 0) {
          cancel();
          return;
        }
      }

      // Escape: clear input
      if (str === '\x1b') {
        if (bufferLines.join('').length > 0) {
          bufferLines = [''];
          cursorLine = 0;
          cursorCol = 0;
          updateActiveLine();
        } else {
          cancel();
        }
        return;
      }

      // Enter: submit
      if (str === '\r' || str === '\n' || str === '\r\n') {
        if (bufferLines.join('\n').trim().length === 0) return;
        submit();
        return;
      }

      // Backspace
      if (str === '\x08' || str === '\x7f') {
        if (cursorCol > 0) {
          const cur = bufferLines[cursorLine];
          bufferLines[cursorLine] = cur.slice(0, cursorCol - 1) + cur.slice(cursorCol);
          cursorCol--;
          updateActiveLine();
        }
        return;
      }

      // Arrow keys
      if (str === '\x1b[D') { // Left
        if (cursorCol > 0) {
          cursorCol--;
          const absCol = startCol + Math.min(cursorCol, boxWidth - 8);
          process.stdout.write(`\x1b[${contentRow};${absCol}H`);
        }
        return;
      }
      if (str === '\x1b[C') { // Right
        if (cursorCol < bufferLines[cursorLine].length) {
          cursorCol++;
          const absCol = startCol + Math.min(cursorCol, boxWidth - 8);
          process.stdout.write(`\x1b[${contentRow};${absCol}H`);
        }
        return;
      }

      // Ignore escape sequences
      if (str.startsWith('\x1b[')) return;

      // Printable character
      if (str.length === 1 && str.charCodeAt(0) >= 32) {
        const cur = bufferLines[cursorLine];
        bufferLines[cursorLine] = cur.slice(0, cursorCol) + str + cur.slice(cursorCol);
        cursorCol++;
        updateActiveLine();
        return;
      }

      // Multi-char text
      if (str.length > 0 && !str.includes('\x1b')) {
        const cur = bufferLines[cursorLine];
        bufferLines[cursorLine] = cur.slice(0, cursorCol) + str + cur.slice(cursorCol);
        cursorCol += str.length;
        updateActiveLine();
        return;
      }
    };

    process.stdin.on('data', onData);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// INLINE PROMPT — Fallback for small screens or non-TTY
// ─────────────────────────────────────────────────────────────────────────────
async function readInlinePrompt(options: OpenCodePromptOptions): Promise<string | null> {
  const isBuildMode = options.mode === 'build';
  const borderColor = isBuildMode ? chalk.hex('#00FF7F') : chalk.hex('#FFB300');

  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      let nonTtyData = '';
      process.stdin.setEncoding('utf-8');
      const onData = (chunk: string) => { nonTtyData += chunk; };
      const onEnd = () => {
        process.stdin.removeListener('data', onData);
        process.stdin.removeListener('end', onEnd);
        resolve(nonTtyData.trim() || null);
      };
      process.stdin.on('data', onData);
      process.stdin.on('end', onEnd);
      return;
    }

    try { process.stdout.write('\x1b[?2004h'); } catch {}

    const wasRaw = process.stdin.isRaw;
    try {
      process.stdin.setRawMode(true);
      process.stdin.resume();
    } catch {}

    let bufferLines = [''];
    let cursorLine = 0;
    let cursorCol = 0;
    let inBracketedPaste = false;
    let pasteBuffer = '';

    const boxWidth = getSafeBoxWidth();

    process.stdout.write(renderTopBorder(boxWidth, isBuildMode, options.model, borderColor) + '\n');
    process.stdout.write(renderContentLine(boxWidth, '', true, isBuildMode, borderColor) + '\n');
    process.stdout.write(renderBottomBorder(boxWidth, borderColor));
    process.stdout.write('\x1b[1A\x1b[5G');

    const updateActiveLine = () => {
      const lineStr = renderContentLine(
        boxWidth, bufferLines[cursorLine], cursorLine === 0, isBuildMode, borderColor
      );
      const activeCol = 5 + Math.min(cursorCol, boxWidth - 8);
      process.stdout.write(`\r${lineStr}\r\x1b[${activeCol}G`);
    };

    const redrawFrom = (startLine: number) => {
      const lines: string[] = [];
      for (let i = startLine; i < bufferLines.length; i++) {
        lines.push(renderContentLine(boxWidth, bufferLines[i], i === 0, isBuildMode, borderColor));
      }
      lines.push(renderBottomBorder(boxWidth, borderColor));
      process.stdout.write('\r\x1b[J');
      process.stdout.write(lines.join('\n'));
      const linesUp = bufferLines.length - cursorLine;
      const activeCol = 5 + Math.min(cursorCol, boxWidth - 8);
      process.stdout.write(`\x1b[${linesUp}A\x1b[${activeCol}G`);
    };

    const cleanup = () => {
      try { process.stdout.write('\x1b[?2004l'); } catch {}
      process.stdin.removeListener('data', onData);
      try {
        if (!wasRaw) process.stdin.setRawMode(false);
        process.stdin.pause();
      } catch {}
    };

    const submit = () => {
      cleanup();
      const fullContent = bufferLines.join('\n').trim();
      const downLines = bufferLines.length - cursorLine;
      process.stdout.write(`\x1b[${downLines}B\r\n`);
      resolve(fullContent);
    };

    const cancel = () => {
      cleanup();
      const downLines = bufferLines.length - cursorLine;
      process.stdout.write(`\x1b[${downLines}B\r\n`);
      resolve(null);
    };

    const handlePastedText = (pasted: string) => {
      const normalized = pasted.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const pastedLines = normalized.split('\n');
      if (pastedLines.length === 1) {
        const cur = bufferLines[cursorLine];
        bufferLines[cursorLine] = cur.slice(0, cursorCol) + pastedLines[0] + cur.slice(cursorCol);
        cursorCol += pastedLines[0].length;
        updateActiveLine();
      } else {
        const cur = bufferLines[cursorLine];
        const before = cur.slice(0, cursorCol);
        const after = cur.slice(cursorCol);
        bufferLines[cursorLine] = before + pastedLines[0];
        const middle = pastedLines.slice(1, -1);
        const last = pastedLines[pastedLines.length - 1];
        const prevLine = cursorLine;
        bufferLines.splice(cursorLine + 1, 0, ...middle, last + after);
        cursorLine += pastedLines.length - 1;
        cursorCol = last.length;
        redrawFrom(prevLine);
      }
    };

    const onData = (data: Buffer) => {
      const str = data.toString('utf-8');

      if (str.includes('\x1b[200~')) {
        inBracketedPaste = true;
        const afterStart = str.split('\x1b[200~')[1] || '';
        if (afterStart.includes('\x1b[201~')) {
          const [pastedContent] = afterStart.split('\x1b[201~');
          inBracketedPaste = false;
          handlePastedText(pastedContent);
          return;
        } else { pasteBuffer += afterStart; return; }
      }
      if (inBracketedPaste) {
        if (str.includes('\x1b[201~')) {
          const [beforeEnd] = str.split('\x1b[201~');
          pasteBuffer += beforeEnd;
          inBracketedPaste = false;
          const full = pasteBuffer; pasteBuffer = '';
          handlePastedText(full); return;
        } else { pasteBuffer += str; return; }
      }

      if (str.length > 2 && (str.includes('\n') || str.includes('\r'))) {
        handlePastedText(str); return;
      }

      if (str === '\x03') {
        cleanup();
        const down = bufferLines.length - cursorLine;
        process.stdout.write(`\x1b[${down}B\r\n`);
        process.stdout.write(chalk.yellow('Exiting banglacli...\n'));
        process.exit(0);
      }

      if (str === '\t' || str === '\x09' || str === '\x1bOQ' || str === '\x1b[12~') {
        cleanup();
        const down = bufferLines.length - cursorLine;
        process.stdout.write(`\x1b[${down}B\r\n`);
        resolve('/model');
        return;
      }

      if (str === '\x04') { if (bufferLines.join('').length === 0) { cancel(); return; } }

      if (str === '\x1b') {
        if (bufferLines.join('').length > 0) {
          if (cursorLine > 0) process.stdout.write(`\x1b[${cursorLine}A`);
          bufferLines = ['']; cursorLine = 0; cursorCol = 0;
          redrawFrom(0);
        } else { cancel(); }
        return;
      }

      if (str === '\x0a' || str === '\x1b\x0d' || str === '\x1b\r' ||
          str === '\x1b[13;2u' || str === '\x1b[13;5u') {
        const cur = bufferLines[cursorLine];
        const prevLine = cursorLine;
        bufferLines[cursorLine] = cur.slice(0, cursorCol);
        bufferLines.splice(cursorLine + 1, 0, cur.slice(cursorCol));
        cursorLine++; cursorCol = 0;
        redrawFrom(prevLine); return;
      }

      if (str === '\r' || str === '\n' || str === '\r\n') {
        if (bufferLines.join('\n').trim().length === 0) return;
        submit(); return;
      }

      if (str === '\x08' || str === '\x7f') {
        if (cursorCol > 0) {
          const cur = bufferLines[cursorLine];
          bufferLines[cursorLine] = cur.slice(0, cursorCol - 1) + cur.slice(cursorCol);
          cursorCol--; updateActiveLine();
        } else if (cursorLine > 0) {
          const cur = bufferLines[cursorLine];
          const prev = bufferLines[cursorLine - 1];
          cursorCol = prev.length;
          bufferLines[cursorLine - 1] = prev + cur;
          bufferLines.splice(cursorLine, 1);
          cursorLine--;
          process.stdout.write('\x1b[1A');
          redrawFrom(cursorLine);
        }
        return;
      }

      if (str === '\x1b[D') {
        if (cursorCol > 0) { cursorCol--; process.stdout.write(`\x1b[${5 + Math.min(cursorCol, boxWidth - 8)}G`); }
        else if (cursorLine > 0) { cursorLine--; cursorCol = bufferLines[cursorLine].length; process.stdout.write(`\x1b[1A\x1b[${5 + Math.min(cursorCol, boxWidth - 8)}G`); }
        return;
      }
      if (str === '\x1b[C') {
        if (cursorCol < bufferLines[cursorLine].length) { cursorCol++; process.stdout.write(`\x1b[${5 + Math.min(cursorCol, boxWidth - 8)}G`); }
        else if (cursorLine < bufferLines.length - 1) { cursorLine++; cursorCol = 0; process.stdout.write('\x1b[1B\x1b[5G'); }
        return;
      }
      if (str === '\x1b[A') {
        if (cursorLine > 0) { cursorLine--; cursorCol = Math.min(cursorCol, bufferLines[cursorLine].length); process.stdout.write(`\x1b[1A\x1b[${5 + Math.min(cursorCol, boxWidth - 8)}G`); }
        return;
      }
      if (str === '\x1b[B') {
        if (cursorLine < bufferLines.length - 1) { cursorLine++; cursorCol = Math.min(cursorCol, bufferLines[cursorLine].length); process.stdout.write(`\x1b[1B\x1b[${5 + Math.min(cursorCol, boxWidth - 8)}G`); }
        return;
      }

      if (str.startsWith('\x1b[')) return;

      if (str.length === 1 && str.charCodeAt(0) >= 32) {
        const cur = bufferLines[cursorLine];
        bufferLines[cursorLine] = cur.slice(0, cursorCol) + str + cur.slice(cursorCol);
        cursorCol++; updateActiveLine(); return;
      }

      if (str.length > 0 && !str.includes('\x1b')) {
        const cur = bufferLines[cursorLine];
        bufferLines[cursorLine] = cur.slice(0, cursorCol) + str + cur.slice(cursorCol);
        cursorCol += str.length; updateActiveLine(); return;
      }
    };

    process.stdin.on('data', onData);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API: readOpenCodePrompt
// ─────────────────────────────────────────────────────────────────────────────
export async function readOpenCodePrompt(options: OpenCodePromptOptions): Promise<string | null> {
  if (_dockedActive) {
    return readDockedPrompt(options);
  }
  return readInlinePrompt(options);
}

// ─────────────────────────────────────────────────────────────────────────────
// expandOpenCodeMentions: @file and URL auto-ingestion
// ─────────────────────────────────────────────────────────────────────────────
export async function expandOpenCodeMentions(rawPrompt: string): Promise<{
  expandedPrompt: string;
  attachedFiles: string[];
}> {
  const attachedFiles: string[] = [];
  const contexts: string[] = [];

  const urlRegex = /(?:@)?(https?:\/\/[^\s"'<>]+)/g;
  const urlMatches = Array.from(rawPrompt.matchAll(urlRegex));

  for (const match of urlMatches) {
    const targetUrl = match[1];
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) banglacli/2.0',
          Accept: 'text/html,application/xhtml+xml,application/json,text/plain;q=0.9',
        },
      });
      clearTimeout(timeout);
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        const rawBody = await res.text();
        let clean = rawBody;
        if (!contentType.includes('application/json')) {
          clean = rawBody
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        }
        const snippet = clean.slice(0, 15000);
        contexts.push(
          `\n--- [Attached Web Resource: ${targetUrl} (${snippet.length} chars)] ---\n` +
            snippet + '\n'
        );
        attachedFiles.push(`web:${targetUrl.slice(0, 45)}...`);
      }
    } catch {}
  }

  const fileRegex = /@([a-zA-Z0-9_\-\.\/\\]+)/g;
  const fileMatches = Array.from(rawPrompt.matchAll(fileRegex));

  for (const match of fileMatches) {
    const rawPath = match[1];
    if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) continue;
    const resolvedPath = path.resolve(process.cwd(), rawPath);
    if (fs.existsSync(resolvedPath)) {
      const stat = fs.statSync(resolvedPath);
      if (stat.isFile()) {
        try {
          let content = fs.readFileSync(resolvedPath, 'utf-8');
          const lineCount = content.split('\n').length;
          if (content.length > 60000)
            content = content.slice(0, 60000) + '\n\n... [Content truncated] ...';
          const ext = path.extname(resolvedPath).replace('.', '') || 'text';
          contexts.push(
            `\n--- [Attached Workspace File: @${rawPath} (${lineCount} lines, ${stat.size} bytes)] ---\n` +
              '```' + ext + '\n' + content + '\n```'
          );
          attachedFiles.push(`@${rawPath}`);
        } catch {}
      } else if (stat.isDirectory()) {
        try {
          const files = fs.readdirSync(resolvedPath).slice(0, 40);
          contexts.push(
            `\n--- [Attached Directory Listing: @${rawPath}/ (${files.length} items)] ---\n` +
              files.join('\n') + '\n'
          );
          attachedFiles.push(`@${rawPath}/`);
        } catch {}
      }
    }
  }

  if (attachedFiles.length > 0) {
    console.log(
      chalk.bgHex('#004D40').hex('#00FF7F').bold(' 📎 Resource Ingestion: ') +
        chalk.white(` ${attachedFiles.length} item(s): `) +
        chalk.cyan.bold(attachedFiles.join(', '))
    );
  }

  return {
    expandedPrompt: attachedFiles.length > 0
      ? rawPrompt + '\n\n' + contexts.join('\n')
      : rawPrompt,
    attachedFiles,
  };
}
