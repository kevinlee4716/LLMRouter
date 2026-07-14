import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { Platform } from '@llmrouter/shared/types.js';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import { getDb } from '../db/index.js';
import { resolveProvider } from '../providers/index.js';
import { encrypt, decrypt, maskKey } from '../lib/crypto.js';
import { parseKeysFromFile, stripJsoncComments, stripTrailingCommas } from '../lib/key-parser.js';
import { assessProviderUrl } from '../lib/url-guard.js';

export const keysRouter = Router();

// Active providers — must match providers/index.ts registrations + shared/types.ts Platform.
// Moonshot and MiniMax direct integrations were dropped in V4. HuggingFace
// was dropped in V4 and re-added in V13 via the router.huggingface.co route.
// SambaNova was dropped in V23 (free tier permanently retired).
const BASE_PLATFORMS = [
  'google', 'groq', 'cerebras', 'nvidia', 'mistral',
  'openrouter', 'github', 'cohere', 'cloudflare', 'zhipu', 'ollama',
  'kilo', 'pollinations', 'llm7', 'huggingface', 'opencode', 'ovh', 'agnes', 'reka', 'siliconflow',
  'routeway', 'bazaarlink', 'ainative', 'aihorde', 'aliyun', 'qianfan', 'custom',
] as const;

/** Returns all valid platforms: built-in + user-defined custom vendors. */
function getValidPlatforms(): string[] {
  const db = getDb();
  const customVendors = db.prepare(
    'SELECT platform FROM provider_vendors WHERE is_system = 0'
  ).all() as { platform: string }[];
  return [...BASE_PLATFORMS, ...customVendors.map(v => v.platform)];
}

/** Look up the api_base_url for a custom vendor platform. Returns null for built-in platforms. */
function getCustomVendorBaseUrl(platform: string): string | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT api_base_url FROM provider_vendors WHERE platform = ? AND is_system = 0'
  ).get(platform) as { api_base_url: string } | undefined;
  return row?.api_base_url || null;
}

const validPlatformsSet = () => new Set(getValidPlatforms());

const ALLOWED_IMPORT_EXTENSIONS = new Set(['.env', '.json', '.jsonc', '.md', '.txt', '.csv']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_IMPORT_EXTENSIONS.has(ext)) {
      cb(new Error('Unsupported file type'));
      return;
    }
    cb(null, true);
  },
});

const addPlatformRefinement = (platform: string, ctx: z.RefinementCtx) => {
  if (!validPlatformsSet().has(platform)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `不支持的平台: ${platform}，请先在设置中添加该厂商`,
    });
  }
};

// `key` is optional so keyless providers (Kilo's anonymous gateway) can be added
// without one; the handler enforces a non-empty key for everyone else.
const addKeySchema = z.object({
  platform: z.string().min(1, '请选择厂商').superRefine(addPlatformRefinement),
  key: z.string().optional(),
  label: z.string().optional(),
});

const updateKeySchema = z.object({
  enabled: z.boolean().optional(),
  label: z.string().optional(),
  apiKey: z.string().optional(),
}).refine(data => data.enabled !== undefined || data.label !== undefined || data.apiKey !== undefined, {
  message: 'At least one of enabled, label, or apiKey must be provided',
});

const importKeySchema = z.object({
  keyName: z.string().optional(),
  keyValue: z.string().min(1),
  platform: z.string().min(1).superRefine(addPlatformRefinement),
});

function handleUploadError(err: any, res: Response, next: NextFunction): boolean {
  if (!err) return false;
  if (err.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: { message: 'File too large. Maximum size is 5MB' } });
    return true;
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    res.status(413).json({ error: { message: 'Too many files. Maximum is 10' } });
    return true;
  }
  if (err.message?.includes('Unsupported file type')) {
    res.status(400).json({ error: { message: 'Unsupported file type' } });
    return true;
  }
  next(err);
  return true;
}

function parseUpload(file: Express.Multer.File) {
  const content = file.buffer.toString('utf8');
  if (!content.trim()) {
    throw Object.assign(new Error('File contains no data'), { status: 400 });
  }

  if (/\.jsonc?$/i.test(file.originalname)) {
    try {
      JSON.parse(stripTrailingCommas(stripJsoncComments(content)));
    } catch {
      throw Object.assign(new Error('Invalid JSON format'), { status: 400 });
    }
  }

  return parseKeysFromFile(content, file.originalname);
}

function splitRawKey(rawKey: string) {
  const eqIndex = rawKey.indexOf('=');
  return {
    keyName: eqIndex === -1 ? rawKey : rawKey.slice(0, eqIndex),
    keyValue: eqIndex === -1 ? '' : rawKey.slice(eqIndex + 1),
  };
}

