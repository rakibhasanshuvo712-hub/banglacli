import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Type } from '@google/genai';
import { askToolConfirmation, renderToolCall, renderToolResult } from './ui.js';
import { MeshNode } from './mesh.js';
import chalk from 'chalk';

// Active mesh node for cross-instance communication
let activeMeshNode: MeshNode | null = null;

export function setActiveMeshNode(node: MeshNode | null): void {
  activeMeshNode = node;
}

export function getActiveMeshNode(): MeshNode | null {
  return activeMeshNode;
}

export interface SafetySession {
  autoApproveAll: boolean;
}

// Global session safety state
export const safetySession: SafetySession = {
  autoApproveAll: false,
};

export interface FileChangeRecord {
  filePath: string;
  isNew: boolean;
  previousContent: string | null;
  newContent: string;
  timestamp: Date;
}

// Track file modifications in the current session (OpenCode style)
export const sessionFileHistory: FileChangeRecord[] = [];

/**
 * Get all files modified or created during the active session.
 */
export function getSessionChanges(): FileChangeRecord[] {
  return [...sessionFileHistory];
}

/**
 * Revert the most recent file change made in this session (OpenCode /undo).
 */
export function undoLastChange(): { success: boolean; message: string } {
  if (sessionFileHistory.length === 0) {
    return { success: false, message: 'No file changes recorded in this session to undo.' };
  }

  const lastChange = sessionFileHistory.pop()!;
  const rootDir = process.cwd();
  const targetFile = path.resolve(rootDir, lastChange.filePath);

  try {
    if (lastChange.isNew) {
      if (fs.existsSync(targetFile)) {
        fs.unlinkSync(targetFile);
        return {
          success: true,
          message: `✔ Undid creation of "${lastChange.filePath}" (file removed).`,
        };
      }
    } else {
      if (lastChange.previousContent !== null) {
        fs.writeFileSync(targetFile, lastChange.previousContent, 'utf8');
        return {
          success: true,
          message: `✔ Reverted "${lastChange.filePath}" to its previous version (${lastChange.previousContent.length} bytes).`,
        };
      }
    }
    return { success: true, message: `✔ Reverted "${lastChange.filePath}".` };
  } catch (err: any) {
    return { success: false, message: `Failed to undo "${lastChange.filePath}": ${err.message}` };
  }
}

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.turbo',
  '.cache',
  'dist',
  'build',
  'coverage',
  '.vscode',
  '.idea',
]);

/**
 * 1. list_files: List files/folders in the current workspace
 */
export async function listFiles(dirPath = '.'): Promise<string> {
  const rootDir = process.cwd();
  const targetDir = path.resolve(rootDir, dirPath);

  if (!fs.existsSync(targetDir)) {
    return `Error: Directory "${dirPath}" does not exist.`;
  }

  const stat = fs.statSync(targetDir);
  if (!stat.isDirectory()) {
    return `Error: "${dirPath}" is not a directory.`;
  }

  const results: string[] = [];

  function scan(currentPath: string, depth = 0) {
    if (depth > 6) return; // Prevent excessive recursion depth

    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.git')) {
        continue;
      }

      const fullPath = path.join(currentPath, entry.name);
      const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        results.push(relPath + '/');
        scan(fullPath, depth + 1);
      } else {
        results.push(relPath);
      }
    }
  }

  scan(targetDir);

  if (results.length === 0) {
    return `Directory is empty (or only contains ignored files like node_modules/.git).`;
  }

  return `Workspace files in "${dirPath}":\n` + results.map((f) => `- ${f}`).join('\n');
}

/**
 * 2. read_file: Read file content
 */
export async function readFile(filePath: string): Promise<string> {
  const rootDir = process.cwd();
  const targetFile = path.resolve(rootDir, filePath);

  if (!fs.existsSync(targetFile)) {
    return `Error: File "${filePath}" does not exist.`;
  }

  const stat = fs.statSync(targetFile);
  if (stat.isDirectory()) {
    return `Error: "${filePath}" is a directory, not a file. Use list_files instead.`;
  }

  try {
    const content = fs.readFileSync(targetFile, 'utf8');
    if (content.length > 50000) {
      const truncated = content.slice(0, 50000);
      return `File content of "${filePath}" (truncated to first 50KB):\n\n${truncated}\n\n[Warning: File content truncated due to size]`;
    }
    return `File content of "${filePath}":\n\n${content}`;
  } catch (error: any) {
    return `Error reading file "${filePath}": ${error.message}`;
  }
}

