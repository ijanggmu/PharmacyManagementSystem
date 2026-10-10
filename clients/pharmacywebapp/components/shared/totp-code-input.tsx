"use client"

import { forwardRef } from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { isCompleteTotp, sanitizeTotp, TOTP_LENGTH } from "@/lib/api/two-factor"

interface TotpCodeInputProps {
  id: string
  value: string
  onChange: (value: string) => void
  /** Fires once the field holds a full code, so the form can submit without an extra click. */
  onComplete?: (code: string) => void
  invalid?: boolean
  disabled?: boolean
  autoFocus?: boolean
  describedBy?: string
  className?: string
}

/**
 * One field for a 6-digit authenticator code. A single input (not six boxes) keeps paste, password
 * managers and SMS/OS autofill (autocomplete="one-time-code") working, and is one tab stop.
 */
export const TotpCodeInput = forwardRef<HTMLInputElement, TotpCodeInputProps>(function TotpCodeInput(
  { id, value, onChange, onComplete, invalid, disabled, autoFocus, describedBy, className },
  ref,
) {
  return (
    <Input
      ref={ref}
      id={id}
      name="totp"
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      maxLength={TOTP_LENGTH + 4}
      placeholder="000000"
      value={value}
      disabled={disabled}
      autoFocus={autoFocus}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onChange={(e) => {
        const next = sanitizeTotp(e.target.value)
        onChange(next)
        if (isCompleteTotp(next) && next !== value) onComplete?.(next)
      }}
      className={cn("h-12 text-center font-mono text-2xl tracking-[0.5em] tabular-nums placeholder:tracking-[0.5em]", className)}
    />
  )
})
