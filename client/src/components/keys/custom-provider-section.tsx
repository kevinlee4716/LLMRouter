import { useState, useCallback, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FieldError } from '@/components/ui/field-error'
import { isHttpUrl } from '@/lib/validate'
import { useI18n } from '@/i18n'
import { toast } from '@/lib/toast'
import { Download, Loader2, Plus, Check, Search, Globe, Cpu } from 'lucide-react'

interface FetchedModel {
  id: string
  added: boolean
  adding: boolean
}

export function CustomProviderSection({ onAdded }: { onAdded?: () => void } = {}) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [customType, setCustomType] = useState<'chat' | 'embedding' | 'image' | 'audio'>('chat')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [label, setLabel] = useState('')
  const [attempted, setAttempted] = useState(false)

  // Model list
  const [fetchedModels, setFetchedModels] = useState<FetchedModel[]>([])
  const [modelSearch, setModelSearch] = useState('')
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [manualModelId, setManualModelId] = useState('')

  // Fetch models from upstream
  const fetchModels = useMutation({
    meta: { silenceToast: true },
    mutationFn: (body: { baseUrl: string; apiKey?: string }) =>
      apiFetch<{ models: string[]; warning?: string }>('/api/keys/fetch-models', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      setFetchError(null)
      const modelList: FetchedModel[] = (data.models ?? []).map(id => ({
        id,
        added: false,
        adding: false,
      }))
      setFetchedModels(modelList)
      setModelSearch('')
      if (data.models.length === 0) {
        setFetchError(data.warning ?? '该端点未返回任何模型，请手动输入模型 ID 添加')
      }
    },
    onError: (err: Error) => {
      setFetchError(err.message)
      setFetchedModels([])
    },
  })

  const handleFetchModels = useCallback(() => {
    if (!baseUrl.trim() || !isHttpUrl(baseUrl)) return
    fetchModels.mutate({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim() || undefined })
  }, [baseUrl, apiKey, fetchModels])

  // Add a single model
  const addSingleModel = useMutation({
    meta: { silenceToast: true },
    mutationFn: (modelId: string) =>
      apiFetch('/api/keys/custom', {
        method: 'POST',
        body: JSON.stringify({
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim(),
          model: modelId,
          label: label.trim() || undefined,
          supportsTools: customType === 'chat',
          supportsVision: false,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keys'] })
      queryClient.invalidateQueries({ queryKey: ['health'] })
      queryClient.invalidateQueries({ queryKey: ['fallback'] })
      queryClient.invalidateQueries({ queryKey: ['models'] })
      toast.success('模型已添加')
    },
  })

  const addModel = useCallback((modelId: string) => {
    // Mark as adding
    setFetchedModels(prev => prev.map(m => m.id === modelId ? { ...m, adding: true } : m))
    addSingleModel.mutate(modelId, {
      onSuccess: () => {
        setFetchedModels(prev => prev.map(m => m.id === modelId ? { ...m, added: true, adding: false } : m))
      },
      onError: () => {
        setFetchedModels(prev => prev.map(m => m.id === modelId ? { ...m, adding: false } : m))
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, apiKey, label, customType])

  // Manual add
  const handleManualAdd = useCallback(() => {
    const id = manualModelId.trim()
    if (!id) return
    // Check if already in list
    const existing = fetchedModels.find(m => m.id === id)
    if (existing && existing.added) return
    // Add to list and trigger add
    setFetchedModels(prev => {
      const found = prev.find(m => m.id === id)
      if (found) {
        return prev.map(m => m.id === id ? { ...m, adding: true } : m)
      }
      return [...prev, { id, added: false, adding: true }]
    })
    addSingleModel.mutate(id, {
      onSuccess: () => {
        setFetchedModels(prev => prev.map(m => m.id === id ? { ...m, added: true, adding: false } : m))
        setManualModelId('')
      },
      onError: () => {
        setFetchedModels(prev => prev.map(m => m.id === id ? { ...m, adding: false } : m))
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualModelId, baseUrl, apiKey, label, customType])

  // Filter
  const filteredModels = useMemo(() => {
    const q = modelSearch.trim().toLowerCase()
    return q ? fetchedModels.filter(m => m.id.toLowerCase().includes(q)) : fetchedModels
  }, [fetchedModels, modelSearch])

  // Validation
  const baseUrlError = !baseUrl.trim()
    ? t('validation.required')
    : !isHttpUrl(baseUrl)
      ? t('validation.url')
      : null
  const apiKeyError = !apiKey.trim() ? t('validation.required') : null

  const canFetch = baseUrl.trim().length > 0 && isHttpUrl(baseUrl) && apiKey.trim().length > 0
  const hasModels = fetchedModels.length > 0
  const availableCount = fetchedModels.filter(m => !m.added).length
  const addedCount = fetchedModels.filter(m => m.added).length

  return (
    <div className="space-y-5">
      {/* ---- Connection Card ---- */}
      <div className="rounded-xl border bg-card/60 p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Globe className="size-4 text-primary" />
          连接配置
        </div>

        {/* Type + Base URL */}
        <div className="grid grid-cols-[140px_1fr] gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('keys.customType')}</Label>
            <Select value={customType} onValueChange={(v) => { setCustomType(v as typeof customType); setFetchedModels([]); setFetchError(null) }}>
              <SelectTrigger className="w-full h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="chat">{t('keys.customTypeChat')}</SelectItem>
                <SelectItem value="embedding">{t('keys.customTypeEmbedding')}</SelectItem>
                <SelectItem value="image">{t('keys.customTypeImage')}</SelectItem>
                <SelectItem value="audio">{t('keys.customTypeAudio')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('keys.customBaseUrl')}</Label>
            <Input
              value={baseUrl}
              onChange={e => { setBaseUrl(e.target.value); setFetchedModels([]); setFetchError(null) }}
              placeholder="https://api.example.com/v1"
              className="font-mono text-xs h-9"
              aria-invalid={attempted && !!baseUrlError}
            />
            {attempted && <FieldError error={baseUrlError} />}
          </div>
        </div>

        {/* Label + API Key + Fetch */}
        <div className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">显示名称</Label>
            <Input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="可选，如「我的阿里云」"
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('keys.customApiKey')} <span className="text-destructive">*</span></Label>
            <Input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="font-mono text-xs h-9"
              aria-invalid={attempted && !!apiKeyError}
            />
            {attempted && <FieldError error={apiKeyError} />}
          </div>
          <Button
            type="button"
            className="h-9 px-5 font-medium"
            disabled={!canFetch || fetchModels.isPending}
            onClick={() => {
              if (baseUrlError || apiKeyError) {
                setAttempted(true)
                return
              }
              setAttempted(false)
              handleFetchModels()
            }}
          >
            {fetchModels.isPending ? (
              <><Loader2 className="size-4 mr-1.5 animate-spin" /> 获取中…</>
            ) : (
              <><Download className="size-4 mr-1.5" /> 获取模型</>
            )}
          </Button>
        </div>

        {/* Fetch error */}
        {fetchError && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/5 border border-destructive/20 p-3">
            <span className="text-xs text-destructive/90 leading-relaxed">{fetchError}</span>
          </div>
        )}
      </div>

      {/* ---- Model List Card ---- */}
      {hasModels && (
        <div className="rounded-xl border bg-card/60 p-5 space-y-4 animate-in fade-in-0 slide-in-from-top-2 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Cpu className="size-4 text-primary" />
              可用模型
              <span className="text-xs font-normal text-muted-foreground">
                ({availableCount} 个可用)
              </span>
            </div>
            {addedCount > 0 && (
              <span className="text-xs text-muted-foreground">
                已添加 {addedCount} 个
              </span>
            )}
          </div>

          {/* Search + Manual Add */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={modelSearch}
                onChange={e => setModelSearch(e.target.value)}
                placeholder="搜索模型…"
                className="h-9 pl-8 text-xs"
              />
            </div>
            <div className="flex gap-1.5">
              <Input
                value={manualModelId}
                onChange={e => setManualModelId(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleManualAdd() }}
                placeholder="手动输入模型 ID"
                className="w-[200px] font-mono text-xs h-9"
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-9 w-9 shrink-0"
                disabled={!manualModelId.trim() || addSingleModel.isPending}
                onClick={handleManualAdd}
                title="添加自定义模型"
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>

          {/* Model List */}
          <div className="max-h-[320px] overflow-y-auto -mx-1 px-1">
            {filteredModels.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">没有匹配的模型</p>
            ) : (
              <div className="space-y-0.5">
                {filteredModels.map(m => (
                  <div
                    key={m.id}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 transition-colors ${
                      m.added
                        ? 'bg-primary/5'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`size-1.5 rounded-full shrink-0 ${m.added ? 'bg-primary/40' : 'bg-muted-foreground/30'}`} />
                      <span className={`text-sm font-mono truncate ${
                        m.added ? 'text-muted-foreground/70' : ''
                      }`}>
                        {m.id}
                      </span>
                    </div>
                    {m.added ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/60 font-medium shrink-0 ml-3">
                        <Check className="size-3.5" />
                        已添加
                      </span>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2.5 text-xs font-medium text-muted-foreground hover:text-primary hover:bg-primary/10 shrink-0 ml-3"
                        disabled={m.adding || addSingleModel.isPending}
                        onClick={() => addModel(m.id)}
                      >
                        {m.adding ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Plus className="size-3.5" />
                        )}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Done button */}
          {addedCount > 0 && (
            <div className="flex justify-end pt-1">
              <Button
                type="button"
                className="h-8 px-4 text-xs font-medium"
                onClick={() => onAdded?.()}
              >
                完成（已添加 {addedCount} 个模型）
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
