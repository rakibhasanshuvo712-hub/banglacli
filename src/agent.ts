import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { BanglaCLIConfig } from './config.js';
import { GEMINI_TOOLS, OPENAI_TOOLS, executeTool } from './tools.js';
import { createSpinner, renderMarkdown } from './ui.js';
import chalk from 'chalk';

export const SYSTEM_PROMPT = `You are banglaCLI, a world-class Senior Full-Stack Software Architect and Autonomous AI Coding Agent running directly in the user's terminal.

### 1. LANGUAGE & COMMUNICATION RULES (CRITICAL):
- You possess native fluency in Bangla (বাংলা), Banglish (Romanized Bengali, e.g. "amake ekta Express auth backend banaye dao"), and English.
- Always detect the user's language and respond in the EXACT same language and tone:
  * If the user writes in Bangla (বাংলা লিপি), respond in natural, friendly, accurate Bangla.
  * If the user writes in Banglish, respond in natural Banglish with Bengali developer slang/enthusiasm.
  * If the user writes in English, respond in clear, professional English.
  * If the user mixes languages, mirror their style naturally.

### 2. AUTONOMOUS PROJECT BUILDER PROTOCOL (PROACTIVE TOOL CALLING):
- You are not just a chatbot; you are an active developer who BUILDS projects using the 4 workspace tools:
  1. list_files(dirPath): Explore directories to understand workspace context.
  2. read_file(filePath): Inspect existing files before editing.
  3. write_file(filePath, content): Create directories and write complete, fully-functional, production-grade code.
  4. run_command(command): Execute terminal commands (e.g., "npm init -y", "npm install <packages>", build or test scripts).
- When asked to build or modify an app:
  * Proactively execute tools step-by-step.
  * NEVER output placeholder code (e.g., "// TODO: implement", "// add rest here"). Always write complete, tested code.
  * Create necessary configuration files (package.json, tsconfig.json, .gitignore, README.md, etc.) as needed.
  * Install dependencies using run_command when required.
  * Keep code modular, clean, well-commented, and robust.

### 3. INTERACTIVE FEEDBACK:
- Before and after tool actions, provide concise explanations in the user's language.
- At the end of a build, provide clear instructions on how the user can test or start the application (e.g., "npm run dev").`;

interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
}

const GEMINI_FALLBACK_MAP: Record<string, string[]> = {
  'gemini-3.8-flash': ['gemini-2.0-flash', 'gemini-1.5-flash'],
  'gemini-2.0-flash': ['gemini-1.5-flash', 'gemini-3.8-flash'],
  'gemini-1.5-flash': ['gemini-2.0-flash', 'gemini-3.8-flash'],
  'gemini-1.5-pro': ['gemini-2.0-flash', 'gemini-1.5-flash'],
};

export class BanglaAgent {
  private config: BanglaCLIConfig;
  private openAIClient?: OpenAI;
  private geminiClient?: GoogleGenAI;

  // History for OpenAI format
  private openAIMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

  // History for Gemini format
  private geminiContents: Array<{
    role: string;
    parts: Array<any>;
  }> = [];

