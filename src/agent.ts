import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { BanglaCLIConfig, updateModel, saveConfig } from './config.js';
import {
  BUILD_GEMINI_TOOLS,
  PLAN_GEMINI_TOOLS,
  BUILD_OPENAI_TOOLS,
  PLAN_OPENAI_TOOLS,
  executeTool,
} from './tools.js';
import { createSpinner, renderMarkdown, renderCascadeNotice } from './ui.js';
import { OPENROUTER_FREE_CASCADE_CHAIN, GEMINI_CASCADE_CHAIN } from './models.js';
import chalk from 'chalk';

export type AgentMode = 'build' | 'plan';

export function getSystemPrompt(mode: AgentMode = 'build'): string {
  if (mode === 'plan') {
    return `You are banglacli, a world-class Principal Software Architect and Systems Designer running directly in the user's terminal. You are designed to be more intelligent, thorough, and reliable than other agents like OpenCode or FreeBuf.

### 🌟 CURRENT ACTIVE MODE: 📋 PLAN MODE (ARCHITECT & PLANNING ONLY)
- You are strictly in PLAN MODE. You act as an expert senior software architect.
- Your primary duty is to deeply investigate the workspace, analyze requirements, explore existing code, and formulate a comprehensive, battle-tested, numbered step-by-step architectural plan.
- In this mode, you ONLY have read-only tools:
  1. list_files(dirPath): Explore folders and project architecture.
  2. read_file(filePath): Inspect existing configuration files, packages, and code.
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
- You possess native fluency in Bangla (বাংলা), Banglish (Romanized Bengali, e.g. "amake ekta Express auth backend banaye dao"), and English.
- Always detect the user's language and respond in the EXACT same language and tone:
  * If the user writes in Bangla (বাংলা লিপি), respond in natural, friendly, accurate Bangla.
  * If the user writes in Banglish, respond in natural Banglish with Bengali developer slang/enthusiasm.
  * If the user writes in English, respond in clear, professional English.
  * If the user mixes languages, mirror their style naturally.`;
  }

  // BUILD MODE
  return `You are banglacli, a world-class Principal Full-Stack Software Engineer and Autonomous AI Coding Agent running directly in the user's terminal. You are designed to outperform modern AI coding agents like OpenCode and Claude Code in intelligence, self-healing, and reliability.

### 🌟 CURRENT ACTIVE MODE: ⚡ BUILD MODE (AUTONOMOUS BUILDER)
- You have full autonomous authority to build, edit, test, and execute software.
- You have all 4 workspace tools:
  1. list_files(dirPath): Explore directories to understand workspace context and file hierarchy.
  2. read_file(filePath): Inspect existing source files before editing.
  3. write_file(filePath, content): Create directories automatically and write complete, production-grade code.
  4. run_command(command): Execute terminal commands (e.g., "npm init -y", "npm install <packages>", build or test scripts).

### 🧠 INTELLIGENT AGENT PROTOCOL (FOLLOW RIGOROUSLY):
1. **Investigate Before Acting**:
   - Always explore the workspace with list_files or read_file first. Never code blindly without understanding existing dependencies and architecture.
2. **Mandatory Language & Full Dependency Installation (CRITICAL)**:
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
3. **Autonomous Self-Correction & Self-Healing**:
   - If any command fails (e.g. build failure, TypeScript error, missing module, syntax error):
     * DO NOT give up or ask the user to fix it!
     * Read the compiler error or stack trace carefully.
     * Identify the exact file, missing package, or syntax problem.
     * Fix the problem with write_file or install missing modules with run_command.
     * Re-run the command to confirm the fix works!
4. **Zero Placeholder Code Rule (Strictly Enforced)**:
   - NEVER output incomplete snippets, "// TODO: implement rest", "// add logic here", or dummy mocks.
   - Every function, handler, UI component, CSS rule, and utility must be 100% complete, fully implemented, robust, and working out of the box.
5. **Modern Production Standards**:
   - Use clean, modern, idiomatic code (TypeScript, ESM, strict types, async/await, proper error boundaries).
   - Write clean, modular architectures (SOLID, DRY, separated concerns).
   - For web apps: Modern responsive UI, semantic HTML5, modern CSS / Tailwind, clean typography.
   - For backend/APIs: Proper status codes, error handling, input validation, clean routing.
6. **Clear User Feedback & Launch Command**:
   - Briefly explain your actions and strategy before and after tool calls.
   - When a project build is finished, provide clear commands for the user to run or preview the project (e.g. "npm run dev").
7. **Non-Interactive Shell Execution (OpenCode Standard)**:
   - All terminal commands run in a non-interactive shell. Never run commands that prompt for manual terminal input. Always pass flags like -y, --yes, -m "<message>".
   - On Windows, when testing HTTP endpoints or downloading assets, always use "curl.exe" or "Invoke-WebRequest -UseBasicParsing" so commands execute cleanly without interactive prompts.

### 1. LANGUAGE & COMMUNICATION RULES (CRITICAL):
- You possess native fluency in Bangla (বাংলা), Banglish (Romanized Bengali, e.g. "amake ekta Express auth backend banaye dao"), and English.
- Always detect the user's language and respond in the EXACT same language and tone:
  * If the user writes in Bangla (বাংলা লিপি), respond in natural, friendly, accurate Bangla.
  * If the user writes in Banglish, respond in natural Banglish with Bengali developer slang/enthusiasm.
  * If the user writes in English, respond in clear, professional English.
  * If the user mixes languages, mirror their style naturally.`;
}

