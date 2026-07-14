import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Shield, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogClose, DialogPopup, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { apiFetch } from '@/lib/api'
import { toast } from '@/lib/toast'

export default function GuardrailsPage() {
  const queryClient = useQueryClient()
  const { data: rules } = useQuery({
    queryKey: ['guardrails'],
    queryFn: () => apiFetch<any[]>('/api/guardrails'),
  })

  const deleteRule = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/guardrails/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guardrails'] })
      toast.success('规则已删除')
    },
  })

  const toggleRule = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      apiFetch(`/api/guardrails/${id}`, { method: 'PUT', body: JSON.stringify({ enabled }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['guardrails'] }),
  })

  const typeLabel: Record<string, string> = {
    keyword: '关键词',
    regex: '正则',
    pii: 'PII',
    custom: '自定义',
  }
  const actionLabel: Record<string, string> = {
    block: '拦截',
    warn: '警告',
    log: '记录',
    redact: '脱敏',
  }
  const actionColor: Record<string, string> = {
    block: 'text-rose-500',
    warn: 'text-amber-500',
    log: 'text-muted-foreground',
    redact: 'text-blue-500',
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">安全防护</h1>
          <p className="text-[11px] text-muted-foreground">敏感信息检测与内容过滤，自动拦截或遮盖危险内容</p>
        </div>
        <AddRuleDialog onAdd={() => queryClient.invalidateQueries({ queryKey: ['guardrails'] })} />
      </div>

      {!rules?.length && (
        <div className="rounded-lg border bg-card py-10 text-center text-sm text-muted-foreground">
          <Shield className="size-8 mx-auto mb-2 text-muted-foreground/30" />
          暂无安全规则，点击右上角「添加规则」配置第一道防护
        </div>
      )}

      <div className="space-y-2">
        {rules?.map((r: any) => (
          <div key={r.id} className="rounded-lg border bg-card px-4 py-2.5 flex items-center gap-3 group hover:border-primary/20 transition-colors">
            <Shield className="size-4 shrink-0" style={{ color: r.enabled ? 'var(--chart-1)' : 'var(--muted-foreground)' }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{r.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
                  {typeLabel[r.type] ?? r.type}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${actionColor[r.action] ?? ''}`}>
                  {actionLabel[r.action] ?? r.action}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate font-mono mt-0.5">{r.pattern}</p>
            </div>
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => toggleRule.mutate({ id: r.id, enabled: !r.enabled })}>
              {r.enabled ? '已启用' : '已禁用'}
            </Button>
            <Button variant="ghost" size="icon" className="size-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => deleteRule.mutate(r.id)}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 添加规则弹窗 ──────────────────────────────────────────────────────────
const RULE_TYPES = [
  { value: 'keyword', label: '关键词匹配', desc: '输入敏感词或禁用词，用户消息中出现时自动触发' },
  { value: 'regex', label: '正则表达式', desc: '用正则模式匹配内容，适合格式化数据（如身份证、手机号）' },
  { value: 'pii', label: '个人隐私（PII）', desc: '检测身份证、银行卡、电话号码等个人敏感信息' },
  { value: 'custom', label: '自定义脚本', desc: '编写自定义检测逻辑，实现更灵活的内容检查' },
]

const RULE_ACTIONS = [
  { value: 'block', label: '拦截', desc: '拒绝请求并返回错误信息' },
  { value: 'warn', label: '警告', desc: '放行请求，但在日志中记录警告' },
  { value: 'log', label: '仅记录', desc: '静默记录，不影响正常请求' },
  { value: 'redact', label: '脱敏处理', desc: '自动遮盖敏感内容（如：138****8888）后继续' },
]

function AddRuleDialog({ onAdd }: { onAdd: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [pattern, setPattern] = useState('')
  const [type, setType] = useState('keyword')
  const [action, setAction] = useState('block')

  const create = useMutation({
    mutationFn: (data: any) => apiFetch('/api/guardrails', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      toast.success('规则已创建')
      setOpen(false)
      setName('')
      setPattern('')
      setType('keyword')
      setAction('block')
      onAdd()
    },
  })

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-3.5 mr-1" />添加规则
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup maxWidth="max-w-lg">
          <div className="mb-4 flex items-center justify-between">
            <DialogTitle>添加安全规则</DialogTitle>
            <DialogClose className="-mr-1 rounded-lg p-1 text-muted-foreground/70 transition-colors hover:text-foreground">
              <X className="size-4" />
            </DialogClose>
          </div>
          <DialogDescription className="mb-5">
            配置内容检测规则，对用户输入和模型回复进行实时审查和保护
          </DialogDescription>

          <div className="space-y-5">
            {/* 规则名称 */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">规则名称</Label>
              <Input
                placeholder="例如：屏蔽竞品名称、过滤手机号"
                value={name}
                onChange={e => setName(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">给规则起一个易于识别的名字，方便后续管理和排查</p>
            </div>

            {/* 检测类型 */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">检测类型</Label>
              <div className="grid grid-cols-2 gap-2">
                {RULE_TYPES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={`text-left rounded-lg border px-3 py-2.5 transition-all ${
                      type === t.value
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                        : 'border-border hover:border-primary/30 hover:bg-accent/5'
                    }`}
                  >
                    <span className="text-xs font-medium">{t.label}</span>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{t.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* 匹配模式 */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">匹配模式</Label>
              <Input
                placeholder={type === 'regex' ? '/正则表达式/' : type === 'keyword' ? '输入要匹配的关键词' : '自定义检测规则'}
                value={pattern}
                onChange={e => setPattern(e.target.value)}
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                {type === 'keyword' && '输入要拦截的关键词，用户消息包含此词时触发规则'}
                {type === 'regex' && '输入正则表达式，如 /\\d{18}/ 匹配18位身份证号码'}
                {type === 'pii' && '选择 PII 类型后系统自动匹配，无需手动输入模式'}
                {type === 'custom' && '编写自定义检测逻辑脚本'}
              </p>
            </div>

            {/* 处理动作 */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">触发动作</Label>
              <div className="grid grid-cols-2 gap-2">
                {RULE_ACTIONS.map(a => (
                  <button
                    key={a.value}
                    type="button"
                    onClick={() => setAction(a.value)}
                    className={`text-left rounded-lg border px-3 py-2.5 transition-all ${
                      action === a.value
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                        : 'border-border hover:border-primary/30 hover:bg-accent/5'
                    }`}
                  >
                    <span className="text-xs font-medium">{a.label}</span>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{a.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                className="flex-1"
                onClick={() => create.mutate({ name, type, pattern, action })}
                disabled={!name || !pattern || create.isPending}
              >
                {create.isPending ? '保存中...' : '保存规则'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>取消</Button>
            </div>
          </div>
        </DialogPopup>
      </Dialog>
    </>
  )
}
