import { useState } from 'react'
import { useQuery, useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { Button, buttonVariants } from '@/components/ui/button'
import { ConfirmButton } from '@/components/confirm-button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { EmptyState } from '@/components/empty-state'
import { Tooltip } from '@/components/tooltip'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { ChevronDown, ExternalLink, KeyRound, MoreHorizontal, Pencil, Plus, RefreshCw, Search, Trash2, Download } from 'lucide-react'
import type { ApiKey, ApiKeyModel } from '../../../../shared/types'
import { formatSqliteUtcToLocalTime } from '@/lib/utils'
import { useI18n } from '@/i18n'
import {
  PLATFORMS,
  CUSTOM_MODEL_KIND_LABEL,
  customModelDeleteKey,
  customModelDeletePath,
  statusDot,
  statusLabelKey,
  useProviderVendors,
} from './shared'
import type { HealthData } from './shared'
import { EditVendorDialog } from './edit-vendor-dialog'

type StatusFilter = 'all' | 'healthy' | 'issues' | 'disabled'

interface ProviderGridProps {
  keys: ApiKey[]
  healthData?: HealthData
  onAddKey: () => void
  onAddKeyForPlatform?: (platform: string) => void
  checkAll: UseMutationResult<unknown, Error, void, unknown>
  onExport: () => void
}

export function ProviderGrid({ keys, healthData, onAddKey, onAddKeyForPlatform, checkAll, onExport }: ProviderGridProps) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [expandedKeys, setExpandedKeys] = useState<Set<number>>(new Set())
  const [editPlatform, setEditPlatform] = useState<{ platform: string; label: string; keys: ApiKey[]; vendorId?: number; isSystem?: boolean } | null>(null)

  const healthKeyMap = new Map<number, { status: string; lastCheckedAt: string | null }>()
  for (const k of healthData?.keys ?? []) healthKeyMap.set(k.id, k)
  const statusOf = (k: ApiKey) => healthKeyMap.get(k.id)?.status ?? k.status

  const { data: proxyData } = useQuery<{ proxyUrl: string; enabled: boolean; bypassPlatforms: string[]; active: boolean }>({
    queryKey: ['proxy-url'],
    queryFn: () => apiFetch('/api/settings/proxy'),
  })

  const deleteKey = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keys'] })
      queryClient.invalidateQueries({ queryKey: ['health'] })
    },
  })

  const deleteCustomModel = useMutation({
    mutationFn: (model: ApiKeyModel) => apiFetch(customModelDeletePath(model), { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keys'] })
      queryClient.invalidateQueries({ queryKey: ['health'] })
      queryClient.invalidateQueries({ queryKey: ['fallback'] })
      queryClient.invalidateQueries({ queryKey: ['models'] })
    },
  })

  const checkKey = useMutation({
    mutationFn: (keyId: number) => apiFetch(`/api/health/check/${keyId}`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health'] })
      queryClient.invalidateQueries({ queryKey: ['keys'] })
    },
  })

  const togglePlatform = useMutation({
    mutationFn: ({ platform, enabled }: { platform: string; enabled: boolean }) =>
      apiFetch(`/api/keys/platform/${platform}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keys'] })
      queryClient.invalidateQueries({ queryKey: ['health'] })
      queryClient.invalidateQueries({ queryKey: ['fallback'] })
    },
  })

  const bypassPlatforms = proxyData?.bypassPlatforms ?? []
  const proxyEnabled = proxyData?.enabled ?? true

  const toggleBypass = useMutation({
    mutationFn: (platform: string) => {
      const next = bypassPlatforms.includes(platform)
        ? bypassPlatforms.filter(p => p !== platform)
        : [...bypassPlatforms, platform]
      return apiFetch('/api/settings/proxy', { method: 'PUT', body: JSON.stringify({ bypassPlatforms: next }) })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['proxy-url'] }),
  })

  const { data: vendors } = useProviderVendors()

  // Build a lookup for vendor labels — custom vendors show their Chinese name,
  // system vendors fall back to the PLATFORMS label if the DB entry is missing.
  const vendorLabelMap = new Map<string, string>()
  for (const v of vendors ?? []) {
    vendorLabelMap.set(v.platform, v.name)
  }
  // URLs for "获取API密钥" link — ONLY from hardcoded PLATFORMS, which point to
  // each vendor's key-management page. Custom vendor apiBaseUrl is an API
  // endpoint, NOT a key management page, so we must not use it as a link.
  const vendorUrlMap = new Map<string, string>()
  for (const p of PLATFORMS) {
    if (!vendorLabelMap.has(p.value)) {
      vendorLabelMap.set(p.value, p.label)
    }
    if (p.url) {
      vendorUrlMap.set(p.value, p.url)
    }
  }
  vendorLabelMap.set('custom', 'Custom (OpenAI-compatible)')

  // Build platform groups from actual keys + vendor labels
  const platformSet = new Set(keys.map(k => k.platform))
  const dynamicPlatforms = [...platformSet].map(p => ({
    value: p,
    label: vendorLabelMap.get(p) ?? p,
    url: vendorUrlMap.get(p) ?? '',
  }))

  const grouped = dynamicPlatforms.map(p => ({
    ...p,
    keys: keys.filter(k => k.platform === p.value),
  })).filter(p => p.keys.length > 0)

  const q = search.trim().toLowerCase()

  function matchStatus(group: (typeof grouped)[number]): boolean {
    const enabled = group.keys.some(k => k.enabled)
    const hasIssue = group.keys.some(k => statusOf(k) !== 'healthy')
    switch (statusFilter) {
      case 'healthy': return enabled && !hasIssue
      case 'issues': return hasIssue
      case 'disabled': return !enabled
      default: return true
    }
  }

  const visibleGroups = grouped
    .map(group => {
      if (!q) return group
      if (group.label.toLowerCase().includes(q)) return group
      const matchingKeys = group.keys.filter(k =>
        (k.label ?? '').toLowerCase().includes(q) ||
        (k.maskedKey ?? '').toLowerCase().includes(q),
      )
      return { ...group, keys: matchingKeys }
    })
    .filter(group => group.keys.length > 0 && matchStatus(group))

  function toggleGroup(value: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  function toggleKey(id: number) {
    setExpandedKeys(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (keys.length === 0) {
    return (
      <EmptyState
        icon={KeyRound}
        title={t('keys.noProviderKeys')}
        action={
          <Button size="sm" onClick={onAddKey}>
            <Plus className="size-3.5" />
            {t('keys.addKey')}
          </Button>
        }
      />
    )
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-[220px]">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('keys.filterPlaceholder')}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <SegmentedControl
          value={statusFilter}
          onValueChange={setStatusFilter}
          options={[
            { value: 'all', label: t('keys.filterAll') },
            { value: 'healthy', label: t('keys.filterHealthy') },
            { value: 'issues', label: t('keys.filterIssues') },
            { value: 'disabled', label: t('keys.filterDisabled') },
          ]}
          ariaLabel={t('keys.filterAll')}
        />
        <span className="flex-1" />
        <span className="text-[11px] text-muted-foreground tabular-nums mr-1">
          {t('keys.providerCountSummary', { providers: grouped.length, keys: keys.length })}
        </span>
        {keys.length > 0 && (
          <>
            <Button variant="outline" size="sm" onClick={() => (checkAll as any).mutate()} disabled={checkAll.isPending}>
              {checkAll.isPending ? t('keys.checking') : t('keys.checkAll')}
            </Button>
            <Button variant="outline" size="sm" onClick={onExport}>
              <Download className="size-3.5" />
            </Button>
          </>
        )}
        <Button size="sm" onClick={onAddKey}>
          <Plus className="size-3.5" />
          {t('keys.addKey')}
        </Button>
      </div>

      {visibleGroups.length === 0 ? (
        <EmptyState title={t('keys.noFilterMatch')} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleGroups.map(group => {
            const healthyCount = group.keys.filter(k => statusOf(k) === 'healthy').length
            const issueCount = group.keys.filter(k => statusOf(k) !== 'healthy').length
            const allHealthy = healthyCount === group.keys.length && group.keys.length > 0
            const allDisabled = group.keys.every(k => !k.enabled)
            const expanded = expandedGroups.has(group.value)

            return (
              <div
                key={group.value}
                className={`rounded-2xl border bg-card/60 backdrop-blur-sm overflow-hidden transition-all duration-200 ${
                  expanded ? 'ring-1 ring-primary/20 shadow-lg shadow-primary/5' : 'hover:shadow-md hover:border-primary/15'
                } ${allDisabled ? 'opacity-50' : ''}`}
              >
                {/* Card header */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Status dot */}
                  <div
                    className="relative shrink-0 cursor-pointer"
                    onClick={() => toggleGroup(group.value)}
                  >
                    <div className={`size-2.5 rounded-full ${
                      allHealthy ? 'bg-emerald-400 shadow-[0_0_6px] shadow-emerald-400/30' :
                      allDisabled ? 'bg-muted-foreground/30' :
                      'bg-amber-400 shadow-[0_0_6px] shadow-amber-400/30'
                    }`} />
                  </div>

                  {/* Provider info */}
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleGroup(group.value)}>
                    <div className="flex items-center gap-2">
                      <h3 className="text-[13px] font-semibold truncate">{group.label}</h3>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 tabular-nums shrink-0">{group.keys.length}</Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {healthyCount > 0 && (
                        <span className="text-[10px] text-emerald-500 flex items-center gap-1">
                          <span className="size-1 rounded-full bg-emerald-500" /> {healthyCount} 正常
                        </span>
                      )}
                      {issueCount > 0 && (
                        <span className="text-[10px] text-rose-500 flex items-center gap-1">
                          <span className="size-1 rounded-full bg-rose-500" /> {issueCount} 异常
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Toggle */}
                  <Switch
                    checked={group.keys.some(k => k.enabled)}
                    onCheckedChange={(checked) => togglePlatform.mutate({ platform: group.value, enabled: checked })}
                    disabled={togglePlatform.isPending}
                  />

                  {/* Edit button */}
                  <button
                    type="button"
                    className={`${buttonVariants({ variant: 'ghost', size: 'icon-xs' })} shrink-0 text-muted-foreground hover:text-foreground`}
                    onClick={() => {
                      const v = (vendors ?? []).find(v => v.platform === group.value)
                      setEditPlatform({ platform: group.value, label: group.label, keys: group.keys, vendorId: v?.id, isSystem: v?.isSystem })
                    }}
                    title={t('keys.editVendor')}
                    aria-label={t('keys.editVendor')}
                  >
                    <Pencil className="size-3.5" />
                  </button>

                  {/* Dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className={`${buttonVariants({ variant: 'ghost', size: 'icon-xs' })} shrink-0`}
                      aria-label={t('keys.providerActions')}
                    >
                      <MoreHorizontal className="size-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      {group.url && (
                        <DropdownMenuItem onClick={() => window.open(group.url, '_blank', 'noopener,noreferrer')}>
                          {t('keys.getApiKey')}
                          <ExternalLink className="ml-auto size-3.5" />
                        </DropdownMenuItem>
                      )}
                      {proxyEnabled && (
                        <DropdownMenuItem onClick={() => toggleBypass.mutate(group.value)}>
                          {bypassPlatforms.includes(group.value) ? '经代理路由' : '直连'}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Expand toggle */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.value)}
                    className={`${buttonVariants({ variant: 'ghost', size: 'icon-xs' })} shrink-0`}
                  >
                    <ChevronDown className={`size-4 text-muted-foreground transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {/* Expanded key list */}
                {expanded && (
                  <div className="border-t divide-y animate-in fade-in-0 slide-in-from-top-1 duration-150">
                    {group.keys.map(k => {
                      const status = statusOf(k)
                      const lastChecked = healthKeyMap.get(k.id)?.lastCheckedAt
                      const customModels = k.models ?? []
                      const hasCustomModels = customModels.length > 0
                      const isExpanded = expandedKeys.has(k.id)
                      const isChecking = checkKey.isPending && checkKey.variables === k.id
                      return (
                        <div key={k.id}>
                          <div className="flex items-center gap-2 px-4 py-2 hover:bg-muted/20 transition-colors text-xs group/krow">
                            <span className={`size-1.5 rounded-full shrink-0 ${statusDot[status] ?? statusDot.unknown} ${status === 'healthy' ? 'shadow-[0_0_4px] shadow-emerald-400/30' : ''}`} />
                            {hasCustomModels && (
                              <button
                                type="button"
                                className="p-0 size-4 text-muted-foreground hover:text-foreground shrink-0"
                                onClick={() => toggleKey(k.id)}
                              >
                                <ChevronDown className={`size-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                              </button>
                            )}
                            <code className="text-[11px] font-mono truncate text-muted-foreground">{k.maskedKey}</code>
                            {k.label && <span className="text-[11px] text-muted-foreground truncate">{k.label}</span>}
                            <span className="flex-1" />
                            <span className="text-[10px] text-muted-foreground shrink-0">{statusLabelKey[status] ? t(statusLabelKey[status]) : status}</span>
                            {lastChecked && (
                              <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                                {formatSqliteUtcToLocalTime(lastChecked, { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                            <div className="flex items-center gap-0.5 opacity-0 group-hover/krow:opacity-100 transition-opacity shrink-0">
                              <Tooltip text={t('keys.checkNow')}>
                                <button
                                  className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                                  onClick={() => checkKey.mutate(k.id)}
                                  disabled={checkKey.isPending}
                                >
                                  <RefreshCw className={`size-3 ${isChecking ? 'animate-spin' : ''}`} />
                                </button>
                              </Tooltip>
                              <ConfirmButton
                                variant="ghost"
                                size="icon-xs"
                                armedSize="xs"
                                className="text-muted-foreground hover:text-destructive"
                                confirmLabel={t('keys.confirmRemove')}
                                onConfirm={() => deleteKey.mutate(k.id)}
                                disabled={deleteKey.isPending}
                                title={t('common.remove')}
                                aria-label={t('common.remove')}
                              >
                                <Trash2 className="size-3" />
                              </ConfirmButton>
                            </div>
                          </div>
                          {hasCustomModels && isExpanded && (
                            <div className="flex flex-wrap gap-1.5 border-t bg-muted/15 px-4 py-2 pl-10">
                              {customModels.map(model => {
                                const modelKey = customModelDeleteKey(model)
                                return (
                                  <div key={modelKey} className="inline-flex min-w-0 items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-[10px]">
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
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Edit vendor dialog */}
      <EditVendorDialog
        open={editPlatform !== null}
        onOpenChange={(open) => { if (!open) setEditPlatform(null) }}
        platform={editPlatform?.platform ?? ''}
        platformLabel={editPlatform?.label ?? ''}
        keys={editPlatform?.keys ?? []}
        vendorId={editPlatform?.vendorId}
        isSystem={editPlatform?.isSystem ?? true}
        onAddKey={onAddKeyForPlatform}
      />
    </div>
  )
}
