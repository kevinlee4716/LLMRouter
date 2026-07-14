import { Router } from 'express';
import { getDb } from '../db/index.js';

export const announcementsRouter = Router();

// GET /api/announcements — active announcements
announcementsRouter.get('/', (_req, res) => {
  const db = getDb();
  const now = new Date().toISOString();
  const items = db.prepare(`
    SELECT * FROM announcements
    WHERE enabled = 1 AND (expires_at IS NULL OR expires_at > ?)
    ORDER BY created_at DESC
  `).all(now);
  res.json(items);
});

// GET /api/announcements/all — all including disabled/expired
announcementsRouter.get('/all', (_req, res) => {
  const db = getDb();
  const items = db.prepare('SELECT * FROM announcements ORDER BY created_at DESC').all();
  res.json(items);
});

// POST /api/announcements
announcementsRouter.post('/', (req, res) => {
  const { title, content, severity, dismissible, expires_at } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO announcements (title, content, severity, dismissible, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(title, content || '', severity || 'info', dismissible !== false ? 1 : 0, expires_at || null);
  res.status(201).json({ id: result.lastInsertRowid, title });
});

// PUT /api/announcements/:id
announcementsRouter.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  const { title, content, severity, dismissible, enabled, expires_at } = req.body;
  const fields: string[] = [];
  const values: unknown[] = [];

  if (title !== undefined) { fields.push('title = ?'); values.push(title); }
  if (content !== undefined) { fields.push('content = ?'); values.push(content); }
  if (severity !== undefined) { fields.push('severity = ?'); values.push(severity); }
  if (dismissible !== undefined) { fields.push('dismissible = ?'); values.push(dismissible ? 1 : 0); }
  if (enabled !== undefined) { fields.push('enabled = ?'); values.push(enabled ? 1 : 0); }
  if (expires_at !== undefined) { fields.push('expires_at = ?'); values.push(expires_at || null); }

  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

  values.push(id);
  const db = getDb();
  db.prepare(`UPDATE announcements SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  res.json({ success: true });
});

// DELETE /api/announcements/:id
announcementsRouter.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  const db = getDb();
  db.prepare('DELETE FROM announcements WHERE id = ?').run(id);
  res.json({ success: true });
});