/**
 * 3. write_file: Write or update a file (with safety confirmation)
 */
export async function writeFile(filePath: string, content: string, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) {
    return 'Action cancelled by user (Escape key pressed).';
  }
  const rootDir = process.cwd();
  const targetFile = path.resolve(rootDir, filePath);
  const dirName = path.dirname(targetFile);

  // Safety confirmation check
  if (!safetySession.autoApproveAll) {
    const lineCount = content.split('\n').length;
    const exists = fs.existsSync(targetFile);
    const summary =
      `${exists ? chalk.yellow('Update existing file:') : chalk.green('Create new file:')} ${chalk.cyan(filePath)}\n` +
      `Size: ${content.length} bytes, ${lineCount} lines\n` +
      `Preview (first 5 lines):\n` +
      chalk.dim(content.split('\n').slice(0, 5).join('\n'));

    const decision = await askToolConfirmation('write_file', summary);

    if (decision === 'no') {
      return `Action rejected: User declined writing to "${filePath}".`;
    } else if (decision === 'all') {
      safetySession.autoApproveAll = true;
      console.log(chalk.cyan('⚡ Auto-approve enabled for this session.'));
    }
  }

  try {
    const isNew = !fs.existsSync(targetFile);
    const previousContent = isNew ? null : fs.readFileSync(targetFile, 'utf8');

    if (!fs.existsSync(dirName)) {
      fs.mkdirSync(dirName, { recursive: true });
    }
    fs.writeFileSync(targetFile, content, 'utf8');

    sessionFileHistory.push({
      filePath: path.relative(rootDir, targetFile).replace(/\\/g, '/'),
      isNew,
      previousContent,
      newContent: content,
      timestamp: new Date(),
    });

    return `Successfully wrote to "${filePath}" (${content.length} bytes).`;
  } catch (error: any) {
    return `Error writing file "${filePath}": ${error.message}`;
  }
}

/**
 * 3b. edit_file: Surgically edits an existing file by replacing a unique target text block.
 * Avoids rewriting entire large files, saves tokens, and tracks reversible session history.
 */
export async function editFile(
  filePath: string,
  target: string,
  replacement: string,
  signal?: AbortSignal
): Promise<string> {
  if (signal?.aborted) {
    return 'Action cancelled by user (Escape key pressed).';
  }
  const rootDir = process.cwd();
  const targetFile = path.resolve(rootDir, filePath);

  if (!fs.existsSync(targetFile)) {
    return `Error: File "${filePath}" does not exist. Use write_file to create new files.`;
  }

  const stat = fs.statSync(targetFile);
  if (!stat.isFile()) {
    return `Error: "${filePath}" is a directory, not a file.`;
  }

  const content = fs.readFileSync(targetFile, 'utf8');

  if (!content.includes(target)) {
    return `Error: Target string not found in "${filePath}". Please use read_file first to verify the exact lines and whitespace before calling edit_file.`;
  }

  // Check for uniqueness
  const occurrences = content.split(target).length - 1;
  if (occurrences > 1) {
    return `Warning: Target string matches ${occurrences} times in "${filePath}". Please include more surrounding context lines in 'target' so it matches uniquely.`;
  }

  // Ask confirmation if auto-approve is disabled
  if (!safetySession.autoApproveAll) {
    const summary =
      `${chalk.yellow('Surgically edit file:')} ${chalk.cyan(filePath)}\n` +
      `Replacing: ${target.split('\n').length} line(s) (${target.length} bytes)\n` +
      `With: ${replacement.split('\n').length} line(s) (${replacement.length} bytes)`;

    const decision = await askToolConfirmation('edit_file', summary);
    if (decision === 'no') {
      return `Action rejected: User declined editing "${filePath}".`;
    } else if (decision === 'all') {
      safetySession.autoApproveAll = true;
      console.log(chalk.cyan('⚡ Auto-approve enabled for this session.'));
    }
  }

  // Track session history for /undo and /diff
  sessionFileHistory.push({
    filePath,
    isNew: false,
    previousContent: content,
    newContent: content.replace(target, replacement),
    timestamp: new Date(),
  });

  const updatedContent = content.replace(target, replacement);
  fs.writeFileSync(targetFile, updatedContent, 'utf8');

  const beforeLines = target.split('\n').length;
  const afterLines = replacement.split('\n').length;
  return `✔ Successfully edited "${filePath}" (surgically replaced ${beforeLines} line(s) with ${afterLines} line(s)).`;
}

