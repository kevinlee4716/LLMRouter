import { getDb } from '../db/index.js';

interface Remapping {
  id: number;
  source_model: string;
  target_model: string;
  target_platform: string;
  enabled: number;
  rewrite_body: number;
}

// Fast lookup cache for the proxy hot path
let remappingCache: Map<string, Remapping> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 30000; // 30 seconds

function getRemappings(): Map<string, Remapping> {
  const now = Date.now();
  if (remappingCache && (now - cacheTimestamp) < CACHE_TTL) {
    return remappingCache;
  }

  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM model_remappings WHERE enabled = 1
  `).all() as Remapping[];

  remappingCache = new Map();
  for (const r of rows) {
    remappingCache.set(r.source_model, r);
  }
  cacheTimestamp = now;
  return remappingCache;
}

export function resolveModel(model: string): { model: string; platform?: string; rewritten: boolean } {
  const remappings = getRemappings();
  const remap = remappings.get(model);

  if (!remap) {
    // Try fuzzy match (e.g., "gpt-4" → "openai/gpt-4o")
    for (const [source, mapping] of remappings) {
      if (model.includes(source) || source.includes(model)) {
        return {
          model: mapping.target_model,
          platform: mapping.target_platform || undefined,
          rewritten: true,
        };
      }
    }
    return { model, rewritten: false };
  }

  return {
    model: remap.target_model,
    platform: remap.target_platform || undefined,
    rewritten: true,
  };
}

export function invalidateRemappingCache(): void {
  remappingCache = null;
  cacheTimestamp = 0;
}

export function getAllRemappings() {
  const db = getDb();
  return db.prepare('SELECT * FROM model_remappings ORDER BY source_model').all();
}

export function createRemapping(source: string, target: string, targetPlatform: string, rewriteBody: boolean): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO model_remappings (source_model, target_model, target_platform, rewrite_body)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(source_model) DO UPDATE SET
      target_model = excluded.target_model,
      target_platform = excluded.target_platform,
      rewrite_body = excluded.rewrite_body,
      updated_at = datetime('now')
  `).run(source, target, targetPlatform, rewriteBody ? 1 : 0);
  invalidateRemappingCache();
}

export function updateRemapping(id: number, updates: Partial<Remapping>): void {
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.source_model !== undefined) { fields.push('source_model = ?'); values.push(updates.source_model); }
  if (updates.target_model !== undefined) { fields.push('target_model = ?'); values.push(updates.target_model); }
  if (updates.target_platform !== undefined) { fields.push('target_platform = ?'); values.push(updates.target_platform); }
  if (updates.enabled !== undefined) { fields.push('enabled = ?'); values.push(updates.enabled); }
  if (updates.rewrite_body !== undefined) { fields.push('rewrite_body = ?'); values.push(updates.rewrite_body); }

  if (fields.length === 0) return;

  fields.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE model_remappings SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  invalidateRemappingCache();
}

export function deleteRemapping(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM model_remappings WHERE id = ?').run(id);
  invalidateRemappingCache();
}
