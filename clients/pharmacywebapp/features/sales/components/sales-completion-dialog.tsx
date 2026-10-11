"use client"

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AlertTriangle, ArrowLeft, CheckCircle2, CircleAlert, Landmark, Lock, Plus, ShieldAlert, Sparkles, Trash2, User, UserX } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { CreditMeter } from "@/features/customers/components/credit-meter"
import { useLoyaltySettings } from "@/features/customers/hooks/use-loyalty-settings"
import { maxRedeemablePoints, pointsValue } from "@/features/customers/lib/loyalty"
import { CurrencyDisplay } from "@/components/currency-display"
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { Customer } from "@/features/customers/api-client"
import { PaymentLeg } from "@/features/sales/types"
import { cn } from "@/lib/utils"
import { useCurrency } from "@/lib/contexts/currency-context"
import { usePaymentSettings } from "@/features/settings/hooks/use-payment-settings"
import { computeInclusiveVat } from "@/features/sales/lib/vat"
import {
  cashNoteSuggestions,
  fromPaisa,
  parseMoneyInput,
  remainingFor,
  roundMoney,
  summarizePayments,
  toPaisa,
  type MoneyLeg,
} from "@/features/sales/components/payment/payment-math"
import {
  PaymentMethodTiles,
  paymentMethodOption,
  type PaymentMethodValue,
} from "@/features/sales/components/payment/payment-method-tiles"
import { FonepayQrPanel, type QrVerification } from "@/features/sales/components/payment/fonepay-qr-panel"
import { QrNotConfiguredHint, StaticQrPanel } from "@/features/sales/components/payment/static-qr-panel"
import { checkoutBlockReason, paymentStatus, taxableSplit, unitCountLabel } from "@/features/sales/components/pos/checkout-math"
import { OrderSummary } from "@/features/sales/components/pos/order-summary"
import { PaymentStatusBar } from "@/features/sales/components/pos/payment-status-bar"

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
  onConfirm: (
    payments: PaymentLeg[],
    discountAmount: number,
    counselingNotes?: string,
    options?: { overrideCreditLimit?: boolean; redeemLoyaltyPoints?: number },
  ) => void
  cart: CartItem[]
  customer: Customer | null
  subtotal: number
  /** VAT rate as a percent (e.g. 13). */
  vatRatePercent: number
  discountAmount: number
  total: number
  isLoading?: boolean
}

interface DraftLeg {
  id: string
  method: PaymentMethodValue | string
  amountText: string
  tenderedText: string
  reference: string
  qr: QrVerification
}

const QUICK_DISCOUNTS = [0, 5, 10]

let legSeq = 0
const newLegId = () => `leg-${++legSeq}`

function moneyText(amount: number): string {
  return amount > 0 ? roundMoney(amount).toFixed(2) : ""
}

/** Keeps digits and a single dot with at most two decimals, so the field can't hold 44.099999. */
function sanitizeMoneyText(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "")
  const [whole, ...rest] = cleaned.split(".")
  if (rest.length === 0) return whole
  return `${whole}.${rest.join("").slice(0, 2)}`
}

function makeLeg(method: string, amount: number): DraftLeg {
  return { id: newLegId(), method, amountText: moneyText(amount), tenderedText: "", reference: "", qr: "idle" }
}

const legAmount = (leg: DraftLeg) => parseMoneyInput(leg.amountText)
const legTendered = (leg: DraftLeg) => (leg.tenderedText.trim() === "" ? undefined : parseMoneyInput(leg.tenderedText))
const isLocked = (leg: DraftLeg) => leg.qr === "pending" || leg.qr === "verified"
const toMoneyLeg = (leg: DraftLeg): MoneyLeg => ({ method: leg.method, amount: legAmount(leg), tendered: legTendered(leg) })

