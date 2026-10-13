"use client"

/**
 * TDS (withholding tax) fields shared by the expense form and the supplier payment dialog: a category select that
 * fills its rate, the rate, and the TDS amount — worked out from the rate unless typed over. Supplier payments also
 * get a taxable-amount field (the payment excluding VAT).
 */

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CurrencyDisplay } from "@/components/currency-display"
import { FieldError } from "@/components/ui/field-error"
import { useTdsCategories } from "@/features/accounting/hooks/use-tds"
import {
  chooseTdsCategory,
  computeTds,
  effectiveTds,
  selectableTdsCategories,
  tdsTaxableBase,
  type TdsFieldsValue,
} from "@/features/accounting/lib/tds"

const NONE = "__none__"

export interface TdsFieldsProps {
  idPrefix: string
  value: TdsFieldsValue
  onChange: (next: TdsFieldsValue) => void
  /** The TDS base when no taxable amount is typed (expense: amount excluding VAT; payment: the payment amount). */
  defaultTaxable: number
  /** Gross the vendor would otherwise get: shown as "pays / owes … after TDS". */
  gross: number
  /** Show the taxable-amount input (supplier payments). */
  showTaxable?: boolean
  /** Locked (a pay-later expense's TDS sets what is owed and can't change). */
  disabled?: boolean
  lockedHint?: string
  error?: string
  /** Wording for the net line: "Paid to the vendor" / "Owed to the supplier". */
  netLabel?: string
}

export function TdsFields({
  idPrefix,
  value,
  onChange,
  defaultTaxable,
  gross,
  showTaxable = false,
  disabled = false,
  lockedHint,
  error,
  netLabel = "Paid to the vendor",
}: TdsFieldsProps) {
  const categories = useTdsCategories()
  const options = selectableTdsCategories(categories.data ?? [], value.category)
  const id = (name: string) => `${idPrefix}-tds-${name}`
  const base = tdsTaxableBase(value, defaultTaxable)
  const worked = computeTds(base, Number(value.rate))
  const tds = effectiveTds(value, defaultTaxable)

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="space-y-1.5">
        <Label htmlFor={id("category")}>TDS (tax deducted at source)</Label>
        <Select
          value={value.category || NONE}
          onValueChange={(code) => onChange(chooseTdsCategory(value, categories.data ?? [], code === NONE ? "" : code))}
          disabled={disabled || categories.isLoading}
        >
          <SelectTrigger id={id("category")} aria-describedby={id("help")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No TDS</SelectItem>
            {options.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.name} · {c.rate_percent}%
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p id={id("help")} className="text-xs text-muted-foreground">
          {lockedHint ??
            (categories.isError
              ? "Couldn't load the TDS rates — set them in Finance setup › TDS rates."
              : "Withheld on the amount excluding VAT and owed to IRD (TDS Payable) until you deposit it.")}
        </p>
      </div>

      {value.category && (
        <div className={showTaxable ? "grid grid-cols-1 gap-3 sm:grid-cols-3" : "grid grid-cols-1 gap-3 sm:grid-cols-2"}>
          {showTaxable && (
            <div className="space-y-1.5">
              <Label htmlFor={id("taxable")}>Taxable (excl. VAT)</Label>
              <Input
                id={id("taxable")}
                inputMode="decimal"
                className="num text-right"
                value={value.taxable}
                placeholder={defaultTaxable > 0 ? defaultTaxable.toFixed(2) : "0.00"}
                onChange={(e) => onChange({ ...value, taxable: e.target.value, amount: "" })}
                disabled={disabled}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={id("rate")}>Rate (%)</Label>
            <Input
              id={id("rate")}
              inputMode="decimal"
              className="num text-right"
              value={value.rate}
              onChange={(e) => onChange({ ...value, rate: e.target.value, amount: "" })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("amount")}>TDS amount</Label>
            <Input
              id={id("amount")}
              inputMode="decimal"
              className="num text-right"
              value={value.amount}
              placeholder={worked > 0 ? worked.toFixed(2) : "0.00"}
              onChange={(e) => onChange({ ...value, amount: e.target.value })}
              disabled={disabled}
              aria-describedby={id("amount-help")}
            />
            <p id={id("amount-help")} className="text-xs text-muted-foreground">
              {value.amount.trim() ? "Typed over the worked-out amount." : "Worked out from the rate; type to change it."}
            </p>
          </div>
        </div>
      )}

      {value.category && tds > 0 && gross > 0 && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          TDS <CurrencyDisplay amount={tds} /> on <CurrencyDisplay amount={base} /> · {netLabel}{" "}
          <CurrencyDisplay amount={Math.round((gross - tds) * 100) / 100} />
        </p>
      )}
      <FieldError message={error} />
    </div>
  )
}
