import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';

export interface OpenCodePromptOptions {
  mode: 'build' | 'plan';
  model: string;
  provider?: string;
}

/**
 * Helper to compute display width in terminal cells,
 * taking into account ANSI escape codes, Unicode East Asian width, and emojis.
 */
function getDisplayWidth(str: string): number {
  const clean = str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  let len = 0;
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      len += 2;
      i++; // skip surrogate pair
    } else if (code > 0x2e80) {
      len += 2;
    } else {
      len += 1;
    }
  }
  return len;
}

function getSafeBoxWidth(): number {
  const termCols = process.stdout.columns || 80;
  // Leave a safe margin of 4 columns so Windows console auto-wrap is never triggered
  return Math.max(34, Math.min(termCols - 4, 82));
}

function renderTopBorder(width: number, isBuild: boolean, model: string, borderColor: (str: string) => string): string {
  const modeBadge = isBuild
    ? chalk.bgHex('#00C853').black.bold(' ⚡ BUILD ')
    : chalk.bgHex('#FFB300').black.bold(' 📋 PLAN ');
  const modeRaw = isBuild ? ' ⚡ BUILD ' : ' 📋 PLAN ';

  let escText = ' (Esc to cancel) ';
  if (width < 70) escText = ' (Esc) ';
  if (width < 54) escText = '';

  let modelDisplay = model;
  let availForModel = width - 12 - getDisplayWidth(modeRaw) - getDisplayWidth(escText);
  if (availForModel < 10) {
    escText = '';
    availForModel = width - 12 - getDisplayWidth(modeRaw);
  }
  if (getDisplayWidth(' 🤖 ' + modelDisplay + ' ') > availForModel) {
    const short = modelDisplay.includes('/') ? modelDisplay.split('/').pop() || modelDisplay : modelDisplay;
    const maxLen = Math.max(5, availForModel - 6);
    modelDisplay = short.slice(0, maxLen) + '…';
  }

  const modelBadge = chalk.bgHex('#1A237E').white.bold(` 🤖 ${modelDisplay} `);
  const modelRaw = ` 🤖 ${modelDisplay} `;

  const prefixColored = borderColor('╭─ ') + modeBadge + borderColor(' ─ ') + modelBadge;
  const prefixWidth = 3 + getDisplayWidth(modeRaw) + 3 + getDisplayWidth(modelRaw);
  const suffixColored = (escText ? chalk.gray(escText) : '') + borderColor('─╮');
  const suffixWidth = getDisplayWidth(escText) + 2;

  const dashesCount = Math.max(1, width - prefixWidth - suffixWidth);
  return prefixColored + borderColor('─'.repeat(dashesCount)) + suffixColored;
}

function renderBottomBorder(width: number, borderColor: (str: string) => string): string {
  let hintText = ' Enter: send • Shift+Enter: newline • @file • /help ';
  if (width < 68) hintText = ' Enter: send • Shift+Enter: newline • /help ';
  if (width < 52) hintText = ' Enter: send • Esc: cancel ';
  if (width < 40) hintText = ' Enter: send ';

  const prefixColored = borderColor('╰─');
  const prefixWidth = 2;
  const suffixColored = borderColor('─╯');
  const suffixWidth = 2;

  let hintWidth = getDisplayWidth(hintText);
  if (hintWidth > width - prefixWidth - suffixWidth) {
    hintText = ' Enter ';
    hintWidth = getDisplayWidth(hintText);
  }

  const dashesCount = Math.max(1, width - prefixWidth - hintWidth - suffixWidth);
  return prefixColored + chalk.dim(hintText) + borderColor('─'.repeat(dashesCount)) + suffixColored;
}

function renderContentLine(
  width: number,
  lineText: string,
  isFirst: boolean,
  isBuild: boolean,
  borderColor: (str: string) => string
): string {
  const promptArrow = isBuild ? chalk.hex('#00FF7F').bold('❯ ') : chalk.hex('#FFB300').bold('❯ ');
  const prefix = isFirst
    ? borderColor('│ ') + promptArrow
    : borderColor('│ ') + chalk.dim('  ↳ ');
  const prefixWidth = 4;
  const rightBorder = borderColor(' │');
  const rightWidth = 2;
  const textCapacity = Math.max(10, width - prefixWidth - rightWidth);

  // If text exceeds textCapacity, show the tail so typing is always visible
  let visibleText = lineText;
  if (lineText.length > textCapacity) {
    visibleText = lineText.slice(lineText.length - textCapacity);
  }

  const padding = Math.max(0, textCapacity - visibleText.length);
  return prefix + chalk.white(visibleText) + ' '.repeat(padding) + rightBorder;
}

