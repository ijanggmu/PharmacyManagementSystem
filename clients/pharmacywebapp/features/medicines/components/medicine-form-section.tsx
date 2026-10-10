import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Groups a long medicine form into titled sections (Identity, Pricing & tax, …)
 * so the create/edit modals scan top-to-bottom instead of as one wall of inputs.
 */
export function MedicineFormSection({
  title,
  description,
  icon: Icon,
  children,
  className,
}: {
  title: string
  description?: string
  icon?: LucideIcon
  children: ReactNode
  className?: string
}) {
  return (
    <fieldset className={cn("space-y-4 rounded-lg border p-4", className)}>
      <legend className="-ml-1 flex items-center gap-2 px-1 text-sm font-semibold text-foreground">
        {Icon && <Icon className="h-4 w-4 text-primary" aria-hidden />}
        {title}
      </legend>
      {description && <p className="-mt-2 text-xs text-muted-foreground">{description}</p>}
      {children}
    </fieldset>
  )
}

/** Visual "required" marker for a label. Pair with `required`/`aria-required` on the control. */
export function RequiredMark() {
  return (
    <span className="ml-0.5 text-destructive" aria-hidden>
      *
    </span>
  )
}

/** Helper text under a field. Give it an id and reference it via aria-describedby. */
export function FieldHint({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1 text-xs text-muted-foreground">
      {children}
    </p>
  )
}