function insertImportedKey(platform: string, keyName: string, keyValue: string) {
  if (platform === 'custom') {
    throw new Error('Custom providers must be added with a base URL');
  }
  // Allow custom vendor platforms (from provider_vendors) that aren't in the
  // hardcoded provider registry — they'll be resolved dynamically at runtime
  // with the base URL stored in the api_keys table.
  if (!resolveProvider(platform as Platform) && !getCustomVendorBaseUrl(platform)) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const db = getDb();
  const { encrypted, iv, authTag } = encrypt(keyValue.trim());
  db.prepare(`
    INSERT INTO api_keys (platform, label, encrypted_key, iv, auth_tag, status, enabled, base_url)
    VALUES (?, ?, ?, ?, ?, 'unknown', 1, ?)
  `).run(platform, keyName, encrypted, iv, authTag, getCustomVendorBaseUrl(platform) ?? null);
}

// Count enabled catalog models for a platform. Used to warn when a key is
// added for a provider that has zero models in the operator's current catalog
// tier — the Agnes case (#438): the provider is registered and selectable, but
// its models ship in the premium/live catalog and only appear for free-tier
// installs once they age into the monthly catalog, so a fresh install adds the
// key and silently sees nothing.
function enabledModelCount(platform: string): number {
  const db = getDb();
  const row = db.prepare(
    'SELECT COUNT(*) AS c FROM models WHERE platform = ? AND enabled = 1',
  ).get(platform) as { c: number };
  return row.c;
}

// Non-null when the just-added key has no usable models yet, so the client can
// explain the silence instead of leaving the user staring at an empty list.
function noModelsNotice(platform: string): string | undefined {
  if (enabledModelCount(platform) > 0) return undefined;
  return (
    `Key saved, but no ${platform} models are in your current catalog yet. ` +
    `Newer providers are published to the premium catalog first and appear ` +
    `for free-tier installs once they age into the monthly catalog. Add a ` +
    `Premium license key to use them now, or add ${platform} as a custom ` +
    `OpenAI-compatible provider with its base URL.`
  );
}

// List all keys (masked)
keysRouter.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM api_keys ORDER BY created_at DESC').all() as any[];

  const customModels = [
    ...db.prepare(`
      SELECT key_id, id, 'chat' AS kind, model_id, display_name, NULL AS family
        FROM models
       WHERE platform = 'custom' AND key_id IS NOT NULL
    `).all() as any[],
    ...db.prepare(`
      SELECT key_id, id, 'embedding' AS kind, model_id, display_name, family
        FROM embedding_models
       WHERE platform = 'custom' AND key_id IS NOT NULL
    `).all() as any[],
    ...db.prepare(`
      SELECT key_id, id, modality AS kind, model_id, display_name, NULL AS family
        FROM media_models
       WHERE platform = 'custom' AND key_id IS NOT NULL
    `).all() as any[],
  ];
  const modelsByKeyId = new Map<number, any[]>();
  for (const m of customModels) {
    const keyId = Number(m.key_id);
    if (!Number.isInteger(keyId)) continue;
    const list = modelsByKeyId.get(keyId) ?? [];
    list.push({
      id: m.id,
      kind: m.kind,
      modelId: m.model_id,
      displayName: m.display_name,
      family: m.family ?? null,
    });
    modelsByKeyId.set(keyId, list);
  }
  for (const list of modelsByKeyId.values()) {
    list.sort((a, b) => {
      const ka = ['chat', 'embedding', 'image', 'audio'].indexOf(a.kind);
      const kb = ['chat', 'embedding', 'image', 'audio'].indexOf(b.kind);
      return (ka - kb) || String(a.displayName).localeCompare(String(b.displayName));
    });
  }

  const keys = rows.map(row => {
    let maskedKey = '****';
    try {
      const realKey = decrypt(row.encrypted_key, row.iv, row.auth_tag);
      maskedKey = maskKey(realKey);
    } catch {
      maskedKey = '[decrypt failed]';
    }
    return {
      id: row.id,
      platform: row.platform,
      label: row.label,
      maskedKey,
      baseUrl: row.base_url ?? null,
      status: row.status,
      enabled: row.enabled === 1,
      keyless: resolveProvider(row.platform)?.keyless === true,
      createdAt: row.created_at,
      lastCheckedAt: row.last_checked_at,
      models: row.platform === 'custom' ? (modelsByKeyId.get(row.id) ?? []) : undefined,
    };
  });

  res.json(keys);
});

