import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import chalk from 'chalk';
import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import * as p from '@clack/prompts';
import { interactiveSelect } from './prompt.js';
import ora, { Ora } from 'ora';

// Initialize terminal markdown renderer
marked.use(
  markedTerminal({
    width: 100,
    reflowText: true,
    showSectionPrefix: false,
    unescape: true,
  })
);

/**
 * Render Markdown content for console output.
 */
export function renderMarkdown(content: string): string {
  try {
    return marked(content).toString().trim();
  } catch {
    return content;
  }
}

/**
 * Print the stylized dark-themed ASCII banner.
 */
export function printBanner(provider?: string, model?: string, workspace?: string): void {
  const brand = chalk.hex('#00FF7F').bold;
  const accentRed = chalk.hex('#FF3366').bold;
  const dim = chalk.gray;

  const asciiArt = `
  ${brand('██████╗  █████╗ ███╗   ██╗ ██████╗ ██╗      █████╗  ██████╗██╗     ██╗')}
  ${brand('██╔══██╗██╔══██╗████╗  ██║██╔════╝ ██║     ██╔══██╗██╔════╝██║     ██║')}
  ${brand('██████╔╝███████║██╔██╗ ██║██║  ███╗██║     ███████║██║     ██║     ██║')}
  ${accentRed('██╔══██╗██╔══██║██║╚██╗██║██║   ██║██║     ██╔══██║██║     ██║     ██║')}
  ${accentRed('██████╔╝██║  ██║██║ ╚████║╚██████╔╝███████╗██║  ██║╚██████╗███████╗██║')}
  ${dim('╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝ ╚═════╝╚══════╝╚═╝')}
  `;

  console.log(asciiArt);
  console.log(
    `  ${chalk.bgHex('#006A4E').white.bold(' 🇧🇩 banglacli v2.0 ')} ${chalk.hex('#00FF7F')(
      'Next-Gen Autonomous BYOK Terminal Coding Agent'
    )}`
  );
  console.log(
    `  ${dim('Speaks natural')} ${chalk.bold.white('English')}${dim(',')} ` +
      `${chalk.bold.cyan('Banglish')}${dim(', & understands ')} ${chalk.bold.hex('#FFDF00')('Bangla')}`
  );
  console.log(
    `  ${dim('Developer:')} ${chalk.bold.hex('#00FF7F')('Rakib Hasan Shuvo')} ${dim('(@rakibhasanshuvo712-hub)')}\n`
  );

  if (provider && model) {
    console.log(
      `  ${dim('Provider:')} ${chalk.bold.cyan(provider)}  ` +
        `${dim('Model:')} ${chalk.bold.green(model)}  ` +
        `${dim('Workspace:')} ${chalk.gray(workspace || process.cwd())}`
    );
  }
  console.log(
    `  ${dim('Commands:')} ${chalk.yellow('/mode')} ${dim('•')} ` +
      `${chalk.yellow('/agent')} ${dim('•')} ` +
      `${chalk.yellow('/doctor')} ${dim('•')} ` +
      `${chalk.yellow('/stats')} ${dim('•')} ` +
      `${chalk.yellow('/limits')} ${dim('•')} ` +
      `${chalk.yellow('/help')} ${dim('•')} ${chalk.yellow('/exit')}`
  );
  console.log(dim('─'.repeat(78)));
}

/**
 * Render the bottom status bar displaying active mode, model, and quick shortcuts.
 */
export function renderStatusBar(mode: 'build' | 'plan', model: string, provider?: string): void {
  const isBuild = mode === 'build';
  const modeBadge = isBuild
    ? chalk.bgHex('#00C853').black.bold(' ⚡ BUILD MODE ')
    : chalk.bgHex('#FFB300').black.bold(' 📋 PLAN MODE ');

  const modeText = isBuild
    ? chalk.green.bold('Autonomous Coder')
    : chalk.yellow.bold('Architect (Read-Only)');

  const modelBadge = chalk.bgHex('#1A237E').white.bold(` 🤖 ${model} `);
  const cascadeBadge = chalk.bgHex('#004D40').hex('#00FF7F').bold(' 🔄 Auto-Cascade Active ');
  const helpHint = chalk.dim('• /mode • /agent • /limits • /help');

  console.log(`\n${modeBadge} ${modeText}  ${modelBadge}  ${cascadeBadge}  ${helpHint}`);
}

/**
 * Render sleek auto-cascade notification when a model token limit is reached.
 */
export function renderCascadeNotice(fromModel: string, toModel: string, reason: string): void {
  const cols = process.stdout.columns || 80;
  const width = Math.max(36, Math.min(cols - 4, 70));
  const border = chalk.hex('#FF9900')('─'.repeat(width));
  process.stdout.write('\r\x1b[2K\n');
  console.log(border);
  console.log(
    chalk.bgHex('#FF9900').black.bold(' 🔄 AUTO-CASCADE ACTIVATED ') +
      ' ' +
      chalk.white.bold(`Token / Rate limit reached on: ${chalk.yellow(fromModel)}`)
  );
  console.log(
    chalk.hex('#00FF7F').bold('✔ Seamlessly continuing with: ') +
      chalk.bold.cyan(toModel) +
      chalk.gray(` (${reason})`)
  );
  console.log(chalk.gray('Your task and conversation continue without any loss of context.'));
  console.log(border + '\n');
}

/**
 * Display action details before executing a dangerous tool (write_file or run_command).
 */
export async function askToolConfirmation(
  toolName: 'write_file' | 'run_command' | 'edit_file',
  summary: string
): Promise<'yes' | 'no' | 'all'> {
  console.log('\n' + chalk.bgHex('#FF9900').black.bold(' ⚠️  SAFETY CONFIRMATION '));
  console.log(
    `${chalk.gray('Tool:')} ${chalk.cyan.bold(toolName)}`
  );
  console.log(`${chalk.gray('Details:')}\n${chalk.white(summary)}`);

  const choice = await interactiveSelect<'yes' | 'no' | 'all'>({
    message: 'Allow banglaCLI to execute this action?',
    options: [
      { value: 'yes', label: chalk.green('✔ Yes, execute this action') },
      { value: 'all', label: chalk.cyan('⚡ Yes to ALL actions (Auto-approve for this session)') },
      { value: 'no', label: chalk.red('✖ No, cancel / reject this action') },
    ],
  });

  if (!choice || p.isCancel(choice)) {
    return 'no';
  }

  return choice;
}

/**
 * Render tool call badge.
 */
