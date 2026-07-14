import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ConfirmButton } from '@/components/confirm-button'
import { Dialog, DialogClose, DialogPopup, DialogTitle } from '@/components/ui/dialog'
import { Eye, EyeOff, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { ApiKey, ApiKeyModel } from '../../../../shared/types'
import { useI18n } from '@/i18n'
import { toast } from '@/lib/toast'
import {
  CUSTOM_MODEL_KIND_LABEL,
  customModelDeleteKey,
  customModelDeletePath,
} from './shared'

interface EditVendorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  platform: string
  platformLabel: string
  keys: ApiKey[]
  vendorId?: number
  isSystem?: boolean
  onAddKey?: (platform: string) => void
}

interface KeyEditState {
  id: number
  label: string
  apiKey: string
  showApiKey: boolean
}

export function EditVendorDialog({ open, onOpenChange, platform, platformLabel, keys, vendorId, isSystem, onAddKey }: EditVendorDialogProps) {
  const { t } = useI18n()
  const queryClient = useQueryClient()

  // ── Vendor name edit state ──
  const [vendorName, setVendorName] = useState(platformLabel)

  // ── Per-key edit state ──
  const [keyStates, setKeyStates] = useState<KeyEditState[]>(() =>
    keys.map(k => ({ id: k.id, label: k.label ?? '', apiKey: '', showApiKey: false })),
  )

  // Reset state when dialog opens with new keys
  const [prevOpen, setPrevOpen] = useState(false)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setVendorName(platformLabel)
      setKeyStates(keys.map(k => ({ id: k.id, label: k.label ?? '', apiKey: '', showApiKey: false })))
    }
  }

  function updateKeyState(id: number, patch: Partial<KeyEditState>) {
    setKeyStates(prev => prev.map(ks => (ks.id === id ? { ...ks, ...patch } : ks)))
  }

  // ── Save vendor name ──
  const saveVendorName = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      apiFetch(`/api/providers/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provider-vendors'] })
      queryClient.invalidateQueries({ queryKey: ['keys'] })
      toast.success(t('keys.editVendorSaved'))
    },
    onError: (err) => toast.error((err as Error).message),
  })

  // ── Delete individual key ──
  const deleteKey = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keys'] })
      queryClient.invalidateQueries({ queryKey: ['health'] })
      queryClient.invalidateQueries({ queryKey: ['fallback'] })
      setKeyStates(prev => prev.filter(ks => ks.id !== (deleteKey.variables as number)))
    },
    onError: (err) => toast.error((err as Error).message),
  })

  // ── Save key label ──
  const saveLabel = useMutation({
    mutationFn: ({ id, label }: { id: number; label: string }) =>
      apiFetch(`/api/keys/${id}`, { method: 'PATCH', body: JSON.stringify({ label }) }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['keys'] })
      toast.success(t('keys.editVendorSaved'))
    },
    onError: (err) => toast.error((err as Error).message),
  })

  // ── Save key API key ──
  const saveApiKey = useMutation({
    mutationFn: ({ id, apiKey }: { id: number; apiKey: string }) =>
      apiFetch(`/api/keys/${id}`, { method: 'PATCH', body: JSON.stringify({ apiKey }) }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['keys'] })
      toast.success(t('keys.editVendorKeyUpdated', { id: vars.id }))
      updateKeyState(vars.id, { apiKey: '' })
    },
    onError: (err) => toast.error((err as Error).message),
  })

  // ── Delete custom model ──
  const deleteCustomModel = useMutation({
    mutationFn: (model: ApiKeyModel) => apiFetch(customModelDeletePath(model), { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keys'] })
      queryClient.invalidateQueries({ queryKey: ['health'] })
      queryClient.invalidateQueries({ queryKey: ['fallback'] })
      queryClient.invalidateQueries({ queryKey: ['models'] })
    },
    onError: (err) => toast.error((err as Error).message),
  })

  // ── Delete entire vendor ──
  const deleteVendor = useMutation({
    mutationFn: () => apiFetch(`/api/keys/platform/${platform}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keys'] })
      queryClient.invalidateQueries({ queryKey: ['health'] })
      queryClient.invalidateQueries({ queryKey: ['fallback'] })
      queryClient.invalidateQueries({ queryKey: ['models'] })
      onOpenChange(false)
    },
    onError: (err) => toast.error((err as Error).message),
  })

  // ── Collect all custom models ──
  const customModels = platform === 'custom'
    ? keys.flatMap(k => (k.models ?? []).map(m => ({ ...m, keyId: k.id })))
    : []

  const remainingKeys = keyStates.filter(ks => keys.some(k => k.id === ks.id))
  const canEditName = !isSystem && vendorId != null

  const isSavingName = saveVendorName.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup maxWidth="max-w-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between gap-4">
          <DialogTitle>{t('keys.editVendor')}</DialogTitle>
          <DialogClose
            aria-label={t('common.dismiss')}
            className="-mr-1 rounded-lg p-1 text-muted-foreground/70 transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <X className="size-4" />
          </DialogClose>
        </div>

        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          {/* ── Vendor name ── */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              {t('keys.editVendorName')}
            </h3>
            <div className="flex items-center gap-2">
              <Input
                value={vendorName}
                onChange={e => setVendorName(e.target.value)}
                placeholder={t('keys.editVendorName')}
                className="h-8 text-sm flex-1"
                disabled={!canEditName}
              />
              {canEditName && (
                <Button
                  size="sm"
                  className="h-8 text-xs shrink-0"
                  disabled={!vendorName.trim() || vendorName === platformLabel || isSavingName}
                  onClick={() => saveVendorName.mutate({ id: vendorId!, name: vendorName.trim() })}
                >
                  {isSavingName ? t('keys.editVendorSaving') : t('keys.editVendorSave')}
                </Button>
              )}
              {isSystem && (
                <span className="text-[10px] text-muted-foreground shrink-0">系统内置</span>
              )}
            </div>
          </div>

          {/* ── Keys list ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t('keys.editVendorKeys')} ({remainingKeys.length})
              </h3>
            </div>

            {remainingKeys.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center border border-dashed rounded-lg">
                {t('keys.editVendorNoKeys')}
              </p>
            ) : (
              <div className="space-y-2">
                {remainingKeys.map(ks => {
                  const key = keys.find(k => k.id === ks.id)
                  const isSaving = saveLabel.isPending && saveLabel.variables?.id === ks.id
                  const isSavingApiKey = saveApiKey.isPending && saveApiKey.variables?.id === ks.id
                  const isDeleting = deleteKey.isPending && deleteKey.variables === ks.id
                  return (
                    <div
                      key={ks.id}
                      className={`rounded-lg border bg-card p-3 space-y-2 ${isDeleting ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <code className="text-[11px] font-mono text-muted-foreground flex-1 truncate">
                          {key?.maskedKey ?? '—'}
                        </code>
                        <ConfirmButton
                          variant="ghost"
                          size="icon-xs"
                          armedSize="xs"
                          className="text-muted-foreground hover:text-destructive shrink-0"
                          confirmLabel={t('keys.confirmRemove')}
                          onConfirm={() => deleteKey.mutate(ks.id)}
                          disabled={deleteKey.isPending}
                          title={t('common.remove')}
                          aria-label={t('common.remove')}
                        >
                          <Trash2 className="size-3" />
                        </ConfirmButton>
                      </div>

                      {/* Label row */}
                      <div className="flex items-center gap-2">
                        <Label className="text-[10px] shrink-0 w-10 text-muted-foreground">{t('keys.label')}</Label>
                        <Input
                          value={ks.label}
                          onChange={e => updateKeyState(ks.id, { label: e.target.value })}
                          placeholder={t('keys.customDisplayNameOptional')}
                          className="h-7 text-xs flex-1"
                        />
                        <Button
                          size="sm"
                          className="h-7 text-xs shrink-0"
                          disabled={isSaving || saveLabel.isPending}
                          onClick={() => saveLabel.mutate({ id: ks.id, label: ks.label })}
                        >
                          {isSaving ? t('keys.editVendorSaving') : t('keys.editVendorSave')}
                        </Button>
                      </div>

                      {/* API key row */}
                      <div className="flex items-center gap-2">
                        <Label className="text-[10px] shrink-0 w-10 text-muted-foreground">{t('keys.editVendorApiKey')}</Label>
                        <div className="relative flex-1">
                          <Input
                            type={ks.showApiKey ? 'text' : 'password'}
                            value={ks.apiKey}
                            onChange={e => updateKeyState(ks.id, { apiKey: e.target.value })}
                            placeholder={t('keys.editVendorApiKeyPlaceholder')}
                            className="h-7 text-xs font-mono pr-8"
                          />
                          <button
                            type="button"
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                            onClick={() => updateKeyState(ks.id, { showApiKey: !ks.showApiKey })}
                          >
                            {ks.showApiKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                          </button>
                        </div>
                        <Button
                          size="sm"
                          className="h-7 text-xs shrink-0"
                          disabled={!ks.apiKey.trim() || isSavingApiKey || saveApiKey.isPending}
                          onClick={() => saveApiKey.mutate({ id: ks.id, apiKey: ks.apiKey.trim() })}
                        >
                          {isSavingApiKey ? t('keys.editVendorSaving') : t('keys.editVendorSave')}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Add key button */}
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                onOpenChange(false)
                onAddKey?.(platform)
              }}
            >
              <Plus className="size-3.5 mr-1" />
              {t('keys.editVendorAddKey')}
            </Button>
          </div>

          {/* ── Custom models ── */}
          {platform === 'custom' && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                {t('keys.editVendorModels')} ({customModels.length})
              </h3>
              {customModels.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center border border-dashed rounded-lg">
                  {t('keys.editVendorNoModels')}
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {customModels.map(model => {
                    const modelKey = `${customModelDeleteKey(model)}-${(model as any).keyId}`
                    return (
                      <div key={modelKey} className="inline-flex min-w-0 items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-[10px]">
                        <span className="rounded border px-1 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                          {t(CUSTOM_MODEL_KIND_LABEL[model.kind])}
                        </span>
                        <span className="max-w-[100px] truncate font-medium" title={model.modelId}>
                          {model.displayName}
                        </span>
                        <ConfirmButton
                          className="h-5 px-1 text-muted-foreground hover:text-destructive"
                          disabled={deleteCustomModel.isPending}
                          onConfirm={() => deleteCustomModel.mutate(model)}
                          title={t('common.remove')}
                          aria-label={t('common.remove')}
                        >
                          <Trash2 className="size-3" />
                        </ConfirmButton>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="mt-5 pt-3 border-t flex items-center justify-between">
          <ConfirmButton
            variant="destructive"
            size="sm"
            armedSize="sm"
            onConfirm={() => deleteVendor.mutate()}
            disabled={deleteVendor.isPending}
            confirmLabel={t('keys.confirmRemove')}
            title={t('keys.editVendorDeleteVendor')}
            aria-label={t('keys.editVendorDeleteVendor')}
          >
            <Trash2 className="size-3.5 mr-1" />
            {deleteVendor.isPending ? t('keys.importing') : t('keys.editVendorDeleteVendor')}
          </ConfirmButton>
          <DialogClose
            className={`${buttonVariants({ variant: 'outline', size: 'sm' })}`}
          >
            {t('common.dismiss')}
          </DialogClose>
        </div>

        {/* Warning text */}
        <p className="text-[10px] text-muted-foreground mt-2">
          {t('keys.editVendorDeleteVendorConfirm')}
        </p>
      </DialogPopup>
    </Dialog>
  )
}
