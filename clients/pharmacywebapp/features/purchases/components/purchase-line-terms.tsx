"use client"

/**
 * Supplier-bill inputs shared by the purchase order and direct receipt forms: a discount field that takes a
 * percent or an amount, a units/packs toggle for medicines sold in packs, and the live totals panel with the
 * bill discount. All figures come from purchase-bill-totals.ts (the same rules the server applies).
 */

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { pluralizeUnit, resolveSaleUnits } from "@/features/sales/lib/sale-units"
import { CurrencyDisplay } from "@/components/currency-display"
import type { DiscountMode, PurchaseBillTotals } from "@/features/purchases/lib/purchase-bill-totals"

/** Display-only parse of a numeric field; blank or invalid is 0. */
export function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  const n = Number.parseFloat((value ?? "").trim())
  return Number.isFinite(n) ? n : 0
}

export function DiscountField({
  mode,
  value,
  onModeChange,
  onValueChange,
  label,
  className,
}: {
  mode: DiscountMode
  value: string
  onModeChange: (mode: DiscountMode) => void
  onValueChange: (value: string) => void
  label: string
  className?: string
}) {
  return (
    <div className={`flex items-center gap-1 ${className ?? ""}`}>
      <Input
        type="text"
        inputMode="decimal"
        placeholder="0"
        value={value}
        aria-label={`${label} (${mode === "percent" ? "percent" : "amount"})`}
        className="num min-w-16 text-right"
        onChange={(e) => onValueChange(e.target.value)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 w-10 shrink-0 px-0 text-xs"
        onClick={() => onModeChange(mode === "percent" ? "amount" : "percent")}
        aria-label={`${label}: switch to ${mode === "percent" ? "amount" : "percent"}`}
        title={mode === "percent" ? "Discount in percent — click for amount" : "Discount as an amount — click for percent"}
      >
        {mode === "percent" ? "%" : "Rs"}
      </Button>
    </div>
  )
}

/**
 * Unit the line is entered in. A medicine with a pack size above 1 gets a units/packs switch; one that also has a
 * box (packs per box) gets a three-way unit / pack ×N / box ×M select. `onChange(inPacks, inBoxes)` — at most one
 * is true.
 */
export function UnitToggle({
  inPacks,
  inBoxes = false,
  unitsPerPack,
  packsPerBox,
  unitLabel,
  boxLabel,
  form,
  onChange,
  label,
}: {
  inPacks: boolean
  inBoxes?: boolean
  unitsPerPack: number | null | undefined
  packsPerBox?: number | null
  unitLabel: string | null | undefined
  boxLabel?: string | null
  /** Dosage form (tablet, capsule…): names the base unit when the unit label names the pack ("Strip"). */
  form?: string | null
  onChange: (inPacks: boolean, inBoxes: boolean) => void
  label: string
}) {
  if (!unitsPerPack || unitsPerPack <= 1) {
    return <span className="text-xs text-muted-foreground">{unitLabel?.trim() || "unit"}</span>
  }
  // Same naming as the till: a label like "Strip" names the pack, and the base unit comes from the dosage form.
  const units = resolveSaleUnits({ units_per_pack: unitsPerPack, unit_label: unitLabel, form, packs_per_box: packsPerBox, box_label: boxLabel })
  const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)
  const unit = capitalize(units?.baseLabel ?? (unitLabel?.trim() || "unit"))
  const pack = capitalize(units?.packLabel ?? "pack")
  const unitsPerBox = packsPerBox && packsPerBox > 1 ? unitsPerPack * packsPerBox : 0
  if (unitsPerBox > 0) {
    const box = boxLabel?.trim() || "Box"
    const value = inBoxes ? "box" : inPacks ? "pack" : "unit"
    return (
      <Select
        value={value}
        onValueChange={(v) => onChange(v === "pack", v === "box")}
      >
        <SelectTrigger
          className="h-9 w-auto min-w-24 whitespace-nowrap px-2 text-xs"
          aria-label={`${label}: entered in ${value === "box" ? `${pluralizeUnit(box.toLowerCase(), 2)} of ${unitsPerBox}` : value === "pack" ? `packs of ${unitsPerPack}` : `${unit}s`}`}
          title={
            value === "box"
              ? `Quantity and rate are per ${box.toLowerCase()} of ${packsPerBox} packs (${unitsPerBox} ${unit})`
              : value === "pack"
                ? `Quantity and rate are per pack of ${unitsPerPack} ${unit}`
                : `Quantity and rate are per ${unit}`
          }
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unit">{unit}</SelectItem>
          <SelectItem value="pack">{`${pack} ×${unitsPerPack}`}</SelectItem>
          <SelectItem value="box">{`${box} ×${unitsPerBox}`}</SelectItem>
        </SelectContent>
      </Select>
    )
  }
  return (
    <Button
      type="button"
      variant={inPacks ? "secondary" : "outline"}
      size="sm"
      className="h-9 whitespace-nowrap px-2 text-xs"
      onClick={() => onChange(!inPacks, false)}
      aria-pressed={inPacks}
      aria-label={`${label}: ${inPacks ? `entered in packs of ${unitsPerPack}` : `entered in ${unit}s`} — click to switch`}
      title={inPacks ? `Quantity and rate are per pack of ${unitsPerPack} ${unit}` : `Quantity and rate are per ${unit}`}
    >
      {inPacks ? `${pack} ×${unitsPerPack}` : unit}
    </Button>
  )
}