export function renderToolCall(toolName: string, args: Record<string, any>): void {
  const badge = chalk.bgHex('#0047AB').white.bold(` 🛠️  TOOL: ${toolName} `);
  console.log(`\n${badge}`);
  if (toolName === 'write_file') {
    console.log(chalk.gray(`Path: `) + chalk.cyan(args.filePath));
    const lines = typeof args.content === 'string' ? args.content.split('\n').length : 0;
    console.log(chalk.gray(`Lines: `) + chalk.yellow(`${lines} lines`));
  } else if (toolName === 'run_command') {
    console.log(chalk.gray(`Command: `) + chalk.magenta.bold(args.command));
  } else if (toolName === 'read_file') {
    console.log(chalk.gray(`Reading: `) + chalk.cyan(args.filePath));
  } else if (toolName === 'list_files') {
    console.log(chalk.gray(`Directory: `) + chalk.cyan(args.dirPath || '.'));
  } else if (toolName === 'grep_search') {
    console.log(chalk.gray(`Searching for: `) + chalk.cyan.bold(args.query) + (args.filePattern ? chalk.gray(` in ${args.filePattern}`) : ''));
  } else if (toolName === 'find_files') {
    console.log(chalk.gray(`Pattern: `) + chalk.cyan.bold(args.pattern));
  } else if (toolName === 'fetch_url') {
    console.log(chalk.gray(`Fetching URL: `) + chalk.cyan.bold(args.url));
  }
}

/**
 * Render tool completion result.
 */
export function renderToolResult(toolName: string, result: string, isError = false): void {
  if (isError) {
    console.log(chalk.red(`✖ [${toolName} error]: ${result.trim()}`));
  } else {
    // Truncate overly long result previews in UI
    const preview = result.length > 300 ? result.slice(0, 300) + '...\n' + chalk.dim(`(truncated ${result.length} chars)`) : result;
    console.log(chalk.green(`✔ [${toolName} completed]:`));
    console.log(chalk.dim(preview.trim()));
  }
}

/**
 * Create an ora spinner instance.
 */
export function createSpinner(text: string): Ora {
  return ora({
    text: chalk.cyan(text),
    color: 'cyan',
    spinner: 'dots',
    stream: process.stdout,
  });
}

/**
 * Render Antigravity-style Priority Task Banner
 */
export function renderPriorityTaskBanner(task: string, model: string, mode: 'build' | 'plan'): void {
  const border = chalk.hex('#00FF7F')('═'.repeat(78));
  console.log('\n' + border);
  console.log(
    chalk.bgHex('#00FF7F').black.bold(' ⚡ [PRIORITY TASK DISPATCH] ') +
      ' ' +
      chalk.white.bold('Executing specific priority task first (Antigravity mode)')
  );
  console.log(
    `  ${chalk.gray('Selected Model:')} ${chalk.bold.hex('#00FF7F')(model)}  ` +
      `${chalk.gray('Mode:')} ${mode === 'build' ? chalk.green.bold('⚡ BUILD') : chalk.yellow.bold('📋 PLAN')}  ` +
      `${chalk.gray('(Press')} ${chalk.yellow.bold('Esc')} ${chalk.gray('anytime to stop)')}`
  );
  console.log(`  ${chalk.gray('Task:')} ${chalk.cyan.bold(task)}`);
  console.log(border + '\n');
}

/**
 * Render clean interruption notice when Escape key is pressed.
 */
export function renderInterruptedNotice(): void {
  console.log(
    '\n' +
      chalk.bgHex('#FF3366').white.bold(' ⏹️  EXECUTION STOPPED ') +
      ' ' +
      chalk.yellow.bold('Model stopped working by user (Escape key pressed).') +
      '\n' +
      chalk.gray('Processes terminated cleanly. Returned to banglacli prompt.\n')
  );
}

/**
 * Render system diagnostic report (OpenCode /doctor style)
 */
export function renderDoctorReport(checks: { name: string; status: 'ok' | 'warn' | 'error'; detail: string }[]): void {
  const border = chalk.hex('#00FF7F')('═'.repeat(74));
  console.log('\n' + border);
  console.log(chalk.bgHex('#006A4E').white.bold(' 🩺 BANGLACLI SYSTEM DOCTOR (SYSTEM HEALTH REPORT) '));
  console.log(chalk.gray('Comprehensive diagnostic check of your agent environment:\n'));

  for (const c of checks) {
    const symbol =
      c.status === 'ok'
        ? chalk.green.bold('  ✔ [PASS]')
        : c.status === 'warn'
        ? chalk.yellow.bold('  ⚠️  [WARN]')
        : chalk.red.bold('  ✖ [FAIL]');
    console.log(`${symbol} ${chalk.white.bold(c.name)}: ${chalk.gray(c.detail)}`);
  }
  console.log(border + '\n');
}

/**
 * Render Live Session Intelligence & Cost Tracker (/stats or /cost)
 */
export function renderSessionStats(stats: {
  model: string;
  provider: string;
  mode: string;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  totalRequests: number;
  estimatedCostSavedUsd: number;
  filesTouched: number;
}): void {
  const border = chalk.hex('#00FF7F')('─'.repeat(70));
  console.log('\n' + border);
  console.log(chalk.bgHex('#1A237E').white.bold(' 📊 LIVE SESSION INTELLIGENCE & SAVINGS (OpenCode Style) '));
  console.log(chalk.dim('─'.repeat(70)));
  console.log(`  ${chalk.gray('Active Provider:')}    ${chalk.bold.cyan(stats.provider)}`);
  console.log(`  ${chalk.gray('Selected Model:')}     ${chalk.bold.green(stats.model)}`);
  console.log(`  ${chalk.gray('Current Mode:')}       ${stats.mode === 'build' ? chalk.green.bold('⚡ BUILD') : chalk.yellow.bold('📋 PLAN')}`);
  console.log(`  ${chalk.gray('Total LLM Calls:')}    ${chalk.bold.yellow(stats.totalRequests)} calls`);
  console.log(`  ${chalk.gray('Total Tokens Used:')}  ${chalk.bold.white(stats.totalTokens.toLocaleString())} tokens ${chalk.dim(`(Prompt: ${stats.promptTokens.toLocaleString()} • Completion: ${stats.completionTokens.toLocaleString()})`)}`);
  console.log(`  ${chalk.gray('Estimated Savings:')}  ${chalk.bold.hex('#00FF7F')(`$${stats.estimatedCostSavedUsd.toFixed(3)} USD`)} ${chalk.dim('(vs commercial GPT-4 / Opus)')}`);
  console.log(`  ${chalk.gray('Files Touched:')}      ${chalk.bold.cyan(stats.filesTouched)} file(s)`);
  console.log(border + '\n');
}

/**
 * Show a styled help manual.
 */
