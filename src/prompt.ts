import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import Conf from 'conf';
import stringWidth from 'string-width';
import { getActiveMeshNode } from './tools.js';
import { isImageFile, loadImagePayload, type ImagePayload } from './image.js';

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

export function renderTopBorder(
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

  let availForModel = width - (4 + modeWidth + 4 + 1 + rightWidth + 3 + 1);
  if (availForModel < 8) {
    rightText = '';
    rightWidth = 0;
    availForModel = width - (4 + modeWidth + 4 + 1 + rightWidth + 3 + 1);
  }

  let modelDisplay = model;
  if (modelDisplay.includes('/')) {
    modelDisplay = modelDisplay.split('/').pop() || modelDisplay;
  }
  let modelText = ` 🤖 ${modelDisplay} `;
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

export function renderBottomBorder(
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

export function renderContentLine(
  width: number,
  lineText: string,
  isFirst: boolean,
  isBuild: boolean,
  borderColor: (s: string) => string
): string {
  const promptArrow = isFirst
    ? isBuild
      ? chalk.hex('#00FF7F').bold('❯ ')
      : chalk.hex('#FFB300').bold('❯ ')
    : chalk.dim('· ');
  const prefix = borderColor('│ ') + promptArrow;
  const prefixWidth = 4; // '│ ' (2) + '❯ ' (2)
  const suffix = borderColor(' │');
  const suffixWidth = 2; // ' │' (2)

  const textCapacity = Math.max(1, width - prefixWidth - suffixWidth);
  let visibleText = lineText;
  while (stringWidth(visibleText) > textCapacity && visibleText.length > 0) {
    visibleText = visibleText.slice(1);
  }

  const textWidth = stringWidth(visibleText);
  const paddingSpaces = Math.max(0, width - prefixWidth - suffixWidth - textWidth);

  return prefix + chalk.white(visibleText) + ' '.repeat(paddingSpaces) + suffix;
}

export function renderHintLine(
  width: number,
  hintText: string,
  borderColor: (s: string) => string
): string {
  const prefixWidth = 2; // '│ ' (2)
  const suffix = borderColor(' │');
  const suffixWidth = 2; // ' │' (2)

  const maxHintWidth = Math.max(1, width - prefixWidth - suffixWidth);
  let visibleHint = hintText;
  while (stringWidth(visibleHint) > maxHintWidth && visibleHint.length > 0) {
    visibleHint = visibleHint.slice(0, -1);
  }

  const hintWidth = stringWidth(visibleHint);
  const paddingSpaces = Math.max(0, width - prefixWidth - suffixWidth - hintWidth);

  return borderColor('│ ') + chalk.dim(visibleHint) + ' '.repeat(paddingSpaces) + suffix;
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
  if (!_dockedActive || !_dockedPromptActive || !process.stdout.rows || process.stdout.rows < 16) return;
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
let _dockedPromptActive = false;
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
 * Renders a clean divider inline without clearing the terminal or displacing history.
 */
export function prepareInteractiveArea(
  _provider?: string,
  _model?: string,
  _mode?: 'build' | 'plan'
): number {
  deactivateFixedDock();
  const cols = process.stdout.columns || 80;
  console.log('\n' + chalk.dim('─'.repeat(Math.min(cols, 80))));
  return 1;
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
 * Strips non-keystroke terminal control reports (FocusIn/Out, DSR, DA, SGR Mouse)
 * so they never drop typed commands or corrupt prompt buffers on startup.
 */
function stripTerminalControlNoise(raw: string): string {
  return raw
    .replace(/\x1b\[[IO]/g, '')
    .replace(/\x1b\[[0-9;]*R/g, '')
    .replace(/\x1b\[\?[0-9;]*c/g, '')
    .replace(/\x1b\[<[0-9;]*[Mm]/g, '');
}

let _interactiveSelectActive = false;

export function isInteractivePromptActive(): boolean {
  return _interactiveSelectActive;
}

export function isDockedPromptWaiting(): boolean {
  return _dockedPromptActive;
}

/**
 * Word-wraps plain text to fit within maxWidth visible columns without awkward mid-word slicing.
 */
function wrapHintLines(text: string, maxWidth: number): string[] {
  const limit = Math.max(20, maxWidth);
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const rows: string[] = [];
  let cur = '';
  for (const word of words) {
    const candidate = cur ? `${cur} ${word}` : word;
    if (stringWidth(candidate) <= limit) {
      cur = candidate;
    } else {
      if (cur) rows.push(cur);
      if (stringWidth(word) > limit) {
        rows.push(truncateWithAnsi(word, limit));
        cur = '';
      } else {
        cur = word;
      }
    }
  }
  if (cur) rows.push(cur);
  return rows;
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
    _interactiveSelectActive = true;
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
    const maxVisible = Math.max(3, Math.min(config.maxItems || 8, config.options.length, termRows - 10));
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
      const safeWidth = Math.max(40, termCols - 4);
      const lines: string[] = [];
      lines.push(truncateWithAnsi(chalk.cyan.bold('◆ ') + chalk.bold.white(config.message), safeWidth));

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

        const lineContent = isSelected
          ? `  ${bullet} ${numTag} ${chalk.white.bold(opt.label)}`
          : `  ${bullet} ${numTag} ${opt.label}`;

        lines.push(truncateWithAnsi(lineContent, safeWidth));

        if (isSelected && opt.hint) {
          const hintLines = wrapHintLines(opt.hint, safeWidth - 8);
          for (let h = 0; h < hintLines.length && h < 2; h++) {
            const pfx = h === 0 ? chalk.hex('#00E5FF')('     ↳ ') : '       ';
            lines.push(truncateWithAnsi(`${pfx}${chalk.dim(hintLines[h])}`, safeWidth));
          }
        }
      }

      let footerScroll = '';
      if (canScrollUp && canScrollDown) {
        footerScroll = chalk.dim(`  ↑ ... (${cursor + 1}/${config.options.length}) ... ↓`);
      } else if (canScrollUp) {
        footerScroll = chalk.dim(`  ↑ ... (${cursor + 1}/${config.options.length})`);
      } else if (canScrollDown) {
        footerScroll = chalk.dim(`  ↓ ... (${cursor + 1}/${config.options.length})`);
      }

      const keyHint = truncateWithAnsi(
        chalk.dim(
          `  ↑/↓ or 1-${Math.min(9, config.options.length)} to navigate • Enter: confirm • Esc: cancel`
        ),
        safeWidth
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
      _interactiveSelectActive = false;
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
      const str = stripTerminalControlNoise(buf.toString('utf-8'));
      if (!str) return;

      let idx = 0;
      let dirty = false;

      while (idx < str.length) {
        const rest = str.slice(idx);

        // Ctrl+C
        if (rest.startsWith('\x03')) {
          cleanup();
          process.stdout.write('\r\n' + chalk.yellow('Exiting banglacli...\n'));
          process.exit(0);
        }

        // Arrow / Nav / Enter escape sequences
        if (rest.startsWith('\x1b[A') || rest.startsWith('\x1bOA')) {
          cursor = (cursor - 1 + config.options.length) % config.options.length;
          idx += 3;
          dirty = true;
          continue;
        }
        if (rest.startsWith('\x1b[B') || rest.startsWith('\x1bOB')) {
          cursor = (cursor + 1) % config.options.length;
          idx += 3;
          dirty = true;
          continue;
        }
        if (rest.startsWith('\x1b[5~')) {
          cursor = Math.max(0, cursor - maxVisible);
          idx += 4;
          dirty = true;
          continue;
        }
        if (rest.startsWith('\x1b[6~')) {
          cursor = Math.min(config.options.length - 1, cursor + maxVisible);
          idx += 4;
          dirty = true;
          continue;
        }
        if (rest.startsWith('\x1b[H')) {
          cursor = 0;
          idx += 3;
          dirty = true;
          continue;
        }
        if (rest.startsWith('\x1b[1~')) {
          cursor = 0;
          idx += 4;
          dirty = true;
          continue;
        }
        if (rest.startsWith('\x1b[F')) {
          cursor = config.options.length - 1;
          idx += 3;
          dirty = true;
          continue;
        }
        if (rest.startsWith('\x1b[4~')) {
          cursor = config.options.length - 1;
          idx += 4;
          dirty = true;
          continue;
        }
        if (rest.startsWith('\x1bOM')) {
          confirm();
          return;
        }
        if (rest.startsWith('\x1b[13~')) {
          confirm();
          return;
        }

        const ch = str[idx];

        // Lone Escape or 'q'/'Q'
        if (ch === '\x1b' && idx === str.length - 1) {
          cancel();
          return;
        }
        if (ch === '\x1b') {
          // Unknown ANSI sequence chunk: consume CSI sequence cleanly
          const csiMatch = rest.match(/^\x1b\[[0-9;]*[a-zA-Z~]/);
          if (csiMatch) {
            idx += csiMatch[0].length;
            continue;
          }
          cancel();
          return;
        }

        if (ch === 'q' || ch === 'Q') {
          cancel();
          return;
        }

        if (ch === '\r' || ch === '\n') {
          confirm();
          return;
        }

        if (ch === 'k' || ch === 'K' || ch === 'w' || ch === 'W') {
          cursor = (cursor - 1 + config.options.length) % config.options.length;
          idx += 1;
          dirty = true;
          continue;
        }

        if (ch === 'j' || ch === 'J' || ch === 's' || ch === 'S') {
          cursor = (cursor + 1) % config.options.length;
          idx += 1;
          dirty = true;
          continue;
        }

        if (/^[0-9]$/.test(ch)) {
          numBuffer += ch;
          const target = parseInt(numBuffer, 10);
          if (target >= 1 && target <= config.options.length) {
            cursor = target - 1;
            dirty = true;
          }
          if (numTimeout) clearTimeout(numTimeout);
          numTimeout = setTimeout(() => {
            numBuffer = '';
          }, 700);
          idx += 1;
          continue;
        }

        idx += 1;
      }

      if (dirty) {
        draw();
      }
    };

    process.stdout.on('resize', onResize);
    process.stdin.on('data', onData);
    draw();
  });
}

export interface InteractiveInputConfig {
  message: string;
  initialValue?: string;
  placeholder?: string;
  mask?: boolean;
  validate?: (value: string) => string | undefined;
}

/**
 * Resilient single-line / masked input prompt matching interactiveSelect visual style.
 * Supports Windows Terminal / VS Code paste (bracketed & multi-char), Esc cancel, and non-TTY piping.
 */
export async function interactiveInput(config: InteractiveInputConfig): Promise<string | null> {
  if (!process.stdin.isTTY) {
    const line = await nextNonTtyLine();
    if (line === null) {
      return config.initialValue ?? null;
    }
    const trimmed = line.trim();
    if (!trimmed && config.initialValue) return config.initialValue;
    return trimmed;
  }

  return new Promise((resolve) => {
    _interactiveSelectActive = true;
    let value = config.initialValue || '';
    let cursorPos = value.length;
    let errorMsg = '';
    let inBracketedPaste = false;
    let pasteBuf = '';
    let lastLines = 0;

    const wasRaw = process.stdin.isRaw;
    try {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdout.write('\x1b[?2004h');
    } catch {}

    const drawClean = () => {
      const termCols = process.stdout.columns || 80;
      const safeWidth = Math.max(36, termCols - 6);
      const lines: string[] = [];
      lines.push(truncateWithAnsi(chalk.cyan.bold('◆ ') + chalk.bold.white(config.message), safeWidth));

      const rawDisplay = config.mask ? '•'.repeat(value.length) : value;
      let visible = rawDisplay;
      let visibleCursor = cursorPos;
      if (stringWidth(rawDisplay) > safeWidth - 6) {
        const sliceStart = Math.max(0, rawDisplay.length - (safeWidth - 8));
        visible = '…' + rawDisplay.slice(sliceStart);
        visibleCursor = Math.max(1, cursorPos - sliceStart + 1);
      }

      const shown =
        value.length === 0 && config.placeholder
          ? chalk.dim(truncateWithAnsi(config.placeholder, safeWidth - 6))
          : chalk.white(visible);
      lines.push(`  ${chalk.hex('#00FF7F').bold('❯')} ${shown}`);

      if (errorMsg) {
        lines.push(chalk.red(`  ✖ ${truncateWithAnsi(errorMsg, safeWidth - 6)}`));
      } else {
        lines.push(chalk.dim('  Enter: confirm • Esc: cancel'));
      }

      if (lastLines > 0) {
        // Cursor is parked on row 1 (input line), one row below title row 0.
        process.stdout.write('\x1b[1A\r\x1b[J');
      }
      process.stdout.write(lines.join('\n') + '\n');
      lastLines = lines.length;

      const rowsUp = lastLines - 1;
      const col = Math.min(termCols - 2, 5 + (value.length === 0 ? 0 : visibleCursor));
      process.stdout.write(`\x1b[${rowsUp}A\x1b[${col}G\x1b[?25h`);
    };

    const cleanup = () => {
      _interactiveSelectActive = false;
      try { process.stdout.write('\x1b[?2004l'); } catch {}
      process.stdin.removeListener('data', onData);
      try {
        if (!wasRaw && process.stdin.isTTY) process.stdin.setRawMode(false);
      } catch {}
    };

    const finishClear = () => {
      if (lastLines > 0) {
        // Currently parked at input row (row 1 of block). Move up 1 row to top of block and clear down.
        process.stdout.write('\x1b[1A\r\x1b[J');
      }
    };

    const confirm = () => {
      if (config.validate) {
        const err = config.validate(value);
        if (err) {
          errorMsg = err;
          drawClean();
          return;
        }
      }
      cleanup();
      finishClear();
      const shownDone = config.mask ? chalk.dim('••••••••') : chalk.hex('#00FF7F').bold(value || '(empty)');
      process.stdout.write(
        chalk.hex('#00FF7F')('✔ ') + chalk.bold(config.message) + ' ' + shownDone + '\n\n'
      );
      resolve(value);
    };

    const cancel = () => {
      cleanup();
      finishClear();
      process.stdout.write(chalk.gray('✖ ') + chalk.dim(`${config.message} (cancelled)\n\n`));
      resolve(null);
    };

    const insertText = (chunk: string) => {
      const cleaned = chunk.replace(/[\r\n]+/g, '');
      if (!cleaned) return;
      errorMsg = '';
      value = value.slice(0, cursorPos) + cleaned + value.slice(cursorPos);
      cursorPos += cleaned.length;
    };

    const onData = (buf: Buffer) => {
      let str = stripTerminalControlNoise(buf.toString('utf-8'));
      if (!str) return;

      if (str.includes('\x1b[200~')) {
        inBracketedPaste = true;
        const afterStart = str.split('\x1b[200~')[1] || '';
        if (afterStart.includes('\x1b[201~')) {
          const endIdx = afterStart.indexOf('\x1b[201~');
          const pasted = afterStart.slice(0, endIdx);
          const trailing = afterStart.slice(endIdx + '\x1b[201~'.length);
          inBracketedPaste = false;
          if (pasted) insertText(pasted);
          if (!trailing) {
            drawClean();
            return;
          }
          str = trailing;
        } else {
          pasteBuf += afterStart;
          return;
        }
      }
      if (inBracketedPaste) {
        if (str.includes('\x1b[201~')) {
          const endIdx = str.indexOf('\x1b[201~');
          const beforeEnd = str.slice(0, endIdx);
          const trailing = str.slice(endIdx + '\x1b[201~'.length);
          pasteBuf += beforeEnd;
          inBracketedPaste = false;
          const full = pasteBuf;
          pasteBuf = '';
          if (full) insertText(full);
          if (!trailing) {
            drawClean();
            return;
          }
          str = trailing;
        } else {
          pasteBuf += str;
          return;
        }
      }

      if (str === '\x03') {
        cleanup();
        process.stdout.write('\r\n' + chalk.yellow('Exiting banglacli...\n'));
        process.exit(0);
      }

      // Fast multi-char paste ending with Enter
      if (str.length > 1 && /[\r\n]$/.test(str) && !str.includes('\x1b')) {
        const body = str.replace(/[\r\n]+$/, '');
        if (body) insertText(body);
        confirm();
        return;
      }

      if (str === '\x1b') {
        cancel();
        return;
      }

      if (str === '\r' || str === '\n' || str === '\r\n' || str === '\x1bOM' || str === '\x1b[13~') {
        confirm();
        return;
      }

      if (str === '\x15') {
        // Ctrl+U clear line
        value = '';
        cursorPos = 0;
        errorMsg = '';
        drawClean();
        return;
      }

      if (str === '\x08' || str === '\x7f') {
        if (cursorPos > 0) {
          value = value.slice(0, cursorPos - 1) + value.slice(cursorPos);
          cursorPos--;
          errorMsg = '';
          drawClean();
        }
        return;
      }

      if (str === '\x1b[D' || str === '\x1bOD') {
        if (cursorPos > 0) {
          cursorPos--;
          drawClean();
        }
        return;
      }
      if (str === '\x1b[C' || str === '\x1bOC') {
        if (cursorPos < value.length) {
          cursorPos++;
          drawClean();
        }
        return;
      }
      if (str === '\x1b[H' || str === '\x1b[1~') {
        cursorPos = 0;
        drawClean();
        return;
      }
      if (str === '\x1b[F' || str === '\x1b[4~') {
        cursorPos = value.length;
        drawClean();
        return;
      }
      if (str === '\x1b[3~') {
        if (cursorPos < value.length) {
          value = value.slice(0, cursorPos) + value.slice(cursorPos + 1);
          errorMsg = '';
          drawClean();
        }
        return;
      }

      if (str.startsWith('\x1b[')) return;

      const printable = str.replace(/[\x00-\x1f\x7f]/g, '');
      if (printable.length > 0) {
        insertText(printable);
        drawClean();
      }
    };

    // Initial draw without previous-line cursor rollback
    const termCols = process.stdout.columns || 80;
    const safeWidth = Math.max(36, termCols - 6);
    const initLines = [
      truncateWithAnsi(chalk.cyan.bold('◆ ') + chalk.bold.white(config.message), safeWidth),
      `  ${chalk.hex('#00FF7F').bold('❯')} ${
        value.length === 0 && config.placeholder
          ? chalk.dim(truncateWithAnsi(config.placeholder, safeWidth - 6))
          : chalk.white(config.mask ? '•'.repeat(value.length) : value)
      }`,
      chalk.dim('  Enter: confirm • Esc: cancel'),
    ];
    process.stdout.write(initLines.join('\n') + '\n');
    lastLines = initLines.length;
    const initCol = Math.min(termCols - 2, 5 + (value.length === 0 ? 0 : cursorPos));
    process.stdout.write(`\x1b[${lastLines - 1}A\x1b[${initCol}G\x1b[?25h`);

    process.stdin.on('data', onData);
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
 * Fixed dock is disabled in favor of clean inline boxed prompt.
 * Keeps standard terminal scrollback intact without pinned headers or buffer displacement.
 */
export function activateFixedDock(
  provider: string,
  model: string,
  mode: 'build' | 'plan'
): boolean {
  _dockedActive = false;
  _dockedProvider = provider;
  _dockedModel = model;
  _dockedMode = mode;
  return false;
}

export function updateDockedModel(
  provider: string,
  model: string,
  mode: 'build' | 'plan'
): void {
  _dockedProvider = provider;
  _dockedModel = model;
  _dockedMode = mode;
}

export function deactivateFixedDock(): void {
  _dockedActive = false;
  _dockedPromptActive = false;
  try {
    process.stdout.write('\x1b[r\x1b[?25h');
  } catch {}
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
  return readInlinePrompt(options);
}

async function _legacyDockedPrompt(options: OpenCodePromptOptions): Promise<string | null> {
  const isBuildMode = options.mode === 'build';
  const borderColor = isBuildMode ? chalk.hex('#00FF7F') : chalk.hex('#FFB300');

  return new Promise((resolve) => {
    const rows = process.stdout.rows!;
    const cols = process.stdout.columns!;
    const boxWidth = getSafeBoxWidth(cols);
    const { boxRows, contentRow, hintRow } = getDockedRows(rows);
    const startCol = 5;
    _dockedPromptActive = true;

    writeDockedBox(rows, cols, options.model, options.mode);

    const scrollBottom = rows - boxRows;
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
      _dockedPromptActive = false;
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

      // Clear docked input box cleanly so agent/command output never overlaps bottom borders
      process.stdout.write(`\x1b[${scrollBottom};1H\x1b[J`);

      // Print prompt into scrolling workspace above output
      const promptArrow = isBuildMode
        ? chalk.hex('#00FF7F').bold('❯ ')
        : chalk.hex('#FFB300').bold('❯ ');

      for (let i = 0; i < bufferLines.length; i++) {
        const pfx = i === 0 ? promptArrow : chalk.dim('· ');
        process.stdout.write(`${pfx}${chalk.white.bold(bufferLines[i])}\r\n`);
      }
      process.stdout.write('\x1b[?25h');
      resolve(fullContent);
    };

    const cancel = () => {
      // Escape clears the prompt buffer without quitting banglacli
      bufferLines = [''];
      cursorLine = 0;
      cursorCol = 0;
      updateActiveLine();
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
      let str = stripTerminalControlNoise(data.toString('utf-8'));
      if (!str) return;

      if (str.includes('\x1b[200~')) {
        inBracketedPaste = true;
        const afterStart = str.split('\x1b[200~')[1] || '';
        if (afterStart.includes('\x1b[201~')) {
          const endIdx = afterStart.indexOf('\x1b[201~');
          const pastedContent = afterStart.slice(0, endIdx);
          const trailing = afterStart.slice(endIdx + '\x1b[201~'.length);
          inBracketedPaste = false;
          if (pastedContent) handlePastedText(pastedContent);
          if (!trailing) return;
          str = trailing;
        } else {
          pasteBuffer += afterStart;
          return;
        }
      }
      if (inBracketedPaste) {
        if (str.includes('\x1b[201~')) {
          const endIdx = str.indexOf('\x1b[201~');
          const beforeEnd = str.slice(0, endIdx);
          const trailing = str.slice(endIdx + '\x1b[201~'.length);
          pasteBuffer += beforeEnd;
          inBracketedPaste = false;
          const full = pasteBuffer;
          pasteBuffer = '';
          if (full) handlePastedText(full);
          if (!trailing) return;
          str = trailing;
        } else {
          pasteBuffer += str;
          return;
        }
      }

      // Handle fast-typed coalesced chunk ending in Enter vs genuine multiline paste
      if (str.length > 2 && (str.includes('\n') || str.includes('\r')) && !str.includes('\x1b')) {
        const endsWithEnter = /[\r\n]$/.test(str);
        const body = str.replace(/[\r\n]+$/, '');
        if (endsWithEnter && !body.includes('\r') && !body.includes('\n')) {
          if (body.length > 0) {
            handlePastedText(body);
          }
          if (bufferLines.join('\n').trim().length > 0) {
            submit();
          }
          return;
        }
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
        process.stdout.write(`\x1b[${scrollBottom};1H\x1b[J`);
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

      // Escape: clear input (never abruptly kill the CLI)
      if (str === '\x1b') {
        cancel();
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
      if (str === '\r' || str === '\n' || str === '\r\n' || str === '\x1bOM' || str === '\x1b[13~') {
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
const _nonTtyLineQueue: string[] = [];
let _nonTtyBuffer = '';
let _nonTtyReaderInitialized = false;
let _nonTtyEnded = false;
let _nonTtyWaiters: Array<(line: string | null) => void> = [];

function nextNonTtyLine(): Promise<string | null> {
  if (_nonTtyLineQueue.length > 0) {
    return Promise.resolve(_nonTtyLineQueue.shift()!);
  }
  if (_nonTtyEnded || process.stdin.readableEnded) {
    return Promise.resolve(null);
  }
  if (!_nonTtyReaderInitialized) {
    _nonTtyReaderInitialized = true;
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk: string) => {
      _nonTtyBuffer += chunk.replace(/\r\n/g, '\n');
      let nlIdx = _nonTtyBuffer.indexOf('\n');
      while (nlIdx !== -1) {
        const line = _nonTtyBuffer.slice(0, nlIdx);
        _nonTtyBuffer = _nonTtyBuffer.slice(nlIdx + 1);
        const waiter = _nonTtyWaiters.shift();
        if (waiter) {
          waiter(line);
        } else {
          _nonTtyLineQueue.push(line);
        }
        nlIdx = _nonTtyBuffer.indexOf('\n');
      }
    });
    process.stdin.on('end', () => {
      _nonTtyEnded = true;
      if (_nonTtyBuffer.trim().length > 0) {
        const rem = _nonTtyBuffer;
        _nonTtyBuffer = '';
        const waiter = _nonTtyWaiters.shift();
        if (waiter) waiter(rem);
        else _nonTtyLineQueue.push(rem);
      }
      while (_nonTtyWaiters.length > 0) {
        _nonTtyWaiters.shift()!(null);
      }
    });
    process.stdin.resume();
  }
  return new Promise((resolve) => {
    _nonTtyWaiters.push(resolve);
  });
}

async function readInlinePrompt(options: OpenCodePromptOptions): Promise<string | null> {
  const isBuildMode = options.mode === 'build';
  const borderColor = isBuildMode ? chalk.hex('#00FF7F') : chalk.hex('#FFB300');

  if (!process.stdin.isTTY) {
    while (true) {
      const line = await nextNonTtyLine();
      if (line === null) return null;
      if (line.trim().length > 0) return line.trim();
    }
  }

  return new Promise((resolve) => {

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
    const hintText = '· Shift+Enter: newline • /help for commands • ↑/↓: history';

    process.stdout.write(renderTopBorder(boxWidth, isBuildMode, options.model, borderColor) + '\n');
    process.stdout.write(renderContentLine(boxWidth, '', true, isBuildMode, borderColor) + '\n');
    process.stdout.write(renderHintLine(boxWidth, hintText, borderColor) + '\n');
    process.stdout.write(renderBottomBorder(boxWidth, borderColor));
    process.stdout.write('\x1b[2A\x1b[5G');

    const updateActiveLine = () => {
      const lineStr = renderContentLine(
        boxWidth, bufferLines[cursorLine], cursorLine === 0, isBuildMode, borderColor
      );
      const activeCol = 5 + Math.min(cursorCol, boxWidth - 8);
      process.stdout.write(`\r${lineStr}\r\x1b[${activeCol}G`);
    };

    const redrawFrom = (startLine: number) => {
      if (cursorLine > startLine) {
        process.stdout.write(`\x1b[${cursorLine - startLine}A`);
      }
      const lines: string[] = [];
      for (let i = startLine; i < bufferLines.length; i++) {
        lines.push(renderContentLine(boxWidth, bufferLines[i], i === 0, isBuildMode, borderColor));
      }
      lines.push(renderHintLine(boxWidth, hintText, borderColor));
      lines.push(renderBottomBorder(boxWidth, borderColor));
      process.stdout.write('\r\x1b[J');
      process.stdout.write(lines.join('\n'));
      const linesUp = (lines.length - 1) - (cursorLine - startLine);
      const activeCol = 5 + Math.min(cursorCol, boxWidth - 8);
      process.stdout.write(`\x1b[${linesUp}A\r\x1b[${activeCol}G`);
    };

    const cleanup = () => {
      _dockedPromptActive = false;
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

      // Move cursor up to top border and cleanly clear the box
      const linesUpToTop = cursorLine + 1;
      process.stdout.write(`\x1b[${linesUpToTop}A\r\x1b[J`);

      const promptArrow = isBuildMode
        ? chalk.hex('#00FF7F').bold('❯ ')
        : chalk.hex('#FFB300').bold('❯ ');

      const submittedLines = fullContent.split('\n');
      for (let i = 0; i < submittedLines.length; i++) {
        const pfx = i === 0 ? promptArrow : chalk.dim('· ');
        process.stdout.write(`${pfx}${chalk.white.bold(submittedLines[i])}\r\n`);
      }
      process.stdout.write('\r\n');
      resolve(fullContent);
    };

    const cancel = () => {
      if (cursorLine > 0) process.stdout.write(`\x1b[${cursorLine}A`);
      bufferLines = [''];
      cursorLine = 0;
      cursorCol = 0;
      redrawFrom(0);
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
      let str = stripTerminalControlNoise(data.toString('utf-8'));
      if (!str) return;

      if (str.includes('\x1b[200~')) {
        inBracketedPaste = true;
        const afterStart = str.split('\x1b[200~')[1] || '';
        if (afterStart.includes('\x1b[201~')) {
          const endIdx = afterStart.indexOf('\x1b[201~');
          const pastedContent = afterStart.slice(0, endIdx);
          const trailing = afterStart.slice(endIdx + '\x1b[201~'.length);
          inBracketedPaste = false;
          if (pastedContent) handlePastedText(pastedContent);
          if (!trailing) return;
          str = trailing;
        } else { pasteBuffer += afterStart; return; }
      }
      if (inBracketedPaste) {
        if (str.includes('\x1b[201~')) {
          const endIdx = str.indexOf('\x1b[201~');
          const beforeEnd = str.slice(0, endIdx);
          const trailing = str.slice(endIdx + '\x1b[201~'.length);
          pasteBuffer += beforeEnd;
          inBracketedPaste = false;
          const full = pasteBuffer; pasteBuffer = '';
          if (full) handlePastedText(full);
          if (!trailing) return;
          str = trailing;
        } else { pasteBuffer += str; return; }
      }

      if (str.length > 2 && (str.includes('\n') || str.includes('\r')) && !str.includes('\x1b')) {
        const endsWithEnter = /[\r\n]$/.test(str);
        const body = str.replace(/[\r\n]+$/, '');
        if (endsWithEnter && !body.includes('\r') && !body.includes('\n')) {
          if (body.length > 0) handlePastedText(body);
          if (bufferLines.join('\n').trim().length > 0) submit();
          return;
        }
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
        const linesUpToTop = cursorLine + 1;
        process.stdout.write(`\x1b[${linesUpToTop}A\r\x1b[J`);
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
        cancel();
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

      if (str === '\r' || str === '\n' || str === '\r\n' || str === '\x1bOM' || str === '\x1b[13~') {
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
  return readInlinePrompt(options);
}

// ─────────────────────────────────────────────────────────────────────────────
// expandOpenCodeMentions: @file, images, and URL auto-ingestion
// ─────────────────────────────────────────────────────────────────────────────
export async function expandOpenCodeMentions(rawPrompt: string): Promise<{
  expandedPrompt: string;
  attachedFiles: string[];
  attachedImages: ImagePayload[];
}> {
  const attachedFiles: string[] = [];
  const attachedImages: ImagePayload[] = [];
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
        if (isImageFile(resolvedPath)) {
          const imgPayload = loadImagePayload(resolvedPath);
          if (imgPayload) {
            attachedImages.push(imgPayload);
            attachedFiles.push(`🖼️ @${rawPath}`);
            contexts.push(
              `\n--- [Attached Image: @${rawPath} (${(imgPayload.size / 1024).toFixed(1)} KB, ${imgPayload.mimeType})] ---`
            );
          }
        } else {
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
        }
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

  // Also auto-detect drag-and-dropped image files or direct image paths without @
  const rawImageRegex = /(?:^|\s)["']?([a-zA-Z]:[\\/][^\r\n"']+\.(?:png|jpg|jpeg|webp|gif|bmp)|(?:\.{1,2}[\\/]|[a-zA-Z0-9_\-]+[\\/])[^\r\n"']+\.(?:png|jpg|jpeg|webp|gif|bmp))["']?(?=\s|$)/gi;
  const rawImageMatches = Array.from(rawPrompt.matchAll(rawImageRegex));
  for (const m of rawImageMatches) {
    const rawPath = m[1].replace(/["']/g, '').trim();
    const resolvedPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
    if (fs.existsSync(resolvedPath) && !attachedImages.some(img => img.path === resolvedPath)) {
      const payload = loadImagePayload(resolvedPath);
      if (payload) {
        attachedImages.push(payload);
        const name = path.basename(resolvedPath);
        attachedFiles.push(`🖼️ ${name}`);
        contexts.push(
          `\n--- [Attached Image: ${name} (${(payload.size / 1024).toFixed(1)} KB, ${payload.mimeType})] ---`
        );
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
    attachedImages,
  };
}
