import { cn } from "@/lib/utils"
import { Check } from "lucide-react"

interface CheckboxProps {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  className?: string
}

function Checkbox({ checked = false, onCheckedChange, disabled, className }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      data-state={checked ? 'checked' : 'unchecked'}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "peer inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-primary shadow transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        checked
          ? "bg-primary text-primary-foreground"
          : "bg-background dark:bg-background",
        className
      )}
    >
      {checked && <Check className="size-3" />}
    </button>
  )
}

export { Checkbox }
