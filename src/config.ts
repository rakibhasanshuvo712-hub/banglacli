import fs from 'node:fs';
import path from 'node:path';
import Conf from 'conf';
import { interactiveSelect, interactiveInput } from './prompt.js';
import chalk from 'chalk';

export type ProviderType = 'gemini' | 'openrouter' | 'custom';

export interface ProviderConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
}

export interface BanglaCLIConfig {
  provider: ProviderType;
  apiKey: string;
  model: string;
  baseURL?: string;
  savedProviders?: Partial<Record<ProviderType, ProviderConfig>>;
}

const configStore = new Conf<{ config: BanglaCLIConfig }>({
  projectName: 'banglacli',
});

export const POLLINATIONS_BASE_URL = 'https://text.pollinations.ai/openai';
export const POLLINATIONS_DEFAULT_MODEL = 'openai';
export const POLLINATIONS_FREE_API_KEY = 'banglacli-free';

export const PROVIDER_LABELS: Record<ProviderType, string> = {
  gemini: 'Google Gemini (Free Tier)',
  openrouter: 'OpenRouter (Free Models)',
  custom: 'Custom OpenAI-Compatible (DeepSeek, Ollama, Groq, etc.)',
};

export const DEFAULT_MODELS: Record<ProviderType, string> = {
  gemini: 'gemini-3.5-flash-lite',
  openrouter: 'openrouter/free',
  custom: 'llama-3.3-70b-versatile',
};

export const PROVIDER_KEY_URLS: Record<ProviderType, string> = {
  gemini: 'https://aistudio.google.com/apikey',
  openrouter: 'https://openrouter.ai/keys',
  custom: 'https://console.groq.com/keys (or https://platform.deepseek.com/api_keys)',
};

/**
 * Format a clear, accurate display label for the active provider configuration.
 */
export function formatProviderLabel(cfg?: Partial<BanglaCLIConfig> | null): string {
  if (!cfg?.provider) return 'Google Gemini';
  if (cfg.provider === 'custom') {
    const url = (cfg.baseURL || '').toLowerCase();
    if (url.includes('pollinations.ai')) return 'Free Zero-Key Starter AI';
    if (url.includes('localhost') || url.includes('127.0.0.1')) return 'Local Ollama (Offline Free)';
    if (url.includes('groq.com')) return 'Groq Cloud (Free Tier)';
    if (url.includes('deepseek.com')) return 'DeepSeek Platform';
    if (url.includes('cerebras.ai')) return 'Cerebras Cloud (Free Tier)';
  }
  return PROVIDER_LABELS[cfg.provider] || cfg.provider;
}

/**
 * Build a ready-to-use Zero-Key configuration backed by Pollinations anonymous API.
 */
export function createZeroKeyConfig(existing?: BanglaCLIConfig): BanglaCLIConfig {
  return {
    provider: 'custom',
    apiKey: POLLINATIONS_FREE_API_KEY,
    model: POLLINATIONS_DEFAULT_MODEL,
    baseURL: POLLINATIONS_BASE_URL,
    savedProviders: {
      ...existing?.savedProviders,
      custom: {
        apiKey: POLLINATIONS_FREE_API_KEY,
        model: POLLINATIONS_DEFAULT_MODEL,
        baseURL: POLLINATIONS_BASE_URL,
      },
    },
  };
}

/**
 * Check if the config points to a built-in zero-key / local keyless provider.
 */
export function isKeylessConfig(cfg?: Partial<BanglaCLIConfig> | null): boolean {
  if (!cfg || cfg.provider !== 'custom') return false;
  const url = (cfg.baseURL || '').toLowerCase();
  return (
    url.includes('pollinations.ai') ||
    url.includes('localhost') ||
    url.includes('127.0.0.1')
  );
}

/**
 * Read provider API keys from workspace .env / .env.local files without mutating process.env.
 */
function readWorkspaceDotEnv(): Record<string, string> {
  const vars: Record<string, string> = {};
  const candidates = ['.env.local', '.env'];
  for (const file of candidates) {
    const fullPath = path.resolve(process.cwd(), file);
    try {
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, 'utf-8');
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
        if (!match) continue;
        const keyName = match[1].trim();
        let val = match[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1).trim();
        } else {
          // Strip inline comments on unquoted values
          val = val.replace(/\s+#.*$/, '').trim();
        }
        if (val && !(keyName in vars)) {
          vars[keyName] = val;
        }
      }
    } catch {}
  }
  return vars;
}

function getEnvOrDotEnv(name: string, dotEnv?: Record<string, string>): string | undefined {
  const fromProc = process.env[name]?.trim();
  if (fromProc) return fromProc;
  const map = dotEnv || readWorkspaceDotEnv();
  return map[name]?.trim() || undefined;
}

/**
 * Detect locally running Ollama server and return installed model tags cleanly within timeoutMs.
 */
export async function detectLocalOllamaModels(timeoutMs = 700): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('http://127.0.0.1:11434/api/tags', { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = (await res.json()) as any;
    const models: string[] = Array.isArray(data?.models)
      ? data.models.map((m: any) => String(m?.name || m?.model || '').trim()).filter(Boolean)
      : [];
    return models;
  } catch {
    clearTimeout(timer);
    return [];
  }
}

/**
 * Clean accidental quotes, whitespace, or KEY= prefixes from pasted API keys.
 */
export function sanitizeApiKeyInput(raw: string): string {
  let cleaned = raw.trim();
  const stripQuotes = (s: string): string =>
    (s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))
      ? s.slice(1, -1).trim()
      : s;
  cleaned = stripQuotes(cleaned);
  cleaned = cleaned.replace(/^export\s+/i, '').trim();
  cleaned = cleaned.replace(/^(GEMINI_API_KEY|GOOGLE_API_KEY|OPENROUTER_API_KEY|GROQ_API_KEY|DEEPSEEK_API_KEY|OPENAI_API_KEY)\s*=\s*/i, '').trim();
  cleaned = stripQuotes(cleaned);
  return cleaned;
}