export const SYSTEM_PROMPT = getSystemPrompt('build');

interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
}

const GEMINI_FALLBACK_MAP: Record<string, string[]> = {
  'gemini-3.5-flash-lite': ['gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash'],
  'gemini-3.1-flash-lite': ['gemini-3.5-flash-lite', 'gemini-3.5-flash'],
  'gemini-3.5-flash': ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
  'gemini-3.8-flash': ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
  'gemini-2.0-flash': ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
  'gemini-1.5-flash': ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
  'gemini-1.5-pro': ['gemini-3.5-flash-lite', 'gemini-3.5-flash'],
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

  constructor(config: BanglaCLIConfig, mode: AgentMode = 'build') {
    this.config = config;
    this.mode = mode;
    this.initClients();
    this.resetHistory();
  }

  private initClients(): void {
    if (this.config.provider === 'gemini') {
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

  /**
   * Intelligently cascade to the next available model when token quota or rate limit is reached.
   */
  public async cascadeModel(currentModel: string, reason: string): Promise<string | null> {
    if (this.config.provider === 'openrouter' || this.config.provider === 'custom') {
      const chain = OPENROUTER_FREE_CASCADE_CHAIN;
      const currentIndex = chain.indexOf(currentModel);
      const nextIndex = currentIndex !== -1 ? (currentIndex + 1) % chain.length : 0;
      const nextModel = chain[nextIndex];

      if (nextModel && nextModel !== currentModel) {
        renderCascadeNotice(currentModel, nextModel, reason);
        this.config.model = nextModel;
        updateModel(nextModel);
        this.onModelChangeCallback?.(nextModel, this.config.provider);
        return nextModel;
      }

      // If user has Gemini saved, cross-provider cascade to Gemini
      const geminiSaved = this.config.savedProviders?.gemini;
      if (geminiSaved && geminiSaved.apiKey) {
        renderCascadeNotice(currentModel, 'gemini-3.5-flash-lite', 'Cross-provider cascade to Google Gemini Free (1,500 req/day)');
        this.config.provider = 'gemini';
        this.config.apiKey = geminiSaved.apiKey;
        this.config.model = 'gemini-3.5-flash-lite';
        this.initClients();
        saveConfig(this.config);
        this.onModelChangeCallback?.('gemini-3.5-flash-lite', 'gemini');
        return 'gemini-3.5-flash-lite';
      }
    } else if (this.config.provider === 'gemini') {
      const chain = GEMINI_CASCADE_CHAIN;
      const currentIndex = chain.indexOf(currentModel);
      const nextIndex = currentIndex !== -1 ? currentIndex + 1 : 0;

      if (nextIndex < chain.length) {
        const nextModel = chain[nextIndex];
        renderCascadeNotice(currentModel, nextModel, reason);
        this.config.model = nextModel;
        updateModel(nextModel);
        this.onModelChangeCallback?.(nextModel, 'gemini');
        return nextModel;
      }

      // If all Gemini models exhausted, switch to OpenRouter if saved
      const openRouterSaved = this.config.savedProviders?.openrouter;
      if (openRouterSaved && openRouterSaved.apiKey) {
        renderCascadeNotice(currentModel, 'openrouter/free', 'Cross-provider cascade to OpenRouter Free');
        this.config.provider = 'openrouter';
        this.config.apiKey = openRouterSaved.apiKey;
        this.config.model = 'openrouter/free';
        this.config.baseURL = 'https://openrouter.ai/api/v1';
        this.initClients();
        saveConfig(this.config);
        this.onModelChangeCallback?.('openrouter/free', 'openrouter');
        return 'openrouter/free';
      }
    }

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
   * Main chat turn loop with automatic tool execution and cross-provider failover.
   */
  public async chat(userInput: string, options?: { signal?: AbortSignal }): Promise<string> {
    if (options?.signal?.aborted) {
      return chalk.yellow('\n⏹️ Task cancelled by user (Escape key pressed).');
    }

    try {
      if (this.config.provider === 'gemini') {
        const reply = await this.chatGemini(userInput, options);
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
          const openRouterSaved = this.config.savedProviders?.openrouter;
          if (openRouterSaved && openRouterSaved.apiKey) {
            renderCascadeNotice(
              this.config.model,
              'openrouter/free',
              'Gemini limit reached; cascading to OpenRouter Free'
            );
            this.config.provider = 'openrouter';
            this.config.apiKey = openRouterSaved.apiKey;
            this.config.model = 'openrouter/free';
            this.config.baseURL = 'https://openrouter.ai/api/v1';
            this.initClients();
            updateModel('openrouter/free');
            this.onModelChangeCallback?.('openrouter/free', 'openrouter');
            return await this.chatOpenAI(userInput, options);
          }
        }
        return reply;
      } else {
        const reply = await this.chatOpenAI(userInput, options);
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
          const geminiSaved = this.config.savedProviders?.gemini;
          if (geminiSaved && geminiSaved.apiKey) {
            renderCascadeNotice(
              this.config.model,
              'gemini-3.5-flash-lite',
              `Provider issue on ${this.config.provider}; auto-recovering with Google Gemini Free (1,500 req/day)`
            );
            this.config.provider = 'gemini';
            this.config.apiKey = geminiSaved.apiKey;
            this.config.model = 'gemini-3.5-flash-lite';
            this.initClients();
            updateModel('gemini-3.5-flash-lite');
            this.onModelChangeCallback?.('gemini-3.5-flash-lite', 'gemini');
            return await this.chatGemini(userInput, options);
          }
        }
        return reply;
      }
    } catch (err: any) {
      if (options?.signal?.aborted) {
        return chalk.yellow('\n⏹️ Task cancelled by user (Escape key pressed).');
      }
      if (this.config.provider === 'gemini') {
        const openRouterSaved = this.config.savedProviders?.openrouter;
        if (openRouterSaved && openRouterSaved.apiKey) {
          renderCascadeNotice(
            this.config.model,
            'openrouter/free',
            'Gemini server error; cascading to OpenRouter Free'
          );
          this.config.provider = 'openrouter';
          this.config.apiKey = openRouterSaved.apiKey;
          this.config.model = 'openrouter/free';
          this.config.baseURL = 'https://openrouter.ai/api/v1';
          this.initClients();
          updateModel('openrouter/free');
          this.onModelChangeCallback?.('openrouter/free', 'openrouter');
          return await this.chatOpenAI(userInput, options);
        }
      } else {
        const geminiSaved = this.config.savedProviders?.gemini;
        if (geminiSaved && geminiSaved.apiKey) {
          renderCascadeNotice(
            this.config.model,
            'gemini-3.5-flash-lite',
            `Provider failure on ${this.config.provider}; auto-recovering with Google Gemini Free (1,500 req/day)`
          );
          this.config.provider = 'gemini';
          this.config.apiKey = geminiSaved.apiKey;
          this.config.model = 'gemini-3.5-flash-lite';
          this.initClients();
          updateModel('gemini-3.5-flash-lite');
          this.onModelChangeCallback?.('gemini-3.5-flash-lite', 'gemini');
          return await this.chatGemini(userInput, options);
        }
      }
      throw err;
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

    // Add user message to Gemini conversation contents
    this.geminiContents.push({
      role: 'user',
      parts: [{ text: userInput }],
    });

    const maxTurns = 40;
    let turnCount = 0;

    while (turnCount < maxTurns) {
      if (options?.signal?.aborted) {
        return chalk.yellow('\n⏹️ Task cancelled by user (Escape key pressed).');
      }

      turnCount++;
      const spinner = createSpinner(
        turnCount === 1 ? 'banglacli thinking...' : `banglacli working (step ${turnCount})...`
      );
      spinner.start();

      let response: any = null;
      let lastError: any = null;

      // Candidate models: requested model first, then fallback models
      const fallbacks = GEMINI_FALLBACK_MAP[this.config.model] || ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.5-flash'];
      const modelCandidates = [this.config.model, ...fallbacks.filter((m) => m !== this.config.model)];

      for (const candidateModel of modelCandidates) {
        let attempts = 0;
        const maxModelAttempts = 2;

        while (attempts < maxModelAttempts) {
          attempts++;
          try {
            response = await this.geminiClient.models.generateContent({
              model: candidateModel,
              contents: this.geminiContents,
              config: {
                systemInstruction: getSystemPrompt(this.mode),
                tools: (this.mode === 'plan' ? PLAN_GEMINI_TOOLS : BUILD_GEMINI_TOOLS) as any,
              },
            });

            if (candidateModel !== this.config.model) {
              renderCascadeNotice(this.config.model, candidateModel, 'Gemini high demand / 503 failover');
              this.config.model = candidateModel;
              updateModel(candidateModel);
              this.onModelChangeCallback?.(candidateModel, 'gemini');
            }

            lastError = null;
            break;
          } catch (err: any) {
            lastError = err;
            const errMsg = err?.message || String(err);
            const isTemporary =
              errMsg.includes('503') ||
              errMsg.includes('UNAVAILABLE') ||
              errMsg.includes('high demand') ||
              errMsg.includes('429') ||
              errMsg.includes('RESOURCE_EXHAUSTED') ||
              errMsg.includes('no longer available') ||
              errMsg.includes('NOT_FOUND') ||
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
        } else if (errMsg.includes('503') || errMsg.includes('UNAVAILABLE') || errMsg.includes('high demand')) {
          return chalk.red(
            `\n✖ Google Gemini Free Servers High Demand (503 UNAVAILABLE):\n` +
              `Google's free servers are temporarily saturated during peak traffic.\n\n` +
              `👉 Immediate Solutions:\n` +
              `1. Run ${chalk.yellow.bold('/provider')} and switch to ${chalk.green.bold('OpenRouter')} (DeepSeek & Nemotron are free with no 503 errors).\n` +
              `2. Run ${chalk.yellow.bold('/model')} to manually switch to ${chalk.green.bold('gemini-3.5-flash-lite')} or ${chalk.green.bold('gemini-3.1-flash-lite')}.\n` +
              `3. Run ${chalk.yellow.bold('/limits')} to view all free token quotas across providers.`
          );
        } else if (errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('429')) {
          return chalk.red(
            `\n✖ Gemini Rate Limit Exceeded (429):\n` +
              `You hit the free per-minute limit (15 requests/min).\n` +
              `Wait 30-60 seconds, or run ${chalk.yellow('/provider')} to switch to OpenRouter (zero-wait).`
          );
        }
        throw new Error(`Gemini Error: ${errMsg}`);
      }

      const candidate = response.candidates?.[0];
      const functionCalls = response.functionCalls || [];

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

    this.openAIMessages.push({
      role: 'user',
      content: userInput,
    });

    const maxTurns = 40;
    let turnCount = 0;

    while (turnCount < maxTurns) {
      if (options?.signal?.aborted) {
        return chalk.yellow('\n⏹️ Task cancelled by user (Escape key pressed).');
      }

      turnCount++;
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
          completion = await this.openAIClient.chat.completions.create(
            {
              model: this.config.model,
              messages: this.openAIMessages,
              tools: this.mode === 'plan' ? PLAN_OPENAI_TOOLS : BUILD_OPENAI_TOOLS,
              tool_choice: 'auto',
            },
            {
              signal: options?.signal,
            }
          );
          break;
        } catch (err: any) {
          if (options?.signal?.aborted) {
            spinner.stop();
            return chalk.yellow('\n⏹️ Task cancelled by user (Escape key pressed).');
          }
          const errMsg = err?.message || String(err);
          const isDailyQuotaExhausted =
            errMsg.includes('free-models-per-day') ||
            errMsg.includes('free_daily_limit');

          // If daily quota across all OpenRouter free models is exhausted, immediately auto-recover to Gemini
          if (isDailyQuotaExhausted && (this.config.provider === 'openrouter' || this.config.provider === 'custom')) {
            spinner.stop();
            const geminiSaved = this.config.savedProviders?.gemini;
            if (geminiSaved && geminiSaved.apiKey) {
              renderCascadeNotice(
                this.config.model,
                'gemini-3.5-flash-lite',
                'OpenRouter daily free limit reached; auto-recovering with Google Gemini Free (1,500 req/day)'
              );
              this.config.provider = 'gemini';
              this.config.apiKey = geminiSaved.apiKey;
              this.config.model = 'gemini-3.5-flash-lite';
              this.initClients();
              saveConfig(this.config);
              this.onModelChangeCallback?.('gemini-3.5-flash-lite', 'gemini');
              return await this.chatGemini(userInput, options);
            }
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
            errMsg.includes('402');

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
          }

          spinner.stop();
          if (
            errMsg.includes('401') ||
            errMsg.includes('Incorrect API key') ||
            errMsg.includes('invalid_api_key') ||
            errMsg.includes('Authentication failed')
          ) {
            const geminiSaved = this.config.savedProviders?.gemini;
            if (geminiSaved && geminiSaved.apiKey && this.config.provider !== 'gemini') {
              renderCascadeNotice(
                this.config.model,
                'gemini-3.5-flash-lite',
                `Auth error on ${this.config.provider}; auto-recovering with Google Gemini Free (1,500 req/day)`
              );
              this.config.provider = 'gemini';
              this.config.apiKey = geminiSaved.apiKey;
              this.config.model = 'gemini-3.5-flash-lite';
              this.initClients();
              updateModel('gemini-3.5-flash-lite');
              this.onModelChangeCallback?.('gemini-3.5-flash-lite', 'gemini');
              return await this.chatGemini(userInput, options);
            }

            return chalk.red(
              `\n✖ API Key Error: Authentication failed for ${this.config.provider}.\n` +
                `Please run ${chalk.yellow('/provider')} or ${chalk.yellow('/config')} to select a free model.`
            );
          } else if (errMsg.includes('429') || errMsg.includes('rate limit')) {
            const geminiSaved = this.config.savedProviders?.gemini;
            if (geminiSaved && geminiSaved.apiKey && this.config.provider !== 'gemini') {
              renderCascadeNotice(
                this.config.model,
                'gemini-3.5-flash-lite',
                `Rate limit on ${this.config.provider}; auto-recovering with Google Gemini Free (1,500 req/day)`
              );
              this.config.provider = 'gemini';
              this.config.apiKey = geminiSaved.apiKey;
              this.config.model = 'gemini-3.5-flash-lite';
              this.initClients();
              updateModel('gemini-3.5-flash-lite');
              this.onModelChangeCallback?.('gemini-3.5-flash-lite', 'gemini');
              return await this.chatGemini(userInput, options);
            }

            return chalk.red(
              `\n✖ Rate Limit Exceeded (429).\n` +
                `All models in the cascade chain were rate-limited. Please wait a moment or run ${chalk.yellow('/provider')}.`
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
        const geminiSaved = this.config.savedProviders?.gemini;
        if (geminiSaved && geminiSaved.apiKey && this.config.provider !== 'gemini') {
          renderCascadeNotice(
            this.config.model,
            'gemini-3.5-flash-lite',
            `Cascade exhausted on ${this.config.provider}; auto-recovering with Google Gemini Free (1,500 req/day)`
          );
          this.config.provider = 'gemini';
          this.config.apiKey = geminiSaved.apiKey;
          this.config.model = 'gemini-3.5-flash-lite';
          this.initClients();
          updateModel('gemini-3.5-flash-lite');
          this.onModelChangeCallback?.('gemini-3.5-flash-lite', 'gemini');
          return await this.chatGemini(userInput, options);
        }
        throw new Error('All model attempts failed or tokens exhausted across providers.');
      }

      const choice = completion.choices[0];
      if (!choice || !choice.message) {
        throw new Error('No response returned from the model.');
      }

      const message = choice.message;
      this.openAIMessages.push(message);

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
