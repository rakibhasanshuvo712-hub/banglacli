#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import * as p from '@clack/prompts';
import {
  getConfig,
  promptConfig,
  switchProviderInteractive,
  updateModel,
  PROVIDER_LABELS,
  BanglaCLIConfig,
} from './config.js';
import { BanglaAgent } from './agent.js';
import { printBanner, renderMarkdown, showHelp, showFreeApiKeyGuide, showTokenLimitsGuide } from './ui.js';
import { safetySession } from './tools.js';

const program = new Command();

program
  .name('banglaCLI')
  .description('Autonomous BYOK terminal coding agent that speaks Bangla, Banglish & English.')
  .version('1.1.0', '-v, --version', 'Output the current version')
  .option('-m, --model <model>', 'Override model for this session')
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

    const agent = new BanglaAgent(config);

    // If single prompt mode is active (-p / --prompt)
    if (options.prompt) {
      console.log(chalk.cyan(`\n⚡ Running single prompt with ${config.provider} (${config.model}):`));
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
      const input = (await p.text({
        message: chalk.bold.hex('#00FF7F')('banglaCLI ❯'),
        placeholder: 'Type your message (Bangla / Banglish / English) or /help, /provider, /model, /exit...',
        validate: (val) => {
          if (!val || val.trim().length === 0) {
            return 'Please enter a message or command.';
          }
        },
      })) as string;

      if (p.isCancel(input)) {
        console.log(chalk.yellow('\nবিদায়! Goodbye! Exiting banglaCLI.\n'));
        break;
      }

      const trimmed = input.trim();

      // Handle Slash Commands
      if (trimmed === '/exit' || trimmed === '/quit') {
        console.log(chalk.hex('#00FF7F')('\nধন্যবাদ! Thanks for using banglaCLI. Happy coding! 🚀\n'));
        break;
      }

      if (trimmed === '/help') {
        showHelp();
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

      if (trimmed === '/model') {
        await handleSwitchModel(config, agent);
        continue;
      }

      // Agent chat execution
      try {
        const reply = await agent.chat(trimmed);
        console.log('\n' + chalk.bold.hex('#00FF7F')('banglaCLI:'));
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
        { value: 'gemini-2.0-flash', label: 'gemini-2.0-flash (Recommended - Fast, Ultra-Stable & 1M Tokens)' },
        { value: 'gemini-1.5-flash', label: 'gemini-1.5-flash (Battle-Tested Stability - 1M Tokens)' },
        { value: 'gemini-3.8-flash', label: 'gemini-3.8-flash (Latest Model - High Demand)' },
        { value: 'gemini-1.5-pro', label: 'gemini-1.5-pro (Reasoning & 2M Tokens)' },
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
      initialValue: config.model,
      options: [
        { value: 'deepseek/deepseek-chat:free', label: 'deepseek/deepseek-chat:free (Free Coding)' },
        { value: 'zhipu/glm-4:free', label: 'zhipu/glm-4:free (Free Fast)' },
        { value: 'meta-llama/llama-3.3-70b-instruct:free', label: 'meta-llama/llama-3.3-70b-instruct:free' },
        { value: 'google/gemini-2.0-flash-exp:free', label: 'google/gemini-2.0-flash-exp:free' },
        { value: 'custom_input', label: 'Enter custom OpenRouter model ID...' },
      ],
    })) as string;

    if (p.isCancel(choice)) return;

    if (choice === 'custom_input') {
      const custom = (await p.text({
        message: 'Enter model ID (e.g. mistralai/mistral-7b-instruct:free):',
        initialValue: config.model,
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
