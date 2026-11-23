import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';

export interface OpenCodePromptOptions {
  mode: 'build' | 'plan';
  model: string;
  provider?: string;
}

/**
 * OpenCode & Antigravity Style Interactive Boxed Prompt
 * 
 * Features:
 * 1. Terminal Bottom Framed Box Widget (╭──╮, │  │, ╰──╯):
 *    Provides an elegant, dedicated input container at the downside of the CLI,
 *    displaying active Mode, selected Model badge, and shortcut hints.
 * 2. Bracketed paste mode (\x1b[?2004h) + Burst paste protection:
 *    When pasting multi-line text, logs, or code, it NEVER auto-submits on newlines.
 *    Instead, it cleanly captures the entire paste inside the box,
 *    and waits for the user to explicitly press Enter!
 * 3. Multi-line typing (Shift+Enter / Alt+Enter / Ctrl+J):
 *    Adds new lines inside the boxed container with smart indentation.
 * 4. Arrow navigation (Left, Right, Up, Down), Backspace, and Esc to clear/abort.
 * 5. Enter: Submits prompt to the agent.
 */
export async function readOpenCodePrompt(options: OpenCodePromptOptions): Promise<string | null> {
  const isBuildMode = options.mode === 'build';

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

    const renderBox = () => {
      const termWidth = Math.max(60, Math.min(process.stdout.columns || 80, 96));
      const innerWidth = termWidth - 4;
      const borderColor = isBuildMode ? chalk.hex('#00FF7F') : chalk.hex('#FFB300');

      const modeBadge = isBuildMode
        ? chalk.bgHex('#00C853').black.bold(' ⚡ BUILD ')
        : chalk.bgHex('#FFB300').black.bold(' 📋 PLAN ');
      const modelBadge = chalk.bgHex('#1A237E').white.bold(` 🤖 ${options.model} `);
      const escHint = chalk.gray('(Esc to cancel)');

      // Top border
      const rawPrefixLen = 4 + 9 + 3 + (options.model.length + 4) + 2;
      const rawSuffixLen = 18;
      const dashesCount = Math.max(2, termWidth - rawPrefixLen - rawSuffixLen);
      const topBorder =
        borderColor('╭─ ') +
        modeBadge +
        borderColor(' ─ ') +
        modelBadge +
        borderColor(' ' + '─'.repeat(dashesCount) + ' ') +
        escHint +
        borderColor(' ─╮');

      // Content lines inside the box
      const contentLines: string[] = [];
      for (let i = 0; i < bufferLines.length; i++) {
        const isFirst = i === 0;
        const prefixStr = isFirst
          ? borderColor('│ ') + (isBuildMode ? chalk.hex('#00FF7F').bold('❯ ') : chalk.hex('#FFB300').bold('❯ '))
          : borderColor('│ ') + chalk.dim('  ↳ ');
        const lineText = bufferLines[i];
        const visibleLen = 4 + lineText.length;
        const padding = Math.max(0, innerWidth - visibleLen + 2);
        contentLines.push(prefixStr + chalk.white(lineText) + ' '.repeat(padding) + borderColor(' │'));
      }

      // Bottom border
      const hintText = ' Enter: send • Shift+Enter: newline • @file mention • /help ';
      const bottomDashes = Math.max(2, termWidth - hintText.length - 4);
      const bottomBorder = borderColor('╰─') + chalk.dim(hintText) + borderColor('─'.repeat(bottomDashes) + '╯');

      const allBoxLines = [topBorder, ...contentLines, bottomBorder];

      if (hasRendered) {
        // Move cursor up to the top border of the previously rendered box and clear
        process.stdout.write(`\r\x1b[${1 + cursorLine}A\x1b[J`);
      } else {
        process.stdout.write('\n');
      }

      // Output complete box
      process.stdout.write(allBoxLines.join('\n') + '\n');
      hasRendered = true;

      // Position cursor at exact active typing position inside the box
      const upLines = (bufferLines.length - 1 - cursorLine) + 2;
      const colPos = 5 + cursorCol;
      process.stdout.write(`\x1b[${upLines}A\x1b[${colPos}G`);
    };

    // Initial render of empty box
    renderBox();

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
      // Move cursor cleanly below the box
      const downLines = (bufferLines.length - 1 - cursorLine) + 2;
      process.stdout.write(`\x1b[${downLines}B\r\n`);
      resolve(bufferLines.join('\n').trim());
    };

    const cancel = () => {
      cleanup();
      const downLines = (bufferLines.length - 1 - cursorLine) + 2;
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
      }
      renderBox();
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
        process.stdout.write('\n' + chalk.yellow('Exiting banglacli...\n'));
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
          renderBox();
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
        renderBox();
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
          renderBox();
        } else if (cursorLine > 0) {
          const cur = bufferLines[cursorLine];
          const prev = bufferLines[cursorLine - 1];
          cursorCol = prev.length;
          bufferLines[cursorLine - 1] = prev + cur;
          bufferLines.splice(cursorLine, 1);
          cursorLine--;
          renderBox();
        }
        return;
      }

      // Arrow navigation
      if (str === '\x1b[D') {
        // Left arrow
        if (cursorCol > 0) {
          cursorCol--;
          renderBox();
        } else if (cursorLine > 0) {
          cursorLine--;
          cursorCol = bufferLines[cursorLine].length;
          renderBox();
        }
        return;
      }
      if (str === '\x1b[C') {
        // Right arrow
        if (cursorCol < bufferLines[cursorLine].length) {
          cursorCol++;
          renderBox();
        } else if (cursorLine < bufferLines.length - 1) {
          cursorLine++;
          cursorCol = 0;
          renderBox();
        }
        return;
      }
      if (str === '\x1b[A') {
        // Up arrow
        if (cursorLine > 0) {
          cursorLine--;
          cursorCol = Math.min(cursorCol, bufferLines[cursorLine].length);
          renderBox();
        }
        return;
      }
      if (str === '\x1b[B') {
        // Down arrow
        if (cursorLine < bufferLines.length - 1) {
          cursorLine++;
          cursorCol = Math.min(cursorCol, bufferLines[cursorLine].length);
          renderBox();
        }
        return;
      }

      // Ignore unhandled escape sequences
      if (str.startsWith('\x1b[')) {
        return;
      }

      // Printable character
      if (str.length === 1 && str.charCodeAt(0) >= 32) {
        const cur = bufferLines[cursorLine];
        bufferLines[cursorLine] = cur.slice(0, cursorCol) + str + cur.slice(cursorCol);
        cursorCol++;
        renderBox();
        return;
      }

      // Multi-character text (e.g. fast typing or unicode)
      if (str.length > 0 && !str.includes('\x1b')) {
        const cur = bufferLines[cursorLine];
        bufferLines[cursorLine] = cur.slice(0, cursorCol) + str + cur.slice(cursorCol);
        cursorCol += str.length;
        renderBox();
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
