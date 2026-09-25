"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DIALOG_CONTENT_SCROLL_BODY_CLASS,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Landmark,
  Loader2,
  Plus,
  Shield,
  Smartphone,
  User,
  Wallet,
  X,
} from "lucide-react"
import { CurrencyDisplay } from "@/components/currency-display"
import { useState, useEffect, type ComponentType } from "react"
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

const PAYMENT_METHODS: { value: string; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "card", label: "Card", icon: CreditCard },
  { value: "fonepay", label: "Fonepay", icon: Smartphone },
  { value: "esewa", label: "eSewa", icon: Smartphone },
  { value: "khalti", label: "Khalti", icon: Smartphone },
  { value: "bank", label: "Bank", icon: Landmark },
  { value: "insurance", label: "Insurance", icon: Shield },
  { value: "credit", label: "Credit", icon: CircleDollarSign },
  { value: "other", label: "Other", icon: Wallet },
]

const QUICK_DISCOUNTS = [0, 5, 10]

function money(value: number) {
  return Math.round(value * 100) / 100
}

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
    if (!isOpen) return
    setCounselingNotes("")
  }, [isOpen])

  useEffect(() => {
    if (subtotal > 0 && initialDiscountAmount > 0) {
      setDiscountPercent((initialDiscountAmount / subtotal) * 100)
    } else {
      setDiscountPercent(0)
    }
    setPayments([{ method: "cash", amount: money(initialTotal) }])
  }, [initialDiscountAmount, subtotal, initialTotal, isOpen])

  const calculatedDiscountAmount = subtotal * (discountPercent / 100)
  const calculatedTotal = money(subtotal - calculatedDiscountAmount)
  const effectiveTaxableBase =
    subtotal > 0 ? taxableSubtotal * (1 - calculatedDiscountAmount / subtotal) : 0
  const calculatedTaxAmount = (effectiveTaxableBase * taxRate) / (1 + taxRate)

  const paymentsTotal = payments.reduce((sum, p) => sum + (Number.isFinite(p.amount) ? p.amount : 0), 0)
  const remaining = money(calculatedTotal - paymentsTotal)
  const isBalanced = Math.abs(remaining) < 0.01 && payments.every((p) => p.amount > 0)

  const applyDiscount = (percent: number) => {
    const next = Math.min(100, Math.max(0, percent))
    setDiscountPercent(next)
    const nextTotal = money(subtotal - subtotal * (next / 100))
    setPayments((prev) => (prev.length === 1 ? [{ ...prev[0], amount: nextTotal }] : prev))
  }

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

  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className={cn(
          DIALOG_CONTENT_SCROLL_BODY_CLASS,
          "w-[min(96vw,60rem)] max-h-[min(92dvh,46rem)] sm:max-w-none"
        )}
      >
        <DialogHeader className="shrink-0 gap-1 border-b px-5 py-4 pr-12">
          <DialogTitle className="text-lg font-semibold tracking-tight">Review and pay</DialogTitle>
          <DialogDescription className="text-sm">
            {itemCount} unit{itemCount === 1 ? "" : "s"} across {cart.length} medicine{cart.length === 1 ? "" : "s"}.
            Prices include tax.
            {customer ? ` Customer: ${customer.first_name} ${customer.last_name}${customer.phone ? `, ${customer.phone}` : ""}.` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,0.7fr)_minmax(0,1.3fr)] md:grid-cols-[minmax(0,1.05fr)_minmax(18rem,0.95fr)] md:grid-rows-[minmax(0,1fr)]">
          <section className="flex min-h-0 flex-col border-b md:border-r md:border-b-0" aria-labelledby="sale-items-heading">
            <div className="flex items-center justify-between px-5 pt-3 pb-2">
              <h2 id="sale-items-heading" className="text-sm font-semibold">
                Items
              </h2>
              {customer ? (
                <p className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                  <User className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="truncate">
                    {customer.first_name} {customer.last_name}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Walk-in</p>
              )}
            </div>
            <ul className="min-h-0 flex-1 divide-y overflow-y-auto overscroll-contain px-5">
              {cart.map((item) => (
                <li key={item.medicineId} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.medicineName}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {[item.strength, item.form].filter(Boolean).join(" ") || "No strength listed"}
                      {" · "}
                      Qty {item.quantity}
                      {item.discountPercent ? ` · ${item.discountPercent}% off` : ""}
                      {item.isTaxable ? "" : " · No tax"}
                    </p>
                  </div>
                  <p className="shrink-0 text-right text-sm font-semibold tabular-nums">
                    <CurrencyDisplay amount={item.totalPrice} />
                  </p>
                </li>
              ))}
            </ul>
            <dl className="grid shrink-0 grid-cols-3 gap-2 border-t px-5 py-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="font-medium tabular-nums">
                  <CurrencyDisplay amount={subtotal} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Tax incl. {(taxRate * 100).toFixed(0)}%</dt>
                <dd className="font-medium tabular-nums">
                  <CurrencyDisplay amount={calculatedTaxAmount} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Discount</dt>
                <dd className="font-medium tabular-nums">
                  {calculatedDiscountAmount > 0 ? (
                    <>
                      −<CurrencyDisplay amount={calculatedDiscountAmount} />
                    </>
                  ) : (
                    "None"
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <section className="flex min-h-0 flex-col overflow-hidden px-5 py-4" aria-labelledby="sale-payment-heading">
            <div className="flex items-center justify-between gap-3">
              <h2 id="sale-payment-heading" className="text-sm font-semibold tracking-tight">
                Payment
              </h2>
              <Button type="button" variant="outline" className="min-h-11" onClick={addPaymentLeg}>
                <Plus className="h-4 w-4" aria-hidden />
                Split
              </Button>
            </div>

            <div className="mt-3">
              <Label htmlFor="sale-discount" className="text-sm">
                Discount
              </Label>
              <div className="mt-1.5 flex items-center gap-2">
                {QUICK_DISCOUNTS.map((percent) => {
                  const selected = Math.abs(discountPercent - percent) < 0.05
                  return (
                    <Button
                      key={percent}
                      type="button"
                      variant={selected ? "default" : "outline"}
                      className="min-h-11 min-w-11 px-3"
                      aria-pressed={selected}
                      onClick={() => applyDiscount(percent)}
                    >
                      {percent}%
                    </Button>
                  )
                })}
                <Input
                  id="sale-discount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="100"
                  step="0.1"
                  value={discountPercent || ""}
                  onChange={(e) => applyDiscount(Number.parseFloat(e.target.value) || 0)}
                  className="h-11 w-20 text-base tabular-nums"
                  placeholder="%"
                  aria-label="Custom discount percent"
                />
              </div>
            </div>

            <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain">
              {payments.map((payment, index) => (
                <div key={index} className="space-y-3 rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      {payments.length > 1 ? `Payment ${index + 1}` : "Payment"}
                    </p>
                    {payments.length > 1 ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 min-w-11 text-destructive"
                        onClick={() => removePaymentLeg(index)}
                        aria-label={`Remove payment ${index + 1}`}
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                  <div>
                    <Label htmlFor={`payment-method-${index}`} className="text-sm">
                      Method
                    </Label>
                    <Select
                      value={payment.method}
                      onValueChange={(value) => updatePayment(index, { method: value })}
                    >
                      <SelectTrigger id={`payment-method-${index}`} className="mt-1.5 h-11 w-full text-base">
                        <SelectValue placeholder="Choose a method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>At the counter</SelectLabel>
                          {PAYMENT_METHODS.slice(0, 5).map((method) => {
                            const Icon = method.icon
                            return (
                              <SelectItem key={method.value} value={method.value} className="min-h-11 text-base">
                                <Icon className="h-4 w-4" aria-hidden />
                                {method.label}
                              </SelectItem>
                            )
                          })}
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel>On account</SelectLabel>
                          {PAYMENT_METHODS.slice(5).map((method) => {
                            const Icon = method.icon
                            return (
                              <SelectItem key={method.value} value={method.value} className="min-h-11 text-base">
                                <Icon className="h-4 w-4" aria-hidden />
                                {method.label}
                              </SelectItem>
                            )
                          })}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor={`payment-amount-${index}`} className="text-sm">
                      Amount
                    </Label>
                    <Input
                      id={`payment-amount-${index}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={payment.amount === 0 ? "" : payment.amount}
                      onChange={(e) => updatePayment(index, { amount: Number.parseFloat(e.target.value) || 0 })}
                      className="mt-1.5 h-11 w-full text-base tabular-nums"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              ))}
            </div>

            <p
              className={cn(
                "mt-3 flex shrink-0 items-center justify-between gap-2 text-sm",
                isBalanced ? "text-foreground" : "font-medium text-destructive"
              )}
              role="status"
            >
              <span className="inline-flex items-center gap-1.5">
                {isBalanced ? <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden /> : null}
                {isBalanced ? "Covered" : "Still to collect"}
              </span>
              <span className="tabular-nums">
                <CurrencyDisplay amount={isBalanced ? calculatedTotal : remaining} />
              </span>
            </p>
          </section>
        </div>

        <div className="shrink-0 space-y-3 border-t bg-background px-5 py-3">
          <div>
            <Label htmlFor="counseling-notes" className="text-sm">
              Counseling note
            </Label>
            <Textarea
              id="counseling-notes"
              value={counselingNotes}
              onChange={(e) => setCounselingNotes(e.target.value)}
              placeholder="Dosage, storage, or what the patient was told"
              rows={2}
              className="mt-1.5 resize-none text-base"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Amount due</p>
            <p className="text-2xl font-semibold tabular-nums text-primary">
              <CurrencyDisplay amount={calculatedTotal} />
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              type="button"
              className="min-h-11 min-w-40"
              onClick={handleConfirm}
              disabled={isLoading || !isBalanced}
              title={!isBalanced ? "Payment amounts must add up to the total" : undefined}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                  Processing
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  Complete sale
                </>
              )}
            </Button>
          </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