// Export keys — returns plaintext keys in the requested format.
// GET /api/keys/export?format=json|env|csv&healthy=true
// The response is the raw file download (Content-Type varies by format).
keysRouter.get('/export', (req: Request, res: Response) => {
  const db = getDb();
  const format = (req.query.format as string) ?? 'json';
  const healthyOnly = req.query.healthy === 'true';

  let whereClause = '';
  if (healthyOnly) {
    whereClause = "WHERE status = 'healthy'";
  }

  const rows = db.prepare(`SELECT * FROM api_keys ${whereClause} ORDER BY platform, created_at ASC`).all() as any[];

  // Decrypt and filter — only export keys with a real value
  const decryptedKeys = rows
    .map(row => {
      let key = '';
      try {
        key = decrypt(row.encrypted_key, row.iv, row.auth_tag);
      } catch {
        key = '';
      }
      return {
        platform: row.platform,
        key,
        label: row.label || '',
        baseUrl: row.base_url || undefined,
      };
    })
    .filter(k => {
      const v = k.key.trim();
      return v.length > 0 && v !== 'no-key';
    });

  if (decryptedKeys.length === 0) {
    res.status(404).json({ error: { message: 'No keys to export' } });
    return;
  }

  if (format === 'env') {
    // .env format: GOOGLE_KEY=xxx\nGROQ_KEY=yyy
    const lines = decryptedKeys.map(k => {
      const envKey = `${k.platform.toUpperCase()}_KEY=${k.key}`;
      return k.label ? `# ${k.label}\n${envKey}` : envKey;
    });
    const content = lines.join('\n\n') + '\n';
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="llmrouter-keys.env"');
    res.send(content);
    return;
  }

  if (format === 'csv') {
    // CSV format: platform,key,label
    const escCsv = (v: string) => `"${v.replace(/"/g, '""')}"`;
    // CSV formula-injection guard: a spreadsheet treats a cell that starts with
    // =, +, -, @, tab or CR as a live formula, so a label like `=HYPERLINK(...)`
    // would execute on open. Prefix such cells with a single quote to force them
    // to be read as text. Applied only to free-text fields the user controls
    // (labels); the key value must round-trip verbatim for re-import, and the
    // platform is one of our own fixed enum values.
    const neutralize = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
    const header = 'platform,key,label';
    const lines = decryptedKeys.map(k =>
      [escCsv(k.platform), escCsv(k.key), escCsv(neutralize(k.label))].join(',')
    );
    const content = [header, ...lines].join('\n') + '\n';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="llmrouter-keys.csv"');
    res.send(content);
    return;
  }

  // Default: JSON format (round-trip safe — can be imported directly)
  const jsonExport = {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: 'llmrouter',
    keys: decryptedKeys,
  };
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="llmrouter-keys.json"');
  res.json(jsonExport);
});

// Add a key
keysRouter.post('/', (req: Request, res: Response) => {
  const parsed = addKeySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: parsed.error.errors.map(e => e.message).join(', ') } });
    return;
  }

  const { platform, label } = parsed.data;
  const isKeyless = resolveProvider(platform as Platform)?.keyless === true;
  const rawKey = parsed.data.key?.trim() ?? '';

  if (!isKeyless && !rawKey) {
    res.status(400).json({ error: { message: 'key is required' } });
    return;
  }

  // Keyless providers (Kilo anon) store a sentinel so routing sees the platform
  // as configured; the provider omits the auth header on outgoing calls.
  const keyToStore = isKeyless ? (rawKey || 'no-key') : rawKey;

  const db = getDb();

  // A keyless provider needs only one sentinel row — re-enable an existing one
  // instead of piling up duplicates each time the user clicks "Add".
  if (isKeyless) {
    const existing = db.prepare('SELECT id FROM api_keys WHERE platform = ? LIMIT 1').get(platform) as { id: number } | undefined;
    if (existing) {
      db.prepare("UPDATE api_keys SET enabled = 1, status = 'unknown' WHERE id = ?").run(existing.id);
      res.status(200).json({
        id: existing.id,
        platform,
        label: label ?? '',
        maskedKey: maskKey(keyToStore),
        status: 'unknown',
        enabled: true,
        modelsAvailable: enabledModelCount(platform),
        notice: noModelsNotice(platform),
      });
      return;
    }
  }

  const { encrypted, iv, authTag } = encrypt(keyToStore);
  // For custom vendor platforms, look up and store the vendor's base URL so the
  // proxy can resolve it at runtime without a hardcoded provider registry entry.
  const customBaseUrl = getCustomVendorBaseUrl(platform);
  const result = db.prepare(`
    INSERT INTO api_keys (platform, label, encrypted_key, iv, auth_tag, status, enabled, base_url)
    VALUES (?, ?, ?, ?, ?, 'unknown', 1, ?)
  `).run(platform, label ?? '', encrypted, iv, authTag, customBaseUrl);

  res.status(201).json({
    id: result.lastInsertRowid,
    platform,
    label: label ?? '',
    maskedKey: maskKey(keyToStore),
    status: 'unknown',
    enabled: true,
    modelsAvailable: enabledModelCount(platform),
    notice: noModelsNotice(platform),
  });
});

