import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { BanglaCLIConfig, getEnvProviderKey, saveConfig, updateModel } from './config.js';
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
import type { ImagePayload } from './image.js';
import { exploreAndSelectFreeModel } from './explorer.js';
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
- You are 100% in BUILD MODE right now. You are NOT in plan mode.
- File creation (write_file), surgical editing (edit_file), and terminal command execution (run_command) are FULLY UNLOCKED AND ACTIVE.
- NEVER claim or state that you are in plan mode, and NEVER claim you cannot write or edit files.
- NEVER ask or instruct the user to type /build, /mode, or any switch command. You are ALREADY in BUILD mode.
- NEVER refuse to build, code, or execute. If the user asks you to implement, build, create, write, edit, code, fix, recheck, or continue, DO NOT argue, discuss control-flow, or give excuses. IMMEDIATELY call the appropriate tools (write_file, edit_file, run_command) to execute the request!
- If the conversation history contains an implementation plan or roadmap, THAT PLAN IS APPROVED. Immediately call tools to create and edit the files. Never output a message stating "No files have been created" without calling tools.
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
  'gemini-3.5-flash-lite': ['gemini-3.1-flash-lite', 'gemma-4-31b-it', 'gemma-4-26b-a4b-it', 'gemini-3.5-flash'],
  'gemini-3.1-flash-lite': ['gemini-3.5-flash-lite', 'gemma-4-31b-it', 'gemma-4-26b-a4b-it', 'gemini-3.5-flash'],
  'gemma-4-31b-it': ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemma-4-26b-a4b-it'],
  'gemma-4-26b-a4b-it': ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemma-4-31b-it'],
  'gemini-3.5-flash': ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemma-4-31b-it', 'gemini-3.8-flash'],
  'gemini-3.6-flash': ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemma-4-31b-it'],
  'gemini-3.7-flash': ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemma-4-31b-it'],
  'gemini-3.8-flash': ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemma-4-31b-it'],
  'gemini-4-hydrogen': ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemma-4-31b-it'],
  'gemini-4-argon': ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemma-4-31b-it'],
  'gemini-2.0-flash': ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
  'gemini-2.0-flash-lite': ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
  'gemini-2.5-flash': ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
  'gemini-2.5-pro': ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
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
    // Hydrate empty API key from savedProviders or env before client init
    if (!this.config.apiKey) {
      this.config.apiKey =
        this.config.savedProviders?.[this.config.provider]?.apiKey ||
        getEnvProviderKey(this.config.provider) ||
        '';
    }

    if (this.config.provider === 'gemini') {
      const normalized = normalizeGeminiModel(this.config.model);
      if (!normalized || !GEMINI_CASCADE_CHAIN.includes(normalized)) {
        this.config.model = 'gemini-3.5-flash-lite';
      } else {
        this.config.model = normalized;
      }
      delete (this.config as any).baseURL;
      this.geminiClient = new GoogleGenAI({ apiKey: this.config.apiKey });
      this.openAIClient = undefined;
    } else {
      const baseURL =
        this.config.provider === 'openrouter'
          ? 'https://openrouter.ai/api/v1'
          : this.config.baseURL || this.config.savedProviders?.custom?.baseURL;
      this.config.baseURL = baseURL;
      this.openAIClient = new OpenAI({
        apiKey: this.config.apiKey || 'ollama',
        baseURL,
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
   * Sync active system prompt with current mode and inject mode change notification.
   */
  public updateSystemPrompt(): void {
    if (this.openAIMessages.length > 0 && this.openAIMessages[0].role === 'system') {
      this.openAIMessages[0].content = getSystemPrompt(this.mode);
    }
    // Inject explicit mode-switch confirmation so models never hallucinate prior mode restrictions
    if (this.mode === 'build') {
      this.openAIMessages.push({
        role: 'system',
        content:
          '[SYSTEM DIRECTIVE: The user has switched the agent to ⚡ BUILD MODE. You have full authority to use write_file, edit_file, and run_command immediately. Any previous PLAN MODE restrictions or tool blocks are completely lifted. Code and build the solution right now.]',
      });
      this.geminiContents.push({
        role: 'user',
        parts: [
          {
            text: '[SYSTEM NOTIFICATION: banglacli is now in ⚡ BUILD MODE. Autonomous file creation, editing, and terminal commands are active.]',
          },
        ],
      });
      this.geminiContents.push({
        role: 'model',
        parts: [
          {
            text: 'Understood. I am in BUILD MODE with full autonomous tool execution enabled (write_file, edit_file, run_command). I will immediately write, edit, and run code as requested without asking for mode switches.',
          },
        ],
      });
    } else {
      this.openAIMessages.push({
        role: 'system',
        content:
          '[SYSTEM DIRECTIVE: The user has switched the agent to 📋 PLAN MODE. Act as Senior Architect formulating structured plans without modifying workspace files.]',
      });
      this.geminiContents.push({
        role: 'user',
        parts: [
          {
            text: '[SYSTEM NOTIFICATION: banglacli is now in 📋 PLAN MODE. Only read-only tools are enabled.]',
          },
        ],
      });
      this.geminiContents.push({
        role: 'model',
        parts: [
          {
            text: 'Understood. I am in PLAN MODE. I will formulate a structured architectural plan without modifying files.',
          },
        ],
      });
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
  private deadProvidersInTurn = new Set<string>();
  private cascadeStepsCount = 0;
  private readonly MAX_CASCADE_STEPS = 40;

  public resetCascadeAttempts(): void {
    this.attemptedModelsInCascade.clear();
    this.deadProvidersInTurn.clear();
    this.cascadeStepsCount = 0;
  }

  /**
   * Persist active provider + model to config store once verified working.
   */
  private persistVerifiedActiveModel(): void {
    try {
      saveConfig(this.config);
      this.onModelChangeCallback?.(this.config.model, this.config.provider);
    } catch {}
  }

  /**
   * Sync active OpenAI message history into Gemini content format (preserving tool calls/results).
   */
  public syncMessagesToGemini(): void {
    if (this.openAIMessages.length === 0) return;

    const rawContents: Array<{ role: string; parts: Array<any> }> = [];
    for (const msg of this.openAIMessages) {
      if (msg.role === 'user') {
        if (Array.isArray(msg.content)) {
          const parts: any[] = [];
          for (const item of msg.content as any[]) {
            if (item.type === 'text' && item.text) {
              parts.push({ text: item.text });
            } else if (item.type === 'image_url' && item.image_url?.url) {
              const url = item.image_url.url;
              const match = url.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
              if (match) {
                parts.push({
                  inlineData: {
                    mimeType: match[1],
                    data: match[2],
                  },
                });
              }
            }
          }
          if (parts.length > 0) {
            rawContents.push({ role: 'user', parts });
          }
        } else {
          const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
          if (content) {
            rawContents.push({ role: 'user', parts: [{ text: content }] });
          }
        }
      } else if (msg.role === 'assistant') {
        const textParts: string[] = [];
        if (typeof msg.content === 'string' && msg.content.trim()) {
          textParts.push(msg.content);
        }
        const toolCalls = (msg as any).tool_calls;
        if (Array.isArray(toolCalls) && toolCalls.length > 0) {
          const summary = toolCalls
            .map((tc: any) => `${tc.function?.name}(${(tc.function?.arguments || '').slice(0, 200)})`)
            .join(', ');
          textParts.push(`[Called tools: ${summary}]`);
        }
        const combined = textParts.join('\n').trim();
        if (combined) {
          rawContents.push({ role: 'model', parts: [{ text: combined }] });
        }
      } else if (msg.role === 'tool') {
        const toolText = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        if (toolText) {
          rawContents.push({
            role: 'user',
            parts: [{ text: `[Tool Output]: ${toolText.slice(0, 6000)}` }],
          });
        }
      }
    }

    // Merge consecutive entries with the same role so Gemini alternates user/model cleanly
    const merged: Array<{ role: string; parts: Array<any> }> = [];
    for (const item of rawContents) {
      const prev = merged[merged.length - 1];
      if (prev && prev.role === item.role) {
        prev.parts.push(...item.parts);
      } else {
        merged.push({ role: item.role, parts: [...item.parts] });
      }
    }
    this.geminiContents = merged;
  }

  /**
   * Sync active Gemini content history into OpenAI message format (preserving functionCall & functionResponse).
   */
  public syncMessagesToOpenAI(): void {
    if (this.geminiContents.length === 0) return;

    this.openAIMessages = [
      {
        role: 'system',
        content: getSystemPrompt(this.mode),
      },
    ];
    for (const c of this.geminiContents) {
      if (c.role === 'user') {
        const textParts: string[] = [];
        const imageParts: any[] = [];
        for (const p of c.parts) {
          if (p.text) textParts.push(p.text);
          if (p.functionResponse) {
            const out = p.functionResponse.response?.output ?? JSON.stringify(p.functionResponse.response || '');
            textParts.push(`[Tool "${p.functionResponse.name}" Result]:\n${String(out).slice(0, 6000)}`);
          }
          if (p.inlineData) {
            imageParts.push({
              type: 'image_url',
              image_url: {
                url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`,
              },
            });
          }
        }
        if (imageParts.length > 0) {
          this.openAIMessages.push({
            role: 'user',
            content: [
              { type: 'text', text: textParts.join('\n') },
              ...imageParts,
            ] as any,
          });
        } else {
          const text = textParts.join('\n').trim();
          if (text) {
            this.openAIMessages.push({ role: 'user', content: text });
          }
        }
      } else if (c.role === 'model') {
        const text = c.parts
          .map((p: any) =>
            p.text
              ? p.text
              : p.functionCall
              ? `[Called tool ${p.functionCall.name}(${JSON.stringify(p.functionCall.args || {}).slice(0, 300)})]`
              : ''
          )
          .filter(Boolean)
          .join('\n');
        if (text) {
          this.openAIMessages.push({
            role: 'assistant',
            content: text,
          });
        }
      }
    }
  }

  private getKeyForProvider(provider: 'gemini' | 'openrouter' | 'custom'): string | undefined {
    const saved = this.config.savedProviders?.[provider]?.apiKey;
    if (saved) return saved;
    if (this.config.provider === provider && this.config.apiKey) return this.config.apiKey;
    return getEnvProviderKey(provider);
  }

  /**
   * Intelligently cascade to the next available model when token quota, auth error, or rate limit is reached.
   * Cycles cleanly across providers without looping back into dead providers or persisting broken models.
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

    const lowerReason = reason.toLowerCase();
    const isProviderAuthOrBalanceFailure =
      lowerReason.includes('401') ||
      lowerReason.includes('403') ||
      lowerReason.includes('auth error') ||
      lowerReason.includes('api key') ||
      lowerReason.includes('user not found') ||
      lowerReason.includes('free-models-per-day') ||
      lowerReason.includes('free_daily_limit') ||
      lowerReason.includes('daily free') ||
      lowerReason.includes('insufficient_quota') ||
      lowerReason.includes('insufficient_balance') ||
      lowerReason.includes('insufficient balance') ||
      lowerReason.includes('402') ||
      lowerReason.includes('provider unusable');

    if (isProviderAuthOrBalanceFailure) {
      this.deadProvidersInTurn.add(this.config.provider);
    }

    const switchToGemini = (noticeReason: string): string | null => {
      if (this.deadProvidersInTurn.has('gemini')) return null;
      const geminiKey = this.getKeyForProvider('gemini');
      if (!geminiKey) return null;

      for (const rawModel of GEMINI_CASCADE_CHAIN) {
        const model = normalizeGeminiModel(rawModel);
        if (!this.attemptedModelsInCascade.has(model)) {
          renderCascadeNotice(currentModel, model, noticeReason);
          this.config.provider = 'gemini';
          this.config.apiKey = geminiKey;
          this.config.model = model;
          delete (this.config as any).baseURL;
          this.initClients();
          this.syncMessagesToGemini();
          return model;
        }
      }
      return null;
    };

    const switchToOpenRouter = (noticeReason: string): string | null => {
      if (this.deadProvidersInTurn.has('openrouter')) return null;
      const openRouterKey = this.getKeyForProvider('openrouter');
      if (!openRouterKey) return null;

      for (const model of OPENROUTER_FREE_CASCADE_CHAIN) {
        if (!this.attemptedModelsInCascade.has(model)) {
          renderCascadeNotice(currentModel, model, noticeReason);
          this.config.provider = 'openrouter';
          this.config.apiKey = openRouterKey;
          this.config.model = model;
          this.config.baseURL = 'https://openrouter.ai/api/v1';
          this.initClients();
          this.syncMessagesToOpenAI();
          return model;
        }
      }
      return null;
    };

    const switchToCustom = (noticeReason: string): string | null => {
      if (this.deadProvidersInTurn.has('custom')) return null;
      const customSaved = this.config.savedProviders?.custom;
      const customKey =
        customSaved?.apiKey ||
        ((this.config.provider as string) === 'custom' ? this.config.apiKey : undefined) ||
        getEnvProviderKey('custom');
      const customBaseURL = customSaved?.baseURL || (this.config.provider === 'custom' ? this.config.baseURL : undefined);
      if (!customKey || !customBaseURL) return null;

      // Determine an endpoint-appropriate model instead of sending an OpenRouter slug to DeepSeek/Groq
      let targetModel = customSaved?.model || 'deepseek-chat';
      if (customBaseURL.includes('deepseek.com') && (targetModel.includes('/') || targetModel.includes('llama'))) {
        targetModel = 'deepseek-chat';
      } else if (customBaseURL.includes('groq.com') && targetModel.includes('/')) {
        targetModel = 'llama-3.3-70b-versatile';
      }

      if (this.attemptedModelsInCascade.has(`custom:${targetModel}`)) return null;
      this.attemptedModelsInCascade.add(`custom:${targetModel}`);

      renderCascadeNotice(currentModel, targetModel, noticeReason);
      this.config.provider = 'custom';
      this.config.apiKey = customKey;
      this.config.baseURL = customBaseURL;
      this.config.model = targetModel;
      this.initClients();
      this.syncMessagesToOpenAI();
      return targetModel;
    };

    // Route intelligently based on current active provider
    if (this.config.provider === 'gemini') {
      const nextGemini = !isProviderAuthOrBalanceFailure ? switchToGemini(reason) : null;
      if (nextGemini) return nextGemini;

      this.deadProvidersInTurn.add('gemini');
      const nextOR = switchToOpenRouter('Google Gemini unavailable/exhausted; cascading to OpenRouter Free');
      if (nextOR) return nextOR;

      const nextCustom = switchToCustom('Cascading to configured Custom endpoint');
      if (nextCustom) return nextCustom;
    } else if (this.config.provider === 'openrouter') {
      // On OpenRouter auth error or daily limit, jump immediately to Gemini instead of looping 12 dead OR calls
      if (isProviderAuthOrBalanceFailure) {
        const nextGemini = switchToGemini('OpenRouter unavailable/limit reached; cascading immediately to Google Gemini');
        if (nextGemini) return nextGemini;
      }

      const nextOR = !isProviderAuthOrBalanceFailure ? switchToOpenRouter(reason) : null;
      if (nextOR) return nextOR;

      this.deadProvidersInTurn.add('openrouter');
      const nextGemini = switchToGemini('OpenRouter free models exhausted; cascading to Google Gemini');
      if (nextGemini) return nextGemini;

      const nextCustom = switchToCustom('Cascading to configured Custom endpoint');
      if (nextCustom) return nextCustom;
    } else if (this.config.provider === 'custom') {
      this.deadProvidersInTurn.add('custom');
      const nextGemini = switchToGemini('Custom provider unavailable; cascading to Google Gemini');
      if (nextGemini) return nextGemini;

      const nextOR = switchToOpenRouter('Custom provider unavailable; cascading to OpenRouter Free');
      if (nextOR) return nextOR;
    }

    // Active Model Explorer: dynamically scan remaining live free endpoints before giving up
    const explored = await exploreAndSelectFreeModel(this.config, this.attemptedModelsInCascade);
    if (explored) {
      this.attemptedModelsInCascade.add(explored.id);
      this.initClients();
      if (explored.provider === 'gemini') {
        this.syncMessagesToGemini();
      } else {
        this.syncMessagesToOpenAI();
      }
      this.onModelChangeCallback?.(explored.id, explored.provider);
      return explored.id;
    }

    // Only if every single model across all providers is 100% exhausted
    renderAllTokensExhaustedReport();
    return null;
  }

  /**
   * Run model explorer to find and select an active model with free tokens.
   */
  public async exploreFreeModel(): Promise<string | null> {
    const explored = await exploreAndSelectFreeModel(this.config);
    if (explored) {
      this.initClients();
      if (explored.provider === 'gemini') {
        this.syncMessagesToGemini();
      } else {
        this.syncMessagesToOpenAI();
      }
      this.onModelChangeCallback?.(explored.id, explored.provider);
      return explored.id;
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
  public async chat(
    userInput: string,
    options?: { signal?: AbortSignal; images?: ImagePayload[] }
  ): Promise<string> {
    if (options?.signal?.aborted) {
      return chalk.yellow('\n⏹️ Task cancelled by user (Escape key pressed).');
    }

    this.resetCascadeAttempts();
    const modeDirective =
      this.mode === 'build'
        ? `[SYSTEM STATUS: ACTIVE MODE = ⚡ BUILD MODE. All coding tools (write_file, edit_file, run_command) are FULLY UNLOCKED AND ACTIVE. You MUST NOT claim you are in PLAN mode or ask the user to type /build. You are ALREADY in BUILD mode. Immediately call your tools to implement, create, or edit code.]`
        : `[SYSTEM STATUS: ACTIVE MODE = 📋 PLAN MODE. You are in read-only planning mode. Formulate comprehensive step-by-step plans without modifying files.]`;

    const englishEnforcedInput = `[CRITICAL: You must provide all explanations, responses, and terminal output strictly in clear ENGLISH. Do not use Bengali script under any circumstances.]\n${modeDirective}\n\n${userInput}`;

    try {
      if (this.config.provider === 'gemini') {
        return await this.chatGemini(englishEnforcedInput, options);
      } else {
        return await this.chatOpenAI(englishEnforcedInput, options);
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

  private shouldNudgePassiveBuildReply(
    userPrompt: string,
    replyText: string,
    toolsExecutedInChat: number,
    alreadyNudged: boolean
  ): boolean {
    if (this.mode !== 'build' || alreadyNudged || toolsExecutedInChat > 0) return false;
    if (/without calling tools/i.test(userPrompt)) return false;

    const lower = replyText.toLowerCase();
    const isRefusingOrWaiting =
      lower.includes('type /build') ||
      lower.includes('switch to build mode') ||
      lower.includes('no files have been created') ||
      lower.includes('system has not switched modes') ||
      lower.includes('ready to execute');
    if (isRefusingOrWaiting) return true;

    const asksToImplement =
      /\b(create|build|write|edit|fix|implement|add|make|update|generate|refactor|delete|run|install)\b/i.test(
        userPrompt
      );
    const dumpsCodeInsteadOfTools = replyText.includes('```') && replyText.length > 350;
    const asksPermission =
      lower.includes('would you like me to') ||
      lower.includes('shall i proceed') ||
      lower.includes('do you want me to');
    return asksToImplement && (dumpsCodeInsteadOfTools || asksPermission);
  }

  /**
   * Google Gemini Tool-Calling Loop using @google/genai
   */
  private async chatGemini(
    userInput: string,
    options?: { signal?: AbortSignal; images?: ImagePayload[] }
  ): Promise<string> {
    if (options?.signal?.aborted) {
      return chalk.yellow('\n⏹️ Task cancelled by user (Escape key pressed).');
    }

    if (!this.geminiClient) {
      throw new Error('Gemini client is not initialized.');
    }

    // Add user message to Gemini conversation contents only if not already added
    const lastContent = this.geminiContents[this.geminiContents.length - 1];
    if (!lastContent || lastContent.role !== 'user') {
      const parts: any[] = [{ text: userInput }];
      if (options?.images && options.images.length > 0) {
        for (const img of options.images) {
          parts.push({
            inlineData: {
              mimeType: img.mimeType,
              data: img.base64,
            },
          });
        }
      }
      this.geminiContents.push({
        role: 'user',
        parts,
      });
    }

    const maxTurns = 40;
    let turnCount = 0;
    let toolsExecutedInChat = 0;
    let nudgedBuildExecution = false;

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
      let usedGeminiModel = this.config.model;

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
          let timeoutId: NodeJS.Timeout | undefined;
          try {
            const abortPromise = new Promise<never>((_, reject) => {
              if (options?.signal?.aborted) {
                reject(new Error('ABORTED_BY_USER'));
                return;
              }
              options?.signal?.addEventListener('abort', () => reject(new Error('ABORTED_BY_USER')), { once: true });
            });

            const timeoutPromise = new Promise<never>((_, reject) => {
              timeoutId = setTimeout(() => reject(new Error('Gemini API request timed out (18s)')), 18000);
            });

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
            if (timeoutId) clearTimeout(timeoutId);

            usedGeminiModel = candidateModel;
            if (candidateModel !== this.config.model) {
              spinner.stop();
              renderCascadeNotice(this.config.model, candidateModel, 'Gemini failover');
              this.config.model = candidateModel;
              spinner.start();
            }
            this.persistVerifiedActiveModel();

            lastError = null;
            break;
          } catch (err: any) {
            if (timeoutId) clearTimeout(timeoutId);
            if (options?.signal?.aborted || err?.message === 'ABORTED_BY_USER') {
              spinner.stop();
              return chalk.yellow('\n⏹️ Task cancelled by user (Escape key pressed).');
            }

            lastError = err;
            this.attemptedModelsInCascade.add(candidateModel);
            const errMsg = err?.message || String(err);

            // Fail fast without sleeping when model quota/availability/auth/timeout occurs
            const noRetryOnSameModel =
              errMsg.includes('exceeded your current quota') ||
              errMsg.includes('free_tier') ||
              errMsg.includes('RESOURCE_EXHAUSTED') ||
              errMsg.includes('404') ||
              errMsg.includes('NOT_FOUND') ||
              errMsg.includes('no longer available') ||
              errMsg.includes('API_KEY_INVALID') ||
              errMsg.includes('401') ||
              errMsg.includes('403') ||
              errMsg.includes('timed out') ||
              errMsg.includes('timeout');

            if (noRetryOnSameModel) {
              break;
            }

            const isTransient =
              errMsg.includes('503') ||
              errMsg.includes('UNAVAILABLE') ||
              errMsg.includes('high demand') ||
              errMsg.includes('429');

            if (!isTransient) {
              break;
            }

            if (attempts < maxModelAttempts) {
              await new Promise((resolve) => setTimeout(resolve, 800));
            }
          }
        }

        if (response) {
          break;
        }

        if (lastError) {
          const errMsg = lastError?.message || String(lastError);
          if (errMsg.includes('API_KEY_INVALID') || errMsg.includes('403') || errMsg.includes('401')) {
            break;
          }
        }
      }

      spinner.stop();

      if (!response) {
        const errMsg = lastError ? (lastError?.message || String(lastError)) : 'All Gemini candidates exhausted';
        if (errMsg.includes('API_KEY_INVALID') || errMsg.includes('403') || errMsg.includes('401')) {
          const nextModel = await this.cascadeModel(
            this.config.model,
            'Gemini auth error (401/403), cascading to OpenRouter/Custom'
          );
          if (nextModel) {
            if (this.config.provider === 'gemini') {
              return await this.chatGemini(userInput, options);
            } else {
              return await this.chatOpenAI(userInput, options);
            }
          }
          return chalk.red(
            `\n✖ Gemini API Key Error: Your API key appears to be invalid or expired.\n` +
              `Please run ${chalk.yellow('/config')} to update your API key.`
          );
        } else {
          const nextModel = await this.cascadeModel(
            usedGeminiModel,
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

      // Check if candidate hit MALFORMED_FUNCTION_CALL
      if (candidate?.finishReason === 'MALFORMED_FUNCTION_CALL' && functionCalls.length === 0) {
        this.geminiContents.push({
          role: 'user',
          parts: [
            {
              text: '[System: Your previous function call had malformed arguments. Please call the tool again with valid JSON parameters.]',
            },
          ],
        });
        continue;
      }

      // Check if candidate returned content
      if (candidate?.content) {
        this.geminiContents.push(candidate.content);
      }

      // Extract text directly from candidate parts (avoids @google/genai noisy getter warnings)
      const directText = (candidate?.content?.parts || [])
        .map((p: any) => (typeof p.text === 'string' ? p.text : ''))
        .join('')
        .trim();

      // If no function calls, check BUILD mode autonomous execution guard or return final answer
      if (!functionCalls || functionCalls.length === 0) {
        if (!directText && turnCount < maxTurns) {
          this.geminiContents.push({
            role: 'user',
            parts: [{ text: 'Please continue and provide your response or call the needed tool.' }],
          });
          continue;
        }
        if (this.shouldNudgePassiveBuildReply(userInput, directText, toolsExecutedInChat, nudgedBuildExecution) && turnCount < maxTurns) {
          nudgedBuildExecution = true;
          this.geminiContents.push({
            role: 'user',
            parts: [
              {
                text: '[SYSTEM GUARD: You are ALREADY in BUILD MODE with full tool access. Do NOT ask for /build or wait for permission. Call write_file, edit_file, or run_command right now to execute the request!]',
              },
            ],
          });
          continue;
        }
        return directText || '';
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

        toolsExecutedInChat++;
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
  private async chatOpenAI(
    userInput: string,
    options?: { signal?: AbortSignal; images?: ImagePayload[] }
  ): Promise<string> {
    if (options?.signal?.aborted) {
      return chalk.yellow('\n⏹️ Task cancelled by user (Escape key pressed).');
    }

    if (!this.openAIClient || !this.config.apiKey) {
      const nextModel = await this.cascadeModel(
        this.config.model,
        `Auth error / Missing API key for ${this.config.provider}`
      );
      if (nextModel) {
        if ((this.config.provider as string) === 'gemini') {
          return await this.chatGemini(userInput, options);
        }
      } else {
        throw new Error('OpenAI client is not initialized.');
      }
    }

    const lastMsg = this.openAIMessages[this.openAIMessages.length - 1];
    if (!lastMsg || lastMsg.role !== 'user') {
      if (options?.images && options.images.length > 0) {
        const contentParts: any[] = [{ type: 'text', text: userInput }];
        for (const img of options.images) {
          contentParts.push({
            type: 'image_url',
            image_url: {
              url: `data:${img.mimeType};base64,${img.base64}`,
            },
          });
        }
        this.openAIMessages.push({
          role: 'user',
          content: contentParts as any,
        });
      } else {
        this.openAIMessages.push({
          role: 'user',
          content: userInput,
        });
      }
    }

    const maxTurns = 40;
    let turnCount = 0;
    let toolsExecutedInChat = 0;
    let nudgedBuildExecution = false;

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
      const maxCascadeAttempts = 40;

      while (cascadeAttempts < maxCascadeAttempts) {
        if (options?.signal?.aborted) {
          spinner.stop();
          return chalk.yellow('\n⏹️ Task cancelled by user (Escape key pressed).');
        }

        if (!this.openAIClient) {
          break;
        }

        let timeoutId: NodeJS.Timeout | undefined;
        try {
          const abortPromise = new Promise<never>((_, reject) => {
            if (options?.signal?.aborted) {
              reject(new Error('ABORTED_BY_USER'));
              return;
            }
            options?.signal?.addEventListener('abort', () => reject(new Error('ABORTED_BY_USER')), { once: true });
          });

          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Provider API request timed out (18s)')), 18000);
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
                timeout: 18000,
              }
            ),
            timeoutPromise,
            abortPromise,
          ]);
          if (timeoutId) clearTimeout(timeoutId);
          this.persistVerifiedActiveModel();
          break;
        } catch (err: any) {
          if (timeoutId) clearTimeout(timeoutId);
          if (options?.signal?.aborted || err?.message === 'ABORTED_BY_USER') {
            spinner.stop();
            return chalk.yellow('\n⏹️ Task cancelled by user (Escape key pressed).');
          }

          const errMsg = err?.message || String(err);
          const lowerErr = errMsg.toLowerCase();

          let cascadeReason = `Server load / Unavailable`;
          if (lowerErr.includes('free-models-per-day') || lowerErr.includes('free_daily_limit')) {
            cascadeReason = 'OpenRouter daily free limit reached (free-models-per-day)';
          } else if (
            lowerErr.includes('401') ||
            lowerErr.includes('incorrect api key') ||
            lowerErr.includes('invalid_api_key') ||
            lowerErr.includes('user not found') ||
            lowerErr.includes('authentication failed')
          ) {
            cascadeReason = `Auth error (401) on ${this.config.provider}`;
          } else if (lowerErr.includes('402') || lowerErr.includes('insufficient balance') || lowerErr.includes('insufficient_quota')) {
            cascadeReason = `402 Insufficient Balance on ${this.config.provider}`;
          } else if (lowerErr.includes('429') || lowerErr.includes('rate limit')) {
            cascadeReason = 'Daily free token quota / Rate limit reached (429)';
          } else {
            cascadeReason = `Provider auto-failover: ${errMsg.slice(0, 60)}`;
          }

          cascadeAttempts++;
          spinner.stop();
          const nextModel = await this.cascadeModel(this.config.model, cascadeReason);
          if (nextModel) {
            if ((this.config.provider as string) === 'gemini') {
              return await this.chatGemini(userInput, options);
            }
            spinner.text = chalk.cyan(`banglacli continuing with [${nextModel}]...`);
            spinner.start();
            continue;
          }

          if (lowerErr.includes('401') || lowerErr.includes('invalid_api_key') || lowerErr.includes('user not found')) {
            return chalk.red(
              `\n✖ API Key Error: Authentication failed for ${this.config.provider}.\n` +
                `Please run ${chalk.yellow('/provider')} or ${chalk.yellow('/config')} to configure a valid key.`
            );
          }

          return chalk.yellow(
            '\n⏳ All free model tokens are currently exhausted across all providers. Check the renewal countdown above.'
          );
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

      const choice = completion.choices?.[0];
      if (!choice || !choice.message) {
        const nextModel = await this.cascadeModel(this.config.model, 'Empty choices returned from model');
        if (nextModel) {
          if ((this.config.provider as string) === 'gemini') {
            return await this.chatGemini(userInput, options);
          }
          continue;
        }
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

      // If no tool calls, check BUILD mode autonomous execution guard or return final answer
      if (!message.tool_calls || message.tool_calls.length === 0) {
        const rawText = message.content?.trim() || '';
        const reasoningText = ((message as any).reasoning || '').trim();
        if (!rawText && reasoningText && turnCount < maxTurns) {
          // Some free reasoning models exhaust tokens thinking before emitting final text/tool_calls
          this.openAIMessages.push({
            role: 'user',
            content: 'Please proceed directly with your final answer or call the required tool now.',
          });
          continue;
        }
        const finalCandidate = message.content || reasoningText || '';
        if (this.shouldNudgePassiveBuildReply(userInput, finalCandidate, toolsExecutedInChat, nudgedBuildExecution) && turnCount < maxTurns) {
          nudgedBuildExecution = true;
          this.openAIMessages.push({
            role: 'user',
            content:
              '[SYSTEM GUARD: You are ALREADY in BUILD MODE with full tool access. Do NOT ask for /build or wait for permission. Call write_file, edit_file, or run_command right now to execute the request!]',
          });
          continue;
        }
        return finalCandidate;
      }

      // Process tool calls
      for (const toolCall of message.tool_calls) {
        if (options?.signal?.aborted) {
          return chalk.yellow('\n⏹️ Task cancelled by user (Escape key pressed).');
        }

        if (toolCall.type !== 'function') continue;

        const fnName = toolCall.function.name;
        let fnArgs: Record<string, any> | null = null;
        let parseError: string | null = null;

        try {
          fnArgs = JSON.parse(toolCall.function.arguments || '{}');
        } catch (e: any) {
          parseError = e?.message || 'Invalid JSON';
        }

        if (parseError || !fnArgs || typeof fnArgs !== 'object') {
          this.openAIMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: `Error: Could not parse JSON arguments for "${fnName}" (${parseError}). Please fix the JSON escaping and call "${fnName}" again.`,
          });
          continue;
        }

        updateFixedBottomStatus(`Executing tool: ${fnName}... (Esc to abort)`, {
          mode: this.mode,
          model: this.config.model,
        });

        toolsExecutedInChat++;
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
