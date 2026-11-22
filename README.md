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
  - `/model`: Switch models on the fly without restarting.
  - `/config`: Re-run provider and API key setup.
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
   - Default model: `gemini-2.5-flash`
2. **OpenRouter (Free Models)**
   - Get key: [openrouter.ai/keys](https://openrouter.ai/keys)
   - Default model: `deepseek/deepseek-chat:free`
3. **Custom OpenAI-Compatible**
   - Use any endpoint: `https://api.deepseek.com/v1`, local `http://localhost:11434/v1` (Ollama), etc.

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
| `/model` | Switch between Gemini, OpenRouter, or custom models |
| `/config` | Change API key, provider, or endpoint URL |
| `/clear` | Clear conversation memory and reset token context |
| `/exit` | Exit the CLI session |

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