// ── Custom OpenAI-compatible providers (#117, #212) ───────────────────────
// User-configured endpoints (llama.cpp / LM Studio / vLLM / Ollama / any
// OpenAI-compatible base_url). Each DISTINCT base_url gets its own 'custom'
// api_keys row, and every registered model binds to its endpoint's key via
// models.key_id — so several custom providers coexist without overwriting
// each other (#212). Re-submitting an existing base_url updates its key/label;
// re-registering an existing model id re-binds it to the submitted endpoint.
// A model can be given as a bare id ("qwen3:4b") or as {model, displayName}.
// `model`/`displayName` (singular) stay supported for older clients; `models`
// (plural) lets one submit bind several model ids to the same endpoint. (#281)
// A custom model can declare its capabilities at registration. `supportsTools`
// defaults to 1 (modern OpenAI-compatible servers — Ollama, vLLM, LM Studio —
// all emit tool calls), `supportsVision` defaults to 0 unless declared. Leaving
// a flag unset keeps the DB default on insert and preserves the stored value on
// re-registration, so a capability the user later toggled isn't clobbered. (#470)
const modelEntrySchema = z.union([
  z.string().min(1),
  z.object({
    model: z.string().min(1),
    displayName: z.string().optional(),
    supportsTools: z.boolean().optional(),
    supportsVision: z.boolean().optional(),
  }),
]);
const customProviderSchema = z.object({
  baseUrl: z.string().url('baseUrl must be a valid URL'),
  model: z.string().optional(),
  models: z.array(modelEntrySchema).optional(),
  displayName: z.string().optional(),
  apiKey: z.string().optional(),
  label: z.string().optional(),
  // Top-level defaults applied to every model in this submit; a per-entry flag
  // (object form) overrides them for that one model.
  supportsTools: z.boolean().optional(),
  supportsVision: z.boolean().optional(),
}).refine(
  d => (d.model && d.model.trim().length > 0) || (d.models && d.models.length > 0),
  { message: 'model or models is required' },
);

