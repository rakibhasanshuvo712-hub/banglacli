import chalk from 'chalk';
import * as p from '@clack/prompts';
import { ProviderType, BanglaCLIConfig, saveConfig, PROVIDER_LABELS, PROVIDER_KEY_URLS } from './config.js';
import { createSpinner } from './ui.js';

export interface AgentModelPreset {
  id: string;
  name: string;
  provider: ProviderType;
  category: 'free' | 'gemini' | 'groq' | 'local';
  description: string;
  badge: string;
  baseURL?: string;
  contextLength?: string;
}

export const AGENT_MODELS: AgentModelPreset[] = [
  // ==========================================
  // 🌟 100% Free OpenRouter Models (Zero Cost)
  // ==========================================
  {
    id: 'openrouter/free',
    name: 'OpenRouter Free Agent (🌟 Recommended)',
    provider: 'openrouter',
    category: 'free',
    description: 'Auto-routes to the best active free coding model with tool calling. 0% downtime.',
    badge: '100% Free',
    contextLength: '200k',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'particle-ai/particle-1:free',
    name: 'Particle-1 Agentic Coder (1M Context)',
    provider: 'openrouter',
    category: 'free',
    description: 'Specialized token-efficient agentic coding model from Particle AI with 1M tokens.',
    badge: '1M Free',
    contextLength: '1,048,576',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    name: 'NVIDIA Nemotron 3 Ultra 550B (1M Context)',
    provider: 'openrouter',
    category: 'free',
    description: 'Massive 550B parameter frontier reasoning & orchestration model from NVIDIA.',
    badge: '550B Free',
    contextLength: '1,000,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'google/gemma-4-31b-it:free',
    name: 'Google Gemma 4 31B Instruct (Free)',
    provider: 'openrouter',
    category: 'free',
    description: "Google DeepMind's 30.7B dense multimodal coding & instruction model.",
    badge: '31B Free',
    contextLength: '262,144',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'google/gemma-4-26b-a4b-it:free',
    name: 'Google Gemma 4 26B A4B MoE (Free)',
    provider: 'openrouter',
    category: 'free',
    description: 'Fast instruction-tuned Mixture-of-Experts coding model from Google.',
    badge: 'MoE Free',
    contextLength: '262,144',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'nvidia/nemotron-3.5-lightning:free',
    name: 'NVIDIA Nemotron 3.5 Lightning (1M Context)',
    provider: 'openrouter',
    category: 'free',
    description: 'Ultra-fast open mixture-of-experts model optimized for speed & code.',
    badge: 'Fast 1M',
    contextLength: '1,000,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'nvidia/nemotron-3.5-super-vl:free',
    name: 'NVIDIA Nemotron 3.5 Super VL (1M Context)',
    provider: 'openrouter',
    category: 'free',
    description: 'Multimodal vision and code reasoning model from NVIDIA.',
    badge: 'Vision 1M',
    contextLength: '1,000,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    name: 'NVIDIA Nemotron 3 Nano Omni 30B (Free)',
    provider: 'openrouter',
    category: 'free',
    description: '30B-A3B reasoning agent model designed for agentic workflows.',
    badge: 'Reasoning',
    contextLength: '256,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'baidu/ernie-5.5-flash-preview:free',
    name: 'Baidu ERNIE 5.5 Flash (1M Context)',
    provider: 'openrouter',
    category: 'free',
    description: "Baidu's latest flagship foundation model with 1 Million token context.",
    badge: '1M Free',
    contextLength: '1,024,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'inclusionai/ling-3.2-flash:free',
    name: 'InclusionAI Ling 3.2 Flash (1M Context)',
    provider: 'openrouter',
    category: 'free',
    description: 'Hybrid reasoning model with 1 Million token context window.',
    badge: '1M Free',
    contextLength: '1,048,576',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'liquid/lfm-3-1.7b:free',
    name: 'LiquidAI LFM3 1.7B (256k Context)',
    provider: 'openrouter',
    category: 'free',
    description: 'Ultra-lightweight high-speed neural model with 256k context.',
    badge: 'Lightweight',
    contextLength: '262,144',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'recursive/flint-v1.0:free',
    name: 'Recursive Flint MoE (Free)',
    provider: 'openrouter',
    category: 'free',
    description: 'Open mixture-of-experts model with 262k token context.',
    badge: 'MoE Free',
    contextLength: '262,144',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'dots-studio/dots-3-note-preview:free',
    name: 'Dots3 Note Preview (512k Context)',
    provider: 'openrouter',
    category: 'free',
    description: 'Specialized 512,000 token context reasoning and code preview model.',
    badge: '512k Free',
    contextLength: '512,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },

  // ==========================================
  // 🔷 Google Gemini Suite (100% Free Tier: 1M Tokens, 1,500 Req/Day)
  // ==========================================
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash-Lite (🌟 100% Free & Active)',
    provider: 'gemini',
    category: 'gemini',
    description: 'Active free Google model with 1M context, high speed & 1,500 req/day free.',
    badge: '100% Free',
    contextLength: '1,048,576',
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash-Lite (Fast & Efficient)',
    provider: 'gemini',
    category: 'gemini',
    description: 'Cost-efficient, low-latency Gemini Flash-Lite model.',
    badge: '100% Free',
    contextLength: '1,048,576',
  },
  {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash (Next-Gen Flash)',
    provider: 'gemini',
    category: 'gemini',
    description: 'Next-generation Gemini Flash model with 1M tokens.',
    badge: '100% Free',
    contextLength: '1,048,576',
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash (Latest Preview)',
    provider: 'gemini',
    category: 'gemini',
    description: 'Latest Google model (auto-fails over to 3.5-flash-lite if 503 occurs).',
    badge: '100% Free',
    contextLength: '1,048,576',
  },

  // ==========================================
  // ⚡ Groq Cloud Free Tier (14,400 Req/Day Free)
  // ==========================================
  {
    id: 'llama-3.3-70b-versatile',
    name: 'Groq: Llama 3.3 70B Versatile (Free Tier)',
    provider: 'custom',
    category: 'groq',
    description: '500+ tokens/sec inference via Groq Cloud free tier (14,400 requests/day).',
    badge: 'Groq Free',
    contextLength: '128,000',
    baseURL: 'https://api.groq.com/openai/v1',
  },
  {
    id: 'qwen-2.5-coder-32b',
    name: 'Groq: Qwen 2.5 Coder 32B (Free Tier)',
    provider: 'custom',
    category: 'groq',
    description: 'Ultra-fast specialized coding agent via Groq Cloud free tier.',
    badge: 'Groq Free',
    contextLength: '32,768',
    baseURL: 'https://api.groq.com/openai/v1',
  },
  {
    id: 'deepseek-r1-distill-llama-70b',
    name: 'Groq: DeepSeek R1 Distill 70B (Free Tier)',
    provider: 'custom',
    category: 'groq',
    description: 'High-speed reasoning model on Groq Cloud free tier.',
    badge: 'Groq Free',
    contextLength: '128,000',
    baseURL: 'https://api.groq.com/openai/v1',
  },
  {
    id: 'llama-3.1-8b-instant',
    name: 'Groq: Llama 3.1 8B Instant (Free Tier)',
    provider: 'custom',
    category: 'groq',
    description: 'Blazing fast low-latency model on Groq (14,400 requests/day free).',
    badge: 'Groq Free',
    contextLength: '128,000',
    baseURL: 'https://api.groq.com/openai/v1',
  },
  {
    id: 'gemma2-9b-it',
    name: 'Groq: Gemma 2 9B IT (Free Tier)',
    provider: 'custom',
    category: 'groq',
    description: "Google's lightweight open model hosted at top speed on Groq Cloud free tier.",
    badge: 'Groq Free',
    contextLength: '8,192',
    baseURL: 'https://api.groq.com/openai/v1',
  },

  // ==========================================
  // ⚡ Cerebras Cloud Free Tier (1,800+ Tokens/Sec)
  // ==========================================
  {
    id: 'llama3.3-70b',
    name: 'Cerebras: Llama 3.3 70B (Free Tier)',
    provider: 'custom',
    category: 'groq',
    description: "World's fastest inference (1,000+ tokens/sec) on Cerebras Cloud free tier.",
    badge: 'Cerebras Free',
    contextLength: '128,000',
    baseURL: 'https://api.cerebras.ai/v1',
  },
  {
    id: 'llama3.1-8b',
    name: 'Cerebras: Llama 3.1 8B (Free Tier)',
    provider: 'custom',
    category: 'groq',
    description: 'Ultra-high speed 1,800+ tokens/sec on Cerebras Cloud free tier.',
    badge: 'Cerebras Free',
    contextLength: '128,000',
    baseURL: 'https://api.cerebras.ai/v1',
  },

  // ==========================================
  // 💻 Local Offline Models (Ollama)
  // ==========================================
  {
    id: 'qwen2.5-coder',
    name: 'Local Ollama: Qwen 2.5 Coder',
    provider: 'custom',
    category: 'local',
    description: 'Runs 100% offline and free on your local machine via Ollama.',
    badge: 'Local Offline',
    contextLength: 'Local RAM',
    baseURL: 'http://localhost:11434/v1',
  },
  {
    id: 'deepseek-r1',
    name: 'Local Ollama: DeepSeek R1',
    provider: 'custom',
    category: 'local',
    description: 'Local reasoning model on Ollama (http://localhost:11434/v1).',
    badge: 'Local Offline',
    contextLength: 'Local RAM',
    baseURL: 'http://localhost:11434/v1',
  },
];

