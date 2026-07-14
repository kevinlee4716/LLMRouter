import { getDb } from '../db/index.js';

type EventType = 'channel_failure' | 'channel_recovery' | 'budget_exceeded' | 'health_degraded';

interface WebhookConfig {
  id: number;
  name: string;
  url: string;
  event_types: string;
  secret: string;
  enabled: number;
}

interface WebhookPayload {
  event: EventType;
  timestamp: string;
  data: Record<string, unknown>;
}

// Fire webhook in background — never block the main request
export function fireWebhook(event: EventType, data: Record<string, unknown>): void {
  const db = getDb();
  const configs = db.prepare(`
    SELECT * FROM webhook_configs WHERE enabled = 1
  `).all() as WebhookConfig[];

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  for (const cfg of configs) {
    if (!matchesEvent(cfg.event_types, event)) continue;
    sendWebhook(cfg, payload);
  }
}

function matchesEvent(eventTypes: string, event: EventType): boolean {
  return eventTypes.split(',').map(s => s.trim()).includes(event);
}

async function sendWebhook(cfg: WebhookConfig, payload: WebhookPayload): Promise<void> {
  try {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-LLMRouter-Event': payload.event,
    };

    // Slack/Discord format adaptation
    if (cfg.url.includes('hooks.slack.com')) {
      const slackPayload = {
        text: `*LLMRouter Alert: ${payload.event}*\n\`\`\`${JSON.stringify(payload.data, null, 2)}\`\`\``,
      };
      const resp = await fetch(cfg.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slackPayload),
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) updateLastTriggered(cfg.id);
      return;
    }

    if (cfg.url.includes('discord.com')) {
      const discordPayload = {
        content: `**LLMRouter Alert: ${payload.event}**\n\`\`\`json\n${JSON.stringify(payload.data, null, 2)}\n\`\`\``,
      };
      const resp = await fetch(cfg.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discordPayload),
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) updateLastTriggered(cfg.id);
      return;
    }

    const resp = await fetch(cfg.url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (resp.ok) updateLastTriggered(cfg.id);
  } catch {
    // Silent fail — webhook delivery is best-effort
  }
}

function updateLastTriggered(id: number): void {
  try {
    const db = getDb();
    db.prepare(`UPDATE webhook_configs SET last_triggered_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), id);
  } catch {
    // ignore
  }
}