// Mutex to ensure commands execute strictly ONE BY ONE sequentially
let commandExecutionMutex = Promise.resolve();

/**
 * 4. run_command: Run a shell command non-interactively and strictly ONE BY ONE.
 * Guarantees that multiple commands never run at the same time, avoiding lengthy timeouts.
 */
export async function runCommand(command: string, signal?: AbortSignal): Promise<string> {
  // Wait for any active command to complete so execution is strictly continuous and sequential
  const prevLock = commandExecutionMutex;
  let release: () => void = () => {};
  commandExecutionMutex = new Promise((resolve) => {
    release = resolve;
  });

  try {
    await prevLock;
    return await executeSequentialCommand(command, signal);
  } finally {
    release();
  }
}

/**
 * Splits compound shell commands (e.g. "cmd1 && cmd2") while respecting quotes.
 */
export function splitShellCommands(command: string): string[] {
  const commands: string[] = [];
  let current = '';
  let inDoubleQuote = false;
  let inSingleQuote = false;

  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    const nextChar = command[i + 1];

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      current += char;
    } else if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      current += char;
    } else if (!inDoubleQuote && !inSingleQuote) {
      if (char === '&' && nextChar === '&') {
        if (current.trim()) commands.push(current.trim());
        current = '';
        i++;
      } else if (char === ';' || char === '\n') {
        if (current.trim()) commands.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    commands.push(current.trim());
  }

  return commands;
}

/**
 * Executes a command or breaks chained commands (&&, ;, newlines) into individual steps applied one by one.
 */
async function executeSequentialCommand(command: string, signal?: AbortSignal): Promise<string> {
  // Safety confirmation check
  if (!safetySession.autoApproveAll) {
    const summary = `${chalk.gray('Shell Command:')} ${chalk.magenta.bold(command)}\n${chalk.gray('Working Directory:')} ${process.cwd()}`;
    const decision = await askToolConfirmation('run_command', summary);

    if (decision === 'no') {
      return `Action rejected: User cancelled execution of command "${command}".`;
    } else if (decision === 'all') {
      safetySession.autoApproveAll = true;
      console.log(chalk.cyan('⚡ Auto-approve enabled for this session.'));
    }
  }

  if (signal?.aborted) {
    return 'Action aborted by user (Escape).';
  }

  // Decompose compound commands (&&, ;, newlines) quote-safely so each sub-command runs strictly one by one
  const subCommands = splitShellCommands(command);

  if (subCommands.length > 1) {
    console.log(
      chalk.cyan(
        `\n⚡ Continuous Execution: Running ${chalk.bold(subCommands.length)} commands strictly one by one...`
      )
    );

    const stepResults: string[] = [];
    for (let i = 0; i < subCommands.length; i++) {
      if (signal?.aborted) {
        return 'Action aborted by user (Escape).';
      }

      const sub = subCommands[i];
      console.log(chalk.cyan(`\n⚡ Step ${i + 1}/${subCommands.length}: ${chalk.bold(sub)}`));
      const res = await runActualProcess(sub, signal);
      stepResults.push(`[Step ${i + 1}/${subCommands.length}: ${sub}]\n${res}`);

      // If a step fails, abort subsequent steps immediately so the model can self-heal without wasting time
      if (res.includes('Command exited with status code') || res.includes('Command timed out') || res.includes('failed to start')) {
        console.log(chalk.yellow(`\n⚠️ Step ${i + 1} exited with error. Stopping subsequent steps immediately.`));
        break;
      }
    }

    return stepResults.join('\n\n');
  }

  console.log(chalk.cyan(`\n⚡ Running command: ${chalk.bold(command)}...`));
  return await runActualProcess(command, signal);
}

/**
 * Smart Diagnostic Engine: Analyzes failed commands and generates exact,
 * actionable self-healing recommendations for the model.
 */