/**
 * Infer actual provider when user pastes a key belonging to another provider.
 */
export function inferProviderFromApiKey(apiKey: string): 'gemini' | 'openrouter' | 'groq' | null {
  const k = apiKey.trim();
  if (k.startsWith('AIza')) return 'gemini';
  if (k.startsWith('sk-or-')) return 'openrouter';
  if (k.startsWith('gsk_')) return 'groq';
  return null;
}

/**
 * Quickly verify API key credentials before completing setup (without burning generation tokens).
 */
async function verifyProviderCredentials(
  provider: ProviderType,
  apiKey: string,
  baseURL?: string
): Promise<{ ok: boolean; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    if (provider === 'gemini') {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(apiKey)}`,
        { signal: controller.signal }
      );
      clearTimeout(timer);
      if (res.ok) return { ok: true };
      const txt = await res.text();
      if (res.status === 400 || res.status === 401 || res.status === 403 || txt.includes('API_KEY_INVALID')) {
        return { ok: false, error: 'Google rejected this API key (invalid or restricted).' };
      }
      return { ok: true };
    }

    if (provider === 'openrouter') {
      const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      clearTimeout(timer);
      if (res.ok) return { ok: true };
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: 'OpenRouter rejected this API key (401 Unauthorized).' };
      }
      return { ok: true };
    }

    if (baseURL && !baseURL.includes('pollinations.ai') && !baseURL.includes('localhost') && !baseURL.includes('127.0.0.1')) {
      const modelsUrl = baseURL.replace(/\/+$/, '') + '/models';
      const res = await fetch(modelsUrl, {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      clearTimeout(timer);
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: `Endpoint rejected API key (${res.status}).` };
      }
      return { ok: true };
    }

    clearTimeout(timer);
    return { ok: true };
  } catch {
    clearTimeout(timer);
    // Network timeout or proxy quirks should not block saving valid offline/proxied keys
    return { ok: true };
  }
}

/**
 * Read provider API keys from environment variables or workspace .env files when available.
 */
export function getEnvProviderKey(provider: ProviderType): string | undefined {
  const dotEnv = readWorkspaceDotEnv();
  if (provider === 'gemini') {
    return getEnvOrDotEnv('GEMINI_API_KEY', dotEnv) || getEnvOrDotEnv('GOOGLE_API_KEY', dotEnv);
  }
  if (provider === 'openrouter') {
    return getEnvOrDotEnv('OPENROUTER_API_KEY', dotEnv);
  }
  if (provider === 'custom') {
    return (
      getEnvOrDotEnv('GROQ_API_KEY', dotEnv) ||
      getEnvOrDotEnv('DEEPSEEK_API_KEY', dotEnv) ||
      getEnvOrDotEnv('OPENAI_API_KEY', dotEnv)
    );
  }
  return undefined;
}

/**
 * Retrieve saved configuration (hydrating any available environment or .env API keys).
 */
export function getConfig(): BanglaCLIConfig | undefined {
  let cfg = configStore.get('config');
  const dotEnv = readWorkspaceDotEnv();

  const envGemini = getEnvOrDotEnv('GEMINI_API_KEY', dotEnv) || getEnvOrDotEnv('GOOGLE_API_KEY', dotEnv);
  const envOpenRouter = getEnvOrDotEnv('OPENROUTER_API_KEY', dotEnv);
  const envGroq = getEnvOrDotEnv('GROQ_API_KEY', dotEnv);
  const envDeepSeek = getEnvOrDotEnv('DEEPSEEK_API_KEY', dotEnv);

  if (!cfg) {
    if (envGemini || envOpenRouter || envGroq || envDeepSeek) {
      const savedProviders: Partial<Record<ProviderType, ProviderConfig>> = {};
      if (envGemini) {
        savedProviders.gemini = { apiKey: envGemini, model: DEFAULT_MODELS.gemini };
      }
      if (envOpenRouter) {
        savedProviders.openrouter = {
          apiKey: envOpenRouter,
          model: DEFAULT_MODELS.openrouter,
          baseURL: 'https://openrouter.ai/api/v1',
        };
      }
      if (envGroq) {
        savedProviders.custom = {
          apiKey: envGroq,
          model: 'llama-3.3-70b-versatile',
          baseURL: 'https://api.groq.com/openai/v1',
        };
      } else if (envDeepSeek) {
        savedProviders.custom = {
          apiKey: envDeepSeek,
          model: 'deepseek-chat',
          baseURL: 'https://api.deepseek.com/v1',
        };
      }

      const primaryProvider: ProviderType = envGemini ? 'gemini' : envOpenRouter ? 'openrouter' : 'custom';
      const primary = savedProviders[primaryProvider]!;
      cfg = {
        provider: primaryProvider,
        apiKey: primary.apiKey,
        model: primary.model,
        baseURL: primary.baseURL,
        savedProviders,
      };
      return cfg;
    }
    return undefined;
  }

  if (!cfg.savedProviders) {
    cfg.savedProviders = {
      [cfg.provider]: {
        apiKey: cfg.apiKey,
        model: cfg.model,
        baseURL: cfg.baseURL,
      },
    };
  }

  // Hydrate missing provider keys from environment variables
  if (envGemini && !cfg.savedProviders.gemini?.apiKey) {
    cfg.savedProviders.gemini = { apiKey: envGemini, model: DEFAULT_MODELS.gemini };
  }
  if (envOpenRouter && !cfg.savedProviders.openrouter?.apiKey) {
    cfg.savedProviders.openrouter = {
      apiKey: envOpenRouter,
      model: DEFAULT_MODELS.openrouter,
      baseURL: 'https://openrouter.ai/api/v1',
    };
  }
  if (envGroq && !cfg.savedProviders.custom?.apiKey) {
    cfg.savedProviders.custom = {
      apiKey: envGroq,
      model: 'llama-3.3-70b-versatile',
      baseURL: 'https://api.groq.com/openai/v1',
    };
  } else if (envDeepSeek && !cfg.savedProviders.custom?.apiKey) {
    cfg.savedProviders.custom = {
      apiKey: envDeepSeek,
      model: 'deepseek-chat',
      baseURL: 'https://api.deepseek.com/v1',
    };
  }

  // Clean up any stale baseURL attached to Gemini
  if (cfg.savedProviders.gemini?.baseURL) {
    delete cfg.savedProviders.gemini.baseURL;
  }
  if (cfg.provider === 'gemini' && cfg.baseURL) {
    delete (cfg as any).baseURL;
  }

  return cfg;
}

/**
 * Returns true if user has explicitly saved a persistent config on disk.
 */
export function hasSavedConfig(): boolean {
  return Boolean(configStore.get('config'));
}

/**
 * Save configuration to local storage.
 */
export function saveConfig(config: BanglaCLIConfig): void {
  if (!config.savedProviders) {
    config.savedProviders = {};
  }
  if (config.provider === 'gemini') {
    delete (config as any).baseURL;
  }
  config.savedProviders[config.provider] = {
    apiKey: config.apiKey,
    model: config.model,
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
  };
  configStore.set('config', config);
}

/**
 * Delete stored configuration.
 */
export function clearConfig(): void {
  configStore.delete('config');
}

/**
 * Update current model in stored config.
 */
export function updateModel(newModel: string): void {
  const current = getConfig();
  if (current) {
    current.model = newModel;
    saveConfig(current);
  }
}

/**
 * Shared styled section header (avoids orphaned @clack box borders when paired with interactiveSelect).
 */
function printSetupHeader(title: string, subtitle?: string): void {
  const cols = process.stdout.columns || 80;
  const line = chalk.hex('#00FF7F')('─'.repeat(Math.max(40, Math.min(cols - 4, 68))));
  console.log('\n' + line);
  console.log(`  ${chalk.bold.hex('#00FF7F')(title)}`);
  if (subtitle) {
    console.log(`  ${chalk.dim(subtitle)}`);
  }
  console.log(line + '\n');
}

function printSetupComplete(providerLabel: string, model: string, extraNote?: string): void {
  const cols = process.stdout.columns || 80;
  const line = chalk.hex('#00FF7F')('─'.repeat(Math.max(40, Math.min(cols - 4, 68))));
  console.log(line);
  console.log(chalk.green.bold('  ✔ Configuration saved!'));
  console.log(`  ${chalk.dim('Provider:')} ${chalk.bold.cyan(providerLabel)}`);
  console.log(`  ${chalk.dim('Model:')}    ${chalk.bold.hex('#00FF7F')(model)}`);
  if (extraNote) {
    console.log(`  ${chalk.yellow(extraNote)}`);
  }
  console.log(line + '\n');
}

/**
 * Interactive model selection helper for a provider.
 */
async function selectModelForProvider(
  provider: ProviderType,
  currentModel?: string,
  baseURL?: string
): Promise<string | null> {
  if (provider === 'gemini') {
    const geminiOptions = [
      {
        value: 'gemini-3.5-flash-lite',
        label: `gemini-3.5-flash-lite ${chalk.green('[Recommended Free]')}`,
        hint: 'Google AI Studio Free Tier: 1M context, 1,500 req/day, fast tool calling',
      },
      {
        value: 'gemini-3.5-flash',
        label: 'gemini-3.5-flash',
        hint: 'Next-Gen Flash with 1M context window',
      },
      {
        value: 'gemini-3.8-flash',
        label: 'gemini-3.8-flash',
        hint: 'Latest Gemini preview model with 2M context',
      },
      {
        value: 'gemini-3.1-flash-lite',
        label: 'gemini-3.1-flash-lite',
        hint: 'High-throughput 30 RPM lightweight coder',
      },
      {
        value: 'gemini-2.0-flash',
        label: 'gemini-2.0-flash',
        hint: 'Compatible alias auto-mapped to active Flash 3.5',
      },
      {
        value: 'custom_input',
        label: 'Enter custom model ID manually...',
        hint: 'Type any Gemini or Gemma model slug',
      },
    ];

    const hasMatch = geminiOptions.some((o) => o.value === currentModel);
    const initialVal = hasMatch ? currentModel : geminiOptions[0].value;

    const modelChoice = await interactiveSelect({
      message: 'Select Gemini Model:',
      initialValue: initialVal,
      options: geminiOptions,
    });

    if (!modelChoice) return null;

    if (modelChoice === 'custom_input') {
      const customModel = await interactiveInput({
        message: 'Enter Gemini model ID:',
        initialValue: 'gemini-3.5-flash-lite',
        validate: (v) => (!v || v.trim().length === 0 ? 'Model ID cannot be empty!' : undefined),
      });
      return customModel ? customModel.trim() : null;
    }
    return modelChoice;
  } else if (provider === 'openrouter') {
    const openrouterOptions = [
      {
        value: 'openrouter/free',
        label: `openrouter/free ${chalk.green('[Recommended Auto-Router]')}`,
        hint: 'Automatically routes to the best active free tool-capable coding model',
      },
      {
        value: 'nvidia/nemotron-3.5-lightning:free',
        label: 'nvidia/nemotron-3.5-lightning:free',
        hint: 'Fast 1M context free OpenRouter coding model',
      },
      {
        value: 'nvidia/nemotron-3-ultra-550b-a55b:free',
        label: 'nvidia/nemotron-3-ultra-550b-a55b:free',
        hint: '550B MoE 1M reasoning model (Free)',
      },
      {
        value: 'google/gemma-4-31b-it:free',
        label: 'google/gemma-4-31b-it:free',
        hint: 'Free Gemma 4 31B coding & chat model',
      },
      {
        value: 'particle-ai/particle-1:free',
        label: 'particle-ai/particle-1:free',
        hint: '1M context agentic coder (Free)',
      },
      {
        value: 'inclusionai/ling-3.2-flash:free',
        label: 'inclusionai/ling-3.2-flash:free',
        hint: '1M hybrid reasoner (Free)',
      },
      {
        value: 'custom_input',
        label: 'Enter custom OpenRouter model ID...',
        hint: 'Type any OpenRouter model slug',
      },
    ];

    const hasMatch = openrouterOptions.some((o) => o.value === currentModel);
    const initialVal = hasMatch ? currentModel : openrouterOptions[0].value;

    const modelChoice = await interactiveSelect({
      message: 'Select OpenRouter Model:',
      initialValue: initialVal,
      options: openrouterOptions,
    });

    if (!modelChoice) return null;

    if (modelChoice === 'custom_input') {
      const customModel = await interactiveInput({
        message: 'Enter OpenRouter model ID:',
        initialValue: 'openrouter/free',
        validate: (v) => (!v || v.trim().length === 0 ? 'Model ID cannot be empty!' : undefined),
      });
      return customModel ? customModel.trim() : null;
    }
    return modelChoice;
  } else {
    const lowerUrl = (baseURL || '').toLowerCase();
    if (lowerUrl.includes('pollinations.ai')) {
      return POLLINATIONS_DEFAULT_MODEL;
    }
    if (lowerUrl.includes('localhost') || lowerUrl.includes('127.0.0.1')) {
      const ollamaModels = await detectLocalOllamaModels(800);
      if (ollamaModels.length > 0) {
        const opts = [
          ...ollamaModels.map((m) => ({
            value: m,
            label: `${m} ${chalk.green('[Installed Locally]')}`,
            hint: '100% free & unlimited offline inference on Ollama',
          })),
          { value: 'custom_input', label: 'Enter Ollama model name manually...' },
        ];
        const pick = await interactiveSelect({
          message: 'Select Local Ollama Model:',
          initialValue: currentModel && ollamaModels.includes(currentModel) ? currentModel : ollamaModels[0],
          options: opts,
        });
        if (!pick) return null;
        if (pick !== 'custom_input') return pick;
      }
    }

    const defaultCustom = lowerUrl.includes('groq.com')
      ? 'llama-3.3-70b-versatile'
      : lowerUrl.includes('deepseek.com')
      ? 'deepseek-chat'
      : lowerUrl.includes('localhost') || lowerUrl.includes('127.0.0.1')
      ? 'qwen2.5-coder'
      : currentModel || 'deepseek-chat';

    const customModel = await interactiveInput({
      message: 'Enter model name (e.g. llama-3.3-70b-versatile, qwen2.5-coder, deepseek-chat):',
      initialValue: defaultCustom,
      validate: (v) => (!v || v.trim().length === 0 ? 'Model name cannot be empty!' : undefined),
    });

    return customModel ? customModel.trim() : null;
  }
}

/**
 * Shared custom endpoint preset chooser so users don't have to memorize API base URLs.
 */
async function selectCustomEndpointPreset(
  existingBaseURL?: string
): Promise<{ label: string; baseURL: string; keyUrl?: string; defaultModel: string } | null> {
  const endpointPick = await interactiveSelect<'groq' | 'deepseek' | 'lmstudio' | 'ollama' | 'manual'>({
    message: 'Choose Custom OpenAI-Compatible Endpoint:',
    options: [
      {
        value: 'groq',
        label: `${chalk.bold('Groq Cloud')} ${chalk.green('(14,400 Req/Day Free)')}`,
        hint: 'https://api.groq.com/openai/v1 • ultra-fast 500+ tok/s',
      },
      {
        value: 'deepseek',
        label: `${chalk.bold('DeepSeek Platform')} ${chalk.cyan('(5M Free Starter Tokens)')}`,
        hint: 'https://api.deepseek.com/v1 • deepseek-chat / reasoner',
      },
      {
        value: 'ollama',
        label: `${chalk.bold('Local Ollama')} ${chalk.green('(No API Key Needed)')}`,
        hint: 'http://localhost:11434/v1 • runs offline on your machine',
      },
      {
        value: 'lmstudio',
        label: `${chalk.bold('LM Studio Local Server')} ${chalk.green('(No API Key Needed)')}`,
        hint: 'http://localhost:1234/v1',
      },
      {
        value: 'manual',
        label: 'Enter custom /v1 baseURL manually...',
        hint: 'Any OpenAI-compatible proxy, vLLM, Cerebras, or Together endpoint',
      },
    ],
  });

  if (!endpointPick) return null;
  if (endpointPick === 'groq') {
    return {
      label: 'Groq Cloud',
      baseURL: 'https://api.groq.com/openai/v1',
      keyUrl: 'https://console.groq.com/keys',
      defaultModel: 'llama-3.3-70b-versatile',
    };
  }
  if (endpointPick === 'deepseek') {
    return {
      label: 'DeepSeek Platform',
      baseURL: 'https://api.deepseek.com/v1',
      keyUrl: 'https://platform.deepseek.com/api_keys',
      defaultModel: 'deepseek-chat',
    };
  }
  if (endpointPick === 'ollama') {
    return {
      label: 'Local Ollama',
      baseURL: 'http://localhost:11434/v1',
      defaultModel: 'qwen2.5-coder',
    };
  }
  if (endpointPick === 'lmstudio') {
    return {
      label: 'LM Studio',
      baseURL: 'http://localhost:1234/v1',
      defaultModel: 'local-model',
    };
  }

  const manualURL = await interactiveInput({
    message: 'Enter custom baseURL (must start with http:// or https://):',
    initialValue: existingBaseURL || 'https://api.groq.com/openai/v1',
    validate: (v) =>
      !v || (!v.trim().startsWith('http://') && !v.trim().startsWith('https://'))
        ? 'Please enter a valid URL starting with http:// or https://'
        : undefined,
  });
  if (!manualURL) return null;
  return {
    label: 'Custom OpenAI Endpoint',
    baseURL: manualURL.trim(),
    keyUrl: PROVIDER_KEY_URLS.custom,
    defaultModel: 'gpt-4o-mini',
  };
}

/**
 * Prompts for, sanitizes, auto-matches, and verifies an API key interactively.
 */
async function promptVerifiedApiKey(options: {
  provider: ProviderType;
  keyUrl: string;
  baseURL?: string;
  allowZeroKeyFallback: boolean;
}): Promise<{
  provider: ProviderType;
  apiKey: string;
  baseURL?: string;
  modelOverride?: string;
  usedZeroKey?: boolean;
} | null> {
  let activeProvider = options.provider;
  let activeBaseURL = options.baseURL;

  while (true) {
    console.log(chalk.white('  Get your free API key here: ') + chalk.bold.underline.cyan(options.keyUrl));
    console.log(chalk.dim('  (Stored locally on your machine only • paste key & press Enter)\n'));

    const rawEntered = await interactiveInput({
      message: `Paste your ${PROVIDER_LABELS[activeProvider]} API Key:`,
      placeholder: activeProvider === 'gemini' ? 'AIzaSy...' : activeProvider === 'openrouter' ? 'sk-or-v1-...' : 'gsk_... or sk-...',
      mask: true,
      validate: (val) => (!val || sanitizeApiKeyInput(val).length < 6 ? 'Please paste a valid API key.' : undefined),
    });

    if (!rawEntered) {
      if (options.allowZeroKeyFallback && process.stdin.isTTY) {
        const fallbackPick = await interactiveSelect<'retry' | 'zero_key' | 'cancel'>({
          message: 'No API key entered. What would you like to do?',
          options: [
            {
              value: 'zero_key',
              label: `${chalk.hex('#00FF7F').bold('🚀 Continue with Free Zero-Key Starter AI')} ${chalk.green('(No Key Needed)')}`,
              hint: 'Start right now without creating any API key (~45s cooldown/reply)',
            },
            { value: 'retry', label: chalk.cyan('🔑 Go back and enter an API key') },
            { value: 'cancel', label: chalk.gray('✖ Exit setup') },
          ],
        });
        if (fallbackPick === 'retry') continue;
        if (fallbackPick === 'zero_key') {
          return {
            provider: 'custom',
            apiKey: POLLINATIONS_FREE_API_KEY,
            baseURL: POLLINATIONS_BASE_URL,
            modelOverride: POLLINATIONS_DEFAULT_MODEL,
            usedZeroKey: true,
          };
        }
      }
      return null;
    }

    const cleanedKey = sanitizeApiKeyInput(rawEntered);
    const detected = inferProviderFromApiKey(cleanedKey);
    let modelOverride: string | undefined;

    if (detected === 'gemini' && activeProvider !== 'gemini') {
      console.log(chalk.cyan('\nℹ️  Detected Google Gemini API key (AIza...) — routing cleanly to Google Gemini!\n'));
      activeProvider = 'gemini';
      activeBaseURL = undefined;
      modelOverride = DEFAULT_MODELS.gemini;
    } else if (detected === 'openrouter' && activeProvider !== 'openrouter') {
      console.log(chalk.cyan('\nℹ️  Detected OpenRouter API key (sk-or-...) — routing cleanly to OpenRouter!\n'));
      activeProvider = 'openrouter';
      activeBaseURL = 'https://openrouter.ai/api/v1';
      modelOverride = DEFAULT_MODELS.openrouter;
    } else if (detected === 'groq' && (activeProvider !== 'custom' || !activeBaseURL?.includes('groq.com'))) {
      console.log(chalk.cyan('\nℹ️  Detected Groq API key (gsk_...) — routing cleanly to Groq Cloud!\n'));
      activeProvider = 'custom';
      activeBaseURL = 'https://api.groq.com/openai/v1';
      modelOverride = 'llama-3.3-70b-versatile';
    }

    process.stdout.write(chalk.cyan('  ⏳ Verifying API key...'));
    const check = await verifyProviderCredentials(activeProvider, cleanedKey, activeBaseURL);
    process.stdout.write('\r\x1b[2K');

    if (check.ok) {
      console.log(chalk.green('  ✔ API key verified!\n'));
      return {
        provider: activeProvider,
        apiKey: cleanedKey,
        baseURL: activeBaseURL,
        modelOverride,
      };
    }

    console.log(chalk.red(`  ✖ Verification failed: ${check.error || 'Invalid API key.'}\n`));
    const action = await interactiveSelect<'retry' | 'save_anyway' | 'zero_key' | 'cancel'>({
      message: 'API key check failed. Choose next step:',
      options: [
        { value: 'retry', label: chalk.cyan('🔑 Re-enter a different API key') },
        ...(options.allowZeroKeyFallback
          ? [
              {
                value: 'zero_key' as const,
                label: chalk.hex('#00FF7F')('🚀 Use Free Zero-Key Mode for now (No Key Needed)'),
              },
            ]
          : []),
        { value: 'save_anyway', label: chalk.yellow('Save key anyway') },
        { value: 'cancel', label: chalk.gray('✖ Cancel') },
      ],
    });

    if (action === 'retry') continue;
    if (action === 'save_anyway') {
      return {
        provider: activeProvider,
        apiKey: cleanedKey,
        baseURL: activeBaseURL,
        modelOverride,
      };
    }
    if (action === 'zero_key') {
      return {
        provider: 'custom',
        apiKey: POLLINATIONS_FREE_API_KEY,
        baseURL: POLLINATIONS_BASE_URL,
        modelOverride: POLLINATIONS_DEFAULT_MODEL,
        usedZeroKey: true,
      };
    }
    return null;
  }
}

/**
 * Interactive helper to switch AI provider on the fly (/provider command).
 */
export async function switchProviderInteractive(
  currentConfig: BanglaCLIConfig
): Promise<BanglaCLIConfig | null> {
  printSetupHeader('Switch AI Provider', 'Choose a free zero-key endpoint, local Ollama, or bring your own key');

  const ollamaModels = await detectLocalOllamaModels(600);
  const choice = await interactiveSelect<'zero_key' | 'gemini' | 'ollama' | 'openrouter' | 'custom'>({
    message: 'Choose provider to switch to:',
    initialValue:
      currentConfig.provider === 'custom' && currentConfig.baseURL?.includes('pollinations.ai')
        ? 'zero_key'
        : currentConfig.provider === 'custom' &&
          (currentConfig.baseURL?.includes('localhost') || currentConfig.baseURL?.includes('127.0.0.1'))
        ? 'ollama'
        : currentConfig.provider,
    options: [
      {
        value: 'zero_key',
        label: `${chalk.bold.hex('#00FF7F')('Free Zero-Key Starter AI')} ${chalk.green('[No Key Needed]')}`,
        hint: 'Built-in public AI (text.pollinations.ai • ~45s cooldown between replies)',
      },
      {
        value: 'gemini',
        label: `${chalk.bold('Google Gemini')} ${chalk.cyan('(1,500 Req/Day Free Tier)')}`,
        hint: 'Fastest coding speed & 1M context (requires free aistudio.google.com key)',
      },
      {
        value: 'ollama',
        label: `${chalk.bold('Local Ollama')} ${ollamaModels.length > 0 ? chalk.green(`[${ollamaModels.length} local model(s) ready]`) : chalk.green('[No Key Needed]')}`,
        hint: '100% unlimited offline coding via http://localhost:11434/v1',
      },
      {
        value: 'openrouter',
        label: `${chalk.bold('OpenRouter')} ${chalk.yellow('(Free Router & Models)')}`,
        hint: 'openrouter/free, Nemotron, Gemma 4 (requires openrouter.ai key)',
      },
      {
        value: 'custom',
        label: `${chalk.bold('Groq / DeepSeek / Custom URL')}`,
        hint: 'Groq (14,400/day free), DeepSeek, LM Studio, or any OpenAI-compatible URL',
      },
    ],
  });

  if (!choice) return null;

  if (choice === 'zero_key') {
    const zeroCfg = createZeroKeyConfig(currentConfig);
    saveConfig(zeroCfg);
    printSetupComplete(
      formatProviderLabel(zeroCfg),
      zeroCfg.model,
      'Note: Built-in free public AI has a ~45s cooldown between replies. Add a free Gemini key anytime with /config.'
    );
    return zeroCfg;
  }

  let provider: ProviderType =
    choice === 'ollama' || choice === 'custom' ? 'custom' : choice;
  let apiKey = '';
  let model = '';
  let baseURL: string | undefined =
    provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : undefined;

  if (choice === 'ollama') {
    baseURL = 'http://localhost:11434/v1';
    apiKey = 'ollama';
    const picked = await selectModelForProvider('custom', currentConfig.model, baseURL);
    if (!picked) return null;
    model = picked;
  } else {
    const saved = currentConfig.savedProviders?.[provider];
    const savedIsZeroOrLocal =
      provider === 'custom' &&
      saved?.baseURL &&
      (saved.baseURL.includes('pollinations.ai') || saved.baseURL.includes('localhost') || saved.baseURL.includes('127.0.0.1'));

    if (saved && saved.apiKey && !savedIsZeroOrLocal) {
      const useSaved = await interactiveSelect({
        message: `Saved credentials found for ${PROVIDER_LABELS[provider]}. Use saved configuration?`,
        options: [
          {
            value: 'yes',
            label: chalk.green(`✔ Use saved API key and model (${chalk.bold(saved.model)})`),
          },
          {
            value: 'change_model',
            label: chalk.cyan('Use saved API key, but choose a different model'),
          },
          {
            value: 'new_key',
            label: chalk.yellow('Enter new API key and configuration'),
          },
        ],
      });

      if (!useSaved) return null;

      if (useSaved === 'yes') {
        apiKey = saved.apiKey;
        model = saved.model;
        baseURL = saved.baseURL;
      } else if (useSaved === 'change_model') {
        apiKey = saved.apiKey;
        baseURL = saved.baseURL;
        const newModel = await selectModelForProvider(provider, saved.model, baseURL);
        if (!newModel) return null;
        model = newModel;
      } else {
        let keyUrl = PROVIDER_KEY_URLS[provider];
        if (provider === 'custom') {
          const preset = await selectCustomEndpointPreset(saved.baseURL);
          if (!preset) return null;
          baseURL = preset.baseURL;
          keyUrl = preset.keyUrl || keyUrl;
          if (baseURL.includes('localhost') || baseURL.includes('127.0.0.1')) {
            apiKey = 'ollama';
          }
        }
        if (!apiKey) {
          const verified = await promptVerifiedApiKey({
            provider,
            keyUrl,
            baseURL,
            allowZeroKeyFallback: false,
          });
          if (!verified) return null;
          provider = verified.provider;
          apiKey = verified.apiKey;
          baseURL = verified.baseURL;
          if (verified.modelOverride) model = verified.modelOverride;
        }
        if (!model) {
          const newModel = await selectModelForProvider(provider, saved.model || DEFAULT_MODELS[provider], baseURL);
          if (!newModel) return null;
          model = newModel;
        }
      }
    } else {
      const envKey = getEnvProviderKey(provider);
      let keyUrl = PROVIDER_KEY_URLS[provider];
      let defaultCustomModel = DEFAULT_MODELS[provider];

      if (provider === 'custom') {
        const preset = await selectCustomEndpointPreset();
        if (!preset) return null;
        baseURL = preset.baseURL;
        keyUrl = preset.keyUrl || keyUrl;
        defaultCustomModel = preset.defaultModel;
        if (baseURL.includes('localhost') || baseURL.includes('127.0.0.1')) {
          apiKey = 'ollama';
        }
      }

      if (!apiKey && envKey && provider !== 'custom') {
        apiKey = envKey;
      } else if (!apiKey) {
        const verified = await promptVerifiedApiKey({
          provider,
          keyUrl,
          baseURL,
          allowZeroKeyFallback: false,
        });
        if (!verified) return null;
        provider = verified.provider;
        apiKey = verified.apiKey;
        baseURL = verified.baseURL;
        if (verified.modelOverride) defaultCustomModel = verified.modelOverride;
      }

      const newModel = await selectModelForProvider(provider, defaultCustomModel, baseURL);
      if (!newModel) return null;
      model = newModel;
    }
  }

  const updatedConfig: BanglaCLIConfig = {
    ...currentConfig,
    provider,
    apiKey,
    model,
    ...(baseURL ? { baseURL } : {}),
    savedProviders: {
      ...currentConfig.savedProviders,
      [provider]: {
        apiKey,
        model,
        ...(baseURL ? { baseURL } : {}),
      },
    },
  };
  if (provider === 'gemini') {
    delete (updatedConfig as any).baseURL;
  }

  saveConfig(updatedConfig);
  printSetupComplete(formatProviderLabel(updatedConfig), model);
  return updatedConfig;
}

/**
 * Interactive onboarding / config wizard (Zero-Key Starter, Local Ollama, Gemini, OpenRouter, Custom).
 */
export async function promptConfig(
  isFirstTime = false,
  fallbackConfig?: BanglaCLIConfig
): Promise<BanglaCLIConfig> {
  printSetupHeader(
    isFirstTime ? 'Welcome to banglaCLI Setup' : 'banglaCLI Configuration Settings',
    isFirstTime
      ? 'Start immediately with Zero-Key Free AI, Local Ollama, or your own free Gemini/OpenRouter key'
      : 'Update your AI provider, API key, or default model'
  );

  const existingConfig = getConfig() || fallbackConfig;
  const ollamaModels = await detectLocalOllamaModels(600);

  const options: { value: 'free_starter' | 'gemini' | 'ollama' | 'openrouter' | 'custom'; label: string; hint: string }[] = [
    ...(ollamaModels.length > 0
      ? [
          {
            value: 'ollama' as const,
            label: `${chalk.bold.hex('#00FF7F')('Local Ollama')} ${chalk.green(`[✔ Detected ${ollamaModels.length} local model(s) • No Key Needed]`)}`,
            hint: `Ready now offline (${ollamaModels.slice(0, 3).join(', ')}) at localhost:11434`,
          },
        ]
      : []),
    {
      value: 'free_starter',
      label: `${chalk.bold.hex('#00FF7F')('Instant Free Zero-Key AI')} ${chalk.green('[No API Key Needed]')}`,
      hint: 'Start coding right away with zero sign-up (~45s cooldown between replies; add free Gemini key anytime via /config)',
    },
    {
      value: 'gemini',
      label: `${chalk.bold('Google Gemini')} ${chalk.cyan('[Free Key • 1,500 Req/Day Recommended]')}`,
      hint: 'Fastest coding speed & 1M context (gemini-3.5-flash-lite) • free key at aistudio.google.com/apikey',
    },
    ...(ollamaModels.length === 0
      ? [
          {
            value: 'ollama' as const,
            label: `${chalk.bold('Local Ollama')} ${chalk.green('[No Key Needed • 100% Offline]')}`,
            hint: 'Run Qwen Coder / DeepSeek locally with zero API limits at http://localhost:11434/v1',
          },
        ]
      : []),
    {
      value: 'openrouter',
      label: `${chalk.bold('OpenRouter')} ${chalk.yellow('[Needs Free Key • Multi-Model Router]')}`,
      hint: 'openrouter/free, Nemotron, Gemma 4 • get key at openrouter.ai/keys',
    },
    {
      value: 'custom',
      label: `${chalk.bold('Groq / DeepSeek / Custom Endpoint')}`,
      hint: '1-click setup for Groq (14,400/day free), DeepSeek (5M free tokens), LM Studio, or custom URL',
    },
  ];

  const defaultInitial: 'free_starter' | 'gemini' | 'ollama' | 'openrouter' | 'custom' =
    ollamaModels.length > 0 && isFirstTime
      ? 'ollama'
      : existingConfig?.provider === 'openrouter'
      ? 'openrouter'
      : existingConfig?.provider === 'gemini'
      ? 'gemini'
      : existingConfig?.baseURL?.includes('pollinations.ai')
      ? 'free_starter'
      : existingConfig?.baseURL?.includes('localhost') || existingConfig?.baseURL?.includes('127.0.0.1')
      ? 'ollama'
      : existingConfig?.provider === 'custom'
      ? 'custom'
      : 'free_starter';

  const choice = await interactiveSelect({
    message: 'Select how you want to run banglaCLI:',
    initialValue: defaultInitial,
    options,
  });

  if (!choice) {
    if (isFirstTime) {
      console.log(chalk.yellow('Setup cancelled.\n'));
      process.exit(0);
    }
    return existingConfig!;
  }

  // Instant Zero-Key Starter path
  if (choice === 'free_starter') {
    const zeroConfig = createZeroKeyConfig(existingConfig);
    saveConfig(zeroConfig);
    printSetupComplete(
      formatProviderLabel(zeroConfig),
      zeroConfig.model,
      'Tip: Free public AI has a ~45s cooldown per reply. Run /config anytime to add a free Google Gemini key for instant speed.'
    );
    return zeroConfig;
  }

  // Local Ollama 1-click path
  if (choice === 'ollama') {
    const baseURL = 'http://localhost:11434/v1';
    const pickedModel = await selectModelForProvider('custom', existingConfig?.model, baseURL);
    if (!pickedModel) {
      if (isFirstTime) {
        console.log(chalk.yellow('Setup cancelled.\n'));
        process.exit(0);
      }
      return existingConfig!;
    }
    const ollamaConfig: BanglaCLIConfig = {
      provider: 'custom',
      apiKey: 'ollama',
      model: pickedModel,
      baseURL,
      savedProviders: {
        ...existingConfig?.savedProviders,
        custom: {
          apiKey: 'ollama',
          model: pickedModel,
          baseURL,
        },
      },
    };
    saveConfig(ollamaConfig);
    printSetupComplete(formatProviderLabel(ollamaConfig), pickedModel);
    return ollamaConfig;
  }

  let provider: ProviderType = choice === 'custom' ? 'custom' : choice;
  const savedForProvider = existingConfig?.savedProviders?.[provider];
  let resolvedApiKey = '';
  let baseURL: string | undefined = provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : undefined;
  let defaultModelHint =
    existingConfig?.provider === provider
      ? existingConfig.model
      : savedForProvider?.model || DEFAULT_MODELS[provider];
  let keyUrl = PROVIDER_KEY_URLS[provider];

  const savedIsPlaceholder =
    provider === 'custom' &&
    savedForProvider?.baseURL &&
    (savedForProvider.baseURL.includes('pollinations.ai') ||
      savedForProvider.baseURL.includes('localhost') ||
      savedForProvider.baseURL.includes('127.0.0.1'));

  if (!isFirstTime && savedForProvider?.apiKey && !savedIsPlaceholder) {
    const keyChoice = await interactiveSelect<'saved' | 'new'>({
      message: `Saved API key found for ${PROVIDER_LABELS[provider]}.`,
      options: [
        { value: 'saved', label: chalk.green('✔ Keep existing API key') },
        { value: 'new', label: chalk.yellow('Enter a new API key') },
      ],
    });
    if (!keyChoice) {
      return existingConfig!;
    }
    if (keyChoice === 'saved') {
      resolvedApiKey = savedForProvider.apiKey;
      baseURL = savedForProvider.baseURL || baseURL;
    }
  }

  if (!resolvedApiKey && provider === 'custom') {
    const preset = await selectCustomEndpointPreset(savedForProvider?.baseURL || existingConfig?.baseURL);
    if (!preset) {
      if (isFirstTime) {
        console.log(chalk.yellow('Setup cancelled.\n'));
        process.exit(0);
      }
      return existingConfig!;
    }
    baseURL = preset.baseURL;
    defaultModelHint = preset.defaultModel;
    keyUrl = preset.keyUrl || keyUrl;
    if (baseURL.includes('localhost') || baseURL.includes('127.0.0.1')) {
      resolvedApiKey = 'ollama';
    }
  }

  if (!resolvedApiKey) {
    const verified = await promptVerifiedApiKey({
      provider,
      keyUrl,
      baseURL,
      allowZeroKeyFallback: isFirstTime,
    });
    if (!verified) {
      if (isFirstTime) {
        console.log(chalk.yellow('Setup cancelled.\n'));
        process.exit(0);
      }
      return existingConfig!;
    }
    provider = verified.provider;
    resolvedApiKey = verified.apiKey;
    baseURL = verified.baseURL;
    if (verified.modelOverride) {
      defaultModelHint = verified.modelOverride;
    }
    if (verified.usedZeroKey) {
      const zeroCfg = createZeroKeyConfig(existingConfig);
      saveConfig(zeroCfg);
      printSetupComplete(
        formatProviderLabel(zeroCfg),
        zeroCfg.model,
        'Note: Built-in free public AI has a ~45s cooldown between replies. Run /config anytime to add a key.'
      );
      return zeroCfg;
    }
  }

  const chosenModel = await selectModelForProvider(provider, defaultModelHint, baseURL);
  if (!chosenModel) {
    if (isFirstTime) {
      console.log(chalk.yellow('Setup cancelled.\n'));
      process.exit(0);
    }
    return existingConfig!;
  }

  const finalConfig: BanglaCLIConfig = {
    provider,
    apiKey: resolvedApiKey,
    model: chosenModel,
    ...(baseURL ? { baseURL } : {}),
    savedProviders: {
      ...existingConfig?.savedProviders,
      [provider]: {
        apiKey: resolvedApiKey,
        model: chosenModel,
        ...(baseURL ? { baseURL } : {}),
      },
    },
  };
  if (provider === 'gemini') {
    delete (finalConfig as any).baseURL;
  }

  saveConfig(finalConfig);
  printSetupComplete(formatProviderLabel(finalConfig), chosenModel);
  return finalConfig;
}
