"use client"

import { useId, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { CurrencyDisplay } from "@/components/currency-display"
import { formatVatRate } from "@/features/sales/lib/vat"
import type { TaxableSplit } from "@/features/sales/components/pos/checkout-math"
import { cn } from "@/lib/utils"

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

  return (
    <section aria-labelledby={`${listId}-heading`} className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <h3 id={`${listId}-heading`} className="sr-only">
        Order summary
      </h3>
      <button
        type="button"
        aria-expanded={itemsOpen}
        aria-controls={listId}
        onClick={() => onItemsOpenChange(!itemsOpen)}
        className="flex min-h-11 w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm font-medium outline-none transition-colors duration-150 hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        <span>
          Items <span className="num text-muted-foreground">({items.length})</span>
        </span>
        <ChevronDown
          className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200 ease-out", itemsOpen && "rotate-180")}
          aria-hidden
        />
      </button>

      {itemsOpen ? (
        <ul id={listId} className="max-h-64 divide-y overflow-y-auto border-t" aria-label="Items in this sale">
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
                        VAT exempt
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    <span className="num">
                      {item.quantity} × <CurrencyDisplay amount={item.unitPrice} />
                    </span>
                    {item.discountPercent ? <span className="num"> · {item.discountPercent}% off</span> : null}
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
        <Row label="Subtotal">
          <CurrencyDisplay amount={subtotal} />
        </Row>
        {discount > 0 ? (
          <Row label="Bill discount">
            −<CurrencyDisplay amount={discount} />
          </Row>
        ) : null}
        {split.hasExempt ? (
          <>
            <Row label="Taxable">
              <CurrencyDisplay amount={split.taxable} />
            </Row>
            <Row label="VAT exempt">
              <CurrencyDisplay amount={split.exempt} />
            </Row>
          </>
        ) : null}
        <Row label={<>VAT <span className="num">{formatVatRate(vatRatePercent)}</span> incl.</>}>
          <CurrencyDisplay amount={vat} />
        </Row>
        <Row label={<span className="font-semibold text-foreground">Total</span>} className="border-t pt-2">
          <span className="text-base font-semibold">
            <CurrencyDisplay amount={total} />
          </span>
        </Row>
      </dl>
    </section>
  )
}