export default function SalesCompletionDialog({
  isOpen,
  onClose,
  onConfirm,
  cart,
  customer,
  subtotal,
  vatRatePercent,
  discountAmount: initialDiscountAmount,
  total: initialTotal,
  isLoading = false,
}: SalesCompletionDialogProps) {
  const { formatCurrency } = useCurrency()
  const [discountPercent, setDiscountPercent] = useState(0)
  const [counselingNotes, setCounselingNotes] = useState("")
  const [legs, setLegs] = useState<DraftLeg[]>(() => [makeLeg("cash", initialTotal)])
  const [focusLegId, setFocusLegId] = useState<string | null>(null)
  const [itemsOpen, setItemsOpen] = useState(true)
  /** Manager approved taking this customer past their credit limit (server re-checks the permission). */
  const [overrideCreditLimit, setOverrideCreditLimit] = useState(false)
  /** Points the member spends on this bill (as a discount). */
  const [redeemText, setRedeemText] = useState("")
  const { settings: loyalty } = useLoyaltySettings()
  const isMember = Boolean(customer?.is_member) && loyalty.enabled
  const memberPercent = isMember ? loyalty.memberDiscountPercent : 0
  const amountRefs = useRef(new Map<string, HTMLInputElement>())
  const heroRef = useRef<HTMLDivElement>(null)

  const settingsQuery = usePaymentSettings({ enabled: isOpen })
  const settings = settingsQuery.data ?? null
  const fonepayDynamic = settings?.fonepayEnabled === true
  const staticQr = settings?.bankQrEnabled === true && Boolean(settings.bankQrImage)

  useEffect(() => {
    if (!isOpen) return
    setCounselingNotes("")
    setOverrideCreditLimit(false)
    setRedeemText("")
    // Items start expanded where there is room (tablet/desktop), collapsed on phones.
    setItemsOpen(typeof window === "undefined" || window.matchMedia("(min-width: 640px)").matches)
  }, [isOpen])

  useEffect(() => {
    // A member's standing discount applies unless the cart already carries a discount.
    const startPercent = subtotal > 0 && initialDiscountAmount > 0 ? (initialDiscountAmount / subtotal) * 100 : memberPercent
    setDiscountPercent(startPercent)
    // The default single cash leg is the exact (paisa-rounded) bill.
    const leg = makeLeg("cash", roundMoney(subtotal - roundMoney(subtotal * (startPercent / 100))))
    setLegs([leg])
    // With a keyboard/mouse, land the cashier in the amount field; on touch keep the keyboard closed.
    if (isOpen && typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches) setFocusLegId(leg.id)
  }, [initialDiscountAmount, subtotal, initialTotal, isOpen, memberPercent])

  useEffect(() => {
    if (!focusLegId) return
    const el = amountRefs.current.get(focusLegId)
    if (el) {
      el.focus()
      el.select()
    }
    setFocusLegId(null)
  }, [focusLegId])

  const percentDiscountAmount = roundMoney(subtotal * (discountPercent / 100))
  // Loyalty redemption: a fixed amount off on top of the percent, never more than held or than the bill.
  const heldPoints = isMember ? (customer?.loyalty_points ?? 0) : 0
  const maxRedeem = maxRedeemablePoints(loyalty, heldPoints, subtotal - percentDiscountAmount)
  const redeemPoints = Math.min(maxRedeem, Math.max(0, Math.floor(Number(redeemText) || 0)))
  const redeemValue = pointsValue(loyalty, redeemPoints)
  const calculatedDiscountAmount = roundMoney(percentDiscountAmount + redeemValue)
  const calculatedTotal = roundMoney(subtotal - calculatedDiscountAmount)
  // VAT is carved out of the taxable lines (prices are VAT-inclusive), matching the server's invoice.
  const calculatedTaxAmount = computeInclusiveVat(cart, vatRatePercent, calculatedDiscountAmount)

  const moneyLegs = useMemo(() => legs.map(toMoneyLeg), [legs])
  const summary = summarizePayments(calculatedTotal, moneyLegs)
  const anyLocked = legs.some(isLocked)
  const hasCredit = legs.some((l) => l.method === "credit")
  const shortTender = legs.some((l) => {
    const t = legTendered(l)
    return l.method === "cash" && t !== undefined && t > 0 && toPaisa(t) < toPaisa(legAmount(l))
  })

  const qrPending = legs.some((l) => l.qr === "pending")
  const qrUnconfirmed = legs.some((l) => (l.qr === "failed" || l.qr === "expired") && !l.reference.trim())
  const blockReason = checkoutBlockReason(
    {
      legCount: legs.length,
      summary,
      hasCredit,
      hasCustomer: Boolean(customer),
      qrPending,
      qrUnconfirmed,
      shortTender,
    },
    (amount) => formatCurrency(amount),
  )
  // Credit account: what this sale puts on account against the customer's limit.
  const creditOnAccount = roundMoney(legs.filter((l) => l.method === "credit").reduce((sum, l) => sum + legAmount(l), 0))
  const accountBalance = customer?.current_balance ?? 0
  const creditLimit = customer?.credit_limit ?? null
  const creditLeft = creditLimit != null ? roundMoney(creditLimit - accountBalance) : null
  const overCreditLimit = creditLeft != null && creditOnAccount > 0 && toPaisa(creditOnAccount) > toPaisa(creditLeft)
  const creditBlockReason =
    overCreditLimit && !overrideCreditLimit
      ? `Only ${formatCurrency(Math.max(0, creditLeft ?? 0))} of credit is left for this customer. Take part of it now, or get a manager's approval.`
      : null
  const status = paymentStatus(summary)
  const split = taxableSplit(cart, calculatedDiscountAmount)
  const redeemBlockReason =
    redeemPoints > 0 && redeemPoints < loyalty.minRedeemPoints ? `Redeem at least ${loyalty.minRedeemPoints} points, or none.` : null
  const completeBlockReason = blockReason ?? creditBlockReason ?? redeemBlockReason
  const canComplete = completeBlockReason === null && !isLoading

  const patchLeg = useCallback((id: string, patch: Partial<DraftLeg>) => {
    setLegs((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }, [])

  const applyDiscount = (percent: number) => {
    if (anyLocked) return
    const next = Math.min(100, Math.max(0, percent))
    setDiscountPercent(next)
    const percentOff = roundMoney(subtotal * (next / 100))
    const redeemOff = pointsValue(loyalty, Math.min(redeemPoints, maxRedeemablePoints(loyalty, heldPoints, subtotal - percentOff)))
    const nextTotal = roundMoney(subtotal - percentOff - redeemOff)
    setLegs((prev) => (prev.length === 1 ? [{ ...prev[0], amountText: moneyText(nextTotal) }] : prev))
  }

  const applyRedeem = (text: string) => {
    if (anyLocked) return
    setRedeemText(text)
    const points = Math.min(maxRedeem, Math.max(0, Math.floor(Number(text) || 0)))
    const nextTotal = roundMoney(subtotal - percentDiscountAmount - pointsValue(loyalty, points))
    setLegs((prev) => (prev.length === 1 ? [{ ...prev[0], amountText: moneyText(nextTotal) }] : prev))
  }

  const changeMethod = (leg: DraftLeg, method: PaymentMethodValue) => {
    if (leg.method === method || isLocked(leg)) return
    patchLeg(leg.id, {
      method,
      qr: "idle",
      reference: "",
      tenderedText: method === "cash" ? leg.tenderedText : "",
    })
  }

  const setLegAmount = (leg: DraftLeg, amount: number) => {
    patchLeg(leg.id, { amountText: moneyText(amount) })
  }

  /** A cash amount above what's due is really cash tendered: keep the leg at the due, show change. */
  const normalizeAmountOnBlur = (leg: DraftLeg, index: number) => {
    const amount = legAmount(leg)
    if (leg.method === "cash") {
      const cap = remainingFor(calculatedTotal, moneyLegs, index)
      if (cap > 0 && toPaisa(amount) > toPaisa(cap)) {
        const tendered = legTendered(leg)
        patchLeg(leg.id, {
          amountText: moneyText(cap),
          tenderedText: tendered === undefined || tendered < amount ? moneyText(amount) : leg.tenderedText,
        })
        return
      }
    }
    patchLeg(leg.id, { amountText: moneyText(amount) })
  }

  const addLeg = () => {
    const used = new Set(legs.map((l) => l.method))
    const method = !used.has("cash") ? "cash" : !used.has("fonepay") ? "fonepay" : "card"
    const leg = makeLeg(method, Math.max(0, fromPaisa(summary.remainingPaisa)))
    setLegs((prev) => [...prev, leg])
    setFocusLegId(leg.id)
  }

  /** Puts what's still unpaid (or the whole bill, when nothing is paid yet) on the customer's account. */
  const putOnAccount = () => {
    if (anyLocked) return
    const credit = legs.find((l) => l.method === "credit")
    if (legs.length === 1 && !credit) {
      setLegs([{ ...legs[0], method: "credit", amountText: moneyText(calculatedTotal), tenderedText: "", reference: "" }])
      setFocusLegId(legs[0].id)
      return
    }
    const remaining = Math.max(0, fromPaisa(summary.remainingPaisa))
    if (credit) {
      patchLeg(credit.id, { amountText: moneyText(legAmount(credit) + remaining) })
      setFocusLegId(credit.id)
      return
    }
    const leg = makeLeg("credit", remaining)
    setLegs((prev) => [...prev, leg])
    setFocusLegId(leg.id)
  }

  const removeLeg = (id: string) => {
    amountRefs.current.delete(id)
    setLegs((prev) => prev.filter((l) => l.id !== id))
  }

  const onQrStatus = useCallback((id: string, status: QrVerification, reference?: string) => {
    setLegs((prev) => {
      let changed = false
      const next = prev.map((l) => {
        if (l.id !== id) return l
        const nextRef = status === "verified" && reference ? reference : l.reference
        if (l.qr === status && l.reference === nextRef) return l
        changed = true
        return { ...l, qr: status, reference: nextRef }
      })
      return changed ? next : prev
    })
  }, [])

  const handleConfirm = () => {
    if (!canComplete) return
    const payments: PaymentLeg[] = legs.map((leg) => {
      const amount = legAmount(leg)
      const tendered = legTendered(leg)
      const reference = leg.method === "cash" ? "" : leg.reference.trim()
      return {
        method: leg.method,
        amount,
        ...(reference ? { reference } : {}),
        ...(leg.method === "cash" && tendered !== undefined && toPaisa(tendered) > toPaisa(amount) ? { tendered } : {}),
      }
    })
    onConfirm(payments, calculatedDiscountAmount, counselingNotes, {
      overrideCreditLimit: overCreditLimit && overrideCreditLimit,
      redeemLoyaltyPoints: redeemPoints,
    })
  }

  const onDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
    const target = event.target as HTMLElement
    if (target.tagName !== "INPUT") return
    event.preventDefault()
    if (canComplete) handleConfirm()
    // Not balanced yet: commit the field (runs its blur normalization) so the summary updates.
    else (target as HTMLInputElement).blur()
  }

  const handleClose = () => {
    if (isLoading) return
    const verified = legs.some((l) => l.qr === "verified")
    const pending = legs.some((l) => l.qr === "pending")
    if (
      (verified || pending) &&
      !window.confirm(
        verified
          ? "A Fonepay payment for this bill was already received. Close without completing the sale?"
          : "A Fonepay QR is waiting for payment. Close and stop checking?",
      )
    ) {
      return
    }
    onClose()
  }

  const customerName = customer ? `${customer.first_name} ${customer.last_name}`.trim() : null
  const itemsLabel = unitCountLabel(cart.map((item) => item.quantity))

  return (
    <Sheet open={isOpen} onOpenChange={(open) => (!open ? handleClose() : undefined)}>
      <SheetContent
        side="right"
        className="w-full gap-0 p-0 sm:max-w-[520px]"
        onKeyDown={onDialogKeyDown}
        onOpenAutoFocus={(event) => {
          // Land on the amount due (read first by screen readers); a fine pointer then moves to the amount field.
          event.preventDefault()
          heroRef.current?.focus()
        }}
      >
        {/* Pinned header: what is owed, for what, by whom */}
        <SheetHeader className="shrink-0 gap-1 border-b px-5 pt-4 pb-4 pr-12">
          <SheetTitle className="text-sm font-medium text-muted-foreground">Review &amp; pay</SheetTitle>
          <div ref={heroRef} tabIndex={-1} className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
            <span className="sr-only">Amount due </span>
            <p className="num font-display text-4xl font-semibold tracking-tight text-foreground">
              <CurrencyDisplay amount={calculatedTotal} />
            </p>
          </div>
          <SheetDescription asChild>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <span className="num">{itemsLabel}</span>
              <span aria-hidden>·</span>
              <span
                className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-0.5 text-foreground"
                title={customerName ? undefined : "Walk-in sale. Choose a customer in the cart to link it."}
              >
                <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">
                  {customerName ? `${customerName}${customer?.phone ? ` · ${customer.phone}` : ""}` : "Walk-in"}
                </span>
              </span>
            </div>
          </SheetDescription>
        </SheetHeader>

        {/* Scrolling body */}
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 py-5">
          <OrderSummary
            items={cart}
            itemsOpen={itemsOpen}
            onItemsOpenChange={setItemsOpen}
            subtotal={subtotal}
            discount={calculatedDiscountAmount}
            vat={calculatedTaxAmount}
            vatRatePercent={vatRatePercent}
            split={split}
            total={calculatedTotal}
          />

          <div>
            <Label htmlFor="sale-discount" className="text-sm font-medium">
              Bill discount
            </Label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div role="group" aria-label="Quick bill discount" className="inline-flex rounded-xl border bg-muted/40 p-1">
                {QUICK_DISCOUNTS.map((percent) => {
                  const selected = Math.abs(discountPercent - percent) < 0.05
                  return (
                    <button
                      key={percent}
                      type="button"
                      aria-pressed={selected}
                      disabled={anyLocked}
                      onClick={() => applyDiscount(percent)}
                      className={cn(
                        "num min-h-10 min-w-12 rounded-lg px-3 text-sm font-medium outline-none transition-colors duration-150 ease-out",
                        "focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
                        selected ? "bg-card text-primary shadow-xs ring-1 ring-primary/40" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {percent}%
                    </button>
                  )
                })}
              </div>
              <div className="relative">
                <Input
                  id="sale-discount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="100"
                  step="0.1"
                  value={discountPercent || ""}
                  disabled={anyLocked}
                  onChange={(e) => applyDiscount(Number.parseFloat(e.target.value) || 0)}
                  className="num h-11 w-24 pr-7 text-right text-base"
                  placeholder="0"
                  aria-label="Custom discount percent"
                />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground" aria-hidden>
                  %
                </span>
              </div>
            </div>
            {memberPercent > 0 && Math.abs(discountPercent - memberPercent) < 0.05 ? (
              <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                <Sparkles className="h-3 w-3" aria-hidden />
                Member discount applied
              </p>
            ) : null}
            {anyLocked ? (
              <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" aria-hidden />
                Locked while a Fonepay QR is active.
              </p>
            ) : null}
          </div>

          {isMember ? (
            <div className="rounded-xl border border-amber-500/25 bg-gradient-to-br from-amber-500/10 via-amber-500/[0.04] to-transparent p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-amber-800 dark:text-amber-200">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                    Loyalty points
                  </p>
                  <p className="num mt-0.5 text-lg font-semibold">
                    {heldPoints.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">pts</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Worth <CurrencyDisplay amount={pointsValue(loyalty, heldPoints)} />
                  </p>
                </div>
                {heldPoints > 0 ? (
                  <div className="flex items-end gap-2">
                    <div>
                      <Label htmlFor="redeem-points" className="text-xs">
                        Redeem
                      </Label>
                      <Input
                        id="redeem-points"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={maxRedeem}
                        step={1}
                        value={redeemText}
                        disabled={anyLocked || maxRedeem === 0}
                        onChange={(e) => applyRedeem(e.target.value)}
                        className="num mt-1 h-10 w-24 text-right"
                        placeholder="0"
                        aria-describedby="redeem-points-hint"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-10"
                      disabled={anyLocked || maxRedeem === 0}
                      onClick={() => applyRedeem(String(maxRedeem))}
                    >
                      Use max
                    </Button>
                  </div>
                ) : null}
              </div>
              <p id="redeem-points-hint" className="mt-2 text-xs text-muted-foreground" aria-live="polite">
                {redeemPoints > 0 ? (
                  <>
                    <span className="font-medium text-foreground">
                      −<CurrencyDisplay amount={redeemValue} />
                    </span>{" "}
                    off this bill for {redeemPoints.toLocaleString()} points.
                  </>
                ) : heldPoints > 0 ? (
                  `Up to ${maxRedeem.toLocaleString()} points can be used on this bill.`
                ) : (
                  "This sale earns points once it's complete."
                )}
              </p>
            </div>
          ) : null}

          <section aria-labelledby="sale-payment-heading" className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="sale-payment-heading" className="text-sm font-semibold">
                Payment
              </h2>
              <p className="num text-xs text-muted-foreground">
                Received <CurrencyDisplay amount={fromPaisa(summary.receivedPaisa)} />
              </p>
            </div>

            {customer ? (
              <div className="rounded-xl border bg-gradient-to-br from-primary/[0.07] via-transparent to-transparent p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <Landmark className="h-3.5 w-3.5" aria-hidden />
                      Credit account
                      {customer.code ? <span className="font-mono normal-case tracking-normal text-primary">· {customer.code}</span> : null}
                    </p>
                    <CreditMeter className="mt-1.5" balance={accountBalance} creditLimit={creditLimit} />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-10 shrink-0"
                    onClick={putOnAccount}
                    disabled={anyLocked || isLoading || (summary.remainingPaisa <= 0 && legs.some((l) => l.method === "credit"))}
                  >
                    Put on account
                  </Button>
                </div>
                {overCreditLimit ? (
                  <div className="mt-3 space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm" role="alert">
                    <p className="flex items-start gap-1.5 font-medium text-destructive">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      <span>
                        <CurrencyDisplay amount={creditOnAccount} /> on credit is more than the{" "}
                        <CurrencyDisplay amount={Math.max(0, creditLeft ?? 0)} /> left on this customer&apos;s limit.
                      </span>
                    </p>
                    <label className="flex cursor-pointer items-center gap-2.5 text-foreground">
                      <Switch checked={overrideCreditLimit} onCheckedChange={setOverrideCreditLimit} aria-describedby="credit-override-hint" />
                      A manager approved going over the limit
                    </label>
                    <p id="credit-override-hint" className="text-xs text-muted-foreground">
                      Needs the &quot;Override customer credit limit&quot; permission; the sale is refused otherwise.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {legs.map((leg, index) => {
              const option = paymentMethodOption(leg.method)
              const amount = legAmount(leg)
              const tendered = legTendered(leg)
              const locked = isLocked(leg)
              const remainingHere = remainingFor(calculatedTotal, moneyLegs, index)
              const legLabel = legs.length > 1 ? `Payment ${index + 1}` : "Payment method"
              const amountId = `payment-amount-${leg.id}`
              const changeHere = tendered !== undefined ? Math.max(0, toPaisa(tendered) - toPaisa(amount)) : 0
              const showReference =
                leg.method !== "cash" && leg.method !== "credit" && !(leg.method === "fonepay" && leg.qr === "verified")
              const referenceId = `payment-ref-${leg.id}`
              const tenderedId = `payment-tendered-${leg.id}`
              const shortHere = tendered !== undefined && tendered > 0 && toPaisa(tendered) < toPaisa(amount)
              const referenceRequired = (leg.qr === "failed" || leg.qr === "expired") && !leg.reference.trim()

              return (
                <div
                  key={leg.id}
                  className={cn(
                    "space-y-4 rounded-xl border bg-card p-4 shadow-xs transition-colors duration-200 ease-out",
                    leg.qr === "verified" && "border-success/40",
                  )}
                >
                  <div className="flex min-h-6 items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {legLabel}
                      {leg.qr === "verified" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                          Verified
                        </span>
                      ) : null}
                    </p>
                    {legs.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="-my-2 -mr-2 min-h-11 min-w-11 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => removeLeg(leg.id)}
                        aria-label={`Remove ${legLabel.toLowerCase()} (${option.label})`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    ) : null}
                  </div>

                  <PaymentMethodTiles
                    value={leg.method}
                    onChange={(m) => changeMethod(leg, m)}
                    label={`${legLabel} method`}
                    disabled={locked}
                  />

                  <div>
                    <Label htmlFor={amountId} className="text-sm">
                      {option.label} amount
                    </Label>
                    <div className="mt-1.5 flex gap-2">
                      <Input
                        id={amountId}
                        ref={(el) => {
                          if (el) amountRefs.current.set(leg.id, el)
                        }}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={leg.amountText}
                        readOnly={locked}
                        aria-readonly={locked || undefined}
                        aria-describedby={locked ? `${amountId}-locked` : undefined}
                        onChange={(e) => patchLeg(leg.id, { amountText: sanitizeMoneyText(e.target.value) })}
                        onBlur={() => normalizeAmountOnBlur(leg, index)}
                        className="num h-11 min-w-0 flex-1 text-right text-base font-semibold"
                        placeholder="0.00"
                      />
                      {!locked ? (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-11 px-3"
                            onClick={() => setLegAmount(leg, remainingHere)}
                            disabled={toPaisa(remainingHere) === toPaisa(amount)}
                            title={`Set to what's left: ${formatCurrency(remainingHere)}`}
                          >
                            Remaining
                          </Button>
                          {legs.length > 1 ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="min-h-11 px-3"
                              onClick={() => setLegAmount(leg, calculatedTotal)}
                              disabled={toPaisa(calculatedTotal) === toPaisa(amount)}
                              title={`Put the whole bill on ${option.label}: ${formatCurrency(calculatedTotal)}`}
                            >
                              Full
                            </Button>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                    {locked ? (
                      <p id={`${amountId}-locked`} className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Lock className="h-3 w-3" aria-hidden />
                        {leg.qr === "verified" ? "Paid through Fonepay." : "Cancel the QR to change the amount."}
                      </p>
                    ) : null}
                  </div>

                  {leg.method === "cash" ? (
                    <div className="space-y-3 rounded-lg bg-muted/40 p-3">
                      <div className="flex items-end gap-3">
                        <div className="min-w-0 flex-1">
                          <Label htmlFor={tenderedId} className="text-sm">
                            Cash received <span className="font-normal text-muted-foreground">(optional)</span>
                          </Label>
                          <Input
                            id={tenderedId}
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            value={leg.tenderedText}
                            onChange={(e) => patchLeg(leg.id, { tenderedText: sanitizeMoneyText(e.target.value) })}
                            onBlur={() => patchLeg(leg.id, { tenderedText: tendered === undefined ? "" : moneyText(tendered) })}
                            className="num mt-1.5 h-11 bg-background text-right text-base"
                            placeholder="Handed over"
                            aria-invalid={shortHere || undefined}
                            aria-describedby={`payment-change-${leg.id}${shortHere ? ` ${tenderedId}-short` : ""}`}
                          />
                        </div>
                        <div className="w-28 shrink-0 pb-1 text-right" id={`payment-change-${leg.id}`}>
                          <p className="text-xs text-muted-foreground">Change</p>
                          <p className={cn("num text-lg font-semibold", changeHere > 0 ? "text-primary" : "text-muted-foreground")}>
                            <CurrencyDisplay amount={fromPaisa(changeHere)} />
                          </p>
                        </div>
                      </div>
                      {amount > 0 ? (
                        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick cash received">
                          {cashNoteSuggestions(amount).map((note, i) => {
                            const selected = tendered !== undefined && toPaisa(tendered) === toPaisa(note)
                            return (
                              <Button
                                key={note}
                                type="button"
                                variant={selected ? "default" : "outline"}
                                size="sm"
                                className="num min-h-11 px-3"
                                aria-pressed={selected}
                                onClick={() => patchLeg(leg.id, { tenderedText: moneyText(note) })}
                              >
                                {i === 0 ? "Exact" : formatCurrency(note, { fractionDigits: 0 })}
                              </Button>
                            )
                          })}
                        </div>
                      ) : null}
                      {shortHere ? (
                        <p id={`${tenderedId}-short`} className="flex items-center gap-1.5 text-xs font-medium text-destructive" role="alert">
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                          {formatCurrency(roundMoney(amount - (tendered ?? 0)))} short of the cash amount.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {leg.method === "fonepay" ? (
                    fonepayDynamic ? (
                      <FonepayQrPanel
                        amount={amount}
                        onStatusChange={(qrStatus, reference) => onQrStatus(leg.id, qrStatus, reference)}
                      />
                    ) : staticQr && settings ? (
                      <StaticQrPanel settings={settings} amount={amount} />
                    ) : settingsQuery.isLoading ? null : (
                      <QrNotConfiguredHint method="Fonepay" />
                    )
                  ) : null}

                  {leg.method === "bank" ? (
                    staticQr && settings ? (
                      <StaticQrPanel settings={settings} amount={amount} />
                    ) : settingsQuery.isLoading ? null : (
                      <QrNotConfiguredHint method="bank" />
                    )
                  ) : null}

                  {leg.method === "credit" && !customer ? (
                    <div className="flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm text-warning" role="alert">
                      <p className="flex items-start gap-1.5">
                        <UserX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        Credit goes on a customer&apos;s account. Go back to the cart, select a customer, then pay again.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-10 self-start bg-background text-foreground"
                        onClick={handleClose}
                        disabled={isLoading}
                      >
                        <ArrowLeft className="h-4 w-4" aria-hidden />
                        Back to cart
                      </Button>
                    </div>
                  ) : null}

                  {showReference ? (
                    <div>
                      <Label htmlFor={referenceId} className="text-sm">
                        {option.referenceLabel ?? "Reference"}{" "}
                        <span className="font-normal text-muted-foreground">
                          {leg.qr === "failed" || leg.qr === "expired" ? "(required to complete)" : "(optional)"}
                        </span>
                      </Label>
                      <Input
                        id={referenceId}
                        value={leg.reference}
                        maxLength={100}
                        autoComplete="off"
                        onChange={(e) => patchLeg(leg.id, { reference: e.target.value })}
                        className="mt-1.5 h-11 text-base"
                        aria-invalid={referenceRequired || undefined}
                        placeholder={
                          leg.method === "bank" || (leg.method === "fonepay" && !fonepayDynamic)
                            ? "Enter transaction ID after the customer pays"
                            : option.referencePlaceholder
                        }
                      />
                    </div>
                  ) : null}
                </div>
              )
            })}

            <Button type="button" variant="outline" className="min-h-11 w-full border-dashed" onClick={addLeg}>
              <Plus className="h-4 w-4" aria-hidden />
              Split payment
              {summary.remainingPaisa > 0 ? (
                <span className="num text-muted-foreground">
                  · <CurrencyDisplay amount={fromPaisa(summary.remainingPaisa)} /> left
                </span>
              ) : null}
            </Button>
          </section>

          <div>
            <Label htmlFor="counseling-notes" className="text-sm font-medium">
              Counseling note <span className="font-normal text-muted-foreground">(optional)</span>
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
        </div>

        {/* Pinned footer: live balance, why it can't complete yet, and the actions */}
        <div className="shrink-0 space-y-3 border-t bg-background px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <PaymentStatusBar status={status} />
          {completeBlockReason ? (
            <p className="flex items-start gap-1.5 text-sm text-muted-foreground" aria-live="polite" id="complete-sale-reason">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
              {completeBlockReason}
            </p>
          ) : (
            <p className="sr-only" aria-live="polite" id="complete-sale-reason">
              Ready. Press Enter to complete.
            </p>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="min-h-12 px-4" onClick={handleClose} disabled={isLoading}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              <span className="hidden min-[400px]:inline">Back to cart</span>
              <span className="min-[400px]:hidden">Back</span>
            </Button>
            <Button
              type="button"
              size="lg"
              className="min-h-12 flex-1 text-base font-semibold"
              onClick={handleConfirm}
              disabled={!canComplete}
              loading={isLoading}
              loadingText="Processing…"
              aria-describedby="complete-sale-reason"
            >
              Complete sale
              <span className="num font-normal opacity-90">
                · <CurrencyDisplay amount={calculatedTotal} />
              </span>
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
