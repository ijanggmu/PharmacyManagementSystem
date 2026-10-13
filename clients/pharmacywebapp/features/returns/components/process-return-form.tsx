"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { FieldError } from "@/components/ui/field-error"
import { RefreshCw, X } from "lucide-react"
import { CurrencyDisplay } from "@/components/currency-display"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import type { Sale } from "@/features/sales/api-client"
import { returnsApi, type CreateReturnData } from "@/features/returns/api-client"
import {
  alreadyReversedQuantity,
  effectiveUnitPrice,
  remainingReversibleQuantity,
  returnLineAmount,
} from "@/features/returns/lib/return-pricing"
import { SettlementBreakdown, toApiRefundMethod, useReversalPreview } from "@/features/returns/components/settlement-preview"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useCurrency } from "@/lib/contexts/currency-context"
import { createIdempotencyKeyTracker } from "@/lib/api/idempotency"
import { describeSettlement } from "@/lib/api/sales-api"
import {
  formatUnitCount,
  packsToBase,
  pluralizeUnit,
  soldQuantityNote,
  soldUnitsOf,
  wholePacks,
  type SaleUnit,
} from "@/features/sales/lib/sale-units"
import { invalidateMoneyMovementQueries } from "@/lib/hooks/money-movement-queries"
import { businessDateInstantUtc, nepalYmdOf } from "@/lib/utils/nepal-time"

interface ReturnItem {
  saleItemId: string
  medicineId: string
  medicineName: string
  originalQuantity: number
  returnQuantity: number
  unitPrice: number
  totalPrice: number
  reason: string
  packagingCondition: "sealed" | "opened" | "damaged"
}

interface ProcessReturnFormProps {
  sale: Sale
  /** Leave without saving. */
  onCancel: () => void
  /** Called once the return is saved. */
  onSuccess?: () => void
  /** Sale line to start with selected (one unit), e.g. when the return was started from that line. */
  initialSaleItemId?: string | null
  /** "sheet" fills a right-side panel: the lines scroll and the totals + actions stay pinned at the bottom. */
  layout?: "card" | "sheet"
}

/**
 * The customer return form for one sale, shown in the Process return panel (or the New customer return page).
 * Callers key it by sale and starting line, so it starts fresh for each.
 */
