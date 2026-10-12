"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Ban, FileText, Phone, Receipt, RefreshCw, User } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import { CurrencyDisplay } from "@/components/currency-display"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { FieldError } from "@/components/ui/field-error"
import { DetailField, DetailFields, DetailSection, DetailSheet } from "@/components/ui/detail-sheet"
import { cn } from "@/lib/utils"
import PrintReceipt from "./print-receipt"
import { useRouter } from "next/navigation"
import { customerReturnHref } from "@/features/returns/lib/returns-view"
import { Sale } from "@/features/sales/api-client"
import { useCancelSale, useSale } from "@/features/sales/hooks/use-sales"
import { useBranchAccess } from "@/features/branches/hooks/use-branch-access"
import { usersApi } from "@/features/users/api-client"
import {
  canReturnSale,
  computeSaleMargin,
  computeSaleTotals,
  formatSaleDate,
  lineDiscount,
  medicineDetail,
  paymentMethodLabel,
} from "@/features/sales/lib/sale-detail"

interface SalesDetailModalProps {
  isOpen: boolean
  onClose: () => void
  sale: Sale | null
  onReturnProcessed?: () => void
}

function money(value: number): string {
  return value.toFixed(2)
}

function TotalRow({
  label,
  value,
  tone,
  prefix,
  hint,
}: {
  label: ReactNode
  value: number
  tone?: "muted" | "success" | "warning"
  prefix?: string
  hint?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={cn("text-muted-foreground", tone === "success" && "text-success", tone === "warning" && "text-warning")}>
        {label}
        {hint && <span className="ml-1 text-xs">{hint}</span>}
      </dt>
      <dd className={cn("num tabular-nums", tone === "success" && "text-success", tone === "warning" && "font-semibold text-warning")}>
        {prefix}
        <CurrencyDisplay amount={money(value)} />
      </dd>
    </div>
  )
}

/**
 * Sale details in the standard right-side panel: invoice header with status badges, a summary card
 * (date, branch, cashier, customer, prescription), the item lines with cost and margin, payment legs and
 * the VAT totals. Print is the primary action in the sticky footer; Return and Cancel sit beside it.
 */
