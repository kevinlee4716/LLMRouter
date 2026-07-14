import { Router } from 'express';
import { getDb } from '../db/index.js';

export const tokenQuotasRouter = Router();

// GET /api/token-quotas — list all quotas
tokenQuotasRouter.get('/', (_req, res) => {
  const db = getDb();
  const quotas = db.prepare(`
    SELECT tq.*, ak.platform, ak.label as key_label
    FROM token_quotas tq
    LEFT JOIN api_keys ak ON tq.key_id = ak.id
    ORDER BY ak.platform, ak.label
  `).all();
  res.json(quotas);
});

// GET /api/token-quotas/:keyId
tokenQuotasRouter.get('/:keyId', (req, res) => {
  const keyId = parseInt(req.params.keyId, 10);
  if (isNaN(keyId)) return res.status(400).json({ error: 'Invalid keyId' });

  const db = getDb();
  let quota = db.prepare('SELECT * FROM token_quotas WHERE key_id = ?').get(keyId);
  if (!quota) {
    // Auto-create empty quota entry
    db.prepare(`
      INSERT INTO token_quotas (key_id, ip_whitelist, model_restrictions)
      VALUES (?, '', '')
    `).run(keyId);
    quota = db.prepare('SELECT * FROM token_quotas WHERE key_id = ?').get(keyId);
  }
  res.json(quota);
});

// PUT /api/token-quotas/:keyId
tokenQuotasRouter.put('/:keyId', (req, res) => {
  const keyId = parseInt(req.params.keyId, 10);
  if (isNaN(keyId)) return res.status(400).json({ error: 'Invalid keyId' });

  const { expires_at, max_tokens, ip_whitelist, model_restrictions } = req.body;
  const db = getDb();

  // Upsert
  db.prepare(`
    INSERT INTO token_quotas (key_id, expires_at, max_tokens, ip_whitelist, model_restrictions)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(key_id) DO UPDATE SET
      expires_at = excluded.expires_at,
      max_tokens = excluded.max_tokens,
      ip_whitelist = excluded.ip_whitelist,
      model_restrictions = excluded.model_restrictions,
      updated_at = datetime('now')
  `).run(
    keyId,
    expires_at || null,
    max_tokens || null,
    ip_whitelist || '',
    model_restrictions || ''
  );

  res.json({ success: true, keyId });
});

// DELETE /api/token-quotas/:keyId
tokenQuotasRouter.delete('/:keyId', (req, res) => {
  const keyId = parseInt(req.params.keyId, 10);
  if (isNaN(keyId)) return res.status(400).json({ error: 'Invalid keyId' });
  const db = getDb();
  db.prepare('DELETE FROM token_quotas WHERE key_id = ?').run(keyId);
  res.json({ success: true });
});