keysRouter.post('/custom', async (req: Request, res: Response) => {
  const parsed = customProviderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: parsed.error.errors.map(e => e.message).join(', ') } });
    return;
  }

  const baseUrl = parsed.data.baseUrl.trim().replace(/\/+$/, '');

  // SSRF guard (#440): a base_url is the one user-controlled outbound target.
  // Cloud metadata / link-local addresses are rejected outright; private
  // ranges too when LLMROUTER_BLOCK_PRIVATE_PROVIDER_URLS is set. Re-checked
  // at request time in proxyFetch for URLs already in the DB.
  const verdict = await assessProviderUrl(baseUrl);
  if (!verdict.allowed) {
    res.status(400).json({ error: { message: `baseUrl rejected: ${verdict.reason}` } });
    return;
  }
  // Local servers often need no key; keep a sentinel so there's always a bearer.
  const providedKey = parsed.data.apiKey?.trim() || undefined;
  const label = parsed.data.label?.trim() || undefined;

  // Flatten singular + plural inputs into one list, dedupe by model id, drop
  // blanks. The singular `displayName` only applies to a lone `model` (it can't
  // sensibly fan out across many ids). Capability flags resolve per-entry first,
  // then fall back to the submit-level defaults, then to undefined (DB default).
  const topTools = parsed.data.supportsTools;
  const topVision = parsed.data.supportsVision;
  const entries: { modelId: string; displayName: string; supportsTools?: boolean; supportsVision?: boolean }[] = [];
  const seen = new Set<string>();
  const addEntry = (rawId: string, rawDisplay?: string, tools?: boolean, vision?: boolean) => {
    const modelId = rawId.trim();
    if (!modelId || seen.has(modelId)) return;
    seen.add(modelId);
    entries.push({
      modelId,
      displayName: (rawDisplay?.trim() || modelId),
      supportsTools: tools ?? topTools,
      supportsVision: vision ?? topVision,
    });
  };
  if (parsed.data.model?.trim()) addEntry(parsed.data.model, parsed.data.displayName);
  for (const m of parsed.data.models ?? []) {
    if (typeof m === 'string') addEntry(m);
    else addEntry(m.model, m.displayName, m.supportsTools, m.supportsVision);
  }

  if (entries.length === 0) {
    res.status(400).json({ error: { message: 'model or models is required' } });
    return;
  }

  const db = getDb();
  const upsert = db.transaction(() => {
    // One 'custom' key row PER ENDPOINT (matched on base_url). Re-submitting
    // the same endpoint updates its key/label; a new base_url gets its own
// row instead of clobbering the previous provider. (#212) Re-submitting with a
// blank key preserves the stored key; only a provided key updates credentials.
    const existing = db.prepare("SELECT id, encrypted_key, iv, auth_tag FROM api_keys WHERE platform = 'custom' AND base_url = ? LIMIT 1")
      .get(baseUrl) as { id: number; encrypted_key: string; iv: string; auth_tag: string } | undefined;
    let keyId: number;
    let storedKeyForMask = providedKey ?? 'no-key';
    if (existing) {
      keyId = existing.id;
      if (providedKey) {
        const { encrypted, iv, authTag } = encrypt(providedKey);
        db.prepare("UPDATE api_keys SET label = COALESCE(?, label), encrypted_key = ?, iv = ?, auth_tag = ?, status = 'unknown', enabled = 1 WHERE id = ?")
          .run(label ?? null, encrypted, iv, authTag, existing.id);
        storedKeyForMask = providedKey;
      } else {
        try {
          storedKeyForMask = decrypt(existing.encrypted_key, existing.iv, existing.auth_tag);
        } catch {
          storedKeyForMask = 'no-key';
        }
        db.prepare("UPDATE api_keys SET label = COALESCE(?, label), status = 'unknown', enabled = 1 WHERE id = ?")
          .run(label ?? null, existing.id);
      }
    } else {
      const keyToStore = providedKey ?? 'no-key';
      const { encrypted, iv, authTag } = encrypt(keyToStore);
      const r = db.prepare(`
        INSERT INTO api_keys (platform, label, encrypted_key, iv, auth_tag, status, enabled, base_url)
        VALUES ('custom', ?, ?, ?, ?, 'unknown', 1, ?)
      `).run(label ?? 'Custom', encrypted, iv, authTag, baseUrl);
      keyId = Number(r.lastInsertRowid);
      storedKeyForMask = keyToStore;
    }

    const registered: { modelDbId: number; model: string; displayName: string; supportsTools: boolean; supportsVision: boolean }[] = [];
    for (const { modelId, displayName, supportsTools, supportsVision } of entries) {
      // Register each model bound to THIS endpoint's key. Custom models carry no
      // rate limits and sort last in the intelligence preset (size_label tier).
      // Re-registering an existing model id re-binds it (model ids are unique
      // per platform, so one id can't live on two endpoints at once).
      // Capability flags: an unset flag binds NULL so COALESCE picks the insert
      // default (tools 1, vision 0) on a new row and preserves the existing
      // value on re-registration. (#470)
      const toolsParam = supportsTools === undefined ? null : (supportsTools ? 1 : 0);
      const visionParam = supportsVision === undefined ? null : (supportsVision ? 1 : 0);
      db.prepare(`
        INSERT INTO models
          (platform, model_id, display_name, intelligence_rank, speed_rank, size_label,
           rpm_limit, rpd_limit, tpm_limit, tpd_limit, monthly_token_budget, context_window, enabled, key_id,
           supports_tools, supports_vision)
        VALUES ('custom', @modelId, @displayName, 50, 50, 'Custom', NULL, NULL, NULL, NULL, '', NULL, 1, @keyId,
           COALESCE(@tools, 1), COALESCE(@vision, 0))
        ON CONFLICT(platform, model_id)
        DO UPDATE SET
          display_name = excluded.display_name,
          key_id = excluded.key_id,
          enabled = 1,
          supports_tools = COALESCE(@tools, supports_tools),
          supports_vision = COALESCE(@vision, supports_vision)
      `).run({ modelId, displayName, keyId, tools: toolsParam, vision: visionParam });

      const modelRow = db.prepare("SELECT id, supports_tools, supports_vision FROM models WHERE platform = 'custom' AND model_id = ?").get(modelId) as { id: number; supports_tools: number; supports_vision: number };

      // Append to the fallback chain if not already present.
      const inChain = db.prepare('SELECT 1 FROM fallback_config WHERE model_db_id = ?').get(modelRow.id);
      if (!inChain) {
        const max = db.prepare('SELECT COALESCE(MAX(priority), 0) AS m FROM fallback_config').get() as { m: number };
        db.prepare('INSERT INTO fallback_config (model_db_id, priority, enabled) VALUES (?, ?, 1)').run(modelRow.id, max.m + 1);
      }

      registered.push({
        modelDbId: modelRow.id,
        model: modelId,
        displayName,
        supportsTools: modelRow.supports_tools === 1,
        supportsVision: modelRow.supports_vision === 1,
      });
    }

    return { keyId, registered, storedKeyForMask };
  });

  const { keyId, registered, storedKeyForMask } = upsert();
  // `model`/`displayName`/`modelDbId` echo the first model for older clients;
  // `models` carries the full set registered in this call.
  const first = registered[0]!;
  res.status(201).json({
    success: true,
    keyId,
    modelDbId: first.modelDbId,
    platform: 'custom',
    baseUrl,
    model: first.model,
    displayName: first.displayName,
    supportsTools: first.supportsTools,
    supportsVision: first.supportsVision,
    models: registered,
    maskedKey: maskKey(storedKeyForMask),
  });
});

