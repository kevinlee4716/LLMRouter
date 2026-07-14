import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Server, Globe, Key, Cpu } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { FieldError } from '@/components/ui/field-error'
import { CardSkeleton } from '@/components/ui/skeleton'
import { useI18n } from '@/i18n'

interface CustomProvider {
  id: string
  name: string
  baseUrl: string
  apiKeyMasked: string
  models: string[]
  createdAt: string
  lastTested: string | null
  status: 'ok' | 'error' | 'untested'
}

function fmtWhen(ms: number | null): string | null {
  if (!ms) return null
  return new Date(ms).toLocaleString()
}

export default function CustomModelsPage() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ name: '', baseUrl: '', apiKey: '', models: '' })
  const [submitAttempted, setSubmitAttempted] = useState(false)

  const { data: providers, isLoading } = useQuery<CustomProvider[]>({
    queryKey: ['custom-providers'],
    queryFn: () => apiFetch('/api/custom-providers'),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['custom-providers'] })
    queryClient.invalidateQueries({ queryKey: ['models'] })
  }

  const addProvider = useMutation({
    meta: { silenceToast: true },
    mutationFn: (payload: typeof formData) =>
      apiFetch('/api/custom-providers', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      setFormData({ name: '', baseUrl: '', apiKey: '', models: '' })
      setShowForm(false)
      setSubmitAttempted(false)
      invalidate()
    },
  })

  const deleteProvider = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/custom-providers/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })

  const testProvider = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/custom-providers/${id}/test`, { method: 'POST' }),
    onSuccess: invalidate,
  })

  if (isLoading || !providers) {
    return (
      <div>
        <PageHeader title={t('custom.title')} description={t('custom.description')} />
        <div className="space-y-6">
          <CardSkeleton />
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={t('custom.title')}
        description={t('custom.description')}
        actions={
          <Button
            size="sm"
            onClick={() => setShowForm(!showForm)}
            className="gap-1.5"
          >
            <Plus className="size-3.5" />
            {showForm ? t('custom.cancel') : t('custom.addProvider')}
          </Button>
        }
      />

      <div className="space-y-6">
        {/* Add form */}
        {showForm && (
          <section>
            <div className="rounded-3xl border bg-card p-5 space-y-4">
              <h2 className="text-sm font-medium flex items-center gap-2">
                <Server className="size-3.5 text-cyan-400" />
                {t('custom.newProvider')}
              </h2>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!formData.name.trim() || !formData.baseUrl.trim()) {
                    setSubmitAttempted(true)
                    return
                  }
                  setSubmitAttempted(false)
                  addProvider.mutate(formData)
                }}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('custom.providerName')}</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="My Provider"
                      className="text-xs"
                      aria-invalid={submitAttempted && !formData.name.trim()}
                    />
                    {submitAttempted && !formData.name.trim() && <FieldError error={t('validation.required')} />}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('custom.baseUrl')}</Label>
                    <Input
                      value={formData.baseUrl}
                      onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                      placeholder="https://api.example.com/v1"
                      className="text-xs font-mono"
                      aria-invalid={submitAttempted && !formData.baseUrl.trim()}
                    />
                    {submitAttempted && !formData.baseUrl.trim() && <FieldError error={t('validation.required')} />}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('custom.apiKey')}</Label>
                  <Input
                    value={formData.apiKey}
                    onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                    placeholder="sk-..."
                    className="text-xs font-mono"
                    type="password"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('custom.modelsList')}</Label>
                  <Input
                    value={formData.models}
                    onChange={(e) => setFormData({ ...formData, models: e.target.value })}
                    placeholder="gpt-4, claude-3-opus, gemini-pro"
                    className="text-xs font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground">{t('custom.modelsHint')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="submit" size="sm" disabled={addProvider.isPending}>
                    {addProvider.isPending ? t('custom.adding') : t('custom.add')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => { setShowForm(false); setSubmitAttempted(false) }}
                  >
                    {t('custom.cancel')}
                  </Button>
                </div>
                {addProvider.isError && (
                  <p className="text-destructive text-xs">{(addProvider.error as Error).message}</p>
                )}
              </form>
            </div>
          </section>
        )}

        {/* Provider list */}
        {providers.length === 0 && !showForm ? (
          <section>
            <div className="rounded-3xl border bg-card p-8 text-center">
              <div className="mx-auto size-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <Server className="size-5 text-muted-foreground" />
              </div>
              <h2 className="text-sm font-medium mb-2">{t('custom.emptyTitle')}</h2>
              <p className="text-xs text-muted-foreground mb-4 max-w-sm mx-auto">
                {t('custom.emptyDescription')}
              </p>
              <Button size="sm" onClick={() => setShowForm(true)}>
                <Plus className="size-3.5" />
                {t('custom.addFirst')}
              </Button>
            </div>
          </section>
        ) : (
          <section className="space-y-3">
            {providers.map((p) => (
              <div key={p.id} className="rounded-3xl border bg-card p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center">
                      <Server className="size-4 text-cyan-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{p.baseUrl}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      className={
                        p.status === 'ok'
                          ? 'bg-emerald-500/15 text-emerald-400 border-transparent'
                          : p.status === 'error'
                            ? 'bg-red-500/15 text-red-400 border-transparent'
                            : 'bg-muted text-muted-foreground border-transparent'
                      }
                    >
                      {p.status === 'ok' ? t('custom.online') : p.status === 'error' ? t('custom.error') : t('custom.untested')}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px] gap-1"
                      onClick={() => testProvider.mutate(p.id)}
                      disabled={testProvider.isPending}
                    >
                      <Cpu className="size-3" />
                      {t('custom.test')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteProvider.mutate(p.id)}
                      disabled={deleteProvider.isPending}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Key className="size-3" />
                    {p.apiKeyMasked}
                  </span>
                  <span className="flex items-center gap-1">
                    <Globe className="size-3" />
                    {t('custom.models')}: {p.models.length}
                  </span>
                  {p.lastTested && (
                    <span>{t('custom.lastTested', { when: fmtWhen(new Date(p.lastTested).getTime()) ?? t('common.never') })}</span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1">
                  {p.models.map((m) => (
                    <Badge key={m} variant="outline" className="font-mono text-[10px] bg-muted/50">
                      {m}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
