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
  // Responsive box width: scales gracefully between 42 and 94 columns
  return Math.max(42, Math.min(termCols - 4, 94));
}

function renderTopBorder(width: number, isBuild: boolean, model: string, borderColor: (str: string) => string): string {
  const modeText = isBuild ? ' ⚡ BUILD ' : ' 📋 PLAN ';
  const modeBadge = isBuild
    ? chalk.bgHex('#00C853').black.bold(modeText)
    : chalk.bgHex('#FFB300').black.bold(modeText);
  const modeWidth = getDisplayWidth(modeText);

  let rightText = ' (Tab: model • Esc: clear) ';
  if (width < 76) rightText = ' (Tab: model) ';
  if (width < 56) rightText = '';
  const rightWidth = getDisplayWidth(rightText);

  let modelDisplay = model;
  let availForModel = width - 12 - modeWidth - rightWidth;
  if (availForModel < 10) {
    rightText = '';
    availForModel = width - 12 - modeWidth;
  }
  if (getDisplayWidth(' 🤖 ' + modelDisplay + ' ') > availForModel) {
    const short = modelDisplay.includes('/') ? modelDisplay.split('/').pop() || modelDisplay : modelDisplay;
    const maxLen = Math.max(5, availForModel - 6);
    modelDisplay = short.slice(0, maxLen) + '…';
  }

  const modelText = ` 🤖 ${modelDisplay} `;
  const modelBadge = chalk.bgHex('#1A237E').white.bold(modelText);
  const modelWidth = getDisplayWidth(modelText);

  // Balanced top line: ╭── [MODE] ── [MODEL] ─────── (Tab: model) ──╮
  const leftPrefix = borderColor('╭── ') + modeBadge + borderColor(' ── ') + modelBadge + borderColor(' ');
  const leftWidth = 4 + modeWidth + 4 + modelWidth + 1;
  const rightSuffix = (rightText ? chalk.dim(rightText) : '') + borderColor('──╮');
  const rightTotalWidth = rightWidth + 3;

  const dashesCount = Math.max(1, width - leftWidth - rightTotalWidth);
  return leftPrefix + borderColor('─'.repeat(dashesCount)) + rightSuffix;
}

function renderBottomBorder(width: number, borderColor: (str: string) => string): string {
  let hintText = ' Enter: send • Tab: switch model • Shift+Enter: newline • /help ';
  if (width < 82) hintText = ' Enter: send • Tab: model • Shift+Enter: newline • /help ';
  if (width < 70) hintText = ' Enter: send • Tab: model • /help ';
  if (width < 54) hintText = ' Enter: send • Tab: model ';
  if (width < 44) hintText = ' Enter: send ';

  const prefixColored = borderColor('╰── ');
  const prefixWidth = 4;
  const suffixColored = borderColor('──╯');
  const suffixWidth = 3;

  let hintWidth = getDisplayWidth(hintText);
  if (hintWidth > width - prefixWidth - suffixWidth - 2) {
    hintText = ' Enter ';
    hintWidth = getDisplayWidth(hintText);
  }

  const dashesCount = Math.max(1, width - prefixWidth - hintWidth - suffixWidth);
  return prefixColored + chalk.gray(hintText) + borderColor('─'.repeat(dashesCount)) + suffixColored;
}

function renderContentLine(
  width: number,
  lineText: string,
  isFirst: boolean,
  isBuild: boolean,
  borderColor: (str: string) => string
): string {
  const promptArrow = isBuild ? chalk.hex('#00FF7F').bold('❯ ') : chalk.hex('#FFB300').bold('❯ ');
  // Both line 0 ('│ ❯ ') and continuation lines ('│ · ') have identical display width of 4 cells
  const prefix = isFirst
    ? borderColor('│ ') + promptArrow
    : borderColor('│ ') + chalk.dim('· ');
  const prefixWidth = 4;
  const rightBorder = borderColor(' │');
  const rightWidth = 2;
  const textCapacity = Math.max(10, width - prefixWidth - rightWidth);

  // Fit text within capacity using display width so emojis or wide chars never break borders
  let visibleText = lineText;
  let textWidth = getDisplayWidth(visibleText);
  if (textWidth > textCapacity) {
    while (visibleText.length > 0 && getDisplayWidth(visibleText) > textCapacity) {
      visibleText = visibleText.slice(1);
    }
    textWidth = getDisplayWidth(visibleText);
  }

  const padding = Math.max(0, textCapacity - textWidth);
  return prefix + chalk.white(visibleText) + ' '.repeat(padding) + rightBorder;
}

