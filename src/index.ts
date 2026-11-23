#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import * as p from '@clack/prompts';
import {
  getConfig,
  promptConfig,
  switchProviderInteractive,
  updateModel,
  saveConfig,
  PROVIDER_LABELS,
  BanglaCLIConfig,
} from './config.js';
import { BanglaAgent } from './agent.js';
import {
  printBanner,
  renderMarkdown,
  showHelp,
  showFreeApiKeyGuide,
  showTokenLimitsGuide,
  renderStatusBar,
} from './ui.js';
import { safetySession } from './tools.js';
import { selectAgentModelInteractive } from './models.js';

const program = new Command();

program
  .name('banglacli')
  .description('Autonomous BYOK terminal coding agent that speaks Bangla, Banglish & English.')
  .version('1.4.0', '-v, --version', 'Output the current version')
  .option('-m, --model <model>', 'Override model for this session')
  .option('-M, --mode <mode>', 'Execution mode: "build" (default) or "plan"', 'build')
  .option('-p, --prompt <prompt>', 'Run a single prompt and exit')
  .option('-y, --yes', 'Auto-approve all file writes and shell commands')
  .action(async (options) => {
    if (options.yes) {
      safetySession.autoApproveAll = true;
    }

    // Check for existing configuration
    let config = getConfig();

    if (!config) {
      console.log(chalk.yellow('\nℹ️  No API key or provider found. Starting initial onboarding...\n'));
      config = await promptConfig(true);
    }

    if (options.model) {
      config.model = options.model;
    }

    const initialMode: 'build' | 'plan' = options.mode === 'plan' ? 'plan' : 'build';
    const agent = new BanglaAgent(config, initialMode);

    // Sync session config when agent auto-cascades to another model
    agent.setOnModelChange((newModel, newProvider) => {
      if (config) {
        config.model = newModel;
        if (newProvider) {
          config.provider = newProvider as any;
          const saved = config.savedProviders?.[config.provider];
          if (saved) {
            config.apiKey = saved.apiKey;
            config.baseURL = saved.baseURL;
          }
        }
        saveConfig(config);
      }
    });

    // If single prompt mode is active (-p / --prompt)
    if (options.prompt) {
      console.log(
        chalk.cyan(
          `\n⚡ Running single prompt with ${config.provider} (${config.model}) in [${initialMode.toUpperCase()} MODE]:`
        )
      );
      console.log(chalk.white(options.prompt) + '\n');
      try {
        const reply = await agent.chat(options.prompt);
        console.log('\n' + renderMarkdown(reply) + '\n');
      } catch (err: any) {
        console.error(chalk.red(`\n✖ Error: ${err.message}\n`));
        process.exit(1);
      }
      return;
    }

    // Interactive Chat REPL Loop
    printBanner(PROVIDER_LABELS[config.provider], config.model, process.cwd());

    let running = true;
    while (running) {
      // Show bottom status bar showing active mode and model (like OpenCode)
      renderStatusBar(agent.getMode(), config.model, config.provider);

      const promptLabel =
        agent.getMode() === 'build'
          ? chalk.bold.hex('#00FF7F')('⚡ banglacli [BUILD] ❯')
          : chalk.bold.hex('#FFB300')('📋 banglacli [PLAN] ❯');

      const placeholderText =
        agent.getMode() === 'build'
          ? 'Type what to build, or /plan, /mode, /agent, /help...'
          : 'Ask for architectural plan or analysis, or /build, /mode...';

      const input = (await p.text({
        message: promptLabel,
        placeholder: placeholderText,
        validate: (val) => {
          if (!val || val.trim().length === 0) {
            return 'Please enter a message or command.';
          }
        },
      })) as string;

      if (p.isCancel(input)) {
        console.log(chalk.yellow('\nবিদায়! Goodbye! Exiting banglacli.\n'));
        break;
      }

      const trimmed = input.trim();

      // Handle Slash Commands
      if (trimmed === '/exit' || trimmed === '/quit') {
        console.log(chalk.hex('#00FF7F')('\nধন্যবাদ! Thanks for using banglacli. Happy coding! 🚀\n'));
        break;
      }

      if (trimmed === '/help') {
        showHelp();
        continue;
      }

      // Mode Switching (OpenCode Style)
      if (trimmed === '/mode') {
        const modeChoice = (await p.select({
          message: chalk.cyan('Select Agent Mode (OpenCode Style):'),
          initialValue: agent.getMode(),
          options: [
            {
              value: 'build',
              label: '⚡ BUILD Mode (Autonomous Full-Stack Coding)',
              hint: 'Full tool access: inspect, create/update files & run terminal commands',
            },
            {
              value: 'plan',
              label: '📋 PLAN Mode (Senior Architect & Planning)',
              hint: 'Read-only: inspect files, explore architecture & design step-by-step plans',
            },
          ],
        })) as 'build' | 'plan';

        if (!p.isCancel(modeChoice)) {
          agent.setMode(modeChoice);
          if (modeChoice === 'build') {
            console.log(
              chalk.green('\n✔ Switched to ⚡ BUILD MODE (Autonomous Builder: file writes & commands enabled)\n')
            );
          } else {
            console.log(
              chalk.yellow('\n✔ Switched to 📋 PLAN MODE (Senior Architect: read-only analysis & planning)\n')
            );
          }
        }
        continue;
      }

      if (trimmed === '/plan') {
        agent.setMode('plan');
        console.log(
          chalk.yellow('\n✔ Switched to 📋 PLAN MODE (Senior Architect: read-only analysis & planning enabled)\n')
        );
        continue;
      }

      if (trimmed === '/build') {
        agent.setMode('build');
        console.log(
          chalk.green('\n✔ Switched to ⚡ BUILD MODE (Autonomous Builder: file writes & commands enabled)\n')
        );
        continue;
      }

      if (trimmed === '/guide' || trimmed === '/keys') {
        showFreeApiKeyGuide();
        continue;
      }

      if (trimmed === '/limits' || trimmed === '/tokens') {
        showTokenLimitsGuide();
        continue;
      }

      if (trimmed === '/clear') {
        agent.resetHistory();
        console.clear();
        printBanner(PROVIDER_LABELS[config.provider], config.model, process.cwd());
        console.log(chalk.green('✔ Conversation history cleared! / কথোপকথনের মেমোরি রিসেট করা হয়েছে।\n'));
        continue;
      }

      if (trimmed === '/provider') {
        const newConfig = await switchProviderInteractive(config);
        if (newConfig) {
          config = newConfig;
          agent.updateConfig(newConfig);
          console.log(
            chalk.green(
              `\n✔ Active Provider: ${chalk.bold(PROVIDER_LABELS[config.provider])} (${chalk.bold(config.model)})\n`
            )
          );
        }
        continue;
      }

      if (trimmed === '/config') {
        const newConfig = await promptConfig(false);
        config = newConfig;
        agent.updateConfig(newConfig);
        console.log(chalk.green(`\n✔ Config updated: ${PROVIDER_LABELS[config.provider]} (${config.model})\n`));
        continue;
      }

      if (trimmed === '/model' || trimmed === '/agent') {
        const newConfig = await selectAgentModelInteractive(config);
        if (newConfig) {
          config = newConfig;
          agent.updateConfig(newConfig);
        }
        continue;
      }

      // Agent chat execution
      try {
        const reply = await agent.chat(trimmed);
        console.log('\n' + chalk.bold.hex('#00FF7F')('banglacli:'));
        console.log(renderMarkdown(reply) + '\n');
      } catch (err: any) {
        console.error(chalk.red(`\n✖ Agent Error: ${err.message}\n`));
      }
    }
  });

