import { GoogleGenAI } from '@google/genai';
import { BanglaCLIConfig, saveConfig, updateModel } from './config.js';
import {
  AGENT_MODELS,
  fetchLiveOpenRouterFreeModels,
  normalizeGeminiModel,
  GEMINI_CASCADE_CHAIN,
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
  const timeoutMs = 4500;

  if (candidate.provider === 'gemini') {
    try {
      const ai = new GoogleGenAI({ apiKey: candidate.apiKey });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const normalized = normalizeGeminiModel(candidate.id);

      const res = await ai.models.generateContent({
        model: normalized,
        contents: [{ role: 'user', parts: [{ text: '1' }] }],
        config: { maxOutputTokens: 2 },
      });
      clearTimeout(timeout);
      return Boolean(res && res.text);
    } catch {
      return false;
    }
  }

  // OpenRouter / Custom / Groq
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
        messages: [{ role: 'user', content: '1' }],
        max_tokens: 1,
      }),
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return false;
    }

    const data = (await res.json()) as any;
    // Check if error payload returned in JSON
    if (data?.error) {
      return false;
    }
    return Boolean(data?.choices && data.choices.length > 0);
  } catch {
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
    (config.provider === 'gemini' ? config.apiKey : undefined);

  const openRouterKey =
    config.savedProviders?.openrouter?.apiKey ||
    (config.provider === 'openrouter' ? config.apiKey : undefined);

  const customKey =
    config.savedProviders?.custom?.apiKey ||
    (config.provider === 'custom' ? config.apiKey : undefined);
  const customBaseURL = config.savedProviders?.custom?.baseURL || config.baseURL;

  const candidatePool: FreeModelCandidate[] = [];
  const seenIds = new Set<string>();

  // 1. Google Gemini free candidates
  if (geminiKey) {
    for (const m of GEMINI_CASCADE_CHAIN) {
      const norm = normalizeGeminiModel(m);
      if (!seenIds.has(norm) && !excludedModels.has(norm) && !excludedModels.has(m)) {
        seenIds.add(norm);
        candidatePool.push({
          id: norm,
          name: norm,
          provider: 'gemini',
          apiKey: geminiKey,
        });
      }
    }
  }

  // 2. OpenRouter free candidates from presets
  if (openRouterKey) {
    for (const p of AGENT_MODELS) {
      const isFree =
        p.category === 'free' ||
        p.id.endsWith(':free') ||
        p.id.includes('free') ||
        p.id.includes('flash') ||
        p.badge === 'Free' ||
        p.badge === 'Live Free';

      if (isFree && !seenIds.has(p.id) && !excludedModels.has(p.id)) {
        seenIds.add(p.id);
        candidatePool.push({
          id: p.id,
          name: p.name || p.id,
          provider: 'openrouter',
          apiKey: openRouterKey,
          baseURL: 'https://openrouter.ai/api/v1',
        });
      }
    }

    // 3. Live models from OpenRouter API
    try {
      const liveFree = await fetchLiveOpenRouterFreeModels();
      for (const m of liveFree) {
        if (!seenIds.has(m.id) && !excludedModels.has(m.id)) {
          seenIds.add(m.id);
          candidatePool.push({
            id: m.id,
            name: m.name,
            provider: 'openrouter',
            apiKey: openRouterKey,
            baseURL: 'https://openrouter.ai/api/v1',
          });
        }
      }
    } catch {}
  }

  // 4. Custom (e.g. Groq free tier) candidates
  if (customKey) {
    const groqFreeModels = ['llama-3.3-70b-versatile', 'gemma2-9b-it', 'llama-3.1-8b-instant'];
    for (const g of groqFreeModels) {
      if (!seenIds.has(g) && !excludedModels.has(g)) {
        seenIds.add(g);
        candidatePool.push({
          id: g,
          name: g,
          provider: 'custom',
          apiKey: customKey,
          baseURL: customBaseURL,
        });
      }
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
      // Update global configuration and save to persistent storage
      config.model = winner.id;
      config.provider = winner.provider;
      config.apiKey = winner.apiKey;
      if (winner.baseURL) {
        config.baseURL = winner.baseURL;
      }
      updateModel(winner.id);
      saveConfig(config);

      if (!silent) {
        renderModelExplorationNotice(winner.id, winner.provider, testedCount);
      }

      return winner;
    }
  }

  return null;
}
