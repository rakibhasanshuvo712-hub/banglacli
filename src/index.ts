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
  renderGitStatus,
  renderDirectoryTree,
  showAbout,
  renderAllTokensExhaustedReport,
} from './ui.js';
import { safetySession, getSessionChanges, undoLastChange, setActiveMeshNode, getActiveMeshNode, executeTool } from './tools.js';
import { selectAgentModelInteractive, findModelByQuery, applyModelDirect } from './models.js';
import { readOpenCodePrompt, expandOpenCodeMentions, restoreTerminalViewport, updateFixedBottomStatus, activateFixedDock, deactivateFixedDock, updateDockedModel, prepareInteractiveArea, interactiveSelect } from './prompt.js';
import { detectProjectContext } from './detector.js';
import { MeshNode } from './mesh.js';
import { captureClipboardImage, loadImagePayload, isImageFile, type ImagePayload } from './image.js';
import { exploreAndSelectFreeModel } from './explorer.js';

// Ensure terminal viewport & mesh connections are cleanly restored on process exit
process.on('exit', () => {
  getActiveMeshNode()?.stop();
  deactivateFixedDock();
  restoreTerminalViewport();
});
process.on('SIGINT', () => {
  getActiveMeshNode()?.stop();
  deactivateFixedDock();
  restoreTerminalViewport();
  process.exit(0);
});
process.on('SIGTERM', () => {
  getActiveMeshNode()?.stop();
  deactivateFixedDock();
  restoreTerminalViewport();
  process.exit(0);
});

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

  let triggered = false;
  const triggerEscape = () => {
    if (triggered) return;
    triggered = true;
    onEscape();
  };

  const onData = (chunk: Buffer | string) => {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    // Escape key is single byte 0x1B (ESC)
    if (buf.length === 1 && buf[0] === 0x1b) {
      triggerEscape();
    } else if (buf.length === 1 && buf[0] === 0x03) {
      // Ctrl+C
      process.exit(0);
    }
  };

  const keypressHandler = (str: string, key: any) => {
    if (
      (key && key.name === 'escape') ||
      str === '\x1b' ||
      str === '\u001b' ||
      (key && key.sequence === '\x1b')
    ) {
      triggerEscape();
    } else if (key && key.ctrl && key.name === 'c') {
      process.exit(0);
    }
  };

  process.stdin.on('data', onData);
  process.stdin.on('keypress', keypressHandler);

  return () => {
    process.stdin.removeListener('data', onData);
    process.stdin.removeListener('keypress', keypressHandler);
    try {
      if (!wasRaw && process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
    } catch {}
  };
}

const program = new Command();

