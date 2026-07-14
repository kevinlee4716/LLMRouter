# LLMRouter

🌐 [中文文档](README.md) | English

**Self-hosted LLM API Gateway — unify multiple AI providers behind one OpenAI-compatible API**

Aggregate Google, Groq, Cerebras, Mistral, OpenRouter, GitHub Models, Cloudflare, Cohere, Zhipu AI, Alibaba Bailian, Baidu Qianfan, SiliconFlow and more behind a single `/v1` endpoint. Keys are encrypted locally, the router automatically picks the best available model, and switches when a provider hits rate limits.

🌐 **Website**: [llmrouter.kevinlee.bond](https://llmrouter.kevinlee.bond) | ⭐ **GitHub**: [kevinlee4716/LLMRouter](https://github.com/kevinlee4716/LLMRouter)

---

## Table of Contents

- [Overview](#overview)
- [Getting Started](#getting-started)
  - [🤖 Desktop Agent One-Click Deploy (Recommended)](#-desktop-agent-one-click-deploy-recommended)
  - [Prerequisites](#prerequisites)
  - [macOS](#macos)
  - [Linux](#linux)
  - [Windows](#windows)
- [Start & Stop](#start--stop)
- [First-Time Use](#first-time-use)
- [API Usage](#api-usage)
- [Configuration Reference](#configuration-reference)
- [Architecture](#architecture)
- [Project Structure](#project-structure)

---

## Overview

LLMRouter is a self-hosted LLM API gateway that runs locally with no external dependencies. **All data (keys, logs, configuration) is stored in local SQLite** — your API keys never leave your machine.

### Key Features

- **OpenAI-Compatible API** — `POST /v1/chat/completions` works with any OpenAI SDK client; just change `base_url`
- **Anthropic Messages API** — `POST /v1/messages` supports Claude Code and the official Anthropic SDK
- **Automatic Failover** — Switches models on 429/5xx/timeout, up to 20 retries
- **Smart Routing** — Pass `model="auto"` to let the system pick the best model, or specify one directly
- **Encrypted Key Storage** — AES-256-GCM encryption; only you can decrypt
- **Management Dashboard** — Web UI to manage keys, adjust routing priorities, view analytics, run Playground
- **Streaming & Tool Calls** — SSE streaming and OpenAI function calling support
- **Lightweight** — ~40MB idle memory; runs on any machine

### Supported Providers

Google · Groq · Cerebras · Mistral · OpenRouter · GitHub Models · Cloudflare · Cohere · NVIDIA · HuggingFace · Ollama Cloud · AI Horde · Zhipu AI · Alibaba Bailian · Baidu Qianfan · SiliconFlow · Custom OpenAI-compatible endpoints (Ollama / vLLM / LM Studio, etc.)

---

## Getting Started

### 🤖 Desktop Agent One-Click Deploy (Recommended)

If you use **Kimi Work**, **MiniMax Agent**, **Alibaba QoderWork**, **Tencent WorkBuddy**, **Hermes**, **OpenClaw**, **ChatGPT**, **Cursor**, or any other desktop AI agent, deployment takes a single sentence:

> Help me deploy https://github.com/kevinlee4716/LLMRouter locally

The agent will automatically clone the repo, install dependencies, build the project, and start the service — no manual steps needed.

### Prerequisites

- **Node.js 20+** (22.x LTS recommended)
- **npm 10+** (included with Node.js)

> Don't have Node.js yet? Download the LTS version from [https://nodejs.org](https://nodejs.org).

### macOS

**1. Unzip the project**

```bash
unzip LLMRouter.zip -d LLMRouter
cd LLMRouter
```

**2. Start**

```bash
chmod +x start.sh
./start.sh start
```

The first run automatically installs dependencies (~1-3 min), generates config files, and starts the service.

**3. Open your browser**

The dashboard opens automatically. If not, manually visit:

| Purpose | URL |
|------|------|
| Dashboard (Frontend) | `http://localhost:10130` |
| Backend API | `http://localhost:2210` |

> The dashboard runs on port 10130, the backend API on port 2210. The frontend automatically proxies `/v1` and `/api` requests to the backend.

### Linux

Same steps as macOS:

```bash
# Unzip
unzip LLMRouter.zip -d LLMRouter
cd LLMRouter

# Grant execute permission and start
chmod +x start.sh
./start.sh start
```

> Note: If `unzip` is missing, run `sudo apt install unzip` (Debian/Ubuntu) or `sudo yum install unzip` (CentOS/RHEL) first.

### Windows

**1. Unzip**

Right-click LLMRouter.zip → Extract to current folder

**2. Start**

Double-click `start.bat`, select `[1] Start service` from the menu.

**3. Open your browser**

A command prompt window opens and the dashboard loads in your browser within seconds. If not, manually visit:

| Purpose | URL |
|------|------|
| Dashboard (Frontend) | `http://localhost:10130` |
| Backend API | `http://localhost:2210` |

> The dashboard runs on port 10130, the backend API on port 2210. The frontend automatically proxies `/v1` and `/api` requests to the backend.

---

## Start & Stop

### macOS / Linux

| Action | Command |
|------|------|
| Start | `./start.sh start` |
| Stop | `./start.sh stop` |
| Restart | `./start.sh restart` |
| Status | `./start.sh status` |
| Interactive Menu | `./start.sh` (no arguments) |

> **Foreground mode** (default): Press `Ctrl + C` to safely exit.

### Windows

| Action | Method |
|------|------|
| Start | Double-click `start.bat`, select `[1] Start service` |
| Stop | **Close the command prompt window**, or run `start.bat stop` |
| Restart | Run `start.bat restart` |
| Status | Run `start.bat status` |

> On Windows, the service runs in a new command prompt window. **Closing that window = stopping the service**. Minimize it if you don't want to see it.

---

## First-Time Use

1. Open the dashboard at `http://localhost:10130`
2. If prompted for a Setup Code, find it in the terminal output (looks like `Setup code: XXXXXXXXXX`)
3. Create an admin account (username + password)
4. After login, add provider API keys on the **Keys** page
5. Adjust model priorities on the **Gateway Routing** page
6. Get your unified API key and endpoint address on the **Outbound API** page
7. Point your AI client to `http://localhost:2210/v1`

---

## API Usage

### Python (OpenAI SDK)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:2210/v1",
    api_key="llmrouter-xxxxxxxx",  # Get this from Dashboard → Outbound API
)

response = client.chat.completions.create(
    model="auto",  # Auto-routing: the system picks the best model
    messages=[{"role": "user", "content": "Hello, tell me about yourself"}],
)
print(response.choices[0].message.content)
```

### cURL

```bash
curl http://localhost:2210/v1/chat/completions \
  -H "Authorization: Bearer llmrouter-xxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### Streaming

```python
stream = client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "Write a poem"}],
    stream=True,
)
for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

### Claude Code

```bash
export ANTHROPIC_BASE_URL=http://localhost:2210
export ANTHROPIC_AUTH_TOKEN=llmrouter-xxxxxxxx
claude
```

---

## Configuration Reference

All configuration is managed via the `.env` file. It is auto-generated on first run — no manual creation needed.

| Variable | Default | Description |
|------|--------|------|
| `PORT` | `2210` | Backend API listening port |
| `ENCRYPTION_KEY` | Auto-generated | API key encryption key (64-char hex) |
| `HOST` | `::` | Listen address; use `127.0.0.1` to restrict to localhost |
| `PROXY_RATE_LIMIT_RPM` | `120` | Max requests per minute per IP |
| `RESPONSE_CACHE` | `false` | Enable response caching |

> **Port explanation**: The backend API runs on `PORT` (default 2210), the dashboard runs on Vite dev server port 10130. The frontend automatically proxies `/v1` and `/api` requests to the backend. For daily use, just access `http://localhost:10130`.

See [`.env.example`](./.env.example) for all available configuration options.

---

## Architecture

```
┌──────────────┐   Bearer Token   ┌──────────────────────┐
│  AI Client   │ ────────────────▶ │  Express Backend     │
│  SDK / CLI   │ ◀──────────────── │  (:2210)             │
└──────────────┘    Stream Tokens  │  /v1/chat/completions│
                                    └──────────┬───────────┘
                                               │
                                               ▼
                       ┌───────────────────────────────────────┐
                       │  Router                                │
                       │  1. Pick highest-priority available    │
                       │  2. Decrypt key, call provider API     │
                       │  3. 429/5xx → cooldown + switch next  │
                       └───────────────────────────────────────┘
                                        │
    ┌──────────┬──────────┬─────────────┼──────────┬──────────┐
    ▼          ▼          ▼             ▼          ▼          ▼
  Google     Groq    Cerebras      OpenRouter   ZhipuAI   ...more

┌──────────────┐                ┌──────────────────────┐
│  Browser     │ ──────────────▶│  Vite Frontend (:10130)│
│  Dashboard   │ ◀──────────────│  React + TailwindCSS  │
└──────────────┘     Assets     └──────────┬───────────┘
                                           │ proxy /v1 /api
                                           ▼
                               ┌──────────────────────┐
                               │  Express Backend     │
                               │  (:2210)             │
                               └──────────────────────┘
```

- **Routing Engine** — Automatic model selection per request, with `model="auto"` smart routing
- **Rate Limiting** — In-memory RPM/RPD/TPM/TPD counters to stay within free tier limits
- **Provider Adapters** — Each provider has a dedicated adapter; adding a new provider means adding one file
- **Health Checks** — Periodic key status probing, auto-marks unavailable keys
- **Dashboard** — React + Vite + TailwindCSS (dev server port 10130, API proxied to backend 2210)
- **Storage** — SQLite + AES-256-GCM encryption

---

## Project Structure

```
LLMRouter/
├── client/                 # React + Vite management dashboard
│   └── src/
│       ├── components/     # UI components
│       ├── pages/          # Page views
│       ├── i18n/           # Internationalization (zh/en)
│       └── lib/            # API client
├── server/                 # Express.js backend
│   └── src/
│       ├── providers/      # Provider adapters
│       ├── routes/         # API routes
│       ├── services/       # Router, rate limiter, health check
│       ├── db/             # SQLite + migrations
│       ├── lib/            # Utility functions
│       └── middleware/     # Middleware
├── shared/                 # Shared TypeScript types
├── start.sh                # macOS / Linux startup script
├── start.bat               # Windows startup script
├── .env.example            # Environment variable reference
└── README.md
```
