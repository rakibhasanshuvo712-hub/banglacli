import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';

export interface OpenCodePromptOptions {
  mode: 'build' | 'plan';
  model: string;
  provider?: string;
}

/**
 * OpenCode & Antigravity Style Interactive Prompt
 * 
 * Features:
 * 1. Bracketed paste mode (\x1b[?2004h) + Burst paste protection:
 *    When pasting multi-line text, logs, or code, it NEVER auto-submits on newlines.
 *    Instead, it captures the entire paste cleanly, displays a multi-line preview,
 *    and waits for the user to explicitly press Enter!
 * 2. Shift+Enter / Alt+Enter / Ctrl+J: Inserts a newline for multiline typing.
 * 3. Enter: Submits prompt to the agent.
 * 4. Esc: Clears input buffer (or exits if buffer is empty).
 * 5. Ctrl+C: Clean exit.
 * 6. Visual status indicators showing active mode and model like Antigravity.
 */
export async function readOpenCodePrompt(options: OpenCodePromptOptions): Promise<string | null> {
  const isBuildMode = options.mode === 'build';
  const modeTag = isBuildMode
    ? chalk.bgHex('#00C853').black.bold(' ⚡ BUILD ')
    : chalk.bgHex('#FFB300').black.bold(' 📋 PLAN ');
  const modelTag = chalk.bgHex('#1A237E').white.bold(` 🤖 ${options.model} `);
  const cancelHint = chalk.gray('(Esc to cancel • Shift+Enter for newline)');
  const promptArrow = isBuildMode ? chalk.hex('#00FF7F').bold('❯ ') : chalk.hex('#FFB300').bold('❯ ');

  // Print prompt header line
  process.stdout.write(`\n${modeTag} ${modelTag} ${cancelHint}\n${promptArrow}`);

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

    let buffer = '';
    let inBracketedPaste = false;
    let pasteTimeout: NodeJS.Timeout | null = null;
    let pasteBuffer = '';

    const cleanup = () => {
      // Disable Bracketed Paste Mode in terminal
      try {
        process.stdout.write('\x1b[?2004l');
      } catch {}

      process.stdin.removeListener('data', onData);
      if (pasteTimeout) clearTimeout(pasteTimeout);

      try {
        if (!wasRaw) {
          process.stdin.setRawMode(false);
        }
        process.stdin.pause();
      } catch {}
    };

    const submit = () => {
      cleanup();
      process.stdout.write('\n');
      resolve(buffer.trim());
    };

    const cancel = () => {
      cleanup();
      process.stdout.write('\n');
      resolve(null);
    };

    const onData = (data: Buffer) => {
      const str = data.toString('utf-8');

      // 1. Bracketed Paste Handling (\x1b[200~ ... \x1b[201~)
      if (str.includes('\x1b[200~')) {
        inBracketedPaste = true;
        const afterStart = str.split('\x1b[200~')[1] || '';
        if (afterStart.includes('\x1b[201~')) {
          // Entire paste was in this single chunk
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

      // 2. Burst Paste Detection for terminals that don't support bracketed paste
      // If incoming data contains newlines and is longer than a single keystroke,
      // it is a paste burst! Never auto-submit on internal newlines.
      if (str.length > 2 && (str.includes('\n') || str.includes('\r'))) {
        handlePastedText(str);
        return;
      }

      // 3. Special Keys Handling
      // Ctrl+C (Interrupt)
      if (str === '\x03') {
        cleanup();
        process.stdout.write('\n' + chalk.yellow('Exiting banglacli...\n'));
        process.exit(0);
      }

      // Ctrl+D (EOF)
      if (str === '\x04') {
        if (buffer.length === 0) {
          cancel();
          return;
        }
      }

      // Escape key (\x1b)
      if (str === '\x1b') {
        if (buffer.length > 0) {
          // Clear current typed line
          buffer = '';
          process.stdout.write('\r\x1b[K' + promptArrow + chalk.gray('(cleared)'));
          setTimeout(() => {
            process.stdout.write('\r\x1b[K' + promptArrow);
          }, 350);
        } else {
          cancel();
        }
        return;
      }

      // Shift+Enter / Alt+Enter / Ctrl+J (\x0a or \x1b\x0d or \x1b\n): Insert newline
      if (str === '\x0a' || str === '\x1b\x0d' || str === '\x1b\r') {
        buffer += '\n';
        process.stdout.write('\n  ' + chalk.dim('↳ '));
        return;
      }

      // Enter key (\r or \r\n or \n)
      if (str === '\r' || str === '\n' || str === '\r\n') {
        if (buffer.trim().length === 0) {
          // Empty enter, keep prompt waiting
          return;
        }
        submit();
        return;
      }

      // Backspace (\x08 or \x7f)
      if (str === '\x08' || str === '\x7f') {
        if (buffer.length > 0) {
          buffer = buffer.slice(0, -1);
          process.stdout.write('\b \b');
        }
        return;
      }

      // Arrow keys and escape sequences (ignore navigation noise)
      if (str.startsWith('\x1b[')) {
        return;
      }

      // Normal typing: append character
      buffer += str;
      process.stdout.write(str);
    };

    /**
     * Safely format and incorporate pasted text without triggering auto-submission.
     */
    const handlePastedText = (pasted: string) => {
      // Normalize line breaks
      const normalized = pasted.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      buffer += normalized;

      const lines = normalized.split('\n');
      if (lines.length > 1) {
        // Multi-line paste! Render sleek OpenCode paste preview notice
        process.stdout.write(
          '\n' +
            chalk.bgHex('#0047AB').white.bold(' 📋 PASTED CONTENT ') +
            ' ' +
            chalk.cyan(`(${lines.length} lines, ${normalized.length} chars)`) +
            '\n' +
            chalk.gray('  Press ') +
            chalk.yellow.bold('Enter') +
            chalk.gray(' to submit to agent, or type more instructions...\n') +
            promptArrow +
            chalk.dim(`[...${lines.length} lines ready in buffer...] `)
        );
      } else {
        // Single line paste: print directly
        process.stdout.write(normalized);
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
