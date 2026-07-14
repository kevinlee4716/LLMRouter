// Migration: create provider_vendors table for user-defined provider/vendor management
// Created: 2026-07-07

import type { Db } from '../types.js';

export function up(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS provider_vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      platform TEXT NOT NULL,
      api_base_url TEXT DEFAULT '',
      description TEXT DEFAULT '',
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_vendors_name ON provider_vendors(name);

    -- Seed built-in system vendors
    INSERT OR IGNORE INTO provider_vendors (name, platform, api_base_url, description, is_system) VALUES
      ('Google AI Studio', 'google', 'https://generativelanguage.googleapis.com/v1beta', 'Google Gemini 系列模型', 1),
      ('Groq', 'groq', 'https://api.groq.com/openai/v1', 'Groq LPU 高速推理', 1),
      ('Cerebras', 'cerebras', 'https://api.cerebras.ai/v1', 'Cerebras 超快推理', 1),
      ('NVIDIA NIM', 'nvidia', 'https://integrate.api.nvidia.com/v1', 'NVIDIA 官方推理服务', 1),
      ('Mistral', 'mistral', 'https://api.mistral.ai/v1', 'Mistral AI 模型', 1),
      ('OpenRouter', 'openrouter', 'https://openrouter.ai/api/v1', '多模型聚合路由', 1),
      ('GitHub Models', 'github', 'https://models.inference.ai.azure.com', 'GitHub 模型市场', 1),
      ('Cohere', 'cohere', 'https://api.cohere.com/v1', 'Cohere 企业级模型', 1),
      ('Cloudflare Workers AI', 'cloudflare', 'https://api.cloudflare.com/client/v4', 'Cloudflare 边缘推理', 1),
      ('智谱 AI (Z.ai)', 'zhipu', 'https://open.bigmodel.cn/api/paas/v4', '智谱 GLM 系列模型', 1),
      ('Ollama Cloud', 'ollama', 'https://api.ollama.com/v1', 'Ollama 云端服务', 1),
      ('Kilo Gateway', 'kilo', 'https://api.kilo.ai/v1', 'Kilo 匿名网关（无需密钥）', 1),
      ('Pollinations', 'pollinations', 'https://text.pollinations.ai', 'Pollinations 免费推理（无需密钥）', 1),
      ('OVH AI Endpoints', 'ovh', 'https://endpoints.ai.cloud.ovh.net', 'OVH 免费 AI 端点（无需密钥）', 1),
      ('LLM7', 'llm7', 'https://api.llm7.io/v1', 'LLM7 免费网关', 1),
      ('HuggingFace Router', 'huggingface', 'https://router.huggingface.co', 'HuggingFace 推理路由', 1),
      ('OpenCode Zen', 'opencode', 'https://api.opencode.ai/v1', 'OpenCode Zen 免费推理', 1),
      ('Agnes AI', 'agnes', 'https://api.agnes-ai.com/v1', 'Agnes AI 免费推理', 1),
      ('Reka', 'reka', 'https://api.reka.ai/v1', 'Reka 多模态模型', 1),
      ('SiliconFlow', 'siliconflow', 'https://api.siliconflow.cn/v1', 'SiliconFlow 图像与语音', 1),
      ('Routeway', 'routeway', 'https://api.routeway.ai/v1', 'Routeway 免费网关', 1),
      ('BazaarLink', 'bazaarlink', 'https://api.bazaarlink.ai/v1', 'BazaarLink 免费路由', 1),
      ('AINative Studio', 'ainative', 'https://api.ainative.studio/v1', 'AINative 免费推理', 1),
      ('AI Horde', 'aihorde', 'https://oai.aihorde.net/v1', 'AI Horde 社区推理（无需密钥）', 1);
  `);
}

export function down(db: Db): void {
  db.exec(`
    DROP TABLE IF EXISTS provider_vendors;
  `);
}
