import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { getDb } from '../db/index.js';

export const providersRouter = Router();

// ── Default system platforms map for slug collision avoidance ────────
const SYSTEM_PLATFORMS = new Set([
  'google','groq','cerebras','nvidia','mistral','openrouter','github','cohere',
  'cloudflare','zhipu','ollama','kilo','pollinations','ovh','llm7','huggingface',
  'opencode','agnes','reka','siliconflow','routeway','bazaarlink','ainative','aihorde',
  'aliyun','qianfan','custom',
]);

const VENDOR_TYPES = ['chat', 'embedding', 'image', 'audio'] as const;

// ── Schemas ──────────────────────────────────────────────────────────
const safeName = z.string().min(1, '厂商名称不能为空').max(100)
  .regex(/^[a-zA-Z0-9\u4e00-\u9fff_\-.\s()（）]+$/, '名称包含不允许的字符');
const safeUrl = z.string().max(500).optional().default('');
const safeType = z.enum(VENDOR_TYPES);

const addProviderSchema = z.object({
  name: safeName,
  apiBaseUrl: safeUrl,
  vendorType: safeType.default('chat'),
  description: z.string().max(500).optional().default(''),
});

const updateProviderSchema = z.object({
  name: safeName.optional(),
  apiBaseUrl: safeUrl.optional(),
  vendorType: safeType.optional(),
  description: z.string().max(500).optional(),
});

const importProviderSchema = z.object({
  name: safeName,
  apiBaseUrl: safeUrl,
  vendorType: safeType.default('chat'),
  description: z.string().max(500).optional().default(''),
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase();
    if (ext.endsWith('.json') || ext.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 JSON 或 CSV 格式文件'));
    }
  },
});

// ── Slugify Chinese/English name → safe platform ID ──────────────────
function slugify(name: string): string {
  let s = name
    .replace(/[^\w\u4e00-\u9fff\s-]/g, '')
    .trim()
    .toLowerCase();
  // Collapse Chinese chars into pinyin-like segments
  if (/[\u4e00-\u9fff]/.test(s)) {
    // Use a simple hash-based approach for Chinese names
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = ((hash << 5) - hash) + name.charCodeAt(i);
      hash |= 0;
    }
    s = 'vendor_' + Math.abs(hash).toString(36);
  } else {
    s = s.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (!s || s.length < 2) s = 'vendor_' + Date.now().toString(36);
  }
  return s;
}

function generatePlatform(name: string, db: ReturnType<typeof getDb>): string {
  let base = slugify(name);
  if (!SYSTEM_PLATFORMS.has(base)) {
    const exists = db.prepare('SELECT 1 FROM provider_vendors WHERE platform = ?').get(base);
    if (!exists) return base;
  }
  // Append suffix if collision
  for (let i = 1; i < 100; i++) {
    const cand = base + '_' + i;
    if (!SYSTEM_PLATFORMS.has(cand)) {
      const exists = db.prepare('SELECT 1 FROM provider_vendors WHERE platform = ?').get(cand);
      if (!exists) return cand;
    }
  }
  return base + '_' + Date.now().toString(36);
}

// ── Row → JSON ───────────────────────────────────────────────────────
function toVendor(row: any) {
  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    apiBaseUrl: row.api_base_url || '',
    vendorType: row.vendor_type || 'chat',
    description: row.description || '',
    isSystem: row.is_system === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function queryAll(db: ReturnType<typeof getDb>) {
  return (db.prepare(
    'SELECT * FROM provider_vendors ORDER BY is_system DESC, name ASC',
  ).all() as any[]).map(toVendor);
}

// ── GET /api/providers ───────────────────────────────────────────────
providersRouter.get('/', (_req: Request, res: Response) => {
  res.json(queryAll(getDb()));
});

// ── POST /api/providers — add a custom provider ──────────────────────
providersRouter.post('/', (req: Request, res: Response) => {
  const parsed = addProviderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: parsed.error.errors.map(e => e.message).join(', ') } });
    return;
  }

  const { name, apiBaseUrl, vendorType, description } = parsed.data;
  const db = getDb();

  const existing = db.prepare('SELECT id FROM provider_vendors WHERE name = ?').get(name);
  if (existing) {
    res.status(409).json({ error: { message: `厂商 "${name}" 已存在` } });
    return;
  }

  const platform = generatePlatform(name, db);
  const result = db.prepare(
    'INSERT INTO provider_vendors (name, platform, api_base_url, description, vendor_type, is_system) VALUES (?, ?, ?, ?, ?, 0)',
  ).run(name, platform, apiBaseUrl, description, vendorType);

  const row = db.prepare('SELECT * FROM provider_vendors WHERE id = ?').get(result.lastInsertRowid) as any;
  res.status(201).json(toVendor(row));
});

