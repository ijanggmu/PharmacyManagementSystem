"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { EmptyState } from "@/components/ui/empty-state"
import { CurrencyDisplay } from "@/components/currency-display"
import { Minus, Plus, Receipt, Search, ShoppingCart, Trash2, X } from "lucide-react"
import { CartItem } from "@/features/sales/types"
import FefoPickNote from "./fefo-pick-note"
import { formatVatRate } from "@/features/sales/lib/vat"
import {
  baseFromDisplay,
  countedUnits,
  displayQuantity,
  effectiveUnit,
  formatPackQuantity,
  formatUnitCount,
  hasBox,
  pluralizeUnit,
  unitFactor,
  unitLabel,
  type SaleUnit,
} from "@/features/sales/lib/sale-units"
import { cn } from "@/lib/utils"
import { useI18n, useTranslations } from "@/lib/i18n/i18n-provider"

interface CartPanelProps {
  cart: CartItem[]
  filteredCartItems: CartItem[]
  cartSearchQuery: string
  setCartSearchQuery: (q: string) => void
  subtotal: number
  taxAmount: number
  /** VAT rate as a percent (e.g. 13). */
  vatRatePercent: number
  discountAmount: number
  discountPercent: number
  setDiscountPercent: (p: number) => void
  total: number
  loading: boolean
  onRemove: (id: string) => void
  /** New quantity in BASE units (the panel converts a pack line's typed packs). */
  onUpdateQty: (id: string, qty: number) => void
  /** Switch a line with a pack size between base units and whole packs. */
  onUpdateUnit?: (id: string, unit: SaleUnit) => void
  onUpdateDiscount: (id: string, discountPercent: number) => void
  onClear: () => void
  onSubmit: () => void
  /** Rendered inside the mobile cart sheet: no outer frame, room for the sheet's close button. */
  inSheet?: boolean
  className?: string
  /** The line keyboard shortcuts act on (F9, +, −, Del); clicking or focusing a line selects it. */
  selectedId?: string | null
  onSelect?: (id: string) => void
}

/** Lines at which a "find in cart" filter starts paying for its space. */
const CART_SEARCH_THRESHOLD = 4

