#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
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
  renderPriorityTaskBanner,
  renderInterruptedNotice,
  renderDoctorReport,
  renderSessionStats,
} from './ui.js';
import { safetySession, getSessionChanges, undoLastChange } from './tools.js';
import { selectAgentModelInteractive } from './models.js';
import { readOpenCodePrompt, expandOpenCodeMentions } from './prompt.js';

/**
 * Real-time Escape key listener during agent thinking / tool execution.
 * When user presses Escape, invokes onEscape() to abort cleanly.
 */
function attachEscapeListener(onEscape: () => void): () => void {
  if (!process.stdin.isTTY) {
    return () => {};
  }

  readline.emitKeypressEvents(process.stdin);
  const wasRaw = process.stdin.isRaw;
  try {
    process.stdin.setRawMode(true);
    process.stdin.resume();
  } catch {}

  const keypressHandler = (_str: string, key: any) => {
    if (key) {
      if (key.name === 'escape') {
        onEscape();
      } else if (key.ctrl && key.name === 'c') {
        process.exit(0);
      }
    }
  };

  process.stdin.on('keypress', keypressHandler);

  return () => {
    process.stdin.removeListener('keypress', keypressHandler);
    try {
      if (!wasRaw) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
    } catch {}
  };
}

const program = new Command();