function diagnoseCommandFailure(command: string, stdout: string, stderr: string, code: number): string | null {
  const combined = stdout + '\n' + stderr;

  // 1. Missing npm / Node.js package
  const nodeModuleMatch = combined.match(/(?:Cannot find module|Module not found: Can't resolve) ['"]([^'"]+)['"]/i);
  if (nodeModuleMatch && nodeModuleMatch[1] && !nodeModuleMatch[1].startsWith('.')) {
    const pkg = nodeModuleMatch[1].startsWith('@')
      ? nodeModuleMatch[1].split('/').slice(0, 2).join('/')
      : nodeModuleMatch[1].split('/')[0];
    return `💡 Banglacli Smart Diagnostic: Missing npm package "${pkg}" detected. Recommendation: run "npm install ${pkg}" to install it.`;
  }

  // 2. Missing Python package
  const pyModuleMatch = combined.match(/(?:ModuleNotFoundError: No module named|ImportError: cannot import name) ['"]([^'"]+)['"]/i);
  if (pyModuleMatch && pyModuleMatch[1]) {
    return `💡 Banglacli Smart Diagnostic: Missing Python package "${pyModuleMatch[1]}" detected. Recommendation: run "pip install ${pyModuleMatch[1]}".`;
  }

  // 3. Port collision (EADDRINUSE)
  const portMatch = combined.match(/EADDRINUSE.*?[:\s](\d{4,5})\b/i) || combined.match(/port (\d{4,5}) is already in use/i);
  if (portMatch) {
    return `💡 Banglacli Smart Diagnostic: Port ${portMatch[1]} is already occupied. Recommendation: use a different port (e.g. PORT=${parseInt(portMatch[1], 10) + 1}) or terminate the existing process.`;
  }

  // 4. TypeScript compilation error
  const tsErrorMatch = combined.match(/error TS(\d+):/i);
  if (tsErrorMatch) {
    return `💡 Banglacli Smart Diagnostic: TypeScript compilation error (TS${tsErrorMatch[1]}) detected. Inspect the file and line number shown in the error log above and use edit_file or write_file to fix it.`;
  }

  // 5. Git upstream missing
  if (combined.includes('has no upstream branch') || combined.includes('set-upstream')) {
    const branchMatch = combined.match(/git push --set-upstream origin ([^\s]+)/i);
    const branchName = branchMatch ? branchMatch[1] : 'main';
    return `💡 Banglacli Smart Diagnostic: Git remote branch has no upstream. Recommendation: run "git push -u origin ${branchName}".`;
  }

  return null;
}

/**
 * Spawns an individual command non-interactively with detached stdin and auto-timeout.
 */
function runActualProcess(command: string, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    let sanitizedCommand = command;

    let shellProgram: string;
    let shellArgs: string[];

    if (isWindows) {
      // Auto-inject -UseBasicParsing if Invoke-WebRequest or iwr is used without it
      if (/\b(Invoke-WebRequest|iwr)\b/i.test(sanitizedCommand) && !/-UseBasicParsing\b/i.test(sanitizedCommand)) {
        sanitizedCommand = sanitizedCommand.replace(/\b(Invoke-WebRequest|iwr)\b/gi, '$1 -UseBasicParsing');
      }

      // Non-interactive PowerShell environment
      const wrappedCmd = `$ConfirmPreference = 'None'; $ProgressPreference = 'SilentlyContinue'; ${sanitizedCommand}`;
      shellProgram = 'powershell.exe';
      shellArgs = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', wrappedCmd];
    } else {
      shellProgram = '/bin/sh';
      shellArgs = ['-c', sanitizedCommand];
    }

    const child = spawn(shellProgram, shellArgs, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        CI: 'true',
        GIT_TERMINAL_PROMPT: '0',
        NPM_CONFIG_YES: 'true',
        DEBIAN_FRONTEND: 'noninteractive',
      },
    });

    if (signal) {
      signal.addEventListener('abort', () => {
        try {
          child.kill('SIGTERM');
        } catch {}
        resolve('Command aborted by user (Escape).');
      });
    }

    let stdout = '';
    let stderr = '';
    let isTimedOut = false;

    const timeoutMs = 180000; // 3 minutes timeout
    const timer = setTimeout(() => {
      isTimedOut = true;
      try {
        child.kill('SIGTERM');
      } catch {}
    }, timeoutMs);

    child.stdout.on('data', (data) => {
      if (stdout.length < 20 * 1024 * 1024) {
        stdout += data.toString();
      }
    });

    child.stderr.on('data', (data) => {
      if (stderr.length < 20 * 1024 * 1024) {
        stderr += data.toString();
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve(`Command failed to start: ${err.message}`);
    });

    child.on('close', (code) => {
      clearTimeout(timer);

      if (isTimedOut) {
        resolve(`Command timed out after ${timeoutMs / 1000} seconds.`);
        return;
      }

      const outputParts: string[] = [];
      if (stdout && stdout.trim()) {
        outputParts.push(`[stdout]:\n${stdout.trim()}`);
      }
      if (stderr && stderr.trim()) {
        outputParts.push(`[stderr]:\n${stderr.trim()}`);
      }

      if (code !== 0 && code !== null) {
        outputParts.unshift(`Command exited with status code: ${code}`);
        const diag = diagnoseCommandFailure(command, stdout, stderr, code);
        if (diag) {
          outputParts.push(diag);
        }
      }

      if (outputParts.length === 0) {
        resolve(`Command executed successfully with no output (exit code 0).`);
        return;
      }

      resolve(outputParts.join('\n\n'));
    });
  });
}