// Explicit config subcommand
program
  .command('config')
  .description('Run interactive configuration to set provider, API key, and model')
  .action(async () => {
    await promptConfig(false);
  });

// Explicit guide subcommand
program
  .command('guide')
  .alias('keys')
  .description('Display the free API keys & models guide with direct links')
  .action(() => {
    showFreeApiKeyGuide();
  });

// Explicit limits subcommand
program
  .command('limits')
  .alias('tokens')
  .description('Display free token limits, context windows, and rate limits')
  .action(() => {
    showTokenLimitsGuide();
  });

// Explicit agent/model selector subcommand (OpenCode style)
program
  .command('agent')
  .alias('model')
  .description('OpenCode-style AI agent & model selector (Free, Flagship, Gemini, Local)')
  .action(async () => {
    let config = getConfig();
    if (!config) {
      config = await promptConfig(true);
    }
    await selectAgentModelInteractive(config);
  });

// Explicit mode subcommand
program
  .command('mode')
  .description('Switch agent mode between BUILD (autonomous coder) and PLAN (architect)')
  .action(async () => {
    console.log(chalk.bold.hex('#00FF7F')('\n🇧🇩 banglacli Agent Modes (OpenCode Style):\n'));
    console.log(`  ${chalk.green.bold('⚡ BUILD Mode:')} Autonomous full-stack coder. Inspects, writes files & runs terminal commands.`);
    console.log(`  ${chalk.yellow.bold('📋 PLAN Mode:')} Senior Architect. Read-only codebase investigation & architectural planning.\n`);
    console.log(chalk.gray('Use "/mode", "/plan", or "/build" inside interactive chat or launch with "banglacli -M plan".\n'));
  });

