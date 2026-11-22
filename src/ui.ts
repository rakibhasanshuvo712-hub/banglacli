import chalk from 'chalk';
import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import * as p from '@clack/prompts';
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
    `  ${chalk.bgHex('#006A4E').white.bold(' 🇧🇩 banglaCLI ')} ${chalk.hex('#00FF7F')(
      'The Autonomous BYOK Terminal Coding Agent'
    )}`
  );
  console.log(
    `  ${dim('Speaks natural')} ${chalk.bold.hex('#FFDF00')('বাংলা (Bangla)')}${dim(',')} ` +
      `${chalk.bold.cyan('Banglish')}${dim(', &')} ${chalk.bold.white('English')}\n`
  );

  if (provider && model) {
    console.log(
      `  ${dim('Provider:')} ${chalk.bold.cyan(provider)}  ` +
        `${dim('Model:')} ${chalk.bold.green(model)}  ` +
        `${dim('Workspace:')} ${chalk.gray(workspace || process.cwd())}`
    );
  }
  console.log(
    `  ${dim('Commands:')} ${chalk.yellow('/help')} ${dim('•')} ` +
      `${chalk.yellow('/guide')} ${dim('•')} ` +
      `${chalk.yellow('/provider')} ${dim('•')} ` +
      `${chalk.yellow('/model')} ${dim('•')} ${chalk.yellow('/config')} ${dim('•')} ` +
      `${chalk.yellow('/clear')} ${dim('•')} ${chalk.yellow('/exit')}`
  );
  console.log(dim('─'.repeat(78)));
}

/**
 * Display action details before executing a dangerous tool (write_file or run_command).
 */
export async function askToolConfirmation(
  toolName: 'write_file' | 'run_command',
  summary: string
): Promise<'yes' | 'no' | 'all'> {
  console.log('\n' + chalk.bgHex('#FF9900').black.bold(' ⚠️  SAFETY CONFIRMATION '));
  console.log(
    `${chalk.gray('Tool:')} ${toolName === 'write_file' ? chalk.cyan.bold(toolName) : chalk.magenta.bold(toolName)}`
  );
  console.log(`${chalk.gray('Details:')}\n${chalk.white(summary)}`);

  const choice = (await p.select({
    message: chalk.yellow('Allow banglaCLI to execute this action?'),
    options: [
      { value: 'yes', label: chalk.green('✔ Yes, execute this action') },
      { value: 'all', label: chalk.cyan('⚡ Yes to ALL actions (Auto-approve for this session)') },
      { value: 'no', label: chalk.red('✖ No, cancel / reject this action') },
    ],
  })) as 'yes' | 'no' | 'all';

  if (p.isCancel(choice)) {
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
  });
}

/**
 * Show a styled help manual.
 */
export function showHelp(): void {
  console.log('\n' + chalk.bold.hex('#00FF7F')('🇧🇩 banglaCLI Help & Usage Guide'));
  console.log(chalk.dim('─'.repeat(70)));
  console.log(`${chalk.yellow.bold('Slash Commands in Chat:')}`);
  console.log(`  ${chalk.cyan('/help')}        - Show this guide and available tools`);
  console.log(`  ${chalk.cyan('/guide')}       - Direct free API links & models guide (ফ্রি API গাইড)`);
  console.log(`  ${chalk.cyan('/provider')}    - Switch AI provider (Gemini, OpenRouter, Custom)`);
  console.log(`  ${chalk.cyan('/model')}       - Switch current AI model on the fly`);
  console.log(`  ${chalk.cyan('/config')}      - Full interactive configuration wizard`);
  console.log(`  ${chalk.cyan('/clear')}       - Clear conversation history / reset memory`);
  console.log(`  ${chalk.cyan('/exit')}        - Exit banglaCLI session`);

  console.log(`\n${chalk.yellow.bold('Autonomous Tool Capabilities:')}`);
  console.log(`  1. ${chalk.bold('list_files')}   - Lists workspace files (ignoring node_modules, .git)`);
  console.log(`  2. ${chalk.bold('read_file')}    - Reads contents of any file in workspace`);
  console.log(`  3. ${chalk.bold('write_file')}   - Creates directories and writes/updates files`);
  console.log(`  4. ${chalk.bold('run_command')}  - Runs terminal commands (npm install, tests, dev)`);

  console.log(`\n${chalk.yellow.bold('Language Support:')}`);
  console.log(`  • ${chalk.green('Bangla:')}   "একটি React Counter অ্যাপ বানিয়ে দাও"`);
  console.log(`  • ${chalk.green('Banglish:')} "Express diye ekta REST API banaw auth soho"`);
  console.log(`  • ${chalk.green('English:')}  "Build a full-stack Next.js portfolio website"`);
  console.log(chalk.dim('─'.repeat(70)) + '\n');
}