/**
 * 5. grep_search: Search text or regex across workspace files (ignoring node_modules/.git)
 */
export async function grepSearch(query: string, filePattern?: string, maxMatches = 50): Promise<string> {
  const rootDir = process.cwd();
  const matches: string[] = [];
  let re: RegExp;

  try {
    re = new RegExp(query, 'i');
  } catch {
    re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }

  const patternFilter = filePattern
    ? new RegExp(filePattern.replace(/\./g, '\\.').replace(/\*/g, '.*'), 'i')
    : null;

  function walk(dir: string) {
    if (matches.length >= maxMatches) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (matches.length >= maxMatches) break;
      if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;

      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        if (patternFilter && !patternFilter.test(relPath)) continue;

        const ext = path.extname(entry.name).toLowerCase();
        if (['.png', '.jpg', '.jpeg', '.gif', '.zip', '.tar', '.gz', '.ico', '.pdf', '.exe', '.dll', '.bin'].includes(ext)) {
          continue;
        }

        try {
          const stat = fs.statSync(fullPath);
          if (stat.size > 500000) continue;

          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            if (matches.length >= maxMatches) break;
            if (re.test(lines[i])) {
              const preview = lines[i].trim().slice(0, 160);
              matches.push(`${relPath}:${i + 1}: ${preview}`);
            }
          }
        } catch {}
      }
    }
  }

  walk(rootDir);

  if (matches.length === 0) {
    return `No matches found for query "${query}".`;
  }

  return `Found ${matches.length} match(es) for "${query}":\n` + matches.join('\n');
}

/**
 * 6. find_files: Find files matching wildcard pattern across workspace
 */
export async function findFiles(pattern: string, maxResults = 50): Promise<string> {
  const rootDir = process.cwd();
  const results: string[] = [];
  const regex = new RegExp(pattern.replace(/\./g, '\\.').replace(/\*/g, '.*'), 'i');

  function walk(dir: string) {
    if (results.length >= maxResults) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= maxResults) break;
      if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;

      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        if (regex.test(entry.name) || regex.test(relPath)) {
          results.push(relPath);
        }
      }
    }
  }

  walk(rootDir);

  if (results.length === 0) {
    return `No files found matching pattern "${pattern}".`;
  }

  return `Found ${results.length} file(s) matching "${pattern}":\n` + results.join('\n');
}

/**
 * 7. fetch_url: Fetch documentation or webpage text from HTTP/HTTPS URL
 */
export async function fetchUrl(targetUrl: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) banglacli/2.0',
        'Accept': 'text/html,application/xhtml+xml,application/json,text/plain;q=0.9',
      },
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return `HTTP error ${res.status}: ${res.statusText}`;
    }

    const contentType = res.headers.get('content-type') || '';
    const rawText = await res.text();

    if (contentType.includes('application/json')) {
      return rawText.slice(0, 30000);
    }

    // Strip HTML and script/style tags for clean readable text
    const cleanText = rawText
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const truncated = cleanText.slice(0, 25000);
    return `[Fetched Content from ${targetUrl} (${truncated.length} chars)]:\n\n${truncated}`;
  } catch (err: any) {
    return `Failed to fetch URL "${targetUrl}": ${err.message}`;
  }
}

/**
 * 8. web_search: Searches the web for documentation, API references, or bug solutions.
 */
export async function webSearch(query: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) banglacli/2.0',
        'Accept': 'application/json',
      },
    });

    clearTimeout(timeout);

    if (res.ok) {
      const data: any = await res.json();
      const results: string[] = [];

      if (data.Heading) {
        results.push(`### ${data.Heading}`);
      }
      if (data.AbstractText) {
        results.push(data.AbstractText);
        if (data.AbstractURL) {
          results.push(`Source: ${data.AbstractURL}`);
        }
      }

      if (Array.isArray(data.RelatedTopics) && data.RelatedTopics.length > 0) {
        results.push('\n**Related Results:**');
        for (const item of data.RelatedTopics.slice(0, 5)) {
          if (item.Text && item.FirstURL) {
            results.push(`- [${item.Text}](${item.FirstURL})`);
          } else if (Array.isArray(item.Topics)) {
            for (const sub of item.Topics.slice(0, 2)) {
              if (sub.Text && sub.FirstURL) {
                results.push(`- [${sub.Text}](${sub.FirstURL})`);
              }
            }
          }
        }
      }

      if (results.length > 0) {
        return `[Web Search Results for "${query}"]:\n\n` + results.join('\n');
      }
    }

    // Fallback: search via fetchUrl
    const ddgHtmlUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    return await fetchUrl(ddgHtmlUrl);
  } catch (err: any) {
    return `Failed to perform web search for "${query}": ${err.message}`;
  }
}

