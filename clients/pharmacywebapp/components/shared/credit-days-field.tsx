"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field-error"
import { CREDIT_DAY_PRESETS, MAX_CREDIT_DAYS, creditTermsLabel } from "@/lib/utils/payment-terms"
import { cn } from "@/lib/utils"

/**
 * Payment-terms input (credit days) with quick picks, shared by the supplier and customer forms.
 * The value is the raw text; blank = no terms. Validation is the caller's (parseCreditDays).
 */
export function CreditDaysField({
  id,
  value,
  onChange,
  error,
  hint,
  label = "Credit days",
  disabled,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  error?: string
  hint?: string
  label?: string
  disabled?: boolean
}) {
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-28">
          <Input
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
            inputMode="numeric"
            placeholder="None"
            max={MAX_CREDIT_DAYS}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            className="num h-10 pr-12"
            disabled={disabled}
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">days</span>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Common terms">
          {CREDIT_DAY_PRESETS.map((days) => (
            <Button
              key={days}
              type="button"
              size="sm"
              variant="outline"
              className={cn(
                "h-8 px-2 text-xs",
                value === String(days) && "border-primary bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
              )}
              onClick={() => onChange(String(days))}
              disabled={disabled}
              aria-pressed={value === String(days)}
            >
              {days === 0 ? "On receipt" : days}
            </Button>
          ))}
          {value !== "" && (
            <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => onChange("")} disabled={disabled}>
              Clear
            </Button>
          )}
        </div>
      </div>
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {value.trim() !== "" && /^\d+$/.test(value.trim()) ? `${creditTermsLabel(Number(value))}. ` : ""}
          {hint}
        </p>
      )}
      <div id={errorId}>
        <FieldError message={error} />
      </div>
    </div>
  )
}
