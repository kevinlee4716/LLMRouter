import type { Db } from '../types.js';

function tableExists(db: Db, name: string): boolean {
  return !!db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(name);
}

export function up(db: Db): void {
  // 1. Channel health tracking — tracks per-channel health status and failure stats
  if (!tableExists(db, 'channel_health')) {
    db.prepare(`
      CREATE TABLE channel_health (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_id INTEGER NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
        platform TEXT NOT NULL,
        model_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('healthy','degraded','unhealthy','unknown')),
        success_count INTEGER NOT NULL DEFAULT 0,
        failure_count INTEGER NOT NULL DEFAULT 0,
        last_success_at TEXT,
        last_failure_at TEXT,
        last_error TEXT,
        last_checked_at TEXT,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `).run();
    db.prepare(`CREATE INDEX idx_ch_platform_model ON channel_health(platform, model_id)`).run();
    db.prepare(`CREATE INDEX idx_ch_status ON channel_health(status)`).run();
  }

  // 2. Cost tracking — per-request cost entries with model-level pricing
  if (!tableExists(db, 'cost_entries')) {
    db.prepare(`
      CREATE TABLE cost_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id INTEGER REFERENCES requests(id) ON DELETE SET NULL,
        key_id INTEGER REFERENCES api_keys(id) ON DELETE SET NULL,
        platform TEXT NOT NULL,
        model_id TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        input_cost REAL NOT NULL DEFAULT 0,
        output_cost REAL NOT NULL DEFAULT 0,
        total_cost REAL NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'USD',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `).run();
    db.prepare(`CREATE INDEX idx_ce_key_id ON cost_entries(key_id)`).run();
    db.prepare(`CREATE INDEX idx_ce_created ON cost_entries(created_at)`).run();
  }

  // 3. Cost pricing — model-level pricing config per platform
  if (!tableExists(db, 'cost_pricing')) {
    db.prepare(`
      CREATE TABLE cost_pricing (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL,
        model_id TEXT NOT NULL,
        input_price_per_1k REAL NOT NULL DEFAULT 0,
        output_price_per_1k REAL NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'USD',
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(platform, model_id)
      )
    `).run();
  }

  // 4. Token quotas — enhanced API key metadata
  if (!tableExists(db, 'token_quotas')) {
    db.prepare(`
      CREATE TABLE token_quotas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_id INTEGER NOT NULL UNIQUE REFERENCES api_keys(id) ON DELETE CASCADE,
        expires_at TEXT,
        max_tokens INTEGER,
        tokens_used INTEGER NOT NULL DEFAULT 0,
        ip_whitelist TEXT NOT NULL DEFAULT '',
        model_restrictions TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `).run();
  }

  // 5. Guardrail rules
  if (!tableExists(db, 'guardrail_rules')) {
    db.prepare(`
      CREATE TABLE guardrail_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('pii','keyword','regex','custom')),
        pattern TEXT NOT NULL,
        action TEXT NOT NULL DEFAULT 'block' CHECK (action IN ('block','warn','log','redact')),
        scope TEXT NOT NULL DEFAULT 'all' CHECK (scope IN ('all','input','output')),
        enabled INTEGER NOT NULL DEFAULT 1,
        priority INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `).run();
    // Seed default PII detection rules
    const piiRules = [
      ['PII-CreditCard', 'pii', '\\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\\b', 'block', 'all', 10],
      ['PII-SSN', 'pii', '\\b\\d{3}-\\d{2}-\\d{4}\\b', 'redact', 'all', 9],
      ['PII-Email', 'pii', '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b', 'warn', 'output', 5],
      ['PII-Phone', 'pii', '\\b(?:\\+?86)?1[3-9]\\d{9}\\b', 'redact', 'all', 8],
      ['PII-IDCard', 'pii', '\\b[1-9]\\d{5}(?:19|20)\\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\\d|3[01])\\d{3}[\\dXx]\\b', 'redact', 'all', 7],
    ];
    const insert = db.prepare(`
      INSERT INTO guardrail_rules (name, type, pattern, action, scope, priority)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const r of piiRules) insert.run(r[0], r[1], r[2], r[3], r[4], r[5]);
  }

  // 6. Webhook configs
  if (!tableExists(db, 'webhook_configs')) {
    db.prepare(`
      CREATE TABLE webhook_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        event_types TEXT NOT NULL DEFAULT 'channel_failure,budget_exceeded',
        secret TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        last_triggered_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `).run();
  }

  // 7. Model remappings — redirect model names
  if (!tableExists(db, 'model_remappings')) {
    db.prepare(`
      CREATE TABLE model_remappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_model TEXT NOT NULL UNIQUE,
        target_model TEXT NOT NULL,
        target_platform TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        rewrite_body INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `).run();
  }

  // 8. Announcements
  if (!tableExists(db, 'announcements')) {
    db.prepare(`
      CREATE TABLE announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
        dismissible INTEGER NOT NULL DEFAULT 1,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT
      )
    `).run();
  }

  // 9. Add cost_tracking_enabled setting
  db.prepare(`
    INSERT OR IGNORE INTO settings (key, value) VALUES ('cost_tracking_enabled', 'true')
  `).run();

  // 10. Add channel_auto_disable setting (auto-disable unhealthy channels)
  db.prepare(`
    INSERT OR IGNORE INTO settings (key, value) VALUES ('channel_auto_disable', 'true')
  `).run();

  // 11. Add channel_health_threshold setting (max consecutive failures before auto-disable)
  db.prepare(`
    INSERT OR IGNORE INTO settings (key, value) VALUES ('channel_health_threshold', '3')
  `).run();
}

export function down(db: Db): void {
  const tables = [
    'announcements',
    'model_remappings',
    'webhook_configs',
    'guardrail_rules',
    'token_quotas',
    'cost_pricing',
    'cost_entries',
    'channel_health',
  ];
  for (const t of tables) {
    db.prepare(`DROP TABLE IF EXISTS ${t}`).run();
  }
  db.prepare(`DELETE FROM settings WHERE key IN ('cost_tracking_enabled','channel_auto_disable','channel_health_threshold')`).run();
}