/**
 * Tool dispatcher
 */
export async function executeTool(
  name: string,
  args: Record<string, any>,
  mode: 'build' | 'plan' = 'build',
  signal?: AbortSignal
): Promise<string> {
  if (signal?.aborted) {
    return 'Action aborted by user (Escape).';
  }

  // If in PLAN mode, block write, edit, and command execution
  if (mode === 'plan' && (name === 'write_file' || name === 'edit_file' || name === 'run_command')) {
    const errorMsg = `⚠️ Action blocked: banglacli is currently in PLAN MODE. File modifications and terminal commands are disabled. Switch to BUILD mode (/build or /mode) to execute changes.`;
    renderToolCall(name, args);
    renderToolResult(name, errorMsg, true);
    return errorMsg;
  }

  renderToolCall(name, args);

  let result = '';
  let isError = false;

  try {
    switch (name) {
      case 'list_files':
        result = await listFiles(args.dirPath);
        break;
      case 'read_file':
        result = await readFile(args.filePath);
        break;
      case 'write_file':
        result = await writeFile(args.filePath, args.content, signal);
        break;
      case 'edit_file':
        result = await editFile(args.filePath, args.target, args.replacement, signal);
        break;
      case 'run_command':
        result = await runCommand(args.command, signal);
        break;
      case 'grep_search':
        result = await grepSearch(args.query, args.filePattern);
        break;
      case 'find_files':
        result = await findFiles(args.pattern);
        break;
      case 'fetch_url':
        result = await fetchUrl(args.url);
        break;
      case 'web_search':
        result = await webSearch(args.query);
        break;
      case 'list_peers':
      case 'list_mesh_peers': {
        if (!activeMeshNode) {
          result = 'Cross-instance mesh is not active or enabled on this instance.';
        } else {
          const peers = activeMeshNode.listPeers().filter((p) => p.nodeId !== activeMeshNode?.nodeId);
          if (peers.length === 0) {
            result = `No other banglacli instances are currently connected on the local mesh (Port: ${activeMeshNode.port}). Current node: [${activeMeshNode.role}] (${activeMeshNode.nodeId}) at ${activeMeshNode.workspace}.`;
          } else {
            result =
              `Connected Peer Instances (${peers.length}):\n` +
              peers
                .map(
                  (p, idx) =>
                    `  ${idx + 1}. [${p.role}] (Node: ${p.nodeId})\n     Workspace: ${p.workspace}\n     Mode: ${p.mode.toUpperCase()} | Model: ${p.model} (${p.provider})`
                )
                .join('\n\n');
          }
        }
        break;
      }
      case 'peer_call_tool': {
        if (!activeMeshNode) {
          result = 'Error: Cross-instance mesh is not active. Start banglacli with mesh enabled to call remote peer tools.';
          isError = true;
        } else {
          const targetPeer = args.peer;
          const targetTool = args.tool;
          const targetArgs = typeof args.args === 'string' ? JSON.parse(args.args) : (args.args || {});
          result = await activeMeshNode.callRemoteTool(targetPeer, targetTool, targetArgs);
        }
        break;
      }
      case 'peer_send_message': {
        if (!activeMeshNode) {
          result = 'Error: Cross-instance mesh is not active.';
          isError = true;
        } else {
          result = await activeMeshNode.sendMessage(args.peer, args.message);
        }
        break;
      }
      default:
        result = `Error: Unknown tool "${name}".`;
        isError = true;
    }
  } catch (err: any) {
    result = `Error executing ${name}: ${err.message}`;
    isError = true;
  }

  if (result.startsWith('Error:') || result.startsWith('Action rejected:')) {
    isError = true;
  }

  renderToolResult(name, result, isError);
  return result;
}

/**
 * OpenAI Tool Schemas
 */