export function showHelp(): void {
  console.log('\n' + chalk.bold.hex('#00FF7F')('🇧🇩 banglacli Help & Usage Guide'));
  console.log(chalk.dim('─'.repeat(70)));
  console.log(`${chalk.yellow.bold('Agent Modes (OpenCode Style):')}`);
  console.log(`  ${chalk.green.bold('⚡ BUILD Mode')}   - Autonomous full-stack coder. Can create/edit files & run terminal commands.`);
  console.log(`  ${chalk.yellow.bold('📋 PLAN Mode')}    - Senior Architect. Read-only codebase investigation & step-by-step planning.`);
  console.log(`\n${chalk.yellow.bold('Slash Commands in Chat (OpenCode & Antigravity Style):')}`);
  console.log(`  ${chalk.cyan('/image')}        - Paste screenshot from system clipboard or stage an image (alias: /screenshot, /pic)`);
  console.log(`  ${chalk.cyan('/task <query>')} - Push and execute a specific task first with priority (like Antigravity)`);
  console.log(`  ${chalk.cyan('/urgent <q>')}   - Alias for priority task dispatch (also supports "urgent: <task>")`);
  console.log(`  ${chalk.cyan('/mode')}        - Toggle or select between BUILD mode and PLAN mode`);
  console.log(`  ${chalk.cyan('/plan')}        - Switch instantly to PLAN mode (architectural read-only)`);
  console.log(`  ${chalk.cyan('/build')}       - Switch instantly to BUILD mode (autonomous coding & execution)`);
  console.log(`  ${chalk.cyan('/agent')}       - OpenCode AI agent & model selector (Free, Zen Roster, Gemini, DeepSeek, HY4, GLM, Groq)`);
  console.log(`  ${chalk.cyan('/model [name]')} - Switch model anytime (alias: /m, /models) or press ${chalk.yellow.bold('Tab')} in prompt`);
  console.log(`  ${chalk.cyan('/provider')}    - Switch AI provider (Gemini, OpenRouter, Custom)`);
  console.log(`  ${chalk.cyan('/doctor')}      - Run automated environment & configuration diagnostic health check`);
  console.log(`  ${chalk.cyan('/stats')}       - View live session tokens, LLM calls, and estimated dollar savings`);
  console.log(`  ${chalk.cyan('/diff')}        - Show files modified or created in this session`);
  console.log(`  ${chalk.cyan('/undo')}        - Revert the most recent file change made by agent`);
  console.log(`  ${chalk.cyan('/git')}         - View git branch, modified files, and recent commits`);
  console.log(`  ${chalk.cyan('/tree')}        - View elegant Unicode directory tree of workspace`);
  console.log(`  ${chalk.cyan('/detect')}      - View detected project stack, package manager & scripts`);
  console.log(`  ${chalk.cyan('/compact')}     - Compact conversation history to free context window`);
  console.log(`  ${chalk.cyan('/session')}     - View active session status, files touched & memory`);
  console.log(`  ${chalk.cyan('/peers')}       - View connected cross-instance mesh peers (e.g. backend, frontend)`);
  console.log(`  ${chalk.cyan('/role')}        - View or change instance role (/role frontend, /role backend)`);
  console.log(`  ${chalk.cyan('/send')}        - Send direct message to a peer (/send backend <message>)`);
  console.log(`  ${chalk.cyan('/limits')}      - View complete token limits, context windows & rate limits for all models (alias: /limit, /tokens)`);
  console.log(`  ${chalk.cyan('/renewal')}     - Display live token renewal countdown timer and reset schedules (alias: /countdown)`);
  console.log(`  ${chalk.cyan('/guide')}       - Direct free API links & models guide (Free API Guide)`);
  console.log(`  ${chalk.cyan('/config')}      - Full interactive configuration wizard`);
  console.log(`  ${chalk.cyan('/about')}       - View developer information, GitHub account & project details`);
  console.log(`  ${chalk.cyan('/clear')}       - Clear conversation history / reset memory`);
  console.log(`  ${chalk.cyan('/exit')}        - Exit banglacli session`);
  console.log(`\n${chalk.yellow.bold('OpenCode & Antigravity Interactive Input Controls:')}`);
  console.log(`  • ${chalk.green.bold('Screenshot / Image')}: Run ${chalk.cyan('/image')} to paste from clipboard, or mention ${chalk.cyan('@screenshot.png')} / drag-drop an image.`);
  console.log(`  • ${chalk.green.bold('Pasting Safety')}  : Bracketed paste protection enabled! Pasting code, JSON or multi-line logs`);
  console.log(`                     ${chalk.dim('never auto-submits. It captures cleanly and waits for your Enter key.')}`);
  console.log(`  • ${chalk.green.bold('@ Mentions')}     : Type ${chalk.cyan('@path/to/file')} (e.g. ${chalk.cyan('@package.json')}) or ${chalk.cyan('@dir/')} to auto-ingest.`);
  console.log(`  • ${chalk.green.bold('Web Ingestion')}  : Include any ${chalk.cyan('https://...')} link to auto-fetch documentation or APIs.`);
  console.log(`  • ${chalk.green.bold('Shift + Enter')}  : Insert a new line (${chalk.cyan('Alt+Enter')} or ${chalk.cyan('Ctrl+J')}) for multiline writing.`);
  console.log(`  • ${chalk.green.bold('Enter')}          : Submit your prompt to the active AI agent.`);
  console.log(`  • ${chalk.green.bold('Escape')}         : Clear input buffer while typing; stops agent immediately while running.`);

  console.log(`\n${chalk.yellow.bold('Autonomous Tool Capabilities (12 Built-in Tools):')}`);
  console.log(`  1. ${chalk.bold('list_files')}   - Lists workspace files (ignoring node_modules, .git)`);
  console.log(`  2. ${chalk.bold('read_file')}    - Reads contents of any file in workspace`);
  console.log(`  3. ${chalk.bold('write_file')}   - Creates directories and writes new files (BUILD mode)`);
  console.log(`  4. ${chalk.bold('edit_file')}    - Surgically replaces code blocks in existing files (BUILD mode)`);
  console.log(`  5. ${chalk.bold('run_command')}  - Runs commands sequentially one by one (BUILD mode)`);
  console.log(`  6. ${chalk.bold('grep_search')}  - Fast text/regex search across workspace files`);
  console.log(`  7. ${chalk.bold('find_files')}   - Finds files by wildcard patterns (e.g. "*.json")`);
  console.log(`  8. ${chalk.bold('fetch_url')}    - Fetches web/API documentation directly`);
  console.log(`  9. ${chalk.bold('web_search')}   - Autonomous web search for docs, APIs & solutions`);
  console.log(`  10. ${chalk.bold('list_peers')}  - Discovers connected peer instances across the mesh`);
  console.log(`  11. ${chalk.bold('peer_call_tool')} - Triggers tools on peer instances across workspaces safely`);
  console.log(`  12. ${chalk.bold('peer_send_message')} - Sends structured messages/contracts to peer instances`);

  console.log(`\n${chalk.yellow.bold('Language Support (Outputs strictly in English):')}`);
  console.log(`  • ${chalk.green('English:')}  "Build a full-stack Next.js portfolio website"`);
  console.log(`  • ${chalk.green('Banglish:')} "Express diye ekta REST API banaw auth soho"`);
  console.log(`  • ${chalk.green('Bangla:')}   "Ekta React counter component baniye daw" (Input accepted, instructions in English)`);
  console.log(`\n  ${chalk.gray('Lead Developer & Creator:')} ${chalk.hex('#00FF7F').bold('Rakib Hasan Shuvo')} ${chalk.dim('(https://github.com/rakibhasanshuvo712-hub)')}`);
  console.log(chalk.dim('─'.repeat(70)) + '\n');
}

