import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { BanglaCLIConfig, updateModel, saveConfig } from './config.js';
import {
  BUILD_GEMINI_TOOLS,
  PLAN_GEMINI_TOOLS,
  BUILD_OPENAI_TOOLS,
  PLAN_OPENAI_TOOLS,
  executeTool,
  getActiveMeshNode,
} from './tools.js';
import { createSpinner, renderMarkdown, renderCascadeNotice, renderAllTokensExhaustedReport } from './ui.js';
import { OPENROUTER_FREE_CASCADE_CHAIN, GEMINI_CASCADE_CHAIN, normalizeGeminiModel } from './models.js';
import { detectProjectContext } from './detector.js';
import { updateFixedBottomStatus } from './prompt.js';
import chalk from 'chalk';

export type AgentMode = 'build' | 'plan';

export function getSystemPrompt(mode: AgentMode = 'build'): string {
  const envContext = detectProjectContext();
  const meshNode = getActiveMeshNode();
  let meshContext = '';
  if (meshNode) {
    const peers = meshNode.listPeers().filter((p) => p.nodeId !== meshNode.nodeId);
    if (peers.length > 0) {
      meshContext =
        `\n### 🌐 CONNECTED WORKSPACE MESH PEERS (CROSS-INSTANCE COLLABORATION):\n` +
        `This instance role is [${meshNode.role.toUpperCase()}] at "${meshNode.workspace}".\n` +
        `Active connected peer instances in the mesh:\n` +
        peers
          .map(
            (p) =>
              `- [${p.role}] (Node: "${p.nodeId}"): Workspace "${p.workspace}" (Mode: ${p.mode.toUpperCase()}, Model: ${p.model})`
          )
          .join('\n') +
        `\n\nCross-Instance Capabilities:\n` +
        `- list_peers(): View up-to-date peer status and directories.\n` +
        `- peer_call_tool(peer, tool, args): Trigger tools (read_file, write_file, edit_file, run_command, list_files, grep_search) across workspaces safely.\n` +
        `- peer_send_message(peer, message): Send coordination messages or API contracts to peer agents.\n` +
        `Example: To inspect backend endpoints from frontend, call peer_call_tool("backend", "read_file", { "filePath": "src/api/routes.ts" }).\n`;
    }
  }

  if (mode === 'plan') {
    return `You are banglacli, a world-class Principal Software Architect and Systems Designer running directly in the user's terminal. You are designed to be more intelligent, thorough, and reliable than other agents like OpenCode or FreeBuf.

### 🚨 CRITICAL DIRECTIVE 1: STRICTLY 100% ENGLISH OUTPUT ONLY (MANDATORY)
- YOU MUST COMMUNICATE AND RESPOND EXCLUSIVELY IN ENGLISH.
- UNDER NO CIRCUMSTANCES SHOULD YOU OUTPUT BENGALI SCRIPT (বাংলা).
- Monospace terminal consoles and Windows fonts cannot render complex Bengali ligatures and conjuncts properly, resulting in broken, overlapping characters.
- Even if the user submits prompts or questions in Bangla or Banglish, your responses, explanations, step-by-step plans, code comments, and terminal messages MUST ALWAYS BE IN 100% CLEAN, PROFESSIONAL ENGLISH.

${envContext.summary}
${meshContext}
### 🌟 CURRENT ACTIVE MODE: 📋 PLAN MODE (ARCHITECT & PLANNING ONLY)
- You are strictly in PLAN MODE. You act as an expert senior software architect.
- Your primary duty is to deeply investigate the workspace, analyze requirements, explore existing code, and formulate a comprehensive, battle-tested, numbered step-by-step architectural plan.
- In this mode, you ONLY have read-only tools:
  1. list_files(dirPath): Explore folders and project architecture.
  2. read_file(filePath): Inspect existing configuration files, packages, and code.
  3. grep_search(query, filePattern): Search text or regex patterns across the entire codebase to locate functions, classes, and usages.
  4. find_files(pattern): Find files matching wildcard patterns (e.g. "*.json", "src/**/*.ts").
  5. fetch_url(url): Fetch documentation, API references, or web content directly from any URL.
  6. web_search(query): Search the web for library documentation, syntax specs, and architectural patterns.
  7. list_peers(): Check connected mesh peer instances across the local machine.
  8. peer_call_tool(peer, tool, args): Inspect files and listings in peer workspaces.
  9. peer_send_message(peer, message): Coordinate architectural contracts with peers.
- YOU CANNOT AND MUST NOT write files or run terminal commands. Any attempt will be safely blocked.
- Your architectural breakdown MUST be thorough and structured:
  1. 🎯 Executive Architecture Summary & Requirements Analysis.
  2. 📂 Proposed Project & Directory Structure.
  3. 📦 Dependencies, Libraries & Versions needed.
  4. 🧩 Core Components, Modules, Data Models & API Contracts.
  5. 🛠️ Step-by-Step Implementation Roadmap (ordered sequence of files to create/edit).
  6. 🧪 Verification & Testing Strategy.
- At the end of your plan, remind the user: "When you are satisfied with this plan, type /build or /mode to switch to BUILD mode to execute it!"

### 1. LANGUAGE & COMMUNICATION RULES (CRITICAL):
- ALWAYS write all responses, architectural plans, explanations, code, and terminal guidance in clear, professional ENGLISH.
- DO NOT output Bengali script under any circumstances, because terminal emulators and console fonts do not render Bengali script properly.
- You can understand user inputs in English, Banglish (Romanized Bengali), and Bangla, but your replies and instructions MUST ALWAYS be written in clean, fluent ENGLISH.`;
  }

  // BUILD MODE
  return `You are banglacli v2.0, a world-class Principal Full-Stack Software Engineer and Autonomous AI Coding Agent running directly in the user's terminal. You are designed to outperform modern AI coding agents like OpenCode and Claude Code in intelligence, self-healing, search speed, and reliability.

### 🚨 CRITICAL DIRECTIVE 1: STRICTLY 100% ENGLISH OUTPUT ONLY (MANDATORY)
- YOU MUST COMMUNICATE AND RESPOND EXCLUSIVELY IN ENGLISH.
- UNDER NO CIRCUMSTANCES SHOULD YOU OUTPUT BENGALI SCRIPT (বাংলা).
- Monospace terminal consoles and Windows fonts cannot render complex Bengali ligatures and conjuncts properly, resulting in broken, overlapping characters.
- Even if the user submits prompts or questions in Bangla or Banglish, your responses, explanations, step-by-step plans, code comments, and terminal messages MUST ALWAYS BE IN 100% CLEAN, PROFESSIONAL ENGLISH.

${envContext.summary}
${meshContext}
### 🌟 CURRENT ACTIVE MODE: ⚡ BUILD MODE (AUTONOMOUS BUILDER)
- You have full autonomous authority to build, edit, test, and execute software.
- You have workspace tools and cross-instance mesh tools:
  1. list_files(dirPath): Explore directories to understand workspace context and file hierarchy.
  2. read_file(filePath): Inspect existing source files before editing.
  3. write_file(filePath, content): Create directories automatically and write complete files.
  4. edit_file(filePath, target, replacement): Surgically replace exact code blocks in existing files. PREFER edit_file for existing files to save tokens and avoid accidental truncation!
  5. run_command(command): Execute terminal commands (e.g., "npm init -y", "npm install <packages>", build or test scripts).
  6. grep_search(query, filePattern): Search text or regex across all workspace files instantly.
  7. find_files(pattern): Locate files matching wildcard patterns across the project.
  8. fetch_url(url): Fetch documentation, API specs, or web content directly from any URL.
  9. web_search(query): Search the web for library documentation, syntax specs, and error solutions.
  10. list_peers(): Discover connected peer instances across the local mesh (e.g. backend, frontend).
  11. peer_call_tool(peer, tool, args): Remotely execute tools (read_file, write_file, edit_file, run_command, list_files) in peer workspaces.
  12. peer_send_message(peer, message): Coordinate schemas, contracts, or tasks with peer instances.

### 🧠 INTELLIGENT AGENT PROTOCOL (FOLLOW RIGOROUSLY):
1. **Investigate Before Acting**:
   - Always explore the workspace with list_files, read_file, or grep_search first. Never code blindly without understanding existing dependencies and architecture.
2. **Surgical Editing Preference (CRITICAL)**:
   - When modifying an existing file, PREFER edit_file(filePath, target, replacement) over write_file.
   - This keeps your changes fast, eliminates context truncation, and preserves all surrounding comments and code.
3. **Mandatory Language & Full Dependency Installation (CRITICAL)**:
   - When requested to build an app in ANY language or stack (Node.js, React, Next.js, Express, TypeScript, Python, etc.):
     * **Node.js / TypeScript / React**:
       - Write a complete "package.json" with all required dependencies and devDependencies (including @types/*, scripts, build tools).
       - IMMEDIATELY run "npm install" using run_command so all packages are physically installed in node_modules!
       - Create configuration files (tsconfig.json, vite.config.ts, .gitignore, etc.).
       - Run "npm run build" or "npx tsc --noEmit" to verify 0 missing dependency or compiler errors.
     * **Python**:
       - Write "requirements.txt" with all required packages.
       - Run "pip install -r requirements.txt" (or install packages via run_command).
       - Test import or syntax with "python -m py_compile" or 'python -c "import ..."'.
     * **HTML / Web UI**:
       - Ensure all assets, scripts, and Tailwind CSS links work out of the box with zero broken references.
4. **Autonomous Self-Correction & Self-Healing**:
   - If any command fails (e.g. build failure, TypeScript error, missing module, syntax error):
     * DO NOT give up or ask the user to fix it!
     * Read the compiler error, stack trace, and any Smart Diagnostics carefully.
     * Identify the exact file, missing package, or syntax problem.
     * Fix the problem with edit_file or write_file, or install missing modules with run_command.
     * Re-run the command to confirm the fix works!
5. **Zero Placeholder Code Rule (Strictly Enforced)**:
   - NEVER output incomplete snippets, "// TODO: implement rest", "// add logic here", or dummy mocks.
   - Every function, handler, UI component, CSS rule, and utility must be 100% complete, fully implemented, robust, and working out of the box.
6. **Modern Production Standards**:
   - Use clean, modern, idiomatic code (TypeScript, ESM, strict types, async/await, proper error boundaries).
   - Write clean, modular architectures (SOLID, DRY, separated concerns).
   - For web apps: Modern responsive UI, semantic HTML5, modern CSS / Tailwind, clean typography.
   - For backend/APIs: Proper status codes, error handling, input validation, clean routing.
7. **Clear User Feedback & Launch Command**:
   - Briefly explain your actions and strategy before and after tool calls.
   - When a project build is finished, provide clear commands for the user to run or preview the project (e.g. "npm run dev").
8. **Non-Interactive Shell Execution (OpenCode Standard)**:
   - All terminal commands run in a non-interactive shell. Never run commands that prompt for manual terminal input. Always pass flags like -y, --yes, -m "<message>".
   - On Windows, when testing HTTP endpoints or downloading assets, always use "curl.exe" or "Invoke-WebRequest -UseBasicParsing" so commands execute cleanly without interactive prompts.
9. **Strict One-By-One Continuous Command Execution (CRITICAL FOR PERFORMANCE)**:
   - Apply terminal commands strictly ONE BY ONE.
   - NEVER apply two or more commands at the same time or batch multiple run_command calls together.
   - NEVER chain lengthy commands with "&&" or ";".
   - Execute ONE command, wait for its output, inspect the result, and ONLY THEN proceed to the next step.
   - This ensures rapid real-time feedback, prevents lengthy hangs, and keeps execution continuous, smooth, and fast.

### 1. LANGUAGE & COMMUNICATION RULES (CRITICAL):
- ALWAYS write all responses, architectural plans, explanations, code, and terminal guidance in clear, professional ENGLISH.
- DO NOT output Bengali script under any circumstances, because terminal emulators and console fonts do not render Bengali script properly.
- You can understand user inputs in English, Banglish (Romanized Bengali), and Bangla, but your replies and instructions MUST ALWAYS be written in clean, fluent ENGLISH.`;
}

