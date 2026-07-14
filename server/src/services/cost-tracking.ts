import { getDb } from '../db/index.js';

interface PricingRow {
  input_price_per_1k: number;
  output_price_per_1k: number;
}

// Get pricing for a model, with fallback defaults
function getPricing(platform: string, modelId: string): PricingRow {
  const db = getDb();
  const row = db.prepare(`
    SELECT input_price_per_1k, output_price_per_1k FROM cost_pricing
    WHERE platform = ? AND model_id = ?
  `).get(platform, modelId) as PricingRow | undefined;

  if (row) return row;

  // Fallback defaults based on common model tiers
  const modelLower = modelId.toLowerCase();
  if (modelLower.includes('gpt-4') || modelLower.includes('claude-3-opus')) {
    return { input_price_per_1k: 0.015, output_price_per_1k: 0.075 };
  }
  if (modelLower.includes('gpt-3.5')) {
    return { input_price_per_1k: 0.0005, output_price_per_1k: 0.0015 };
  }
  if (modelLower.includes('claude')) {
    return { input_price_per_1k: 0.003, output_price_per_1k: 0.015 };
  }
  return { input_price_per_1k: 0.001, output_price_per_1k: 0.002 };
}

export function recordCost(
  requestId: number | null,
  keyId: number | null,
  platform: string,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): void {
  const enabled = getBoolSetting('cost_tracking_enabled');
  if (!enabled) return;

  const pricing = getPricing(platform, modelId);
  const inputCost = (inputTokens / 1000) * pricing.input_price_per_1k;
  const outputCost = (outputTokens / 1000) * pricing.output_price_per_1k;
  const totalCost = Math.round((inputCost + outputCost) * 1000000) / 1000000;

  const db = getDb();
  db.prepare(`
    INSERT INTO cost_entries
      (request_id, key_id, platform, model_id, input_tokens, output_tokens,
       input_cost, output_cost, total_cost)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(requestId, keyId, platform, modelId, inputTokens, outputTokens,
    Math.round(inputCost * 1000000) / 1000000,
    Math.round(outputCost * 1000000) / 1000000,
    totalCost);

  // Check budget
  if (keyId) checkBudget(keyId, totalCost);
}

function checkBudget(keyId: number, additionalCost: number): void {
  const db = getDb();
  const quota = db.prepare('SELECT max_tokens FROM token_quotas WHERE key_id = ?').get(keyId) as { max_tokens: number } | undefined;
  if (!quota?.max_tokens) return;

  const total = db.prepare(`
    SELECT COALESCE(SUM(total_cost), 0) as total FROM cost_entries WHERE key_id = ?
  `).get(keyId) as { total: number };

  if (total.total >= quota.max_tokens * 0.9) {
    // Fire webhook for budget warning
    import('./webhooks.js').then(({ fireWebhook }) => {
      fireWebhook('budget_exceeded', {
        keyId,
        currentSpend: total.total,
        budget: quota.max_tokens,
        percent: Math.round((total.total / quota.max_tokens) * 100),
      });
    }).catch(() => {});
  }
}

export function getCostSummary(period?: '24h' | '7d' | '30d' | 'all') {
  const db = getDb();
  let whereClause = '';
  if (period === '24h') whereClause = "WHERE created_at >= datetime('now', '-1 day')";
  else if (period === '7d') whereClause = "WHERE created_at >= datetime('now', '-7 days')";
  else if (period === '30d') whereClause = "WHERE created_at >= datetime('now', '-30 days')";

  return db.prepare(`
    SELECT
      COALESCE(SUM(total_cost), 0) as total_cost,
      COALESCE(SUM(input_tokens), 0) as total_input_tokens,
      COALESCE(SUM(output_tokens), 0) as total_output_tokens,
      COUNT(*) as total_requests
    FROM cost_entries ${whereClause}
  `).get();
}

export function getCostByKey(period?: '24h' | '7d' | '30d' | 'all') {
  const db = getDb();
  let whereClause = "WHERE ce.key_id IS NOT NULL";
  if (period === '24h') whereClause += " AND ce.created_at >= datetime('now', '-1 day')";
  else if (period === '7d') whereClause += " AND ce.created_at >= datetime('now', '-7 days')";
  else if (period === '30d') whereClause += " AND ce.created_at >= datetime('now', '-30 days')";

  return db.prepare(`
    SELECT
      ak.id as key_id,
      ak.platform,
      ak.label,
      COALESCE(SUM(ce.total_cost), 0) as total_cost,
      COALESCE(SUM(ce.input_tokens), 0) as total_input_tokens,
      COALESCE(SUM(ce.output_tokens), 0) as total_output_tokens,
      COUNT(ce.id) as total_requests
    FROM cost_entries ce
    LEFT JOIN api_keys ak ON ce.key_id = ak.id
    ${whereClause}
    GROUP BY ce.key_id
    ORDER BY total_cost DESC
  `).all();
}

export function getCostByModel(period?: '24h' | '7d' | '30d' | 'all') {
  const db = getDb();
  let whereClause = '1=1';
  if (period === '24h') whereClause += " AND created_at >= datetime('now', '-1 day')";
  else if (period === '7d') whereClause += " AND created_at >= datetime('now', '-7 days')";
  else if (period === '30d') whereClause += " AND created_at >= datetime('now', '-30 days')";

  return db.prepare(`
    SELECT
      platform,
      model_id,
      COALESCE(SUM(total_cost), 0) as total_cost,
      COALESCE(SUM(input_tokens), 0) as total_input_tokens,
      COALESCE(SUM(output_tokens), 0) as total_output_tokens,
      COUNT(*) as total_requests
    FROM cost_entries
    WHERE ${whereClause}
    GROUP BY platform, model_id
    ORDER BY total_cost DESC
  `).all();
}

function getBoolSetting(key: string): boolean {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value === 'true';
}

// Update pricing for a model
export function upsertPricing(
  platform: string,
  modelId: string,
  inputPrice: number,
  outputPrice: number,
  currency: string = 'USD'
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO cost_pricing (platform, model_id, input_price_per_1k, output_price_per_1k, currency, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(platform, model_id) DO UPDATE SET
      input_price_per_1k = excluded.input_price_per_1k,
      output_price_per_1k = excluded.output_price_per_1k,
      currency = excluded.currency,
      updated_at = datetime('now')
  `).run(platform, modelId, inputPrice, outputPrice, currency);
}

// Get all pricing configs
export function getAllPricing() {
  const db = getDb();
  return db.prepare('SELECT * FROM cost_pricing ORDER BY platform, model_id').all();
}