program
  .name('banglacli')
  .description('Next-Gen Autonomous BYOK terminal coding agent that speaks Bangla, Banglish & English.')
  .version('2.0.0', '-v, --version', 'Output the current version')
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
      const abortController = new AbortController();
      const detachEscape = attachEscapeListener(() => abortController.abort());
      try {
        const { expandedPrompt } = await expandOpenCodeMentions(options.prompt);
        const reply = await agent.chat(expandedPrompt, { signal: abortController.signal });
        if (abortController.signal.aborted) {
          renderInterruptedNotice();
        } else {
          console.log('\n' + renderMarkdown(reply) + '\n');
        }
      } catch (err: any) {
        if (abortController.signal.aborted) {
          renderInterruptedNotice();
        } else {
          console.error(chalk.red(`\n✖ Error: ${err.message}\n`));
          process.exit(1);
        }
      } finally {
        detachEscape();
      }
      return;
    }

    // Interactive Chat REPL Loop
    printBanner(PROVIDER_LABELS[config.provider], config.model, process.cwd());

    let running = true;
    while (running) {
      // Show bottom status bar showing active mode and model (like OpenCode)
      renderStatusBar(agent.getMode(), config.model, config.provider);

      // OpenCode & Antigravity Interactive Prompt
      // Features: Bracketed paste protection (multi-line pastes never auto-submit),
      // Shift+Enter / Alt+Enter for newlines, Esc to cancel/abort, model badge.
      const input = await readOpenCodePrompt({
        mode: agent.getMode(),
        model: config.model,
        provider: config.provider,
      });

      if (input === null) {
        console.log(chalk.yellow('\nবিদায়! Goodbye! Exiting banglacli.\n'));
        break;
      }

      const trimmed = input.trim();
      if (trimmed.length === 0) {
        continue;
      }

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

      if (trimmed === '/stats' || trimmed === '/cost') {
        const metrics = agent.getSessionMetrics();
        const changes = getSessionChanges();
        renderSessionStats({
          model: config.model,
          provider: PROVIDER_LABELS[config.provider] || config.provider,
          mode: agent.getMode(),
          totalTokens: metrics.totalTokens,
          promptTokens: metrics.promptTokens,
          completionTokens: metrics.completionTokens,
          totalRequests: metrics.totalRequests,
          estimatedCostSavedUsd: metrics.estimatedCostSavedUsd,
          filesTouched: changes.length,
        });
        continue;
      }

      if (trimmed === '/doctor' || trimmed === '/check') {
        const checks: { name: string; status: 'ok' | 'warn' | 'error'; detail: string }[] = [];

        // 1. Node runtime
        const nodeVer = process.version;
        const major = parseInt(nodeVer.replace('v', '').split('.')[0], 10);
        checks.push({
          name: 'Node.js Runtime',
          status: major >= 18 ? 'ok' : 'error',
          detail: `${nodeVer} (Node 18+ required for modern async streams)`,
        });

        // 2. Active Provider & Model
        const hasKey = Boolean(config.apiKey && config.apiKey.trim().length > 5);
        checks.push({
          name: 'AI Provider & Key',
          status: hasKey ? 'ok' : 'error',
          detail: `${PROVIDER_LABELS[config.provider]} with model "${config.model}" (${hasKey ? 'Configured' : 'Missing API Key'})`,
        });

        // 3. Workspace access
        try {
          const testFile = path.resolve(process.cwd(), '.banglacli_check.tmp');
          fs.writeFileSync(testFile, 'ok', 'utf8');
          fs.unlinkSync(testFile);
          checks.push({
            name: 'Workspace Read/Write',
            status: 'ok',
            detail: `${process.cwd()} (Read/Write verified)`,
          });
        } catch (e: any) {
          checks.push({
            name: 'Workspace Read/Write',
            status: 'error',
            detail: `Cannot write to ${process.cwd()}: ${e.message}`,
          });
        }

        // 4. Operating System & Shell
        checks.push({
          name: 'OS & Execution Shell',
          status: 'ok',
          detail: `${process.platform} (${process.arch}) with non-interactive child process safety`,
        });

        renderDoctorReport(checks);
        continue;
      }

      if (trimmed === '/diff' || trimmed === '/changes') {
        const changes = getSessionChanges();
        if (changes.length === 0) {
          console.log(chalk.yellow('\nℹ️  No file modifications or creations recorded in this session.\n'));
        } else {
          console.log('\n' + chalk.bold.hex('#00FF7F')('📁 Files Modified / Created in this Session:'));
          console.log(chalk.dim('─'.repeat(60)));
          changes.forEach((c, idx) => {
            const status = c.isNew ? chalk.green('[NEW]') : chalk.yellow('[MODIFIED]');
            const lineCount = c.newContent.split('\n').length;
            console.log(`  ${idx + 1}. ${status} ${chalk.cyan.bold(c.filePath)} ${chalk.dim(`(${lineCount} lines, ${c.newContent.length} bytes)`)}`);
          });
          console.log(chalk.dim('─'.repeat(60)) + '\n');
        }
        continue;
      }

      if (trimmed === '/undo') {
        const result = undoLastChange();
        if (result.success) {
          console.log(chalk.green(`\n${result.message}\n`));
        } else {
          console.log(chalk.yellow(`\nℹ️  ${result.message}\n`));
        }
        continue;
      }

      if (trimmed === '/compact') {
        const result = agent.compactHistory();
        console.log(
          chalk.green(
            `\n✔ Conversation history compacted!\n` +
              `Turns before: ${chalk.yellow(result.turnsBefore)} ➔ Turns after: ${chalk.green(result.turnsAfter)}\n` +
              `Context window optimized for faster responses and lower token load.\n`
          )
        );
        continue;
      }

      if (trimmed === '/session' || trimmed === '/status') {
        const changes = getSessionChanges();
        const mem = agent.getHistoryStats();
        console.log('\n' + chalk.bold.hex('#00FF7F')('📊 Active Session Status (OpenCode Style)'));
        console.log(chalk.dim('─'.repeat(60)));
        console.log(`  ${chalk.gray('Provider:')}       ${chalk.bold(PROVIDER_LABELS[config.provider])}`);
        console.log(`  ${chalk.gray('Active Model:')}   ${chalk.cyan.bold(config.model)}`);
        console.log(`  ${chalk.gray('Active Mode:')}    ${agent.getMode() === 'build' ? chalk.green.bold('⚡ BUILD') : chalk.yellow.bold('📋 PLAN')}`);
        console.log(`  ${chalk.gray('Working Dir:')}    ${chalk.white(process.cwd())}`);
        console.log(`  ${chalk.gray('Files Touched:')}  ${chalk.yellow(changes.length)} files`);
        console.log(`  ${chalk.gray('Auto-Approve:')}   ${safetySession.autoApproveAll ? chalk.green('Enabled (-y)') : chalk.gray('Confirm per action')}`);
        console.log(`  ${chalk.gray('Memory Turns:')}   ${chalk.cyan(mem.openAIMessageCount + mem.geminiTurnCount)} turns`);
        console.log(chalk.dim('─'.repeat(60)) + '\n');
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

      // Antigravity-style Priority Task Dispatch
      // User can execute a specific task first using /task, /urgent, /priority, or "urgent: <task>"
      let isPriorityTask = false;
      let taskPrompt = trimmed;

      if (trimmed.startsWith('/task ') || trimmed.startsWith('/urgent ') || trimmed.startsWith('/priority ')) {
        isPriorityTask = true;
        taskPrompt = trimmed.replace(/^\/(task|urgent|priority)\s+/i, '').trim();
      } else if (/^(urgent|priority|task):\s*/i.test(trimmed)) {
        isPriorityTask = true;
        taskPrompt = trimmed.replace(/^(urgent|priority|task):\s*/i, '').trim();
      }

      if (isPriorityTask) {
        renderPriorityTaskBanner(taskPrompt, config.model, agent.getMode());
      }

      // OpenCode @ file mentions ingestion (e.g. @src/index.ts, @package.json)
      const { expandedPrompt } = await expandOpenCodeMentions(taskPrompt);

      // Real-time Escape-to-cancel agent chat execution
      const abortController = new AbortController();
      const detachEscape = attachEscapeListener(() => {
        abortController.abort();
      });

      try {
        const reply = await agent.chat(expandedPrompt, { signal: abortController.signal });
        if (abortController.signal.aborted) {
          renderInterruptedNotice();
        } else {
          console.log('\n' + chalk.bold.hex('#00FF7F')('banglacli:'));
          console.log(renderMarkdown(reply) + '\n');
        }
      } catch (err: any) {
        if (abortController.signal.aborted) {
          renderInterruptedNotice();
        } else {
          console.error(chalk.red(`\n✖ Agent Error: ${err.message}\n`));
        }
      } finally {
        detachEscape();
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

// Explicit doctor subcommand (OpenCode style)
program
  .command('doctor')
  .alias('check')
  .description('Run automated diagnostic check of Node.js runtime, workspace, shell, and provider')
  .action(() => {
    let config = getConfig() || {
      provider: 'openrouter',
      apiKey: '',
      model: 'tencent/hy4-flash',
    };

    const checks: { name: string; status: 'ok' | 'warn' | 'error'; detail: string }[] = [];
    const nodeVer = process.version;
    const major = parseInt(nodeVer.replace('v', '').split('.')[0], 10);
    checks.push({
      name: 'Node.js Runtime',
      status: major >= 18 ? 'ok' : 'error',
      detail: `${nodeVer} (Node 18+ required for modern async streams)`,
    });

    const hasKey = Boolean(config.apiKey && config.apiKey.trim().length > 5);
    checks.push({
      name: 'AI Provider & Key',
      status: hasKey ? 'ok' : 'error',
      detail: `${PROVIDER_LABELS[config.provider] || config.provider} with model "${config.model}" (${hasKey ? 'Configured' : 'Missing API Key'})`,
    });

    try {
      const testFile = path.resolve(process.cwd(), '.banglacli_check.tmp');
      fs.writeFileSync(testFile, 'ok', 'utf8');
      fs.unlinkSync(testFile);
      checks.push({
        name: 'Workspace Read/Write',
        status: 'ok',
        detail: `${process.cwd()} (Read/Write verified)`,
      });
    } catch (e: any) {
      checks.push({
        name: 'Workspace Read/Write',
        status: 'error',
        detail: `Cannot write to ${process.cwd()}: ${e.message}`,
      });
    }

    checks.push({
      name: 'OS & Execution Shell',
      status: 'ok',
      detail: `${process.platform} (${process.arch}) with non-interactive child process safety`,
    });

    renderDoctorReport(checks);
  });

// Explicit stats subcommand
program
  .command('stats')
  .alias('cost')
  .description('Display token limits, pricing, and live cost calculation')
  .action(() => {
    let config = getConfig() || {
      provider: 'openrouter',
      apiKey: '',
      model: 'tencent/hy4-flash',
    };

    renderSessionStats({
      model: config.model,
      provider: PROVIDER_LABELS[config.provider] || config.provider,
      mode: 'build',
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalRequests: 0,
      estimatedCostSavedUsd: 0,
      filesTouched: 0,
    });
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