/**
 * Intelligent Auto-Cascade Chains:
 * If tokens run out (429) or high demand (503) occurs, the agent automatically
 * cascades to the next best intelligent free model seamlessly.
 */
export const OPENROUTER_FREE_CASCADE_CHAIN = [
  'openrouter/free',
  'particle-ai/particle-1:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3.5-lightning:free',
  'baidu/ernie-5.5-flash-preview:free',
  'inclusionai/ling-3.2-flash:free',
  'dots-studio/dots-3-note-preview:free',
  'google/gemma-4-26b-a4b-it:free',
  'liquid/lfm-3-1.7b:free',
  'recursive/flint-v1.0:free',
];

export const GEMINI_CASCADE_CHAIN = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.8-flash',
];

/**
 * Fetch live free models from OpenRouter API in real time.
 */
export async function fetchLiveOpenRouterFreeModels(): Promise<AgentModelPreset[]> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'User-Agent': 'banglaCLI' },
    });
    if (!res.ok) return [];

    const data = (await res.json()) as any;
    const rawList = data?.data || [];

    const freeModels: AgentModelPreset[] = rawList
      .filter(
        (m: any) =>
          m.id?.endsWith(':free') ||
          (m.pricing && m.pricing.prompt === '0' && m.pricing.completion === '0')
      )
      .map((m: any) => ({
        id: m.id,
        name: m.name || m.id,
        provider: 'openrouter' as ProviderType,
        category: 'free' as const,
        description: m.description ? m.description.slice(0, 80) + '...' : 'Free model on OpenRouter',
        badge: 'Live Free',
        contextLength: m.context_length ? `${Math.round(m.context_length / 1000)}k` : 'Free',
        baseURL: 'https://openrouter.ai/api/v1',
      }));

    return freeModels;
  } catch {
    return [];
  }
}

