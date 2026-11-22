# 🇧🇩 banglaCLI

> **The Autonomous, Lightweight BYOK AI Coding Agent in Your Terminal — Fluent in Bangla, Banglish & English.**

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

**banglaCLI** is an open-source, serverless terminal coding assistant designed from the ground up for developers who think, speak, and code in **বাংলা (Bangla)**, **Banglish**, or **English**.

It is 100% **BYOK (Bring Your Own Key)** — you don't need costly subscriptions. Connect your free **Google Gemini** API key (generous free rate limits) or **OpenRouter** free models (DeepSeek, GLM, Llama) and start building software right inside your terminal.

---

## ✨ Features

- 🇧🇩 **Trilingual Native Fluency**:
  - **Bangla (বাংলা লিপি):** *"একটি Express.js REST API বানাও JWT auth সহ"*
  - **Banglish:** *"Ekta React counter app banaye dao Tailwind CSS diye"*
  - **English:** *"Build a full-stack Next.js portfolio website"*
- ⚡ **100% BYOK & Serverless**:
  - No middleman backend. Your API keys are stored locally on your machine via `conf`.
  - Supports **Google Gemini** (`gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-pro`).
  - Supports **OpenRouter** (`deepseek/deepseek-chat:free`, `zhipu/glm-4:free`, etc.).
  - Supports **Custom OpenAI-Compatible** endpoints (DeepSeek API, Ollama, Groq, vLLM).
- 🛠️ **Autonomous Project Builder (4 Native Tools)**:
  - `list_files(dirPath)`: Explores workspace directory hierarchy (auto-ignoring `node_modules` and `.git`).
  - `read_file(filePath)`: Inspects existing source code before editing.
  - `write_file(filePath, content)`: Creates folders automatically and writes complete, production-ready code.
  - `run_command(command)`: Executes terminal commands (`npm install`, `npm test`, `git init`, etc.).
- 🛡️ **Interactive Safety Confirmation**:
  - Prompts you `[Y/n/a]` before modifying files or executing shell commands.
  - Includes a *"Yes to all (Auto-approve for this session)"* mode for hands-free autonomous building.
- 💬 **Interactive Chat REPL & Slash Commands**:
  - `/provider`: Switch between Gemini, OpenRouter, and Custom providers on the fly.
  - `/model`: Switch models on the fly without restarting.
  - `/config`: Re-run full provider and API key setup wizard.
  - `/clear`: Reset conversation history and free context memory.
  - `/help`: Display commands guide and tool manual.
  - `/exit`: Cleanly exit the session.

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

Simply run:

```bash
banglaCLI
```

If it's your first time, the interactive setup wizard will guide you to select a provider and enter your API key:

1. **Google Gemini (Free Tier - Recommended)**
   - Get key: [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   - Default model: `gemini-3.8-flash`
2. **OpenRouter (Free Models)**
   - Get key: [openrouter.ai/keys](https://openrouter.ai/keys)
   - Default model: `deepseek/deepseek-chat:free`
3. **Custom OpenAI-Compatible (Groq, Ollama, DeepSeek)**
   - Groq Cloud (Free): [console.groq.com/keys](https://console.groq.com/keys) (Base URL: `https://api.groq.com/openai/v1`)
   - Local Offline (Ollama): `http://localhost:11434/v1` (100% Free & offline)

To view the interactive free API guide:
```bash
banglaCLI guide
```

To reconfigure anytime:
```bash
banglaCLI config
```

---

## 💻 CLI Usage

```text
Usage: banglaCLI [options] [command]

Autonomous BYOK terminal coding agent that speaks Bangla, Banglish & English.

Options:
  -v, --version          Output current version
  -m, --model <model>    Override model for this session
  -p, --prompt <prompt>  Run a single prompt and exit directly
  -y, --yes              Auto-approve all file writes and shell commands
  -h, --help             Display help for command

Commands:
  config                 Run interactive setup wizard
  guide (alias: keys)    Display free API keys & models guide
```

### Examples

**Interactive Mode:**
```bash
banglaCLI
```

**Auto-Approve Autonomous Building:**
```bash
banglaCLI -y
```

**Single Command Execution:**
```bash
banglaCLI -p "Ekta Node.js CLI tool banaw jeta weather show kore" -y
```

**Override Model on Launch:**
```bash
banglaCLI -m "gemini-2.0-flash"
```

---

## 🛠️ Slash Commands inside Chat

| Command | Description |
|---|---|
| `/help` | Display command usage and tool reference |
| `/guide` | Display direct links & guides for free API keys & models |
| `/limits` | View free token quotas, context windows & rate limits |
| `/provider` | Switch between Gemini, OpenRouter, or custom providers |
| `/model` | Switch between models for the active provider |
| `/config` | Full interactive setup to re-configure keys, provider, and endpoint |
| `/clear` | Clear conversation memory and reset token context |
| `/exit` | Exit the CLI session |

---

## 🔑 Free API Keys & Models Guide (১০০% ফ্রি API গাইড)

You don't need to spend any money or enter credit cards to use `banglaCLI`. Here are the top free options:

### 1. Google Gemini (Google AI Studio) — 🌟 Recommended
- **Key URL:** [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
- **Steps:** Sign in with Google account ➔ Click **Create API Key** ➔ Copy the key.
- **Recommended Free Model:** `gemini-3.8-flash` (Fast, high rate limits, excels at code generation).
- **Alternative Free Models:** `gemini-2.0-flash`, `gemini-1.5-pro`.
- **Free Limit:** 15 Requests per minute (RPM) and 1,500 Requests per day (RPD) free of charge!

### 2. OpenRouter (Access DeepSeek & Llama for Free)
- **Key URL:** [openrouter.ai/keys](https://openrouter.ai/keys)
- **Steps:** Sign in with GitHub or Google ➔ Click **Create Key** ➔ Copy the key.
- **Top Free Models (`:free`):**
  - `deepseek/deepseek-chat:free` — Outstanding coding and full-stack software development.
  - `zhipu/glm-4:free` — Fast, versatile code completions.
  - `meta-llama/llama-3.3-70b-instruct:free` — High intelligence 70B open model.
  - `google/gemini-2.0-flash-exp:free` — Experimental free flash model.
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
| **Google Gemini** | `gemini-2.0-flash` | **1,048,576** tokens | 15 RPM | **1,000,000** TPM | **1,500** RPD |
| **Google Gemini** | `gemini-1.5-flash` | **1,048,576** tokens | 15 RPM | **1,000,000** TPM | **1,500** RPD |
| **Google Gemini** | `gemini-3.8-flash` | **1,048,576** tokens | 15 RPM | **1,000,000** TPM | **1,500** RPD |
| **Google Gemini** | `gemini-1.5-pro` | **2,097,152** tokens | 2 RPM | 32,000 TPM | 50 RPD |
| **OpenRouter** | `deepseek/deepseek-chat:free` | 128,000 tokens | 20 RPM | Generous Free | ~200 RPD |
| **OpenRouter** | `zhipu/glm-4:free` | 128,000 tokens | 20 RPM | Generous Free | ~200 RPD |
| **Groq Cloud** | `llama-3.3-70b-versatile` | 128,000 tokens | 30 RPM | 6,000 TPM | **14,400** RPD |
| **Ollama (Local)** | `qwen2.5-coder` | Hardware limit | **Unlimited** | **Unlimited** | **Unlimited** |

> 🛡️ **Auto-Failover Protection:** If a model temporarily returns 503 (High Demand), `banglaCLI` automatically reroutes your request to a stable fallback model (`gemini-2.0-flash` or `gemini-1.5-flash`) so your building process never crashes!

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
