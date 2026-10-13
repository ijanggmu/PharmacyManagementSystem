"use client"

import { DatePicker } from "@/components/ui/date-picker"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  CHEQUE_BANK_MAX,
  CHEQUE_NUMBER_MAX,
  chequePostingHint,
  type ChequeFieldErrors,
  type ChequeFieldsValue,
} from "@/features/accounting/lib/cheques"

export interface ChequeFieldsProps {
  kind: "receipt" | "payment"
  value: ChequeFieldsValue
  onChange: (value: ChequeFieldsValue) => void
  /** The receipt / payment date ("yyyy-MM-dd"), for the post-dated hint. */
  paymentDate: string
  errors?: ChequeFieldErrors
  disabled?: boolean
}

/**
 * Cheque number, the date written on it and its bank, for a receipt or payment by cheque — the cheque goes into the
 * cheque register. "Cleared on deposit" posts straight to the bank (a same-day cheque) instead of holding it in
 * Cheques in Hand / Cheques Issued until it clears.
 */
export function ChequeFields({ kind, value, onChange, paymentDate, errors, disabled }: ChequeFieldsProps) {
  const set = (patch: Partial<ChequeFieldsValue>) => onChange({ ...value, ...patch })
  const id = `${kind}-cheque`
  return (
    <fieldset className="grid gap-3 rounded-md border p-3 sm:grid-cols-2" disabled={disabled}>
      <legend className="px-1 text-sm font-medium">Cheque</legend>
      <div className="space-y-2">
        <Label htmlFor={`${id}-number`}>
          Cheque no. <span className="text-destructive" aria-hidden>*</span>
        </Label>
        <Input
          id={`${id}-number`}
          value={value.number}
          onChange={(e) => set({ number: e.target.value })}
          maxLength={CHEQUE_NUMBER_MAX}
          inputMode="numeric"
          aria-invalid={!!errors?.number || undefined}
          aria-describedby={`${id}-number-error`}
        />
        <div id={`${id}-number-error`}>
          <FieldError message={errors?.number} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-date`}>
          Cheque date <span className="text-destructive" aria-hidden>*</span>
        </Label>
        <DatePicker
          id={`${id}-date`}
          value={value.date}
          onChange={(v) => set({ date: v })}
          allowFuture
          aria-invalid={!!errors?.date || undefined}
          aria-describedby={`${id}-date-error`}
        />
        <div id={`${id}-date-error`}>
          <FieldError message={errors?.date} />
        </div>
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${id}-bank`}>{kind === "receipt" ? "Drawn on (customer's bank)" : "Drawn on (your bank)"}</Label>
        <Input
          id={`${id}-bank`}
          value={value.bank}
          onChange={(e) => set({ bank: e.target.value })}
          maxLength={CHEQUE_BANK_MAX}
          placeholder="e.g. Nabil Bank"
          aria-invalid={!!errors?.bank || undefined}
        />
        <FieldError message={errors?.bank} />
      </div>
      <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          className="h-4 w-4 accent-primary"
          checked={value.clearedOnDeposit}
          onChange={(e) => set({ clearedOnDeposit: e.target.checked })}
        />
        {kind === "receipt" ? "Cleared on deposit — post straight to the bank" : "Cleared on presentation — credit the bank now"}
      </label>
      <p className="text-xs text-muted-foreground sm:col-span-2">{chequePostingHint(kind, value, paymentDate)}</p>
    </fieldset>
  )
}