export default function SalesDetailModal({ isOpen, onClose, sale: listSale, onReturnProcessed }: SalesDetailModalProps) {
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false)
  const router = useRouter()
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState("")
  const [cancelTouched, setCancelTouched] = useState(false)
  const cancelSaleMutation = useCancelSale()

  // The list row is shown at once; the detail read refreshes it (status after a cancel, print count).
  const detailQuery = useSale(isOpen && listSale ? listSale.id : "")
  const sale = detailQuery.data?.data?.[0] ?? listSale

  const { branches } = useBranchAccess()
  const cashierId = sale?.cashier_user_id ?? null
  const cashierQuery = useQuery({
    queryKey: ["users", "detail", cashierId],
    queryFn: () => usersApi.getUser(cashierId!),
    enabled: isOpen && Boolean(cashierId),
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  if (!sale) return null

  const isCancelled = sale.status === "cancelled"
  const totals = computeSaleTotals(sale)
  const margin = computeSaleMargin(sale)
  const dates = formatSaleDate(sale.sale_date)
  const branchName = branches.find((b) => b.id === sale.branch_id)?.name ?? null
  const cashierName = cashierQuery.data?.data?.full_name || null
  const customerName = sale.customers ? `${sale.customers.first_name} ${sale.customers.last_name}`.trim() : ""
  const payments = sale.sale_payments ?? []
  const itemCount = sale.sale_items.reduce((sum, item) => sum + item.quantity, 0)

  const canProcessReturn = canReturnSale(sale)
  const canCancel = !isCancelled
  const cancelReasonError = cancelTouched && !cancelReason.trim() ? "Enter why this sale is being cancelled." : undefined

  // Same New customer return page as the Sales list's "Process return"; from a line it starts with that medicine selected.
  const openReturn = (saleItemId: string | null) => {
    onClose()
    router.push(customerReturnHref(sale.id, saleItemId))
  }

  const handleConfirmCancel = () => {
    setCancelTouched(true)
    if (!cancelReason.trim()) return
    cancelSaleMutation.mutate(
      { id: sale.id, reason: cancelReason.trim() },
      {
        onSuccess: () => {
          setIsCancelDialogOpen(false)
          setCancelReason("")
          setCancelTouched(false)
          void detailQuery.refetch()
          onReturnProcessed?.()
        },
      }
    )
  }

  const paymentBadge = isCancelled
    ? { label: "Cancelled", variant: "danger" as const }
    : totals.balanceDue > 0
      ? { label: totals.paid > 0 ? "Partly paid" : "Unpaid", variant: "warning" as const }
      : { label: "Paid", variant: "success" as const }

  return (
    <>
      <DetailSheet
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        size="xl"
        srTitle={`Sale ${sale.sale_number}`}
        title={<span className="num font-mono">{sale.sale_number}</span>}
        badges={
          <>
            <Badge variant={paymentBadge.variant}>{paymentBadge.label}</Badge>
            <Badge variant="outline">{paymentMethodLabel(sale.payment_method)}</Badge>
            {(sale.print_count ?? 0) > 0 && (
              <Badge variant="muted">
                Printed <span className="num ml-1">{sale.print_count}×</span>
              </Badge>
            )}
          </>
        }
        description={
          <>
            {sale.invoice_number ? "Tax invoice" : "Sale (no tax invoice number yet)"}
            {sale.fiscal_year && <span className="num"> · FY {sale.fiscal_year}</span>}
            <span className="num"> · {dates.ad}</span>
          </>
        }
        footer={
          <>
            {canCancel && (
              <Button
                variant="ghost"
                className="mr-auto text-destructive hover:text-destructive"
                onClick={() => setIsCancelDialogOpen(true)}
              >
                <Ban className="h-4 w-4" aria-hidden />
                Cancel sale
              </Button>
            )}
            {canProcessReturn && (
              <Button variant="outline" onClick={() => openReturn(null)}>
                <RefreshCw className="h-4 w-4" aria-hidden />
                Process return
              </Button>
            )}
            <Button onClick={() => setIsPrintModalOpen(true)}>
              <Receipt className="h-4 w-4" aria-hidden />
              Print invoice
            </Button>
          </>
        }
      >
        {isCancelled && (
          <div role="status" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <span className="font-medium text-destructive">Cancelled</span>
            {sale.cancelled_at && <span className="num text-muted-foreground"> · {formatSaleDate(sale.cancelled_at).ad}</span>}
            {sale.cancellation_reason && <p className="mt-1 text-muted-foreground">{sale.cancellation_reason}</p>}
          </div>
        )}

        <DetailFields columns={3}>
          <DetailField label="Date">
            <span className="num">{dates.ad}</span>
            {dates.bs && <span className="num block text-xs text-muted-foreground">{dates.bs}</span>}
          </DetailField>
          <DetailField label="Invoice no." mono>
            {sale.invoice_number}
          </DetailField>
          <DetailField label="Fiscal year" mono>
            {sale.fiscal_year}
          </DetailField>
          <DetailField label="Branch">{branchName}</DetailField>
          <DetailField label="Cashier">
            {cashierQuery.isLoading ? <span className="text-muted-foreground">Loading…</span> : cashierName}
          </DetailField>
          <DetailField label="Prescription">
            {sale.prescription_id ? (
              <Link
                href="/dashboard/prescriptions"
                className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title={sale.prescription_id}
              >
                <FileText className="h-3.5 w-3.5" aria-hidden />
                Linked prescription
              </Link>
            ) : null}
          </DetailField>
        </DetailFields>

        <DetailSection title="Customer">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
              <User className="h-4 w-4 text-muted-foreground" aria-hidden />
            </div>
            <div className="min-w-0">
              {sale.customers ? (
                <>
                  <p className="truncate font-medium">{customerName || "Customer"}</p>
                  {sale.customers.phone && (
                    <p className="num flex items-center gap-1 text-sm text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" aria-hidden />
                      {sale.customers.phone}
                    </p>
                  )}
                </>
              ) : (
                <p className="font-medium text-muted-foreground">Walk-in customer</p>
              )}
            </div>
          </div>
        </DetailSection>

        <DetailSection
          title={
            <>
              Items{" "}
              <span className="num font-normal text-muted-foreground">
                ({sale.sale_items.length} {sale.sale_items.length === 1 ? "line" : "lines"}, {itemCount} units)
              </span>
            </>
          }
        >
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">Medicine</TableHead>
                  <TableHead className="text-right">Qty × price</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead className="text-right">Line total</TableHead>
                  {canProcessReturn && (
                    <TableHead className="w-[1%]">
                      <span className="sr-only">Return</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sale.sale_items.map((item) => {
                  const detail = medicineDetail(item.medicines)
                  const discount = lineDiscount(item)
                  const unitCost = Number.parseFloat(item.unit_cost_price ?? "0")
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-medium">
                          {item.medicines?.name ?? <span className="text-muted-foreground">Unknown medicine</span>}
                        </div>
                        {item.medicines?.generic_name && (
                          <div className="text-xs text-muted-foreground">{item.medicines.generic_name}</div>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {detail && <span>{detail}</span>}
                          {unitCost > 0 && (
                            <span className="num">
                              Cost <CurrencyDisplay amount={money(unitCost)} />
                            </span>
                          )}
                          {item.is_taxable === false && (
                            <Badge variant="outline" className="h-5 px-1.5 text-[11px] font-normal">
                              VAT exempt
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="num whitespace-nowrap text-right">
                        {item.quantity} × <CurrencyDisplay amount={item.unit_price} />
                      </TableCell>
                      <TableCell className="num whitespace-nowrap text-right text-muted-foreground">
                        {discount > 0 ? (
                          <>
                            −<CurrencyDisplay amount={money(discount)} />
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="num whitespace-nowrap text-right font-medium">
                        <CurrencyDisplay amount={item.total_price} />
                      </TableCell>
                      {canProcessReturn && (
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openReturn(item.id)}
                            aria-label={`Return ${item.medicines?.name ?? "this medicine"}`}
                          >
                            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                            Return
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </DetailSection>

        <div className="grid gap-6 md:grid-cols-2">
          <DetailSection title="Payments">
            {payments.length > 0 ? (
              <ul className="divide-y rounded-lg border">
                {payments.map((leg) => (
                  <li key={leg.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{paymentMethodLabel(leg.payment_method)}</p>
                      {leg.reference && (
                        <p className="num truncate text-xs text-muted-foreground" title={leg.reference}>
                          Ref {leg.reference}
                        </p>
                      )}
                    </div>
                    <span className="num shrink-0">
                      <CurrencyDisplay amount={leg.amount} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No payment recorded.</p>
            )}
            {sale.notes && (
              <div className="pt-2">
                <h4 className="text-xs text-muted-foreground">Notes</h4>
                <p className="whitespace-pre-wrap text-sm">{sale.notes}</p>
              </div>
            )}
            {margin && (
              <dl className="space-y-1.5 rounded-lg border bg-muted/30 p-3 text-sm">
                <TotalRow label="Cost of goods" value={margin.cost} />
                <TotalRow label="Revenue (ex VAT)" value={margin.netRevenue} />
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="font-medium">Gross profit</dt>
                  <dd className={cn("num font-semibold tabular-nums", margin.profit < 0 && "text-destructive")}>
                    <CurrencyDisplay amount={money(margin.profit)} />
                    {margin.marginPercent !== null && (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">({margin.marginPercent}%)</span>
                    )}
                  </dd>
                </div>
              </dl>
            )}
          </DetailSection>

          <DetailSection title="Totals">
            <dl className="space-y-1.5 rounded-lg border p-3 text-sm">
              <TotalRow label="Subtotal" value={totals.subtotal} />
              {totals.discount > 0 && <TotalRow label="Discount" value={totals.discount} tone="success" prefix="−" />}
              {totals.taxable !== null && <TotalRow label="Taxable amount" value={totals.taxable} />}
              {(totals.vat > 0 || totals.taxable !== null) && (
                <TotalRow
                  label="VAT"
                  hint={totals.vatRatePercent !== null ? `(${totals.vatRatePercent}%, included)` : "(included)"}
                  value={totals.vat}
                />
              )}
              {totals.exempt !== null && totals.exempt > 0 && <TotalRow label="VAT-exempt sales" value={totals.exempt} />}
              <Separator className="my-2" />
              <div className="flex items-baseline justify-between gap-4">
                <dt className="font-semibold">Total</dt>
                <dd className="num font-display text-2xl font-bold tabular-nums">
                  <CurrencyDisplay amount={money(totals.total)} />
                </dd>
              </div>
              <TotalRow label="Paid" value={totals.paid} />
              {totals.balanceDue > 0 && <TotalRow label="Balance due" value={totals.balanceDue} tone="warning" />}
            </dl>
          </DetailSection>
        </div>
      </DetailSheet>

      <PrintReceipt
        isOpen={isPrintModalOpen}
        onClose={() => {
          setIsPrintModalOpen(false)
          void detailQuery.refetch()
        }}
        saleData={{
          id: sale.id,
          sale_number: sale.sale_number,
          sale_date: sale.sale_date,
          payment_method: sale.payment_method,
          total_amount: sale.total_amount,
          discount_amount: sale.discount_amount,
          tax_amount: sale.tax_amount,
          items: sale.sale_items.map((item) => ({
            medicineId: item.medicine_id,
            medicineName: item.medicines?.name || "Unknown medicine",
            strength: item.medicines?.strength || "",
            form: item.medicines?.form || "",
            quantity: item.quantity,
            unitPrice: Number.parseFloat(item.unit_price),
            totalPrice: Number.parseFloat(item.total_price),
          })),
          customer: sale.customers
            ? {
                id: sale.customers.id || sale.customer_id || "",
                first_name: sale.customers.first_name,
                last_name: sale.customers.last_name,
                phone: sale.customers.phone,
                email: sale.customers.email,
                address: null,
                date_of_birth: null,
                insurance_provider: null,
                insurance_number: null,
                created_at: sale.sale_date,
                prescriptions: [],
                sales: [],
              }
            : null,
          subtotal: totals.subtotal,
          taxAmount: totals.vat,
          total: totals.total,
          staffName: cashierName ?? undefined,
          sale_payments: payments.map((leg) => ({
            payment_method: leg.payment_method,
            amount: leg.amount,
            reference: leg.reference ?? null,
          })),
        }}
      />

      <Dialog
        open={isCancelDialogOpen}
        onOpenChange={(open) => {
          setIsCancelDialogOpen(open)
          if (!open) setCancelTouched(false)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel sale {sale.sale_number}?</DialogTitle>
            <DialogDescription>
              Use this to void a sale rung up by mistake (wrong medicine, wrong customer). It puts every unit back
              into its batch, voids the sale&apos;s accounting entry, and marks the sale cancelled. It can&apos;t be
              undone. It isn&apos;t allowed once the sale is locked for tax reporting or already has a return or
              refund — process a return for what the customer brings back instead.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              handleConfirmCancel()
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="cancel-reason">
                Reason <span className="text-destructive" aria-hidden>*</span>
                <span className="sr-only">(required)</span>
              </Label>
              <Textarea
                id="cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                onBlur={() => setCancelTouched(true)}
                placeholder="e.g. wrong medicine scanned, wrong customer selected"
                rows={3}
                required
                aria-invalid={cancelReasonError ? true : undefined}
                aria-describedby={cancelReasonError ? "cancel-reason-error" : "cancel-reason-hint"}
              />
              {cancelReasonError ? (
                <div id="cancel-reason-error">
                  <FieldError message={cancelReasonError} />
                </div>
              ) : (
                <p id="cancel-reason-hint" className="text-xs text-muted-foreground">
                  Saved on the sale and shown on the audit trail.
                </p>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsCancelDialogOpen(false)}>
                Keep sale
              </Button>
              <Button
                type="submit"
                variant="destructive"
                loading={cancelSaleMutation.isPending}
                loadingText="Cancelling…"
              >
                Cancel sale
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