program
  .name('banglacli')
  .description('Next-Gen Autonomous BYOK terminal coding agent that speaks Bangla, Banglish & English.')
  .version('4.2.5', '-v, --version', 'Output the current version')
  .option('-m, --model <model>', 'Override model for this session')
  .option('-M, --mode <mode>', 'Execution mode: "build" (default) or "plan"', 'build')
  .option('-p, --prompt <prompt>', 'Run a single prompt and exit')
  .option('-y, --yes', 'Auto-approve all file writes and shell commands')
  .option('-r, --role <role>', 'Instance role for cross-instance mesh (e.g. "frontend", "backend")')
  .option('--mesh-port <port>', 'Local port for mesh broker', '49152')
  .option('--mesh-token <token>', 'Shared authentication token for mesh')
  .option('--no-mesh', 'Disable cross-instance mesh networking')
  .action(async (options) => {
    if (options.yes) {
      safetySession.autoApproveAll = true;
    }

    // Check for existing configuration
    let config = getConfig();

    if (!config) {
      console.log(chalk.yellow('\nℹ️  No API key or provider found. Starting initial onboarding...\n'));
      const prompted = await promptConfig(true);
      if (!prompted) {
        console.log(chalk.yellow('\nSetup cancelled. Exiting.\n'));
        process.exit(0);
      }
      config = prompted;
    }

    if (options.model) {
      config.model = options.model;
    }

    const initialMode: 'build' | 'plan' = options.mode === 'plan' ? 'plan' : 'build';
    const agent = new BanglaAgent(config, initialMode);

    // Initialize Cross-Instance Mesh Node
    let meshNode: MeshNode | null = null;
    if (!options.noMesh) {
      meshNode = new MeshNode({
        role: options.role,
        port: options.meshPort ? parseInt(options.meshPort, 10) : undefined,
        token: options.meshToken,
        mode: initialMode,
        model: config.model,
        provider: config.provider,
        workspace: process.cwd(),
        onRemoteToolExecution: async (tool, args, fromRole) => {
          console.log(chalk.cyan(`\n📡 [Mesh RPC from ${chalk.bold(fromRole)}] Executing tool: ${chalk.bold(tool)}`));
          updateFixedBottomStatus(`[Mesh: ${fromRole}] Executing ${tool}...`, {
            mode: agent.getMode(),
            model: config?.model || 'unknown',
          });
          const result = await executeTool(tool, args, agent.getMode());
          updateFixedBottomStatus('', { mode: agent.getMode(), model: config?.model || 'unknown' });
          return result;
        },
        onPeerMessage: (message, fromRole) => {
          console.log(
            chalk.bgHex('#004D40').hex('#00FF7F').bold(`\n 📬 [Mesh Message from ${fromRole}]: `) +
              chalk.white(message) + '\n'
          );
        },
        onPeerConnect: (peer) => {
          console.log(
            chalk.green(`\n🌐 [Mesh] Connected to peer [${chalk.bold(peer.role)}] (${peer.workspace})\n`)
          );
          updateFixedBottomStatus(`Peer connected: ${peer.role}`, {
            mode: agent.getMode(),
            model: config?.model || 'unknown',
          });
        },
        onPeerDisconnect: (peer) => {
          console.log(
            chalk.yellow(`\n🌐 [Mesh] Peer disconnected: [${chalk.bold(peer.role)}] (${peer.workspace})\n`)
          );
        },
      });

      await meshNode.start();
      setActiveMeshNode(meshNode);
    }

    // Sync session config when agent auto-cascades to another model
    agent.setOnModelChange((newModel, newProvider) => {
      const freshConfig = getConfig();
      if (freshConfig) {
        config = freshConfig;
      }
      if (config) {
        config.model = newModel;
        if (newProvider) {
          config.provider = newProvider as any;
          if (config.provider === 'gemini') {
            delete (config as any).baseURL;
          } else if (config.provider === 'openrouter') {
            config.baseURL = 'https://openrouter.ai/api/v1';
          }
          const saved = config.savedProviders?.[config.provider];
          if (saved && saved.apiKey) {
            config.apiKey = saved.apiKey;
            if (config.provider !== 'gemini') {
              config.baseURL = saved.baseURL || config.baseURL;
            }
          }
        }
        saveConfig(config);
        meshNode?.updateState({ model: newModel });
        updateDockedModel(
          PROVIDER_LABELS[config.provider] || config.provider,
          config.model,
          agent.getMode()
        );
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
      let hasAborted = false;
      const detachEscape = attachEscapeListener(() => {
        if (hasAborted) return;
        hasAborted = true;
        abortController.abort();
        renderInterruptedNotice();
      });
      try {
        const { expandedPrompt, attachedImages } = await expandOpenCodeMentions(options.prompt);
        const reply = await agent.chat(expandedPrompt, {
          signal: abortController.signal,
          images: attachedImages,
        });
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
        updateFixedBottomStatus('', { mode: agent.getMode(), model: config.model });
        meshNode?.stop();
      }
      process.exit(0);
    }

    // Activate fixed-dock layout: sticky header at top + docked input box at bottom.
    // Gracefully falls back to inline banner on non-TTY or small terminals.
    const isDocked = activateFixedDock(
      PROVIDER_LABELS[config.provider] || config.provider,
      config.model,
      initialMode
    );
    if (!isDocked) {
      printBanner(PROVIDER_LABELS[config.provider], config.model, process.cwd());
    }

    let running = true;
    let stagedImages: ImagePayload[] = [];
    while (running) {
      // OpenCode & Antigravity Interactive Boxed Prompt
      // Features: Terminal Bottom Framed Box with Mode & Model badges,
      // Bracketed paste protection, multiline Shift+Enter, Esc to abort.
      const input = await readOpenCodePrompt({
        mode: agent.getMode(),
        model: config.model,
        provider: config.provider,
      });

      if (input === null) {
        deactivateFixedDock();
        restoreTerminalViewport();
        meshNode?.stop();
        console.log(chalk.yellow('\nGoodbye! Exiting banglacli.\n'));
        process.exit(0);
      }

      let trimmed = input.trim();
      if (trimmed.length === 0) {
        continue;
      }
      // Strip accidental leading prompt arrows when followed by a slash command (e.g. "> /agent", "❯ /exit")
      if (/^[>❯$#\s]+\//.test(trimmed)) {
        trimmed = trimmed.replace(/^[>❯$#\s]+/, '').trim();
      }

      // Case-insensitive normalized command
      const lowerCmd = trimmed.toLowerCase();

      // Handle Slash Commands
      if (lowerCmd === '/exit' || lowerCmd === '/quit') {
        deactivateFixedDock();
        restoreTerminalViewport();
        meshNode?.stop();
        console.log(chalk.hex('#00FF7F')('\nThanks for using banglacli. Happy coding! 🚀\n'));
        process.exit(0);
      }

      if (lowerCmd === '/help') {
        showHelp();
        continue;
      }

      if (
        lowerCmd === '/explore' ||
        lowerCmd === '/find-model' ||
        lowerCmd === '/scan' ||
        lowerCmd === '/free-tokens' ||
        lowerCmd === '/free'
      ) {
        const found = await exploreAndSelectFreeModel(config);
        if (found) {
          agent.updateConfig(config);
          updateDockedModel(
            PROVIDER_LABELS[config.provider] || config.provider,
            config.model,
            agent.getMode()
          );
        } else {
          console.log(chalk.yellow('\n⚠️ All free models currently have zero available quota across all providers.\n'));
        }
        continue;
      }

      if (
        lowerCmd === '/image' ||
        lowerCmd.startsWith('/image ') ||
        lowerCmd === '/screenshot' ||
        lowerCmd.startsWith('/screenshot ') ||
        lowerCmd === '/pic' ||
        lowerCmd.startsWith('/pic ') ||
        lowerCmd === '/paste-image' ||
        lowerCmd.startsWith('/paste-image ')
      ) {
        const rawArg = trimmed.replace(/^\/(image|screenshot|pic|paste-image)\s*/i, '').trim();
        let capturedPath: string | null = null;

        if (rawArg.length > 0) {
          const cleanArg = rawArg.replace(/^["']|["']$/g, '').trim();
          const resolved = path.isAbsolute(cleanArg) ? cleanArg : path.resolve(process.cwd(), cleanArg);
          if (fs.existsSync(resolved) && isImageFile(resolved)) {
            capturedPath = resolved;
          } else {
            console.log(chalk.red(`\n✖ Could not find image file at: ${cleanArg}\n`));
            continue;
          }
        } else {
          process.stdout.write(chalk.cyan('\n📸 Checking system clipboard for screenshot / image...\n'));
          capturedPath = captureClipboardImage();
        }

        if (capturedPath) {
          const payload = loadImagePayload(capturedPath);
          if (payload) {
            stagedImages.push(payload);
            const kb = (payload.size / 1024).toFixed(1);
            console.log(
              '\n' +
                chalk.bgHex('#004D40').hex('#00FF7F').bold(' 🖼️  IMAGE STAGED SUCCESSFULLY ') +
                '\n' +
                `  ${chalk.gray('File:')} ${chalk.white(path.basename(payload.path))}\n` +
                `  ${chalk.gray('Format:')} ${chalk.cyan(payload.mimeType)} (${kb} KB)\n` +
                `  ${chalk.gray('Saved to:')} ${chalk.dim(payload.path)}\n\n` +
                chalk.green.bold('✔ Ready!') +
                chalk.white(' Type your question or prompt (e.g. "Explain this error" or "Code this UI") and press Enter.\n')
            );
          } else {
            console.log(chalk.yellow('\n⚠️ Could not read image payload (file might be damaged or larger than 15MB).\n'));
          }
        } else {
          console.log(
            '\n' +
              chalk.bgHex('#FF9900').black.bold(' ⚠️  NO IMAGE FOUND IN CLIPBOARD ') +
              '\n' +
              chalk.white('No image data was found in your clipboard.\n\n') +
              chalk.yellow('💡 How to paste a screenshot:') +
              '\n' +
              `  1. Take a screenshot: ${chalk.bold('Win + Shift + S')} on Windows, or ${chalk.bold('Cmd + Shift + 4')} on macOS\n` +
              `  2. Return here and run ${chalk.cyan.bold('/image')}\n` +
              `  3. Or mention an image file: ${chalk.cyan.bold('@screenshot.png')} or drag-and-drop the image path into prompt.\n`
          );
        }
        continue;
      }

      if (lowerCmd === '/about' || lowerCmd === '/developer' || lowerCmd === '/creator') {
        showAbout();
        continue;
      }

      if (lowerCmd === '/renewal' || lowerCmd === '/countdown' || lowerCmd === '/renew') {
        renderAllTokensExhaustedReport();
        continue;
      }

      // Mode Switching (OpenCode Style)
      if (lowerCmd === '/mode') {
        prepareInteractiveArea(
          PROVIDER_LABELS[config.provider] || config.provider,
          config.model,
          agent.getMode()
        );
        const modeChoice = await interactiveSelect<'build' | 'plan'>({
          message: 'Select Agent Mode (OpenCode Style):',
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
        });

        if (modeChoice && !p.isCancel(modeChoice)) {
          agent.setMode(modeChoice);
          meshNode?.updateState({ mode: modeChoice });
        }
        activateFixedDock(
          PROVIDER_LABELS[config.provider] || config.provider,
          config.model,
          agent.getMode()
        );
        continue;
      }

      if (
        lowerCmd === '/plan' ||
        lowerCmd === '/mode plan' ||
        lowerCmd === 'plan mode' ||
        lowerCmd === 'switch to plan mode' ||
        lowerCmd === 'switch plan'
      ) {
        agent.setMode('plan');
        meshNode?.updateState({ mode: 'plan' });
        updateDockedModel(
          PROVIDER_LABELS[config.provider] || config.provider,
          config.model,
          'plan'
        );
        console.log(chalk.hex('#FFB300')('\n📋 Active mode switched to PLAN MODE (Senior Architect & Read-Only Planning).\n'));
        continue;
      }

      if (
        lowerCmd === '/build' ||
        lowerCmd === '/mode build' ||
        lowerCmd === 'build mode' ||
        lowerCmd === 'switch to build mode' ||
        lowerCmd === 'switch build'
      ) {
        agent.setMode('build');
        meshNode?.updateState({ mode: 'build' });
        updateDockedModel(
          PROVIDER_LABELS[config.provider] || config.provider,
          config.model,
          'build'
        );
        console.log(chalk.hex('#00FF7F')('\n⚡ Active mode switched to BUILD MODE (Autonomous Full-Stack Coding & Execution Enabled).\n'));
        continue;
      }

      if (lowerCmd.includes('you are in build mode') && agent.getMode() !== 'build') {
        agent.setMode('build');
        meshNode?.updateState({ mode: 'build' });
        updateDockedModel(
          PROVIDER_LABELS[config.provider] || config.provider,
          config.model,
          'build'
        );
      }

      if (lowerCmd === '/guide' || lowerCmd === '/keys') {
        showFreeApiKeyGuide();
        continue;
      }

      const cleanCmd = lowerCmd.replace(/[\s\-_]+/g, '');
      if (
        cleanCmd === '/limits' ||
        cleanCmd === '/limit' ||
        cleanCmd === '/tokens' ||
        cleanCmd === '/token' ||
        cleanCmd === '/quota' ||
        cleanCmd === '/quotas' ||
        lowerCmd.startsWith('/limits') ||
        lowerCmd.startsWith('/limit') ||
        lowerCmd.startsWith('/ limits') ||
        lowerCmd.startsWith('/ limit')
      ) {
        showTokenLimitsGuide();
        continue;
      }

      if (lowerCmd === '/stats' || lowerCmd === '/cost') {
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

      if (trimmed === '/git') {
        renderGitStatus();
        continue;
      }

      if (trimmed === '/tree') {
        renderDirectoryTree();
        continue;
      }

      if (trimmed === '/detect' || trimmed === '/stack') {
        const ctx = detectProjectContext();
        console.log('\n' + chalk.bold.hex('#00FF7F')('🔍 Detected Workspace Environment'));
        console.log(chalk.dim('─'.repeat(60)));
        console.log(ctx.summary.split('\n').slice(1).map(l => '  ' + l).join('\n'));
        console.log(chalk.dim('─'.repeat(60)) + '\n');
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

      if (trimmed === '/peers' || trimmed === '/mesh') {
        const mesh = getActiveMeshNode();
        if (!mesh) {
          console.log(chalk.yellow('\nℹ️ Cross-instance mesh is disabled on this instance (--no-mesh).\n'));
        } else {
          const allPeers = mesh.listPeers();
          const remotePeers = allPeers.filter((p) => p.nodeId !== mesh.nodeId);
          console.log('\n' + chalk.bold.hex('#00FF7F')('🌐 Cross-Instance Workspace Mesh (Multi-Agent Sync)'));
          console.log(chalk.dim('─'.repeat(70)));
          console.log(`  ${chalk.bold('This Instance:')}  [${chalk.cyan.bold(mesh.role.toUpperCase())}] (Node: ${chalk.gray(mesh.nodeId)})`);
          console.log(`  ${chalk.gray('Workspace:')}      ${mesh.workspace}`);
          console.log(`  ${chalk.gray('Mesh Status:')}    ${mesh['isHost'] ? chalk.green('Broker Host') : chalk.blue('Peer Client')} on 127.0.0.1:${mesh.port}`);
          console.log(`  ${chalk.gray('Active Mode:')}   ${mesh.mode === 'build' ? chalk.green('⚡ BUILD') : chalk.yellow('📋 PLAN')}`);
          console.log(chalk.dim('─'.repeat(70)));
          if (remotePeers.length === 0) {
            console.log(chalk.yellow(`  No other banglacli instances connected yet.`));
            console.log(chalk.gray(`  Tip: Open another terminal in your backend/frontend repo and run "banglacli --role backend"!\n`));
          } else {
            console.log(chalk.bold(`  Connected Peers (${remotePeers.length}):`));
            remotePeers.forEach((p, idx) => {
              const roleBadge = chalk.bold.hex('#00FF7F')(`[${p.role.toUpperCase()}]`);
              const modeBadge = p.mode === 'build' ? chalk.green('BUILD') : chalk.yellow('PLAN');
              console.log(`  ${idx + 1}. ${roleBadge} (nodeId: ${chalk.gray(p.nodeId)})`);
              console.log(`     📁 Workspace: ${chalk.white(p.workspace)}`);
              console.log(`     ⚡ Mode: ${modeBadge}  •  🤖 Model: ${chalk.cyan(p.model)} (${p.provider})`);
            });
            console.log(chalk.dim('─'.repeat(70)) + '\n');
          }
        }
        continue;
      }

      if (trimmed === '/role' || trimmed.startsWith('/role ')) {
        const parts = trimmed.split(/\s+/);
        const mesh = getActiveMeshNode();
        if (!mesh) {
          console.log(chalk.yellow('\nℹ️ Mesh is not active on this instance.\n'));
          continue;
        }
        if (parts.length > 1) {
          const newRole = parts.slice(1).join('-').trim();
          mesh.updateState({ role: newRole });
          console.log(chalk.green(`\n✔ Instance role updated to: [${chalk.bold(newRole)}]\n`));
        } else {
          console.log(chalk.cyan(`\nCurrent instance role: [${chalk.bold(mesh.role)}] (Usage: /role <frontend|backend|name>)\n`));
        }
        continue;
      }

      if (trimmed.startsWith('/send ') || trimmed.startsWith('/msg ')) {
        const parts = trimmed.split(/\s+/);
        if (parts.length < 3) {
          console.log(chalk.yellow('\nUsage: /send <role|nodeId> <message>\nExample: /send backend Please implement /api/users route.\n'));
          continue;
        }
        const target = parts[1];
        const msg = parts.slice(2).join(' ');
        const mesh = getActiveMeshNode();
        if (!mesh) {
          console.log(chalk.yellow('\nℹ️ Mesh is not active on this instance.\n'));
          continue;
        }
        const result = await mesh.sendMessage(target, msg);
        console.log(chalk.green(`\n✔ ${result}\n`));
        continue;
      }

      if (trimmed === '/clear') {
        agent.resetHistory();
        console.log(chalk.green('✔ Conversation history cleared! Session memory reset.\n'));
        continue;
      }

      if (lowerCmd === '/provider') {
        prepareInteractiveArea(
          PROVIDER_LABELS[config.provider] || config.provider,
          config.model,
          agent.getMode()
        );
        const newConfig = await switchProviderInteractive(config);
        if (newConfig) {
          config = newConfig;
          agent.updateConfig(newConfig);
        }
        activateFixedDock(
          PROVIDER_LABELS[config.provider] || config.provider,
          config.model,
          agent.getMode()
        );
        continue;
      }

      if (lowerCmd === '/config') {
        prepareInteractiveArea(
          PROVIDER_LABELS[config.provider] || config.provider,
          config.model,
          agent.getMode()
        );
        const newConfig = await promptConfig(false);
        config = newConfig;
        agent.updateConfig(newConfig);
        activateFixedDock(
          PROVIDER_LABELS[config.provider] || config.provider,
          config.model,
          agent.getMode()
        );
        continue;
      }

      // Quick Category Direct Shortcuts
      const directCategoryShortcuts: Record<string, string> = {
        '/gemini': 'gemini',
        '/deepseek': 'deepseek',
        '/groq': 'groq',
        '/free': 'free',
        '/openrouter': 'free',
        '/flagship': 'flagship',
        '/local': 'local',
        '/ollama': 'local',
      };

      if (directCategoryShortcuts[lowerCmd]) {
        const targetCategory = directCategoryShortcuts[lowerCmd];
        const newConfig = await selectAgentModelInteractive(config, agent.getMode(), targetCategory);
        if (newConfig) {
          config = newConfig;
          agent.updateConfig(newConfig);
        }
        activateFixedDock(
          PROVIDER_LABELS[config.provider] || config.provider,
          config.model,
          agent.getMode()
        );
        continue;
      }

      const isModelCommand =
        lowerCmd === '/model' ||
        lowerCmd === '/models' ||
        lowerCmd === '/agent' ||
        lowerCmd === '/agents' ||
        lowerCmd === '/m' ||
        lowerCmd === '/select-model' ||
        lowerCmd === '/choose-model' ||
        lowerCmd.startsWith('/model ') ||
        lowerCmd.startsWith('/models ') ||
        lowerCmd.startsWith('/agent ') ||
        lowerCmd.startsWith('/agents ') ||
        lowerCmd.startsWith('/m ');

      if (isModelCommand) {
        const parts = trimmed.split(/\s+/);
        const query = parts.length > 1 ? parts.slice(1).join(' ').trim() : '';

        if (query.length > 0) {
          const match = findModelByQuery(query);
          if (match) {
            const directConfig: BanglaCLIConfig | null = await applyModelDirect(match, config);
            if (directConfig) {
              config = directConfig;
              agent.updateConfig(directConfig);
              updateDockedModel(
                PROVIDER_LABELS[config.provider] || config.provider,
                config.model,
                agent.getMode()
              );
            }
            continue;
          } else if (query.includes('/') || query.startsWith('gemini-') || query.startsWith('gemma-') || query.startsWith('gpt-')) {
            // Apply custom model slug cleanly with provider detection
            const inferredProvider =
              query.startsWith('gemini-') || query.startsWith('gemma-')
                ? ('gemini' as const)
                : query.includes('/')
                ? ('openrouter' as const)
                : config.provider;
            const inferredConfig = await applyModelDirect(
              {
                id: query,
                name: query,
                provider: inferredProvider,
                category: inferredProvider === 'gemini' ? 'gemini' : 'free',
                description: 'Direct model slug',
                badge: 'Direct',
                baseURL: inferredProvider === 'openrouter' ? 'https://openrouter.ai/api/v1' : undefined,
              },
              config
            );
            if (inferredConfig) {
              config = inferredConfig;
              agent.updateConfig(inferredConfig);
              updateDockedModel(
                PROVIDER_LABELS[config.provider] || config.provider,
                config.model,
                agent.getMode()
              );
            }
            continue;
          }
        }

        const newConfig = await selectAgentModelInteractive(config, agent.getMode());
        if (newConfig) {
          config = newConfig;
          agent.updateConfig(newConfig);
        }
        activateFixedDock(
          PROVIDER_LABELS[config.provider] || config.provider,
          config.model,
          agent.getMode()
        );
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

      // OpenCode @ file mentions and image ingestion
      const { expandedPrompt, attachedImages } = await expandOpenCodeMentions(taskPrompt);
      const allImages = [...stagedImages, ...attachedImages];
      stagedImages = []; // reset staged images after passing to agent

      // Real-time Escape-to-cancel agent chat execution
      const abortController = new AbortController();
      let hasAborted = false;
      const detachEscape = attachEscapeListener(() => {
        if (hasAborted) return;
        hasAborted = true;
        abortController.abort();
        renderInterruptedNotice();
        updateFixedBottomStatus('⏹️ Stopped by Escape key', {
          mode: agent.getMode(),
          model: config?.model || 'unknown',
        });
      });

      try {
        const reply = await agent.chat(expandedPrompt, {
          signal: abortController.signal,
          images: allImages,
        });
        if (abortController.signal.aborted || hasAborted) {
          // Notice already rendered immediately upon Escape press
        } else {
          console.log('\n' + chalk.bold.hex('#00FF7F')('banglacli:'));
          console.log(renderMarkdown(reply) + '\n');
        }
      } catch (err: any) {
        if (abortController.signal.aborted || hasAborted) {
          // Notice already rendered immediately upon Escape press
        } else {
          console.error(chalk.red(`\n✖ Agent Error: ${err.message}\n`));
        }
      } finally {
        detachEscape();
        updateFixedBottomStatus('', { mode: agent.getMode(), model: config.model });
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
  .alias('limit')
  .alias('tokens')
  .alias('token')
  .alias('quota')
  .alias('quotas')
  .description('Display free token limits, context windows, and rate limits for all models')
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
    await selectAgentModelInteractive(config, 'build');
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

// Explicit about subcommand (Developer, GitHub & Project details)
program
  .command('about')
  .alias('developer')
  .alias('author')
  .description('Display creator, developer GitHub profile, and project details')
  .action(() => {
    showAbout();
  });

// Explicit renewal subcommand (Token renewal countdown & provider schedule)
program
  .command('renewal')
  .alias('countdown')
  .alias('renew')
  .description('Display live token quota renewal countdown and provider reset schedules')
  .action(() => {
    renderAllTokensExhaustedReport();
  });

// Explicit doctor subcommand (OpenCode style)
program
  .command('doctor')
  .alias('check')
  .description('Run automated diagnostic check of Node.js runtime, workspace, shell, and provider')
  .action(() => {
    let config = getConfig() || {
      provider: 'gemini',
      apiKey: '',
      model: 'gemini-3.5-flash-lite',
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
      provider: 'gemini',
      apiKey: '',
      model: 'gemini-3.5-flash-lite',
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
    const choice = await interactiveSelect({
      message: 'Switch Gemini Model:',
      initialValue: config.model,
      options: [
        { value: 'gemini-3.5-flash-lite', label: 'gemini-3.5-flash-lite (🌟 Verified Active Free, 1M Tokens, 1,500 RPD)' },
        { value: 'gemini-3.1-flash-lite', label: 'gemini-3.1-flash-lite (Ultra-Fast Free Tier)' },
        { value: 'gemma-4-31b-it', label: 'gemma-4-31b-it (Gemma 4 31B Tool-Capable Free)' },
        { value: 'gemma-4-26b-a4b-it', label: 'gemma-4-26b-a4b-it (Gemma 4 26B MoE Free)' },
        { value: 'gemini-3.5-flash', label: 'gemini-3.5-flash (Flagship Flash Free)' },
        { value: 'gemini-3.8-flash', label: 'gemini-3.8-flash (Next-Gen 2M Context)' },
        { value: 'custom_input', label: 'Enter custom model name...' },
      ],
    });

    if (!choice || p.isCancel(choice)) return;

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
    const choice = await interactiveSelect({
      message: 'Switch OpenRouter Model:',
      initialValue: config.model || 'openrouter/free',
      options: [
        { value: 'openrouter/free', label: 'openrouter/free (Recommended - Best Free Model with Tools)' },
        { value: 'google/gemma-4-31b-it:free', label: 'google/gemma-4-31b-it:free (Free 31B Coding & Chat)' },
        { value: 'nvidia/nemotron-3.5-lightning:free', label: 'nvidia/nemotron-3.5-lightning:free (Free Fast Model)' },
        { value: 'inclusionai/ling-3.2-flash:free', label: 'inclusionai/ling-3.2-flash:free (Free Flash Model)' },
        { value: 'custom_input', label: 'Enter custom OpenRouter model ID...' },
      ],
    });

    if (!choice || p.isCancel(choice)) return;

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

// Explicit peers subcommand
program
  .command('peers')
  .alias('mesh')
  .description('Discover and display connected cross-instance mesh peers (e.g. frontend, backend)')
  .action(async () => {
    const node = new MeshNode({ role: 'cli-scanner', workspace: process.cwd() });
    await node.start();
    const peers = node.listPeers().filter((p) => p.nodeId !== node.nodeId);
    console.log('\n' + chalk.bold.hex('#00FF7F')('🌐 Cross-Instance Workspace Mesh Status:'));
    console.log(chalk.dim('─'.repeat(70)));
    if (peers.length === 0) {
      console.log(chalk.yellow('  No other active banglacli instances detected on 127.0.0.1:49152.'));
      console.log(chalk.gray('  Start an instance with: banglacli --role frontend or banglacli --role backend\n'));
    } else {
      console.log(chalk.bold(`  Active Peers (${peers.length}):`));
      peers.forEach((p, idx) => {
        console.log(`  ${idx + 1}. [${chalk.cyan.bold(p.role.toUpperCase())}] (${chalk.gray(p.nodeId)})`);
        console.log(`     📁 Workspace: ${chalk.white(p.workspace)}`);
        console.log(`     ⚡ Mode: ${p.mode.toUpperCase()}  •  🤖 Model: ${p.model} (${p.provider})`);
      });
      console.log(chalk.dim('─'.repeat(70)) + '\n');
    }
    node.stop();
  });

program.parse(process.argv);
