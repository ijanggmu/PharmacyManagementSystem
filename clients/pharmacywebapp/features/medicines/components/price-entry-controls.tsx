"use client"

import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { SaleUnits } from "@/features/sales/lib/sale-units"
import {
  availablePriceBases,
  INR_TO_NPR,
  priceBasisLabel,
  supportedBasis,
  type PriceBasis,
  type PriceCurrency,
  type PriceEntry,
} from "@/features/medicines/lib/price-entry"

/**
 * "Prices are per [strip ▾] in [NPR ▾]": lets the user type the cost and selling price as the supplier bill
 * shows them. The form converts to the stored per-unit NPR price (features/medicines/lib/price-entry.ts).
 */
export function PriceEntryControls({
  idPrefix,
  value,
  onChange,
  units,
  allowInr,
}: {
  idPrefix: string
  value: PriceEntry
  onChange: (next: PriceEntry) => void
  units: SaleUnits | null
  /** INR entry only makes sense for a pharmacy that keeps its books in NPR. */
  allowInr: boolean
}) {
  const bases = availablePriceBases(units)
  const basis = supportedBasis(value.basis, units)
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[9rem]">
        <Label htmlFor={`${idPrefix}-price-basis`}>Prices on the bill are per</Label>
        <Select
          value={basis}
          onValueChange={(next) => onChange({ ...value, basis: next as PriceBasis })}
          disabled={bases.length === 1}
        >
          <SelectTrigger id={`${idPrefix}-price-basis`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {bases.map((b) => (
              <SelectItem key={b} value={b}>
                {priceBasisLabel(b, units)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {allowInr && (
        <div className="min-w-[9rem]">
          <Label htmlFor={`${idPrefix}-price-currency`}>Bill currency</Label>
          <Select value={value.currency} onValueChange={(next) => onChange({ ...value, currency: next as PriceCurrency })}>
            <SelectTrigger id={`${idPrefix}-price-currency`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NPR">NPR (रू)</SelectItem>
              <SelectItem value="INR">INR (₹) → NPR at {INR_TO_NPR}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      {bases.length === 1 && (
        <p className="basis-full text-xs text-muted-foreground">
          Set the units per pack under Packaging to type prices per strip or box.
        </p>
      )}
    </div>
  )
}
