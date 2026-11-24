import chalk from 'chalk';
import * as p from '@clack/prompts';
import { ProviderType, BanglaCLIConfig, saveConfig, PROVIDER_LABELS, PROVIDER_KEY_URLS } from './config.js';
import { createSpinner } from './ui.js';
import { prepareInteractiveArea, interactiveSelect } from './prompt.js';

export interface AgentModelPreset {
  id: string;
  name: string;
  provider: ProviderType;
  category: 'free' | 'gemini' | 'deepseek' | 'hy4' | 'glm' | 'groq' | 'flagship' | 'local' | 'zen';
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
  {
    id: 'google/lyria-3-pro-preview',
    name: 'Google Lyria 3 Pro Preview (1M Context)',
    provider: 'openrouter',
    category: 'free',
    description: "Google DeepMind's ultra-long context multimodal reasoning model, 100% free on OpenRouter.",
    badge: '1M Free',
    contextLength: '1,048,576',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'google/lyria-3-clip-preview',
    name: 'Google Lyria 3 Clip Preview (1M Context)',
    provider: 'openrouter',
    category: 'free',
    description: 'High-speed long-context preview model from Google DeepMind with 1M token context.',
    badge: '1M Free',
    contextLength: '1,048,576',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    name: 'Meta Llama 3.3 70B Instruct (Free)',
    provider: 'openrouter',
    category: 'free',
    description: "Meta's flagship open-weights 70B model with 128k context on OpenRouter free tier.",
    badge: '70B Free',
    contextLength: '128,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'qwen/qwen-2.5-coder-32b-instruct:free',
    name: 'Qwen 2.5 Coder 32B Instruct (Free)',
    provider: 'openrouter',
    category: 'free',
    description: 'Specialized 32B programming model tuned for full-stack autonomous building.',
    badge: 'Coder Free',
    contextLength: '32,768',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'mistralai/mistral-small-24b-instruct-2501:free',
    name: 'Mistral Small 24B Instruct (Free)',
    provider: 'openrouter',
    category: 'free',
    description: 'Compact, fast reasoning and code generation model from Mistral AI on free tier.',
    badge: '24B Free',
    contextLength: '32,768',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'deepseek/deepseek-r1:free',
    name: 'DeepSeek R1 Reasoner (Free on OpenRouter)',
    provider: 'openrouter',
    category: 'free',
    description: 'Frontier reasoning chain-of-thought model served for free on OpenRouter.',
    badge: 'R1 Free',
    contextLength: '64,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'deepseek/deepseek-chat:free',
    name: 'DeepSeek V3 Chat (Free on OpenRouter)',
    provider: 'openrouter',
    category: 'free',
    description: 'Leading 671B parameter coding and instruction model served for free on OpenRouter.',
    badge: 'V3 Free',
    contextLength: '64,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },

  // ==========================================
  // ⚡ OpenCode Console & Freebuff Zero-Key Built-in Models ($0 Endpoints)
  // ==========================================
  // 1. Zero-Retention / No-Training Models:
  {
    id: 'deepseek-v4.1-flash-free',
    name: 'OpenCode Console: DeepSeek V4.1 Flash Free',
    provider: 'openrouter',
    category: 'zen',
    description: 'Zero-retention / no-training built-in free coding endpoint from OpenCode Console.',
    badge: 'Zero-Retention',
    contextLength: '128,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'glm-5.3-flash-free',
    name: 'OpenCode Console: GLM 5.3 Flash Free',
    provider: 'openrouter',
    category: 'zen',
    description: 'Zero-retention fast instruction-tuned bilingual coder from OpenCode Console.',
    badge: 'Zero-Retention',
    contextLength: '128,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'longcat-2.5-preview-free',
    name: 'OpenCode Console: LongCat 2.5 Preview Free',
    provider: 'openrouter',
    category: 'zen',
    description: 'Zero-retention ultra-long context preview model with zero data storage.',
    badge: 'Zero-Retention',
    contextLength: '256,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },

  // 2. Retained / Training-Enabled Models:
  {
    id: 'beam-free',
    name: 'OpenCode Console: Beam Free',
    provider: 'openrouter',
    category: 'zen',
    description: 'High-reasoning free agent model (retained 30 days, region-flexible).',
    badge: 'Console Free',
    contextLength: '128,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'big-pickle',
    name: 'OpenCode Stealth: Big Pickle',
    provider: 'openrouter',
    category: 'zen',
    description: 'Stealth reasoning model for challenging coding and logic tasks.',
    badge: 'Stealth Free',
    contextLength: '128,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'flint-40b-free',
    name: 'OpenCode Console: Flint 40B MoE Free',
    provider: 'openrouter',
    category: 'zen',
    description: 'Open mixture-of-experts 40B programming model from OpenCode Console.',
    badge: 'MoE Free',
    contextLength: '262,144',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'exo-free',
    name: 'OpenCode Console: Exo Distributed Free',
    provider: 'openrouter',
    category: 'zen',
    description: 'Distributed cluster agent endpoint running without API key limits.',
    badge: 'Distributed Free',
    contextLength: '128,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'mimo-v2.6-flash-free',
    name: 'OpenCode Console: MiMo v2.6 Flash Free',
    provider: 'openrouter',
    category: 'zen',
    description: 'Ultra-low latency sub-second code generation endpoint.',
    badge: 'Flash Free',
    contextLength: '128,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'mimo-v2.5-free',
    name: 'OpenCode Console: MiMo v2.5 Free',
    provider: 'openrouter',
    category: 'zen',
    description: 'Full-stack agentic coding model from OpenCode Console roster.',
    badge: 'Console Free',
    contextLength: '128,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },

  // 3. NVIDIA Trial Endpoints:
  {
    id: 'nemotron-3-ultra-free',
    name: 'NVIDIA Trial: Nemotron 3 Ultra Free',
    provider: 'openrouter',
    category: 'zen',
    description: 'NVIDIA trial endpoint with 1 Million token massive context window.',
    badge: 'Trial 1M Free',
    contextLength: '1,000,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'nemotron-3.5-lightning-free',
    name: 'NVIDIA Trial: Nemotron 3.5 Lightning Free',
    provider: 'openrouter',
    category: 'zen',
    description: 'Ultra-fast inference trial endpoint for instant code completions.',
    badge: 'Trial Fast Free',
    contextLength: '1,000,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'nemotron-3.5-super-vl-free',
    name: 'NVIDIA Trial: Nemotron 3.5 Super VL Free',
    provider: 'openrouter',
    category: 'zen',
    description: 'Multimodal vision and code trial endpoint from NVIDIA.',
    badge: 'Trial Vision Free',
    contextLength: '1,000,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },

  // 4. Freebuff Allowance Models:
  {
    id: 'solar-mini-4',
    name: 'Freebuff Allowance: Upstage Solar Mini 4',
    provider: 'openrouter',
    category: 'zen',
    description: 'Unmetered high-efficiency coding model from Upstage on Freebuff.',
    badge: 'Unmetered Free',
    contextLength: '64,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'solar-pro-4',
    name: 'Freebuff Allowance: Upstage Solar Pro 4',
    provider: 'openrouter',
    category: 'zen',
    description: 'Frontier reasoning and codebase generation agent.',
    badge: 'Freebuff Pro',
    contextLength: '128,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'mimo-2.5-pro',
    name: 'Freebuff Allowance: MiMo 2.5 Pro',
    provider: 'openrouter',
    category: 'zen',
    description: 'Autonomous coding builder from Freebuff daily allowance roster.',
    badge: 'Freebuff Pro',
    contextLength: '128,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'minimax-m3',
    name: 'Freebuff Allowance: MiniMax M3',
    provider: 'openrouter',
    category: 'zen',
    description: 'Massive 1M token context reasoning and architecture agent.',
    badge: '1M Context',
    contextLength: '1,000,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'gpt-6-luna',
    name: 'Freebuff Allowance: GPT-6 Luna Preview',
    provider: 'openrouter',
    category: 'zen',
    description: 'Next-gen frontier reasoning model preview from Freebuff allowance.',
    badge: 'Frontier Free',
    contextLength: '128,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },

  // 5. Tencent CodeBuddy CLI & Antigravity Models:
  {
    id: 'tencent/hunyuan-hy3',
    name: 'CodeBuddy CLI: Tencent Hunyuan Hy3',
    provider: 'openrouter',
    category: 'hy4',
    description: 'High-speed bilingual Chinese & English coding model from Tencent CodeBuddy.',
    badge: 'CodeBuddy Free',
    contextLength: '128,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'gemini-4-argon',
    name: 'Antigravity CLI: Gemini 4 Argon Frontier',
    provider: 'gemini',
    category: 'gemini',
    description: 'Frontier multi-agent reasoning model with 2M token context from Antigravity.',
    badge: 'Frontier 2M',
    contextLength: '2,097,152',
  },

  // ==========================================
  // 🔷 Google Gemini Suite (100% Free Tier: 1M Tokens, 1,500 Req/Day)
  // ==========================================
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash (🌟 Google Flagship Free Coder)',
    provider: 'gemini',
    category: 'gemini',
    description: "Google's flagship multimodal model with tool calling, high reasoning, and 1,500 req/day free.",
    badge: '100% Free',
    contextLength: '1,048,576',
  },
  {
    id: 'gemini-2.0-flash-lite',
    name: 'Gemini 2.0 Flash-Lite (Ultra-Fast 30 RPM)',
    provider: 'gemini',
    category: 'gemini',
    description: 'Ultra-low latency Gemini model with 30 requests/minute and 1M context.',
    badge: '30 RPM Free',
    contextLength: '1,048,576',
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash Preview (Next-Gen Flash)',
    provider: 'gemini',
    category: 'gemini',
    description: 'Latest 2.5 generation preview model from Google DeepMind with enhanced coding logic.',
    badge: '2.5 Preview',
    contextLength: '1,048,576',
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro Preview (2M Context Frontier)',
    provider: 'gemini',
    category: 'gemini',
    description: 'Deep architectural reasoning model with massive 2 Million token context window.',
    badge: '2M Context',
    contextLength: '2,097,152',
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash (Battle-Tested Stable)',
    provider: 'gemini',
    category: 'gemini',
    description: 'Rock-solid stable Google Flash model with 1M context and 0% downtime.',
    badge: '100% Free',
    contextLength: '1,048,576',
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro (2M Context Long-Form)',
    provider: 'gemini',
    category: 'gemini',
    description: 'Massive 2,097,152 token context window for large repo analysis.',
    badge: '2M Free',
    contextLength: '2,097,152',
  },

  // ==========================================
  // 🧠 DeepSeek Frontier Models (Free Tokens & High Speed)
  // ==========================================
  {
    id: 'deepseek-chat',
    name: 'DeepSeek V4.1 / V3.2 Chat (🌟 5M Free Tokens)',
    provider: 'custom',
    category: 'deepseek',
    description: 'DeepSeek flagship frontier coding model with 5M free tokens on platform.deepseek.com.',
    badge: '5M Free',
    contextLength: '128,000',
    baseURL: 'https://api.deepseek.com/v1',
  },
  {
    id: 'deepseek-reasoner',
    name: 'DeepSeek R1 Reasoner (Chain-of-Thought)',
    provider: 'custom',
    category: 'deepseek',
    description: 'DeepSeek frontier reasoning model with free tokens on platform.deepseek.com.',
    badge: 'R1 Reasoning',
    contextLength: '128,000',
    baseURL: 'https://api.deepseek.com/v1',
  },
  {
    id: 'deepseek-r1-distill-llama-70b',
    name: 'Groq: DeepSeek R1 Distill 70B (Free Tier)',
    provider: 'custom',
    category: 'deepseek',
    description: '500+ tokens/sec DeepSeek R1 reasoning on Groq Cloud free tier (14,400 req/day free).',
    badge: 'Groq Free',
    contextLength: '128,000',
    baseURL: 'https://api.groq.com/openai/v1',
  },
  {
    id: 'deepseek-r1-distill-qwen-32b',
    name: 'Groq: DeepSeek R1 Distill Qwen 32B (Free Tier)',
    provider: 'custom',
    category: 'deepseek',
    description: 'Ultra-fast specialized coding agent on Groq Cloud free tier.',
    badge: 'Groq Free',
    contextLength: '128,000',
    baseURL: 'https://api.groq.com/openai/v1',
  },
  {
    id: 'deepseek/deepseek-v4.1-flash',
    name: 'OpenRouter: DeepSeek V4.1 Flash (Latest 2026)',
    provider: 'openrouter',
    category: 'deepseek',
    description: 'Latest high-efficiency DeepSeek V4.1 Flash architecture on OpenRouter.',
    badge: 'V4.1 Flash',
    contextLength: '128,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'deepseek/deepseek-chat',
    name: 'OpenRouter: DeepSeek V4 Frontier Coding',
    provider: 'openrouter',
    category: 'deepseek',
    description: 'DeepSeek flagship coding and instruction model on OpenRouter.',
    badge: 'DeepSeek SOTA',
    contextLength: '128,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },

  // ==========================================
  // ⚡ Tencent HY4 Suite (1M Token Context - Free Promotional Tokens)
  // ==========================================
  {
    id: 'tencent/hy4-flash',
    name: 'Tencent Hy4 Flash (🌟 1M Context - Free Promo)',
    provider: 'openrouter',
    category: 'hy4',
    description: 'Tencent frontier Hy4 Flash model with 1,048,576 token context and ultra-fast generation.',
    badge: 'Hy4 1M Flash',
    contextLength: '1,048,576',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'tencent/hy4',
    name: 'Tencent Hy4 (1M Context Frontier Reasoning)',
    provider: 'openrouter',
    category: 'hy4',
    description: 'Tencent flagship Hy4 architecture optimized for deep reasoning and code generation.',
    badge: 'Hy4 1M Frontier',
    contextLength: '1,048,576',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'tencent/hy4-preview',
    name: 'Tencent Hy4 Preview (Latest Checkpoint)',
    provider: 'openrouter',
    category: 'hy4',
    description: 'Cutting-edge preview checkpoint of Tencent Hy4 with 1 Million token context.',
    badge: 'Hy4 Preview',
    contextLength: '1,048,576',
    baseURL: 'https://openrouter.ai/api/v1',
  },

  // ==========================================
  // 🚀 Zhipu AI GLM 5.3 Suite (Daily Free Tokens - 1M Context)
  // ==========================================
  {
    id: 'z-ai/glm-5.3-flash',
    name: 'GLM 5.3 Flash (🌟 Daily Free Tokens & 1M Context)',
    provider: 'openrouter',
    category: 'glm',
    description: 'Z.ai latest GLM 5.3 Flash with 1,048,576 token context and daily free tokens on BigModel.',
    badge: 'GLM 5.3 Flash',
    contextLength: '1,048,576',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'z-ai/glm-5.3',
    name: 'GLM 5.3 Frontier (1M Context Full-Stack Coding)',
    provider: 'openrouter',
    category: 'glm',
    description: 'Z.ai frontier GLM 5.3 model for complex coding, system design and architecture.',
    badge: 'GLM 5.3 Frontier',
    contextLength: '1,048,576',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'z-ai/glm-5.3-flashx',
    name: 'GLM 5.3 FlashX (High-Speed Throughput)',
    provider: 'openrouter',
    category: 'glm',
    description: 'Optimized high-throughput version of GLM 5.3 with 1 Million token context.',
    badge: 'GLM 5.3 FlashX',
    contextLength: '1,048,576',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'z-ai/glm-5.3-prime',
    name: 'GLM 5.3 Prime (Maximum Reasoning)',
    provider: 'openrouter',
    category: 'glm',
    description: 'Prime tier GLM 5.3 reasoning agent for difficult algorithms and complex tasks.',
    badge: 'GLM 5.3 Prime',
    contextLength: '1,000,000',
    baseURL: 'https://openrouter.ai/api/v1',
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

  // ==========================================
  // 👑 Frontier AI Coding Agents (OpenCode Flagships)
  // ==========================================
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet (OpenCode Benchmark SOTA)',
    provider: 'openrouter',
    category: 'flagship',
    description: 'Autonomous full-stack engineering & architectural reasoning champion.',
    badge: 'SOTA Coding',
    contextLength: '200,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'openai/gpt-4o',
    name: 'OpenAI GPT-4o Multimodal Agent',
    provider: 'openrouter',
    category: 'flagship',
    description: 'OpenAI flagship multimodal coding agent with fast tool calling.',
    badge: 'GPT-4o',
    contextLength: '128,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'openai/o3-mini',
    name: 'OpenAI o3-mini Reasoning Agent',
    provider: 'openrouter',
    category: 'flagship',
    description: 'High-speed mathematical & algorithmic chain-of-thought agent.',
    badge: 'o3-mini',
    contextLength: '200,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'mistralai/codestral-2508',
    name: 'Mistral Codestral (Specialized Code Agent)',
    provider: 'openrouter',
    category: 'flagship',
    description: 'Leading European code-specific model with 256k context.',
    badge: 'Codestral',
    contextLength: '256,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'qwen/qwen-2.5-coder-32b-instruct',
    name: 'Qwen 2.5 Coder 32B Instruct',
    provider: 'openrouter',
    category: 'flagship',
    description: 'Frontier programming model tuned specifically for autonomous building.',
    badge: 'Qwen Coder',
    contextLength: '32,768',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    name: 'Meta Llama 3.3 70B Instruct',
    provider: 'openrouter',
    category: 'flagship',
    description: "Meta's flagship open-weights frontier model with 128k context.",
    badge: 'Llama 70B',
    contextLength: '128,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'anthropic/claude-3.5-haiku',
    name: 'Claude 3.5 Haiku (High Speed)',
    provider: 'openrouter',
    category: 'flagship',
    description: 'High-speed code completion and execution agent from Anthropic.',
    badge: 'Fast Coding',
    contextLength: '200,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'x-ai/grok-2-1212',
    name: 'xAI Grok 2',
    provider: 'openrouter',
    category: 'flagship',
    description: "xAI's frontier model with strong coding and mathematical problem-solving.",
    badge: 'xAI Grok',
    contextLength: '128,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'moonshotai/kimi-k1.5',
    name: 'Moonshot Kimi K1.5 (Long Context)',
    provider: 'openrouter',
    category: 'flagship',
    description: 'Advanced multimodal reasoning model with ultra-long context capabilities.',
    badge: 'Kimi K1.5',
    contextLength: '128,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'minimax/minimax-01',
    name: 'MiniMax 01 (1M Context Agent)',
    provider: 'openrouter',
    category: 'flagship',
    description: 'Massive 1 Million token context reasoning and software building agent.',
    badge: '1M Context',
    contextLength: '1,000,000',
    baseURL: 'https://openrouter.ai/api/v1',
  },
];

/**
 * Intelligent Auto-Cascade Chains:
 * If tokens run out (429) or high demand (503) occurs, the agent automatically
 * cascades to the next best intelligent free model seamlessly.
 */
export const OPENROUTER_FREE_CASCADE_CHAIN = [
  'openrouter/free',
  'deepseek-v4.1-flash-free',
  'glm-5.3-flash-free',
  'solar-mini-4',
  'google/lyria-3-pro-preview',
  'google/lyria-3-clip-preview',
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen-2.5-coder-32b-instruct:free',
  'deepseek/deepseek-r1:free',
  'deepseek/deepseek-chat:free',
  'mistralai/mistral-small-24b-instruct-2501:free',
  'tencent/hy4-flash',
  'z-ai/glm-5.3-flash',
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

export function normalizeGeminiModel(model: string): string {
  if (!model) return 'gemini-3.5-flash-lite';
  if (model === 'gemini-2.0-flash' || model === 'gemini-2.0-flash-lite') return 'gemini-3.5-flash-lite';
  if (model === 'gemini-2.5-flash') return 'gemini-3.5-flash-lite';
  if (model === 'gemini-2.5-pro') return 'gemini-3.5-flash';
  return model;
}

export const GEMINI_CASCADE_CHAIN = [
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
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
  currentConfig: BanglaCLIConfig,
  mode: 'build' | 'plan' = 'build',
  initialCategory?: string
): Promise<BanglaCLIConfig | null> {
  const headerHeight = prepareInteractiveArea(
    PROVIDER_LABELS[currentConfig.provider] || currentConfig.provider,
    currentConfig.model,
    mode
  );

  const termRows = process.stdout.rows || 24;
  const availableRows = Math.max(4, termRows - headerHeight - 6);
  const selectMaxItems = Math.max(3, Math.min(6, availableRows));

  const currentPreset = AGENT_MODELS.find((m) => m.id === currentConfig.model);
  const defaultCategory =
    currentPreset?.category ||
    (currentConfig.provider === 'gemini' ? 'gemini' : currentConfig.provider === 'openrouter' ? 'free' : 'free');

  p.intro(chalk.bold.hex('#00FF7F')('🤖 OpenCode AI Agent & Model Selector'));

  // 1. Choose Category (or use initialCategory shortcut)
  let categoryChoice: string | null | undefined = initialCategory;
  if (!categoryChoice) {
    categoryChoice = await interactiveSelect({
      message: 'Select Agent Category:',
      initialValue: defaultCategory,
      maxItems: selectMaxItems,
      options: [
        {
          value: 'free',
          label: `${chalk.bold.green('🌟 100% Free Tier Agents')} ${chalk.dim('(OpenRouter Free, Particle-1, Gemma, Nemotron)')}`,
          hint: '13+ verified zero-plan free models',
        },
        {
          value: 'zen',
          label: `${chalk.bold.hex('#00E5FF')('⚡ OpenCode & Freebuff Built-in Free Roster')} ${chalk.dim('(DeepSeek V4.1 Free, GLM 5.3 Free, Solar, MiMo)')}`,
          hint: 'Built-in $0 endpoints: Zero-Retention, NVIDIA Trials, Freebuff allowances',
        },
        {
          value: 'live_sync',
          label: `${chalk.bold.hex('#00FFFF')('🔄 Live Sync: Fetch ALL Free Models from OpenRouter')} ${chalk.dim('(Real-time)')}`,
          hint: 'Queries OpenRouter API live for every free model active right now',
        },
        {
          value: 'gemini',
          label: `${chalk.bold.yellow('🔷 Google Gemini Free Suite')} ${chalk.dim('(Gemini 2.0/2.5/3.5 Flash & Pro, 1.5 Flash)')}`,
          hint: '1M - 2M tokens context, 1,500 req/day 100% free',
        },
        {
          value: 'deepseek',
          label: `${chalk.bold.hex('#00D2FF')('🧠 DeepSeek Frontier Models')} ${chalk.dim('(DeepSeek V4.1, R1 Reasoner, Distill 70B)')}`,
          hint: '5M free tokens on DeepSeek platform, Groq & OpenRouter',
        },
        {
          value: 'hy4',
          label: `${chalk.bold.hex('#FF6D00')('⚡ Tencent HY4 Suite')} ${chalk.dim('(Hy4 Flash, Hy4 1M Frontier, Hy4 Preview)')}`,
          hint: '1M tokens context, free promotional tokens',
        },
        {
          value: 'glm',
          label: `${chalk.bold.hex('#7C4DFF')('🚀 Zhipu AI GLM 5.3 Suite')} ${chalk.dim('(GLM 5.3 Flash, GLM 5.3 1M, FlashX, Prime)')}`,
          hint: '1M tokens, daily free tokens on BigModel & OpenRouter',
        },
        {
          value: 'groq',
          label: `${chalk.bold.hex('#FF9900')('⚡ Groq Cloud Free Tier')} ${chalk.dim('(Llama 3.3 70B, Qwen Coder)')}`,
          hint: '14,400 requests/day, 500+ tokens/sec',
        },
        {
          value: 'flagship',
          label: `${chalk.bold.hex('#FFD700')('👑 Frontier Flagship Coding Agents')} ${chalk.dim('(Claude 3.5 Sonnet, GPT-4o, o3-mini, Codestral)')}`,
          hint: 'OpenCode SOTA benchmark models (OpenRouter BYOK)',
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
    });

    if (!categoryChoice || p.isCancel(categoryChoice)) return null;
  }

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

  // CRITICAL FIX: Ensure initialValue exists in modelOptions!
  // If initialValue is not in options, @clack/core fails to set focus/cursor, breaking Enter selection.
  const hasMatch = modelOptions.some((m) => m.value === currentConfig.model);
  const safeInitialValue = hasMatch ? currentConfig.model : modelOptions[0]?.value;

  const selectedModelId = await interactiveSelect({
    message: 'Select AI Model:',
    initialValue: safeInitialValue,
    maxItems: selectMaxItems,
    options: modelOptions,
  });

  if (!selectedModelId || p.isCancel(selectedModelId)) return null;

  const preset =
    modelsToShow.find((m) => m.id === selectedModelId) ||
    AGENT_MODELS.find((m) => m.id === selectedModelId);

  if (!preset) return null;

  const targetProvider = preset.provider;
  let targetApiKey = currentConfig.apiKey;
  let targetBaseURL = preset.baseURL || currentConfig.baseURL;

  // Check if provider switch is required or if custom base URL changed (e.g. Groq vs DeepSeek vs Cerebras)
  const isCustomBaseUrlChange =
    targetProvider === 'custom' &&
    preset.baseURL &&
    currentConfig.baseURL &&
    preset.baseURL !== currentConfig.baseURL;

  if (targetProvider !== currentConfig.provider || isCustomBaseUrlChange) {
    const saved = currentConfig.savedProviders?.[targetProvider];

    if (saved && saved.apiKey && !isCustomBaseUrlChange) {
      targetApiKey = saved.apiKey;
      targetBaseURL = preset.baseURL || saved.baseURL;
    } else {
      // Need API key for the new provider
      const serviceName = preset.baseURL?.includes('groq.com')
        ? 'Groq Cloud'
        : preset.baseURL?.includes('deepseek.com')
        ? 'DeepSeek'
        : preset.baseURL?.includes('cerebras.ai')
        ? 'Cerebras'
        : PROVIDER_LABELS[targetProvider];

      const serviceUrl = preset.baseURL?.includes('groq.com')
        ? 'https://console.groq.com/keys'
        : preset.baseURL?.includes('deepseek.com')
        ? 'https://platform.deepseek.com/api_keys'
        : preset.baseURL?.includes('cerebras.ai')
        ? 'https://cloud.cerebras.ai'
        : PROVIDER_KEY_URLS[targetProvider];

      p.note(
        `${chalk.white('Get API key for ' + serviceName + ':')}\n` +
          `${chalk.bold.underline.cyan(serviceUrl)}\n`,
        chalk.bold('API Key Required')
      );

      const enteredKey = (await p.password({
        message: chalk.cyan(`Enter API Key for ${serviceName}:`),
        validate: (v) => (!v || v.trim().length === 0 ? 'Key cannot be empty!' : undefined),
      })) as string;

      if (p.isCancel(enteredKey)) return null;
      targetApiKey = enteredKey.trim();
      targetBaseURL = preset.baseURL;
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

/**
 * Search for an available preset by model ID or fuzzy name.
 */
export function findModelByQuery(query: string): AgentModelPreset | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  // 1. Exact ID
  const exact = AGENT_MODELS.find((m) => m.id.toLowerCase() === q);
  if (exact) return exact;

  // 2. Starts with ID
  const starts = AGENT_MODELS.find((m) => m.id.toLowerCase().startsWith(q));
  if (starts) return starts;

  // 3. Substring ID
  const sub = AGENT_MODELS.find((m) => m.id.toLowerCase().includes(q));
  if (sub) return sub;

  // 4. Name substring
  const nameSub = AGENT_MODELS.find((m) => m.name.toLowerCase().includes(q));
  if (nameSub) return nameSub;

  return null;
}

/**
 * Switch model directly to a target preset without showing the full interactive menu.
 */
export async function applyModelDirect(
  preset: AgentModelPreset,
  currentConfig: BanglaCLIConfig
): Promise<BanglaCLIConfig | null> {
  const targetProvider = preset.provider;
  let targetApiKey = currentConfig.apiKey;
  let targetBaseURL = preset.baseURL || currentConfig.baseURL;

  const isCustomBaseUrlChange =
    targetProvider === 'custom' &&
    preset.baseURL &&
    currentConfig.baseURL &&
    preset.baseURL !== currentConfig.baseURL;

  if (targetProvider !== currentConfig.provider || isCustomBaseUrlChange) {
    const saved = currentConfig.savedProviders?.[targetProvider];

    if (saved && saved.apiKey && !isCustomBaseUrlChange) {
      targetApiKey = saved.apiKey;
      targetBaseURL = preset.baseURL || saved.baseURL;
    } else {
      prepareInteractiveArea(
        PROVIDER_LABELS[currentConfig.provider] || currentConfig.provider,
        currentConfig.model,
        'build'
      );

      const serviceName = preset.baseURL?.includes('groq.com')
        ? 'Groq Cloud'
        : preset.baseURL?.includes('deepseek.com')
        ? 'DeepSeek'
        : preset.baseURL?.includes('cerebras.ai')
        ? 'Cerebras'
        : PROVIDER_LABELS[targetProvider];

      const serviceUrl = preset.baseURL?.includes('groq.com')
        ? 'https://console.groq.com/keys'
        : preset.baseURL?.includes('deepseek.com')
        ? 'https://platform.deepseek.com/api_keys'
        : preset.baseURL?.includes('cerebras.ai')
        ? 'https://cloud.cerebras.ai'
        : PROVIDER_KEY_URLS[targetProvider];

      p.note(
        `${chalk.white('Get API key for ' + serviceName + ':')}\n` +
          `${chalk.bold.underline.cyan(serviceUrl)}\n`,
        chalk.bold('API Key Required')
      );

      const enteredKey = (await p.password({
        message: chalk.cyan(`Enter API Key for ${serviceName}:`),
        validate: (v) => (!v || v.trim().length === 0 ? 'Key cannot be empty!' : undefined),
      })) as string;

      if (p.isCancel(enteredKey)) return null;
      targetApiKey = enteredKey.trim();
      targetBaseURL = preset.baseURL;
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
  return updatedConfig;
}
