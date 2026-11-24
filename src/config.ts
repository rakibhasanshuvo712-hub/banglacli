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
  gemini: 'gemini-2.0-flash',
  openrouter: 'openrouter/free',
  custom: 'llama-3.3-70b-versatile',
};

export const PROVIDER_KEY_URLS: Record<ProviderType, string> = {
  gemini: 'https://aistudio.google.com/apikey',
  openrouter: 'https://openrouter.ai/keys',
  custom: 'https://platform.deepseek.com/api_keys (or your provider console)',
};

/**
 * Retrieve saved configuration.
 */
export function getConfig(): BanglaCLIConfig | undefined {
  const cfg = configStore.get('config');
  if (cfg && !cfg.savedProviders) {
    cfg.savedProviders = {
      [cfg.provider]: {
        apiKey: cfg.apiKey,
        model: cfg.model,
        baseURL: cfg.baseURL,
      },
    };
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
  config.savedProviders[config.provider] = {
    apiKey: config.apiKey,
    model: config.model,
    baseURL: config.baseURL,
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
      { value: 'gemini-2.0-flash', label: 'gemini-2.0-flash (🌟 Google Flagship Free Coder - 1M Tokens, 1,500 RPD)' },
      { value: 'gemini-2.0-flash-lite', label: 'gemini-2.0-flash-lite (Ultra-Fast 30 RPM Free)' },
      { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash (Next-Gen Flash Preview)' },
      { value: 'gemini-2.5-pro', label: 'gemini-2.5-pro (2M Context Frontier Preview)' },
      { value: 'gemini-1.5-flash', label: 'gemini-1.5-flash (Battle-Tested Stable, 1M Tokens)' },
      { value: 'gemini-1.5-pro', label: 'gemini-1.5-pro (2M Context Long-Form)' },
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
        initialValue: 'gemini-2.0-flash',
      })) as string;
      if (p.isCancel(customModel)) return null;
      return customModel.trim();
    }
    return modelChoice;
  } else if (provider === 'openrouter') {
    const openrouterOptions = [
      { value: 'openrouter/free', label: 'openrouter/free (🌟 Recommended - Best Free Model with Tools)' },
      { value: 'google/lyria-3-pro-preview', label: 'google/lyria-3-pro-preview (1M Context Free)' },
      { value: 'google/lyria-3-clip-preview', label: 'google/lyria-3-clip-preview (1M Context Free)' },
      { value: 'meta-llama/llama-3.3-70b-instruct:free', label: 'meta-llama/llama-3.3-70b-instruct:free (Free 70B Model)' },
      { value: 'qwen/qwen-2.5-coder-32b-instruct:free', label: 'qwen/qwen-2.5-coder-32b-instruct:free (Free 32B Coder)' },
      { value: 'deepseek/deepseek-r1:free', label: 'deepseek/deepseek-r1:free (Free Reasoning Model)' },
      { value: 'deepseek/deepseek-chat:free', label: 'deepseek/deepseek-chat:free (Free 671B Chat/Code)' },
      { value: 'particle-ai/particle-1:free', label: 'particle-ai/particle-1:free (1M Context Free Coder)' },
      { value: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: 'nvidia/nemotron-3-ultra-550b-a55b:free (550B MoE 1M)' },
      { value: 'google/gemma-4-31b-it:free', label: 'google/gemma-4-31b-it:free (Free 31B Coding & Chat)' },
      { value: 'nvidia/nemotron-3.5-lightning:free', label: 'nvidia/nemotron-3.5-lightning:free (Free Fast Model)' },
      { value: 'tencent/hy4-flash', label: 'tencent/hy4-flash (Tencent HY4 Free Tokens)' },
      { value: 'z-ai/glm-5.3-flash', label: 'z-ai/glm-5.3-flash (GLM 5.3 1M Free Tokens)' },
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
    // No saved credentials for this provider
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

    if (provider === 'custom') {
      const customURL = (await p.text({
        message: chalk.cyan('Enter custom baseURL (e.g. https://api.deepseek.com/v1 or http://localhost:11434/v1):'),
        initialValue: 'https://api.deepseek.com/v1',
      })) as string;
      if (p.isCancel(customURL)) return null;
      baseURL = customURL.trim();
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
    initialValue: existingConfig?.provider || 'openrouter',
    options: [
      {
        value: 'openrouter',
        label: `${chalk.bold('OpenRouter')} ${chalk.green('(100% Free - Most Stable & Reliable)')}`,
        hint: 'Recommended: openrouter/free (Zero 503 outages)',
      },
      {
        value: 'gemini',
        label: `${chalk.bold('Google Gemini')} ${chalk.yellow('(Free Tier - High Quota, Subject to 503 Spikes)')}`,
        hint: 'gemini-2.0-flash, gemini-2.0-flash-lite, gemini-2.5-flash',
      },
      {
        value: 'custom',
        label: `${chalk.bold('Custom OpenAI-Compatible')} ${chalk.magenta('(Groq, Ollama Offline, etc.)')}`,
        hint: 'Custom baseURL + API key',
      },
    ],
  });

  if (!provider || p.isCancel(provider)) {
    p.cancel(chalk.yellow('Setup cancelled.'));
    process.exit(0);
  }

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
    p.cancel(chalk.yellow('Setup cancelled.'));
    process.exit(0);
  }

  let baseURL: string | undefined = undefined;

  // 4. Custom baseURL if provider is custom
  if (provider === 'custom') {
    const customBaseURL = (await p.text({
      message: chalk.cyan('Enter custom baseURL (e.g. https://api.deepseek.com/v1 or http://localhost:11434/v1):'),
      initialValue: existingConfig?.baseURL || 'https://api.deepseek.com/v1',
      validate: (value) => {
        if (!value || !value.startsWith('http')) {
          return 'Please provide a valid URL starting with http:// or https://';
        }
      },
    })) as string;

    if (p.isCancel(customBaseURL)) {
      p.cancel(chalk.yellow('Setup cancelled.'));
      process.exit(0);
    }
    baseURL = customBaseURL.trim();
  } else if (provider === 'openrouter') {
    baseURL = 'https://openrouter.ai/api/v1';
  }

  // 5. Model Selection
  const chosenModel = await selectModelForProvider(
    provider,
    existingConfig?.provider === provider ? existingConfig?.model : DEFAULT_MODELS[provider]
  );

  if (!chosenModel) {
    p.cancel(chalk.yellow('Setup cancelled.'));
    process.exit(0);
  }

  const finalConfig: BanglaCLIConfig = {
    provider,
    apiKey: apiKey.trim(),
    model: chosenModel,
    baseURL,
    savedProviders: {
      ...existingConfig?.savedProviders,
      [provider]: {
        apiKey: apiKey.trim(),
        model: chosenModel,
        baseURL,
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
