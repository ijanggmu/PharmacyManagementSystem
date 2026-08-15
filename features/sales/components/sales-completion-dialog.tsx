"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogScrollBody,
  DialogStickyFooter,
  DialogTitle,
  DIALOG_CONTENT_SCROLL_BODY_CLASS,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Receipt, User, ShoppingCart, CheckCircle2, DollarSign, Loader2, Plus, X } from "lucide-react"
import { CurrencyDisplay } from "@/components/currency-display"
import { useState, useEffect } from "react"
import { Customer } from "@/features/customers/api-client"
import { PaymentLeg } from "@/features/sales/types"
import { cn } from "@/lib/utils"

interface CartItem {
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

interface SalesCompletionDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (payments: PaymentLeg[], discountAmount: number, counselingNotes?: string) => void
  cart: CartItem[]
  customer: Customer | null
  subtotal: number
  taxableSubtotal: number
  taxRate: number
  discountAmount: number
  total: number
  isLoading?: boolean
}

const PAYMENT_METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: "cash", label: "💵 Cash" },
  { value: "card", label: "💳 Card" },
  { value: "insurance", label: "🏥 Insurance" },
  { value: "fonepay", label: "📱 Fonepay" },
  { value: "esewa", label: "📲 eSewa" },
  { value: "khalti", label: "📲 Khalti" },
  { value: "bank", label: "🏦 Bank Transfer" },
  { value: "credit", label: "💳 Credit (AR)" },
  { value: "other", label: "💰 Other" },
]