keysRouter.post('/import', (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err: any) => {
    if (handleUploadError(err, res, next)) return;

    try {
      if (!req.file) {
        res.status(400).json({ error: { message: 'No file uploaded' } });
        return;
      }

      const result = parseUpload(req.file);
      const imported: Array<{ keyName: string; platform: string }> = [];
      const skipped = [...result.skipped];
      const errors: Array<{ key: string; error: string }> = [];

      for (const parsedKey of result.keys) {
        const { keyName, keyValue } = splitRawKey(parsedKey.rawKey);
        if (!parsedKey.platform) {
          skipped.push(keyName);
          continue;
        }
        const validPlatforms = validPlatformsSet();
        if (!validPlatforms.has(parsedKey.platform) || parsedKey.platform === 'custom') {
          skipped.push(keyName);
          continue;
        }
        if (!keyValue.trim()) {
          errors.push({ key: keyName, error: 'keyValue must be at least 1 character' });
          continue;
        }

        try {
          insertImportedKey(parsedKey.platform, keyName, keyValue);
          imported.push({ keyName, platform: parsedKey.platform });
        } catch (insertErr) {
          errors.push({ key: keyName, error: (insertErr as Error).message });
        }
      }

      res.json({
        imported: imported.length,
        skipped,
        errors,
        total: result.keys.length + result.skipped.length,
      });
    } catch (handlerErr: any) {
      res.status(handlerErr.status ?? 500).json({ error: { message: handlerErr.message } });
    }
  });
});

keysRouter.post('/preview', (req: Request, res: Response, next: NextFunction) => {
  upload.array('files', 10)(req, res, (err: any) => {
    if (handleUploadError(err, res, next)) return;

    try {
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        res.status(400).json({ error: { message: 'No files uploaded' } });
        return;
      }

      const keys: Array<{ keyName: string; keyValue: string; detectedPlatform: string | null; prefix: string; isDuplicate: boolean }> = [];
      const skipped: string[] = [];

      // Build a set of existing decrypted key values for duplicate detection
      const db = getDb();
      const existingRows = db.prepare('SELECT encrypted_key, iv, auth_tag FROM api_keys').all() as any[];
      const existingKeys = new Set<string>();
      for (const row of existingRows) {
        try {
          existingKeys.add(decrypt(row.encrypted_key, row.iv, row.auth_tag));
        } catch { /* skip undecryptable rows */ }
      }

      let duplicateCount = 0;

      for (const file of files) {
        const result = parseUpload(file);
        for (const parsedKey of result.keys) {
          const { keyName, keyValue } = splitRawKey(parsedKey.rawKey);
          const isDuplicate = existingKeys.has(keyValue.trim());
          if (isDuplicate) duplicateCount++;
          keys.push({
            keyName,
            keyValue,
            detectedPlatform: parsedKey.platform,
            prefix: parsedKey.prefix,
            isDuplicate,
          });
        }
        skipped.push(...result.skipped);
      }

      res.json({ keys, total: keys.length, skipped, duplicates: duplicateCount });
    } catch (handlerErr: any) {
      res.status(handlerErr.status ?? 500).json({ error: { message: handlerErr.message } });
    }
  });
});

keysRouter.post('/import-selected', (req: Request, res: Response) => {
  const parsed = z.object({ keys: z.array(importKeySchema).max(100) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: parsed.error.errors.map(e => e.message).join(', ') } });
    return;
  }

  let imported = 0;
  let duplicateSkipped = 0;
  const errors: Array<{ key: string; error: string }> = [];

  // Build a set of existing decrypted key values for duplicate detection
  const db = getDb();
  const existingRows = db.prepare('SELECT encrypted_key, iv, auth_tag FROM api_keys').all() as any[];
  const existingKeys = new Set<string>();
  for (const row of existingRows) {
    try {
      existingKeys.add(decrypt(row.encrypted_key, row.iv, row.auth_tag));
    } catch { /* skip undecryptable rows */ }
  }

  for (const key of parsed.data.keys) {
    const keyName = key.keyName?.trim() || key.platform;
    if (key.platform === 'custom') {
      errors.push({ key: keyName, error: 'Custom providers must be added with a base URL' });
      continue;
    }

    if (existingKeys.has(key.keyValue.trim())) {
      duplicateSkipped++;
      errors.push({ key: keyName, error: 'Duplicate key — already exists' });
      continue;
    }

    try {
      insertImportedKey(key.platform, keyName, key.keyValue);
      imported++;
      existingKeys.add(key.keyValue.trim());
    } catch (err) {
      errors.push({ key: keyName, error: (err as Error).message });
    }
  }

  res.json({
    imported,
    skipped: [],
    errors,
    total: parsed.data.keys.length,
  });
});