// ── PUT /api/providers/:id ───────────────────────────────────────────
providersRouter.put('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: { message: '无效的厂商 ID' } });
    return;
  }

  const parsed = updateProviderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: parsed.error.errors.map(e => e.message).join(', ') } });
    return;
  }

  const db = getDb();
  const existing = db.prepare('SELECT * FROM provider_vendors WHERE id = ?').get(id) as any;
  if (!existing) {
    res.status(404).json({ error: { message: '厂商不存在' } });
    return;
  }
  if (existing.is_system === 1) {
    res.status(403).json({ error: { message: '系统内置厂商不可修改' } });
    return;
  }

  const updates: string[] = ["updated_at = datetime('now')"];
  const values: (string | number)[] = [];

  if (parsed.data.name !== undefined) {
    const dup = db.prepare('SELECT id FROM provider_vendors WHERE name = ? AND id != ?').get(parsed.data.name, id);
    if (dup) {
      res.status(409).json({ error: { message: `厂商 "${parsed.data.name}" 已存在` } });
      return;
    }
    updates.push('name = ?');
    values.push(parsed.data.name);
  }
  if (parsed.data.apiBaseUrl !== undefined) {
    updates.push('api_base_url = ?');
    values.push(parsed.data.apiBaseUrl);
  }
  if (parsed.data.vendorType !== undefined) {
    updates.push('vendor_type = ?');
    values.push(parsed.data.vendorType);
  }
  if (parsed.data.description !== undefined) {
    updates.push('description = ?');
    values.push(parsed.data.description);
  }

  values.push(id);
  db.prepare(`UPDATE provider_vendors SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM provider_vendors WHERE id = ?').get(id) as any;
  res.json(toVendor(updated));
});

// ── DELETE /api/providers/:id ────────────────────────────────────────
providersRouter.delete('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: { message: '无效的厂商 ID' } });
    return;
  }

  const db = getDb();
  const existing = db.prepare('SELECT * FROM provider_vendors WHERE id = ?').get(id) as any;
  if (!existing) {
    res.status(404).json({ error: { message: '厂商不存在' } });
    return;
  }
  if (existing.is_system === 1) {
    res.status(403).json({ error: { message: '系统内置厂商不可删除' } });
    return;
  }

  db.prepare('DELETE FROM provider_vendors WHERE id = ?').run(id);
  res.json({ success: true });
});

// ── GET /api/providers/template/download ─────────────────────────────
providersRouter.get('/template/download', (_req: Request, res: Response) => {
  // BOM for Excel UTF-8; 厂商名称, Base URL, 类型
  const csv =
    '\uFEFF厂商名称,API地址,类型\n' +
    '我的OpenAI代理,https://my-proxy.example.com/v1,chat\n' +
    '阿里百炼,https://dashscope.aliyuncs.com/compatible-mode/v1,chat\n' +
    'DeepSeek,https://api.deepseek.com/v1,chat\n' +
    '本地嵌入模型,http://localhost:8080/v1,embedding\n';

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="llmrouter-vendors-template.csv"');
  res.send(csv);
});

// ── POST /api/providers/import — batch import ────────────────────────
providersRouter.post('/import', (req: Request, res: Response) => {
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      res.status(400).json({ error: { message: err.message?.includes('仅支持') ? err.message : '文件上传失败' } });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: { message: '未上传文件' } });
      return;
    }

    try {
      const content = req.file.buffer.toString('utf8').trim();
      if (!content) {
        res.status(400).json({ error: { message: '文件内容为空' } });
        return;
      }

      const filename = req.file.originalname.toLowerCase();
      let entries: { name: string; apiBaseUrl: string; vendorType: string; description: string }[] = [];

      if (filename.endsWith('.json')) {
        const data = JSON.parse(content);
        const rawArray = Array.isArray(data) ? data : (data.vendors || data.providers || []);
        for (const item of rawArray) {
          // Support both new format (name,api_base_url,type) and legacy (name,platform,api_base_url)
          const normalized = {
            name: item.name || '',
            apiBaseUrl: item.api_base_url || item.apiBaseUrl || '',
            vendorType: item.type || item.vendorType || item.vendor_type || 'chat',
            description: item.description || '',
          };
          const parsed = importProviderSchema.safeParse(normalized);
          if (parsed.success) entries.push(parsed.data);
        }
      } else {
        // CSV: stripping BOM if present
        const clean = content.replace(/^\uFEFF/, '');
        const lines = clean.split('\n').filter(l => l.trim());
        const header = lines[0]?.toLowerCase();
        if (!header || (!header.includes('name') && !header.includes('厂商'))) {
          res.status(400).json({ error: { message: 'CSV 格式错误：缺少表头行' } });
          return;
        }
        const cols = header.split(',').map(c => c.trim());
        const nameIdx = cols.findIndex(c => c === 'name' || c === '厂商名称' || c === '厂商' || c === '名称');
        const urlIdx = cols.findIndex(c => c.includes('url') || c.includes('地址') || c === 'api_base_url');
        const typeIdx = cols.findIndex(c => c === 'type' || c === '类型' || c === 'vendor_type');
        // Legacy support
        const platformIdx = cols.findIndex(c => c === 'platform');
        const descIdx = cols.findIndex(c => c === 'description' || c === '描述');

        if (nameIdx === -1) {
          res.status(400).json({ error: { message: 'CSV 格式错误：缺少厂商名称列' } });
          return;
        }

        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          const name = values[nameIdx]?.trim();
          if (!name) continue;
          const apiBaseUrl = urlIdx >= 0 ? (values[urlIdx]?.trim() || '') : '';
          const vendorType = typeIdx >= 0 ? (values[typeIdx]?.trim() || 'chat') : 'chat';
          const description = descIdx >= 0 ? (values[descIdx]?.trim() || '') : '';
          entries.push({ name, apiBaseUrl, vendorType, description });
        }
      }

      if (entries.length === 0) {
        res.status(400).json({ error: { message: '未找到有效的厂商数据' } });
        return;
      }

      const db = getDb();
      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];

      const insertStmt = db.prepare(
        'INSERT OR IGNORE INTO provider_vendors (name, platform, api_base_url, description, vendor_type, is_system) VALUES (?, ?, ?, ?, ?, 0)',
      );

      const tx = db.transaction(() => {
        for (const entry of entries) {
          try {
            const platform = generatePlatform(entry.name, db);
            const result = insertStmt.run(entry.name, platform, entry.apiBaseUrl, entry.description, entry.vendorType);
            if (result.changes > 0) imported++;
            else skipped++;
          } catch (e) {
            errors.push(`${entry.name}: ${(e as Error).message}`);
          }
        }
      });

      tx();

      res.json({
        imported,
        skipped,
        total: entries.length,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (e) {
      res.status(400).json({ error: { message: `文件解析失败: ${(e as Error).message}` } });
    }
  });
});

// ── CSV line parser ──────────────────────────────────────────────────
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { result.push(current); current = ''; }
      else current += ch;
    }
  }
  result.push(current);
  return result;
}