/**
 * OpenCode & Antigravity Style Interactive Boxed Prompt
 * 
 * Features:
 * 1. Terminal Bottom Framed Box Widget (╭──╮, │  │, ╰──╯):
 *    Provides an elegant, dedicated input container at the downside of the CLI,
 *    displaying active Mode, selected Model badge, and shortcut hints.
 * 2. Zero Duplication / No Header Stacking:
 *    Renders frame with adaptive responsive width so borders NEVER wrap
 *    regardless of terminal size or split-pane width.
 *    Single-line typing updates in-place without re-rendering outer borders.
 * 3. Bracketed paste mode (\x1b[?2004h) + Burst paste protection:
 *    When pasting multi-line text, logs, or code, it captures the entire paste cleanly.
 * 4. Multi-line typing (Shift+Enter / Alt+Enter / Ctrl+J).
 * 5. Esc to clear / cancel, Enter to submit.
 */
export async function readOpenCodePrompt(options: OpenCodePromptOptions): Promise<string | null> {
  const isBuildMode = options.mode === 'build';
  const borderColor = isBuildMode ? chalk.hex('#00FF7F') : chalk.hex('#FFB300');

  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      // Fallback for non-TTY pipelines (e.g. CI or piped input)
      let nonTtyData = '';
      process.stdin.setEncoding('utf-8');
      const onData = (chunk: string) => {
        nonTtyData += chunk;
      };
      const onEnd = () => {
        process.stdin.removeListener('data', onData);
        process.stdin.removeListener('end', onEnd);
        resolve(nonTtyData.trim() || null);
      };
      process.stdin.on('data', onData);
      process.stdin.on('end', onEnd);
      return;
    }

    // Enable Bracketed Paste Mode in terminal
    process.stdout.write('\x1b[?2004h');

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
    let hasRendered = false;

    // Full Box Redraw (used on initial render, multiline expand, paste, or resize)
    const renderFullBox = () => {
      const boxWidth = getSafeBoxWidth();
      const top = renderTopBorder(boxWidth, isBuildMode, options.model, borderColor);
      const bottom = renderBottomBorder(boxWidth, borderColor);
      const contents = bufferLines.map((line, idx) =>
        renderContentLine(boxWidth, line, idx === 0, isBuildMode, borderColor)
      );

      if (hasRendered) {
        // Move cursor up to top border and clear down
        process.stdout.write(`\r\x1b[${1 + cursorLine}A\x1b[J`);
      } else {
        process.stdout.write('\n');
      }

      // Output complete framed box
      process.stdout.write([top, ...contents, bottom].join('\n') + '\n');
      hasRendered = true;

      // Position cursor at exact active typing position inside the box
      const linesUp = (bufferLines.length - cursorLine);
      const activeCol = (cursorLine === 0 ? 5 : 7) + Math.min(cursorCol, boxWidth - 8);
      process.stdout.write(`\x1b[${linesUp}A\x1b[${activeCol}G`);
    };

    // Fast In-Place Line Update (used for typing & backspacing within a single line)
    const updateActiveLineInPlace = () => {
      if (bufferLines.length > 1) {
        renderFullBox();
        return;
      }
      const boxWidth = getSafeBoxWidth();
      const lineStr = renderContentLine(boxWidth, bufferLines[0], true, isBuildMode, borderColor);
      const activeCol = 5 + Math.min(cursorCol, boxWidth - 8);
      process.stdout.write(`\r${lineStr}\r\x1b[${activeCol}G`);
    };

    // Initial render of empty box
    renderFullBox();

    const cleanup = () => {
      try {
        process.stdout.write('\x1b[?2004l');
      } catch {}

      process.stdin.removeListener('data', onData);
      process.stdout.removeListener('resize', onResize);

      try {
        if (!wasRaw) {
          process.stdin.setRawMode(false);
        }
        process.stdin.pause();
      } catch {}
    };

    const submit = () => {
      cleanup();
      // Move cursor cleanly below the box
      const downLines = (bufferLines.length - cursorLine);
      process.stdout.write(`\x1b[${downLines}B\r\n`);
      resolve(bufferLines.join('\n').trim());
    };

    const cancel = () => {
      cleanup();
      const downLines = (bufferLines.length - cursorLine);
      process.stdout.write(`\x1b[${downLines}B\r\n`);
      resolve(null);
    };

    const onResize = () => {
      renderFullBox();
    };
    process.stdout.on('resize', onResize);

    const handlePastedText = (pasted: string) => {
      const normalized = pasted.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const pastedLines = normalized.split('\n');

      if (pastedLines.length === 1) {
        const cur = bufferLines[cursorLine];
        bufferLines[cursorLine] = cur.slice(0, cursorCol) + pastedLines[0] + cur.slice(cursorCol);
        cursorCol += pastedLines[0].length;
        if (bufferLines.length === 1) {
          updateActiveLineInPlace();
        } else {
          renderFullBox();
        }
      } else {
        const cur = bufferLines[cursorLine];
        const before = cur.slice(0, cursorCol);
        const after = cur.slice(cursorCol);

        bufferLines[cursorLine] = before + pastedLines[0];
        const middle = pastedLines.slice(1, -1);
        const last = pastedLines[pastedLines.length - 1];

        bufferLines.splice(cursorLine + 1, 0, ...middle, last + after);
        cursorLine += pastedLines.length - 1;
        cursorCol = last.length;
        renderFullBox();
      }
    };

    const onData = (data: Buffer) => {
      const str = data.toString('utf-8');

      // 1. Bracketed paste handling
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
          const fullPasted = pasteBuffer;
          pasteBuffer = '';
          handlePastedText(fullPasted);
          return;
        } else {
          pasteBuffer += str;
          return;
        }
      }

      // 2. Burst paste detection
      if (str.length > 2 && (str.includes('\n') || str.includes('\r'))) {
        handlePastedText(str);
        return;
      }

      // 3. Ctrl+C
      if (str === '\x03') {
        cleanup();
        const downLines = (bufferLines.length - cursorLine);
        process.stdout.write(`\x1b[${downLines}B\r\n`);
        process.stdout.write(chalk.yellow('Exiting banglacli...\n'));
        process.exit(0);
      }

      // Ctrl+D
      if (str === '\x04') {
        if (bufferLines.join('').length === 0) {
          cancel();
          return;
        }
      }

      // Escape
      if (str === '\x1b') {
        if (bufferLines.join('').length > 0) {
          bufferLines = [''];
          cursorLine = 0;
          cursorCol = 0;
          updateActiveLineInPlace();
        } else {
          cancel();
        }
        return;
      }

      // Shift+Enter / Alt+Enter / Ctrl+J: Insert newline inside box
      if (str === '\x0a' || str === '\x1b\x0d' || str === '\x1b\r') {
        const cur = bufferLines[cursorLine];
        const before = cur.slice(0, cursorCol);
        const after = cur.slice(cursorCol);
        bufferLines[cursorLine] = before;
        bufferLines.splice(cursorLine + 1, 0, after);
        cursorLine++;
        cursorCol = 0;
        renderFullBox();
        return;
      }

      // Enter key: Submit
      if (str === '\r' || str === '\n' || str === '\r\n') {
        const fullContent = bufferLines.join('\n').trim();
        if (fullContent.length === 0) {
          return;
        }
        submit();
        return;
      }

      // Backspace
      if (str === '\x08' || str === '\x7f') {
        if (cursorCol > 0) {
          const cur = bufferLines[cursorLine];
          bufferLines[cursorLine] = cur.slice(0, cursorCol - 1) + cur.slice(cursorCol);
          cursorCol--;
          if (bufferLines.length === 1) {
            updateActiveLineInPlace();
          } else {
            renderFullBox();
          }
        } else if (cursorLine > 0) {
          const cur = bufferLines[cursorLine];
          const prev = bufferLines[cursorLine - 1];
          cursorCol = prev.length;
          bufferLines[cursorLine - 1] = prev + cur;
          bufferLines.splice(cursorLine, 1);
          cursorLine--;
          renderFullBox();
        }
        return;
      }

      // Arrow navigation
      if (str === '\x1b[D') {
        // Left arrow
        if (cursorCol > 0) {
          cursorCol--;
          if (bufferLines.length === 1) {
            updateActiveLineInPlace();
          } else {
            renderFullBox();
          }
        } else if (cursorLine > 0) {
          cursorLine--;
          cursorCol = bufferLines[cursorLine].length;
          renderFullBox();
        }
        return;
      }
      if (str === '\x1b[C') {
        // Right arrow
        if (cursorCol < bufferLines[cursorLine].length) {
          cursorCol++;
          if (bufferLines.length === 1) {
            updateActiveLineInPlace();
          } else {
            renderFullBox();
          }
        } else if (cursorLine < bufferLines.length - 1) {
          cursorLine++;
          cursorCol = 0;
          renderFullBox();
        }
        return;
      }
      if (str === '\x1b[A') {
        // Up arrow
        if (cursorLine > 0) {
          cursorLine--;
          cursorCol = Math.min(cursorCol, bufferLines[cursorLine].length);
          renderFullBox();
        }
        return;
      }
      if (str === '\x1b[B') {
        // Down arrow
        if (cursorLine < bufferLines.length - 1) {
          cursorLine++;
          cursorCol = Math.min(cursorCol, bufferLines[cursorLine].length);
          renderFullBox();
        }
        return;
      }

      // Ignore unhandled escape sequences
      if (str.startsWith('\x1b[')) {
        return;
      }

      // Printable single character
      if (str.length === 1 && str.charCodeAt(0) >= 32) {
        const cur = bufferLines[cursorLine];
        bufferLines[cursorLine] = cur.slice(0, cursorCol) + str + cur.slice(cursorCol);
        cursorCol++;
        if (bufferLines.length === 1) {
          updateActiveLineInPlace();
        } else {
          renderFullBox();
        }
        return;
      }

      // Multi-character text (e.g. fast typing or unicode)
      if (str.length > 0 && !str.includes('\x1b')) {
        const cur = bufferLines[cursorLine];
        bufferLines[cursorLine] = cur.slice(0, cursorCol) + str + cur.slice(cursorCol);
        cursorCol += str.length;
        if (bufferLines.length === 1) {
          updateActiveLineInPlace();
        } else {
          renderFullBox();
        }
        return;
      }
    };

    process.stdin.on('data', onData);
  });
}