// Delete a key
keysRouter.delete('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: { message: 'Invalid key ID' } });
    return;
  }

  const db = getDb();
  const row = db.prepare('SELECT platform FROM api_keys WHERE id = ?').get(id) as { platform: string } | undefined;
  if (!row) {
    res.status(404).json({ error: { message: 'Key not found' } });
    return;
  }

  const remove = db.transaction(() => {
    db.prepare('DELETE FROM api_keys WHERE id = ?').run(id);
    // Custom models exist only because POST /custom registered them alongside
    // their endpoint key (#117) — they can't route without it. Cascade away
    // the models bound to THIS endpoint (#212); other custom providers keep
    // theirs. Legacy rows (key_id NULL) are swept once no custom keys remain,
    // so they never linger in the fallback chain forever (#189).
    if (row.platform === 'custom') {
      const defaultEmbedding = db.prepare("SELECT value FROM settings WHERE key = 'embeddings_default_family'").get() as { value: string } | undefined;
      db.prepare("DELETE FROM fallback_config WHERE model_db_id IN (SELECT id FROM models WHERE platform = 'custom' AND key_id = ?)").run(id);
      db.prepare("DELETE FROM models WHERE platform = 'custom' AND key_id = ?").run(id);
      db.prepare("DELETE FROM embedding_models WHERE platform = 'custom' AND key_id = ?").run(id);
      db.prepare("DELETE FROM media_models WHERE platform = 'custom' AND key_id = ?").run(id);
      const remaining = db.prepare("SELECT COUNT(*) AS n FROM api_keys WHERE platform = 'custom'").get() as { n: number };
      if (remaining.n === 0) {
        db.prepare("DELETE FROM fallback_config WHERE model_db_id IN (SELECT id FROM models WHERE platform = 'custom')").run();
        db.prepare("DELETE FROM models WHERE platform = 'custom'").run();
        db.prepare("DELETE FROM embedding_models WHERE platform = 'custom'").run();
        db.prepare("DELETE FROM media_models WHERE platform = 'custom'").run();
      }
      if (defaultEmbedding) {
        const stillExists = db.prepare('SELECT 1 FROM embedding_models WHERE family = ? LIMIT 1').get(defaultEmbedding.value);
        if (!stillExists) {
          const replacement = db.prepare('SELECT family FROM embedding_models ORDER BY family, priority LIMIT 1').get() as { family: string } | undefined;
          if (replacement) {
            db.prepare("UPDATE settings SET value = ? WHERE key = 'embeddings_default_family'").run(replacement.family);
          }
        }
      }
    }
  });
  remove();

  res.json({ success: true });
});

// Toggle all keys for a platform
keysRouter.patch('/platform/:platform', (req: Request, res: Response) => {
  const platform = req.params.platform as string;
  if (!validPlatformsSet().has(platform)) {
    res.status(400).json({ error: { message: `Invalid platform '${platform}'` } });
    return;
  }

  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    res.status(400).json({ error: { message: 'enabled must be a boolean' } });
    return;
  }

  const db = getDb();
  const result = db.prepare('UPDATE api_keys SET enabled = ? WHERE platform = ?').run(enabled ? 1 : 0, platform);

  res.json({ success: true, enabled, updatedKeys: result.changes });
});

// Delete all keys for a platform (vendor)
keysRouter.delete('/platform/:platform', (req: Request, res: Response) => {
  const platform = req.params.platform as string;
  if (!validPlatformsSet().has(platform)) {
    res.status(400).json({ error: { message: `Invalid platform '${platform}'` } });
    return;
  }

  const db = getDb();
  const remove = db.transaction(() => {
    if (platform === 'custom') {
      // Cascade: delete fallback configs, models, embeddings, media for all custom keys
      db.prepare("DELETE FROM fallback_config WHERE model_db_id IN (SELECT id FROM models WHERE platform = 'custom')").run();
      db.prepare("DELETE FROM models WHERE platform = 'custom'").run();
      db.prepare("DELETE FROM embedding_models WHERE platform = 'custom'").run();
      db.prepare("DELETE FROM media_models WHERE platform = 'custom'").run();
    }
    const result = db.prepare('DELETE FROM api_keys WHERE platform = ?').run(platform);
    return result.changes;
  });
  const deletedCount = remove();

  res.json({ success: true, deletedKeys: deletedCount });
});

