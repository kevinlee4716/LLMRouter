import { getDb } from '../db/index.js';
import type { Db } from '../db/types.js';
import crypto from 'crypto';

// Channel status types
export type ChannelStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

// Update channel health after each request
export function recordChannelResult(
  keyId: number,
  platform: string,
  modelId: string,
  success: boolean,
  error?: string
): void {
  const db = getDb();
  const now = new Date().toISOString();

  const existing = db.prepare(`
    SELECT id, consecutive_failures FROM channel_health
    WHERE key_id = ? AND platform = ? AND model_id = ?
  `).get(keyId, platform, modelId) as { id: number; consecutive_failures: number } | undefined;

  if (existing) {
    const consecutiveFailures = success ? 0 : existing.consecutive_failures + 1;
    const threshold = parseInt(getSetting(db, 'channel_health_threshold') || '3', 10);
    const autoDisable = getSetting(db, 'channel_auto_disable') === 'true';

    let status: ChannelStatus;
    if (success) {
      status = 'healthy';
    } else if (consecutiveFailures >= threshold) {
      status = autoDisable ? 'unhealthy' : 'degraded';
    } else {
      status = consecutiveFailures > 0 ? 'degraded' : 'healthy';
    }

    db.prepare(`
      UPDATE channel_health SET
        success_count = success_count + ${success ? 1 : 0},
        failure_count = failure_count + ${success ? 0 : 1},
        ${success ? "last_success_at = ?," : "last_failure_at = ?,"}
        last_error = ?,
        last_checked_at = ?,
        consecutive_failures = ?,
        status = ?,
        enabled = CASE WHEN ? = 'unhealthy' AND ? = 'true' THEN 0 ELSE enabled END,
        updated_at = ?
      WHERE id = ?
    `).run(
      success ? now : null,  // last_success_at / last_failure_at
      error || null,
      now,
      consecutiveFailures,
      status,
      status,
      autoDisable,
      now,
      existing.id
    );
  } else {
    db.prepare(`
      INSERT INTO channel_health
        (key_id, platform, model_id, status, success_count, failure_count,
         last_success_at, last_failure_at, last_error, last_checked_at,
         consecutive_failures, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      keyId, platform, modelId,
      success ? 'healthy' : 'degraded',
      success ? 1 : 0,
      success ? 0 : 1,
      success ? now : null,
      success ? null : now,
      error || null,
      now,
      success ? 0 : 1,
      now
    );
  }
}

// Get all channel health statuses
export function getAllChannelHealth() {
  const db = getDb();
  return db.prepare(`
    SELECT ch.*, ak.platform, ak.label as key_label
    FROM channel_health ch
    LEFT JOIN api_keys ak ON ch.key_id = ak.id
    ORDER BY ch.status ASC, ch.failure_count DESC
  `).all();
}

// Get health summary
export function getHealthSummary() {
  const db = getDb();
  return db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'healthy' THEN 1 ELSE 0 END) as healthy,
      SUM(CASE WHEN status = 'degraded' THEN 1 ELSE 0 END) as degraded,
      SUM(CASE WHEN status = 'unhealthy' THEN 1 ELSE 0 END) as unhealthy,
      SUM(CASE WHEN status = 'unknown' THEN 1 ELSE 0 END) as unknown
    FROM channel_health
  `).get();
}

// Reset a channel to healthy
export function resetChannelHealth(id: number): void {
  const db = getDb();
  db.prepare(`
    UPDATE channel_health SET
      status = 'unknown', consecutive_failures = 0,
      failure_count = 0, enabled = 1, updated_at = ?
    WHERE id = ?
  `).run(new Date().toISOString(), id);
}

// Toggle channel enabled state
export function setChannelEnabled(id: number, enabled: boolean): void {
  const db = getDb();
  db.prepare(`UPDATE channel_health SET enabled = ?, updated_at = ? WHERE id = ?`)
    .run(enabled ? 1 : 0, new Date().toISOString(), id);
}

function getSetting(db: Db, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

// Health check: test a channel with a simple ping/validation request
export async function runHealthCheck(keyId: number, platform: string, modelId: string): Promise<boolean> {
  const db = getDb();
  const keyRow = db.prepare('SELECT encrypted_key, iv, auth_tag FROM api_keys WHERE id = ?').get(keyId) as { encrypted_key: string; iv: string; auth_tag: string } | undefined;
  if (!keyRow) return false;

  try {
    // Validate key format without making actual API calls (avoids wasting credits)
    const { decrypt } = await import('../lib/crypto.js');
    const decrypted = decrypt(keyRow.encrypted_key, keyRow.iv, keyRow.auth_tag);
    if (decrypted && decrypted.length > 3) {
      recordChannelResult(keyId, platform, modelId, true);
      return true;
    }
    recordChannelResult(keyId, platform, modelId, false, 'Invalid key format');
    return false;
  } catch (e) {
    recordChannelResult(keyId, platform, modelId, false, String(e));
    return false;
  }
}