/**
 * Handle dynamic model switching command (/model)
 */
async function handleSwitchModel(config: BanglaCLIConfig, agent: BanglaAgent): Promise<void> {
  let selectedModel = config.model;

  if (config.provider === 'gemini') {
    const choice = (await p.select({
      message: chalk.cyan('Switch Gemini Model:'),
      initialValue: config.model,
      options: [
        { value: 'gemini-3.5-flash-lite', label: 'gemini-3.5-flash-lite (🌟 Recommended - 100% Free, High Speed & 1M Tokens)' },
        { value: 'gemini-3.1-flash-lite', label: 'gemini-3.1-flash-lite (Free, Low Latency)' },
        { value: 'gemini-3.5-flash', label: 'gemini-3.5-flash (Next-Gen Free Flash)' },
        { value: 'gemini-3.8-flash', label: 'gemini-3.8-flash (Latest Preview)' },
        { value: 'custom_input', label: 'Enter custom model name...' },
      ],
    })) as string;

    if (p.isCancel(choice)) return;

    if (choice === 'custom_input') {
      const custom = (await p.text({
        message: 'Enter Gemini model ID:',
        initialValue: config.model || 'gemini-3.8-flash',
      })) as string;
      if (p.isCancel(custom)) return;
      selectedModel = custom.trim();
    } else {
      selectedModel = choice;
    }
  } else if (config.provider === 'openrouter') {
    const choice = (await p.select({
      message: chalk.cyan('Switch OpenRouter Model:'),
      initialValue: config.model || 'openrouter/free',
      options: [
        { value: 'openrouter/free', label: 'openrouter/free (Recommended - Best Free Model with Tools)' },
        { value: 'google/gemma-4-31b-it:free', label: 'google/gemma-4-31b-it:free (Free 31B Coding & Chat)' },
        { value: 'nvidia/nemotron-3.5-lightning:free', label: 'nvidia/nemotron-3.5-lightning:free (Free Fast Model)' },
        { value: 'inclusionai/ling-3.2-flash:free', label: 'inclusionai/ling-3.2-flash:free (Free Flash Model)' },
        { value: 'custom_input', label: 'Enter custom OpenRouter model ID...' },
      ],
    })) as string;

    if (p.isCancel(choice)) return;

    if (choice === 'custom_input') {
      const custom = (await p.text({
        message: 'Enter model ID (e.g. openrouter/free):',
        initialValue: config.model || 'openrouter/free',
      })) as string;
      if (p.isCancel(custom)) return;
      selectedModel = custom.trim();
    } else {
      selectedModel = choice;
    }
  } else {
    const custom = (await p.text({
      message: chalk.cyan('Enter custom model name:'),
      initialValue: config.model,
    })) as string;
    if (p.isCancel(custom)) return;
    selectedModel = custom.trim();
  }

  config.model = selectedModel;
  updateModel(selectedModel);
  agent.setModel(selectedModel);
  console.log(chalk.green(`\n✔ Switched model to: ${chalk.bold(selectedModel)}\n`));
}

program.parse(process.argv);
