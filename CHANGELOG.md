# Changelog

All notable changes to LLMRouter will be documented in this file.

## [1.0.0] - 2026-07-14

### Added
- Initial release
- OpenAI-compatible `/v1/chat/completions` API endpoint
- Anthropic Messages `/v1/messages` API endpoint (Claude Code compatible)
- Automatic failover with up to 20 retry attempts across providers
- Smart routing with `model="auto"` support
- AES-256-GCM encrypted API key storage
- Web-based management dashboard (React + Vite + TailwindCSS)
- Support for 17+ LLM providers (Google, Groq, Cerebras, Mistral, OpenRouter, GitHub Models, Cloudflare, Cohere, NVIDIA, HuggingFace, Ollama Cloud, AI Horde, 智谱 AI, 阿里云百炼, 百度千帆, 硅基流动, and custom OpenAI-compatible endpoints)
- SSE streaming and OpenAI function calling support
- Rate limiting (RPM/RPD/TPM/TPD)
- Health check monitoring
- Cross-platform startup scripts (start.sh / start.bat)
- SQLite-based storage with encryption
