"use client"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Receipt, User, CreditCard, ShoppingCart, CheckCircle2, DollarSign } from "lucide-react"
import { CurrencyDisplay } from "@/components/currency-display"
import { useState, useEffect } from "react"

interface CartItem {
  medicineId: string
  medicineName: string
  strength?: string
  form?: string
  quantity: number
  unitPrice: number
  totalPrice: number
}

interface Customer {
  id: string
  first_name: string
  last_name: string
  phone?: string
  email?: string
}

interface SalesCompletionDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (paymentMethod: string, discountAmount: number) => void
  cart: CartItem[]
  customer: Customer | null
  subtotal: number
  taxAmount: number
  discountAmount: number
  total: number
  paymentMethod: string
  isLoading?: boolean
}

export default function SalesCompletionDialog({
  isOpen,
  onClose,
  onConfirm,
  cart,
  customer,
  subtotal,
  taxAmount,
  discountAmount: initialDiscountAmount,
  total: initialTotal,
  paymentMethod: initialPaymentMethod,
  isLoading = false,
}: SalesCompletionDialogProps) {
  const [paymentMethod, setPaymentMethod] = useState(initialPaymentMethod)
  const [discountAmount, setDiscountAmount] = useState(initialDiscountAmount)

  useEffect(() => {
    setPaymentMethod(initialPaymentMethod)
    setDiscountAmount(initialDiscountAmount)
  }, [initialPaymentMethod, initialDiscountAmount, isOpen])

  // Recalculate totals when discount changes
  const taxRate = 0.08
  const calculatedTaxAmount = (subtotal - discountAmount) * taxRate
  const calculatedTotal = subtotal + calculatedTaxAmount - discountAmount
  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case "cash":
        return "Cash"
      case "card":
        return "Card"
      case "insurance":
        return "Insurance"
      case "other":
        return "Other"
      default:
        return method
    }
  }

  const getPaymentMethodIcon = (method: string) => {
    switch (method) {
      case "cash":
        return "💵"
      case "card":
        return "💳"
      case "insurance":
        return "🏥"
      default:
        return "💰"
    }
  }

  const handleConfirm = () => {
    onConfirm(paymentMethod, discountAmount)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-3">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Receipt className="h-5 w-5 text-primary" />
            Review Sale Details
          </DialogTitle>
          <DialogDescription className="text-sm">
            Review and adjust payment details before completing the sale
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
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
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {cart.map((item, index) => (
                  <div key={item.medicineId} className="flex items-start justify-between gap-3 py-2 border-b last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-medium text-muted-foreground">#{index + 1}</span>
                        <p className="font-medium text-sm truncate">{item.medicineName}</p>
                      </div>
                      {(item.strength || item.form) && (
                        <p className="text-xs text-muted-foreground mb-1">
                          {item.strength} {item.form}
                        </p>
                      )}
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs h-5">
                          Qty: {item.quantity}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          @ <CurrencyDisplay amount={item.unitPrice} />
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-sm">
                        <CurrencyDisplay amount={item.totalPrice} />
                      </p>
                    </div>
                  </div>
                ))}
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
                  <span className="font-medium">
                    <CurrencyDisplay amount={subtotal} />
                  </span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-xs text-primary">
                    <span>Discount:</span>
                    <span className="font-medium">
                      -<CurrencyDisplay amount={discountAmount} />
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Tax (8%):</span>
                  <span className="font-medium">
                    <CurrencyDisplay amount={calculatedTaxAmount} />
                  </span>
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between items-center">
                  <span className="text-base font-semibold">Total:</span>
                  <span className="text-xl font-bold text-primary">
                    <CurrencyDisplay amount={calculatedTotal} />
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment Details */}
          <Card className="border-2">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-sm">Payment Details</h3>
              </div>
              
              <div className="space-y-3">
                <div>
                  <Label className="text-xs font-medium mb-1.5 block">Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">💵 Cash</SelectItem>
                      <SelectItem value="card">💳 Card</SelectItem>
                      <SelectItem value="insurance">🏥 Insurance</SelectItem>
                      <SelectItem value="mixed">🔄 Mixed Payment</SelectItem>
                      <SelectItem value="other">💰 Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-medium mb-1.5 block">Discount Amount</Label>
                  <Input
                    type="number"
                    min="0"
                    max={subtotal}
                    step="0.01"
                    value={discountAmount || ""}
                    onChange={(e) => setDiscountAmount(Number.parseFloat(e.target.value) || 0)}
                    className="h-9 text-sm"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-3 border-t">
          <Button variant="outline" onClick={onClose} disabled={isLoading} size="sm">
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading} className="min-w-[130px]" size="sm">
            {isLoading ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Processing...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Complete Sale
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

