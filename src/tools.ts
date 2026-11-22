import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { Type } from '@google/genai';
import { askToolConfirmation, renderToolCall, renderToolResult } from './ui.js';
import chalk from 'chalk';

const execAsync = promisify(exec);

export interface SafetySession {
  autoApproveAll: boolean;
}

// Global session safety state
export const safetySession: SafetySession = {
  autoApproveAll: false,
};

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
export async function writeFile(filePath: string, content: string): Promise<string> {
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
    if (!fs.existsSync(dirName)) {
      fs.mkdirSync(dirName, { recursive: true });
    }
    fs.writeFileSync(targetFile, content, 'utf8');
    return `Successfully wrote to "${filePath}" (${content.length} bytes).`;
  } catch (error: any) {
    return `Error writing file "${filePath}": ${error.message}`;
  }
}

/**
 * 4. run_command: Run a shell command (with safety confirmation)
 */
export async function runCommand(command: string): Promise<string> {
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

  console.log(chalk.cyan(`\n⚡ Running command: ${chalk.bold(command)}...`));

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: process.cwd(),
      timeout: 120000, // 2 minutes max
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    const outputParts: string[] = [];
    if (stdout && stdout.trim()) {
      outputParts.push(`[stdout]:\n${stdout.trim()}`);
    }
    if (stderr && stderr.trim()) {
      outputParts.push(`[stderr]:\n${stderr.trim()}`);
    }

    if (outputParts.length === 0) {
      return `Command executed successfully with no output (exit code 0).`;
    }

    return outputParts.join('\n\n');
  } catch (error: any) {
    const output = [
      `Command failed with error: ${error.message}`,
      error.stdout ? `[stdout]:\n${error.stdout.trim()}` : '',
      error.stderr ? `[stderr]:\n${error.stderr.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    return output;
  }
}

/**
 * Tool dispatcher
 */
export async function executeTool(name: string, args: Record<string, any>): Promise<string> {
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
        result = await writeFile(args.filePath, args.content);
        break;
      case 'run_command':
        result = await runCommand(args.command);
        break;
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
      description: 'Executes a shell command in the workspace directory (e.g., npm init, npm install, build, test).',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The shell command line string to run.',
          },
        },
        required: ['command'],
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
        description: 'Executes a shell command in the workspace directory (e.g., npm init, npm install, build, test).',
        parameters: {
          type: Type.OBJECT,
          properties: {
            command: {
              type: Type.STRING,
              description: 'The shell command line string to run.',
            },
          },
          required: ['command'],
        },
      },
    ],
  },
];
