# 🇧🇩 banglacli

> **The Autonomous, Lightweight BYOK AI Coding Agent in Your Terminal — Fluent in Bangla, Banglish & English with OpenCode-Style Build & Plan Modes.**

[![npm version](https://img.shields.io/npm/v/banglacli.svg?style=flat-square&color=00FF66)](https://www.npmjs.com/package/banglacli)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg?style=flat-square)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![BYOK](https://img.shields.io/badge/BYOK-100%25%20Serverless-blue.svg?style=flat-square)](#-bring-your-own-key-byok)

```
  ██████╗  █████╗ ███╗   ██╗ ██████╗ ██╗      █████╗  ██████╗██╗     ██╗
  ██╔══██╗██╔══██╗████╗  ██║██╔════╝ ██║     ██╔══██╗██╔════╝██║     ██║
  ██████╔╝███████║██╔██╗ ██║██║  ███╗██║     ███████║██║     ██║     ██║
  ██╔══██╗██╔══██║██║╚██╗██║██║   ██║██║     ██╔══██║██║     ██║     ██║
  ██████╔╝██║  ██║██║ ╚████║╚██████╔╝███████╗██║  ██║╚██████╗███████╗██║
  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝ ╚═════╝╚══════╝╚═╝
```

---

## 🌟 Overview

**banglacli** is an open-source, serverless terminal coding assistant designed from the ground up for developers who think, speak, and code in **বাংলা (Bangla)**, **Banglish**, or **English**.

It brings the best of modern agent design (like OpenCode):
- **🔄 Smart Auto-Cascade Resilience:** If a model's free token quota or rate limit (429/503) is reached, it seamlessly rotates to the next available intelligent free model in the chain without dropping conversation context!
- **⚡ BUILD Mode:** Full autonomous development — reads and writes code, builds packages, runs tests and shell commands.
- **📋 PLAN Mode:** Senior architect mode — read-only codebase exploration, architecture analysis, and concrete step-by-step implementation plans.
- **Live Status Bar:** Displays the currently active model, mode, and cascade indicator directly above your prompt.

It is 100% **BYOK (Bring Your Own Key)** — you don't need costly subscriptions. Connect your free **Google Gemini** API key or **OpenRouter** free models (Particle-1, Nemotron, Gemma 4, ERNIE, Groq) and start building software right inside your terminal.

---

## ✨ Features

- 🧠 **Superior Autonomous AI Brain (Outperforming Legacy Agents)**:
  - **Self-Healing Codebase:** If a build command or test fails, the agent inspects compiler logs and stack traces, edits the files, and verifies the fix autonomously.
  - **Zero Placeholder Code Rule:** Writes 100% complete, production-grade files. No `// TODO`, no skipped code.
- 🔄 **Intelligent Multi-Model Auto-Cascade**:
  - Automatically cascades when tokens run out or rate limits hit (`openrouter/free` ➔ `particle-ai/particle-1:free` ➔ `nvidia/nemotron-3-ultra-550b:free` ➔ `google/gemma-4-31b-it:free` ➔ Gemini 2.0 Flash).
- 🇧🇩 **Trilingual Native Fluency**:
  - **Bangla (বাংলা লিপি):** *"একটি Express.js REST API বানাও JWT auth সহ"*
  - **Banglish:** *"Ekta React counter app banaye dao Tailwind CSS diye"*
  - **English:** *"Build a full-stack Next.js portfolio website"*
- ⚡ **OpenCode-Style Build & Plan Modes**:
  - `⚡ BUILD Mode`: Autonomous builder with tools to create files, install dependencies, and run commands.
  - `📋 PLAN Mode`: Safe read-only mode to analyze codebase, design architecture, and formulate plans without modifying files.
  - Switch anytime with `/mode`, `/plan`, or `/build`.
- 📊 **Real-Time Model & Mode Status Indicator**:
  - Displays `[⚡ BUILD MODE] [🤖 openrouter/free] [🔄 Auto-Cascade Active]` right above the prompt so you always know what model you are running.
- ⚡ **100% BYOK & Serverless**:
  - No middleman backend. Your API keys are stored locally on your machine via `conf`.
  - Supports **Google Gemini** (`gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-3.5-flash`, `gemini-3.8-flash`).
  - Supports **Tencent HY4** (`tencent/hy4-flash`, `tencent/hy4`, `tencent/hy4-preview` - 1M token context).
  - Supports **Zhipu AI GLM 5.3** (`z-ai/glm-5.3-flash`, `z-ai/glm-5.3`, `z-ai/glm-5.3-flashx`, `z-ai/glm-5.3-prime`).
  - Supports **DeepSeek Frontier** (`deepseek-chat` [5M free tokens], `deepseek-reasoner` [R1], `deepseek/deepseek-v4.1-flash`).
  - Supports **OpenRouter Free Tier** (`openrouter/free`, `particle-ai/particle-1:free`, `nvidia/nemotron-3-ultra-550b-a55b:free`, `google/gemma-4-31b-it:free`, `dots-studio/dots-3-note-preview:free`).
  - Supports **Custom OpenAI-Compatible** endpoints (Groq Cloud, Ollama, DeepSeek API, BigModel).
- 🛠️ **Autonomous Project Builder (4 Native Tools)**:
  - `list_files(dirPath)`: Explores workspace directory hierarchy (auto-ignoring `node_modules` and `.git`).
  - `read_file(filePath)`: Inspects existing source code before editing.
  - `write_file(filePath, content)`: Creates folders automatically and writes complete, production-ready code.
  - `run_command(command)`: Executes terminal commands (`npm install`, `npm test`, `git init`, etc.).
- 🛡️ **Interactive Safety Confirmation**:
  - Prompts you `[Y/n/a]` before modifying files or executing shell commands.
  - Includes a *"Yes to all (Auto-approve for this session)"* mode for hands-free autonomous building.

---

## 🚀 Quick Start

### Installation

Install globally via npm:

```bash
npm install -g banglacli
```

Or run directly without installing:

```bash
npx banglacli
```

### First-Time Setup

Simply type:

```bash
banglacli
```

If it's your first time, the interactive setup wizard will guide you to select a provider and enter your API key:

1. **Google Gemini (Free Tier - Recommended)**
   - Get key: [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   - Default models: `gemini-3.5-flash-lite` (🌟 100% Free & Active) / `gemini-3.1-flash-lite` / `gemini-3.5-flash` (1M token context, 1,500 RPD free)
2. **OpenRouter (100% Free Coding Models)**
   - Get key: [openrouter.ai/keys](https://openrouter.ai/keys)
   - Auto-router: `openrouter/free` (zero downtime)
   - 1M token free models: `particle-ai/particle-1:free`, `nvidia/nemotron-3-ultra-550b-a55b:free`, `baidu/ernie-5.5-flash-preview:free`, `inclusionai/ling-3.2-flash:free`, `google/gemma-4-31b-it:free`
3. **Custom OpenAI-Compatible (Groq, Ollama, DeepSeek)**
   - Groq Cloud (Free): [console.groq.com/keys](https://console.groq.com/keys) (Base URL: `https://api.groq.com/openai/v1`)
   - Local Offline (Ollama): `http://localhost:11434/v1` (100% Free & offline)

To view the interactive free API guide:
```bash
banglacli guide
```

To reconfigure anytime:
```bash
banglacli config
```

---

## 💻 CLI Usage

```text
Usage: banglacli [options] [command]

Autonomous BYOK terminal coding agent that speaks Bangla, Banglish & English.

Options:
  -v, --version          Output current version
  -m, --model <model>    Override model for this session
  -M, --mode <mode>      Agent mode: "build" (default) or "plan"
  -p, --prompt <prompt>  Run a single prompt and exit directly
  -y, --yes              Auto-approve all file writes and shell commands
  -h, --help             Display help for command

Commands:
  config                 Run interactive setup wizard
  guide (alias: keys)    Display free API keys & models guide
  limits (alias: tokens) Display free token limits & context windows
  agent (alias: model)   OpenCode-style AI agent & model selector
  mode                   Display agent modes guide
```

### Examples

**Interactive Mode:**
```bash
banglacli
```

**Launch directly in PLAN Mode:**
```bash
banglacli -M plan
```

**Auto-Approve Autonomous Building:**
```bash
banglacli -y
```

**Single Command Execution:**
```bash
banglacli -p "Ekta Node.js CLI tool banaw jeta weather show kore" -y
```

---

## 🛠️ Slash Commands inside Chat

| Command | Description |
|---|---|
| `/mode` | **Toggle between BUILD Mode and PLAN Mode** (OpenCode style) |
| `/plan` | Switch directly to **PLAN Mode** (read-only architectural planning) |
| `/build` | Switch directly to **BUILD Mode** (autonomous coding & execution) |
| `/agent` (or `/model`) | **OpenCode-Style Agent Selector** (Free, Flagship, Gemini, Local) |
| `/provider` | Switch between Gemini, OpenRouter, or custom providers |
| `/limits` | View free token quotas, context windows & rate limits |
| `/guide` | Display direct links & guides for free API keys & models |
| `/config` | Full interactive setup to re-configure keys, provider, and endpoint |
| `/clear` | Clear conversation memory and reset token context |
| `/exit` | Exit the CLI session |

---

## 🔑 Free API Keys & Models Guide (১০০% ফ্রি API গাইড)

You don't need to spend any money or enter credit cards to use `banglaCLI`. Here are the top free options:

### 1. Google Gemini (Google AI Studio) — 🌟 Recommended
- **Key URL:** [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
- **Steps:** Sign in with Google account ➔ Click **Create API Key** ➔ Copy the key.
- **Recommended Free Model:** `gemini-3.5-flash-lite` (🌟 100% Free, active, fast, high rate limits).
- **Alternative Free Models:** `gemini-3.1-flash-lite`, `gemini-3.5-flash`, `gemini-3.8-flash`.
- **Free Limit:** 15 Requests per minute (RPM) and 1,500 Requests per day (RPD) free of charge!

### 2. OpenRouter (Access 100% Free Frontier Models)
- **Key URL:** [openrouter.ai/keys](https://openrouter.ai/keys)
- **Steps:** Sign in with GitHub or Google ➔ Click **Create Key** ➔ Copy the key.
- **Top Free Models (`:free`):**
  - `openrouter/free` — Automatic zero-downtime routing to the best active free model.
  - `particle-ai/particle-1:free` — Specialized 1M token context agentic coding model.
  - `nvidia/nemotron-3-ultra-550b-a55b:free` — Massive 550B frontier model with 1M tokens.
  - `google/gemma-4-31b-it:free` — Google DeepMind 30.7B dense instruction-tuned model.
  - `dots-studio/dots-3-note-preview:free` — 512,000 token context reasoning and code model.
- **Cost:** 100% Free with zero credit card required.

### 3. Groq Cloud (Ultra-Fast 500+ tokens/sec)
- **Key URL:** [console.groq.com/keys](https://console.groq.com/keys)
- **Steps:** Choose `Custom OpenAI-Compatible` in `banglaCLI` ➔ Set Base URL to `https://api.groq.com/openai/v1`.
- **Free Models:** `llama-3.3-70b-versatile`, `qwen-2.5-coder-32b`, `deepseek-r1-distill-llama-70b`.

### 4. Local Offline Models (100% Private via Ollama)
- **Download:** [ollama.com](https://ollama.com)
- **Run in terminal:** `ollama run qwen2.5-coder` or `ollama run deepseek-r1`
- **Steps in banglaCLI:** Choose `Custom OpenAI-Compatible` ➔ Base URL: `http://localhost:11434/v1` ➔ API key: `ollama` (or any string).
- **Cost:** 100% Free, unlimited, runs entirely on your local machine without internet.

---

### 📊 Token Capacities & Free Rate Limits Comparison

| Provider | Model | Context Window | Req / Min (RPM) | Tokens / Min (TPM) | Req / Day (RPD) |
|---|---|---|---|---|---|
| **Google Gemini** | `gemini-3.5-flash-lite` | **1,048,576** tokens | 15 RPM | **1,000,000** TPM | **1,500** RPD |
| **Tencent HY4** | `tencent/hy4-flash` | **1,048,576** tokens | 20 RPM | Generous Free | Promo Tokens |
| **Zhipu AI GLM 5.3** | `z-ai/glm-5.3-flash` | **1,048,576** tokens | 20 RPM | Generous Free | Daily Refreshed |
| **DeepSeek Platform**| `deepseek-chat` (V4.1) | 128,000 tokens | High Speed | 5M Free Tokens | Free Signup |
| **OpenRouter** | `openrouter/free` | 200,000 tokens | 20 RPM | Generous Free | ~200 RPD |
| **OpenRouter** | `particle-ai/particle-1:free` | **1,048,576** tokens | 20 RPM | Generous Free | ~200 RPD |
| **Groq Cloud** | `llama-3.3-70b-versatile` | 128,000 tokens | 30 RPM | 6,000 TPM | **14,400** RPD |
| **Ollama (Local)** | `qwen2.5-coder` | Hardware limit | **Unlimited** | **Unlimited** | **Unlimited** |

> 🛡️ **Auto-Failover Protection:** If a model temporarily returns 503 (High Demand) or quota limit, `banglaCLI` automatically cascades to the next best zero-plan free model (`gemini-3.5-flash-lite`, `openrouter/free`, etc.) so your building process never crashes!

---

## 🏗️ Project Architecture

```
banglacli/
├── src/
│   ├── index.ts     # CLI entry point, commander setup, interactive REPL loop
│   ├── config.ts    # Secure local configuration manager (conf & @clack/prompts)
│   ├── agent.ts     # Autonomous agent orchestrator (Gemini & OpenAI tool calling)
│   ├── tools.ts     # 4 Core workspace tools with interactive safety confirmations
│   └── ui.ts        # ASCII banner, terminal markdown rendering, spinners
├── scripts/
│   └── test-tools.ts# End-to-end tool validation suite
├── package.json     # Node 18+ ESM configuration with bin mappings
├── tsconfig.json    # Strict TypeScript configuration
└── tsup.config.ts   # Fast zero-config bundler
```

---

## 🧪 Development & Testing

Clone the repository and install dependencies:

```bash
git clone https://github.com/banglacli/banglacli.git
cd banglacli
npm install
```

Run TypeScript type check:
```bash
npm run typecheck
```

Run test suite:
```bash
npm test
```

Build distribution bundle:
```bash
npm run build
```

Link locally for testing:
```bash
npm link
banglaCLI --help
```

---

## 📄 License

[MIT](LICENSE) © 2026 BanglaCLI Team. Free and open source for everyone.
