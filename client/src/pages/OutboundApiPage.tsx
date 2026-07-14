import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Copy, RefreshCw, Eye, EyeOff } from 'lucide-react'
import { toast } from '@/lib/toast'

export default function OutboundApiPage() {
  const queryClient = useQueryClient()
  const [showKey, setShowKey] = useState(false)

  const { data, isError } = useQuery<{ apiKey: string }>({
    queryKey: ['unified-key'],
    queryFn: () => apiFetch('/api/settings/api-key'),
  })

  const regenerate = useMutation({
    mutationFn: () => apiFetch('/api/settings/api-key/regenerate', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['unified-key'] }),
  })

  const apiKey = data?.apiKey ?? ''
  const masked = apiKey ? apiKey.slice(0, 13) + '•'.repeat(32) : '…'
  const baseUrl = import.meta.env.DEV
    ? `http://${window.location.hostname}:${__SERVER_PORT__}/v1`
    : `${window.location.origin}/v1`

  function copy(text: string) {
    navigator.clipboard.writeText(text)
    toast.success('已复制')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">路由出站 API</h1>
        <p className="text-sm text-muted-foreground mt-1">统一 API 密钥和端点地址，所有外部应用通过此密钥接入网关路由</p>
      </div>

      {/* API Key Card */}
      <section className="rounded-lg border bg-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium">统一 API 密钥</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              在兼容 OpenAI 的客户端中设置此密钥为 <code className="font-mono bg-muted px-1 rounded">api_key</code> 即可接入
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => regenerate.mutate()} disabled={regenerate.isPending || isError}>
            <RefreshCw className="size-3.5 mr-1" />重新生成
          </Button>
        </div>

        {isError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
            无法连接到服务器。请确认后端正在运行。
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-xs bg-muted px-3 py-2 rounded-lg select-all truncate tabular-nums">
              {showKey ? apiKey : masked}
            </code>
            <Button variant="outline" size="sm" onClick={() => setShowKey(!showKey)}>
              {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </Button>
            <Button variant="outline" size="sm" onClick={() => copy(apiKey)}>
              <Copy className="size-3.5 mr-1" />复制
            </Button>
          </div>
        )}
      </section>

      {/* Endpoints Card */}
      <section className="rounded-lg border bg-card p-5 space-y-3">
        <h2 className="text-sm font-medium">API 端点</h2>
        <div className="space-y-2">
          {[
            { method: 'Base URL', path: baseUrl },
            { method: '模型名称', path: 'auto（路由自动选择模型）' },
            { method: '对话补全', path: `${baseUrl}/chat/completions` },
            { method: 'Responses', path: `${baseUrl}/responses` },
            { method: '嵌入向量', path: `${baseUrl}/embeddings` },
            { method: 'Anthropic Messages', path: `${baseUrl}/messages` },
          ].map(ep => (
            <div key={ep.method} className="flex items-center gap-3 rounded-md bg-muted/50 px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground w-24 shrink-0">{ep.method}</span>
              <code className="flex-1 font-mono text-xs select-all truncate">{ep.path}</code>
              <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => copy(ep.path)}>
                <Copy className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* Usage Example */}
      <section className="rounded-lg border bg-card p-5 space-y-3">
        <h2 className="text-sm font-medium">使用示例</h2>
        <pre className="bg-black/90 text-green-400 text-xs p-4 rounded-lg overflow-x-auto font-mono leading-relaxed">
{`# Python - OpenAI SDK
from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}",
    api_key="${masked}"
)

response = client.chat.completions.create(
    model="auto",  # 自动路由
    messages=[{"role": "user", "content": "Hello!"}]
)

# cURL
curl ${baseUrl}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -d '{"model":"auto","messages":[{"role":"user","content":"Hi"}]}'`}
        </pre>
      </section>
    </div>
  )
}
