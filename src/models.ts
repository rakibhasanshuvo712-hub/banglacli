import chalk from 'chalk';
import * as p from '@clack/prompts';
import { ProviderType, BanglaCLIConfig, saveConfig, PROVIDER_LABELS, PROVIDER_KEY_URLS } from './config.js';

export interface AgentModelPreset {
  id: string;
  name: string;
  provider: ProviderType;
  category: 'free' | 'gemini' | 'flagship' | 'local';
  description: string;
  badge: string;
  baseURL?: string;
}

export const AGENT_MODELS: AgentModelPreset[] = [
  // 🌟 100% Free Models (Tested & Verified)
  {
    id: 'openrouter/free',
    name: 'OpenRouter Free Agent (🌟 Recommended)',
    provider: 'openrouter',
    category: 'free',
    description: 'Auto-routes to the best active free coding model with tool calling. 0% downtime.',
    badge: '100% Free',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'google/gemma-4-31b-it:free',
    name: 'Google Gemma 4 31B Free Agent',
    provider: 'openrouter',
    category: 'free',
    description: "Google's 31B open model served on OpenRouter free tier. Great for code & chat.",
    badge: '100% Free',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'nvidia/nemotron-3.5-lightning:free',
    name: 'NVIDIA Nemotron 3.5 Lightning Free',
    provider: 'openrouter',
    category: 'free',
    description: 'High-speed coding and logic completions from NVIDIA.',
    badge: '100% Free',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'inclusionai/ling-3.2-flash:free',
    name: 'Ling 3.2 Flash Free Agent',
    provider: 'openrouter',
    category: 'free',
    description: 'Fast, lightweight free coding completions.',
    badge: '100% Free',
    baseURL: 'https://openrouter.ai/api/v1',
  },

  // 🔷 Google Gemini Free Suite
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash (Fast & 1M Tokens)',
    provider: 'gemini',
    category: 'gemini',
    description: 'Flagship Google model with 1,048,576 token context and 15 RPM free.',
    badge: 'Gemini Free',
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash (Ultra-Stable)',
    provider: 'gemini',
    category: 'gemini',
    description: 'Rock-solid stability, massive global server clusters, 1M token context.',
    badge: 'Gemini Free',
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash (Latest Preview)',
    provider: 'gemini',
    category: 'gemini',
    description: 'Latest Google model (auto-fails over to 2.0-flash if 503 occurs).',
    badge: 'Gemini Free',
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro (Complex Reasoning)',
    provider: 'gemini',
    category: 'gemini',
    description: '2 Million token context for massive multi-file projects.',
    badge: 'Gemini Pro',
  },

  // 🚀 Pro Flagship Coding Models (OpenRouter BYOK)
  {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek V3 (Top Coding Benchmark)',
    provider: 'openrouter',
    category: 'flagship',
    description: 'Leading 671B parameter coding model with unbeatable price-to-performance.',
    badge: 'Pro Coding',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'deepseek/deepseek-r1',
    name: 'DeepSeek R1 (Chain-of-Thought Reasoning)',
    provider: 'openrouter',
    category: 'flagship',
    description: 'Advanced reasoning model for complex algorithms and deep debugging.',
    badge: 'Reasoning',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet (Gold Standard)',
    provider: 'openrouter',
    category: 'flagship',
    description: "Industry gold standard for autonomous full-stack coding and architecture.",
    badge: 'Top Tier',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'openai/gpt-4o',
    name: 'OpenAI GPT-4o Agent',
    provider: 'openrouter',
    category: 'flagship',
    description: "OpenAI's smart multi-modal flagship coding agent.",
    badge: 'Top Tier',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'qwen/qwen-2.5-coder-32b-instruct',
    name: 'Qwen 2.5 Coder 32B Instruct',
    provider: 'openrouter',
    category: 'flagship',
    description: 'Specialized programming model optimized for full-stack tasks.',
    badge: 'Coder SOTA',
    baseURL: 'https://openrouter.ai/api/v1',
  },

  // 💻 Local Offline Models (Ollama)
  {
    id: 'qwen2.5-coder',
    name: 'Local Ollama: Qwen 2.5 Coder',
    provider: 'custom',
    category: 'local',
    description: 'Runs 100% offline and free on your local machine via Ollama.',
    badge: 'Local Offline',
    baseURL: 'http://localhost:11434/v1',
  },
  {
    id: 'deepseek-r1',
    name: 'Local Ollama: DeepSeek R1',
    provider: 'custom',
    category: 'local',
    description: 'Local reasoning model on Ollama (http://localhost:11434/v1).',
    badge: 'Local Offline',
    baseURL: 'http://localhost:11434/v1',
  },
];

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
        label: `${chalk.bold.green('🌟 100% Free Tier Agents')} ${chalk.dim('(OpenRouter Free, Gemma, Nemotron)')}`,
        hint: 'Zero cost, no credit card required',
      },
      {
        value: 'gemini',
        label: `${chalk.bold.yellow('🔷 Google Gemini Suite')} ${chalk.dim('(Gemini 2.0 Flash, 1.5 Flash, Pro)')}`,
        hint: '1M tokens, 15 RPM free tier',
      },
      {
        value: 'flagship',
        label: `${chalk.bold.cyan('🚀 Flagship Coding Models')} ${chalk.dim('(DeepSeek V3, Claude 3.5, GPT-4o)')}`,
        hint: 'OpenRouter BYOK with top coding benchmarks',
      },
      {
        value: 'local',
        label: `${chalk.bold.magenta('💻 Local Offline Models')} ${chalk.dim('(Ollama: Qwen Coder, DeepSeek R1)')}`,
        hint: 'Runs offline on localhost:11434',
      },
      {
        value: 'all',
        label: `${chalk.bold('📋 Browse All Models')}`,
        hint: 'View complete list of all presets',
      },
      {
        value: 'custom',
        label: `${chalk.bold('✏️  Enter Custom Model ID Manually')}`,
        hint: 'Type any model slug (e.g. mistralai/mistral-large)',
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

  // Filter models by category
  const modelsToShow =
    categoryChoice === 'all'
      ? AGENT_MODELS
      : AGENT_MODELS.filter((m) => m.category === categoryChoice);

  const modelOptions = modelsToShow.map((m) => ({
    value: m.id,
    label: `${chalk.bold(m.name)} ${chalk.dim(`[${m.badge}]`)}`,
    hint: m.description,
  }));

  const selectedModelId = (await p.select({
    message: chalk.cyan('Select AI Model:'),
    initialValue: currentConfig.model,
    options: modelOptions,
  })) as string;

  if (p.isCancel(selectedModelId)) return null;

  const preset = AGENT_MODELS.find((m) => m.id === selectedModelId);
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