export const OPENAI_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'list_files',
      description: 'Lists files and folders in the workspace, ignoring node_modules, .git, and build artifacts.',
      parameters: {
        type: 'object',
        properties: {
          dirPath: {
            type: 'string',
            description: 'Optional relative directory path to list. Defaults to "." (current workspace).',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Reads the entire contents of a specified file in the workspace.',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Relative path of the file to read.',
          },
        },
        required: ['filePath'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'write_file',
      description: 'Creates directories as needed and writes or overwrites content into a file.',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Relative path of the file to create or update.',
          },
          content: {
            type: 'string',
            description: 'The complete text content to write into the file.',
          },
        },
        required: ['filePath', 'content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_command',
      description: 'Executes a single terminal command in the workspace directory. Run commands strictly ONE BY ONE sequentially. Do not batch or chain multiple heavy commands.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The single shell command line string to run.',
          },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'grep_search',
      description: 'Searches text or regex patterns across all files in the workspace (ignoring node_modules, .git). Returns line numbers and matches.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The text or regex to search for in files.',
          },
          filePattern: {
            type: 'string',
            description: 'Optional file path or wildcard filter (e.g., "*.ts", "src/*").',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'find_files',
      description: 'Finds files across workspace matching wildcard pattern (e.g., "*.json", "*config*", "src/**/*.ts").',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Wildcard or file pattern to find.',
          },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'edit_file',
      description: 'Surgically edits an existing file by replacing an exact, unique target code block with replacement code. Always read_file first to get the exact lines.',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Relative path of the existing file to edit.',
          },
          target: {
            type: 'string',
            description: 'The exact existing text or lines to be replaced (must match uniquely).',
          },
          replacement: {
            type: 'string',
            description: 'The new replacement text or lines.',
          },
        },
        required: ['filePath', 'target', 'replacement'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'web_search',
      description: 'Searches the web for technical documentation, library APIs, and error solutions using DuckDuckGo.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The technical search query (e.g., "nextjs 15 cookies", "tailwind v4 upgrade").',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'fetch_url',
      description: 'Fetches content or API reference from a public HTTP/HTTPS URL and returns clean readable text or JSON.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The full HTTP or HTTPS URL to fetch.',
          },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_peers',
      description:
        'Discovers all active connected banglacli peer instances across the workspace mesh (e.g. backend, frontend), returning their roles, working directories, and modes.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'peer_call_tool',
      description:
        'Executes a workspace tool (list_files, read_file, write_file, edit_file, run_command, grep_search, find_files) on a connected peer instance (e.g. "backend" or "frontend") in its workspace.',
      parameters: {
        type: 'object',
        properties: {
          peer: {
            type: 'string',
            description: 'Target peer role (e.g. "backend", "frontend") or exact nodeId.',
          },
          tool: {
            type: 'string',
            description:
              'Name of the tool to execute on the peer (e.g. "read_file", "write_file", "run_command", "list_files", "grep_search").',
          },
          args: {
            type: 'object',
            description:
              'Arguments object for the tool (e.g. {"filePath": "src/api/routes.ts"} or {"command": "npm run build"}).',
          },
        },
        required: ['peer', 'tool', 'args'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'peer_send_message',
      description:
        'Sends a structured communication message or coordination request to a connected peer instance (e.g. "backend" or "frontend").',
      parameters: {
        type: 'object',
        properties: {
          peer: {
            type: 'string',
            description: 'Target peer role (e.g. "backend", "frontend") or exact nodeId.',
          },
          message: {
            type: 'string',
            description: 'Message or instruction to send to the peer.',
          },
        },
        required: ['peer', 'message'],
      },
    },
  },
];

/**
 * Gemini Tool Schemas (@google/genai)
 */
