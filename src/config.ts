import Conf from 'conf';
import * as p from '@clack/prompts';
import { interactiveSelect } from './prompt.js';
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
  custom: 'https://platform.deepseek.com/api_keys (or your provider console)',
};

/**
 * Read provider API keys from environment variables when available.
 */
export function getEnvProviderKey(provider: ProviderType): string | undefined {
  if (provider === 'gemini') {
    return (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim() || undefined;
  }
  if (provider === 'openrouter') {
    return process.env.OPENROUTER_API_KEY?.trim() || undefined;
  }
  if (provider === 'custom') {
    return (process.env.GROQ_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY)?.trim() || undefined;
  }
  return undefined;
}

/**
 * Retrieve saved configuration (hydrating any available environment API keys).
 */
export function getConfig(): BanglaCLIConfig | undefined {
  let cfg = configStore.get('config');

  const envGemini = getEnvProviderKey('gemini');
  const envOpenRouter = getEnvProviderKey('openrouter');
  const envGroq = process.env.GROQ_API_KEY?.trim() || undefined;
  const envDeepSeek = process.env.DEEPSEEK_API_KEY?.trim() || undefined;

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
 * Interactive model selection helper for a provider.
 */
async function selectModelForProvider(
  provider: ProviderType,
  currentModel?: string
): Promise<string | null> {
  if (provider === 'gemini') {
    const geminiOptions = [
      { value: 'gemini-3.5-flash-lite', label: 'gemini-3.5-flash-lite (🌟 Google Recommended - 1M Tokens, Stable & Fast)' },
      { value: 'gemini-3.5-flash', label: 'gemini-3.5-flash (Next-Gen Flash - 1M Context Frontier)' },
      { value: 'gemini-3.8-flash', label: 'gemini-3.8-flash (Latest Preview from Google AI Studio)' },
      { value: 'gemini-3.1-flash-lite', label: 'gemini-3.1-flash-lite (High-Throughput Lightweight Coder)' },
      { value: 'gemini-2.0-flash', label: 'gemini-2.0-flash (Legacy Flash - Auto-maps to 3.5)' },
      { value: 'gemini-1.5-flash', label: 'gemini-1.5-flash (Legacy Flash 1.5 - Auto-maps to 3.5)' },
      { value: 'gemini-1.5-pro', label: 'gemini-1.5-pro (Legacy Pro 1.5 - Auto-maps to 3.5)' },
      { value: 'custom_input', label: 'Enter custom model name manually...' },
    ];

    const hasMatch = geminiOptions.some((o) => o.value === currentModel);
    const initialVal = hasMatch ? currentModel : geminiOptions[0].value;

    const modelChoice = await interactiveSelect({
      message: 'Select Gemini Model:',
      initialValue: initialVal,
      options: geminiOptions,
    });

    if (!modelChoice || p.isCancel(modelChoice)) return null;

    if (modelChoice === 'custom_input') {
      const customModel = (await p.text({
        message: 'Enter Gemini model ID:',
        initialValue: 'gemini-3.5-flash-lite',
      })) as string;
      if (p.isCancel(customModel)) return null;
      return customModel.trim();
    }
    return modelChoice;
  } else if (provider === 'openrouter') {
    const openrouterOptions = [
      { value: 'openrouter/free', label: 'openrouter/free (🌟 Recommended - Best Free Model with Tools)' },
      { value: 'nvidia/nemotron-3.5-lightning:free', label: 'nvidia/nemotron-3.5-lightning:free (Free Fast 1M Model)' },
      { value: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: 'nvidia/nemotron-3-ultra-550b-a55b:free (550B MoE 1M)' },
      { value: 'nvidia/nemotron-3.5-super-vl:free', label: 'nvidia/nemotron-3.5-super-vl:free (Vision + Code 1M Free)' },
      { value: 'particle-ai/particle-1:free', label: 'particle-ai/particle-1:free (1M Context Free Coder)' },
      { value: 'google/gemma-4-31b-it:free', label: 'google/gemma-4-31b-it:free (Free 31B Coding & Chat)' },
      { value: 'google/gemma-4-26b-a4b-it:free', label: 'google/gemma-4-26b-a4b-it:free (Free Gemma MoE)' },
      { value: 'inclusionai/ling-3.2-flash:free', label: 'inclusionai/ling-3.2-flash:free (1M Hybrid Reasoner Free)' },
      { value: 'baidu/ernie-5.5-flash-preview:free', label: 'baidu/ernie-5.5-flash-preview:free (1M Flash Free)' },
      { value: 'recursive/flint-v1.0:free', label: 'recursive/flint-v1.0:free (MoE 262k Free)' },
      { value: 'custom_input', label: 'Enter custom OpenRouter model name...' },
    ];

    const hasMatch = openrouterOptions.some((o) => o.value === currentModel);
    const initialVal = hasMatch ? currentModel : openrouterOptions[0].value;

    const modelChoice = await interactiveSelect({
      message: 'Select OpenRouter Model:',
      initialValue: initialVal,
      options: openrouterOptions,
    });

    if (!modelChoice || p.isCancel(modelChoice)) return null;

    if (modelChoice === 'custom_input') {
      const customModel = (await p.text({
        message: 'Enter model ID (e.g. openrouter/free):',
        initialValue: 'openrouter/free',
      })) as string;
      if (p.isCancel(customModel)) return null;
      return customModel.trim();
    }
    return modelChoice;
  } else {
    const customModel = (await p.text({
      message: chalk.cyan('Enter model name (e.g., deepseek-chat, llama3, qwen2.5-coder):'),
      initialValue: currentModel || 'deepseek-chat',
      validate: (v) => (!v || v.trim().length === 0 ? 'Model name cannot be empty!' : undefined),
    })) as string;

    if (p.isCancel(customModel)) return null;
    return customModel.trim();
  }
}

/**
 * Interactive helper to switch AI provider on the fly (/provider command).
 */
export async function switchProviderInteractive(
  currentConfig: BanglaCLIConfig
): Promise<BanglaCLIConfig | null> {
  p.intro(chalk.bold.hex('#00FF7F')('🔄 Switch AI Provider'));

  const provider = await interactiveSelect<ProviderType>({
    message: 'Choose provider to switch to:',
    initialValue: currentConfig.provider,
    options: [
      {
        value: 'gemini',
        label: `${chalk.bold('Google Gemini')} ${chalk.green('(Free Tier - Fast & High Quota)')}`,
        hint: currentConfig.provider === 'gemini' ? 'Currently active' : undefined,
      },
      {
        value: 'openrouter',
        label: `${chalk.bold('OpenRouter')} ${chalk.yellow('(Free Models: DeepSeek, GLM, etc.)')}`,
        hint: currentConfig.provider === 'openrouter' ? 'Currently active' : undefined,
      },
      {
        value: 'custom',
        label: `${chalk.bold('Custom OpenAI-Compatible')} ${chalk.magenta('(DeepSeek, Groq, Ollama, etc.)')}`,
        hint: currentConfig.provider === 'custom' ? 'Currently active' : undefined,
      },
    ],
  });

  if (!provider || p.isCancel(provider)) {
    return null;
  }

  const saved = currentConfig.savedProviders?.[provider];

  let apiKey: string;
  let model: string;
  let baseURL: string | undefined = provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : undefined;

  if (saved && saved.apiKey) {
    const useSaved = await interactiveSelect({
      message: `Saved credentials found for ${PROVIDER_LABELS[provider]}. Use saved configuration?`,
      options: [
        {
          value: 'yes',
          label: chalk.green(`✔ Use saved API key and model (${chalk.bold(saved.model)})`),
        },
        {
          value: 'change_model',
          label: chalk.cyan(`Use saved API key, but choose a different model`),
        },
        {
          value: 'new_key',
          label: chalk.yellow(`Enter new API key and configuration`),
        },
      ],
    });

    if (!useSaved || p.isCancel(useSaved)) return null;

    if (useSaved === 'yes') {
      apiKey = saved.apiKey;
      model = saved.model;
      baseURL = saved.baseURL;
    } else if (useSaved === 'change_model') {
      apiKey = saved.apiKey;
      baseURL = saved.baseURL;
      const newModel = await selectModelForProvider(provider, saved.model);
      if (!newModel) return null;
      model = newModel;
    } else {
      // Re-enter key
      p.note(
        `${chalk.white('Get your free API key here:')}\n` +
          `${chalk.bold.underline.cyan(PROVIDER_KEY_URLS[provider])}\n`,
        chalk.bold('API Key Instructions')
      );

      const enteredKey = (await p.password({
        message: chalk.cyan(`Enter your ${PROVIDER_LABELS[provider]} API Key:`),
        validate: (v) => (!v || v.trim().length === 0 ? 'API Key cannot be empty!' : undefined),
      })) as string;

      if (p.isCancel(enteredKey)) return null;
      apiKey = enteredKey.trim();

      if (provider === 'custom') {
        const customURL = (await p.text({
          message: chalk.cyan('Enter baseURL:'),
          initialValue: saved.baseURL || 'https://api.deepseek.com/v1',
        })) as string;
        if (p.isCancel(customURL)) return null;
        baseURL = customURL.trim();
      }

      const newModel = await selectModelForProvider(provider, saved.model || DEFAULT_MODELS[provider]);
      if (!newModel) return null;
      model = newModel;
    }
  } else {
    // Check environment variable before prompting
    const envKey = getEnvProviderKey(provider);

    if (provider === 'custom') {
      const customURL = (await p.text({
        message: chalk.cyan('Enter custom baseURL (e.g. https://api.groq.com/openai/v1 or http://localhost:11434/v1):'),
        initialValue: 'http://localhost:11434/v1',
      })) as string;
      if (p.isCancel(customURL)) return null;
      baseURL = customURL.trim();
    }

    if (provider === 'custom' && baseURL?.includes('localhost')) {
      apiKey = 'ollama';
    } else if (envKey) {
      apiKey = envKey;
    } else {
      // No saved or env credentials for this provider
      p.note(
        `${chalk.white('Get your free API key here:')}\n` +
          `${chalk.bold.underline.cyan(PROVIDER_KEY_URLS[provider])}\n\n` +
          `${chalk.gray('ℹ️ 100% BYOK - Key will be saved locally on your device.')}`,
        chalk.bold('API Key Required')
      );

      const enteredKey = (await p.password({
        message: chalk.cyan(`Enter your ${PROVIDER_LABELS[provider]} API Key:`),
        validate: (v) => (!v || v.trim().length === 0 ? 'API Key cannot be empty!' : undefined),
      })) as string;

      if (p.isCancel(enteredKey)) return null;
      apiKey = enteredKey.trim();
    }

    const newModel = await selectModelForProvider(provider, DEFAULT_MODELS[provider]);
    if (!newModel) return null;
    model = newModel;
  }

  const updatedConfig: BanglaCLIConfig = {
    ...currentConfig,
    provider,
    apiKey,
    model,
    baseURL,
    savedProviders: {
      ...currentConfig.savedProviders,
      [provider]: {
        apiKey,
        model,
        baseURL,
      },
    },
  };

  saveConfig(updatedConfig);

  p.outro(
    chalk.green(
      `✔ Switched to: ${chalk.bold(PROVIDER_LABELS[provider])}\n` +
        `Active Model: ${chalk.bold(model)}`
    )
  );

  return updatedConfig;
}

/**
 * Interactive onboarding / config wizard using @clack/prompts.
 */
export async function promptConfig(isFirstTime = false): Promise<BanglaCLIConfig> {
  p.intro(
    chalk.bold.hex('#00FF66')(
      isFirstTime ? '🇧🇩 Welcome to banglaCLI Onboarding Setup' : '⚙️  banglaCLI Configuration Settings'
    )
  );

  const existingConfig = getConfig();

  // 1. Choose Provider
  const provider = await interactiveSelect<ProviderType>({
    message: 'Select your AI Provider:',
    initialValue: existingConfig?.provider || 'gemini',
    options: [
      {
        value: 'gemini',
        label: `${chalk.bold('Google Gemini')} ${chalk.green('(100% Free - 1,500 Req/Day, Fast & Reliable)')}`,
        hint: 'Recommended: gemini-3.5-flash-lite, gemini-3.1-flash-lite, gemini-3.5-flash',
      },
      {
        value: 'openrouter',
        label: `${chalk.bold('OpenRouter')} ${chalk.cyan('(Free Models: openrouter/free, Nemotron, Gemma 4)')}`,
        hint: 'Optional BYOK free router (50-1000 req/day)',
      },
      {
        value: 'custom',
        label: `${chalk.bold('Custom OpenAI-Compatible')} ${chalk.magenta('(Groq, Ollama Offline, DeepSeek, etc.)')}`,
        hint: 'Custom baseURL + API key (Ollama requires no key)',
      },
    ],
  });

  if (!provider || p.isCancel(provider)) {
    if (isFirstTime) {
      p.cancel(chalk.yellow('Setup cancelled.'));
      process.exit(0);
    }
    return existingConfig!;
  }

  const savedForProvider = existingConfig?.savedProviders?.[provider];
  let resolvedApiKey = '';

  if (!isFirstTime && savedForProvider?.apiKey) {
    const keyChoice = await interactiveSelect<'saved' | 'new'>({
      message: `Saved API key found for ${PROVIDER_LABELS[provider]}.`,
      options: [
        { value: 'saved', label: chalk.green('✔ Keep existing API key') },
        { value: 'new', label: chalk.yellow('Enter a new API key') },
      ],
    });
    if (!keyChoice || p.isCancel(keyChoice)) {
      return existingConfig!;
    }
    if (keyChoice === 'saved') {
      resolvedApiKey = savedForProvider.apiKey;
    }
  }

  let baseURL: string | undefined = undefined;

  // Custom baseURL before key check so Ollama localhost doesn't prompt unnecessarily
  if (provider === 'custom') {
    const customBaseURL = (await p.text({
      message: chalk.cyan('Enter custom baseURL (e.g. https://api.groq.com/openai/v1 or http://localhost:11434/v1):'),
      initialValue: savedForProvider?.baseURL || existingConfig?.baseURL || 'http://localhost:11434/v1',
      validate: (value) => {
        if (!value || !value.startsWith('http')) {
          return 'Please provide a valid URL starting with http:// or https://';
        }
      },
    })) as string;

    if (p.isCancel(customBaseURL)) {
      if (isFirstTime) {
        p.cancel(chalk.yellow('Setup cancelled.'));
        process.exit(0);
      }
      return existingConfig!;
    }
    baseURL = customBaseURL.trim();
  } else if (provider === 'openrouter') {
    baseURL = 'https://openrouter.ai/api/v1';
  }

  if (!resolvedApiKey) {
    if (provider === 'custom' && baseURL?.includes('localhost')) {
      resolvedApiKey = 'ollama';
    } else {
      // 2. Show helpful key retrieval URL
      p.note(
        `${chalk.white('Get your free API key here:')}\n` +
          `${chalk.bold.underline.cyan(PROVIDER_KEY_URLS[provider])}\n\n` +
          `${chalk.gray('ℹ️ 100% BYOK (Bring Your Own Key) - Your key is saved locally in config store.')}`,
        chalk.bold('API Key Instructions')
      );

      // 3. Prompt for API Key
      const apiKey = (await p.password({
        message: chalk.cyan(`Enter your ${PROVIDER_LABELS[provider]} API Key:`),
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return 'API Key cannot be empty!';
          }
        },
      })) as string;

      if (p.isCancel(apiKey)) {
        if (isFirstTime) {
          p.cancel(chalk.yellow('Setup cancelled.'));
          process.exit(0);
        }
        return existingConfig!;
      }
      resolvedApiKey = apiKey.trim();
    }
  }

  // 5. Model Selection
  const chosenModel = await selectModelForProvider(
    provider,
    existingConfig?.provider === provider ? existingConfig?.model : savedForProvider?.model || DEFAULT_MODELS[provider]
  );

  if (!chosenModel) {
    if (isFirstTime) {
      p.cancel(chalk.yellow('Setup cancelled.'));
      process.exit(0);
    }
    return existingConfig!;
  }

  const finalConfig: BanglaCLIConfig = {
    provider,
    apiKey: resolvedApiKey,
    model: chosenModel,
    baseURL,
    savedProviders: {
      ...existingConfig?.savedProviders,
      [provider]: {
        apiKey: resolvedApiKey,
        model: chosenModel,
        ...(baseURL ? { baseURL } : {}),
      },
    },
  };

  saveConfig(finalConfig);

  p.outro(
    chalk.green(
      `✅ Settings saved successfully!\n` +
        `Provider: ${chalk.bold(PROVIDER_LABELS[provider])}\n` +
        `Model: ${chalk.bold(chosenModel)}`
    )
  );

  return finalConfig;
}