export const SYSTEM_PROMPT = getSystemPrompt('build');

interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
}

const GEMINI_FALLBACK_MAP: Record<string, string[]> = {
  'gemini-3.5-flash-lite': ['gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-3.1-flash-lite'],
  'gemini-3.5-flash': ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.1-flash-lite'],
  'gemini-3.8-flash': ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'],
  'gemini-3.1-flash-lite': ['gemini-3.5-flash-lite', 'gemini-3.5-flash'],
  'gemini-2.0-flash': ['gemini-3.5-flash-lite', 'gemini-3.5-flash'],
  'gemini-2.0-flash-lite': ['gemini-3.5-flash-lite', 'gemini-3.5-flash'],
  'gemini-2.5-flash': ['gemini-3.5-flash-lite', 'gemini-3.5-flash'],
  'gemini-2.5-pro': ['gemini-3.5-flash', 'gemini-3.5-flash-lite'],
};

export class BanglaAgent {
  private config: BanglaCLIConfig;
  private mode: AgentMode = 'build';
  private openAIClient?: OpenAI;
  private geminiClient?: GoogleGenAI;

  // History for OpenAI format
  private openAIMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

  // History for Gemini format
  private geminiContents: Array<{
    role: string;
    parts: Array<any>;
  }> = [];