export default function SalesCompletionDialog({
  isOpen,
  onClose,
  onConfirm,
  cart,
  customer,
  subtotal,
  taxableSubtotal,
  taxRate,
  discountAmount: initialDiscountAmount,
  total: initialTotal,
  isLoading = false,
}: SalesCompletionDialogProps) {
  const [discountPercent, setDiscountPercent] = useState(0)
  const [counselingNotes, setCounselingNotes] = useState("")
  const [payments, setPayments] = useState<PaymentLeg[]>([{ method: "cash", amount: initialTotal }])

  useEffect(() => {
    if (isOpen) setCounselingNotes("")
  }, [isOpen])

  useEffect(() => {
    // Convert initial discount amount to percentage
    if (subtotal > 0 && initialDiscountAmount > 0) {
      setDiscountPercent((initialDiscountAmount / subtotal) * 100)
    } else {
      setDiscountPercent(0)
    }
    setPayments([{ method: "cash", amount: initialTotal }])
  }, [initialDiscountAmount, subtotal, initialTotal, isOpen])

  // Tax-inclusive breakdown: selling prices already include tax, so tax is extracted
  // from the taxable portion of the subtotal rather than added on top. The order-level
  // discount is assumed to apply pro-rata across taxable/non-taxable lines.
  const calculatedDiscountAmount = subtotal * (discountPercent / 100)
  const calculatedTotal = subtotal - calculatedDiscountAmount
  const effectiveTaxableBase =
    subtotal > 0 ? taxableSubtotal * (1 - calculatedDiscountAmount / subtotal) : 0
  const calculatedTaxAmount = (effectiveTaxableBase * taxRate) / (1 + taxRate)

  const paymentsTotal = payments.reduce((sum, p) => sum + (Number.isFinite(p.amount) ? p.amount : 0), 0)
  const remaining = calculatedTotal - paymentsTotal
  const isBalanced = Math.abs(remaining) < 0.01 && payments.every((p) => p.amount > 0)

  const updatePayment = (index: number, patch: Partial<PaymentLeg>) => {
    setPayments((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }

  const addPaymentLeg = () => {
    setPayments((prev) => [...prev, { method: "cash", amount: Math.max(0, remaining) }])
  }

  const removePaymentLeg = (index: number) => {
    setPayments((prev) => prev.filter((_, i) => i !== index))
  }

  const handleConfirm = () => {
    onConfirm(payments, calculatedDiscountAmount, counselingNotes)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={DIALOG_CONTENT_SCROLL_BODY_CLASS}>
        <DialogHeader className="shrink-0 px-6 pt-6 pb-3">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Receipt className="h-5 w-5 text-primary" />
            Confirm sale
          </DialogTitle>
          <DialogDescription className="text-sm">
            Review items and totals. You can change the discount or split payment below, then complete the sale.
          </DialogDescription>
        </DialogHeader>

        <DialogScrollBody className="space-y-4 pb-4">
          {/* Customer Information */}
          {customer && (
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
              <div className="p-1.5 bg-primary/10 rounded">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">
                  {customer.first_name} {customer.last_name}
                </p>
                {customer.phone && (
                  <p className="text-xs text-muted-foreground truncate">{customer.phone}</p>
                )}
              </div>
            </div>
          )}

          {/* Items List */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <ShoppingCart className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-sm">Items ({cart.length})</h3>
              </div>
              <div className="max-h-48 overflow-y-auto overflow-x-hidden border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                      <TableHead className="w-[32px]">#</TableHead>
                      <TableHead>Medicine</TableHead>
                      <TableHead className="text-center w-12">Qty</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right w-16">Tax</TableHead>
                      <TableHead className="text-center w-14">Disc %</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cart.map((item, index) => (
                      <TableRow key={item.medicineId}>
                        <TableCell className="text-muted-foreground text-xs">{index + 1}</TableCell>
                        <TableCell>
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{item.medicineName}</div>
                            {(item.strength || item.form) && (
                              <div className="text-xs text-muted-foreground truncate">
                                {item.strength} {item.form}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-xs px-1.5">
                            {item.quantity}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <CurrencyDisplay amount={item.unitPrice} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {item.isTaxable ? (
                            <CurrencyDisplay amount={(item.totalPrice * taxRate) / (1 + taxRate)} />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground">
                          {item.discountPercent ? `${item.discountPercent}%` : "—"}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          <CurrencyDisplay amount={item.totalPrice} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <Card className="bg-muted/50 border-2">
            <CardContent className="p-4">
              <h3 className="font-semibold text-sm mb-3">Order Summary</h3>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span className="font-medium tabular-nums">
                    <CurrencyDisplay amount={subtotal} />
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Tax (included, {(taxRate * 100).toFixed(0)}%):</span>
                  <span className="font-medium tabular-nums">
                    <CurrencyDisplay amount={calculatedTaxAmount} />
                  </span>
                </div>
                {calculatedDiscountAmount > 0 && (
                  <div className="flex justify-between text-xs text-primary">
                    <span>Discount ({discountPercent.toFixed(1)}%):</span>
                    <span className="font-medium tabular-nums">
                      -<CurrencyDisplay amount={calculatedDiscountAmount} />
                    </span>
                  </div>
                )}
                <Separator className="my-2" />
                <div className="flex justify-between items-center">
                  <span className="text-base font-semibold">Total:</span>
                  <span className="text-xl font-bold text-primary tabular-nums">
                    <CurrencyDisplay amount={calculatedTotal} />
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment Details */}
          <Card className="border-2">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-sm">Payment Details</h3>
              </div>

              <div>
                <Label className="text-xs font-medium mb-1.5 block">Discount Percentage</Label>
                <div className="space-y-2">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={discountPercent || ""}
                    onChange={(e) => setDiscountPercent(Number.parseFloat(e.target.value) || 0)}
                    className="h-9 text-sm"
                    placeholder="0"
                  />
                  {discountPercent > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Discount Amount: <CurrencyDisplay amount={calculatedDiscountAmount} />
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Payment method(s)</Label>
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={addPaymentLeg}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Split payment
                  </Button>
                </div>
                <div className="space-y-2">
                  {payments.map((payment, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Select value={payment.method} onValueChange={(v) => updatePayment(index, { method: v })}>
                        <SelectTrigger className="h-9 text-sm flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_METHOD_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={payment.amount === 0 ? "" : payment.amount}
                        onChange={(e) => updatePayment(index, { amount: Number.parseFloat(e.target.value) || 0 })}
                        className="h-9 w-28 text-sm tabular-nums"
                        placeholder="0.00"
                        aria-label={`Amount for payment ${index + 1}`}
                      />
                      {payments.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removePaymentLeg(index)}
                          aria-label="Remove payment"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Remaining-balance indicator */}
                <div className="pt-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full transition-all", isBalanced ? "bg-primary" : "bg-amber-500")}
                      style={{
                        width: `${calculatedTotal > 0 ? Math.min(100, Math.max(0, (paymentsTotal / calculatedTotal) * 100)) : 0}%`,
                      }}
                    />
                  </div>
                  <div
                    className={cn(
                      "mt-1 flex justify-between text-xs",
                      isBalanced ? "text-muted-foreground" : "text-destructive font-medium"
                    )}
                  >
                    <span>{isBalanced ? "Fully covered" : "Remaining"}</span>
                    <span className="tabular-nums">
                      <CurrencyDisplay amount={remaining} />
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="counseling-notes" className="text-xs font-medium mb-1.5 block">
                  Counseling / dispensing notes
                </Label>
                <Textarea
                  id="counseling-notes"
                  value={counselingNotes}
                  onChange={(e) => setCounselingNotes(e.target.value)}
                  placeholder="What was the patient told about dosage, interactions, storage, etc.? (optional, saved on the sale record)"
                  rows={2}
                  className="text-sm resize-y"
                />
              </div>
            </CardContent>
          </Card>
        </DialogScrollBody>

        <DialogStickyFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading} size="sm">
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || !isBalanced}
            title={!isBalanced ? "Payment amounts must add up to the total" : undefined}
            className="min-w-[140px]"
            size="sm"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing…
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Complete sale
              </>
            )}
          </Button>
        </DialogStickyFooter>
      </DialogContent>
    </Dialog>
  )
}
