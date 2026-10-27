"use client"

import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
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
 * "Prices on the bill are per [strip ▾]": lets the user type the cost and selling price as the supplier bill
 * shows them. The form converts to the stored per-unit price (features/medicines/lib/price-entry.ts).
 */
export function PriceEntryControls({
  idPrefix,
  value,
  onChange,
  units,
}: {
  idPrefix: string
  value: PriceEntry
  onChange: (next: PriceEntry) => void
  units: SaleUnits | null
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
      {bases.length === 1 && (
        <p className="basis-full text-xs text-muted-foreground">
          Set the units per pack above to type prices per strip or box.
        </p>
      )}
    </div>
  )
}

/**
 * NPR / INR picker that sits beside one price box. Cost and selling price each get their own, since an Indian
 * bill can carry a cost in NPR and an MRP printed in INR. INR is converted at the fixed 1.60 rate.
 */
export function PriceCurrencyToggle({
  value,
  onChange,
  label,
  className,
}: {
  value: PriceCurrency
  onChange: (next: PriceCurrency) => void
  /** Accessible name, e.g. "Cost price currency". */
  label: string
  className?: string
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as PriceCurrency)}>
      <SelectTrigger aria-label={label} title={`₹1 = रू${INR_TO_NPR}`} className={cn("w-[5.5rem] shrink-0", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="NPR">रू NPR</SelectItem>
        <SelectItem value="INR">₹ INR</SelectItem>
      </SelectContent>
    </Select>
  )
}
