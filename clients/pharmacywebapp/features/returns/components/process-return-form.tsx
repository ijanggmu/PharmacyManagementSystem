"use client"

import { useMemo, useState } from "react"
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
import { returnsApi } from "@/features/returns/api-client"
import { paidUnitPrice } from "@/features/returns/lib/paid-price"

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

/** The line the return was started from, pre-filled with one unit; empty when started from the whole sale. */
function initialLines(sale: Sale, saleItemId: string | null | undefined): ReturnItem[] {
  const item = saleItemId ? sale.sale_items.find((i) => i.id === saleItemId) : undefined
  if (!item || item.quantity <= 0) return []
  const unitPrice = paidUnitPrice(item)
  return [
    {
      saleItemId: item.id,
      medicineId: item.medicines?.id || "",
      medicineName: item.medicines?.name || "Unknown Medicine",
      originalQuantity: item.quantity,
      returnQuantity: 1,
      unitPrice,
      totalPrice: unitPrice,
      reason: "",
      packagingCondition: "opened",
    },
  ]
}

interface ProcessReturnFormProps {
  sale: Sale
  /** Leave the page without saving. */
  onCancel: () => void
  /** Called once the return is saved. */
  onSuccess?: () => void
  /** Sale line to start with selected (one unit), e.g. when the return was started from that line. */
  initialSaleItemId?: string | null
}

/**
 * The customer return form for one sale (the New customer return page). Sealed lines are restocked; the refund
 * is paid back on a credit note in the same save.
 */
export default function ProcessReturnForm({ sale, onCancel, onSuccess, initialSaleItemId }: ProcessReturnFormProps) {
  // The page keys this form by sale + starting line, so the initial selection is read once on mount.
  const [returnItems, setReturnItems] = useState<ReturnItem[]>(() => initialLines(sale, initialSaleItemId))
  const [returnReason, setReturnReason] = useState("")
  const [refundMethod, setRefundMethod] = useState("original_payment")
  const [isProcessing, setIsProcessing] = useState(false)
  // Inline errors appear only after the first submit attempt, never while the user is still filling in.
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const { toast } = useToast()

  const linesToReturn = useMemo(
    () => returnItems.filter((item) => item.returnQuantity > 0),
    [returnItems]
  )

  const updateReturnQuantity = (saleItemId: string, rawQty: number) => {
    const saleItem = sale.sale_items.find((item) => item.id === saleItemId)
    if (!saleItem) return

    const q = Math.max(0, Math.min(Math.floor(rawQty), saleItem.quantity))
    // Pays back what the customer paid for each unit (after the line's discount), as the server does.
    const unitPrice = paidUnitPrice(saleItem)

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
        totalPrice: unitPrice * q,
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

  const getTotalReturnAmount = () => linesToReturn.reduce((sum, item) => sum + item.totalPrice, 0)

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
      const totalReturnAmount = getTotalReturnAmount()
      if (!sale.customers?.id) {
        throw new Error("Customer is required to process returns for this sale")
      }
      const result = await returnsApi.createReturn({
        sale_id: sale.id,
        customer_id: sale.customers.id,
        return_date: new Date().toISOString().slice(0, 10),
        status: "completed",
        reason: returnReason.trim(),
        refund_method: refundMethod,
        return_items: linesToReturn.map((item) => ({
          sale_item_id: item.saleItemId,
          quantity_returned: item.returnQuantity,
          reason: item.reason.trim(),
          packaging_condition: item.packagingCondition,
        })),
      })
      if (result.error) throw new Error(result.error)
      const creditNote = result.data?.[0]?.credit_note_number

      toast({
        title: "Return processed",
        description: `${linesToReturn.length} line(s) returned. Refunded ${totalReturnAmount.toFixed(2)}${
          creditNote ? ` on credit note ${creditNote}` : ""
        }.`,
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
    <div className="overflow-hidden rounded-xl border bg-card">
        <div className="px-4 py-4 sm:px-6">
          <div className="mb-4 grid gap-3 rounded-lg border bg-muted/30 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
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
              <span className="text-xs text-muted-foreground">
                Enter a return quantity to include a line. Sealed packs go back on the shelf; opened or damaged ones are written off.
              </span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">Medicine</TableHead>
                    <TableHead className="w-24 text-right">Sold</TableHead>
                    <TableHead className="w-28 text-right">Return qty</TableHead>
                    <TableHead className="w-28 text-right">Paid per unit</TableHead>
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

                    return (
                      <TableRow key={item.id} className={isSelected ? "bg-primary/5" : undefined}>
                        <TableCell>
                          <div className="font-medium">{item.medicines?.name || "Unknown"}</div>
                          <div className="text-muted-foreground text-xs">
                            {item.medicines?.strength} {item.medicines?.form}
                            {item.batch_number ? ` · Batch ${item.batch_number}` : ""}
                          </div>
                        </TableCell>
                        <TableCell className="num text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            inputMode="numeric"
                            aria-label={`Return quantity for ${item.medicines?.name || "item"} (max ${item.quantity})`}
                            min={0}
                            max={item.quantity}
                            value={returnItem?.returnQuantity ?? 0}
                            onChange={(e) =>
                              updateReturnQuantity(item.id, Number.parseInt(e.target.value, 10) || 0)
                            }
                            className="num ml-auto h-9 w-20 text-right"
                            disabled={isProcessing}
                          />
                        </TableCell>
                        <TableCell className="num text-right">
                          <CurrencyDisplay amount={paidUnitPrice(item)} />
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
        </div>

        <div className="shrink-0 space-y-4 border-t bg-muted/20 px-6 py-4">
          <div className="grid gap-4 lg:grid-cols-2">
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
                  <SelectItem value="original_payment">Original payment method</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="store_credit">Store credit</SelectItem>
                </SelectContent>
              </Select>
              <Separator className="my-2" />
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="text-muted-foreground text-sm">
                  <div>
                    Lines: <span className="num text-foreground font-medium">{linesToReturn.length}</span>
                  </div>
                  <div>
                    Units:{" "}
                    <span className="num text-foreground font-medium">
                      {linesToReturn.reduce((s, i) => s + i.returnQuantity, 0)}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-muted-foreground text-xs">Refund to customer (credit note)</div>
                  <div className="num font-display text-2xl font-bold text-foreground">
                    <CurrencyDisplay amount={getTotalReturnAmount().toFixed(2)} />
                  </div>
                </div>
              </div>
            </div>
          </div>

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