/**
 * OpenCode @ File Reference & Web URL Ingestion
 * 
 * Detects file mentions like @src/agent.ts, directory mentions like @src/,
 * and web URLs like https://... or @https://...
 * Automatically ingests them into the agent's context.
 */
export async function expandOpenCodeMentions(rawPrompt: string): Promise<{
  expandedPrompt: string;
  attachedFiles: string[];
}> {
  const attachedFiles: string[] = [];
  const contexts: string[] = [];

  // 1. Web URL Auto-Ingestion (e.g. https://... or @https://...)
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
          'Accept': 'text/html,application/xhtml+xml,application/json,text/plain;q=0.9',
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
            snippet +
            '\n'
        );
        attachedFiles.push(`web:${targetUrl.slice(0, 45)}...`);
      }
    } catch {}
  }

  // 2. Workspace File / Directory Ingestion (@path)
  const fileRegex = /@([a-zA-Z0-9_\-\./\\]+)/g;
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
          const fileSize = stat.size;

          if (content.length > 60000) {
            content = content.slice(0, 60000) + '\n\n... [Content truncated to preserve context window] ...';
          }

          const ext = path.extname(resolvedPath).replace('.', '') || 'text';
          contexts.push(
            `\n--- [Attached Workspace File: @${rawPath} (${lineCount} lines, ${fileSize} bytes)] ---\n` +
              '```' +
              ext +
              '\n' +
              content +
              '\n```'
          );

          attachedFiles.push(`@${rawPath}`);
        } catch {}
      } else if (stat.isDirectory()) {
        try {
          const files = fs.readdirSync(resolvedPath).slice(0, 40);
          contexts.push(
            `\n--- [Attached Directory Listing: @${rawPath}/ (${files.length} items)] ---\n` +
              files.join('\n') +
              '\n'
          );
          attachedFiles.push(`@${rawPath}/`);
        } catch {}
      }
    }
  }

  if (attachedFiles.length > 0) {
    console.log(
      chalk.bgHex('#004D40').hex('#00FF7F').bold(' 📎 OpenCode Resource Ingestion: ') +
        chalk.white(` Attached ${attachedFiles.length} item(s): `) +
        chalk.cyan.bold(attachedFiles.join(', '))
    );
  }

  let finalPrompt = rawPrompt;
  if (contexts.length > 0) {
    finalPrompt += '\n\n' + contexts.join('\n');
  }

  return {
    expandedPrompt: finalPrompt,
    attachedFiles,
  };
}
