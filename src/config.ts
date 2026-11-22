import Conf from 'conf';
import * as p from '@clack/prompts';
import chalk from 'chalk';

export type ProviderType = 'gemini' | 'openrouter' | 'custom';

export interface BanglaCLIConfig {
  provider: ProviderType;
  apiKey: string;
  model: string;
  baseURL?: string;
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
  gemini: 'gemini-2.5-flash',
  openrouter: 'deepseek/deepseek-chat:free',
  custom: 'deepseek-chat',
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
  return configStore.get('config');
}

/**
 * Save configuration to local storage.
 */
export function saveConfig(config: BanglaCLIConfig): void {
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
  const provider = (await p.select({
    message: chalk.cyan('Select your AI Provider:'),
    initialValue: existingConfig?.provider || 'gemini',
    options: [
      {
        value: 'gemini',
        label: `${chalk.bold('Google Gemini')} ${chalk.green('(Free Tier - Fast & High Quota)')}`,
        hint: 'Recommended: gemini-2.5-flash',
      },
      {
        value: 'openrouter',
        label: `${chalk.bold('OpenRouter')} ${chalk.yellow('(Free Models: DeepSeek, GLM, etc.)')}`,
        hint: 'Recommended: deepseek/deepseek-chat:free',
      },
      {
        value: 'custom',
        label: `${chalk.bold('Custom OpenAI-Compatible')} ${chalk.magenta('(DeepSeek, Groq, Ollama, etc.)')}`,
        hint: 'Custom baseURL + API key',
      },
    ],
  })) as ProviderType;

  if (p.isCancel(provider)) {
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
  let model: string;
  if (provider === 'gemini') {
    const modelChoice = (await p.select({
      message: chalk.cyan('Select Gemini Model:'),
      initialValue: existingConfig?.model || 'gemini-2.5-flash',
      options: [
        { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash (Default Free & Recommended)' },
        { value: 'gemini-2.0-flash', label: 'gemini-2.0-flash (Fast & Multimodal)' },
        { value: 'gemini-1.5-flash', label: 'gemini-1.5-flash (Stable)' },
        { value: 'gemini-1.5-pro', label: 'gemini-1.5-pro (Reasoning & Large Context)' },
        { value: 'custom_input', label: 'Enter custom model name manually...' },
      ],
    })) as string;

    if (p.isCancel(modelChoice)) {
      p.cancel(chalk.yellow('Setup cancelled.'));
      process.exit(0);
    }

    if (modelChoice === 'custom_input') {
      const customModel = (await p.text({
        message: 'Enter Gemini model ID:',
        initialValue: 'gemini-2.5-flash',
      })) as string;
      if (p.isCancel(customModel)) {
        process.exit(0);
      }
      model = customModel.trim();
    } else {
      model = modelChoice;
    }
  } else if (provider === 'openrouter') {
    const modelChoice = (await p.select({
      message: chalk.cyan('Select OpenRouter Model:'),
      initialValue: existingConfig?.model || 'deepseek/deepseek-chat:free',
      options: [
        { value: 'deepseek/deepseek-chat:free', label: 'deepseek/deepseek-chat:free (Powerful Free Coding)' },
        { value: 'zhipu/glm-4:free', label: 'zhipu/glm-4:free (Fast Free Model)' },
        { value: 'meta-llama/llama-3.3-70b-instruct:free', label: 'meta-llama/llama-3.3-70b-instruct:free' },
        { value: 'google/gemini-2.0-flash-exp:free', label: 'google/gemini-2.0-flash-exp:free' },
        { value: 'custom_input', label: 'Enter custom OpenRouter model name...' },
      ],
    })) as string;

    if (p.isCancel(modelChoice)) {
      p.cancel(chalk.yellow('Setup cancelled.'));
      process.exit(0);
    }

    if (modelChoice === 'custom_input') {
      const customModel = (await p.text({
        message: 'Enter model ID (e.g. mistralai/mistral-7b-instruct:free):',
        initialValue: 'deepseek/deepseek-chat:free',
      })) as string;
      if (p.isCancel(customModel)) {
        process.exit(0);
      }
      model = customModel.trim();
    } else {
      model = modelChoice;
    }
  } else {
    // Custom provider model
    const customModel = (await p.text({
      message: chalk.cyan('Enter model name (e.g., deepseek-chat, llama3, qwen2.5-coder):'),
      initialValue: existingConfig?.model || 'deepseek-chat',
      validate: (v) => (!v || v.trim().length === 0 ? 'Model name cannot be empty!' : undefined),
    })) as string;

    if (p.isCancel(customModel)) {
      p.cancel(chalk.yellow('Setup cancelled.'));
      process.exit(0);
    }
    model = customModel.trim();
  }

  const finalConfig: BanglaCLIConfig = {
    provider,
    apiKey: apiKey.trim(),
    model,
    baseURL,
  };

  saveConfig(finalConfig);

  p.outro(
    chalk.green(
      `✅ Settings saved successfully!\n` +
        `Provider: ${chalk.bold(PROVIDER_LABELS[provider])}\n` +
        `Model: ${chalk.bold(model)}`
    )
  );

  return finalConfig;
}