export const GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'list_files',
        description: 'Lists files and folders in the workspace, ignoring node_modules, .git, and build artifacts.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            dirPath: {
              type: Type.STRING,
              description: 'Optional relative directory path to list. Defaults to "." (current workspace).',
            },
          },
        },
      },
      {
        name: 'read_file',
        description: 'Reads the entire contents of a specified file in the workspace.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            filePath: {
              type: Type.STRING,
              description: 'Relative path of the file to read.',
            },
          },
          required: ['filePath'],
        },
      },
      {
        name: 'write_file',
        description: 'Creates directories as needed and writes or overwrites content into a file.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            filePath: {
              type: Type.STRING,
              description: 'Relative path of the file to create or update.',
            },
            content: {
              type: Type.STRING,
              description: 'The complete text content to write into the file.',
            },
          },
          required: ['filePath', 'content'],
        },
      },
      {
        name: 'run_command',
        description: 'Executes a single terminal command in the workspace directory. Run commands strictly ONE BY ONE sequentially. Do not batch or chain multiple heavy commands.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            command: {
              type: Type.STRING,
              description: 'The single shell command line string to run.',
            },
          },
          required: ['command'],
        },
      },
      {
        name: 'grep_search',
        description: 'Searches text or regex patterns across all files in the workspace (ignoring node_modules, .git). Returns line numbers and matches.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: {
              type: Type.STRING,
              description: 'The text or regex to search for in files.',
            },
            filePattern: {
              type: Type.STRING,
              description: 'Optional file path or wildcard filter (e.g., "*.ts", "src/*").',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'find_files',
        description: 'Finds files across workspace matching wildcard pattern (e.g., "*.json", "*config*", "src/**/*.ts").',
        parameters: {
          type: Type.OBJECT,
          properties: {
            pattern: {
              type: Type.STRING,
              description: 'Wildcard or file pattern to find.',
            },
          },
          required: ['pattern'],
        },
      },
      {
        name: 'edit_file',
        description: 'Surgically edits an existing file by replacing an exact, unique target code block with replacement code. Always read_file first to get the exact lines.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            filePath: {
              type: Type.STRING,
              description: 'Relative path of the existing file to edit.',
            },
            target: {
              type: Type.STRING,
              description: 'The exact existing text or lines to be replaced (must match uniquely).',
            },
            replacement: {
              type: Type.STRING,
              description: 'The new replacement text or lines.',
            },
          },
          required: ['filePath', 'target', 'replacement'],
        },
      },
      {
        name: 'web_search',
        description: 'Searches the web for technical documentation, library APIs, and error solutions using DuckDuckGo.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: {
              type: Type.STRING,
              description: 'The technical search query (e.g., "nextjs 15 cookies", "tailwind v4 upgrade").',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'fetch_url',
        description: 'Fetches content or API reference from a public HTTP/HTTPS URL and returns clean readable text or JSON.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            url: {
              type: Type.STRING,
              description: 'The full HTTP or HTTPS URL to fetch.',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'list_peers',
        description:
          'Discovers all active connected banglacli peer instances across the workspace mesh (e.g. backend, frontend), returning their roles, working directories, and modes.',
        parameters: {
          type: Type.OBJECT,
          properties: {},
        },
      },
      {
        name: 'peer_call_tool',
        description:
          'Executes a workspace tool (list_files, read_file, write_file, edit_file, run_command, grep_search, find_files) on a connected peer instance (e.g. "backend" or "frontend") in its workspace.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            peer: {
              type: Type.STRING,
              description: 'Target peer role (e.g. "backend", "frontend") or exact nodeId.',
            },
            tool: {
              type: Type.STRING,
              description:
                'Name of the tool to execute on the peer (e.g. "read_file", "write_file", "run_command", "list_files", "grep_search").',
            },
            args: {
              type: Type.OBJECT,
              description: 'Arguments object for the tool (e.g. {"filePath": "src/api/routes.ts"}).',
            },
          },
          required: ['peer', 'tool', 'args'],
        },
      },
      {
        name: 'peer_send_message',
        description:
          'Sends a structured communication message or coordination request to a connected peer instance (e.g. "backend" or "frontend").',
        parameters: {
          type: Type.OBJECT,
          properties: {
            peer: {
              type: Type.STRING,
              description: 'Target peer role (e.g. "backend", "frontend") or exact nodeId.',
            },
            message: {
              type: Type.STRING,
              description: 'Message or instruction to send to the peer.',
            },
          },
          required: ['peer', 'message'],
        },
      },
    ],
  },
];

/**
 * Mode-specific Tool Exports
 */
export const BUILD_OPENAI_TOOLS = OPENAI_TOOLS;
export const PLAN_OPENAI_TOOLS = OPENAI_TOOLS.filter((t) =>
  [
    'list_files',
    'read_file',
    'grep_search',
    'find_files',
    'fetch_url',
    'web_search',
    'list_peers',
    'peer_call_tool',
    'peer_send_message',
  ].includes(t.function.name)
);

export const BUILD_GEMINI_TOOLS = GEMINI_TOOLS;
export const PLAN_GEMINI_TOOLS = [
  {
    functionDeclarations: GEMINI_TOOLS[0].functionDeclarations.filter((t) =>
      [
        'list_files',
        'read_file',
        'grep_search',
        'find_files',
        'fetch_url',
        'web_search',
        'list_peers',
        'peer_call_tool',
        'peer_send_message',
      ].includes(t.name)
    ),
  },
];
