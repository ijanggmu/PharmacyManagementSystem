"use client"

import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"
import { FieldError } from "@/components/ui/field-error"
import { creditTermsLabel, dueDateError, resolveBillDueDate } from "@/lib/utils/payment-terms"

/**
 * Due date on a supplier bill form. Shows the date the supplier's terms give (bill date + credit days) and lets
 * the user pick another one for this bill. Only a picked date is sent (`override`); otherwise the server applies
 * the same terms. `creditDays` undefined = the terms aren't known here (the server still applies them).
 */
export function BillDueDateField({
  id,
  billDate,
  creditDays,
  override,
  onOverrideChange,
  disabled,
}: {
  id: string
  billDate: string
  creditDays: number | null | undefined
  override: string
  onOverrideChange: (value: string) => void
  disabled?: boolean
}) {
  const resolved = resolveBillDueDate({ billDate, creditDays, override })
  const error = dueDateError(billDate, override || null)
  const hintId = `${id}-hint`

  let hint: string
  if (resolved.source === "override") {
    hint = "Set for this bill."
  } else if (resolved.source === "terms") {
    hint = `${creditTermsLabel(creditDays)} from the supplier's terms. Pick a date to change it for this bill.`
  } else if (creditDays === undefined) {
    hint = "Blank = the supplier's credit terms decide (no due date if they have none)."
  } else {
    hint = "This supplier has no credit terms. Pick a date, or leave blank for no due date."
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>Due date</Label>
        {resolved.source === "override" && creditDays != null && (
          <button
            type="button"
            className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            onClick={() => onOverrideChange("")}
            disabled={disabled}
          >
            Use terms
          </button>
        )}
      </div>
      <DatePicker
        id={id}
        value={resolved.dueDate ?? ""}
        onChange={onOverrideChange}
        min={billDate || undefined}
        allowFuture
        clearable={resolved.source === "override"}
        disabled={disabled}
        placeholder="No due date"
        aria-describedby={hintId}
        aria-invalid={!!error}
      />
      <p id={hintId} className="text-xs text-muted-foreground">
        {hint}
      </p>
      <FieldError message={error ?? undefined} />
    </div>
  )
}
