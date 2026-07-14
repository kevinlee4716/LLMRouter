import { Router } from 'express';
import { getDb } from '../db/index.js';

export const webhooksRouter = Router();

// GET /api/webhooks
webhooksRouter.get('/', (_req, res) => {
  const db = getDb();
  const webhooks = db.prepare('SELECT * FROM webhook_configs ORDER BY created_at DESC').all();
  res.json(webhooks);
});

// POST /api/webhooks
webhooksRouter.post('/', (req, res) => {
  const { name, url, event_types, secret } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'name and url are required' });
  // Validate URL
  try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); }

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO webhook_configs (name, url, event_types, secret)
    VALUES (?, ?, ?, ?)
  `).run(name, url, event_types || 'channel_failure,budget_exceeded', secret || '');
  res.status(201).json({ id: result.lastInsertRowid, name, url });
});

// PUT /api/webhooks/:id
webhooksRouter.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  const { name, url, event_types, secret, enabled } = req.body;
  const fields: string[] = [];
  const values: unknown[] = [];

  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (url !== undefined) { fields.push('url = ?'); values.push(url); }
  if (event_types !== undefined) { fields.push('event_types = ?'); values.push(event_types); }
  if (secret !== undefined) { fields.push('secret = ?'); values.push(secret); }
  if (enabled !== undefined) { fields.push('enabled = ?'); values.push(enabled ? 1 : 0); }

  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

  fields.push("updated_at = datetime('now')");
  values.push(id);

  const db = getDb();
  db.prepare(`UPDATE webhook_configs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  res.json({ success: true });
});

// DELETE /api/webhooks/:id
webhooksRouter.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  const db = getDb();
  db.prepare('DELETE FROM webhook_configs WHERE id = ?').run(id);
  res.json({ success: true });
});

// POST /api/webhooks/:id/test — send a test webhook
webhooksRouter.post('/:id/test', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  const db = getDb();
  const webhook = db.prepare('SELECT * FROM webhook_configs WHERE id = ?').get(id) as { id: number; url: string; name: string } | undefined;
  if (!webhook) return res.status(404).json({ error: 'Webhook not found' });

  import('../services/webhooks.js').then(({ fireWebhook }) => {
    fireWebhook('channel_failure', {
      test: true,
      webhook: webhook.name,
      message: 'This is a test notification from LLMRouter',
    });
  }).catch(() => {});

  res.json({ success: true, message: 'Test webhook queued' });
});
