import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FieldError } from '@/components/ui/field-error'
import type { Platform } from '../../../../shared/types'
import { useI18n } from '@/i18n'
import { toast } from '@/lib/toast'
import { GetKeyLink, useMergedPlatforms } from './shared'
import { Globe } from 'lucide-react'

export function AddKeyForm({ onSuccess, defaultPlatform }: { onSuccess: () => void; defaultPlatform?: string }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [platform, setPlatform] = useState<Platform | ''>(defaultPlatform as Platform | '' ?? '')
  const [apiKey, setApiKey] = useState('')
  const [accountId, setAccountId] = useState('')
  const [label, setLabel] = useState('')
  const [addAttempted, setAddAttempted] = useState(false)

  const mergedPlatforms = useMergedPlatforms()

  const addKey = useMutation({
    meta: { silenceToast: true },
    mutationFn: (body: { platform: string; key: string; label?: string }) =>
      apiFetch<{ notice?: string | null }>('/api/keys', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['keys'] })
      queryClient.invalidateQueries({ queryKey: ['health'] })
      queryClient.invalidateQueries({ queryKey: ['fallback'] })
      toast.success(t('keys.keyAdded'))
      if (data?.notice) toast.info(data.notice)
      onSuccess()
    },
  })

  const needsAccountId = platform === 'cloudflare'
  const isKeyless = mergedPlatforms.find(p => p.value === platform)?.keyless ?? false

  const platformError = !platform ? t('validation.required') : null
  const keyError = !isKeyless && !apiKey.trim() ? t('validation.required') : null
  const accountIdError = needsAccountId && !accountId.trim() ? t('validation.required') : null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (platformError || keyError || accountIdError) {
      setAddAttempted(true)
      return
    }
    setAddAttempted(false)
    const key = isKeyless ? '' : (needsAccountId ? `${accountId}:${apiKey}` : apiKey)
    addKey.mutate({ platform, key, label: label || undefined })
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t('keys.addKeyDescription')}</p>

      <div className="rounded-xl border bg-card/60 p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Globe className="size-3.5" />
          厂商凭据
        </div>

        <form onSubmit={handleSubmit} className="flex flex-wrap gap-3">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">{t('keys.platform')}</Label>
            <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
              <SelectTrigger className="w-[240px] h-9 text-sm" aria-invalid={addAttempted && !!platformError}>
                <SelectValue placeholder={t('keys.selectPlatform')} />
              </SelectTrigger>
              <SelectContent>
                {mergedPlatforms.map(p => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {addAttempted && <FieldError error={platformError} />}
            {(() => {
              const sel = mergedPlatforms.find(p => p.value === platform)
              return sel?.url ? <div className="pt-1"><GetKeyLink url={sel.url} /></div> : null
            })()}
          </div>
          {needsAccountId && (
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">{t('keys.accountId')}</Label>
              <Input
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                placeholder="a1b2c3d4…"
                className="w-[200px] font-mono text-xs h-9"
                aria-invalid={addAttempted && !!accountIdError}
              />
              {addAttempted && <FieldError error={accountIdError} />}
            </div>
          )}
          <div className="space-y-1.5 flex-1 min-w-[240px]">
            <Label className="text-[11px] text-muted-foreground">{needsAccountId ? t('keys.apiToken') : t('keys.customApiKey')}</Label>
            <Input
              type="password"
              value={isKeyless ? '' : apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={isKeyless ? t('keys.noKeyNeededPlaceholder') : (needsAccountId ? t('keys.bearerTokenPlaceholder') : t('keys.pasteKeyPlaceholder'))}
              className="font-mono text-xs h-9"
              disabled={isKeyless}
              aria-invalid={addAttempted && !!keyError}
            />
            {addAttempted && <FieldError error={keyError} />}
            {isKeyless && (
              <p className="text-[11px] text-muted-foreground">{t('keys.keylessHint')}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">{t('keys.label')}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder={t('keys.customDisplayNameOptional')}
                className="w-[160px] h-9"
              />
              <Button type="submit" size="default" className="h-9 px-5 font-medium" disabled={addKey.isPending}>
                {addKey.isPending ? t('keys.adding') : isKeyless ? t('keys.enable') : t('keys.addKey')}
              </Button>
            </div>
          </div>
        </form>
      </div>

      {addKey.isError && (
        <p className="text-destructive text-xs">{(addKey.error as Error).message}</p>
      )}
    </div>
  )
}
