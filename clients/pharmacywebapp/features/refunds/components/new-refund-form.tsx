"use client"

import type React from "react"
import { useState, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Search, RefreshCw, Wallet, Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { CurrencyDisplay } from "@/components/currency-display"
import type { User } from "@/features/users/api-client"
import { useToast } from "@/hooks/use-toast"
import { refundsApi, type CreateRefundData } from "@/features/refunds/api-client"
import { effectiveUnitPrice, includedVat, netRefundAmount, returnLineAmount } from "@/features/returns/lib/return-pricing"
import { SettlementBreakdown, useReversalPreview } from "@/features/returns/components/settlement-preview"
import { createIdempotencyKeyTracker } from "@/lib/api/idempotency"
import { describeSettlement, getSaleOnDotnet } from "@/lib/api/sales-api"
import { invalidateMoneyMovementQueries } from "@/lib/hooks/money-movement-queries"
import { businessDateInstantUtc, nepalYmdOf } from "@/lib/utils/nepal-time"
import { useCurrency } from "@/lib/contexts/currency-context"
import { roundMoneyAwayFromZero } from "@/features/sales/lib/vat"
import { ApprovalDialog } from "@/features/approvals/components/approval-dialog"
import { parseApprovalRequired, type ApprovalRequest } from "@/features/approvals/lib/approval"

interface Sale {
  id: string
  sale_number: string
  total_amount: string
  tax_amount: string
  discount_amount: string
  payment_method: string
  sale_date: string
  /** VAT rate stored on the sale; null on sales recorded before the breakdown was kept. */
  vat_rate_percent?: number | null
  customers: {
    id: string
    first_name: string
    last_name: string
    phone: string
    email: string
  } | null
  sale_items: {
    id: string
    medicine_id: string
    quantity: number
    unit_price: string
    /** Line total after every discount — what the line actually sold for. */
    total_price: string
    is_taxable?: boolean
    medicines: {
      id: string
      name: string
      generic_name: string
      strength: string
      form: string
    } | null
  }[]
}

interface RefundItem {
  saleItemId: string
  medicineId: string
  medicineName: string
  strength: string
  form: string
  originalQuantity: number
  /** Units already returned or refunded on this line (from the sale detail). */
  alreadyReversed: number
  refundQuantity: number
  /** Effective (discounted) unit price — display only. */
  unitPrice: number
  /** The sale line's total after discounts; refunds are priced pro rata to it. */
  lineTotal: number
  isTaxable: boolean
  refundAmount: number
  condition: string
}

interface NewRefundFormProps {
  sales: Sale[]
  currentUser: User | null
  onSuccess?: () => void
}

export default function NewRefundForm({ sales, currentUser, onSuccess }: NewRefundFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(false)

  const [selectedSaleId, setSelectedSaleId] = useState("")
  const [saleSearchOpen, setSaleSearchOpen] = useState(false)
  const [saleSearchQuery, setSaleSearchQuery] = useState("")

  const [refundType, setRefundType] = useState("partial_refund")
  const [refundReason, setRefundReason] = useState("")
  const [refundMethod, setRefundMethod] = useState("original_payment")
  const [processingFee, setProcessingFee] = useState(0)
  const [notes, setNotes] = useState("")

  const [refundItems, setRefundItems] = useState<RefundItem[]>([])
  const { formatCurrency } = useCurrency()

  // One Idempotency-Key per submission, reused when the same refund is retried; it rides through
  // mutate(vars), never through state the mutation callbacks close over.
  const refundKeys = useRef(createIdempotencyKeyTracker())
  const createRefund = useMutation({
    // Throws (rather than returning { error }) so a 403 approval_required can open the approval dialog.
    mutationFn: (vars: { data: CreateRefundData; idempotencyKey: string }) =>
      refundsApi.createRefundOrThrow(vars.data, vars.idempotencyKey),
  })
  /** Set from a 403 approval_required: the exact submission to resend (same key) with the approval token. */
  const [refundApproval, setRefundApproval] = useState<
    (ApprovalRequest & { data: CreateRefundData; idempotencyKey: string }) | null
  >(null)

  const filteredSales = useMemo(() => {
    if (!saleSearchQuery) return sales
    return sales.filter((sale) => {
      const query = saleSearchQuery.toLowerCase()
      return (
        sale.sale_number.toLowerCase().includes(query) ||
        (sale.customers && `${sale.customers.first_name} ${sale.customers.last_name}`.toLowerCase().includes(query))
      )
    })
  }, [sales, saleSearchQuery])

  const selectedSale = sales.find((s) => s.id === selectedSaleId)

  const generateRefundNumber = () => {
    const date = new Date()
    const year = date.getFullYear().toString().slice(-2)
    const month = (date.getMonth() + 1).toString().padStart(2, "0")
    const day = date.getDate().toString().padStart(2, "0")
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0")
    return `REF${year}${month}${day}${random}`
  }

  const handleSaleSelect = (saleId: string) => {
    setSelectedSaleId(saleId)
    const sale = sales.find((s) => s.id === saleId)

    if (sale) {
      // Initialize refund items based on sale items
      const items: RefundItem[] = sale.sale_items.map((item) => {
        const sold = { quantity: item.quantity, lineTotal: item.total_price }
        const refundQuantity = refundType === "full_refund" ? item.quantity : 0
        return {
          saleItemId: item.id,
          medicineId: item.medicine_id,
          medicineName: item.medicines?.name || "Unknown Medicine",
          strength: item.medicines?.strength || "",
          form: item.medicines?.form || "",
          originalQuantity: item.quantity,
          alreadyReversed: 0,
          refundQuantity,
          unitPrice: effectiveUnitPrice(sold),
          lineTotal: Number.parseFloat(item.total_price) || 0,
          isTaxable: item.is_taxable !== false,
          refundAmount: returnLineAmount(sold, refundQuantity),
          condition: "good",
        }
      })

      setRefundItems(items)
      refundKeys.current.reset()

      // Set default refund method based on original payment
      setRefundMethod(sale.payment_method === "cash" ? "cash" : "original_payment")

      // The list row has no returned/refunded quantities; the detail does. Cap each line at what is left.
      void getSaleOnDotnet(saleId)
        .then((detail) => {
          const already = new Map(
            detail.sale_items.map((i) => [i.id, (i.returned_quantity ?? 0) + (i.refunded_quantity ?? 0)] as const)
          )
          setRefundItems((prev) =>
            prev.map((item) => {
              const alreadyReversed = already.get(item.saleItemId) ?? 0
              const refundQuantity = Math.min(item.refundQuantity, Math.max(0, item.originalQuantity - alreadyReversed))
              return {
                ...item,
                alreadyReversed,
                refundQuantity,
                refundAmount: returnLineAmount(
                  { quantity: item.originalQuantity, lineTotal: item.lineTotal },
                  refundQuantity,
                  { quantity: alreadyReversed }
                ),
              }
            })
          )
        })
        .catch(() => {
          // Without the detail the server still enforces the cap; keep the sold quantities.
        })
    }

    setSaleSearchOpen(false)
  }

  const updateRefundQuantity = (itemIndex: number, quantity: number) => {
    setRefundItems((prev) =>
      prev.map((item, index) => {
        if (index === itemIndex) {
          // Never past what is left of the line after earlier returns and refunds.
          const capped = Math.max(0, Math.min(quantity, item.originalQuantity - item.alreadyReversed))
          // Same pricing as the server: the line's discounted total, pro rata to the quantity; the portion
          // that empties the line takes exactly what is left of it.
          const refundAmount = returnLineAmount(
            { quantity: item.originalQuantity, lineTotal: item.lineTotal },
            capped,
            { quantity: item.alreadyReversed }
          )
          return { ...item, refundQuantity: capped, refundAmount }
        }
        return item
      }),
    )
  }

  const updateItemCondition = (itemIndex: number, condition: string) => {
    setRefundItems((prev) =>
      prev.map((item, index) => {
        if (index === itemIndex) {
          return { ...item, condition }
        }
        return item
      }),
    )
  }

  // Prices are VAT-inclusive: the items' amount already contains the VAT, which is shown, never added.
  const subtotalRefund = Math.round(refundItems.reduce((sum, item) => sum + item.refundAmount * 100, 0)) / 100
  const vatIncluded = includedVat(
    refundItems.map((item) => ({ amount: item.refundAmount, isTaxable: item.isTaxable })),
    selectedSale?.vat_rate_percent,
  )
  const netRefund = netRefundAmount(subtotalRefund, processingFee)
  const isWalkIn = !!selectedSale && !selectedSale.customers?.id
  // What completing this refund would pay back, and where (server rule: open balance on account first).
  const preview = useReversalPreview(selectedSale?.id, netRefund, refundMethod)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (!selectedSale) {
        throw new Error("Please select a sale to refund")
      }

      if (refundItems.filter((item) => item.refundQuantity > 0).length === 0) {
        throw new Error("Please select at least one item to refund")
      }

      if (!refundReason) {
        throw new Error("Please provide a refund reason")
      }

      const refundItemsToInsert = refundItems
        .filter((item) => item.refundQuantity > 0)
        .map((item) => ({
          sale_item_id: item.saleItemId,
          quantity_refunded: item.refundQuantity,
        }))

      const data: CreateRefundData = {
        sale_id: selectedSale.id,
        // Walk-in sales have no customer; the server accepts a refund without one.
        customer_id: selectedSale.customers?.id ?? "",
        // Today in Nepal, as the business-date instant the server stores (not the browser's UTC date).
        refund_date: businessDateInstantUtc(nepalYmdOf()),
        status: "pending",
        reason: refundReason,
        notes: notes || undefined,
        processing_fee: roundMoneyAwayFromZero(processingFee),
        refund_type: refundType,
        refund_method: refundMethod,
        refund_items: refundItemsToInsert,
      }
      // The date is left out of the fingerprint so a retry across midnight still reuses the key.
      const idempotencyKey = refundKeys.current.keyFor(JSON.stringify({ ...data, refund_date: "" }))
      await submitRefund(data, idempotencyKey)
    } catch (error) {
      reportRefundError(error)
    } finally {
      setLoading(false)
    }
  }

  /** Sends one refund; per-call data goes through mutateAsync(vars). */
  const submitRefund = async (data: CreateRefundData, idempotencyKey: string) => {
    let refund
    try {
      refund = await createRefund.mutateAsync({ data, idempotencyKey })
    } catch (error) {
      // Above the refund approval limit: a manager approves on this screen, then the same refund is resent.
      const approval = parseApprovalRequired(error)
      if (approval) {
        setRefundApproval({ ...approval, data, idempotencyKey })
        return
      }
      throw error
    }
    refundKeys.current.reset()
    invalidateMoneyMovementQueries(queryClient)

    const settlement = refund.settlement ?? preview.data ?? null
    toast({
      title: "Refund recorded",
      description: `Refund ${refund.refund_number} is waiting for approval.${
        settlement ? ` When completed: ${describeSettlement(settlement, (n) => formatCurrency(n))}.` : ""
      }`,
    })

    if (onSuccess) {
      onSuccess()
    } else {
      router.push("/dashboard/returns?view=refunds")
    }
  }

  const reportRefundError = (error: unknown) => {
    console.error("Error creating refund:", error)
    toast({
      title: "Error",
      description: error instanceof Error ? error.message : "Failed to create refund",
      variant: "destructive",
    })
  }

  /** Resends the refused refund (same Idempotency-Key) with the manager's approval token. */
  const resubmitWithApproval = async (token: string) => {
    if (!refundApproval) return
    const { data, idempotencyKey } = refundApproval
    setRefundApproval(null)
    setLoading(true)
    try {
      await submitRefund({ ...data, approval_tokens: [token] }, idempotencyKey)
    } catch (error) {
      reportRefundError(error)
    } finally {
      setLoading(false)
    }
  }

  const isPage = !onSuccess
  const selectedLineCount = refundItems.filter((item) => item.refundQuantity > 0).length
  const customerLabel = (sale: Sale) =>
    sale.customers ? `${sale.customers.first_name} ${sale.customers.last_name}`.trim() : "Walk-in customer"
  const required = (
    <span className="text-destructive" aria-hidden>
      {" "}
      *
    </span>
  )

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-6", isPage && selectedSale && "pb-24")}>
      <ApprovalDialog
        request={refundApproval}
        onCancel={() => setRefundApproval(null)}
        onApproved={(token) => void resubmitWithApproval(token)}
      />
      <p className="text-sm text-muted-foreground">
        Fields marked <span className="text-destructive">*</span> are required.
      </p>

      {/* Sale Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
            Original sale
          </CardTitle>
          <CardDescription>Find the sale by its number or the customer&apos;s name.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="refund-sale">Sale{required}</Label>
            <Popover open={saleSearchOpen} onOpenChange={setSaleSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="refund-sale"
                  variant="outline"
                  role="combobox"
                  aria-expanded={saleSearchOpen}
                  className="h-10 w-full justify-between bg-transparent font-normal"
                >
                  {selectedSale ? (
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="num truncate">{selectedSale.sale_number}</span>
                      <Badge variant="muted" className="num">
                        <CurrencyDisplay amount={selectedSale.total_amount} />
                      </Badge>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Select a sale to refund</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="Search by sale # or customer…"
                    value={saleSearchQuery}
                    onValueChange={setSaleSearchQuery}
                  />
                  <CommandEmpty>No matching sale. Only recent paid sales are listed.</CommandEmpty>
                  <CommandGroup>
                    <CommandList className="max-h-64">
                      {filteredSales.map((sale) => (
                        <CommandItem
                          key={sale.id}
                          value={`${sale.sale_number} ${sale.customers?.first_name || ""} ${sale.customers?.last_name || ""}`}
                          onSelect={() => handleSaleSelect(sale.id)}
                        >
                          <Check
                            className={cn("mr-2 h-4 w-4", selectedSaleId === sale.id ? "opacity-100" : "opacity-0")}
                            aria-hidden
                          />
                          <div className="flex min-w-0 flex-1 flex-col">
                            <div className="flex items-center justify-between gap-2">
                              <span className="num font-medium">{sale.sale_number}</span>
                              <span className="num text-xs">
                                <CurrencyDisplay amount={sale.total_amount} />
                              </span>
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {customerLabel(sale)} · {new Date(sale.sale_date).toLocaleDateString()}
                            </div>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandList>
                  </CommandGroup>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {selectedSale && (
            <dl className="grid grid-cols-1 gap-3 rounded-lg border bg-muted/40 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Customer</dt>
                <dd className="font-medium">{customerLabel(selectedSale)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Sale date</dt>
                <dd className="num font-medium">{new Date(selectedSale.sale_date).toLocaleDateString()}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Paid by</dt>
                <dd className="font-medium capitalize">{selectedSale.payment_method.replace(/_/g, " ")}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Sale total</dt>
                <dd className="num font-medium">
                  <CurrencyDisplay amount={selectedSale.total_amount} />
                </dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      {/* Refund Details */}
      {selectedSale && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <RefreshCw className="h-4 w-4 text-muted-foreground" aria-hidden />
              Refund details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="refund-type">Refund type</Label>
                <Select value={refundType} onValueChange={setRefundType}>
                  <SelectTrigger id="refund-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_refund">Full refund</SelectItem>
                    <SelectItem value="partial_refund">Partial refund</SelectItem>
                    <SelectItem value="exchange">Exchange</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="refund-reason">Refund reason{required}</Label>
                <Select value={refundReason} onValueChange={setRefundReason}>
                  <SelectTrigger id="refund-reason" aria-required="true">
                    <SelectValue placeholder="Select reason" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="defective_product">Defective product</SelectItem>
                    <SelectItem value="wrong_medication">Wrong medication</SelectItem>
                    <SelectItem value="customer_dissatisfaction">Customer dissatisfaction</SelectItem>
                    <SelectItem value="expired_product">Expired product</SelectItem>
                    <SelectItem value="doctor_change">Doctor changed prescription</SelectItem>
                    <SelectItem value="duplicate_purchase">Duplicate purchase</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="refund-method">Refund method</Label>
                <Select value={refundMethod} onValueChange={setRefundMethod}>
                  <SelectTrigger id="refund-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="original_payment">Original payment method</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="store_credit" disabled={isWalkIn}>
                      Store credit{isWalkIn ? " (needs a customer)" : ""}
                    </SelectItem>
                    <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="refund-fee">Processing fee</Label>
                <Input
                  id="refund-fee"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={processingFee}
                  onChange={(e) => setProcessingFee(Math.max(0, roundMoneyAwayFromZero(Number.parseFloat(e.target.value) || 0)))}
                  placeholder="0.00"
                  className="num text-right"
                  aria-describedby="refund-fee-help"
                />
                <p id="refund-fee-help" className="text-xs text-muted-foreground">
                  Deducted from the amount paid back. Leave at 0 if none.
                </p>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="refund-notes">Notes</Label>
                <Textarea
                  id="refund-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Anything the approver should know"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Items to Refund */}
      {selectedSale && refundItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4 text-muted-foreground" aria-hidden />
              Items to refund{required}
            </CardTitle>
            <CardDescription>
              Set a refund quantity above 0 for each item the customer is being paid back for.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {refundItems.map((item, index) => (
                <div
                  key={item.saleItemId}
                  role="group"
                  aria-label={item.medicineName}
                  className={cn(
                    "space-y-3 rounded-lg border p-3 transition-colors sm:p-4",
                    item.refundQuantity > 0 && "border-primary/30 bg-primary/[0.03]"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium" title={item.medicineName}>
                        {item.medicineName}
                      </p>
                      {(item.strength || item.form) && (
                        <p className="text-xs text-muted-foreground">
                          {[item.strength, item.form].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      <p className="num text-xs text-muted-foreground">
                        Sold {item.originalQuantity} × <CurrencyDisplay amount={item.unitPrice} />
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Refund</p>
                      <p className="num font-semibold">
                        <CurrencyDisplay amount={item.refundAmount} />
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor={`refund-qty-${index}`} className="text-xs">
                        Refund quantity
                      </Label>
                      <Input
                        id={`refund-qty-${index}`}
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max={Math.max(0, item.originalQuantity - item.alreadyReversed)}
                        value={item.refundQuantity}
                        onChange={(e) => updateRefundQuantity(index, Number.parseInt(e.target.value) || 0)}
                        className="num text-right"
                        aria-describedby={`refund-qty-help-${index}`}
                      />
                      <p id={`refund-qty-help-${index}`} className="text-xs text-muted-foreground">
                        Up to <span className="num">{Math.max(0, item.originalQuantity - item.alreadyReversed)}</span>
                        {item.alreadyReversed > 0 && (
                          <> ({item.alreadyReversed} already returned/refunded)</>
                        )}
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor={`refund-cond-${index}`} className="text-xs">
                        Item condition
                      </Label>
                      <Select value={item.condition} onValueChange={(value) => updateItemCondition(index, value)}>
                        <SelectTrigger id={`refund-cond-${index}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="good">Good condition</SelectItem>
                          <SelectItem value="damaged">Damaged</SelectItem>
                          <SelectItem value="expired">Expired</SelectItem>
                          <SelectItem value="opened">Opened / used</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-end pb-1">
                      <Badge variant={item.refundQuantity > 0 ? "success" : "muted"}>
                        {item.refundQuantity > 0 ? "Included in refund" : "Not refunding"}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Separator />

            {/* Refund Summary */}
            <dl className="ml-auto max-w-sm space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Items subtotal</dt>
                <dd className="num font-medium">
                  <CurrencyDisplay amount={subtotalRefund} />
                </dd>
              </div>
              {vatIncluded !== null && (
                <div className="flex justify-between gap-4 text-xs">
                  <dt className="text-muted-foreground">Includes VAT</dt>
                  <dd className="num text-muted-foreground">
                    <CurrencyDisplay amount={vatIncluded} />
                  </dd>
                </div>
              )}
              {processingFee > 0 && (
                <div className="flex justify-between gap-4 text-destructive">
                  <dt>Processing fee</dt>
                  <dd className="num font-medium">
                    −<CurrencyDisplay amount={processingFee} />
                  </dd>
                </div>
              )}
              <Separator />
              <div className="flex justify-between gap-4 text-base font-semibold">
                <dt>Net refund to customer</dt>
                <dd className="num">
                  <CurrencyDisplay amount={netRefund} />
                </dd>
              </div>
              {netRefund > 0 && (
                <div className="pt-1">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">When completed</p>
                  <SettlementBreakdown settlement={preview.data} isLoading={preview.isFetching} error={preview.error} />
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      )}

      {/* Submit */}
      {selectedSale && (
        <div
          className={cn(
            "flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end",
            isPage &&
              "sticky bottom-0 z-10 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:mx-0 sm:rounded-lg sm:border sm:px-4"
          )}
        >
          <p className="mr-auto text-sm text-muted-foreground">
            {!refundReason
              ? "Choose a refund reason to continue."
              : selectedLineCount === 0
                ? "Set a refund quantity on at least one item."
                : `${selectedLineCount} ${selectedLineCount === 1 ? "item" : "items"} selected`}
          </p>
          {isPage && (
            <Button type="button" variant="outline" asChild>
              <Link href="/dashboard/returns?view=refunds">Cancel</Link>
            </Button>
          )}
          <Button
            type="submit"
            disabled={!refundReason || selectedLineCount === 0}
            loading={loading}
            loadingText="Creating refund…"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Create refund · <CurrencyDisplay amount={netRefund} className="num" />
          </Button>
        </div>
      )}
    </form>
  )
}
