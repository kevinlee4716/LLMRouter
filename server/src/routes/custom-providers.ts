import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../db/index.js';
import crypto from 'crypto';

export const customProvidersRouter = Router();

function maskKey(key: string): string {
  if (!key || key.length <= 8) return 'Not set';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

function ensureTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS custom_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL DEFAULT '',
      models TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_tested TEXT,
      status TEXT NOT NULL DEFAULT 'untested'
    )
  `);
}

interface ProviderRow {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  models: string;
  created_at: string;
  last_tested: string | null;
  status: string;
}

/** GET /api/custom-providers */
customProvidersRouter.get('/', (_req: Request, res: Response) => {
  ensureTable();
  const db = getDb();
  const rows = db.prepare('SELECT * FROM custom_providers ORDER BY created_at DESC').all() as ProviderRow[];
  const providers = rows.map((r) => ({
    id: r.id,
    name: r.name,
    baseUrl: r.base_url,
    apiKeyMasked: maskKey(r.api_key),
    models: r.models ? r.models.split(',').map((m) => m.trim()).filter(Boolean) : [],
    createdAt: r.created_at,
    lastTested: r.last_tested,
    status: r.status,
  }));
  res.json(providers);
});

/** POST /api/custom-providers */
customProvidersRouter.post('/', (req: Request, res: Response) => {
  const { name, baseUrl, apiKey, models } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'Provider name is required.' });
    return;
  }
  if (!baseUrl || typeof baseUrl !== 'string' || !baseUrl.trim()) {
    res.status(400).json({ error: 'API base URL is required.' });
    return;
  }

  ensureTable();
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(
    'INSERT INTO custom_providers (id, name, base_url, api_key, models) VALUES (?, ?, ?, ?, ?)'
  ).run(id, name.trim(), baseUrl.trim(), (apiKey || '').trim(), (models || '').trim());

  const row = db.prepare('SELECT * FROM custom_providers WHERE id = ?').get(id) as ProviderRow;
  res.status(201).json({
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    apiKeyMasked: maskKey(row.api_key),
    models: row.models ? row.models.split(',').map((m) => m.trim()).filter(Boolean) : [],
    createdAt: row.created_at,
    lastTested: row.last_tested,
    status: row.status,
  });
});

/** DELETE /api/custom-providers/:id */
customProvidersRouter.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  ensureTable();
  const db = getDb();
  const result = db.prepare('DELETE FROM custom_providers WHERE id = ?').run(id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Provider not found.' });
    return;
  }
  // Also invalidate model cache so the new provider's models show up
  db.prepare('DELETE FROM settings WHERE key = ?').run('catalog_cache');
  res.json({ success: true });
});

/** POST /api/custom-providers/:id/test — test connection */
customProvidersRouter.post('/:id/test', async (req: Request, res: Response) => {
  const { id } = req.params;
  ensureTable();
  const db = getDb();
  const row = db.prepare('SELECT * FROM custom_providers WHERE id = ?').get(id) as ProviderRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'Provider not found.' });
    return;
  }

  const testUrl = row.base_url.replace(/\/+$/, '') + '/models';
  let status: string;
  try {
    const r = await fetch(testUrl, {
      method: 'GET',
      headers: {
        ...(row.api_key ? { Authorization: `Bearer ${row.api_key}` } : {}),
      },
      signal: AbortSignal.timeout(10000),
    });
    status = r.ok ? 'ok' : 'error';
  } catch {
    status = 'error';
  }

  db.prepare('UPDATE custom_providers SET status = ?, last_tested = datetime(?) WHERE id = ?')
    .run(status, new Date().toISOString(), id);

  res.json({ status, lastTested: new Date().toISOString() });
});
