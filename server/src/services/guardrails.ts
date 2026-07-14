import { getDb } from '../db/index.js';

interface GuardrailRule {
  id: number;
  name: string;
  type: 'pii' | 'keyword' | 'regex' | 'custom';
  pattern: string;
  action: 'block' | 'warn' | 'log' | 'redact';
  scope: 'all' | 'input' | 'output';
  enabled: number;
  priority: number;
}

interface GuardrailResult {
  passed: boolean;
  violations: Array<{ rule: string; type: string; action: string; match: string }>;
  sanitized?: string;
}

// Memoized compiled regex cache to avoid re-compilation on every request
const regexCache = new Map<string, RegExp>();

function getCompiledRegex(pattern: string): RegExp {
  if (regexCache.has(pattern)) return regexCache.get(pattern)!;
  try {
    const re = new RegExp(pattern, 'gi');
    regexCache.set(pattern, re);
    return re;
  } catch {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'gi');
    regexCache.set(pattern, re);
    return re;
  }
}

export function getEnabledRules(): GuardrailRule[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM guardrail_rules WHERE enabled = 1 ORDER BY priority DESC
  `).all() as GuardrailRule[];
}

export function checkContent(
  content: string,
  scope: 'input' | 'output',
  rules?: GuardrailRule[]
): GuardrailResult {
  const activeRules = rules || getEnabledRules();
  const violations: GuardrailResult['violations'] = [];
  let sanitized = content;

  for (const rule of activeRules) {
    if (rule.scope !== 'all' && rule.scope !== scope) continue;

    const regex = getCompiledRegex(rule.pattern);
    let match: RegExpExecArray | null;

    // Reset lastIndex for global regex
    regex.lastIndex = 0;

    while ((match = regex.exec(content)) !== null) {
      violations.push({
        rule: rule.name,
        type: rule.type,
        action: rule.action,
        match: match[0],
      });

      if (rule.action === 'redact') {
        sanitized = sanitized.replaceAll(match[0], '[REDACTED]');
      }

      // Prevent infinite loop on zero-length matches
      if (match.index === regex.lastIndex) regex.lastIndex++;
    }
  }

  const hasBlockViolation = violations.some(v => v.action === 'block');

  return {
    passed: !hasBlockViolation,
    violations,
    sanitized: violations.some(v => v.action === 'redact') ? sanitized : undefined,
  };
}

// Fast check - return early on first block violation (for proxy path)
export function quickCheck(content: string, scope: 'input' | 'output'): GuardrailResult {
  const rules = getEnabledRules();

  for (const rule of rules) {
    if (rule.scope !== 'all' && rule.scope !== scope) continue;
    if (rule.action !== 'block') continue;

    const regex = getCompiledRegex(rule.pattern);
    if (regex.test(content)) {
      return {
        passed: false,
        violations: [{ rule: rule.name, type: rule.type, action: 'block', match: '' }],
      };
    }
  }

  return checkContent(content, scope, rules);
}

// Clear regex cache (useful when rules are updated via API)
export function clearGuardrailCache(): void {
  regexCache.clear();
}