/**
 * Show a comprehensive guide with updated links for getting free API keys and models.
 */
export function showFreeApiKeyGuide(): void {
  const line = chalk.dim('─'.repeat(78));
  console.log('\n' + chalk.bgHex('#006A4E').white.bold(' 🔑 FREE API KEYS & MODELS GUIDE (100% Free Coding Tier) '));
  console.log(chalk.gray('Get free API keys with generous quotas for banglaCLI - no credit card required!\n'));

  // 1. Google Gemini
  console.log(chalk.bold.hex('#00FF7F')('1. Google Gemini (Google AI Studio) - 🌟 RECOMMENDED'));
  console.log(`   ${chalk.gray('Direct Link:')} ${chalk.bold.underline.cyan('https://aistudio.google.com/apikey')}`);
  console.log(`   ${chalk.gray('Steps:')} Sign in with Google ➔ Click "${chalk.white('Create API Key')}" ➔ Copy key.`);
  console.log(`   ${chalk.gray('Best Free Model:')} ${chalk.bold.yellow('gemini-2.0-flash')} (🌟 100% Free, flagship speed & 1,500 RPD)`);
  console.log(`   ${chalk.gray('Alternative Free Models:')} ${chalk.white('gemini-2.0-flash-lite, gemini-2.5-flash, gemini-1.5-flash')}`);
  console.log(`   ${chalk.gray('Quota:')} Free tier gives 15 Requests/min & 1,500 Requests/day for free!\n`);

  // 2. OpenRouter Free Models
  console.log(chalk.bold.hex('#00FF7F')('2. OpenRouter (Access 14+ 100% Free Frontier Models)'));
  console.log(`   ${chalk.gray('Direct Link:')} ${chalk.bold.underline.cyan('https://openrouter.ai/keys')}`);
  console.log(`   ${chalk.gray('Steps:')} Sign in with GitHub/Google ➔ Click "${chalk.white('Create Key')}" ➔ Copy key.`);
  console.log(`   ${chalk.gray('Top Free Agent Models (Zero Cost):')}`);
  console.log(`     • ${chalk.yellow('openrouter/free')} (🌟 Auto Best Free Model - Zero downtime)`);
  console.log(`     • ${chalk.yellow('particle-ai/particle-1:free')} (1 Million token context agentic coding model)`);
  console.log(`     • ${chalk.yellow('nvidia/nemotron-3-ultra-550b-a55b:free')} (Massive 550B frontier model, 1M context)`);
  console.log(`     • ${chalk.yellow('google/gemma-4-31b-it:free')} (Google DeepMind 31B code instruction model)`);
  console.log(`     • ${chalk.yellow('google/gemma-4-26b-a4b-it:free')} (Google Gemma MoE coding model)`);
  console.log(`     • ${chalk.yellow('nvidia/nemotron-3.5-lightning:free')} (1M token context ultra-fast MoE)`);
  console.log(`     • ${chalk.yellow('baidu/ernie-5.5-flash-preview:free')} (1M token context foundation model)`);
  console.log(`     • ${chalk.yellow('inclusionai/ling-3.2-flash:free')} (1M token context hybrid reasoning)`);
  console.log(`   ${chalk.gray('Quota:')} 100% Free with zero payment or credit card needed!\n`);

  // 3. DeepSeek Platform
  console.log(chalk.bold.hex('#00D2FF')('3. DeepSeek Platform (5,000,000 Free Tokens - 🌟 SOTA Coding)'));
  console.log(`   ${chalk.gray('Direct Link:')} ${chalk.bold.underline.cyan('https://platform.deepseek.com')}`);
  console.log(`   ${chalk.gray('Steps:')} Sign up with Email/Google ➔ Create API Key ➔ 5 Million free tokens credited.`);
  console.log(`   ${chalk.gray('In banglacli:')} Select "${chalk.white('Custom OpenAI-Compatible')}"`);
  console.log(`   ${chalk.gray('Base URL:')} ${chalk.cyan('https://api.deepseek.com/v1')}`);
  console.log(`   ${chalk.gray('Models:')} ${chalk.yellow('deepseek-chat')} (V3 Coding), ${chalk.yellow('deepseek-reasoner')} (R1 Chain-of-Thought)`);
  console.log(`   ${chalk.gray('Quota:')} 5,000,000 free tokens upon registration!\n`);

  // 4. Groq (Blazing Fast Inference)
  console.log(chalk.bold.hex('#00FF7F')('4. Groq Cloud (Ultra-Fast 500+ tokens/sec - Free Tier)'));
  console.log(`   ${chalk.gray('Direct Link:')} ${chalk.bold.underline.cyan('https://console.groq.com/keys')}`);
  console.log(`   ${chalk.gray('Steps:')} Select "${chalk.white('Custom OpenAI-Compatible')}" in banglacli.`);
  console.log(`   ${chalk.gray('Base URL:')} ${chalk.cyan('https://api.groq.com/openai/v1')}`);
  console.log(`   ${chalk.gray('Free Models:')} ${chalk.yellow('deepseek-r1-distill-llama-70b')}, ${chalk.yellow('llama-3.3-70b-versatile')}, ${chalk.yellow('qwen-2.5-coder-32b')}`);
  console.log(`   ${chalk.gray('Quota:')} 14,400 Requests per day free!\n`);

  // 5. Cerebras Cloud (1,800+ tokens/sec - Free Tier)
  console.log(chalk.bold.hex('#00FF7F')('5. Cerebras Cloud (World\'s Fastest 1,800+ tokens/sec - Free Tier)'));
  console.log(`   ${chalk.gray('Direct Link:')} ${chalk.bold.underline.cyan('https://cloud.cerebras.ai')}`);
  console.log(`   ${chalk.gray('Base URL:')} ${chalk.cyan('https://api.cerebras.ai/v1')}`);
  console.log(`   ${chalk.gray('Free Models:')} ${chalk.yellow('llama3.3-70b')}, ${chalk.yellow('llama3.1-8b')} (128k Context)`);
  console.log(`   ${chalk.gray('Quota:')} Free tier available with ultra-low latency!\n`);

  // 6. Local Offline Models (Ollama)
  console.log(chalk.bold.hex('#00FF7F')('6. Local Offline (100% Private, Free & Offline via Ollama)'));
  console.log(`   ${chalk.gray('Download:')} ${chalk.bold.underline.cyan('https://ollama.com')}`);
  console.log(`   ${chalk.gray('Run in Terminal:')} ${chalk.white('ollama run qwen2.5-coder')}`);
  console.log(`   ${chalk.gray('In banglacli:')} Choose "${chalk.white('Custom OpenAI-Compatible')}"`);
  console.log(`   ${chalk.gray('Base URL:')} ${chalk.cyan('http://localhost:11434/v1')}`);
  console.log(`   ${chalk.gray('API Key:')} Any text (e.g. ${chalk.white('ollama')})\n`);

  console.log(line);
  console.log(chalk.cyan(`💡 Tip: Use ${chalk.yellow.bold('/provider')} or ${chalk.yellow.bold('/config')} in chat to switch anytime!\n`));
}