export default function ProcessReturnForm({ sale, onCancel, onSuccess, initialSaleItemId, layout = "card" }: ProcessReturnFormProps) {
  const inSheet = layout === "sheet"
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([])
  // Unit each pack-sold line is being returned in (display only: the return quantity is always base units).
  const [returnUnits, setReturnUnits] = useState<Record<string, SaleUnit>>({})
  const [returnReason, setReturnReason] = useState("")
  const [refundMethod, setRefundMethod] = useState("original")
  const [isProcessing, setIsProcessing] = useState(false)
  // Inline errors appear only after the first submit attempt, never while the user is still filling in.
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const { toast } = useToast()
  const { formatCurrency } = useCurrency()
  const queryClient = useQueryClient()
  // One Idempotency-Key per submission: a retry of the same return (same body) reuses it, so a timed-out
  // request that actually succeeded is not recorded twice. Passed through mutate(vars), never closed over.
  const returnKeys = useRef(createIdempotencyKeyTracker())
  const createReturn = useMutation({
    mutationFn: (vars: { data: CreateReturnData; idempotencyKey: string }) =>
      returnsApi.createReturn(vars.data, vars.idempotencyKey),
  })

  const isWalkIn = !sale.customers?.id && !sale.customer_id

  // Store credit needs a customer account; a walk-in sale can't take it.
  useEffect(() => {
    if (isWalkIn && refundMethod === "store_credit") setRefundMethod("original")
  }, [isWalkIn, refundMethod])

  const linesToReturn = useMemo(
    () => returnItems.filter((item) => item.returnQuantity > 0),
    [returnItems]
  )

  const totalReturnAmount = linesToReturn.reduce((sum, item) => sum + item.totalPrice, 0)
  const preview = useReversalPreview(sale.id, totalReturnAmount, refundMethod)

  const updateReturnQuantity = (saleItemId: string, rawQty: number) => {
    const saleItem = sale.sale_items.find((item) => item.id === saleItemId)
    if (!saleItem) return

    // Cap at what is left on the line after earlier returns AND refunds (the server's combined cap).
    const q = Math.max(0, Math.min(Math.floor(rawQty), remainingReversibleQuantity(saleItem)))
    // What the line actually sold for (after its discounts) — the server prices the return the same way,
    // and the portion that empties the line takes exactly what is left of its total.
    const sold = { quantity: saleItem.quantity, lineTotal: saleItem.total_price }
    const unitPrice = effectiveUnitPrice(sold)
    const already = { quantity: alreadyReversedQuantity(saleItem) }

    setReturnItems((prev) => {
      if (q === 0) {
        return prev.filter((item) => item.saleItemId !== saleItemId)
      }

      const row: ReturnItem = {
        saleItemId,
        medicineId: saleItem.medicines?.id || "",
        medicineName: saleItem.medicines?.name || "Unknown Medicine",
        originalQuantity: saleItem.quantity,
        returnQuantity: q,
        unitPrice,
        totalPrice: returnLineAmount(sold, q, already),
        reason: prev.find((i) => i.saleItemId === saleItemId)?.reason ?? "",
        packagingCondition: prev.find((i) => i.saleItemId === saleItemId)?.packagingCondition ?? "opened",
      }

      const existing = prev.some((i) => i.saleItemId === saleItemId)
      if (existing) {
        return prev.map((item) => (item.saleItemId === saleItemId ? row : item))
      }
      return [...prev, row]
    })
  }

  // Start with the line the return was opened from: one unit, through the same cap and pricing as typing it.
  const preselected = useRef(false)
  useEffect(() => {
    if (preselected.current || !initialSaleItemId) return
    preselected.current = true
    updateReturnQuantity(initialSaleItemId, 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, [])

  const handleItemReasonChange = (saleItemId: string, reason: string) => {
    setReturnItems((prev) =>
      prev.map((item) => (item.saleItemId === saleItemId ? { ...item, reason } : item))
    )
  }

  const handlePackagingChange = (saleItemId: string, packagingCondition: ReturnItem["packagingCondition"]) => {
    setReturnItems((prev) =>
      prev.map((item) => (item.saleItemId === saleItemId ? { ...item, packagingCondition } : item))
    )
  }

  const removeReturnItem = (saleItemId: string) => {
    setReturnItems((prev) => prev.filter((item) => item.saleItemId !== saleItemId))
  }

  const getTotalReturnAmount = () => totalReturnAmount

  const handleProcessReturn = async () => {
    setSubmitAttempted(true)
    if (linesToReturn.length === 0) {
      toast({
        title: "No items selected",
        description: "Enter a return quantity greater than zero for at least one line.",
        variant: "destructive",
      })
      return
    }

    if (!returnReason.trim()) {
      toast({
        title: "Return reason required",
        description: "Please provide a general reason for the return.",
        variant: "destructive",
      })
      return
    }

    const itemsWithoutReason = linesToReturn.filter((item) => !item.reason.trim())
    if (itemsWithoutReason.length > 0) {
      toast({
        title: "Item reasons required",
        description: "Please provide a reason for each line you are returning.",
        variant: "destructive",
      })
      return
    }

    if (!linesToReturn.every((item) => item.medicineId)) {
      toast({
        title: "Invalid line",
        description: "One or more items are missing medicine data. Refresh and try again.",
        variant: "destructive",
      })
      return
    }

    setIsProcessing(true)

    try {
      // Walk-in sales have no customer; the server accepts a return without one.
      const data: CreateReturnData = {
        sale_id: sale.id,
        customer_id: sale.customers?.id ?? "",
        // Today in Nepal, as the business-date instant the server stores (not the browser's UTC date).
        return_date: businessDateInstantUtc(nepalYmdOf()),
        status: "completed",
        reason: returnReason.trim(),
        refund_method: toApiRefundMethod(refundMethod),
        return_items: linesToReturn.map((item) => ({
          sale_item_id: item.saleItemId,
          quantity_returned: item.returnQuantity,
          reason: item.reason.trim(),
          packaging_condition: item.packagingCondition,
        })),
      }
      // The date is left out of the fingerprint so a retry across midnight still reuses the key.
      const idempotencyKey = returnKeys.current.keyFor(JSON.stringify({ ...data, return_date: "" }))
      const result = await createReturn.mutateAsync({ data, idempotencyKey })
      if (result.error) throw new Error(result.error)
      returnKeys.current.reset()
      // The completed return restocked items, changed the sale's returnable quantities, the customer's
      // balance (on-account credit) and the cash drawer.
      invalidateMoneyMovementQueries(queryClient)

      const settlement = result.data[0]?.settlement ?? preview.data ?? null
      toast({
        title: "Return processed",
        description: `${linesToReturn.length} ${linesToReturn.length === 1 ? "line" : "lines"} returned · ${formatCurrency(totalReturnAmount)}${
          settlement ? ` — ${describeSettlement(settlement, (n) => formatCurrency(n))}` : ""
        }`,
      })

      onSuccess?.()
    } catch (error) {
      console.error("Error processing return:", error)
      const message =
        error instanceof Error ? error.message : "Something went wrong while processing the return."
      toast({
        title: "Could not process return",
        description: message,
        variant: "destructive",
      })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className={inSheet ? "flex min-h-0 flex-1 flex-col" : "overflow-hidden rounded-xl border bg-card"}>
        <div className={inSheet ? "min-h-0 flex-1 overflow-y-auto px-5 py-4" : "px-4 py-4 sm:px-6"}>
          <div className={cn("mb-4 grid gap-3 rounded-lg border bg-muted/30 p-4 text-sm sm:grid-cols-2", !inSheet && "lg:grid-cols-4")}>
            <div>
              <div className="text-muted-foreground text-xs">Customer</div>
              <div className="font-medium">
                {sale.customers
                  ? `${sale.customers.first_name} ${sale.customers.last_name}`
                  : "Walk-in"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Sale date</div>
              <div className="num font-medium">{new Date(sale.sale_date).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Original total</div>
              <div className="num font-medium">
                <CurrencyDisplay amount={sale.total_amount} />
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Payment</div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="muted" className="capitalize">
                  {String(sale.payment_method).replace(/_/g, " ")}
                </Badge>
                <Badge variant={
                    sale.payment_status === "paid" || sale.payment_status === "completed"
                      ? "success"
                      : sale.payment_status === "failed"
                        ? "danger"
                        : "warning"
                  } className="capitalize">
                  {String(sale.payment_status).replace(/_/g, " ")}
                </Badge>
              </div>
            </div>
          </div>

          <div className="rounded-lg border">
            <div className="flex flex-wrap items-baseline justify-between gap-2 bg-muted/40 px-4 py-2">
              <span className="text-sm font-medium">Items to return</span>
              <span className="text-xs text-muted-foreground">Enter a return quantity to include a line.</span>
            </div>

            {/* Phone: one stacked card per line. */}
            <ul className="divide-y sm:hidden">
              {sale.sale_items.map((item) => {
                const returnItem = returnItems.find((ri) => ri.saleItemId === item.id)
                const isSelected = returnItem != null && returnItem.returnQuantity > 0
                const remaining = remainingReversibleQuantity(item)
                const back = alreadyReversedQuantity(item)
                return (
                  <li key={item.id} className={cn("space-y-3 p-4", isSelected && "bg-primary/5")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium">{item.medicines?.name || "Unknown"}</div>
                        <div className="text-muted-foreground text-xs">
                          {item.medicines?.strength} {item.medicines?.form}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          Sold <span className="num">{soldQuantityNote(item) ?? item.quantity}</span>
                          {back > 0 && (
                            <>
                              {" · "}already back <span className="num">{back}</span>
                            </>
                          )}
                          {" · "}
                          <CurrencyDisplay amount={effectiveUnitPrice({ quantity: item.quantity, lineTotal: item.total_price })} /> each
                        </div>
                      </div>
                      <ReturnQuantityInput
                        item={item}
                        name={item.medicines?.name || "item"}
                        remaining={remaining}
                        value={returnItem?.returnQuantity ?? 0}
                        unit={returnUnits[item.id] ?? "base"}
                        onUnitChange={(unit) => setReturnUnits((prev) => ({ ...prev, [item.id]: unit }))}
                        onChange={(base) => updateReturnQuantity(item.id, base)}
                        className="h-10 w-20 shrink-0"
                        disabled={isProcessing || remaining === 0}
                      />
                    </div>
                    {isSelected && (
                      <div className="space-y-2">
                        <Input
                          placeholder="Line reason, e.g. Wrong strength"
                          aria-label={`Reason for returning ${item.medicines?.name || "this item"}`}
                          aria-required="true"
                          aria-invalid={submitAttempted && !returnItem?.reason.trim() ? true : undefined}
                          value={returnItem?.reason || ""}
                          onChange={(e) => handleItemReasonChange(item.id, e.target.value)}
                          className={cn(
                            "h-10",
                            submitAttempted && !returnItem?.reason.trim() && "border-destructive focus-visible:ring-destructive"
                          )}
                          disabled={isProcessing}
                        />
                        <div className="flex items-center gap-2">
                          <Select
                            value={returnItem?.packagingCondition || "opened"}
                            onValueChange={(v) => handlePackagingChange(item.id, v as ReturnItem["packagingCondition"])}
                            disabled={isProcessing}
                          >
                            <SelectTrigger
                              className="h-10 flex-1"
                              aria-label={`Packaging condition for ${item.medicines?.name || "this item"}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="sealed">Sealed</SelectItem>
                              <SelectItem value="opened">Opened</SelectItem>
                              <SelectItem value="damaged">Damaged</SelectItem>
                            </SelectContent>
                          </Select>
                          <span className="num w-24 text-right font-medium">
                            <CurrencyDisplay amount={(returnItem?.totalPrice ?? 0).toFixed(2)} />
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => removeReturnItem(item.id)}
                            disabled={isProcessing}
                            aria-label={`Clear return line for ${item.medicines?.name || "this item"}`}
                          >
                            <X className="h-4 w-4" aria-hidden />
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>

            {/* Tablet and up: the table. */}
            <div className="hidden overflow-x-auto sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">Medicine</TableHead>
                    <TableHead className="w-24 text-right">Sold</TableHead>
                    <TableHead className="w-28 text-right">Return qty</TableHead>
                    <TableHead className="w-28 text-right">Unit price</TableHead>
                    <TableHead className="w-32 text-right">Line total</TableHead>
                    <TableHead className="min-w-[160px]">Line reason *</TableHead>
                    <TableHead className="w-36">Packaging</TableHead>
                    <TableHead className="w-12">
                      <span className="sr-only">Clear</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sale.sale_items.map((item) => {
                    const returnItem = returnItems.find((ri) => ri.saleItemId === item.id)
                    const isSelected = returnItem != null && returnItem.returnQuantity > 0
                    const remaining = remainingReversibleQuantity(item)
                    const back = alreadyReversedQuantity(item)

                    return (
                      <TableRow key={item.id} className={isSelected ? "bg-primary/5" : undefined}>
                        <TableCell>
                          <div className="font-medium">{item.medicines?.name || "Unknown"}</div>
                          <div className="text-muted-foreground text-xs">
                            {item.medicines?.strength} {item.medicines?.form}
                          </div>
                        </TableCell>
                        <TableCell className="num text-right">
                          {item.quantity}
                          {soldQuantityNote(item) ? (
                            <div className="text-muted-foreground text-xs">{soldQuantityNote(item)}</div>
                          ) : null}
                          {back > 0 && (
                            <div className="text-muted-foreground text-xs" title="Already returned or refunded">
                              {back} back
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <ReturnQuantityInput
                            item={item}
                            name={item.medicines?.name || "item"}
                            remaining={remaining}
                            value={returnItem?.returnQuantity ?? 0}
                            unit={returnUnits[item.id] ?? "base"}
                            onUnitChange={(unit) => setReturnUnits((prev) => ({ ...prev, [item.id]: unit }))}
                            onChange={(base) => updateReturnQuantity(item.id, base)}
                            className="ml-auto h-9 w-20"
                            disabled={isProcessing || remaining === 0}
                          />
                        </TableCell>
                        <TableCell className="num text-right">
                          <CurrencyDisplay amount={effectiveUnitPrice({ quantity: item.quantity, lineTotal: item.total_price })} />
                        </TableCell>
                        <TableCell className="num text-right font-medium">
                          {returnItem && returnItem.returnQuantity > 0 ? (
                            <CurrencyDisplay amount={returnItem.totalPrice.toFixed(2)} />
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          {isSelected ? (
                            <Input
                              placeholder="e.g. Wrong strength"
                              aria-label={`Reason for returning ${item.medicines?.name || "this item"}`}
                              aria-required="true"
                              aria-invalid={submitAttempted && !returnItem?.reason.trim() ? true : undefined}
                              value={returnItem?.reason || ""}
                              onChange={(e) => handleItemReasonChange(item.id, e.target.value)}
                              className={cn(
                                "h-9 min-w-[140px]",
                                submitAttempted && !returnItem?.reason.trim() && "border-destructive focus-visible:ring-destructive"
                              )}
                              disabled={isProcessing}
                            />
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isSelected ? (
                            <Select
                              value={returnItem?.packagingCondition || "opened"}
                              onValueChange={(v) =>
                                handlePackagingChange(item.id, v as ReturnItem["packagingCondition"])
                              }
                              disabled={isProcessing}
                            >
                              <SelectTrigger
                                className="h-9 w-32"
                                title="Only sealed/unopened packaging is restocked automatically"
                                aria-label={`Packaging condition for ${item.medicines?.name || "this item"}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="sealed">Sealed</SelectItem>
                                <SelectItem value="opened">Opened</SelectItem>
                                <SelectItem value="damaged">Damaged</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isSelected && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => removeReturnItem(item.id)}
                              disabled={isProcessing}
                              aria-label={`Clear return line for ${item.medicines?.name || "this item"}`}
                            >
                              <X className="h-4 w-4" aria-hidden />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Reason and refund method scroll with the lines, so the sticky footer stays small on phones. */}
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="return-reason">
                General return reason <span className="text-destructive" aria-hidden>*</span>
              </Label>
              <Textarea
                id="return-reason"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="e.g. Customer complaint, damaged goods, dispensing error…"
                rows={3}
                disabled={isProcessing}
                required
                aria-invalid={submitAttempted && !returnReason.trim() ? true : undefined}
                className="min-h-[88px] resize-y"
              />
              <FieldError message={submitAttempted && !returnReason.trim() ? "Enter why the items are coming back." : undefined} />
              {submitAttempted && linesToReturn.some((i) => !i.reason.trim()) && (
                <FieldError message="Each returned line also needs its own reason (highlighted above)." />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="refund-method">Refund method</Label>
              <Select value={refundMethod} onValueChange={setRefundMethod} disabled={isProcessing}>
                <SelectTrigger id="refund-method" className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="original">Original payment method</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="store_credit" disabled={isWalkIn}>
                    Store credit{isWalkIn ? " (needs a customer)" : ""}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Whatever this sale still owes on account is cancelled first; only the rest is paid back this way.
              </p>
            </div>
          </div>
        </div>

        <div className={cn("shrink-0 space-y-3 border-t px-4 py-3 sm:px-6 sm:py-4", inSheet ? "bg-background" : "bg-muted/20")}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="text-muted-foreground text-sm">
              <span className="num text-foreground font-medium">{linesToReturn.length}</span>{" "}
              {linesToReturn.length === 1 ? "line" : "lines"} ·{" "}
              <span className="num text-foreground font-medium">
                {linesToReturn.reduce((s, i) => s + i.returnQuantity, 0)}
              </span>{" "}
              units
            </div>
            <div className="text-right">
              <div className="text-muted-foreground text-xs">Return value</div>
              <div className="num font-display text-xl font-bold text-foreground sm:text-2xl">
                <CurrencyDisplay amount={getTotalReturnAmount().toFixed(2)} />
              </div>
            </div>
          </div>
          {linesToReturn.length > 0 && (
            <>
              <Separator />
              <SettlementBreakdown
                settlement={preview.data}
                isLoading={preview.isFetching}
                error={preview.error}
              />
            </>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onCancel} disabled={isProcessing}>
              Cancel
            </Button>
            <Button
              onClick={handleProcessReturn}
              disabled={linesToReturn.length === 0}
              loading={isProcessing}
              loadingText="Processing return…"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Process return
              {linesToReturn.length > 0 && (
                <>
                  {" · "}
                  <CurrencyDisplay amount={getTotalReturnAmount().toFixed(2)} className="num" />
                </>
              )}
            </Button>
          </div>
        </div>
    </div>
  )
}

type SaleLine = Sale["sale_items"][number]

/**
 * Return quantity for one sale line. A line sold in packs can be returned in packs or in single units; either way
 * the value handed back (and every cap / price) is in BASE units, as the server counts them.
 */
function ReturnQuantityInput({
  item,
  name,
  remaining,
  value,
  unit,
  onUnitChange,
  onChange,
  className,
  disabled,
}: {
  item: SaleLine
  name: string
  remaining: number
  value: number
  unit: SaleUnit
  onUnitChange: (unit: SaleUnit) => void
  onChange: (baseQuantity: number) => void
  className?: string
  disabled?: boolean
}) {
  const units = soldUnitsOf(item)
  const inPacks = unit === "pack" && units != null
  const perPack = inPacks ? units.unitsPerPack : 1
  const label = inPacks ? units.packLabel : (units?.baseLabel ?? "unit")
  const max = inPacks ? wholePacks(remaining, perPack) : remaining
  const shown = inPacks ? wholePacks(value, perPack) : value
  return (
    <div className="flex flex-col items-end gap-1">
      <Input
        type="number"
        inputMode="numeric"
        aria-label={`Return quantity for ${name} in ${pluralizeUnit(label, 2)} (max ${max})`}
        min={0}
        max={max}
        value={shown}
        onChange={(e) => {
          const typed = Number.parseInt(e.target.value, 10) || 0
          onChange(inPacks ? packsToBase(typed, perPack) : typed)
        }}
        className={cn("num text-right", className)}
        disabled={disabled}
      />
      {units ? (
        <Select value={unit} onValueChange={(v) => onUnitChange(v as SaleUnit)} disabled={disabled}>
          <SelectTrigger className="h-8 w-28 text-xs" aria-label={`Return ${name} in`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="base">{pluralizeUnit(units.baseLabel, 2)}</SelectItem>
            <SelectItem value="pack" disabled={remaining < units.unitsPerPack}>
              {pluralizeUnit(units.packLabel, 2)} of {units.unitsPerPack}
            </SelectItem>
          </SelectContent>
        </Select>
      ) : null}
      {inPacks && value > 0 ? (
        <span className="num text-[11px] text-muted-foreground">{formatUnitCount(value, units.baseLabel)}</span>
      ) : null}
    </div>
  )
}