  constructor(config: BanglaCLIConfig) {
    this.config = config;
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
   * Update configuration and recreate clients.
   */
  public updateConfig(newConfig: BanglaCLIConfig): void {
    this.config = newConfig;
    this.initClients();
    this.resetHistory();
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
        content: SYSTEM_PROMPT,
      },
    ];
    this.geminiContents = [];
  }

  /**
   * Main chat turn loop with automatic tool execution and cross-provider failover.
   */
  public async chat(userInput: string): Promise<string> {
    try {
      if (this.config.provider === 'gemini') {
        const reply = await this.chatGemini(userInput);
        // Check if Gemini failed with 503 or server overload message
        if (
          typeof reply === 'string' &&
          (reply.includes('503') ||
            reply.includes('UNAVAILABLE') ||
            reply.includes('high demand') ||
            reply.includes('Unavailable') ||
            reply.includes('Server Overload'))
        ) {
          const openRouterSaved = this.config.savedProviders?.openrouter;
          if (openRouterSaved && openRouterSaved.apiKey) {
            console.log(
              chalk.bold.hex('#00FF7F')(
                `\n⚡ [Auto-Recovery]: Google Gemini free servers are currently overloaded (503).\n` +
                  `Seamlessly switched to OpenRouter (openrouter/free) to complete your request!\n`
              )
            );
            this.config.provider = 'openrouter';
            this.config.apiKey = openRouterSaved.apiKey;
            this.config.model = 'openrouter/free';
            this.config.baseURL = 'https://openrouter.ai/api/v1';
            this.initClients();
            return await this.chatOpenAI(userInput);
          }
        }
        return reply;
      } else {
        return await this.chatOpenAI(userInput);
      }
    } catch (err: any) {
      if (this.config.provider === 'gemini') {
        const openRouterSaved = this.config.savedProviders?.openrouter;
        if (openRouterSaved && openRouterSaved.apiKey) {
          console.log(
            chalk.bold.hex('#00FF7F')(
              `\n⚡ [Auto-Recovery]: Google Gemini server error. Seamlessly switching to OpenRouter (openrouter/free)...\n`
            )
          );
          this.config.provider = 'openrouter';
          this.config.apiKey = openRouterSaved.apiKey;
          this.config.model = 'openrouter/free';
          this.config.baseURL = 'https://openrouter.ai/api/v1';
          this.initClients();
          return await this.chatOpenAI(userInput);
        }
      }
      throw err;
    }
  }

  /**
   * Google Gemini Tool-Calling Loop using @google/genai
   */
  private async chatGemini(userInput: string): Promise<string> {
    if (!this.geminiClient) {
      throw new Error('Gemini client is not initialized.');
    }

    // Add user message to Gemini conversation contents
    this.geminiContents.push({
      role: 'user',
      parts: [{ text: userInput }],
    });

    const maxTurns = 25;
    let turnCount = 0;

    while (turnCount < maxTurns) {
      turnCount++;
      const spinner = createSpinner(
        turnCount === 1 ? 'banglaCLI thinking...' : `banglaCLI working (step ${turnCount})...`
      );
      spinner.start();

      let response: any = null;
      let lastError: any = null;

      // Candidate models: requested model first, then fallback models
      const fallbacks = GEMINI_FALLBACK_MAP[this.config.model] || ['gemini-2.0-flash', 'gemini-1.5-flash'];
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
                systemInstruction: SYSTEM_PROMPT,
                tools: GEMINI_TOOLS as any,
              },
            });

            if (candidateModel !== this.config.model) {
              console.log(
                chalk.yellow(
                  `\n⚡ [Auto-Failover]: "${this.config.model}" experienced high demand (503). Automatically rerouted request to "${candidateModel}"!`
                )
              );
              this.config.model = candidateModel;
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
              `1. Run ${chalk.yellow.bold('/provider')} and switch to ${chalk.green.bold('OpenRouter')} (DeepSeek & GLM-4 are 100% free with no 503 errors).\n` +
              `2. Run ${chalk.yellow.bold('/model')} to manually switch to ${chalk.green.bold('gemini-2.0-flash')} or ${chalk.green.bold('gemini-1.5-flash')}.\n` +
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
        const toolName = call.name;
        const toolArgs = call.args || {};

        const output = await executeTool(toolName, toolArgs);

        toolResponseParts.push({
          functionResponse: {
            name: toolName,
            id: call.id,
            response: { output },
          },
        });
      }

      // Append function response turn to Gemini contents
      this.geminiContents.push({
        role: 'tool',
        parts: toolResponseParts,
      });
    }

    return 'Maximum agent iteration steps reached for this request.';
  }

  /**
   * OpenAI / OpenRouter / Custom Provider Tool-Calling Loop
   */
  private async chatOpenAI(userInput: string): Promise<string> {
    if (!this.openAIClient) {
      throw new Error('OpenAI client is not initialized.');
    }

    this.openAIMessages.push({
      role: 'user',
      content: userInput,
    });

    const maxTurns = 25;
    let turnCount = 0;

    while (turnCount < maxTurns) {
      turnCount++;
      const spinner = createSpinner(
        turnCount === 1 ? 'banglaCLI thinking...' : `banglaCLI executing (step ${turnCount})...`
      );
      spinner.start();

      let completion: OpenAI.Chat.Completions.ChatCompletion;
      try {
        completion = await this.openAIClient.chat.completions.create({
          model: this.config.model,
          messages: this.openAIMessages,
          tools: OPENAI_TOOLS,
          tool_choice: 'auto',
        });
        spinner.stop();
      } catch (err: any) {
        spinner.stop();
        const errMsg = err?.message || String(err);
        if (errMsg.includes('401') || errMsg.includes('Incorrect API key') || errMsg.includes('invalid_api_key')) {
          return chalk.red(
            `\n✖ API Key Error: Authentication failed for ${this.config.provider}.\n` +
              `Please run ${chalk.yellow('/config')} to enter a valid API key.`
          );
        } else if (errMsg.includes('429') || errMsg.includes('rate limit')) {
          return chalk.red(
            `\n✖ Rate Limit Exceeded (429).\n` +
              `Please wait a moment, switch models with ${chalk.yellow('/model')}, or run ${chalk.yellow('/config')}.`
          );
        }
        throw new Error(`Provider Error (${this.config.provider}): ${errMsg}`);
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
        if (toolCall.type !== 'function') continue;

        const fnName = toolCall.function.name;
        let fnArgs: Record<string, any> = {};

        try {
          fnArgs = JSON.parse(toolCall.function.arguments || '{}');
        } catch {
          fnArgs = {};
        }

        const toolResult = await executeTool(fnName, fnArgs);

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
