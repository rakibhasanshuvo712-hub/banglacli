import { GoogleGenAI } from '@google/genai';
import {
  BanglaCLIConfig,
  detectLocalOllamaModels,
  getEnvProviderKey,
  POLLINATIONS_BASE_URL,
  POLLINATIONS_DEFAULT_MODEL,
  POLLINATIONS_FREE_API_KEY,
  saveConfig,
} from './config.js';
import {
  AGENT_MODELS,
  fetchLiveOpenRouterFreeModels,
  normalizeGeminiModel,
  GEMINI_CASCADE_CHAIN,
  OPENROUTER_FREE_CASCADE_CHAIN,
  GROQ_CASCADE_CHAIN,
  DEEPSEEK_CASCADE_CHAIN,
  POLLINATIONS_CASCADE_CHAIN,
} from './models.js';
import { renderModelExplorationNotice } from './ui.js';
import chalk from 'chalk';

export interface FreeModelCandidate {
  id: string;
  name: string;
  provider: 'gemini' | 'openrouter' | 'custom';
  apiKey: string;
  baseURL?: string;
}

/**
 * Ultra-fast probe to test if a candidate model has active free tokens and returns 200 OK.
 */
async function probeCandidate(candidate: FreeModelCandidate): Promise<boolean> {
  const timeoutMs = 5000;

  if (candidate.provider === 'custom' && candidate.baseURL?.toLowerCase().includes('pollinations.ai')) {
    // Check health via /models without consuming the 1-per-45s anonymous inference cooldown
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch('https://text.pollinations.ai/models', { signal: controller.signal });
      clearTimeout(timer);
      return res.ok;
    } catch {
      clearTimeout(timer);
      return false;
    }
  }

  if (candidate.provider === 'gemini') {
    let timer: NodeJS.Timeout | undefined;
    try {
      const ai = new GoogleGenAI({ apiKey: candidate.apiKey });
      const normalized = normalizeGeminiModel(candidate.id);

      const res = await Promise.race([
        ai.models.generateContent({
          model: normalized,
          contents: [{ role: 'user', parts: [{ text: 'Say OK' }] }],
          config: { maxOutputTokens: 10 },
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('PROBE_TIMEOUT')), timeoutMs);
        }),
      ]);
      if (timer) clearTimeout(timer);
      return Boolean(res && (res.text !== undefined || (res.candidates && res.candidates.length > 0)));
    } catch {
      if (timer) clearTimeout(timer);
      return false;
    }
  }

  // OpenRouter / Custom / Groq / Local
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const targetUrl = candidate.baseURL
      ? candidate.baseURL.replace(/\/+$/, '') + '/chat/completions'
      : 'https://openrouter.ai/api/v1/chat/completions';

    const res = await fetch(targetUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${candidate.apiKey}`,
        'HTTP-Referer': 'https://banglacli.vercel.app',
        'X-Title': 'banglaCLI',
      },
      body: JSON.stringify({
        model: candidate.id,
        messages: [{ role: 'user', content: 'Say OK' }],
        max_tokens: 10,
      }),
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return false;
    }

    const rawText = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(rawText.trim());
    } catch {
      return false;
    }
    if (data?.error) {
      return false;
    }
    return Boolean(data?.choices && data.choices.length > 0);
  } catch {
    clearTimeout(timeout);
    return false;
  }
}

/**
 * Explore all models across all providers to discover and select an active model with free tokens.
 * Probes candidates in parallel batches so detection completes within 2-4 seconds.
 */
export async function exploreAndSelectFreeModel(
  config: BanglaCLIConfig,
  excludedModels: Set<string> = new Set(),
  silent: boolean = false
): Promise<FreeModelCandidate | null> {
  if (!silent) {
    process.stdout.write(
      chalk.cyan('\n🔍 Exploring all available models across providers to find active free tokens...\n')
    );
  }

  const geminiKey =
    config.savedProviders?.gemini?.apiKey ||
    (config.provider === 'gemini' ? config.apiKey : undefined) ||
    getEnvProviderKey('gemini');

  const openRouterKey =
    config.savedProviders?.openrouter?.apiKey ||
    (config.provider === 'openrouter' ? config.apiKey : undefined) ||
    getEnvProviderKey('openrouter');

  const customKey =
    config.savedProviders?.custom?.apiKey ||
    (config.provider === 'custom' ? config.apiKey : undefined);
  const customBaseURL =
    config.savedProviders?.custom?.baseURL ||
    (config.provider === 'custom' ? config.baseURL : undefined);

  const candidatePool: FreeModelCandidate[] = [];
  const seenKeys = new Set<string>();

  const pushCandidate = (c: FreeModelCandidate) => {
    const dedupeKey = `${c.provider}:${c.id}`;
    if (!seenKeys.has(dedupeKey) && !excludedModels.has(c.id)) {
      seenKeys.add(dedupeKey);
      candidatePool.push(c);
    }
  };

  // 1. Google Gemini free candidates (highest reliability, 1,500 RPD)
  if (geminiKey) {
    for (const m of GEMINI_CASCADE_CHAIN) {
      const norm = normalizeGeminiModel(m);
      if (!excludedModels.has(norm) && !excludedModels.has(m)) {
        pushCandidate({
          id: norm,
          name: norm,
          provider: 'gemini',
          apiKey: geminiKey,
        });
      }
    }
  }

  // 2. OpenRouter verified free tool-capable candidates
  if (openRouterKey) {
    for (const m of OPENROUTER_FREE_CASCADE_CHAIN) {
      pushCandidate({
        id: m,
        name: m,
        provider: 'openrouter',
        apiKey: openRouterKey,
        baseURL: 'https://openrouter.ai/api/v1',
      });
    }

    for (const p of AGENT_MODELS) {
      if (
        p.provider === 'openrouter' &&
        (p.id === 'openrouter/free' || p.id.endsWith(':free')) &&
        !p.id.includes('lyria')
      ) {
        pushCandidate({
          id: p.id,
          name: p.name || p.id,
          provider: 'openrouter',
          apiKey: openRouterKey,
          baseURL: 'https://openrouter.ai/api/v1',
        });
      }
    }

    // 3. Live tool-capable free models from OpenRouter API
    try {
      const liveFree = await fetchLiveOpenRouterFreeModels();
      for (const m of liveFree) {
        pushCandidate({
          id: m.id,
          name: m.name,
          provider: 'openrouter',
          apiKey: openRouterKey,
          baseURL: 'https://openrouter.ai/api/v1',
        });
      }
    } catch {}
  }

  // 4. Custom endpoint candidates matching configured baseURL
  if (customKey && customBaseURL && !customBaseURL.includes('pollinations.ai')) {
    if (customBaseURL.includes('groq.com')) {
      for (const g of GROQ_CASCADE_CHAIN) {
        pushCandidate({
          id: g,
          name: `Groq (${g})`,
          provider: 'custom',
          apiKey: customKey,
          baseURL: customBaseURL,
        });
      }
    } else if (customBaseURL.includes('deepseek.com')) {
      for (const d of DEEPSEEK_CASCADE_CHAIN) {
        pushCandidate({
          id: d,
          name: `DeepSeek (${d})`,
          provider: 'custom',
          apiKey: customKey,
          baseURL: customBaseURL,
        });
      }
    } else if (config.savedProviders?.custom?.model) {
      const m = config.savedProviders.custom.model;
      pushCandidate({
        id: m,
        name: m,
        provider: 'custom',
        apiKey: customKey,
        baseURL: customBaseURL,
      });
    }
  }

  // 5. Local Ollama auto-discovered offline models (zero key)
  try {
    const localOllama = await detectLocalOllamaModels(500);
    for (const m of localOllama) {
      pushCandidate({
        id: m,
        name: `Ollama (${m})`,
        provider: 'custom',
        apiKey: 'ollama',
        baseURL: 'http://localhost:11434/v1',
      });
    }
  } catch {}

  // 6. Built-in Zero-Key Pollinations AI candidates (guaranteed fallback)
  for (const polModel of POLLINATIONS_CASCADE_CHAIN) {
    if (!excludedModels.has(polModel)) {
      pushCandidate({
        id: polModel,
        name: `Zero-Key Free AI (${polModel})`,
        provider: 'custom',
        apiKey: POLLINATIONS_FREE_API_KEY,
        baseURL: POLLINATIONS_BASE_URL,
      });
    }
  }

  if (candidatePool.length === 0) {
    return null;
  }

  // Probe in fast parallel chunks of 4 models
  const chunkSize = 4;
  let testedCount = 0;

  for (let i = 0; i < candidatePool.length; i += chunkSize) {
    const chunk = candidatePool.slice(i, i + chunkSize);
    testedCount += chunk.length;

    const probePromises = chunk.map(async (candidate) => {
      const ok = await probeCandidate(candidate);
      return ok ? candidate : null;
    });

    const results = await Promise.all(probePromises);
    const winner = results.find((r): r is FreeModelCandidate => r !== null);

    if (winner) {
      config.model = winner.id;
      config.provider = winner.provider;
      config.apiKey = winner.apiKey;
      if (winner.baseURL) {
        config.baseURL = winner.baseURL;
      } else {
        delete (config as any).baseURL;
      }
      saveConfig(config);

      if (!silent) {
        renderModelExplorationNotice(winner.id, winner.provider, testedCount);
      }

      return winner;
    }
  }

  return null;
}