/**
 * OpenCode-style interactive AI Agent Model Selector.
 */
export async function selectAgentModelInteractive(
  currentConfig: BanglaCLIConfig
): Promise<BanglaCLIConfig | null> {
  p.intro(chalk.bold.hex('#00FF7F')('🤖 OpenCode AI Agent & Model Selector'));

  // 1. Choose Category
  const categoryChoice = (await p.select({
    message: chalk.cyan('Select Agent Category:'),
    options: [
      {
        value: 'free',
        label: `${chalk.bold.green('🌟 100% Free Tier Agents')} ${chalk.dim('(OpenRouter Free, Particle-1, Gemma, Nemotron)')}`,
        hint: '13+ verified zero-plan free models',
      },
      {
        value: 'live_sync',
        label: `${chalk.bold.hex('#00FFFF')('🔄 Live Sync: Fetch ALL Free Models from OpenRouter')} ${chalk.dim('(Real-time)')}`,
        hint: 'Queries OpenRouter API live for every free model active right now',
      },
      {
        value: 'gemini',
        label: `${chalk.bold.yellow('🔷 Google Gemini Free Suite')} ${chalk.dim('(Gemini 3.5/3.1 Flash-Lite, 3.5/3.8 Flash)')}`,
        hint: '1M tokens, 1,500 req/day free tier',
      },
      {
        value: 'groq',
        label: `${chalk.bold.hex('#FF9900')('⚡ Groq Cloud Free Tier')} ${chalk.dim('(Llama 3.3 70B, Qwen Coder)')}`,
        hint: '14,400 requests/day, 500+ tokens/sec',
      },
      {
        value: 'local',
        label: `${chalk.bold.magenta('💻 Local Offline Models')} ${chalk.dim('(Ollama: Qwen Coder, DeepSeek R1)')}`,
        hint: 'Runs offline on localhost:11434',
      },
      {
        value: 'all',
        label: `${chalk.bold('📋 Browse All Zero-Plan Free Models')}`,
        hint: 'View complete list of all presets',
      },
      {
        value: 'custom',
        label: `${chalk.bold('✏️  Enter Custom Model ID Manually')}`,
        hint: 'Type any model slug (e.g. mistralai/mistral-large:free)',
      },
    ],
  })) as string;

  if (p.isCancel(categoryChoice)) return null;

  // Handle custom input
  if (categoryChoice === 'custom') {
    const customModel = (await p.text({
      message: chalk.cyan('Enter model ID:'),
      initialValue: currentConfig.model,
      validate: (v) => (!v || v.trim().length === 0 ? 'Model ID cannot be empty!' : undefined),
    })) as string;

    if (p.isCancel(customModel)) return null;

    currentConfig.model = customModel.trim();
    saveConfig(currentConfig);
    p.outro(chalk.green(`✔ Active Agent Model set to: ${chalk.bold(currentConfig.model)}`));
    return currentConfig;
  }

  // Handle Live Sync from OpenRouter API
  let modelsToShow: AgentModelPreset[] = [];

  if (categoryChoice === 'live_sync') {
    const spinner = createSpinner('Scanning OpenRouter API for all active free models in real-time...');
    spinner.start();
    const liveModels = await fetchLiveOpenRouterFreeModels();
    spinner.stop();

    if (liveModels.length > 0) {
      console.log(chalk.green(`✔ Found ${liveModels.length} active free models on OpenRouter right now!\n`));
      modelsToShow = liveModels;
    } else {
      console.log(chalk.yellow('⚠️ Could not connect to OpenRouter live API. Falling back to built-in presets.\n'));
      modelsToShow = AGENT_MODELS.filter((m) => m.category === 'free');
    }
  } else if (categoryChoice === 'all') {
    modelsToShow = AGENT_MODELS;
  } else {
    modelsToShow = AGENT_MODELS.filter((m) => m.category === categoryChoice);
  }

  const modelOptions = modelsToShow.map((m) => ({
    value: m.id,
    label: `${chalk.bold(m.name)} ${chalk.dim(`[${m.badge || m.category}]`)} ${m.contextLength ? chalk.cyan(`(${m.contextLength})`) : ''}`,
    hint: m.description,
  }));

  const selectedModelId = (await p.select({
    message: chalk.cyan('Select AI Model:'),
    initialValue: currentConfig.model,
    options: modelOptions,
  })) as string;

  if (p.isCancel(selectedModelId)) return null;

  const preset =
    modelsToShow.find((m) => m.id === selectedModelId) ||
    AGENT_MODELS.find((m) => m.id === selectedModelId);

  if (!preset) return null;

  const targetProvider = preset.provider;
  let targetApiKey = currentConfig.apiKey;
  let targetBaseURL = preset.baseURL || currentConfig.baseURL;

  // Check if provider switch is required
  if (targetProvider !== currentConfig.provider) {
    const saved = currentConfig.savedProviders?.[targetProvider];

    if (saved && saved.apiKey) {
      targetApiKey = saved.apiKey;
      targetBaseURL = preset.baseURL || saved.baseURL;
    } else {
      // Need API key for the new provider
      p.note(
        `${chalk.white('Get key for ' + PROVIDER_LABELS[targetProvider] + ':')}\n` +
          `${chalk.bold.underline.cyan(PROVIDER_KEY_URLS[targetProvider])}\n`,
        chalk.bold('API Key Required')
      );

      const enteredKey = (await p.password({
        message: chalk.cyan(`Enter API Key for ${PROVIDER_LABELS[targetProvider]}:`),
        validate: (v) => (!v || v.trim().length === 0 ? 'Key cannot be empty!' : undefined),
      })) as string;

      if (p.isCancel(enteredKey)) return null;
      targetApiKey = enteredKey.trim();
    }
  }

  const updatedConfig: BanglaCLIConfig = {
    ...currentConfig,
    provider: targetProvider,
    apiKey: targetApiKey,
    model: preset.id,
    baseURL: targetBaseURL,
    savedProviders: {
      ...currentConfig.savedProviders,
      [targetProvider]: {
        apiKey: targetApiKey,
        model: preset.id,
        baseURL: targetBaseURL,
      },
    },
  };

  saveConfig(updatedConfig);

  p.outro(
    chalk.green(
      `✔ Active Agent Model: ${chalk.bold(preset.name)}\n` +
        `Provider: ${chalk.bold(PROVIDER_LABELS[targetProvider])}\n` +
        `Model ID: ${chalk.cyan(preset.id)}`
    )
  );

  return updatedConfig;
}