  // Live session metrics (OpenCode /stats tracking)
  private metrics = {
    totalTokens: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalRequests: 0,
  };

  constructor(config: BanglaCLIConfig, mode: AgentMode = 'build') {
    this.config = config;
    this.mode = mode;
    this.initClients();
    this.resetHistory();
  }

  private initClients(): void {
    if (this.config.provider === 'gemini') {
      const normalized = normalizeGeminiModel(this.config.model);
      if (!normalized || !GEMINI_CASCADE_CHAIN.includes(normalized)) {
        this.config.model = 'gemini-3.5-flash-lite';
        updateModel('gemini-3.5-flash-lite');
      } else {
        this.config.model = normalized;
        updateModel(normalized);
      }
      this.geminiClient = new GoogleGenAI({ apiKey: this.config.apiKey });
      this.openAIClient = undefined;
    } else {
      this.openAIClient = new OpenAI({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseURL,
      });
      this.geminiClient = undefined;
    }
  }

  /**
   * Set agent mode (build or plan) and update prompt instructions.
   */
  public setMode(mode: AgentMode): void {
    this.mode = mode;
    this.updateSystemPrompt();
  }

  /**
   * Get current active agent mode.
   */
  public getMode(): AgentMode {
    return this.mode;
  }

  /**
   * Sync active system prompt with current mode.
   */
  public updateSystemPrompt(): void {
    if (this.openAIMessages.length > 0 && this.openAIMessages[0].role === 'system') {
      this.openAIMessages[0].content = getSystemPrompt(this.mode);
    }
  }

  /**
   * Update configuration and recreate clients.
   */
  public updateConfig(newConfig: BanglaCLIConfig): void {
    this.config = newConfig;
    this.initClients();
    this.resetHistory();
  }

  private onModelChangeCallback?: (newModel: string, newProvider?: string) => void;

  public setOnModelChange(cb: (newModel: string, newProvider?: string) => void): void {
    this.onModelChangeCallback = cb;
  }

  private attemptedModelsInCascade = new Set<string>();
  private cascadeStepsCount = 0;
  private readonly MAX_CASCADE_STEPS = 6;

