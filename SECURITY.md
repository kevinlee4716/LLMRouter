# Security Policy

## Reporting a Vulnerability

LLMRouter handles API keys and uses AES-256-GCM encryption to protect stored credentials. We take security seriously.

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, send an email to **kevinlee4716@gmail.com** with:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (if available)

You will receive a response within 48 hours. If the issue is confirmed, we will release a patch as soon as possible.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Security Best Practices

- Always set a strong `ENCRYPTION_KEY` in your `.env` file (64-character hex string)
- Do not expose the management panel (port 10130) or API server (port 2210) to the public internet without authentication
- For LAN use, consider setting `HOST=127.0.0.1` and use a reverse proxy with TLS
- Enable `LLMROUTER_BLOCK_PRIVATE_PROVIDER_URLS=true` when hosting on a shared network or VPS
- Regularly back up `server/data/` and your `.env` file
