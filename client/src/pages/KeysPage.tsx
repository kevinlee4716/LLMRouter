import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { SegmentedControl } from '@/components/ui/segmented-control'
import type { ApiKey } from '../../../shared/types'
import { useI18n } from '@/i18n'
import type { HealthData } from '@/components/keys/shared'
import { QuotaSignalsSection } from '@/components/keys/quota-signals-section'
import { AnthropicSection } from '@/components/keys/anthropic-section'
import { ProviderGrid } from '@/components/keys/provider-grid'
import { AddKeyDialog } from '@/components/keys/add-key-dialog'

type KeysTab = 'providers' | 'quotaSignals' | 'anthropic'
const KEYS_TABS: { id: KeysTab; labelKey: string }[] = [
  { id: 'providers', labelKey: 'keys.tabProviders' },
  { id: 'quotaSignals', labelKey: 'keys.tabQuotaSignals' },
  { id: 'anthropic', labelKey: 'keys.tabAnthropic' },
]

export default function KeysPage() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<KeysTab>('providers')
  const [addOpen, setAddOpen] = useState(false)
  const [addPane, setAddPane] = useState<'provider' | 'export' | 'custom'>('provider')
  const [preselectedPlatform, setPreselectedPlatform] = useState<string | null>(null)

  const { data: keys = [] } = useQuery<ApiKey[]>({
    queryKey: ['keys'],
    queryFn: () => apiFetch('/api/keys'),
  })

  const { data: healthData } = useQuery<HealthData>({
    queryKey: ['health'],
    queryFn: () => apiFetch('/api/health'),
    refetchInterval: 30000,
  })

  const checkAll = useMutation({
    mutationFn: () => apiFetch('/api/health/check-all', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health'] })
      queryClient.invalidateQueries({ queryKey: ['keys'] })
    },
  })

  return (
    <div>
      {/* Compact header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{t('keys.pageTitle')}</h1>
          <p className="text-[11px] text-muted-foreground">{t('keys.pageDescription')}</p>
        </div>
        <div className="flex items-center gap-2">
          <SegmentedControl
            value={tab}
            onValueChange={setTab}
            options={KEYS_TABS.map(tb => ({ value: tb.id, label: t(tb.labelKey) }))}
            ariaLabel={t('keys.pageTitle')}
          />
        </div>
      </div>

      <div>
        {tab === 'anthropic' && <AnthropicSection />}

        {tab === 'quotaSignals' && (
          <QuotaSignalsSection states={(healthData?.quotaStates ?? []).slice(0, 24)} />
        )}

        {tab === 'providers' && (
          <ProviderGrid
            keys={keys}
            healthData={healthData}
            onAddKey={() => { setAddPane('provider'); setPreselectedPlatform(null); setAddOpen(true) }}
            onAddKeyForPlatform={(platform) => { setAddPane('provider'); setPreselectedPlatform(platform); setAddOpen(true) }}
            checkAll={checkAll}
            onExport={() => { setAddPane('export'); setAddOpen(true) }}
          />
        )}
      </div>

      <AddKeyDialog open={addOpen} onOpenChange={setAddOpen} initialPane={addPane} preselectedPlatform={preselectedPlatform} />
    </div>
  )
}