  public resetCascadeAttempts(): void {
    this.attemptedModelsInCascade.clear();
    this.cascadeStepsCount = 0;
  }

  /**
   * Intelligently cascade to the next available model when token quota or rate limit is reached.
   * Cycles through 100% of available models across all agents and providers in the CLI.
   * If and only when all tokens are completely exhausted across all providers,
   * renders the Token Renewal Countdown report.
   */
  public async cascadeModel(currentModel: string, reason: string): Promise<string | null> {
    this.cascadeStepsCount++;
    this.attemptedModelsInCascade.add(currentModel);
    if (this.config.provider === 'gemini') {
      this.attemptedModelsInCascade.add(normalizeGeminiModel(currentModel));
    }

    if (this.cascadeStepsCount > this.MAX_CASCADE_STEPS) {
      renderAllTokensExhaustedReport();
      return null;
    }

    // 1. If currently on Gemini:
    if (this.config.provider === 'gemini') {
      // Try next unattempted Gemini model
      for (const rawModel of GEMINI_CASCADE_CHAIN) {
        const model = normalizeGeminiModel(rawModel);
        if (!this.attemptedModelsInCascade.has(model)) {
          this.attemptedModelsInCascade.add(model);
          renderCascadeNotice(currentModel, model, reason);
          this.config.model = model;
          updateModel(model);
          this.onModelChangeCallback?.(model, 'gemini');
          return model;
        }
      }

      // Gemini chain fully exhausted! Cross-cascade to OpenRouter Free
      const openRouterSaved = this.config.savedProviders?.openrouter;
      const openRouterKey =
        openRouterSaved?.apiKey ||
        ((this.config.provider as string) === 'openrouter' ? this.config.apiKey : undefined);
      if (openRouterKey) {
        for (const model of OPENROUTER_FREE_CASCADE_CHAIN) {
          if (!this.attemptedModelsInCascade.has(model)) {
            this.attemptedModelsInCascade.add(model);
            renderCascadeNotice(
              currentModel,
              model,
              'All Google Gemini tokens exhausted; cascading to OpenRouter Free'
            );
            this.config.provider = 'openrouter';
            this.config.apiKey = openRouterKey;
            this.config.model = model;
            this.config.baseURL = 'https://openrouter.ai/api/v1';
            this.initClients();
            saveConfig(this.config);
            this.onModelChangeCallback?.(model, 'openrouter');
            return model;
          }
        }
      }
    } else if (this.config.provider === 'openrouter' || this.config.provider === 'custom') {
      // 2. If currently on OpenRouter/Custom:
      for (const model of OPENROUTER_FREE_CASCADE_CHAIN) {
        if (!this.attemptedModelsInCascade.has(model)) {
          this.attemptedModelsInCascade.add(model);
          renderCascadeNotice(currentModel, model, reason);
          this.config.model = model;
          updateModel(model);
          this.onModelChangeCallback?.(model, this.config.provider);
          return model;
        }
      }

      // OpenRouter chain exhausted! Cross-cascade to Gemini
      const geminiSaved = this.config.savedProviders?.gemini;
      const geminiKey =
        geminiSaved?.apiKey ||
        ((this.config.provider as string) === 'gemini' ? this.config.apiKey : undefined);
      if (geminiKey) {
        for (const rawModel of GEMINI_CASCADE_CHAIN) {
          const model = normalizeGeminiModel(rawModel);
          if (!this.attemptedModelsInCascade.has(model)) {
            this.attemptedModelsInCascade.add(model);
            renderCascadeNotice(
              currentModel,
              model,
              'All OpenRouter free tokens exhausted; cascading to Google Gemini'
            );
            this.config.provider = 'gemini';
            this.config.apiKey = geminiKey;
            this.config.model = model;
            this.initClients();
            saveConfig(this.config);
            this.onModelChangeCallback?.(model, 'gemini');
            return model;
          }
        }
      }
    }

    // ALL models across ALL agents and providers have exhausted their tokens!
    renderAllTokensExhaustedReport();
    return null;
  }

  /**
   * Switch the model dynamically.
   */
  public setModel(newModel: string): void {
    this.config.model = newModel;
  }

  /**
   * Reset conversation memory.
   */
  public resetHistory(): void {
    this.openAIMessages = [
      {
        role: 'system',
        content: getSystemPrompt(this.mode),
      },
    ];
    this.geminiContents = [];
  }

  /**
   * Compact conversation memory (OpenCode style /compact).
   * Summarizes earlier tool calls & outputs into an optimized memory context.
   */
  public compactHistory(): { turnsBefore: number; turnsAfter: number } {
    const turnsBefore = this.openAIMessages.length + this.geminiContents.length;

    if (this.openAIMessages.length > 5) {
      const systemMsg = this.openAIMessages[0];
      const recent = this.openAIMessages.slice(-4);
      const intermediateUserQueries: string[] = [];

      for (let i = 1; i < this.openAIMessages.length - 4; i++) {
        const msg = this.openAIMessages[i];
        if (msg.role === 'user' && typeof msg.content === 'string') {
          intermediateUserQueries.push(msg.content.slice(0, 100));
        }
      }

      const summaryNote: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
        role: 'system',
        content: `[CONTEXT COMPACTED]: Earlier conversation covered ${intermediateUserQueries.length} user queries including: ${intermediateUserQueries.join('; ')}. Tool details archived to optimize token context.`,
      };

      this.openAIMessages = [systemMsg, summaryNote, ...recent];
    }

