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
    `  ${chalk.bgHex('#006A4E').white.bold(' 🇧🇩 banglacli ')} ${chalk.hex('#00FF7F')(
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
    `  ${dim('Commands:')} ${chalk.yellow('/mode')} ${dim('•')} ` +
      `${chalk.yellow('/agent')} ${dim('•')} ` +
      `${chalk.yellow('/provider')} ${dim('•')} ` +
      `${chalk.yellow('/limits')} ${dim('•')} ` +
      `${chalk.yellow('/guide')} ${dim('•')} ` +
      `${chalk.yellow('/clear')} ${dim('•')} ${chalk.yellow('/exit')}`
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
  const border = chalk.hex('#FF9900')('─'.repeat(74));
  console.log('\n' + border);
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
  console.log('\n' + chalk.bold.hex('#00FF7F')('🇧🇩 banglacli Help & Usage Guide'));
  console.log(chalk.dim('─'.repeat(70)));
  console.log(`${chalk.yellow.bold('Agent Modes (OpenCode Style):')}`);
  console.log(`  ${chalk.green.bold('⚡ BUILD Mode')}   - Autonomous full-stack coder. Can create/edit files & run terminal commands.`);
  console.log(`  ${chalk.yellow.bold('📋 PLAN Mode')}    - Senior Architect. Read-only codebase investigation & step-by-step planning.`);
  console.log(`\n${chalk.yellow.bold('Slash Commands in Chat:')}`);
  console.log(`  ${chalk.cyan('/mode')}        - Toggle or select between BUILD mode and PLAN mode`);
  console.log(`  ${chalk.cyan('/plan')}        - Switch instantly to PLAN mode (architectural read-only)`);
  console.log(`  ${chalk.cyan('/build')}       - Switch instantly to BUILD mode (autonomous coding & execution)`);
  console.log(`  ${chalk.cyan('/agent')}       - OpenCode-style AI agent & model selector (Free, Flagship, Local)`);
  console.log(`  ${chalk.cyan('/model')}       - Alias for /agent to quickly switch models`);
  console.log(`  ${chalk.cyan('/provider')}    - Switch AI provider (Gemini, OpenRouter, Custom)`);
  console.log(`  ${chalk.cyan('/limits')}      - View free token limits, context windows & RPM/RPD`);
  console.log(`  ${chalk.cyan('/guide')}       - Direct free API links & models guide (ফ্রি API গাইড)`);
  console.log(`  ${chalk.cyan('/config')}      - Full interactive configuration wizard`);
  console.log(`  ${chalk.cyan('/clear')}       - Clear conversation history / reset memory`);
  console.log(`  ${chalk.cyan('/exit')}        - Exit banglacli session`);

  console.log(`\n${chalk.yellow.bold('Autonomous Tool Capabilities:')}`);
  console.log(`  1. ${chalk.bold('list_files')}   - Lists workspace files (ignoring node_modules, .git)`);
  console.log(`  2. ${chalk.bold('read_file')}    - Reads contents of any file in workspace`);
  console.log(`  3. ${chalk.bold('write_file')}   - Creates directories and writes/updates files (BUILD mode)`);
  console.log(`  4. ${chalk.bold('run_command')}  - Runs terminal commands (BUILD mode)`);

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
  console.log(`   ${chalk.gray('Best Free Model:')} ${chalk.bold.yellow('gemini-3.5-flash-lite')} (🌟 100% Free, active & fast)`);
  console.log(`   ${chalk.gray('Alternative Free Models:')} ${chalk.white('gemini-3.1-flash-lite, gemini-3.5-flash, gemini-3.8-flash')}`);
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

  // 3. Tencent HY4 Suite
  console.log(chalk.bold.hex('#FF6D00')('3. Tencent HY4 Suite (1M Token Context - Free Promotional Tokens)'));
  console.log(`   ${chalk.gray('Models:')} ${chalk.yellow('tencent/hy4-flash')} (1M Context), ${chalk.yellow('tencent/hy4')} (1M Frontier), ${chalk.yellow('tencent/hy4-preview')}`);
  console.log(`   ${chalk.gray('Highlights:')} 1,048,576 token context window, high-throughput code generation & reasoning.\n`);

  // 4. Zhipu AI GLM 5.3 Suite
  console.log(chalk.bold.hex('#7C4DFF')('4. Zhipu AI GLM 5.3 Suite (Daily Free Tokens - 1M Context)'));
  console.log(`   ${chalk.gray('Direct Link:')} ${chalk.bold.underline.cyan('https://open.bigmodel.cn')}`);
  console.log(`   ${chalk.gray('Models:')} ${chalk.yellow('z-ai/glm-5.3-flash')} (1M Context), ${chalk.yellow('z-ai/glm-5.3')}, ${chalk.yellow('z-ai/glm-5.3-flashx')}, ${chalk.yellow('z-ai/glm-5.3-prime')}`);
  console.log(`   ${chalk.gray('Highlights:')} Daily free tokens refreshed every day on Zhipu AI platform & OpenRouter.\n`);

  // 5. DeepSeek Platform
  console.log(chalk.bold.hex('#00D2FF')('5. DeepSeek Platform (5,000,000 Free Tokens - 🌟 SOTA Coding)'));
  console.log(`   ${chalk.gray('Direct Link:')} ${chalk.bold.underline.cyan('https://platform.deepseek.com')}`);
  console.log(`   ${chalk.gray('Steps:')} Sign up with Email/Google ➔ Create API Key ➔ 5 Million free tokens credited.`);
  console.log(`   ${chalk.gray('In banglacli:')} Select "${chalk.white('Custom OpenAI-Compatible')}"`);
  console.log(`   ${chalk.gray('Base URL:')} ${chalk.cyan('https://api.deepseek.com/v1')}`);
  console.log(`   ${chalk.gray('Models:')} ${chalk.yellow('deepseek-chat')} (V4.1 / V3.2 Coding), ${chalk.yellow('deepseek-reasoner')} (R1 Chain-of-Thought)`);
  console.log(`   ${chalk.gray('Quota:')} 5,000,000 free tokens upon registration!\n`);

  // 6. Groq (Blazing Fast Inference)
  console.log(chalk.bold.hex('#00FF7F')('6. Groq Cloud (Ultra-Fast 500+ tokens/sec - Free Tier)'));
  console.log(`   ${chalk.gray('Direct Link:')} ${chalk.bold.underline.cyan('https://console.groq.com/keys')}`);
  console.log(`   ${chalk.gray('Steps:')} Select "${chalk.white('Custom OpenAI-Compatible')}" in banglacli.`);
  console.log(`   ${chalk.gray('Base URL:')} ${chalk.cyan('https://api.groq.com/openai/v1')}`);
  console.log(`   ${chalk.gray('Free Models:')} ${chalk.yellow('deepseek-r1-distill-llama-70b')}, ${chalk.yellow('deepseek-r1-distill-qwen-32b')}, ${chalk.yellow('llama-3.3-70b-versatile')}, ${chalk.yellow('qwen-2.5-coder-32b')}`);
  console.log(`   ${chalk.gray('Quota:')} 14,400 Requests per day free!\n`);

  // 7. Cerebras Cloud (1,800+ tokens/sec - Free Tier)
  console.log(chalk.bold.hex('#00FF7F')('7. Cerebras Cloud (World\'s Fastest 1,800+ tokens/sec - Free Tier)'));
  console.log(`   ${chalk.gray('Direct Link:')} ${chalk.bold.underline.cyan('https://cloud.cerebras.ai')}`);
  console.log(`   ${chalk.gray('Base URL:')} ${chalk.cyan('https://api.cerebras.ai/v1')}`);
  console.log(`   ${chalk.gray('Free Models:')} ${chalk.yellow('llama3.3-70b')}, ${chalk.yellow('llama3.1-8b')} (128k Context)`);
  console.log(`   ${chalk.gray('Quota:')} Free tier available with ultra-low latency!\n`);

  // 8. Local Offline Models (Ollama)
  console.log(chalk.bold.hex('#00FF7F')('8. Local Offline (100% Private, Free & Offline via Ollama)'));
  console.log(`   ${chalk.gray('Download:')} ${chalk.bold.underline.cyan('https://ollama.com')}`);
  console.log(`   ${chalk.gray('Run in Terminal:')} ${chalk.white('ollama run qwen2.5-coder')}`);
  console.log(`   ${chalk.gray('In banglacli:')} Choose "${chalk.white('Custom OpenAI-Compatible')}"`);
  console.log(`   ${chalk.gray('Base URL:')} ${chalk.cyan('http://localhost:11434/v1')}`);
  console.log(`   ${chalk.gray('API Key:')} Any text (e.g. ${chalk.white('ollama')})\n`);

  console.log(line);
  console.log(chalk.cyan(`💡 Tip: Use ${chalk.yellow.bold('/provider')} or ${chalk.yellow.bold('/config')} in chat to switch anytime!\n`));
}

/**
 * Show detailed free token limits and rate limits for all supported providers.
 */
export function showTokenLimitsGuide(): void {
  const line = chalk.dim('─'.repeat(82));
  console.log('\n' + chalk.bgHex('#0047AB').white.bold(' 📊 FREE TOKEN LIMITS & RATE LIMITS GUIDE (টোকেন ও রেট লিমিট) '));
  console.log(chalk.gray('Exact quotas and context windows for each free provider in banglaCLI:\n'));

  // 1. Google Gemini Free Tier Limits
  console.log(chalk.bold.hex('#00FF7F')('1. Google Gemini (Google AI Studio Free Tier)'));
  console.log(chalk.dim('┌────────────────────────┬────────────────┬──────────────┬──────────────┬──────────────┐'));
  console.log(chalk.dim('│') + chalk.bold(' Model                  ') + chalk.dim('│') + chalk.bold(' Context Window ') + chalk.dim('│') + chalk.bold(' Req / Minute ') + chalk.dim('│') + chalk.bold(' Tokens / Min ') + chalk.dim('│') + chalk.bold(' Req / Day    ') + chalk.dim('│'));
  console.log(chalk.dim('├────────────────────────┼────────────────┼──────────────┼──────────────┼──────────────┤'));
  console.log(chalk.dim('│') + chalk.green(' gemini-3.5-flash-lite  ') + chalk.dim('│') + chalk.white(' 1,048,576 toks ') + chalk.dim('│') + chalk.yellow(' 15 RPM       ') + chalk.dim('│') + chalk.cyan(' 1,000,000 TPM') + chalk.dim('│') + chalk.green(' 1,500 RPD    ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' gemini-3.1-flash-lite  ') + chalk.dim('│') + chalk.white(' 1,048,576 toks ') + chalk.dim('│') + chalk.yellow(' 15 RPM       ') + chalk.dim('│') + chalk.cyan(' 1,000,000 TPM') + chalk.dim('│') + chalk.green(' 1,500 RPD    ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' gemini-3.5-flash       ') + chalk.dim('│') + chalk.white(' 1,048,576 toks ') + chalk.dim('│') + chalk.yellow(' 15 RPM       ') + chalk.dim('│') + chalk.cyan(' 1,000,000 TPM') + chalk.dim('│') + chalk.green(' 1,500 RPD    ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' gemini-3.8-flash       ') + chalk.dim('│') + chalk.white(' 1,048,576 toks ') + chalk.dim('│') + chalk.yellow(' 15 RPM       ') + chalk.dim('│') + chalk.cyan(' 1,000,000 TPM') + chalk.dim('│') + chalk.green(' 1,500 RPD    ') + chalk.dim('│'));
  console.log(chalk.dim('└────────────────────────┴────────────────┴──────────────┴──────────────┴──────────────┘'));
  console.log(chalk.gray('ℹ️ 1M Tokens/min is equivalent to ~750,000 words per minute! Gemini 2.0/1.5 Flash are best for 0% downtime.\n'));

  // 2. OpenRouter Free Models Limits
  console.log(chalk.bold.hex('#00FF7F')('2. OpenRouter (Free Models Ending in :free)'));
  console.log(chalk.dim('┌──────────────────────────────────────┬────────────────┬──────────────┬──────────────┐'));
  console.log(chalk.dim('│') + chalk.bold(' Model                                ') + chalk.dim('│') + chalk.bold(' Context Window ') + chalk.dim('│') + chalk.bold(' Rate Limit   ') + chalk.dim('│') + chalk.bold(' Cost         ') + chalk.dim('│'));
  console.log(chalk.dim('├──────────────────────────────────────┼────────────────┼──────────────┼──────────────┤'));
  console.log(chalk.dim('│') + chalk.green(' openrouter/free                      ') + chalk.dim('│') + chalk.white(' 200,000 toks   ') + chalk.dim('│') + chalk.yellow(' 20 RPM        ') + chalk.dim('│') + chalk.green(' $0.00 (Free) ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' particle-ai/particle-1:free          ') + chalk.dim('│') + chalk.cyan(' 1,048,576 toks ') + chalk.dim('│') + chalk.yellow(' 20 RPM        ') + chalk.dim('│') + chalk.green(' $0.00 (Free) ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' nvidia/nemotron-3-ultra-550b:free    ') + chalk.dim('│') + chalk.cyan(' 1,000,000 toks ') + chalk.dim('│') + chalk.yellow(' 20 RPM        ') + chalk.dim('│') + chalk.green(' $0.00 (Free) ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' google/gemma-4-31b-it:free           ') + chalk.dim('│') + chalk.white(' 262,144 toks   ') + chalk.dim('│') + chalk.yellow(' 20 RPM        ') + chalk.dim('│') + chalk.green(' $0.00 (Free) ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' nvidia/nemotron-3.5-lightning:free   ') + chalk.dim('│') + chalk.cyan(' 1,000,000 toks ') + chalk.dim('│') + chalk.yellow(' 20 RPM        ') + chalk.dim('│') + chalk.green(' $0.00 (Free) ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' baidu/ernie-5.5-flash-preview:free   ') + chalk.dim('│') + chalk.cyan(' 1,024,000 toks ') + chalk.dim('│') + chalk.yellow(' 20 RPM        ') + chalk.dim('│') + chalk.green(' $0.00 (Free) ') + chalk.dim('│'));
  console.log(chalk.dim('│') + chalk.green(' inclusionai/ling-3.2-flash:free      ') + chalk.dim('│') + chalk.cyan(' 1,048,576 toks ') + chalk.dim('│') + chalk.yellow(' 20 RPM        ') + chalk.dim('│') + chalk.green(' $0.00 (Free) ') + chalk.dim('│'));
  console.log(chalk.dim('└──────────────────────────────────────┴────────────────┴──────────────┴──────────────┘'));
  console.log(chalk.gray('ℹ️ OpenRouter free models have zero 503 errors and are great backups when Google has high traffic spikes.\n'));

  // 3. Groq Cloud Free Limits
  console.log(chalk.bold.hex('#00FF7F')('3. Groq Cloud (Free Tier - Ultra High Speed)'));
  console.log(`   • ${chalk.white('llama-3.3-70b-versatile:')} 30 Requests/min | 6,000 Tokens/min | ${chalk.green('14,400 Requests/day')}`);
  console.log(`   • ${chalk.white('qwen-2.5-coder-32b:')} 30 Requests/min | 6,000 Tokens/min | ${chalk.green('14,400 Requests/day')}\n`);

  // 4. Local Offline (Ollama)
  console.log(chalk.bold.hex('#00FF7F')('4. Local Offline Models (Ollama)'));
  console.log(`   • ${chalk.green('100% UNLIMITED:')} Zero rate limits, zero tokens per minute ceiling. Depends only on your machine's hardware.\n`);

  console.log(line);
  console.log(chalk.cyan(`💡 Quick Switch: Type ${chalk.yellow.bold('/provider')} in chat to instantly hop between providers!\n`));
}
