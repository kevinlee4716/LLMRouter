import { useState } from 'react'
import { FileJson, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/api'
import { toast } from '@/lib/toast'
import { useProviderVendors } from './shared'

interface ExportKey {
  platform: string
  key: string
  label: string
}

export function ExportSection({ onExported }: { onExported?: () => void }) {
  const [exporting, setExporting] = useState(false)

  // Build platform -> vendor display name map from DB
  const { data: vendors = [] } = useProviderVendors()
  const vendorNameMap = new Map<string, string>()
  for (const v of vendors) {
    vendorNameMap.set(v.platform, v.name)
  }

  // Use the backend /api/keys/export endpoint which returns DECRYPTED real keys
  async function fetchDecryptedKeys(): Promise<ExportKey[]> {
    const data = await apiFetch('/api/keys/export?format=json') as { keys: ExportKey[] }
    return (data.keys ?? []).filter(k => k.key && k.key.trim() && k.key !== 'no-key')
  }

  function escapeCsvField(v: string): string {
    if (v.includes('"') || v.includes(',') || v.includes('\n')) {
      return `"${v.replace(/"/g, '""')}"`
    }
    return v
  }

  async function handleExportCsv() {
    setExporting(true)
    try {
      const keys = await fetchDecryptedKeys()
      if (keys.length === 0) {
        toast.error('没有可导出的密钥')
        return
      }

      // BOM \uFEFF forces Excel to read the file as UTF-8 — fixes Chinese garbled text
      const rows = keys.map(k => {
        const vendorName = vendorNameMap.get(k.platform) ?? k.platform
        return `${escapeCsvField(vendorName)},${escapeCsvField(k.key)}`
      })

      const csv = '\uFEFF厂商名称,API的key\n' + rows.join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'llmrouter-keys.csv'
      a.click()
      URL.revokeObjectURL(url)

      toast.success(`已导出 ${rows.length} 个密钥`)
      onExported?.()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setExporting(false)
    }
  }

  async function handleExportJson() {
    setExporting(true)
    try {
      const keys = await fetchDecryptedKeys()
      if (keys.length === 0) {
        toast.error('没有可导出的密钥')
        return
      }

      // Map platform to vendor name in JSON too for readability
      const data = {
        exportedAt: new Date().toISOString(),
        keys: keys.map(k => ({
          vendor: vendorNameMap.get(k.platform) ?? k.platform,
          platform: k.platform,
          key: k.key,
          label: k.label || '',
        })),
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'llmrouter-keys.json'
      a.click()
      URL.revokeObjectURL(url)

      toast.success(`已导出 ${keys.length} 个密钥`)
      onExported?.()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        将已添加的密钥导出到本地文件，方便备份与迁移。导出的是真实密钥原文，请妥善保管。
      </p>

      <div className="flex gap-2">
        <Button
          type="button"
          className="flex-1"
          onClick={handleExportCsv}
          disabled={exporting}
        >
          <FileSpreadsheet className="size-3.5" />
          {exporting ? '导出中…' : '导出 CSV（Excel 可打开）'}
        </Button>
        <Button
          type="button"
          className="flex-1"
          variant="outline"
          onClick={handleExportJson}
          disabled={exporting}
        >
          <FileJson className="size-3.5" />
          {exporting ? '导出中…' : '导出 JSON（含备注）'}
        </Button>
      </div>
    </div>
  )
}