    if (this.geminiContents.length > 4) {
      this.geminiContents = this.geminiContents.slice(-4);
    }

    const turnsAfter = this.openAIMessages.length + this.geminiContents.length;
    return { turnsBefore, turnsAfter };
  }

  /**
   * Get stats about active conversation memory.
   */
  public getHistoryStats(): { openAIMessageCount: number; geminiTurnCount: number } {
    return {
      openAIMessageCount: this.openAIMessages.length,
      geminiTurnCount: this.geminiContents.length,
    };
  }

  /**
   * Get live session metrics & savings (OpenCode /stats style).
   */
  public getSessionMetrics(): {
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    totalRequests: number;
    estimatedCostSavedUsd: number;
  } {
    const costSaved = (this.metrics.totalTokens / 1000) * 0.035;
    return {
      ...this.metrics,
      estimatedCostSavedUsd: Math.round(costSaved * 1000) / 1000,
    };
  }

  /**
   * Main chat turn loop with automatic tool execution and cross-provider failover.
   */
  public async chat(userInput: string, options?: { signal?: AbortSignal }): Promise<string> {
    if (options?.signal?.aborted) {
      return chalk.yellow('\n⏹️ Task cancelled by user (Escape key pressed).');
    }

    this.resetCascadeAttempts();
    const englishEnforcedInput = `[CRITICAL: You must provide all explanations, responses, and terminal output strictly in clear ENGLISH. Do not use Bengali script under any circumstances.]\n\n${userInput}`;

    try {
      if (this.config.provider === 'gemini') {
        const reply = await this.chatGemini(englishEnforcedInput, options);
        if (options?.signal?.aborted) {
          return chalk.yellow('\n⏹️ Task cancelled by user (Escape key pressed).');
        }
        // Check if Gemini failed with 503, 429, or server overload message
        if (
          typeof reply === 'string' &&
          (reply.includes('503') ||
            reply.includes('UNAVAILABLE') ||
            reply.includes('high demand') ||
            reply.includes('RESOURCE_EXHAUSTED') ||
            reply.includes('429') ||
            reply.includes('Rate Limit Exceeded') ||
            reply.includes('Server Overload'))
        ) {
          const nextModel = await this.cascadeModel(this.config.model, 'Gemini server overload / rate limit');
          if (nextModel) {
            if (this.config.provider === 'gemini') {
              return await this.chatGemini(englishEnforcedInput, options);
            } else {
              return await this.chatOpenAI(englishEnforcedInput, options);
            }
          }
          return chalk.yellow('\n⏳ All free model tokens are currently exhausted across all providers. Check the renewal countdown above.');
        }
        return reply;
      } else {
        const reply = await this.chatOpenAI(englishEnforcedInput, options);
        if (options?.signal?.aborted) {
          return chalk.yellow('\n⏹️ Task cancelled by user (Escape key pressed).');
        }
        // Check if OpenAI/OpenRouter/Custom failed with auth or rate-limit message
        if (
          typeof reply === 'string' &&
          (reply.includes('API Key Error') ||
            reply.includes('Authentication failed') ||
            reply.includes('Rate Limit Exceeded') ||
            reply.includes('free-models-per-day'))
        ) {
          const nextModel = await this.cascadeModel(this.config.model, 'Daily quota / rate limit reached');
          if (nextModel) {
            if ((this.config.provider as string) === 'gemini') {
              return await this.chatGemini(englishEnforcedInput, options);
            } else {
              return await this.chatOpenAI(englishEnforcedInput, options);
            }
          }
          return chalk.yellow('\n⏳ All free model tokens are currently exhausted across all providers. Check the renewal countdown above.');
        }
        return reply;
      }
    } catch (err: any) {
      if (options?.signal?.aborted) {
        return chalk.yellow('\n⏹️ Task cancelled by user (Escape key pressed).');
      }
      const nextModel = await this.cascadeModel(this.config.model, 'Provider failure auto-recovery');
      if (nextModel) {
        if (this.config.provider === 'gemini') {
          return await this.chatGemini(englishEnforcedInput, options);
        } else {
          return await this.chatOpenAI(englishEnforcedInput, options);
        }
      }
      return chalk.yellow('\n⏳ All free model tokens are currently exhausted across all providers. Check the renewal countdown above.');
    }
  }

  /**
   * Google Gemini Tool-Calling Loop using @google/genai
   */
  private async chatGemini(userInput: string, options?: { signal?: AbortSignal }): Promise<string> {
    if (options?.signal?.aborted) {
      return chalk.yellow('\n⏹️ Task cancelled by user (Escape key pressed).');
    }

    if (!this.geminiClient) {
      throw new Error('Gemini client is not initialized.');
    }

    // Add user message to Gemini conversation contents only if not already added
    const lastContent = this.geminiContents[this.geminiContents.length - 1];
    if (!lastContent || lastContent.role !== 'user') {
      this.geminiContents.push({
        role: 'user',
        parts: [{ text: userInput }],
      });
    }

    const maxTurns = 40;
    let turnCount = 0;

    while (turnCount < maxTurns) {
      if (options?.signal?.aborted) {
        return chalk.yellow('\n⏹️ Task cancelled by user (Escape key pressed).');
      }

      turnCount++;
      updateFixedBottomStatus(
        turnCount === 1 ? 'Thinking with Gemini...' : `Working (step ${turnCount})...`,
        { mode: this.mode, model: this.config.model }
      );
      const spinner = createSpinner(
        turnCount === 1 ? 'banglacli thinking...' : `banglacli working (step ${turnCount})...`
      );
      spinner.start();

      let response: any = null;
      let lastError: any = null;

      // Candidate models: normalized requested model first, then fallback models, excluding already attempted models
      const normalizedCurrent = normalizeGeminiModel(this.config.model);
      const fallbackList = (GEMINI_FALLBACK_MAP[this.config.model] || GEMINI_FALLBACK_MAP[normalizedCurrent] || GEMINI_CASCADE_CHAIN)
        .map(normalizeGeminiModel);
      const rawCandidates = [normalizedCurrent, ...fallbackList];
      const modelCandidates = rawCandidates.filter(
        (m, idx, arr) => arr.indexOf(m) === idx && !this.attemptedModelsInCascade.has(m)
      );

      for (const candidateModel of modelCandidates) {
        if (options?.signal?.aborted) {
          spinner.stop();
          return chalk.yellow('\n⏹️ Task cancelled by user (Escape key pressed).');
        }

        let attempts = 0;
        const maxModelAttempts = 2;

        while (attempts < maxModelAttempts) {
          if (options?.signal?.aborted) {
            spinner.stop();
            return chalk.yellow('\n⏹️ Task cancelled by user (Escape key pressed).');
          }

          attempts++;
          try {
            const abortPromise = new Promise<never>((_, reject) => {
              if (options?.signal?.aborted) {
                reject(new Error('ABORTED_BY_USER'));
                return;
              }
              options?.signal?.addEventListener('abort', () => reject(new Error('ABORTED_BY_USER')), { once: true });
            });

            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Gemini API request timed out (35s)')), 35000)
            );

            response = await Promise.race([
              this.geminiClient.models.generateContent({
                model: candidateModel,
                contents: this.geminiContents,
                config: {
                  systemInstruction: getSystemPrompt(this.mode),
                  tools: (this.mode === 'plan' ? PLAN_GEMINI_TOOLS : BUILD_GEMINI_TOOLS) as any,
                },
              }),
              timeoutPromise,
              abortPromise,
            ]);

            if (candidateModel !== this.config.model) {
              renderCascadeNotice(this.config.model, candidateModel, 'Gemini high demand / failover');
              this.config.model = candidateModel;
              updateModel(candidateModel);
              this.onModelChangeCallback?.(candidateModel, 'gemini');
            }

            lastError = null;
            break;
          } catch (err: any) {
            if (options?.signal?.aborted || err?.message === 'ABORTED_BY_USER') {
              spinner.stop();
              return chalk.yellow('\n⏹️ Task cancelled by user (Escape key pressed).');
            }

            lastError = err;
            this.attemptedModelsInCascade.add(candidateModel);
            const errMsg = err?.message || String(err);
            const isTemporary =
              errMsg.includes('503') ||
              errMsg.includes('UNAVAILABLE') ||
              errMsg.includes('high demand') ||
              errMsg.includes('429') ||
              errMsg.includes('RESOURCE_EXHAUSTED') ||
              errMsg.includes('no longer available') ||
              errMsg.includes('NOT_FOUND') ||
              errMsg.includes('timed out') ||
              errMsg.includes('timeout') ||
              errMsg.includes('404');

            if (!isTemporary) {
              // Critical auth error, don't retry other models
              break;
            }

            // Short pause before retrying
            if (attempts < maxModelAttempts) {
              await new Promise((resolve) => setTimeout(resolve, 1500));
            }
          }
        }

        if (response) {
          break;
        }

        // If auth error, break out of all candidate models
        if (lastError) {
          const errMsg = lastError?.message || String(lastError);
          if (errMsg.includes('API_KEY_INVALID') || errMsg.includes('403') || errMsg.includes('401')) {
            break;
          }
        }
      }

      spinner.stop();

      if (!response && lastError) {
        const errMsg = lastError?.message || String(lastError);
        if (errMsg.includes('API_KEY_INVALID') || errMsg.includes('403') || errMsg.includes('401')) {
          return chalk.red(
            `\n✖ Gemini API Key Error: Your API key appears to be invalid or expired.\n` +
              `Please run ${chalk.yellow('/config')} to update your API key.`
          );
        } else {
          // All local candidate Gemini models failed; cascade to next provider / model in chain
          const nextModel = await this.cascadeModel(
            this.config.model,
            errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')
              ? 'Gemini Rate Limit / Token Quota Exceeded (429)'
              : 'Gemini Server High Demand / Provider Error'
          );
          if (nextModel) {
            if (this.config.provider === 'gemini') {
              return await this.chatGemini(userInput, options);
            } else {
              return await this.chatOpenAI(userInput, options);
            }
          }
          return chalk.yellow(
            '\n⏳ All free model tokens are currently exhausted across all providers. Check the renewal countdown above.'
          );
        }
      }

      const candidate = response.candidates?.[0];
      const functionCalls = response.functionCalls || [];

      this.metrics.totalRequests++;
      if (response.usageMetadata) {
        this.metrics.promptTokens += response.usageMetadata.promptTokenCount || 0;
        this.metrics.completionTokens += response.usageMetadata.candidatesTokenCount || 0;
        this.metrics.totalTokens += response.usageMetadata.totalTokenCount || 0;
      }

      // Check if candidate returned content
      if (candidate?.content) {
        this.geminiContents.push(candidate.content);
      }

      // If no function calls, we have the final assistant response!
      if (!functionCalls || functionCalls.length === 0) {
        const text = response.text || '';
        return text;
      }

      // Execute each function call
      const toolResponseParts: Array<any> = [];
      for (const call of functionCalls) {
        if (options?.signal?.aborted) {
          return chalk.yellow('\n⏹️ Task cancelled by user (Escape key pressed).');
        }

        const toolName = call.name;
        const toolArgs = call.args || {};

        updateFixedBottomStatus(`Executing tool: ${toolName}... (Esc to abort)`, {
          mode: this.mode,
          model: this.config.model,
        });

        const output = await executeTool(toolName, toolArgs, this.mode, options?.signal);

        if (options?.signal?.aborted) {
          return chalk.yellow('\n⏹️ Task cancelled by user (Escape key pressed).');
        }

        toolResponseParts.push({
          functionResponse: {
            name: toolName,
            id: call.id,
            response: { output },
          },
        });
      }

      // Append function response turn to Gemini contents (Gemini API requires role: 'user')
      this.geminiContents.push({
        role: 'user',
        parts: toolResponseParts,
      });
    }

    return 'Maximum agent iteration steps reached for this request.';
  }

  /**
   * OpenAI / OpenRouter / Custom Provider Tool-Calling Loop
   */
  private async chatOpenAI(userInput: string, options?: { signal?: AbortSignal }): Promise<string> {
    if (options?.signal?.aborted) {
      return chalk.yellow('\n⏹️ Task cancelled by user (Escape key pressed).');
    }

    if (!this.openAIClient) {
      throw new Error('OpenAI client is not initialized.');
    }

    const lastMsg = this.openAIMessages[this.openAIMessages.length - 1];
    if (!lastMsg || lastMsg.role !== 'user') {
      this.openAIMessages.push({
        role: 'user',
        content: userInput,
      });
    }

    const maxTurns = 40;
    let turnCount = 0;

    while (turnCount < maxTurns) {
      if (options?.signal?.aborted) {
        return chalk.yellow('\n⏹️ Task cancelled by user (Escape key pressed).');
      }

      turnCount++;
      updateFixedBottomStatus(
        turnCount === 1
          ? `Thinking with [${this.config.model}]...`
          : `Executing with [${this.config.model}] (step ${turnCount})...`,
        { mode: this.mode, model: this.config.model }
      );
      const spinner = createSpinner(
        turnCount === 1
          ? `banglacli thinking with [${this.config.model}]...`
          : `banglacli executing with [${this.config.model}] (step ${turnCount})...`
      );
      spinner.start();

      let completion: OpenAI.Chat.Completions.ChatCompletion | null = null;
      let cascadeAttempts = 0;
      const maxCascadeAttempts = 6;

      while (cascadeAttempts < maxCascadeAttempts) {
        if (options?.signal?.aborted) {
          spinner.stop();
          return chalk.yellow('\n⏹️ Task cancelled by user (Escape key pressed).');
        }

        try {
          const abortPromise = new Promise<never>((_, reject) => {
            if (options?.signal?.aborted) {
              reject(new Error('ABORTED_BY_USER'));
              return;
            }
            options?.signal?.addEventListener('abort', () => reject(new Error('ABORTED_BY_USER')), { once: true });
          });

          completion = await Promise.race([
            this.openAIClient.chat.completions.create(
              {
                model: this.config.model,
                messages: this.openAIMessages,
                tools: this.mode === 'plan' ? PLAN_OPENAI_TOOLS : BUILD_OPENAI_TOOLS,
                tool_choice: 'auto',
              },
              {
                signal: options?.signal,
                timeout: 35000,
              }
            ),
            abortPromise,
          ]);
          break;
        } catch (err: any) {
          if (options?.signal?.aborted || err?.message === 'ABORTED_BY_USER') {
            spinner.stop();
            return chalk.yellow('\n⏹️ Task cancelled by user (Escape key pressed).');
          }
          const errMsg = err?.message || String(err);
          const isDailyQuotaExhausted =
            errMsg.includes('free-models-per-day') ||
            errMsg.includes('free_daily_limit');

          if (isDailyQuotaExhausted && (this.config.provider === 'openrouter' || this.config.provider === 'custom')) {
            spinner.stop();
            const nextModel = await this.cascadeModel(
              this.config.model,
              'OpenRouter daily free limit reached'
            );
            if (nextModel) {
              if ((this.config.provider as string) === 'gemini') {
                return await this.chatGemini(userInput, options);
              }
              spinner.start();
              continue;
            }
            return chalk.yellow(
              '\n⏳ All free model tokens are currently exhausted across all providers. Check the renewal countdown above.'
            );
          }

          const isLimitOrOverload =
            errMsg.includes('429') ||
            errMsg.includes('rate limit') ||
            errMsg.includes('quota') ||
            errMsg.includes('RESOURCE_EXHAUSTED') ||
            errMsg.includes('insufficient_quota') ||
            errMsg.includes('503') ||
            errMsg.includes('UNAVAILABLE') ||
            errMsg.includes('high demand') ||
            errMsg.includes('502') ||
            errMsg.includes('500') ||
            errMsg.includes('404') ||
            errMsg.includes('no longer available') ||
            errMsg.includes('not found') ||
            errMsg.includes('402') ||
            errMsg.includes('400') ||
            errMsg.includes('not a valid model ID');

          if (isLimitOrOverload && (this.config.provider === 'openrouter' || this.config.provider === 'custom')) {
            cascadeAttempts++;
            spinner.stop();
            const nextModel = await this.cascadeModel(
              this.config.model,
              errMsg.includes('429') || errMsg.includes('free-models-per-day') || errMsg.includes('free_daily_limit')
                ? 'Daily free token quota / Rate limit reached'
                : 'Server load / Unavailable'
            );
            if (nextModel) {
              if ((this.config.provider as string) === 'gemini') {
                return await this.chatGemini(userInput, options);
              }
              spinner.text = chalk.cyan(`banglacli continuing with [${nextModel}]...`);
              spinner.start();
              continue;
            }
            return chalk.yellow(
              '\n⏳ All free model tokens are currently exhausted across all providers. Check the renewal countdown above.'
            );
          }

          spinner.stop();
          if (
            errMsg.includes('401') ||
            errMsg.includes('Incorrect API key') ||
            errMsg.includes('invalid_api_key') ||
            errMsg.includes('Authentication failed')
          ) {
            const nextModel = await this.cascadeModel(
              this.config.model,
              `Auth error on ${this.config.provider}`
            );
            if (nextModel) {
              if ((this.config.provider as string) === 'gemini') {
                return await this.chatGemini(userInput, options);
              }
              spinner.start();
              continue;
            }

            return chalk.red(
              `\n✖ API Key Error: Authentication failed for ${this.config.provider}.\n` +
                `Please run ${chalk.yellow('/provider')} or ${chalk.yellow('/config')} to select a free model.`
            );
          } else if (errMsg.includes('429') || errMsg.includes('rate limit')) {
            const nextModel = await this.cascadeModel(this.config.model, 'Rate Limit Exceeded (429)');
            if (nextModel) {
              if ((this.config.provider as string) === 'gemini') {
                return await this.chatGemini(userInput, options);
              } else {
                return await this.chatOpenAI(userInput, options);
              }
            }
            return chalk.yellow(
              '\n⏳ All free model tokens are currently exhausted across all providers. Check the renewal countdown above.'
            );
          }
          throw new Error(`Provider Error (${this.config.provider}): ${errMsg}`);
        }
      }

      spinner.stop();

      if (options?.signal?.aborted) {
        return chalk.yellow('\n⏹️ Task cancelled by user (Escape key pressed).');
      }

      if (!completion) {
        const nextModel = await this.cascadeModel(this.config.model, 'Cascade auto-recovery');
        if (nextModel) {
          if (this.config.provider === 'gemini') {
            return await this.chatGemini(userInput, options);
          } else {
            return await this.chatOpenAI(userInput, options);
          }
        }
        return chalk.yellow(
          '\n⏳ All free model tokens are currently exhausted across all providers. Check the renewal countdown above.'
        );
      }

      const choice = completion.choices[0];
      if (!choice || !choice.message) {
        throw new Error('No response returned from the model.');
      }

      const message = choice.message;
      this.openAIMessages.push(message);

      this.metrics.totalRequests++;
      if (completion.usage) {
        this.metrics.promptTokens += completion.usage.prompt_tokens || 0;
        this.metrics.completionTokens += completion.usage.completion_tokens || 0;
        this.metrics.totalTokens += completion.usage.total_tokens || 0;
      }

      // If no tool calls, this is the final assistant response
      if (!message.tool_calls || message.tool_calls.length === 0) {
        return message.content || '';
      }

      // Process tool calls
      for (const toolCall of message.tool_calls) {
        if (options?.signal?.aborted) {
          return chalk.yellow('\n⏹️ Task cancelled by user (Escape key pressed).');
        }

        if (toolCall.type !== 'function') continue;

        const fnName = toolCall.function.name;
        let fnArgs: Record<string, any> = {};

        try {
          fnArgs = JSON.parse(toolCall.function.arguments || '{}');
        } catch {
          fnArgs = {};
        }

        updateFixedBottomStatus(`Executing tool: ${fnName}... (Esc to abort)`, {
          mode: this.mode,
          model: this.config.model,
        });

        const toolResult = await executeTool(fnName, fnArgs, this.mode, options?.signal);

        if (options?.signal?.aborted) {
          return chalk.yellow('\n⏹️ Task cancelled by user (Escape key pressed).');
        }

        this.openAIMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: toolResult,
        });
      }
    }

    return 'Maximum agent iteration steps reached for this request.';
  }
}