/**
 * OpenCode & Antigravity Style Interactive Boxed Prompt
 * 
 * Architecture:
 * 1. Single Top Border Render:
 *    The top border (╭── ⚡ BUILD ── 🤖 model ──╮) is rendered and printed EXACTLY ONCE
 *    at prompt startup. It is NEVER redrawn or cleared during keystrokes or pastes.
 *    This completely eliminates any header duplication or vertical stacking.
 * 2. In-Place Active Line Updates:
 *    Typing and backspacing on the active input line updates in-place (\r│ ❯ <text> │),
 *    never touching or moving above the top border.
 * 3. Safe Multi-Line & Paste Expansion:
 *    When multi-line text is pasted or inserted (Shift+Enter), the new lines stream
 *    downward and the bottom border (╰── hints ──╯) is drawn cleanly underneath.
 * 4. Bracketed Paste & Burst Paste Safety:
 *    Captures pasted code / terminal logs safely without premature execution.
 * 5. Strictly Bounded Width:
 *    Guaranteed <= (termCols - 4) with Unicode/emoji-aware cell width calculation,
 *    preventing any auto-wrap margin bugs on Windows terminals.
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
    try {
      process.stdout.write('\x1b[?2004h');
    } catch {}

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

    // 1. Print the top border ONCE
    const top = renderTopBorder(boxWidth, isBuildMode, options.model, borderColor);
    process.stdout.write(top + '\n');

    // 2. Print initial empty content line and bottom border
    const line0 = renderContentLine(boxWidth, '', true, isBuildMode, borderColor);
    const bottom = renderBottomBorder(boxWidth, borderColor);
    process.stdout.write(line0 + '\n');
    process.stdout.write(bottom);

    // Place cursor on line 0 at column 5 (directly after "│ ❯ ")
    process.stdout.write('\x1b[1A\x1b[5G');

    // Update active line in-place without touching any other line
    const updateActiveLineInPlace = () => {
      const curWidth = getSafeBoxWidth();
      const lineStr = renderContentLine(
        curWidth,
        bufferLines[cursorLine],
        cursorLine === 0,
        isBuildMode,
        borderColor
      );
      const activeCol = 5 + Math.min(cursorCol, curWidth - 8);
      process.stdout.write(`\r${lineStr}\r\x1b[${activeCol}G`);
    };

    // Redraw content lines and bottom border from startLine down
    const redrawContentFrom = (startLine: number) => {
      const curWidth = getSafeBoxWidth();
      const linesToDraw: string[] = [];

      for (let i = startLine; i < bufferLines.length; i++) {
        linesToDraw.push(
          renderContentLine(curWidth, bufferLines[i], i === 0, isBuildMode, borderColor)
        );
      }
      linesToDraw.push(renderBottomBorder(curWidth, borderColor));

      // Overwrite from startLine down and clear any leftovers
      process.stdout.write('\r\x1b[J');
      process.stdout.write(linesToDraw.join('\n'));

      // Move cursor back up from bottom border to cursorLine
      const linesUpFromBottom = (bufferLines.length - cursorLine);
      const activeCol = 5 + Math.min(cursorCol, curWidth - 8);
      process.stdout.write(`\x1b[${linesUpFromBottom}A\x1b[${activeCol}G`);
    };

    const cleanup = () => {
      try {
        process.stdout.write('\x1b[?2004l');
      } catch {}

      process.stdin.removeListener('data', onData);

      try {
        if (!wasRaw) {
          process.stdin.setRawMode(false);
        }
        process.stdin.pause();
      } catch {}
    };

    const submit = () => {
      cleanup();
      // Move cursor down past bottom border
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

    const handlePastedText = (pasted: string) => {
      const normalized = pasted.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const pastedLines = normalized.split('\n');

      if (pastedLines.length === 1) {
        const cur = bufferLines[cursorLine];
        bufferLines[cursorLine] = cur.slice(0, cursorCol) + pastedLines[0] + cur.slice(cursorCol);
        cursorCol += pastedLines[0].length;
        updateActiveLineInPlace();
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

        // Redraw from the line that was modified down to bottom border
        redrawContentFrom(prevLine);
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

      // Tab key or F2: Instant Model Selector Switcher
      if (str === '\t' || str === '\x09' || str === '\x1bOQ' || str === '\x1b[12~') {
        cleanup();
        const downLines = (bufferLines.length - cursorLine);
        process.stdout.write(`\x1b[${downLines}B\r\n`);
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

      // Escape
      if (str === '\x1b') {
        if (bufferLines.join('').length > 0) {
          // If multiline, move cursor back up to line 0 first
          if (cursorLine > 0) {
            process.stdout.write(`\x1b[${cursorLine}A`);
          }
          bufferLines = [''];
          cursorLine = 0;
          cursorCol = 0;
          redrawContentFrom(0);
        } else {
          cancel();
        }
        return;
      }

      // Shift+Enter / Alt+Enter / Ctrl+J / modern terminal modified enter: Insert newline inside box
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
        const prevLine = cursorLine;
        bufferLines[cursorLine] = before;
        bufferLines.splice(cursorLine + 1, 0, after);
        cursorLine++;
        cursorCol = 0;
        redrawContentFrom(prevLine);
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
          updateActiveLineInPlace();
        } else if (cursorLine > 0) {
          // Merge current line into previous line
          const cur = bufferLines[cursorLine];
          const prev = bufferLines[cursorLine - 1];
          cursorCol = prev.length;
          bufferLines[cursorLine - 1] = prev + cur;
          bufferLines.splice(cursorLine, 1);
          cursorLine--;
          // Move cursor up 1 line and redraw from cursorLine down
          process.stdout.write('\x1b[1A');
          redrawContentFrom(cursorLine);
        }
        return;
      }

      // Arrow navigation
      if (str === '\x1b[D') {
        // Left arrow
        if (cursorCol > 0) {
          cursorCol--;
          const curWidth = getSafeBoxWidth();
          const activeCol = 5 + Math.min(cursorCol, curWidth - 8);
          process.stdout.write(`\x1b[${activeCol}G`);
        } else if (cursorLine > 0) {
          cursorLine--;
          cursorCol = bufferLines[cursorLine].length;
          const curWidth = getSafeBoxWidth();
          const activeCol = 5 + Math.min(cursorCol, curWidth - 8);
          process.stdout.write(`\x1b[1A\x1b[${activeCol}G`);
        }
        return;
      }
      if (str === '\x1b[C') {
        // Right arrow
        if (cursorCol < bufferLines[cursorLine].length) {
          cursorCol++;
          const curWidth = getSafeBoxWidth();
          const activeCol = 5 + Math.min(cursorCol, curWidth - 8);
          process.stdout.write(`\x1b[${activeCol}G`);
        } else if (cursorLine < bufferLines.length - 1) {
          cursorLine++;
          cursorCol = 0;
          process.stdout.write('\x1b[1B\x1b[5G');
        }
        return;
      }
      if (str === '\x1b[A') {
        // Up arrow
        if (cursorLine > 0) {
          cursorLine--;
          cursorCol = Math.min(cursorCol, bufferLines[cursorLine].length);
          const curWidth = getSafeBoxWidth();
          const activeCol = 5 + Math.min(cursorCol, curWidth - 8);
          process.stdout.write(`\x1b[1A\x1b[${activeCol}G`);
        }
        return;
      }
      if (str === '\x1b[B') {
        // Down arrow
        if (cursorLine < bufferLines.length - 1) {
          cursorLine++;
          cursorCol = Math.min(cursorCol, bufferLines[cursorLine].length);
          const curWidth = getSafeBoxWidth();
          const activeCol = 5 + Math.min(cursorCol, curWidth - 8);
          process.stdout.write(`\x1b[1B\x1b[${activeCol}G`);
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
        updateActiveLineInPlace();
        return;
      }

      // Multi-character text (e.g. fast typing or unicode)
      if (str.length > 0 && !str.includes('\x1b')) {
        const cur = bufferLines[cursorLine];
        bufferLines[cursorLine] = cur.slice(0, cursorCol) + str + cur.slice(cursorCol);
        cursorCol += str.length;
        updateActiveLineInPlace();
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
