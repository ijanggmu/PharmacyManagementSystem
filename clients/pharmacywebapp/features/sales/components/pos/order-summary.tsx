"use client"

import { useId, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { CurrencyDisplay } from "@/components/currency-display"
import { formatVatRate } from "@/features/sales/lib/vat"
import type { TaxableSplit } from "@/features/sales/components/pos/checkout-math"
import { cn } from "@/lib/utils"
import { useI18n, useTranslations } from "@/lib/i18n/i18n-provider"
import {
  cartQuantityNote,
  displayQuantity,
  formatUnitCount,
  unitFactor,
  unitLabel,
  type SaleUnit,
  type SaleUnits,
} from "@/features/sales/lib/sale-units"

export interface OrderSummaryItem {
  medicineId: string
  medicineName: string
  strength?: string
  form?: string
  quantity: number
  unitPrice: number
  totalPrice: number
  discountPercent?: number
  isTaxable?: boolean
  /** A line sold in packs: quantity is base units, shown as packs ("2 strips × Rs 50"). */
  saleUnit?: SaleUnit
  packUnits?: SaleUnits | null
}

interface OrderSummaryProps {
  items: OrderSummaryItem[]
  itemsOpen: boolean
  onItemsOpenChange: (open: boolean) => void
  subtotal: number
  discount: number
  vat: number
  vatRatePercent: number
  split: TaxableSplit
  total: number
}

function Row({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", className)}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="num text-right font-medium text-foreground">{children}</dd>
    </div>
  )
}

/** Collapsible item list plus the bill breakdown; every figure comes from the caller's single computation. */
export function OrderSummary({
  items,
  itemsOpen,
  onItemsOpenChange,
  subtotal,
  discount,
  vat,
  vatRatePercent,
  split,
  total,
}: OrderSummaryProps) {
  const listId = useId()
  const t = useTranslations("pos")
  const { formatNumber } = useI18n()

  return (
    <section aria-labelledby={`${listId}-heading`} className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <h3 id={`${listId}-heading`} className="sr-only">
        {t("summary.title")}
      </h3>
      <button
        type="button"
        aria-expanded={itemsOpen}
        aria-controls={listId}
        onClick={() => onItemsOpenChange(!itemsOpen)}
        className="flex min-h-11 w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm font-medium outline-none transition-colors duration-150 hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        <span>
          {t("summary.items")} <span className="num text-muted-foreground">({formatNumber(items.length)})</span>
        </span>
        <ChevronDown
          className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200 ease-out", itemsOpen && "rotate-180")}
          aria-hidden
        />
      </button>

      {itemsOpen ? (
        <ul id={listId} className="max-h-64 divide-y overflow-y-auto border-t" aria-label={t("summary.itemsInSale")}>
          {items.map((item) => {
            const detail = [item.strength, item.form].filter(Boolean).join(" ")
            return (
              <li key={item.medicineId} className="flex items-start gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <span className="truncate" title={item.medicineName}>
                      {item.medicineName}
                    </span>
                    {item.isTaxable === false ? (
                      <span className="shrink-0 rounded-md border bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                        {t("summary.vatExempt")}
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    <span className="num">
                      {cartQuantityNote(item) && item.packUnits ? (
                        <>
                          {formatUnitCount(displayQuantity(item), unitLabel(item.saleUnit, item.packUnits))} ×{" "}
                          <CurrencyDisplay amount={item.unitPrice * unitFactor(item.saleUnit, item.packUnits)} />
                        </>
                      ) : (
                        <>
                          {item.quantity} × <CurrencyDisplay amount={item.unitPrice} />
                        </>
                      )}
                    </span>
                    {item.discountPercent ? (
                      <span className="num"> · {t("summary.percentOff", { percent: formatNumber(item.discountPercent) })}</span>
                    ) : null}
                    {detail ? ` · ${detail}` : ""}
                  </p>
                </div>
                <p className="num shrink-0 text-right text-sm font-semibold">
                  <CurrencyDisplay amount={item.totalPrice} />
                </p>
              </li>
            )
          })}
        </ul>
      ) : (
        <div id={listId} hidden />
      )}

      <dl className="space-y-1.5 border-t bg-muted/30 px-4 py-3 text-sm">
        <Row label={t("summary.subtotal")}>
          <CurrencyDisplay amount={subtotal} />
        </Row>
        {discount > 0 ? (
          <Row label={t("summary.billDiscount")}>
            −<CurrencyDisplay amount={discount} />
          </Row>
        ) : null}
        {split.hasExempt ? (
          <>
            <Row label={t("summary.taxable")}>
              <CurrencyDisplay amount={split.taxable} />
            </Row>
            <Row label={t("summary.vatExempt")}>
              <CurrencyDisplay amount={split.exempt} />
            </Row>
          </>
        ) : null}
        <Row label={<>{t("summary.vat")} <span className="num">{formatVatRate(vatRatePercent)}</span> {t("summary.incl")}</>}>
          <CurrencyDisplay amount={vat} />
        </Row>
        <Row label={<span className="font-semibold text-foreground">{t("summary.total")}</span>} className="border-t pt-2">

          <span className="text-base font-semibold">
            <CurrencyDisplay amount={total} />
          </span>
        </Row>
      </dl>
    </section>
  )
}