function Row({ label, amount, strong, negative }: { label: string; amount: number; strong?: boolean; negative?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 ${strong ? "border-t pt-1.5" : ""}`}>
      <dt className={strong ? "font-semibold" : "text-muted-foreground"}>{label}</dt>
      <dd className={`num text-right ${strong ? "text-base font-semibold" : ""}`}>
        {negative && amount > 0 ? "− " : ""}
        <CurrencyDisplay amount={amount} />
      </dd>
    </div>
  )
}

/**
 * Bill discount input and the running totals: gross, line and bill discounts, taxable, exempt, VAT and the
 * net bill (what is owed to the supplier).
 */
export function PurchaseBillTotalsPanel({
  totals,
  billDiscountMode,
  billDiscountValue,
  onBillDiscountModeChange,
  onBillDiscountValueChange,
  vatBill,
  onVatBillChange,
  vatRatePercent,
  idPrefix,
  note,
}: {
  totals: PurchaseBillTotals
  billDiscountMode: DiscountMode
  billDiscountValue: string
  onBillDiscountModeChange: (mode: DiscountMode) => void
  onBillDiscountValueChange: (value: string) => void
  vatBill: boolean
  onVatBillChange: (vatBill: boolean) => void
  vatRatePercent: number
  idPrefix: string
  note?: string
}) {
  return (
    <div className="ml-auto w-full max-w-sm space-y-3 rounded-md border bg-muted/40 p-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={`${idPrefix}-vat-bill`} className="text-sm font-normal">
          VAT bill{vatRatePercent > 0 ? ` (${Number(vatRatePercent.toFixed(2))}%)` : ""}
        </Label>
        <Switch id={`${idPrefix}-vat-bill`} checked={vatBill} onCheckedChange={onVatBillChange} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm font-normal">Bill discount (cash/trade)</Label>
        <DiscountField
          className="w-36"
          label="Bill discount"
          mode={billDiscountMode}
          value={billDiscountValue}
          onModeChange={onBillDiscountModeChange}
          onValueChange={onBillDiscountValueChange}
        />
      </div>
      <dl className="space-y-1.5">
        <Row label="Gross" amount={totals.gross} />
        <Row label="Line discounts" amount={totals.lineDiscount} negative />
        <Row label="Bill discount" amount={totals.billDiscount} negative />
        <Row label="Taxable" amount={totals.taxable} />
        {totals.exempt > 0 && <Row label="Exempt" amount={totals.exempt} />}
        <Row label="VAT" amount={totals.vat} />
        <Row label="Net bill" amount={totals.net} strong />
      </dl>
      <p className="text-xs text-muted-foreground">
        VAT is charged on the value after discounts. Free goods add stock, not cost: each unit is costed at the
        line&apos;s taxable value ÷ (qty + free).{note ? ` ${note}` : ""}
      </p>
    </div>
  )
}