/**
 * Show a comprehensive guide with updated links for getting free API keys and models.
 */
export function showFreeApiKeyGuide(): void {
  const line = chalk.dim('─'.repeat(78));
  console.log('\n' + chalk.bgHex('#006A4E').white.bold(' 🔑 FREE API KEYS & MODELS GUIDE (১০০% ফ্রি কোডিং গাইড) '));
  console.log(chalk.gray('Get free API keys with generous quotas for banglaCLI - no credit card required!\n'));

  // 1. Google Gemini
  console.log(chalk.bold.hex('#00FF7F')('1. Google Gemini (Google AI Studio) - 🌟 RECOMMENDED'));
  console.log(`   ${chalk.gray('Direct Link:')} ${chalk.bold.underline.cyan('https://aistudio.google.com/apikey')}`);
  console.log(`   ${chalk.gray('Steps:')} Sign in with Google ➔ Click "${chalk.white('Create API Key')}" ➔ Copy key.`);
  console.log(`   ${chalk.gray('Best Free Model:')} ${chalk.bold.yellow('gemini-3.8-flash')} (Super fast & smart)`);
  console.log(`   ${chalk.gray('Alternative Models:')} ${chalk.white('gemini-2.0-flash, gemini-1.5-pro')}`);
  console.log(`   ${chalk.gray('Quota:')} Free tier gives 15 Requests/min & 1,500 Requests/day for free!\n`);

  // 2. OpenRouter Free Models
  console.log(chalk.bold.hex('#00FF7F')('2. OpenRouter (Access DeepSeek, GLM, Llama for Free)'));
  console.log(`   ${chalk.gray('Direct Link:')} ${chalk.bold.underline.cyan('https://openrouter.ai/keys')}`);
  console.log(`   ${chalk.gray('Steps:')} Sign in with GitHub/Google ➔ Click "${chalk.white('Create Key')}" ➔ Copy key.`);
  console.log(`   ${chalk.gray('Free Models (Zero Cost):')}`);
  console.log(`     • ${chalk.yellow('deepseek/deepseek-chat:free')} (Exceptional for coding & software projects)`);
  console.log(`     • ${chalk.yellow('zhipu/glm-4:free')} (Ultra fast coding assistant)`);
  console.log(`     • ${chalk.yellow('meta-llama/llama-3.3-70b-instruct:free')} (Powerful open-weight model)`);
  console.log(`     • ${chalk.yellow('google/gemini-2.0-flash-exp:free')}`);
  console.log(`   ${chalk.gray('Quota:')} 100% Free with zero payment or credit card needed!\n`);

  // 3. Groq (Blazing Fast Inference)
  console.log(chalk.bold.hex('#00FF7F')('3. Groq Cloud (Ultra-Fast 500+ tokens/sec)'));
  console.log(`   ${chalk.gray('Direct Link:')} ${chalk.bold.underline.cyan('https://console.groq.com/keys')}`);
  console.log(`   ${chalk.gray('Steps:')} Select "${chalk.white('Custom OpenAI-Compatible')}" in banglaCLI.`);
  console.log(`   ${chalk.gray('Base URL:')} ${chalk.cyan('https://api.groq.com/openai/v1')}`);
  console.log(`   ${chalk.gray('Free Models:')} ${chalk.yellow('llama-3.3-70b-versatile')}, ${chalk.yellow('qwen-2.5-coder-32b')}\n`);

  // 4. Local Offline Models (Ollama)
  console.log(chalk.bold.hex('#00FF7F')('4. Local Offline (100% Private, Free & Offline via Ollama)'));
  console.log(`   ${chalk.gray('Download:')} ${chalk.bold.underline.cyan('https://ollama.com')}`);
  console.log(`   ${chalk.gray('Run in Terminal:')} ${chalk.white('ollama run qwen2.5-coder')}`);
  console.log(`   ${chalk.gray('In banglaCLI:')} Choose "${chalk.white('Custom OpenAI-Compatible')}"`);
  console.log(`   ${chalk.gray('Base URL:')} ${chalk.cyan('http://localhost:11434/v1')}`);
  console.log(`   ${chalk.gray('API Key:')} Any text (e.g. ${chalk.white('ollama')})\n`);

  console.log(line);
  console.log(chalk.cyan(`💡 Tip: Use ${chalk.yellow.bold('/provider')} or ${chalk.yellow.bold('/config')} in chat to switch anytime!\n`));
}