// Update key (toggle enable/disable or edit label)
keysRouter.patch('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: { message: 'Invalid key ID' } });
    return;
  }

  const parsed = updateKeySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: parsed.error.errors.map(e => e.message).join(', ') } });
    return;
  }

  const { enabled, label, apiKey } = parsed.data;
  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (enabled !== undefined) {
    updates.push('enabled = ?');
    values.push(enabled ? 1 : 0);
  }
  if (label !== undefined) {
    updates.push('label = ?');
    values.push(label);
  }
  if (apiKey !== undefined) {
    const { encrypted, iv, authTag } = encrypt(apiKey);
    updates.push('encrypted_key = ?');
    updates.push('iv = ?');
    updates.push('auth_tag = ?');
    values.push(encrypted, iv, authTag);
  }

  values.push(id);

  const db = getDb();
  const result = db.prepare(`UPDATE api_keys SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  if (result.changes === 0) {
    res.status(404).json({ error: { message: 'Key not found' } });
    return;
  }

  const response: Record<string, unknown> = { success: true };
  if (enabled !== undefined) response.enabled = enabled;
  if (label !== undefined) response.label = label;
  res.json(response);
});

// Fetch available models from a user-provided OpenAI-compatible endpoint.
// POST /api/keys/fetch-models  { baseUrl, apiKey? }
// Proxies GET {baseUrl}/models and returns a cleaned-up model ID list so the
// client can render checkboxes before submitting the custom provider form.
const fetchModelsSchema = z.object({
  baseUrl: z.string().min(1, 'baseUrl is required'),
  apiKey: z.string().optional(),
});

keysRouter.post('/fetch-models', async (req: Request, res: Response) => {
  const parsed = fetchModelsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: parsed.error.errors.map(e => e.message).join(', ') } });
    return;
  }

  const baseUrl = parsed.data.baseUrl.trim().replace(/\/+$/, '');
  const apiKey = parsed.data.apiKey?.trim();

  const verdict = await assessProviderUrl(baseUrl);
  if (!verdict.allowed) {
    res.status(400).json({ error: { message: `baseUrl rejected: ${verdict.reason}` } });
    return;
  }

  const modelsUrl = `${baseUrl}/models`;
  try {
    const r = await fetch(modelsUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!r.ok) {
      let detail = '';
      try { detail = await r.text(); } catch { /* ignore */ }

      // 429: rate limited — the user likely needs an API key
      if (r.status === 429) {
        const msg = apiKey
          ? '请求过于频繁，请稍后再试（API 密钥已提供，但上游限流）'
          : '该端点对未认证请求限流了（429）。请先在下方 API 密钥输入框中提供有效的 API 密钥，然后重新获取模型列表。';
        res.status(502).json({ error: { message: msg, detail } });
        return;
      }

      // 401/403: auth needed
      if (r.status === 401 || r.status === 403) {
        const msg = apiKey
          ? `认证失败（${r.status}），请检查 API 密钥是否正确`
          : `该端点需要认证（${r.status}）。请在下方 API 密钥输入框中提供有效的 API 密钥后重试。`;
        res.status(502).json({ error: { message: msg, detail } });
        return;
      }

      res.status(502).json({
        error: {
          message: `上游返回 ${r.status} ${r.statusText}，请检查 Base URL 和 API 密钥是否正确`,
          detail,
        },
      });
      return;
    }

    const data = await r.json() as { data?: { id: string }[]; object?: string };
    const rawModels: string[] = [];
    if (Array.isArray(data?.data)) {
      for (const m of data.data) {
        if (m?.id && typeof m.id === 'string') {
          rawModels.push(m.id);
        }
      }
    }
    // Also handle plain array response (some proxies return just [])
    if (rawModels.length === 0 && Array.isArray(data)) {
      for (const m of data) {
        if (m?.id && typeof m.id === 'string') rawModels.push(m.id);
      }
    }

    if (rawModels.length === 0) {
      res.status(200).json({ models: [], warning: 'No models found in the upstream response.' });
      return;
    }

    // Deduplicate and sort
    const unique = [...new Set(rawModels)].sort();
    res.json({ models: unique });
  } catch (err: any) {
    res.status(502).json({
      error: {
        message: `Failed to reach ${modelsUrl}: ${err.message || 'Unknown error'}`,
      },
    });
  }
});
