import { Router } from 'express';
import { getDb } from '../db/index.js';
import { getEnabledRules, clearGuardrailCache } from '../services/guardrails.js';

export const guardrailsRouter = Router();

// GET /api/guardrails — list all rules
guardrailsRouter.get('/', (_req, res) => {
  const db = getDb();
  const rules = db.prepare('SELECT * FROM guardrail_rules ORDER BY priority DESC').all();
  res.json(rules);
});

// POST /api/guardrails — create a new rule
guardrailsRouter.post('/', (req, res) => {
  const { name, type, pattern, action, scope, priority } = req.body;
  if (!name || !type || !pattern) {
    return res.status(400).json({ error: 'name, type, and pattern are required' });
  }
  if (!['pii', 'keyword', 'regex', 'custom'].includes(type)) {
    return res.status(400).json({ error: 'Invalid type' });
  }
  if (!['block', 'warn', 'log', 'redact'].includes(action || 'block')) {
    return res.status(400).json({ error: 'Invalid action' });
  }

  // Validate regex pattern
  try {
    new RegExp(pattern);
  } catch {
    return res.status(400).json({ error: 'Invalid regex pattern' });
  }

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO guardrail_rules (name, type, pattern, action, scope, priority)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, type, pattern, action || 'block', scope || 'all', priority || 0);

  clearGuardrailCache();
  res.status(201).json({ id: result.lastInsertRowid, name, type, action: action || 'block' });
});

// PUT /api/guardrails/:id — update a rule
guardrailsRouter.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  const { name, type, pattern, action, scope, enabled, priority } = req.body;
  const fields: string[] = [];
  const values: unknown[] = [];

  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (type !== undefined) { fields.push('type = ?'); values.push(type); }
  if (pattern !== undefined) {
    try { new RegExp(pattern); } catch {
      return res.status(400).json({ error: 'Invalid regex pattern' });
    }
    fields.push('pattern = ?');
    values.push(pattern);
  }
  if (action !== undefined) { fields.push('action = ?'); values.push(action); }
  if (scope !== undefined) { fields.push('scope = ?'); values.push(scope); }
  if (enabled !== undefined) { fields.push('enabled = ?'); values.push(enabled ? 1 : 0); }
  if (priority !== undefined) { fields.push('priority = ?'); values.push(priority); }

  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

  fields.push("updated_at = datetime('now')");
  values.push(id);

  const db = getDb();
  db.prepare(`UPDATE guardrail_rules SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  clearGuardrailCache();
  res.json({ success: true });
});

// DELETE /api/guardrails/:id
guardrailsRouter.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  const db = getDb();
  db.prepare('DELETE FROM guardrail_rules WHERE id = ?').run(id);
  clearGuardrailCache();
  res.json({ success: true });
});

import { checkContent } from '../services/guardrails.js';

// POST /api/guardrails/test — test content against rules
guardrailsRouter.post('/test', (req, res) => {
  const { content, scope } = req.body;
  if (!content) return res.status(400).json({ error: 'content is required' });
  const result = checkContent(content, scope || 'all');
  res.json(result);
});