/**
 * Show detailed token limits, context windows, and rate limits for ALL supported models across all providers.
 */
export function showTokenLimitsGuide(): void {
  const line = chalk.dim('─'.repeat(88));
  console.log('\n' + chalk.bgHex('#0047AB').white.bold(' 📊 COMPLETE TOKEN LIMITS & RATE LIMITS GUIDE (ALL MODELS) '));
  console.log(chalk.gray('Exact context window tokens, rate limits (RPM/TPM), and daily quotas for all 83+ models in banglaCLI:\n'));

  // 1. Google Gemini Suite
  console.log(chalk.bold.hex('#00FF7F')('1. Google Gemini Suite (Google AI Studio Free Tier)'));
  console.log(chalk.dim('┌────────────────────────┬────────────────┬──────────────┬──────────────┬──────────────┐'));
  console.log(chalk.dim('│') + chalk.bold(' Model                  ') + chalk.dim('│') + chalk.bold(' Context Window ') + chalk.dim('│') + chalk.bold(' Req / Minute ') + chalk.dim('│') + chalk.bold(' Tokens / Min ') + chalk.dim('│') + chalk.bold(' Daily Quota  ') + chalk.dim('│'));
  console.log(chalk.dim('├────────────────────────┼────────────────┼──────────────┼──────────────┼──────────────┤'));
  console.log(chalk.dim('│') + chalk.green(' gemini-3.5-flash-lite  ') + chalk.dim('│') + chalk.white(' 1,048,576 toks ') + chalk.dim('│') + chalk.yellow(' 15 RPM       ') + chalk.dim('│') + chalk.cyan(' 1,000,000 TPM') + chalk.dim('│') + chalk.green(' 1,500 RPD    ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' gemini-3.5-flash       ') + chalk.dim('│') + chalk.white(' 1,048,576 toks ') + chalk.dim('│') + chalk.yellow(' 15 RPM       ') + chalk.dim('│') + chalk.cyan(' 1,000,000 TPM') + chalk.dim('│') + chalk.green(' 1,500 RPD    ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' gemini-3.8-flash       ') + chalk.dim('│') + chalk.white(' 1,048,576 toks ') + chalk.dim('│') + chalk.yellow(' 15 RPM       ') + chalk.dim('│') + chalk.cyan(' 1,000,000 TPM') + chalk.dim('│') + chalk.green(' 1,500 RPD    ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' gemini-3.1-flash-lite  ') + chalk.dim('│') + chalk.white(' 1,048,576 toks ') + chalk.dim('│') + chalk.yellow(' 30 RPM       ') + chalk.dim('│') + chalk.cyan(' 1,000,000 TPM') + chalk.dim('│') + chalk.green(' 1,500 RPD    ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' gemini-2.0-flash       ') + chalk.dim('│') + chalk.white(' 1,048,576 toks ') + chalk.dim('│') + chalk.yellow(' 15 RPM       ') + chalk.dim('│') + chalk.cyan(' 1,000,000 TPM') + chalk.dim('│') + chalk.green(' Auto->3.5    ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' gemini-1.5-pro         ') + chalk.dim('│') + chalk.cyan(' 2,097,152 toks ') + chalk.dim('│') + chalk.yellow(' 5 RPM        ') + chalk.dim('│') + chalk.cyan(' 1,000,000 TPM') + chalk.dim('│') + chalk.yellow(' 50 RPD       ') + chalk.dim('│'));
  console.log(chalk.dim('└────────────────────────┴────────────────┴──────────────┴──────────────┴──────────────┘'));
  console.log(chalk.gray('ℹ️ Daily resets at 00:00 UTC. Gemini 3.5 Flash Lite is the primary autonomous coding model.\n'));

  // 2. OpenRouter 100% Free Suite
  console.log(chalk.bold.hex('#00FF7F')('2. 100% Free OpenRouter Models (Zero-Plan Coding Fleet)'));
  console.log(chalk.dim('┌────────────────────────────────────────────────┬────────────────┬──────────────┬──────────────┐'));
  console.log(chalk.dim('│') + chalk.bold(' Model                                          ') + chalk.dim('│') + chalk.bold(' Context Window ') + chalk.dim('│') + chalk.bold(' Rate Limit   ') + chalk.dim('│') + chalk.bold(' Free Tier    ') + chalk.dim('│'));
  console.log(chalk.dim('├────────────────────────────────────────────────┼────────────────┼──────────────┼──────────────┤'));
  console.log(chalk.dim('│') + chalk.green(' openrouter/free                                ') + chalk.dim('│') + chalk.white(' 200,000 toks   ') + chalk.dim('│') + chalk.yellow(' 20 RPM        ') + chalk.dim('│') + chalk.green(' 100% Free    ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' particle-ai/particle-1:free                    ') + chalk.dim('│') + chalk.cyan(' 1,048,576 toks ') + chalk.dim('│') + chalk.yellow(' 20 RPM        ') + chalk.dim('│') + chalk.green(' 1M Free      ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' nvidia/nemotron-3-ultra-550b:free              ') + chalk.dim('│') + chalk.cyan(' 1,000,000 toks ') + chalk.dim('│') + chalk.yellow(' 20 RPM        ') + chalk.dim('│') + chalk.green(' 1M Free      ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' google/gemma-4-31b-it:free                     ') + chalk.dim('│') + chalk.white(' 262,144 toks   ') + chalk.dim('│') + chalk.yellow(' 20 RPM        ') + chalk.dim('│') + chalk.green(' 256K Free    ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' google/gemma-4-26b-a4b-it:free                 ') + chalk.dim('│') + chalk.white(' 262,144 toks   ') + chalk.dim('│') + chalk.yellow(' 20 RPM        ') + chalk.dim('│') + chalk.green(' MoE Free     ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' nvidia/nemotron-3.5-lightning:free             ') + chalk.dim('│') + chalk.cyan(' 1,000,000 toks ') + chalk.dim('│') + chalk.yellow(' 20 RPM        ') + chalk.dim('│') + chalk.green(' Fast 1M Free ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' nvidia/nemotron-3.5-super-vl:free              ') + chalk.dim('│') + chalk.cyan(' 1,000,000 toks ') + chalk.dim('│') + chalk.yellow(' 20 RPM        ') + chalk.dim('│') + chalk.green(' Vision 1M    ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' nvidia/nemotron-3-nano-omni-30b-a3b:free       ') + chalk.dim('│') + chalk.white(' 256,000 toks   ') + chalk.dim('│') + chalk.yellow(' 20 RPM        ') + chalk.dim('│') + chalk.green(' Reasoning    ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' baidu/ernie-5.5-flash-preview:free             ') + chalk.dim('│') + chalk.cyan(' 1,024,000 toks ') + chalk.dim('│') + chalk.yellow(' 20 RPM        ') + chalk.dim('│') + chalk.green(' 1M Free      ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' inclusionai/ling-3.2-flash:free                ') + chalk.dim('│') + chalk.cyan(' 1,048,576 toks ') + chalk.dim('│') + chalk.yellow(' 20 RPM        ') + chalk.dim('│') + chalk.green(' 1M Free      ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' meta-llama/llama-3.3-70b-instruct:free         ') + chalk.dim('│') + chalk.white(' 131,072 toks   ') + chalk.dim('│') + chalk.yellow(' 20 RPM        ') + chalk.dim('│') + chalk.green(' 128K Free    ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' qwen/qwen-2.5-coder-32b-instruct:free         ') + chalk.dim('│') + chalk.white(' 32,768 toks    ') + chalk.dim('│') + chalk.yellow(' 20 RPM        ') + chalk.dim('│') + chalk.green(' Code 32K     ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' mistralai/mistral-small-24b-instruct-2501:free ') + chalk.dim('│') + chalk.white(' 32,768 toks    ') + chalk.dim('│') + chalk.yellow(' 20 RPM        ') + chalk.dim('│') + chalk.green(' Small 32K    ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' deepseek/deepseek-r1:free                      ') + chalk.dim('│') + chalk.white(' 163,840 toks   ') + chalk.dim('│') + chalk.yellow(' 20 RPM        ') + chalk.dim('│') + chalk.green(' R1 Free      ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' deepseek/deepseek-chat:free                    ') + chalk.dim('│') + chalk.white(' 64,000 toks    ') + chalk.dim('│') + chalk.yellow(' 20 RPM        ') + chalk.dim('│') + chalk.green(' Chat Free    ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' mistralai/devstral-2512:free                   ') + chalk.dim('│') + chalk.white(' 131,072 toks   ') + chalk.dim('│') + chalk.yellow(' 20 RPM        ') + chalk.dim('│') + chalk.green(' 128K Free    ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' liquid/lfm-3-1.7b:free                         ') + chalk.dim('│') + chalk.white(' 32,768 toks    ') + chalk.dim('│') + chalk.yellow(' 20 RPM        ') + chalk.dim('│') + chalk.green(' Edge Free    ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' recursive/flint-v1.0:free                      ') + chalk.dim('│') + chalk.white(' 131,072 toks   ') + chalk.dim('│') + chalk.yellow(' 20 RPM        ') + chalk.dim('│') + chalk.green(' 128K Free    ') + chalk.dim('│'));
  console.log(chalk.dim('└────────────────────────────────────────────────┴────────────────┴──────────────┴──────────────┘'));
  console.log(chalk.gray('ℹ️ 100% Free on OpenRouter with zero credit card required. Free tier rate limits reset daily.\n'));

  // 3. DeepSeek Platform Frontier Models
  console.log(chalk.bold.hex('#00FF7F')('3. DeepSeek Platform Models (platform.deepseek.com)'));
  console.log(`   • ${chalk.white('deepseek-chat')} (V3/V2.5)  : ${chalk.cyan('128,000 tokens')} context | Rolling RPM | ${chalk.green('5,000,000 Free Starter Tokens')}`);
  console.log(`   • ${chalk.white('deepseek-reasoner')} (R1)   : ${chalk.cyan('128,000 tokens')} context | Deep CoT reasoning | ${chalk.green('5,000,000 Free Starter Tokens')}`);
  console.log(`   • ${chalk.white('deepseek-coder')}           : ${chalk.cyan('128,000 tokens')} context | Specialized coding engine | ${chalk.green('5,000,000 Free Starter Tokens')}\n`);

  // 4. Groq Cloud Ultra-Fast Free Suite
  console.log(chalk.bold.hex('#00FF7F')('4. Groq Cloud Free Tier (console.groq.com)'));
  console.log(chalk.dim('┌──────────────────────────────┬────────────────┬──────────────┬──────────────┬──────────────┐'));
  console.log(chalk.dim('│') + chalk.bold(' Model                        ') + chalk.dim('│') + chalk.bold(' Context Window ') + chalk.dim('│') + chalk.bold(' Req / Minute ') + chalk.dim('│') + chalk.bold(' Tokens / Min ') + chalk.dim('│') + chalk.bold(' Daily Quota  ') + chalk.dim('│'));
  console.log(chalk.dim('├──────────────────────────────┼────────────────┼──────────────┼──────────────┼──────────────┤'));
  console.log(chalk.dim('│') + chalk.green(' llama-3.3-70b-versatile      ') + chalk.dim('│') + chalk.white(' 128,000 toks   ') + chalk.dim('│') + chalk.yellow(' 30 RPM       ') + chalk.dim('│') + chalk.cyan(' 6,000 TPM    ') + chalk.dim('│') + chalk.green(' 14,400 RPD   ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' qwen-2.5-coder-32b           ') + chalk.dim('│') + chalk.white(' 128,000 toks   ') + chalk.dim('│') + chalk.yellow(' 30 RPM       ') + chalk.dim('│') + chalk.cyan(' 6,000 TPM    ') + chalk.dim('│') + chalk.green(' 14,400 RPD   ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' llama-3.1-8b-instant         ') + chalk.dim('│') + chalk.white(' 128,000 toks   ') + chalk.dim('│') + chalk.yellow(' 30 RPM       ') + chalk.dim('│') + chalk.cyan(' 20,000 TPM   ') + chalk.dim('│') + chalk.green(' 14,400 RPD   ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' mixtral-8x7b-32768           ') + chalk.dim('│') + chalk.white(' 32,768 toks    ') + chalk.dim('│') + chalk.yellow(' 30 RPM       ') + chalk.dim('│') + chalk.cyan(' 5,000 TPM    ') + chalk.dim('│') + chalk.green(' 14,400 RPD   ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' gemma2-9b-it                 ') + chalk.dim('│') + chalk.white(' 8,192 toks     ') + chalk.dim('│') + chalk.yellow(' 30 RPM       ') + chalk.dim('│') + chalk.cyan(' 15,000 TPM   ') + chalk.dim('│') + chalk.green(' 14,400 RPD   ') + chalk.dim('│'));
  console.log(chalk.dim('└──────────────────────────────┴────────────────┴──────────────┴──────────────┴──────────────┘'));
  console.log(chalk.gray('ℹ️ Groq delivers 500+ tokens/second inference with a generous 14,400 requests/day free quota!\n'));

  // 5. Frontier Flagship Coding Agents (BYOK)
  console.log(chalk.bold.hex('#00FF7F')('5. Frontier Flagship Coding Agents (OpenRouter / BYOK)'));
  console.log(`   • ${chalk.white('anthropic/claude-3.5-sonnet')} : ${chalk.cyan('200,000 tokens')} context | Top-ranked coding benchmark model`);
  console.log(`   • ${chalk.white('openai/gpt-4o')}               : ${chalk.cyan('128,000 tokens')} context | Flagship multimodal developer agent`);
  console.log(`   • ${chalk.white('openai/o3-mini')}             : ${chalk.cyan('200,000 tokens')} context | Deep STEM & competitive reasoning`);
  console.log(`   • ${chalk.white('mistralai/codestral-2501')}   : ${chalk.cyan('256,000 tokens')} context | Dedicated 256K software engineering model`);
  console.log(`   • ${chalk.white('google/gemini-2.5-pro')}       : ${chalk.cyan('2,097,152 tokens')} context | Massive 2 Million token long-context frontier\n`);

  // 9. Local Offline Models (Ollama)
  console.log(chalk.bold.hex('#00FF7F')('9. Local Offline Models (Ollama - localhost:11434)'));
  console.log(`   • ${chalk.white('deepseek-r1')} & ${chalk.white('qwen2.5-coder')} : ${chalk.green.bold('100% UNLIMITED TOKENS, ZERO RATE LIMITS')}`);
  console.log(`     Runs 100% private and offline on your local CPU/GPU with no internet required!\n`);

  console.log(line);
  console.log(
    chalk.cyan(
      `💡 Switch Model Anytime: Run ${chalk.yellow.bold('/agent')} or ${chalk.yellow.bold('/model [name]')} | Check Token Renewal Countdown: ${chalk.yellow.bold('/renewal')}\n`
    )
  );
}

/**
 * Render visual Git status summary box (/git)
 */
export function renderGitStatus(): void {
  const border = chalk.hex('#00FF7F')('─'.repeat(70));
  console.log('\n' + border);
  console.log(chalk.bgHex('#006A4E').white.bold(' 🌿 GIT REPOSITORY STATUS '));
  console.log(chalk.dim('─'.repeat(70)));

  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null || git branch --show-current', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    const status = execSync('git status --short', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    const log = execSync('git log -3 --oneline 2>/dev/null', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    console.log(`  ${chalk.gray('Current Branch:')}  ${chalk.cyan.bold(branch || 'Detached / Unknown')}`);

    if (status.length === 0) {
      console.log(`  ${chalk.gray('Working Tree:')}   ${chalk.green('✔ Working directory is clean')}`);
    } else {
      const statusLines = status.split('\n');
      console.log(`  ${chalk.gray('Modified Files:')} ${chalk.yellow(statusLines.length)} file(s):`);
      for (const line of statusLines.slice(0, 10)) {
        const flag = line.slice(0, 2).trim();
        const file = line.slice(3).trim();
        const coloredFlag = flag === 'M' ? chalk.yellow('M') : flag === '??' ? chalk.green('?') : chalk.cyan(flag);
        console.log(`    ${coloredFlag} ${file}`);
      }
      if (statusLines.length > 10) {
        console.log(`    ${chalk.dim(`... and ${statusLines.length - 10} more`)}`);
      }
    }

    if (log.length > 0) {
      console.log(`\n  ${chalk.gray('Recent Commits:')}`);
      for (const commit of log.split('\n')) {
        const [hash, ...rest] = commit.split(' ');
        console.log(`    ${chalk.yellow(hash)} ${chalk.dim(rest.join(' '))}`);
      }
    }
  } catch {
    console.log(`  ${chalk.yellow('Not a git repository or git is not installed in PATH.')}`);
  }
  console.log(border + '\n');
}

/**
 * Render visual Unicode directory tree (/tree)
 */
export function renderDirectoryTree(dirPath = '.', maxDepth = 2): void {
  const border = chalk.hex('#00FF7F')('─'.repeat(70));
  console.log('\n' + border);
  console.log(chalk.bgHex('#1A237E').white.bold(` 📂 WORKSPACE TREE: ${path.resolve(dirPath)} `));
  console.log(chalk.dim('─'.repeat(70)));

  const IGNORED = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.cache', 'coverage']);

  function printTree(currentDir: string, prefix = '', depth = 0) {
    if (depth >= maxDepth) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    const filtered = entries.filter((e) => !IGNORED.has(e.name) && !e.name.startsWith('.'));
    filtered.sort((a, b) => {
      if (a.isDirectory() === b.isDirectory()) return a.name.localeCompare(b.name);
      return a.isDirectory() ? -1 : 1;
    });

    for (let i = 0; i < filtered.length; i++) {
      const entry = filtered[i];
      const isLast = i === filtered.length - 1;
      const pointer = isLast ? '└── ' : '├── ';
      const nextPrefix = prefix + (isLast ? '    ' : '│   ');

      if (entry.isDirectory()) {
        console.log(prefix + pointer + chalk.cyan.bold(entry.name) + chalk.dim('/'));
        printTree(path.join(currentDir, entry.name), nextPrefix, depth + 1);
      } else {
        console.log(prefix + pointer + chalk.white(entry.name));
      }
    }
  }

  printTree(process.cwd());
  console.log(border + '\n');
}

/**
 * Display developer, project, and GitHub information (banglacli about / /about).
 */
export function showAbout(): void {
  const brand = chalk.hex('#00FF7F').bold;
  const accentRed = chalk.hex('#FF3366').bold;
  const dim = chalk.gray;

  console.log('\n' + chalk.bgHex('#006A4E').white.bold(' 🇧🇩 ABOUT BANGLACLI ') + '\n');

  console.log(
    brand('  ██████╗  █████╗ ███╗   ██╗ ██████╗ ██╗      █████╗  ██████╗██╗     ██╗\n') +
      brand('  ██╔══██╗██╔══██╗████╗  ██║██╔════╝ ██║     ██╔══██╗██╔════╝██║     ██║\n') +
      brand('  ██████╔╝███████║██╔██╗ ██║██║  ███╗██║     ███████║██║     ██║     ██║\n') +
      accentRed('  ██╔══██╗██╔══██║██║╚██╗██║██║   ██║██║     ██╔══██║██║     ██║     ██║\n') +
      accentRed('  ██████╔╝██║  ██║██║ ╚████║╚██████╔╝███████╗██║  ██║╚██████╗███████╗██║\n') +
      dim('  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝ ╚═════╝╚══════╝╚═╝')
  );

  console.log('\n' + chalk.dim('─'.repeat(74)));
  console.log(`  ${chalk.bold.white('Project:')}              ${brand('banglacli v2.0.0')}`);
  console.log(`  ${chalk.bold.white('Description:')}          Next-Gen Autonomous AI Terminal Coding Agent`);
  console.log(`  ${chalk.bold.white('Architecture:')}         Dual-Engine (BUILD & PLAN Modes) with Workspace Mesh RPC`);
  console.log(chalk.dim('─'.repeat(74)));

  console.log(`\n  ${chalk.bold.hex('#00FF7F')('👨‍💻 CREATOR & LEAD DEVELOPER:')}`);
  console.log(`  ${chalk.bold.white('Developer Name:')}       ${chalk.bold.hex('#00FF7F')('Rakib Hasan Shuvo')}`);
  console.log(
    `  ${chalk.bold.white('GitHub Account:')}       ${chalk.bold.underline.cyan('https://github.com/rakibhasanshuvo712-hub')} ${chalk.dim('(@rakibhasanshuvo712-hub)')}`
  );
  console.log(`  ${chalk.bold.white('Email:')}                ${chalk.white('rakibhasanshuvo712@gmail.com')}`);
  console.log(
    `  ${chalk.bold.white('GitHub Repository:')}    ${chalk.bold.underline.cyan('https://github.com/rakibhasanshuvo712-hub/banglacli')}`
  );
  console.log(
    `  ${chalk.bold.white('Production URL:')}       ${chalk.bold.underline.green('https://banglacli.vercel.app')}`
  );

  console.log('\n' + chalk.dim('─'.repeat(74)));
  console.log(`  ${chalk.bold.yellow('Core Capabilities:')}`);
  console.log(`  • ${chalk.green('Autonomous Coding:')} Inspects, creates, surgically edits files, and runs shell commands.`);
  console.log(`  • ${chalk.green('Workspace Mesh:')}    Cross-instance peer-to-peer WebSocket RPC across terminal workspaces.`);
  console.log(`  • ${chalk.green('Instant Abort:')}     Real-time Escape key listener halts generation and subprocesses instantly.`);
  console.log(`  • ${chalk.green('83+ Models:')}         Google Gemini, DeepSeek, Groq, OpenRouter, and Flagship BYOK.`);
  console.log(chalk.dim('─'.repeat(74)) + '\n');
}

/**
 * Render comprehensive Global Quota Exhaustion & Token Renewal Countdown Report.
 * Displays when all free agent models in the CLI have exhausted their quotas.
 */
export function renderAllTokensExhaustedReport(): void {
  const now = new Date();

  // Daily reset happens at 00:00:00 UTC
  const nextReset = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
      0
    )
  );

  const diffMs = nextReset.getTime() - now.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

  const localResetStr = nextReset.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
  const utcResetStr = '00:00:00 UTC';

  const border = chalk.hex('#FF3366')('═'.repeat(76));

  console.log('\n' + border);
  console.log(' ' + chalk.bgHex('#D32F2F').white.bold(' 🛑 ALL FREE MODEL TOKENS EXHAUSTED ACROSS ALL AGENTS '));
  console.log(chalk.yellow.bold('\n  banglacli has exhaustively cycled through all available free models in the CLI.'));
  console.log(chalk.gray('  All free daily rate limits and per-minute quotas have been temporarily reached.'));
  console.log(chalk.dim('─'.repeat(76)));

  console.log(chalk.bold.hex('#00FF7F')('\n  ⏳ NEXT GLOBAL TOKEN QUOTA RENEWAL IN:'));
  console.log(
    `     ${chalk.bgHex('#1A237E').white.bold(
      `  ${hours} Hours, ${minutes} Minutes, ${seconds} Seconds  `
    )}`
  );
  console.log(`     ${chalk.dim('•')} Reset Time (UTC):   ${chalk.cyan.bold(utcResetStr)}`);
  console.log(
    `     ${chalk.dim('•')} Reset Time (Local): ${chalk.green.bold(localResetStr)} (Your local timezone)`
  );

  console.log(chalk.bold.yellow('\n  📋 Quota Renewal Schedule by Provider:'));
  console.log(
    `  1. ${chalk.bold.white('Google Gemini Free Tier')}  : Resets ${chalk.green('1,500 Requests/day')} & ${chalk.cyan('1M TPM')} daily at 00:00 UTC`
  );
  console.log(
    `  2. ${chalk.bold.white('OpenRouter Free Tier')}     : Resets daily free model rate limits at 00:00 UTC`
  );
  console.log(
    `  3. ${chalk.bold.white('Groq Cloud Free Tier')}      : Resets ${chalk.green('14,400 Requests/day')} daily at 00:00 UTC (15 RPM rolling)`
  );
  console.log(
    `  4. ${chalk.bold.white('DeepSeek Platform')}        : Rolling RPM resets every minute; daily grants refresh at 00:00 UTC`
  );
  console.log(chalk.dim('─'.repeat(76)));

  console.log(chalk.bold.cyan('\n  💡 WHAT YOU CAN DO RIGHT NOW (NO WAITING REQUIRED):'));
  console.log(`  1. ${chalk.green.bold('Run Local Offline Models (UNLIMITED TOKENS, ZERO LIMITS):')}`);
  console.log(`     Use Ollama for 100% free offline coding on your local CPU/GPU.`);
  console.log(
    `     Run: ${chalk.white('ollama run deepseek-r1')} or ${chalk.white('ollama run qwen2.5-coder')}`
  );
  console.log(`     Then type ${chalk.yellow('/local')} inside banglacli to switch instantly!`);
  console.log(`  2. ${chalk.green.bold('Add a BYOK API Key (OpenAI, Anthropic, DeepSeek, Groq):')}`);
  console.log(`     Run ${chalk.yellow('/config')} or ${chalk.yellow('/provider')} to insert a key with custom quotas.`);
  console.log(`  3. ${chalk.green.bold('Wait for Renewal:')}`);
  console.log(`     Tokens will automatically be restored in ${hours}h ${minutes}m.\n`);
  console.log(border + '\n');
}
