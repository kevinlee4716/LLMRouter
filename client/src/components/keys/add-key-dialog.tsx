import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { Dialog, DialogClose, DialogPopup, DialogTitle } from '@/components/ui/dialog'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { useI18n } from '@/i18n'
import { AddKeyForm } from './add-key-form'
import { ExportSection } from './export-section'
import { CustomProviderSection } from './custom-provider-section'

type Pane = 'provider' | 'export' | 'custom'

interface AddKeyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialPane?: Pane
  preselectedPlatform?: string | null
}

export function AddKeyDialog({ open, onOpenChange, initialPane = 'provider', preselectedPlatform = null }: AddKeyDialogProps) {
  const { t } = useI18n()
  const [pane, setPane] = useState<Pane>(initialPane)
  const close = () => onOpenChange(false)

  useEffect(() => {
    if (open) setPane(initialPane)
  }, [open, initialPane])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup maxWidth="max-w-2xl">
        <div className="mb-4 flex items-center justify-between gap-4">
          <DialogTitle>{pane === 'export' ? '导出密钥' : t('keys.addKey')}</DialogTitle>
          <DialogClose
            aria-label={t('common.dismiss')}
            className="-mr-1 rounded-lg p-1 text-muted-foreground/70 transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <X className="size-4" />
          </DialogClose>
        </div>

        <SegmentedControl
          value={pane}
          onValueChange={setPane}
          options={[
            { value: 'provider', label: t('keys.paneProviderKey') },
            { value: 'export', label: '导出文件' },
            { value: 'custom', label: t('keys.paneCustomEndpoint') },
          ]}
          ariaLabel={t('keys.addKey')}
          className="mb-5"
        />

        {pane === 'provider' && <AddKeyForm onSuccess={close} defaultPlatform={preselectedPlatform ?? undefined} />}
        {pane === 'export' && <ExportSection onExported={close} />}
        {pane === 'custom' && <CustomProviderSection onAdded={close} />}
      </DialogPopup>
    </Dialog>
  )
}
