"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DIALOG_CONTENT_MAX_SIZE_CLASS,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { RefreshCw, X, CheckCircle } from "lucide-react"
import { CurrencyDisplay } from "@/components/currency-display"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import type { Sale } from "@/features/sales/api-client"
import { returnsApi } from "@/features/returns/api-client"

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

interface ProcessReturnModalProps {
  isOpen: boolean
  onClose: () => void
  sale: Sale | null
  onSuccess?: () => void
}

export default function ProcessReturnModal({ isOpen, onClose, sale, onSuccess }: ProcessReturnModalProps) {
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([])
  const [returnReason, setReturnReason] = useState("")
  const [refundMethod, setRefundMethod] = useState("original")
  const [isProcessing, setIsProcessing] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (isOpen && sale) {
      setReturnItems([])
      setReturnReason("")
      setRefundMethod("original")
    }
  }, [isOpen, sale?.id])

  const linesToReturn = useMemo(
    () => returnItems.filter((item) => item.returnQuantity > 0),
    [returnItems]
  )

  if (!sale) return null

  const updateReturnQuantity = (saleItemId: string, rawQty: number) => {
    const saleItem = sale.sale_items.find((item) => item.id === saleItemId)
    if (!saleItem) return

    const q = Math.max(0, Math.min(Math.floor(rawQty), saleItem.quantity))
    const unitPrice = Number.parseFloat(saleItem.unit_price)

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
        notes: `Refund method: ${refundMethod}`,
        return_items: linesToReturn.map((item) => ({
          sale_item_id: item.saleItemId,
          quantity_returned: item.returnQuantity,
          reason: item.reason.trim(),
          packaging_condition: item.packagingCondition,
        })),
      })
      if (result.error) throw new Error(result.error)

      toast({
        title: "Return processed",
        description: `${linesToReturn.length} line(s) returned. Refund total: ${totalReturnAmount.toFixed(2)}`,
      })

      onSuccess?.()
      onClose()
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
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isProcessing && onClose()}>
      <DialogContent
        showCloseButton={!isProcessing}
        className={cn(
          DIALOG_CONTENT_MAX_SIZE_CLASS,
          "flex flex-col gap-0 overflow-hidden p-0"
        )}
      >
        <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 pr-8 text-xl">
            <RefreshCw className="h-5 w-5 shrink-0" />
            Process return — {sale.sale_number}
          </DialogTitle>
          <p className="text-muted-foreground text-sm font-normal">
            Sealed/unopened lines are put back into sellable stock; opened, damaged, or controlled-substance lines
            are quarantined (return recorded, stock not restocked). Sales cannot be deleted; use this or{" "}
            <span className="font-medium">Refunds</span> to reverse charges.
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
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
              <div className="font-medium">{new Date(sale.sale_date).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Original total</div>
              <div className="font-medium">
                <CurrencyDisplay amount={sale.total_amount} />
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Payment</div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{sale.payment_method}</Badge>
                <Badge variant="outline">{sale.payment_status}</Badge>
              </div>
            </div>
          </div>

          <div className="rounded-lg border">
            <div className="bg-muted/40 px-4 py-2 text-sm font-medium">Items to return</div>
            <div className="max-h-[min(45vh,480px)] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">Medicine</TableHead>
                    <TableHead className="w-24 text-center">Sold</TableHead>
                    <TableHead className="w-28 text-center">Return qty</TableHead>
                    <TableHead className="w-28 text-right">Unit</TableHead>
                    <TableHead className="w-32 text-right">Line total</TableHead>
                    <TableHead className="min-w-[160px]">Reason (each line)</TableHead>
                    <TableHead className="w-36">Packaging</TableHead>
                    <TableHead className="w-12" />
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
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{item.quantity}</TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            min={0}
                            max={item.quantity}
                            value={returnItem?.returnQuantity ?? 0}
                            onChange={(e) =>
                              updateReturnQuantity(item.id, Number.parseInt(e.target.value, 10) || 0)
                            }
                            className="mx-auto h-9 w-20 text-center"
                            disabled={isProcessing}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <CurrencyDisplay amount={item.unit_price} />
                        </TableCell>
                        <TableCell className="text-right">
                          {returnItem && returnItem.returnQuantity > 0 ? (
                            <CurrencyDisplay amount={returnItem.totalPrice.toFixed(2)} />
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          {isSelected ? (
                            <Input
                              placeholder="Reason for this line…"
                              value={returnItem?.reason || ""}
                              onChange={(e) => handleItemReasonChange(item.id, e.target.value)}
                              className="h-9 min-w-[140px]"
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
                              <SelectTrigger className="h-9 w-32" title="Only sealed/unopened packaging is restocked automatically">
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
                              aria-label="Clear line"
                            >
                              <X className="h-4 w-4" />
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
              <Label htmlFor="return-reason">General return reason *</Label>
              <Textarea
                id="return-reason"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="e.g. Customer complaint, damaged goods, dispensing error…"
                rows={3}
                disabled={isProcessing}
                className="min-h-[88px] resize-y"
              />
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
                  <SelectItem value="store_credit">Store credit</SelectItem>
                </SelectContent>
              </Select>
              <Separator className="my-2" />
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="text-muted-foreground text-sm">
                  <div>
                    Lines: <span className="text-foreground font-medium">{linesToReturn.length}</span>
                  </div>
                  <div>
                    Units:{" "}
                    <span className="text-foreground font-medium">
                      {linesToReturn.reduce((s, i) => s + i.returnQuantity, 0)}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-muted-foreground text-xs">Return value</div>
                  <div className="text-2xl font-bold text-destructive">
                    <CurrencyDisplay amount={getTotalReturnAmount().toFixed(2)} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onClose} disabled={isProcessing}>
              Cancel
            </Button>
            <Button
              onClick={handleProcessReturn}
              disabled={isProcessing || linesToReturn.length === 0}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Processing…
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Process return
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