export default function CartPanel({
  cart,
  filteredCartItems,
  cartSearchQuery,
  setCartSearchQuery,
  subtotal,
  taxAmount,
  vatRatePercent,
  discountAmount,
  discountPercent,
  setDiscountPercent,
  total,
  loading,
  onRemove,
  onUpdateQty,
  onUpdateUnit,
  onUpdateDiscount,
  onClear,
  onSubmit,
  inSheet = false,
  className,
  selectedId = null,
  onSelect,
}: CartPanelProps) {
  const t = useTranslations("pos")
  const { formatNumber } = useI18n()
  const unitCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  const showSearch = cart.length >= CART_SEARCH_THRESHOLD || cartSearchQuery !== ""

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden bg-card",
        inSheet ? "h-full" : "min-h-[420px] rounded-xl border shadow-xs",
        className,
      )}
    >
      {/* Header */}
      <div className={cn("flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3", inSheet && "pr-12")}>
        <h2 id="cart-heading" className="flex items-center gap-2 font-display text-base font-semibold">
          <ShoppingCart className="h-[18px] w-[18px] text-primary" aria-hidden />
          {t("cart.title")}
        </h2>
        <div className="flex items-center gap-1">
          {cart.length > 0 ? (
            <Badge variant="muted" className="num">
              {t(cart.length === 1 ? "cart.lineOne" : "cart.lines", { n: formatNumber(cart.length) })} ·{" "}
              {t(unitCount === 1 ? "cart.unitOne" : "cart.units", { n: formatNumber(unitCount) })}
            </Badge>
          ) : null}
          {cart.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-9 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={onClear}
              aria-label={t("cart.clearAll")}
              title={t("cart.clearCart")}
            >
              <Trash2 aria-hidden />
              {t("cart.clear")}
            </Button>
          ) : null}
        </div>
      </div>

      {showSearch ? (
        <div className="shrink-0 border-b px-4 py-2.5">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              placeholder={t("cart.findPlaceholder")}
              value={cartSearchQuery}
              onChange={(e) => setCartSearchQuery(e.target.value)}
              className="h-10 pl-9 text-sm"
              aria-label={t("cart.searchLabel")}
            />
          </div>
        </div>
      ) : null}

      {/* Lines */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {cart.length === 0 ? (
          <EmptyState
            size="compact"
            icon={ShoppingCart}
            title={t("cart.emptyTitle")}
            description={t("cart.emptyDescription")}
            className="m-4 rounded-xl border border-dashed"
          />
        ) : filteredCartItems.length === 0 ? (
          <EmptyState
            size="compact"
            icon={Search}
            title={t("cart.noMatchTitle")}
            description={t("cart.noMatchDescription", { query: cartSearchQuery })}
            action={{ label: t("cart.clearSearch"), onClick: () => setCartSearchQuery("") }}
            className="m-4"
          />
        ) : (
          <ul className="divide-y" aria-label={t("cart.itemsLabel")}>
            {filteredCartItems.map((item) => {
              const detail = [item.strength, item.form].filter(Boolean).join(" · ")
              const packUnits = item.packUnits ?? null
              const lineUnit = effectiveUnit(item.saleUnit, packUnits)
              const counted = countedUnits(lineUnit, packUnits)
              const inPacks = counted != null
              // A pack (box) line steps (and is typed) in whole packs (boxes); quantity itself stays in base units.
              const step = unitFactor(lineUnit, packUnits)
              const shown = displayQuantity(item)
              const unitName = unitLabel(lineUnit, packUnits)
              const selected = selectedId === item.medicineId
              return (
                <li
                  key={item.medicineId}
                  className={cn(
                    "border-l-2 px-4 py-3 transition-colors",
                    selected && onSelect ? "border-l-primary bg-primary/5" : "border-l-transparent",
                  )}
                  aria-current={selected && onSelect ? "true" : undefined}
                  onClick={onSelect ? () => onSelect(item.medicineId) : undefined}
                  onFocusCapture={onSelect ? () => onSelect(item.medicineId) : undefined}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium" title={item.medicineName}>
                          {item.medicineName}
                        </span>
                        {item.isTaxable ? null : (
                          <span className="shrink-0 rounded-md border bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                            {t("summary.vatExempt")}
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {detail ? `${detail} · ` : ""}
                        <CurrencyDisplay amount={item.unitPrice * step} className="num" />{" "}
                        {inPacks ? t("cart.perUnit", { unit: unitName }) : t("cart.each")}
                        {item.mixedPrices ? ` ${t("cart.mixedPrices")}` : ""}
                      </p>
                      {counted ? (
                        <p className="num text-xs text-muted-foreground">{formatPackQuantity(item.quantity, counted)}</p>
                      ) : null}
                      {item.unpricedBatch ? (
                        <p className="text-xs text-destructive">
                          {t("cart.unpricedBatch", { batch: item.unpricedBatch })}
                        </p>
                      ) : null}
                    </div>
                    <div className="shrink-0 pt-0.5 text-right">
                      <p className="num text-sm font-semibold">
                        <CurrencyDisplay amount={item.totalPrice} />
                      </p>
                      {item.discountPercent > 0 && (
                        <p className="num text-[11px] leading-tight text-success">
                          <span className="text-muted-foreground line-through">
                            <CurrencyDisplay amount={item.unitPrice * item.quantity} />
                          </span>{" "}
                          −{formatNumber(item.discountPercent)}%
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex items-center rounded-lg border bg-background" role="group" aria-label={t("cart.quantityFor", { name: item.medicineName })}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 rounded-r-none"
                        onClick={() => onUpdateQty(item.medicineId, item.quantity - step)}
                        aria-label={shown <= 1 ? t("cart.removeName", { name: item.medicineName }) : t("cart.oneLess", { unit: unitName, name: item.medicineName })}
                      >
                        <Minus className="h-4 w-4" aria-hidden />
                      </Button>
                      <Label htmlFor={`qty-${item.medicineId}`} className="sr-only">
                        {t("cart.quantityForIn", { name: item.medicineName, unit: pluralizeUnit(unitName, 2) })}
                      </Label>
                      <Input
                        id={`qty-${item.medicineId}`}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={inPacks ? Math.floor(item.availableStock / step) : item.availableStock}
                        value={shown}
                        onChange={(e) => onUpdateQty(item.medicineId, baseFromDisplay(item, Number.parseInt(e.target.value, 10) || 1))}
                        className="num h-10 w-12 rounded-none border-0 border-x px-0 text-center text-sm shadow-none focus-visible:ring-inset"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 rounded-l-none"
                        onClick={() => onUpdateQty(item.medicineId, item.quantity + step)}
                        disabled={item.quantity + step > item.availableStock}
                        aria-label={t("cart.oneMore", { unit: unitName, name: item.medicineName })}
                      >
                        <Plus className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>

                    {packUnits && onUpdateUnit ? (
                      <div
                        className="flex items-center rounded-lg border bg-background p-0.5"
                        role="radiogroup"
                        aria-label={t("cart.sellBy", { name: item.medicineName })}
                      >
                        {(hasBox(packUnits) ? (["base", "pack", "box"] as const) : (["base", "pack"] as const)).map((unit) => {
                          const selected = lineUnit === unit
                          const label = unitLabel(unit, packUnits)
                          return (
                            <button
                              key={unit}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              onClick={() => onUpdateUnit(item.medicineId, unit)}
                              title={
                                unit === "box"
                                  ? `${formatUnitCount(1, label)} = ${formatUnitCount(packUnits.packsPerBox ?? 0, packUnits.packLabel)} = ${formatUnitCount(unitFactor("box", packUnits), packUnits.baseLabel)}`
                                  : unit === "pack"
                                  ? `${formatUnitCount(1, packUnits.packLabel)} = ${formatUnitCount(packUnits.unitsPerPack, packUnits.baseLabel)}`
                                  : t("cart.sellSingle", { unit: pluralizeUnit(packUnits.baseLabel, 2) })
                              }
                              className={cn(
                                "h-9 rounded-md px-2 text-xs font-medium capitalize transition-colors",
                                selected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                              )}
                            >
                              {label}
                            </button>
                          )
                        })}
                      </div>
                    ) : null}

                    <div className="relative">
                      <Label htmlFor={`disc-${item.medicineId}`} className="sr-only">
                        {t("cart.discountFor", { name: item.medicineName })}
                      </Label>
                      <Input
                        id={`disc-${item.medicineId}`}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={100}
                        step={0.5}
                        value={item.discountPercent === 0 ? "" : item.discountPercent}
                        onChange={(e) =>
                          onUpdateDiscount(
                            item.medicineId,
                            Math.max(0, Math.min(100, Number.parseFloat(e.target.value) || 0))
                          )
                        }
                        className="num h-10 w-[6.5rem] pl-2 pr-12 text-right text-sm"
                        placeholder="0"
                        title={t("cart.lineDiscount")}
                      />
                      <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground" aria-hidden>
                        {t("cart.percentOff")}
                      </span>
                    </div>

                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="ml-auto h-10 w-10 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => onRemove(item.medicineId)}
                      aria-label={t("cart.removeFromCart", { name: item.medicineName })}
                      title={t("cart.remove")}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>

                  <div className="mt-2">
                    <FefoPickNote picks={item.fefoPicks ?? []} quantity={item.quantity} batchTracked={item.batchTracked} />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Pinned totals + primary action */}
      {cart.length > 0 ? (
        <div className={cn("shrink-0 space-y-3 border-t bg-card px-4 pt-3", inSheet ? "pb-[max(1rem,env(safe-area-inset-bottom))]" : "pb-4")}>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="order-discount" className="text-sm font-normal text-muted-foreground">
              {t("summary.billDiscount")}
            </Label>
            <div className="relative">
              <Input
                id="order-discount"
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step={0.5}
                value={discountPercent === 0 ? "" : discountPercent}
                onChange={(e) => setDiscountPercent(Number.parseFloat(e.target.value) || 0)}
                className="num h-10 w-24 pr-7 text-right text-sm"
                placeholder="0"
                aria-describedby="order-discount-help"
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground" aria-hidden>
                %
              </span>
            </div>
          </div>
          <p id="order-discount-help" className="sr-only">
            {t("cart.billDiscountHelp")}
          </p>

          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("summary.subtotal")}</dt>
              <dd className="num text-right">
                <CurrencyDisplay amount={subtotal} />
              </dd>
            </div>
            {discountAmount > 0 ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("summary.billDiscount")}</dt>
                <dd className="num text-right">
                  −<CurrencyDisplay amount={discountAmount} />
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">
                {t("summary.vat")} <span className="num">{formatVatRate(vatRatePercent)}</span> {t("summary.incl")}
              </dt>
              <dd className="num text-right">
                <CurrencyDisplay amount={taxAmount} />
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t pt-2">
              <dt className="font-semibold">{t("summary.total")}</dt>
              <dd className="num text-right font-display text-2xl font-semibold tracking-tight">
                <CurrencyDisplay amount={total} />
              </dd>
            </div>
          </dl>

          <Button
            type="button"
            size="lg"
            className="h-12 w-full text-base font-semibold"
            onClick={onSubmit}
            aria-keyshortcuts="F8"
            title={t("checkout.reviewPayShortcut")}
            loading={loading}
            loadingText={t("checkout.processing")}
          >
            <Receipt className="h-5 w-5" aria-hidden />
            {t("checkout.reviewPay")}

          </Button>
        </div>
      ) : null}
    </div>
  )
}
