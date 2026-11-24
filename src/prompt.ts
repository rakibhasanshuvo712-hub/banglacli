import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import Conf from 'conf';
import stringWidth from 'string-width';
import { getActiveMeshNode } from './tools.js';

export interface OpenCodePromptOptions {
  mode: 'build' | 'plan';
  model: string;
  provider?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Box width: clean compact length (max 84 cols) for comfortable terminal reading
// ─────────────────────────────────────────────────────────────────────────────
function getSafeBoxWidth(cols?: number): number {
  const termCols = cols || process.stdout.columns || 80;
  return Math.max(48, Math.min(termCols - 4, 84));
}

function getDockedRows(rows: number): {
  topRow: number;
  contentRow: number;
  hintRow: number | null;
  bottomRow: number;
  boxRows: number;
} {
  const isSpacious = rows >= 22;
  const boxRows = isSpacious ? 6 : 5;
  return {
    topRow: rows - boxRows,
    contentRow: rows - boxRows + 1,
    hintRow: rows - 2,
    bottomRow: rows - 1,
    boxRows,
  };
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

  let rightText = ' (Tab: model • Esc: clear) ';
  if (width < 86) rightText = ' (Tab: model) ';
  if (width < 66) rightText = '';

  let rightWidth = stringWidth(rightText);

  let availForModel = width - (4 + modeWidth + 4 + 1 + 1 + rightWidth + 3);
  if (availForModel < 8) {
    rightText = '';
    rightWidth = 0;
    availForModel = width - (4 + modeWidth + 4 + 1 + 1 + rightWidth + 3);
  }

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

  const prefixWidth = 4;
  const suffixWidth = 3;
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

  const textCapacity = Math.max(1, width - 6);
  let visibleText = lineText;
  while (stringWidth(visibleText) > textCapacity && visibleText.length > 0) {
    visibleText = visibleText.slice(1);
  }

  return prefix + chalk.white(visibleText);
}

function renderStatusLine(
  width: number,
  statusText: string,
  borderColor: (s: string) => string
): string {
  const prefix = borderColor('│ ') + chalk.cyan('⏳ ');
  const textCapacity = Math.max(1, width - 6);
  let visibleText = statusText;
  while (stringWidth(visibleText) > textCapacity && visibleText.length > 0) {
    visibleText = visibleText.slice(1);
  }

  return prefix + chalk.yellow(visibleText);
}

export function restoreTerminalViewport(): void {
  try {
    process.stdout.write('\x1b[r\x1b[?25h');
  } catch {}
}

export function updateFixedBottomStatus(
  statusText: string,
  options?: { mode?: 'build' | 'plan'; model?: string }
): void {
  if (!_dockedActive || !process.stdout.rows || process.stdout.rows < 16) return;
  const H = process.stdout.rows;
  const boxWidth = getSafeBoxWidth();
  const isBuildMode = (options?.mode || _dockedMode) === 'build';
  const borderColor = isBuildMode ? chalk.hex('#00FF7F') : chalk.hex('#FFB300');
  const { contentRow } = getDockedRows(H);
  const statusLine = renderStatusLine(boxWidth, statusText, borderColor);
  process.stdout.write(`\x1b[s\x1b[${contentRow};1H\x1b[2K${statusLine}\x1b[u`);
}

// ─────────────────────────────────────────────────────────────────────────────
// STICKY HEADER SYSTEM (With Colorful Bangladesh Green/Red ASCII Art)
// ─────────────────────────────────────────────────────────────────────────────

let _dockedActive = false;
let _dockedRows = 0;
let _dockedCols = 0;
let _dockedProvider = 'Google Gemini';
let _dockedModel = 'gemini-2.0-flash';
let _dockedMode: 'build' | 'plan' = 'build';
let _dockedHeaderHeight = 11;

const BOX_ROWS = 4;

function renderStickyHeaderLines(
  w: number,
  h: number,
  provider: string,
  model: string,
  mode: 'build' | 'plan',
  compact: boolean = false
): string[] {
  const brand = chalk.hex('#00FF7F').bold;
  const accentRed = chalk.hex('#FF3366').bold;
  const dim = chalk.gray;

  const lines: string[] = [];

  // 1. Header Title & Brand
  if (compact) {
    let cwd = process.cwd();
    const cwdTag = cwd ? chalk.dim(` 📁 ${cwd}`) : '';
    lines.push(
      brand('  🇧🇩 BANGLACLI v2.0') +
        chalk.dim(' • Developer: ') +
        chalk.bold.hex('#00FF7F')('Rakib Hasan Shuvo') +
        chalk.dim(' (@rakibhasanshuvo712-hub)') +
        cwdTag
    );
  } else if (w >= 76 && h >= 24) {
    lines.push(brand('  ██████╗  █████╗ ███╗   ██╗ ██████╗ ██╗      █████╗  ██████╗██╗     ██╗'));
    lines.push(brand('  ██╔══██╗██╔══██╗████╗  ██║██╔════╝ ██║     ██╔══██╗██╔════╝██║     ██║'));
    lines.push(brand('  ██████╔╝███████║██╔██╗ ██║██║  ███╗██║     ███████║██║     ██║     ██║'));
    lines.push(accentRed('  ██╔══██╗██╔══██║██║╚██╗██║██║   ██║██║     ██╔══██║██║     ██║     ██║'));
    lines.push(accentRed('  ██████╔╝██║  ██║██║ ╚████║╚██████╔╝███████╗██║  ██║╚██████╗███████╗██║'));
    lines.push(dim('  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝ ╚═════╝╚══════╝╚═╝'));
  } else if (w >= 52) {
    lines.push(brand('  █▄▄ ▄▀█ █▄░█ █▀▀ █░░ ▄▀█ █▀▀ █░░ █ ') + chalk.dim('🇧🇩 banglacli v2.0'));
    lines.push(accentRed('  █▄█ █▀█ █░▀█ █▄█ █▄▄ █▀█ █▄▄ █▄▄ █ ') + chalk.dim('Autonomous Coding Agent'));
  } else {
    lines.push(brand('  🇧🇩 BANGLACLI v2.0 ') + chalk.dim('Next-Gen AI Coding Agent'));
  }

  // 2. Developer Name & Workspace Path (Only if not compact)
  if (!compact) {
    const devText = `Developer: Rakib Hasan Shuvo`;
    let rDevPlain = `  ${devText} (@rakibhasanshuvo712-hub)`;
    let devPart = chalk.dim('  Developer: ') + chalk.bold.hex('#00FF7F')('Rakib Hasan Shuvo') + chalk.dim(' (@rakibhasanshuvo712-hub)');

    if (stringWidth(rDevPlain) > w) {
      rDevPlain = `  ${devText}`;
      devPart = chalk.dim('  Developer: ') + chalk.bold.hex('#00FF7F')('Rakib Hasan Shuvo');
    }

    let cwd = process.cwd();
    const maxCwd = Math.max(0, w - stringWidth(rDevPlain) - 5);
    if (stringWidth(cwd) > maxCwd && maxCwd > 6) {
      cwd = '…' + cwd.slice(-(maxCwd - 2));
    } else if (maxCwd <= 6) {
      cwd = '';
    }
    const cwdTag = cwd ? chalk.dim(` 📁 ${cwd}`) : '';
    const rDevPadding = Math.max(0, w - stringWidth(rDevPlain) - (cwd ? stringWidth(` 📁 ${cwd}`) : 0));
    lines.push(`${devPart}${' '.repeat(rDevPadding)}${cwdTag}`);
  }

  // 3. Active Provider, Model, and Mode badge
  const modeBadge = mode === 'build' ? chalk.bold.green('⚡ BUILD Mode') : chalk.bold.yellow('📋 PLAN Mode');
  const mesh = getActiveMeshNode();
  let meshTextPlain = '';
  let meshTextFormatted = '';
  if (mesh) {
    const peerCount = mesh.listPeers().filter((p) => p.nodeId !== mesh.nodeId).length;
    const peerLabel = peerCount > 0 ? `${peerCount} peer${peerCount > 1 ? 's' : ''}` : 'mesh';
    meshTextPlain = `  •  Mesh: [${mesh.role.toUpperCase()}] (${peerLabel})`;
    meshTextFormatted = `  ${chalk.dim('•')}  ${chalk.dim('Mesh:')} ${chalk.bold.hex('#00E5FF')(`[${mesh.role.toUpperCase()}]`)} ${chalk.dim(`(${peerLabel})`)}`;
  }

  let rowModelPlain = `  Provider: ${provider}  •  Model: ${model}  •  Mode: ${mode === 'build' ? '⚡ BUILD Mode' : '📋 PLAN Mode'}${meshTextPlain}`;
  let rowModel = `  ${chalk.dim('Provider:')} ${chalk.bold.cyan(provider)}  ${chalk.dim('•')}  ${chalk.dim('Model:')} ${chalk.bold.hex('#00FF7F')(model)}  ${chalk.dim('•')}  ${chalk.dim('Mode:')} ${modeBadge}${meshTextFormatted}`;

  if (stringWidth(rowModelPlain) > w) {
    rowModel = `  ${chalk.cyan(provider)} ${chalk.dim('•')} ${chalk.hex('#00FF7F')(model)} ${chalk.dim('•')} ${modeBadge}${meshTextFormatted}`;
  }
  if (stringWidth(`  ${provider} • ${model} • Mode • ${meshTextPlain}`) > w) {
    rowModel = `  ${chalk.cyan(provider)} ${chalk.dim('•')} ${chalk.hex('#00FF7F')(model)} ${chalk.dim('•')} ${modeBadge}`;
  }
  lines.push(rowModel);

  // 4. Commands Bar: /mode, /agent, /peers, /doctor, /stats, /limits, /help, /exit (Only if not compact)
  if (!compact) {
    let cmdsPlain = '  Commands: /mode • /agent • /peers • /doctor • /stats • /limits • /help • /exit';
    let rowCmds = `  ${chalk.dim('Commands:')} ${chalk.cyan('/mode')} ${chalk.dim('•')} ${chalk.cyan('/agent')} ${chalk.dim('•')} ${chalk.cyan('/peers')} ${chalk.dim('•')} ${chalk.cyan('/doctor')} ${chalk.dim('•')} ${chalk.cyan('/stats')} ${chalk.dim('•')} ${chalk.cyan('/limits')} ${chalk.dim('•')} ${chalk.cyan('/help')} ${chalk.dim('•')} ${chalk.cyan('/exit')}`;

    if (stringWidth(cmdsPlain) > w) {
      cmdsPlain = '  /mode • /agent • /peers • /doctor • /stats • /limits • /help • /exit';
      rowCmds = `  ${chalk.cyan('/mode')} ${chalk.dim('•')} ${chalk.cyan('/agent')} ${chalk.dim('•')} ${chalk.cyan('/peers')} ${chalk.dim('•')} ${chalk.cyan('/doctor')} ${chalk.dim('•')} ${chalk.cyan('/stats')} ${chalk.dim('•')} ${chalk.cyan('/limits')} ${chalk.dim('•')} ${chalk.cyan('/help')} ${chalk.dim('•')} ${chalk.cyan('/exit')}`;
    }
    if (stringWidth(cmdsPlain) > w) {
      cmdsPlain = '  /mode • /agent • /peers • /limits • /help • /exit';
      rowCmds = `  ${chalk.cyan('/mode')} ${chalk.dim('•')} ${chalk.cyan('/agent')} ${chalk.dim('•')} ${chalk.cyan('/peers')} ${chalk.dim('•')} ${chalk.cyan('/limits')} ${chalk.dim('•')} ${chalk.cyan('/help')} ${chalk.dim('•')} ${chalk.cyan('/exit')}`;
    }
    lines.push(rowCmds);
  }

  // 5. Divider Line
  const divider = chalk.hex('#00FF7F').dim('─'.repeat(Math.max(1, w)));
  lines.push(divider);

  return lines;
}

export function writeStickyHeader(
  cols: number,
  rows: number,
  provider: string,
  model: string,
  mode: 'build' | 'plan',
  compact: boolean = false
): number {
  const lines = renderStickyHeaderLines(cols, rows, provider, model, mode, compact);
  lines.forEach((line, index) => {
    process.stdout.write(`\x1b[${index + 1};1H\x1b[2K${line}`);
  });
  // Blank spacer row directly below divider
  const spacerRow = lines.length + 1;
  process.stdout.write(`\x1b[${spacerRow};1H\x1b[2K`);
  return spacerRow; // returns total height used by header (including spacer)
}

/**
 * Prepares the screen for interactive prompts (e.g. model selector, mode picker).
 * Pinned upper header is drawn at rows 1..H in compact layout, everything below row H is cleared,
 * and the cursor is placed at row H+1 for clean in-place execution.
 * Prevents overlapping, terminal buffer corruption, and displacement of the pinned header.
 */
export function prepareInteractiveArea(
  provider: string,
  model: string,
  mode: 'build' | 'plan'
): number {
  deactivateFixedDock();
  const rows = process.stdout.rows || 24;
  const cols = process.stdout.columns || 80;

  try {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.resume();
  } catch {}

  process.stdout.write('\x1b[r\x1b[?25h');
  process.stdout.write('\x1b[2J\x1b[H');

  const headerHeight = writeStickyHeader(cols, rows, provider, model, mode, true);
  _dockedHeaderHeight = headerHeight;

  // Clear everything from row headerHeight + 1 down to the bottom
  process.stdout.write(`\x1b[${headerHeight + 1};1H\x1b[J`);
  return headerHeight;
}

/**
 * Safely truncates a string containing ANSI escape codes to a maximum visible width,
 * appending an ellipsis if truncated, while keeping ANSI formatting intact.
 */
export function truncateWithAnsi(str: string, maxWidth: number): string {
  if (stringWidth(str) <= maxWidth) return str;
  const chars = Array.from(str);
  let visibleWidth = 0;
  let result = '';
  let i = 0;
  while (i < chars.length) {
    if (chars[i] === '\x1b') {
      const remaining = chars.slice(i).join('');
      const match = remaining.match(/^\x1b\[[0-9;]*[a-zA-Z]/);
      if (match) {
        result += match[0];
        i += Array.from(match[0]).length;
        continue;
      }
    }
    const char = chars[i];
    const w = stringWidth(char);
    if (visibleWidth + w > maxWidth - 1) {
      result += '…\x1b[0m';
      break;
    }
    result += char;
    visibleWidth += w;
    i++;
  }
  return result + '\x1b[0m';
}

export interface InteractiveSelectOption<T extends string = string> {
  value: T;
  label: string;
  hint?: string;
}

export interface InteractiveSelectConfig<T extends string = string> {
  message: string;
  options: InteractiveSelectOption<T>[];
  initialValue?: T;
  maxItems?: number;
}

/**
 * 100% resilient terminal interactive selector that works across all operating systems and shells
 * (PowerShell, Windows Terminal, VS Code terminal, cmd.exe, Git Bash, macOS, Linux).
 * 
 * Direct raw data events ensure arrow keys (↑/↓), vim keys (j/k), numbers (1-9), Enter, and Esc
 * always navigate and confirm without hanging or freezing.
 */
export async function interactiveSelect<T extends string = string>(
  config: InteractiveSelectConfig<T>
): Promise<T | null> {
  if (!config.options || config.options.length === 0) return null;
  if (!process.stdin.isTTY) {
    return config.initialValue ?? config.options[0]?.value ?? null;
  }

  return new Promise((resolve) => {
    let cursor = config.options.findIndex((o) => o.value === config.initialValue);
    if (cursor === -1) cursor = 0;

    const wasRaw = process.stdin.isRaw;
    try {
      process.stdin.setRawMode(true);
    } catch {}
    process.stdin.resume();
    process.stdout.write('\x1b[?25l'); // Hide cursor

    let termRows = process.stdout.rows || 24;
    let termCols = process.stdout.columns || 80;
    const maxVisible = Math.max(3, Math.min(config.maxItems || 8, config.options.length, termRows - 8));
    let scrollOffset = 0;

    const updateScroll = () => {
      if (cursor < scrollOffset) {
        scrollOffset = cursor;
      } else if (cursor >= scrollOffset + maxVisible) {
        scrollOffset = cursor - maxVisible + 1;
      }
    };

    const renderFrame = (): string => {
      updateScroll();
      const lines: string[] = [];
      lines.push(chalk.cyan.bold('◆ ') + chalk.bold.white(config.message));

      const visibleSlice = config.options.slice(scrollOffset, scrollOffset + maxVisible);
      const canScrollUp = scrollOffset > 0;
      const canScrollDown = scrollOffset + maxVisible < config.options.length;

      for (let i = 0; i < visibleSlice.length; i++) {
        const opt = visibleSlice[i];
        const actualIdx = scrollOffset + i;
        const isSelected = actualIdx === cursor;

        const bullet = isSelected ? chalk.hex('#00FF7F').bold('●') : chalk.gray('○');
        const numStr = (actualIdx + 1).toString();
        const numTag = isSelected
          ? chalk.hex('#00FF7F').bold(`[${numStr}]`)
          : chalk.dim(`[${numStr}]`);

        let lineContent = '';
        if (isSelected) {
          const hintStr = opt.hint ? chalk.hex('#00E5FF')(` (${opt.hint})`) : '';
          lineContent = `  ${bullet} ${numTag} ${chalk.white.bold(opt.label)}${hintStr}`;
        } else {
          const hintStr = opt.hint ? chalk.dim(` (${opt.hint})`) : '';
          lineContent = `  ${bullet} ${numTag} ${opt.label}${hintStr}`;
        }

        lines.push(truncateWithAnsi(lineContent, termCols - 2));
      }

      let footerScroll = '';
      if (canScrollUp && canScrollDown) {
        footerScroll = chalk.dim(`  ↑ ... (${cursor + 1}/${config.options.length}) ... ↓`);
      } else if (canScrollUp) {
        footerScroll = chalk.dim(`  ↑ ... (${cursor + 1}/${config.options.length})`);
      } else if (canScrollDown) {
        footerScroll = chalk.dim(`  ↓ ... (${cursor + 1}/${config.options.length})`);
      }

      const keyHint = chalk.dim(
        `  ↑/↓ or 1-${Math.min(9, config.options.length)} to navigate • Enter: confirm • Esc: cancel`
      );

      if (footerScroll) {
        lines.push(footerScroll);
      }
      lines.push(keyHint);

      return lines.join('\n');
    };

    let lastLineCount = 0;
    const draw = () => {
      const frame = renderFrame();
      if (lastLineCount > 0) {
        process.stdout.write(`\x1b[${lastLineCount}A\r\x1b[J`);
      }
      process.stdout.write(frame + '\n');
      lastLineCount = frame.split('\n').length;
    };

    const cleanup = () => {
      process.stdin.removeListener('data', onData);
      process.stdout.removeListener('resize', onResize);
      if (numTimeout) clearTimeout(numTimeout);
      try {
        if (!wasRaw && process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
      } catch {}
      process.stdout.write('\x1b[?25h'); // Restore cursor
    };

    const confirm = () => {
      cleanup();
      if (lastLineCount > 0) {
        process.stdout.write(`\x1b[${lastLineCount}A\r\x1b[J`);
      }
      const chosen = config.options[cursor];
      process.stdout.write(
        chalk.hex('#00FF7F')('✔ ') +
          chalk.bold(config.message) +
          ' ' +
          chalk.hex('#00FF7F').bold(chosen.label) +
          '\n\n'
      );
      resolve(chosen.value);
    };

    const cancel = () => {
      cleanup();
      if (lastLineCount > 0) {
        process.stdout.write(`\x1b[${lastLineCount}A\r\x1b[J`);
      }
      process.stdout.write(
        chalk.gray('✖ ') + chalk.dim(`${config.message} (cancelled)\n\n`)
      );
      resolve(null);
    };

    const onResize = () => {
      termRows = process.stdout.rows || 24;
      termCols = process.stdout.columns || 80;
      draw();
    };

    let numBuffer = '';
    let numTimeout: NodeJS.Timeout | null = null;

    const onData = (buf: Buffer) => {
      const str = buf.toString('utf-8');

      // Ctrl+C
      if (str === '\x03') {
        cleanup();
        process.stdout.write('\r\n' + chalk.yellow('Exiting banglacli...\n'));
        process.exit(0);
      }

      // Escape or 'q' or 'Q'
      if (str === '\x1b' || str === 'q' || str === 'Q') {
        cancel();
        return;
      }

      // Enter
      if (str === '\r' || str === '\n' || str === '\r\n') {
        confirm();
        return;
      }

      // Up arrow: \x1b[A, \x1bOA, or 'k', 'K', 'w', 'W'
      if (
        str === '\x1b[A' ||
        str === '\x1bOA' ||
        str === 'k' ||
        str === 'K' ||
        str === 'w' ||
        str === 'W'
      ) {
        cursor = (cursor - 1 + config.options.length) % config.options.length;
        draw();
        return;
      }

      // Down arrow: \x1b[B, \x1bOB, or 'j', 'J', 's', 'S'
      if (
        str === '\x1b[B' ||
        str === '\x1bOB' ||
        str === 'j' ||
        str === 'J' ||
        str === 's' ||
        str === 'S'
      ) {
        cursor = (cursor + 1) % config.options.length;
        draw();
        return;
      }

      // PageUp
      if (str === '\x1b[5~') {
        cursor = Math.max(0, cursor - maxVisible);
        draw();
        return;
      }

      // PageDown
      if (str === '\x1b[6~') {
        cursor = Math.min(config.options.length - 1, cursor + maxVisible);
        draw();
        return;
      }

      // Home
      if (str === '\x1b[H' || str === '\x1b[1~') {
        cursor = 0;
        draw();
        return;
      }

      // End
      if (str === '\x1b[F' || str === '\x1b[4~') {
        cursor = config.options.length - 1;
        draw();
        return;
      }

      // Numeric input: '1' - '9', '0'
      if (/^[0-9]$/.test(str)) {
        numBuffer += str;
        const target = parseInt(numBuffer, 10);
        if (target >= 1 && target <= config.options.length) {
          cursor = target - 1;
          draw();
        }
        if (numTimeout) clearTimeout(numTimeout);
        numTimeout = setTimeout(() => {
          numBuffer = '';
        }, 700);
        return;
      }
    };

    process.stdout.on('resize', onResize);
    process.stdin.on('data', onData);
    draw();
  });
}

function writeDockedBox(rows: number, cols: number, model: string, mode: 'build' | 'plan'): void {
  const isBuild = mode === 'build';
  const borderColor = isBuild ? chalk.hex('#00FF7F') : chalk.hex('#FFB300');
  const boxWidth = getSafeBoxWidth(cols);
  const { topRow, contentRow, hintRow, bottomRow } = getDockedRows(rows);

  const topBorder = renderTopBorder(boxWidth, isBuild, model, borderColor);
  const contentLine = renderContentLine(boxWidth, '', true, isBuild, borderColor);
  const bottomBorder = renderBottomBorder(boxWidth, borderColor);

  process.stdout.write(`\x1b[${topRow - 1};1H\x1b[2K`);
  process.stdout.write(`\x1b[${topRow};1H\x1b[2K${topBorder}`);
  process.stdout.write(`\x1b[${contentRow};1H\x1b[2K${contentLine}`);
  for (let r = contentRow + 1; r < (hintRow || bottomRow); r++) {
    process.stdout.write(`\x1b[${r};1H\x1b[2K${borderColor('│ ')}`);
  }
  if (hintRow) {
    const hintLine = borderColor('│ ') + chalk.dim('· Shift+Enter: newline • /help for commands • ↑/↓: history');
    process.stdout.write(`\x1b[${hintRow};1H\x1b[2K${hintLine}`);
  }
  process.stdout.write(`\x1b[${bottomRow};1H\x1b[2K${bottomBorder}`);
  process.stdout.write(`\x1b[${rows};1H\x1b[2K`);
}

/**
 * Activates fixed-dock layout with DECSTBM scrolling region.
 */
export function activateFixedDock(
  provider: string,
  model: string,
  mode: 'build' | 'plan'
): boolean {
  const rows = process.stdout.rows;
  const cols = process.stdout.columns;
  if (!process.stdout.isTTY || !rows || rows < 16 || !cols) return false;

  _dockedActive = true;
  _dockedRows = rows;
  _dockedCols = cols;
  _dockedProvider = provider;
  _dockedModel = model;
  _dockedMode = mode;

  process.stdout.write('\x1b[?25l');

  // Clean screen viewport
  process.stdout.write('\x1b[2J\x1b[H');

  // Render Pinned Header (includes colorful BANGLACLI art + developer + commands)
  const headerHeight = writeStickyHeader(cols, rows, provider, model, mode);
  _dockedHeaderHeight = headerHeight;

  // Render Fixed Bottom Box
  writeDockedBox(rows, cols, model, mode);

  // Set DECSTBM Scroll Region
  // Keep terminal scroll margins completely reset (\x1b[r) so user's mouse wheel, trackpad, and terminal scrollbar are never locked
  process.stdout.write('\x1b[r');

  const { contentRow } = getDockedRows(rows);
  // Position cursor inside input box
  process.stdout.write(`\x1b[${contentRow};5H\x1b[?25h`);

  try {
    if (process.stdin.isTTY) {
      process.stdin.resume();
    }
  } catch {}

  process.stdout.removeListener('resize', onDockedResize);
  process.stdout.on('resize', onDockedResize);
  return true;
}

function onDockedResize(): void {
  if (!_dockedActive) return;
  const rows = process.stdout.rows;
  const cols = process.stdout.columns;
  if (!rows || !cols || rows < 16) return;

  _dockedRows = rows;
  _dockedCols = cols;

  process.stdout.write('\x1b[?25l');
  const headerHeight = writeStickyHeader(cols, rows, _dockedProvider, _dockedModel, _dockedMode);
  _dockedHeaderHeight = headerHeight;
  writeDockedBox(rows, cols, _dockedModel, _dockedMode);

  // Keep terminal scroll margins completely reset (\x1b[r) so user's mouse wheel, trackpad, and terminal scrollbar are never locked
  process.stdout.write('\x1b[r');
  const { contentRow } = getDockedRows(rows);
  process.stdout.write(`\x1b[${contentRow};5H\x1b[?25h`);
}

export function updateDockedModel(
  provider: string,
  model: string,
  mode: 'build' | 'plan'
): void {
  _dockedProvider = provider;
  _dockedModel = model;
  _dockedMode = mode;
  if (!_dockedActive) return;
  const rows = process.stdout.rows;
  const cols = process.stdout.columns;
  if (!rows || !cols) return;

  process.stdout.write('\x1b[s');
  const headerHeight = writeStickyHeader(cols, rows, provider, model, mode);
  _dockedHeaderHeight = headerHeight;
  const isBuild = mode === 'build';
  const borderColor = isBuild ? chalk.hex('#00FF7F') : chalk.hex('#FFB300');
  const boxWidth = getSafeBoxWidth(cols);
  const { topRow } = getDockedRows(rows);
  process.stdout.write(`\x1b[${topRow};1H\x1b[2K${renderTopBorder(boxWidth, isBuild, model, borderColor)}`);
  process.stdout.write('\x1b[u');
}

export function deactivateFixedDock(): void {
  if (!_dockedActive) return;
  _dockedActive = false;
  process.stdout.removeListener('resize', onDockedResize);
  restoreTerminalViewport();
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistent Command & Prompt History (Up / Down Arrow Navigation)
// ─────────────────────────────────────────────────────────────────────────────
const historyStore = new Conf<{ history: string[] }>({ projectName: 'banglacli_history' });
const defaultCommands = ['/help', '/limits', '/doctor', '/mode', '/model', '/renewal', '/about', '/stats'];
let savedHistory: string[] = [];
try {
  savedHistory = historyStore.get('history') || [];
} catch {}

const _commandHistory: string[] = savedHistory.length > 0 ? savedHistory : [...defaultCommands];
const MAX_HISTORY = 100;

export function addPromptHistory(cmd: string): void {
  const trimmed = cmd.trim();
  if (!trimmed) return;
  // Don't duplicate consecutive identical commands
  if (_commandHistory.length === 0 || _commandHistory[_commandHistory.length - 1] !== trimmed) {
    _commandHistory.push(trimmed);
    if (_commandHistory.length > MAX_HISTORY) {
      _commandHistory.shift();
    }
    try {
      historyStore.set('history', _commandHistory.slice(-50));
    } catch {}
  }
}

export function getPromptHistory(): string[] {
  return [..._commandHistory];
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCKED PROMPT — Interactive reader inside fixed bottom box
// ─────────────────────────────────────────────────────────────────────────────
async function readDockedPrompt(options: OpenCodePromptOptions): Promise<string | null> {
  const isBuildMode = options.mode === 'build';
  const borderColor = isBuildMode ? chalk.hex('#00FF7F') : chalk.hex('#FFB300');

  return new Promise((resolve) => {
    const rows = process.stdout.rows!;
    const cols = process.stdout.columns!;
    const boxWidth = getSafeBoxWidth(cols);
    const { boxRows, contentRow, hintRow } = getDockedRows(rows);
    const startCol = 5;

    // Self-healing re-render on every turn
    process.stdout.write('\x1b[?25l');
    const headerHeight = writeStickyHeader(
      cols,
      rows,
      options.provider || _dockedProvider,
      options.model,
      options.mode
    );
    _dockedHeaderHeight = headerHeight;
    writeDockedBox(rows, cols, options.model, options.mode);

    const scrollBottom = rows - boxRows;
    // Keep terminal scroll margins completely reset (\x1b[r) so user's mouse wheel, trackpad, and terminal scrollbar are never locked
    process.stdout.write('\x1b[r');

    process.stdout.write(`\x1b[${contentRow};${startCol}H\x1b[?25h`);

    let bufferLines = [''];
    let cursorLine = 0;
    let cursorCol = 0;
    let inBracketedPaste = false;
    let pasteBuffer = '';
    let historyIdx = -1;
    let savedDraft = '';

    const wasRaw = process.stdin.isRaw;
    try {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdout.write('\x1b[?2004h');
    } catch {}

    const updateActiveLine = () => {
      const displayLine = bufferLines.length > 1 ? bufferLines.join(' ↵ ') : bufferLines[cursorLine];
      const lineStr = renderContentLine(
        boxWidth,
        displayLine,
        true,
        isBuildMode,
        borderColor
      );
      const absCol = startCol + Math.min(cursorCol, boxWidth - 8);
      process.stdout.write(`\x1b[${contentRow};1H\x1b[2K${lineStr}`);
      if (hintRow) {
        if (bufferLines.length > 1) {
          const secondLine = renderContentLine(
            boxWidth,
            bufferLines.slice(1).join(' ↵ '),
            false,
            isBuildMode,
            borderColor
          );
          process.stdout.write(`\x1b[${hintRow};1H\x1b[2K${secondLine}`);
        } else if (displayLine.length === 0) {
          const hint = borderColor('│ ') + chalk.dim('· Shift+Enter: newline • /help for commands');
          process.stdout.write(`\x1b[${hintRow};1H\x1b[2K${hint}`);
        } else {
          process.stdout.write(`\x1b[${hintRow};1H\x1b[2K${borderColor('│ ')}`);
        }
      }
      process.stdout.write(`\x1b[${contentRow};${absCol}H`);
    };

    const cleanup = () => {
      try { process.stdout.write('\x1b[?2004l'); } catch {}
      process.stdin.removeListener('data', onData);
      try {
        if (!wasRaw && process.stdin.isTTY) process.stdin.setRawMode(false);
      } catch {}
    };

    const submit = () => {
      cleanup();
      const fullContent = bufferLines.join('\n').trim();
      if (fullContent.length > 0) {
        addPromptHistory(fullContent);
      }
      historyIdx = -1;
      savedDraft = '';
      const isSlash = fullContent.startsWith('/') || /^[>❯$#\s]+\//.test(fullContent);

      // Only show processing status line in dock for actual prompts, NOT for slash commands!
      if (!isSlash) {
        const statusLine = renderStatusLine(boxWidth, 'Processing request...', borderColor);
        process.stdout.write(`\x1b[${contentRow};1H\x1b[2K${statusLine}`);
        if (hintRow) {
          const subStatus = borderColor('│ ') + chalk.cyan('⚡ ') + chalk.dim('Autonomous agent working...');
          process.stdout.write(`\x1b[${hintRow};1H\x1b[2K${subStatus}`);
        }
      } else {
        const emptyLine = renderContentLine(boxWidth, '', true, isBuildMode, borderColor);
        process.stdout.write(`\x1b[${contentRow};1H\x1b[2K${emptyLine}`);
        if (hintRow) {
          process.stdout.write(`\x1b[${hintRow};1H\x1b[2K${borderColor('│ ')}`);
        }
        if (hintRow) {
          process.stdout.write(`\x1b[${hintRow};1H\x1b[2K${borderColor('│ ')}`);
        }
      }

      // Print prompt into scrolling workspace
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
      if (hintRow) {
        process.stdout.write(`\x1b[${hintRow};1H\x1b[2K${borderColor('│ ')}`);
      }
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
        const before = cur.slice(0, cursorCol);
        const after = cur.slice(cursorCol);
        bufferLines[cursorLine] = before + pastedLines[0];
        const middle = pastedLines.slice(1, -1);
        const last = pastedLines[pastedLines.length - 1];
        bufferLines.splice(cursorLine + 1, 0, ...middle, last + after);
        cursorLine += pastedLines.length - 1;
        cursorCol = last.length;
      }
      updateActiveLine();
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

      if (str.length > 2 && (str.includes('\n') || str.includes('\r'))) {
        handlePastedText(str);
        return;
      }

      // Ctrl+C: Clean Exit
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
        if (hintRow) {
          process.stdout.write(`\x1b[${hintRow};1H\x1b[2K${borderColor('│ ')}`);
        }
        process.stdout.write(`\x1b[${contentRow};${startCol}H`);
        resolve('/model');
        return;
      }

      // Ctrl+D: Exit if empty
      if (str === '\x04') {
        if (bufferLines.join('').length === 0) {
          cleanup();
          deactivateFixedDock();
          process.stdout.write('\r\n' + chalk.yellow('Exiting banglacli...\n'));
          process.exit(0);
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

      // Shift+Enter / Alt+Enter: newline inside buffer
      if (
        str === '\x0a' ||
        str === '\x1b\x0d' ||
        str === '\x1b\r' ||
        str === '\x1b[13;2u' ||
        str === '\x1b[13;5u'
      ) {
        const cur = bufferLines[cursorLine];
        const before = cur.slice(0, cursorCol);
        const after = cur.slice(cursorCol);
        bufferLines[cursorLine] = before;
        bufferLines.splice(cursorLine + 1, 0, after);
        cursorLine++;
        cursorCol = 0;
        updateActiveLine();
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
        } else if (cursorLine > 0) {
          const cur = bufferLines[cursorLine];
          const prev = bufferLines[cursorLine - 1];
          cursorCol = prev.length;
          bufferLines[cursorLine - 1] = prev + cur;
          bufferLines.splice(cursorLine, 1);
          cursorLine--;
          updateActiveLine();
        }
        return;
      }

      // Arrow keys & History navigation
      if (str === '\x1b[D' || str === '\x1bOD') { // Left
        if (cursorCol > 0) {
          cursorCol--;
          const absCol = startCol + Math.min(cursorCol, boxWidth - 8);
          process.stdout.write(`\x1b[${contentRow};${absCol}H`);
        } else if (cursorLine > 0) {
          cursorLine--;
          cursorCol = bufferLines[cursorLine].length;
          updateActiveLine();
        }
        return;
      }
      if (str === '\x1b[C' || str === '\x1bOC') { // Right
        if (cursorCol < bufferLines[cursorLine].length) {
          cursorCol++;
          const absCol = startCol + Math.min(cursorCol, boxWidth - 8);
          process.stdout.write(`\x1b[${contentRow};${absCol}H`);
        } else if (cursorLine < bufferLines.length - 1) {
          cursorLine++;
          cursorCol = 0;
          updateActiveLine();
        }
        return;
      }
      if (str === '\x1b[A' || str === '\x1bOA' || str === '\x10') { // Up / Ctrl+P (History Backward)
        if (cursorLine > 0) {
          cursorLine--;
          cursorCol = Math.min(cursorCol, bufferLines[cursorLine].length);
          updateActiveLine();
          return;
        }
        if (_commandHistory.length > 0) {
          if (historyIdx === -1) {
            savedDraft = bufferLines.join('\n');
          }
          if (historyIdx < _commandHistory.length - 1) {
            historyIdx++;
            const histItem = _commandHistory[_commandHistory.length - 1 - historyIdx];
            bufferLines = histItem.split('\n');
            cursorLine = bufferLines.length - 1;
            cursorCol = bufferLines[cursorLine].length;
            updateActiveLine();
          }
        }
        return;
      }
      if (str === '\x1b[B' || str === '\x1bOB' || str === '\x0e') { // Down / Ctrl+N (History Forward)
        if (cursorLine < bufferLines.length - 1) {
          cursorLine++;
          cursorCol = Math.min(cursorCol, bufferLines[cursorLine].length);
          updateActiveLine();
          return;
        }
        if (historyIdx > 0) {
          historyIdx--;
          const histItem = _commandHistory[_commandHistory.length - 1 - historyIdx];
          bufferLines = histItem.split('\n');
          cursorLine = 0;
          cursorCol = bufferLines[0].length;
          updateActiveLine();
        } else if (historyIdx === 0) {
          historyIdx = -1;
          bufferLines = savedDraft.split('\n');
          cursorLine = 0;
          cursorCol = bufferLines[0].length;
          updateActiveLine();
        }
        return;
      }

      // PageUp (\x1b[5~): Jump to oldest history entry
      if (str === '\x1b[5~') {
        if (_commandHistory.length > 0) {
          if (historyIdx === -1) savedDraft = bufferLines.join('\n');
          historyIdx = _commandHistory.length - 1;
          bufferLines = _commandHistory[0].split('\n');
          cursorLine = 0;
          cursorCol = bufferLines[0].length;
          updateActiveLine();
        }
        return;
      }

      // PageDown (\x1b[6~): Jump to latest draft entry
      if (str === '\x1b[6~') {
        if (historyIdx !== -1) {
          historyIdx = -1;
          bufferLines = savedDraft.split('\n');
          cursorLine = 0;
          cursorCol = bufferLines[0].length;
          updateActiveLine();
        }
        return;
      }

      // Home / End
      if (str === '\x1b[H' || str === '\x1b[1~') {
        cursorCol = 0;
        process.stdout.write(`\x1b[${contentRow};${startCol}H`);
        return;
      }
      if (str === '\x1b[F' || str === '\x1b[4~') {
        cursorCol = bufferLines[cursorLine].length;
        const absCol = startCol + Math.min(cursorCol, boxWidth - 8);
        process.stdout.write(`\x1b[${contentRow};${absCol}H`);
        return;
      }

      if (str.startsWith('\x1b[')) return;

      // Printable single char
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
    let historyIdx = -1;
    let savedDraft = '';

    const boxWidth = getSafeBoxWidth();

    process.stdout.write(renderTopBorder(boxWidth, isBuildMode, options.model, borderColor) + '\n');
    process.stdout.write(renderContentLine(boxWidth, '', true, isBuildMode, borderColor) + '\n');
    process.stdout.write(borderColor('│ ') + chalk.dim('· Shift+Enter: newline • /help for commands • ↑/↓: history') + '\n');
    process.stdout.write(renderBottomBorder(boxWidth, borderColor));
    process.stdout.write('\x1b[2A\x1b[5G');

    const updateActiveLine = () => {
      const lineStr = renderContentLine(
        boxWidth, bufferLines[cursorLine], cursorLine === 0, isBuildMode, borderColor
      );
      const activeCol = 5 + Math.min(cursorCol, boxWidth - 8);
      process.stdout.write(`\r\x1b[K${lineStr}\r\x1b[${activeCol}G`);
    };

    const redrawFrom = (startLine: number) => {
      const lines: string[] = [];
      for (let i = startLine; i < bufferLines.length; i++) {
        lines.push(renderContentLine(boxWidth, bufferLines[i], i === 0, isBuildMode, borderColor));
      }
      lines.push(borderColor('│ ') + chalk.dim('· Shift+Enter: newline • /help for commands • ↑/↓: history'));
      lines.push(renderBottomBorder(boxWidth, borderColor));
      process.stdout.write('\r\x1b[J');
      process.stdout.write(lines.join('\n'));
      const linesUp = bufferLines.length - cursorLine + 1;
      const activeCol = 5 + Math.min(cursorCol, boxWidth - 8);
      process.stdout.write(`\x1b[${linesUp}A\x1b[${activeCol}G`);
    };

    const cleanup = () => {
      try { process.stdout.write('\x1b[?2004l'); } catch {}
      process.stdin.removeListener('data', onData);
      try {
        if (!wasRaw && process.stdin.isTTY) process.stdin.setRawMode(false);
      } catch {}
    };

    const submit = () => {
      cleanup();
      const fullContent = bufferLines.join('\n').trim();
      if (fullContent.length > 0) {
        addPromptHistory(fullContent);
      }
      historyIdx = -1;
      savedDraft = '';
      const downLines = bufferLines.length - cursorLine + 1;
      process.stdout.write(`\x1b[${downLines}B\r\n`);
      resolve(fullContent);
    };

    const cancel = () => {
      cleanup();
      const downLines = bufferLines.length - cursorLine + 1;
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
        const prevLine = cursorLine;
        bufferLines[cursorLine] = before + pastedLines[0];
        const middle = pastedLines.slice(1, -1);
        const last = pastedLines[pastedLines.length - 1];
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

      if (str === '\x04') {
        if (bufferLines.join('').length === 0) {
          cleanup();
          process.stdout.write(chalk.yellow('Exiting banglacli...\n'));
          process.exit(0);
        }
      }

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

      if (str === '\x1b[D' || str === '\x1bOD') {
        if (cursorCol > 0) { cursorCol--; process.stdout.write(`\x1b[${5 + Math.min(cursorCol, boxWidth - 8)}G`); }
        else if (cursorLine > 0) { cursorLine--; cursorCol = bufferLines[cursorLine].length; process.stdout.write(`\x1b[1A\x1b[${5 + Math.min(cursorCol, boxWidth - 8)}G`); }
        return;
      }
      if (str === '\x1b[C' || str === '\x1bOC') {
        if (cursorCol < bufferLines[cursorLine].length) { cursorCol++; process.stdout.write(`\x1b[${5 + Math.min(cursorCol, boxWidth - 8)}G`); }
        else if (cursorLine < bufferLines.length - 1) { cursorLine++; cursorCol = 0; process.stdout.write('\x1b[1B\x1b[5G'); }
        return;
      }
      if (str === '\x1b[A' || str === '\x1bOA' || str === '\x10') { // Up / Ctrl+P
        if (cursorLine > 0) {
          cursorLine--;
          cursorCol = Math.min(cursorCol, bufferLines[cursorLine].length);
          process.stdout.write(`\x1b[1A\x1b[${5 + Math.min(cursorCol, boxWidth - 8)}G`);
          return;
        }
        if (_commandHistory.length > 0) {
          if (historyIdx === -1) savedDraft = bufferLines.join('\n');
          if (historyIdx < _commandHistory.length - 1) {
            historyIdx++;
            const histItem = _commandHistory[_commandHistory.length - 1 - historyIdx];
            bufferLines = histItem.split('\n');
            cursorLine = bufferLines.length - 1;
            cursorCol = bufferLines[cursorLine].length;
            redrawFrom(0);
          }
        }
        return;
      }
      if (str === '\x1b[B' || str === '\x1bOB' || str === '\x0e') { // Down / Ctrl+N
        if (cursorLine < bufferLines.length - 1) {
          cursorLine++;
          cursorCol = Math.min(cursorCol, bufferLines[cursorLine].length);
          process.stdout.write(`\x1b[1B\x1b[${5 + Math.min(cursorCol, boxWidth - 8)}G`);
          return;
        }
        if (historyIdx > 0) {
          historyIdx--;
          const histItem = _commandHistory[_commandHistory.length - 1 - historyIdx];
          bufferLines = histItem.split('\n');
          cursorLine = 0;
          cursorCol = bufferLines[0].length;
          redrawFrom(0);
        } else if (historyIdx === 0) {
          historyIdx = -1;
          bufferLines = savedDraft.split('\n');
          cursorLine = 0;
          cursorCol = bufferLines[0].length;
          redrawFrom(0);
        }
        return;
      }

      // PageUp (\x1b[5~) & PageDown (\x1b[6~)
      if (str === '\x1b[5~') {
        if (_commandHistory.length > 0) {
          if (historyIdx === -1) savedDraft = bufferLines.join('\n');
          historyIdx = _commandHistory.length - 1;
          bufferLines = _commandHistory[0].split('\n');
          cursorLine = 0;
          cursorCol = bufferLines[0].length;
          redrawFrom(0);
        }
        return;
      }
      if (str === '\x1b[6~') {
        if (historyIdx !== -1) {
          historyIdx = -1;
          bufferLines = savedDraft.split('\n');
          cursorLine = 0;
          cursorCol = bufferLines[0].length;
          redrawFrom(0);
        }
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
