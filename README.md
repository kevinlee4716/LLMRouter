# LLMRouter

**个人自用 LLM 网关路由器 — 统一多个 AI 厂商，一个 API 搞定一切**

将 Google、Groq、Cerebras、Mistral、OpenRouter、GitHub Models、Cloudflare、Cohere、智谱 AI、阿里云百炼、百度千帆、硅基流动等多个 LLM 厂商聚合在一个 `/v1` API 后面。密钥加密存储，路由器自动选择最佳可用模型，某个厂商限流时自动切换到下一个。

🌐 **官网**：[llmrouter.kevinlee.bond](https://llmrouter.kevinlee.bond) | ⭐ **GitHub**：[kevinlee4716/LLMRouter](https://github.com/kevinlee4716/LLMRouter)

---

## 目录

- [项目介绍](#项目介绍)
- [安装部署](#安装部署)
  - [🤖 桌面 Agent 一键部署（推荐）](#-桌面-agent-一键部署推荐)
  - [前置要求](#前置要求)
  - [macOS](#macos)
  - [Linux](#linux)
  - [Windows](#windows)
- [启动与关闭](#启动与关闭)
- [首次使用](#首次使用)
- [API 使用](#api-使用)
- [配置参考](#配置参考)
- [技术架构](#技术架构)
- [项目结构](#项目结构)

---

## 项目介绍

LLMRouter 是一个自托管的 LLM API 网关，在本地运行，不依赖任何外部服务。**所有数据（密钥、日志、配置）都存在本机 SQLite 里**，你的 API 密钥不会泄露到任何第三方。

### 核心功能

- **OpenAI 兼容 API** — `POST /v1/chat/completions` 兼容所有 OpenAI SDK 客户端，只需改 `base_url`
- **Anthropic Messages API** — `POST /v1/messages` 支持 Claude Code 和官方 Anthropic SDK
- **自动故障转移** — 厂商 429/5xx/超时时自动切换下一个模型，最多 20 次尝试
- **智能路由** — 传 `model="auto"` 让系统自动选最优模型，也可指定具体模型名称
- **密钥加密存储** — AES-256-GCM 加密，只有你能解密
- **管理面板** — Web UI 管理密钥、调整路由优先级、查看分析数据、运行 Playground
- **流式 & 工具调用** — 支持 SSE 流式输出和 OpenAI function calling
- **轻量运行** — 空闲时约 40MB 内存，适合任何机器

### 支持的厂商

Google · Groq · Cerebras · Mistral · OpenRouter · GitHub Models · Cloudflare · Cohere · NVIDIA · HuggingFace · Ollama Cloud · AI Horde · 智谱 AI · 阿里云百炼 · 百度千帆 · 硅基流动 · 自定义 OpenAI 兼容端点（Ollama / vLLM / LM Studio 等）

---

## 安装部署

### 🤖 桌面 Agent 一键部署（推荐）

如果你在使用 **Kimi Work**、**MiniMax Agent**、**阿里 QoderWork**、**腾讯 WorkBuddy**、**Hermes**、**OpenClaw**、**ChatGPT**、**Cursor** 等桌面 AI Agent，只需一句话即可完成安装部署：

> 帮我把 https://github.com/kevinlee4716/LLMRouter 在本地安装部署

Agent 会自动完成克隆仓库、安装依赖、构建项目和启动服务，无需手动操作。

---

### 前置要求

- **Node.js 20+**（推荐 22.x LTS）
- **npm 10+**（随 Node.js 一起安装）

> 如果还没装 Node.js，去 [https://nodejs.org](https://nodejs.org) 下载 LTS 版本安装即可。

### macOS

**1. 解压项目**

```bash
unzip LLMRouter.zip -d LLMRouter
cd LLMRouter
```

**2. 启动**

```bash
chmod +x start.sh
./start.sh start
```

首次运行会自动安装依赖（约 1-3 分钟）、生成配置文件、启动服务。

**3. 打开浏览器**

启动完成后浏览器会自动打开管理面板。如果没有自动打开，手动访问：

| 用途 | 地址 |
|------|------|
| 管理面板（前端） | `http://localhost:10130` |
| 后端 API 服务 | `http://localhost:2210` |

> 管理面板运行在 10130 端口，后端 API 运行在 2210 端口。前端会自动将 `/v1` 和 `/api` 请求代理到后端，无需额外配置。

### Linux

与 macOS 步骤完全相同：

```bash
# 解压
unzip LLMRouter.zip -d LLMRouter
cd LLMRouter

# 赋予执行权限并启动
chmod +x start.sh
./start.sh start
```

> 注意：如果系统没有 `unzip`，先执行 `sudo apt install unzip`（Debian/Ubuntu）或 `sudo yum install unzip`（CentOS/RHEL）。

### Windows

**1. 解压**

右键 LLMRouter.zip → 解压到当前文件夹

**2. 启动**

双击 `start.bat`，在弹出的菜单中选择 `[1] 启动服务`

或者直接双击 `start.bat` 后会自动启动。

**3. 打开浏览器**

启动后会弹出命令行窗口，几秒后浏览器自动打开管理面板。如果没有自动打开，手动访问：

| 用途 | 地址 |
|------|------|
| 管理面板（前端） | `http://localhost:10130` |
| 后端 API 服务 | `http://localhost:2210` |

> 管理面板运行在 10130 端口，后端 API 运行在 2210 端口。前端会自动将 `/v1` 和 `/api` 请求代理到后端，无需额外配置。

---

## 启动与关闭

### macOS / Linux

| 操作 | 命令 |
|------|------|
| 启动 | `./start.sh start` |
| 关闭 | `./start.sh stop` |
| 重启 | `./start.sh restart` |
| 查看状态 | `./start.sh status` |
| 交互菜单 | `./start.sh`（无参数） |

> **前台运行时**（默认启动方式）：直接按 `Ctrl + C` 即可安全退出。

### Windows

| 操作 | 方式 |
|------|------|
| 启动 | 双击 `start.bat`，选 `[1] 启动服务` |
| 关闭 | **关闭弹出的命令行窗口**，或运行 `start.bat stop` |
| 重启 | 运行 `start.bat restart` |
| 查看状态 | 运行 `start.bat status` |

> Windows 启动后会打开一个新的命令行窗口。**关闭那个窗口 = 停止服务**。不想看到窗口的话可以把它最小化。

---

## 首次使用

1. 打开管理面板 `http://localhost:10130`
2. 如果提示需要 Setup Code，在终端/命令行窗口中找到类似 `Setup code: XXXXXXXXXX` 的输出，填入
3. 创建管理员账户（用户名 + 密码）
4. 登录后在 **密钥** 页面添加厂商 API 密钥
5. 在 **网关路由** 页面调整模型优先级
6. 在 **路由出站 API** 页面获取统一 API 密钥和端点地址
7. 把你的 AI 客户端指向 `http://localhost:2210/v1`（后端 API 地址）

---

## API 使用

### Python（OpenAI SDK）

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:2210/v1",
    api_key="llmrouter-xxxxxxxx",  # 在管理面板「路由出站 API」获取
)

response = client.chat.completions.create(
    model="auto",  # 自动路由，系统帮你选最优模型
    messages=[{"role": "user", "content": "你好，介绍一下你自己"}],
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
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

### 流式输出

```python
stream = client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "写一首诗"}],
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

## 配置参考

所有配置通过 `.env` 文件管理。首次运行会自动生成，无需手动创建。

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `2210` | 后端 API 服务监听端口 |
| `ENCRYPTION_KEY` | 自动生成 | API 密钥加密密钥（64 位十六进制） |
| `HOST` | `::` | 监听地址，`127.0.0.1` 限制本机访问 |
| `PROXY_RATE_LIMIT_RPM` | `120` | 每分钟每 IP 请求限制 |
| `RESPONSE_CACHE` | `false` | 响应缓存开关 |

> **端口说明**：后端 API 服务运行在 `PORT`（默认 2210），前端管理面板运行在 Vite dev server 的 10130 端口。前端通过 proxy 自动转发 `/v1` 和 `/api` 请求到后端，日常使用只需访问 `http://localhost:10130` 即可。

详细配置项见 [`.env.example`](./.env.example)。

---

## 技术架构

```
┌──────────────┐   Bearer Token   ┌──────────────────────┐
│  AI 客户端   │ ────────────────▶ │  Express 后端 (:2210) │
│  SDK / CLI   │ ◀──────────────── │  /v1/chat/completions │
└──────────────┘    流式 Token     └──────────┬───────────┘
                                              │
                                              ▼
                      ┌───────────────────────────────────────┐
                      │  路由器                                │
                      │  1. 选择优先级最高的可用模型             │
                      │  2. 解密密钥，调用厂商 API              │
                      │  3. 429/5xx → 冷却 + 切换下一个        │
                      └───────────────────────────────────────┘
                                       │
   ┌──────────┬──────────┬─────────────┼──────────┬──────────┐
   ▼          ▼          ▼             ▼          ▼          ▼
 Google     Groq    Cerebras      OpenRouter    智谱AI    …更多

┌──────────────┐                ┌──────────────────────┐
│  浏览器      │ ──────────────▶│  Vite 前端 (:10130)   │
│  管理面板    │ ◀──────────────│  React + TailwindCSS  │
└──────────────┘    页面资源    └──────────┬───────────┘
                                           │ proxy /v1 /api
                                           ▼
                               ┌──────────────────────┐
                               │  Express 后端 (:2210) │
                               └──────────────────────┘
```

- **路由引擎** — 每请求自动选择模型，支持 `model="auto"` 智能路由
- **限速管理** — 内存中 RPM/RPD/TPM/TPD 计数器，防止超出免费额度
- **厂商适配器** — 每个厂商独立适配，新增厂商只需加一个文件
- **健康检查** — 定期探测密钥状态，自动标记不可用密钥
- **管理面板** — React + Vite + TailwindCSS（dev server 端口 10130，API 代理至后端 2210）
- **存储** — SQLite + AES-256-GCM 加密

---

## 项目结构

```
LLMRouter/
├── client/                 # React + Vite 管理面板
│   └── src/
│       ├── components/     # UI 组件
│       ├── pages/          # 各页面
│       ├── i18n/           # 国际化（中文/英文）
│       └── lib/            # API 客户端
├── server/                 # Express.js 后端
│   └── src/
│       ├── providers/      # 厂商适配器
│       ├── routes/         # API 路由
│       ├── services/       # 路由器、限速、健康检查
│       ├── db/             # SQLite + 数据迁移
│       ├── lib/            # 工具函数
│       └── middleware/     # 中间件
├── shared/                 # 共享类型定义
├── start.sh                # macOS / Linux 启动脚本
├── start.bat               # Windows 启动脚本
├── .env.example            # 环境变量参考
└── README.md
```
