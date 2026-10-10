"use client"

import { useState } from "react"
import Link from "next/link"
import { CheckCircle2, FileText, Send } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { SkeletonTable } from "@/components/ui/skeleton"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { formatBsYmd } from "@/features/accounting/lib/date-presets"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { MoneyCell, QueryState, ScrollTable, stickyHeaderClass } from "@/features/accounting/components/accounting-ui"
import { useSupplierOpenBills } from "@/features/suppliers/hooks/use-supplier-bills"
import type { SupplierBillStatus, SupplierOpenBill } from "@/lib/api/suppliers-api"

const STATUS: Record<SupplierBillStatus, { label: string; variant: "warning" | "info" | "success" }> = {
  open: { label: "Unpaid", variant: "warning" },
  partially_paid: { label: "Part paid", variant: "info" },
  paid: { label: "Paid", variant: "success" },
}

/** Where a bill's source document lives in the app (direct receipts are listed on Purchases → Receipts). */
function documentHref(bill: SupplierOpenBill): string | null {
  if (bill.reference_type === "DirectGoodsReceipt") return "/dashboard/purchases?tab=receipts"
  if (bill.reference_type === "PurchaseOrder") return "/dashboard/purchases"
  return null
}

export function SupplierBillStatusBadge({ status }: { status: SupplierBillStatus }) {
  const s = STATUS[status]
  return <Badge variant={s.variant}>{s.label}</Badge>
}

/**
 * A supplier's bills with paid and outstanding amounts and a "Pay" action per open bill. Payments
 * applied to a bill settle it first; other payments, returns and credits settle the oldest bills.
 */
export function SupplierOpenBillsTable({
  supplierId,
  branchId,
  onPay,
  compact = false,
}: {
  supplierId: string
  branchId?: string | null
  /** Opens the payment dialog for this bill. Omit to hide the Pay action. */
  onPay?: (bill: SupplierOpenBill) => void
  /** Smaller table for the supplier details sheet. */
  compact?: boolean
}) {
  const { money } = useAccountingMoney()
  const [showPaid, setShowPaid] = useState(false)
  const bills = useSupplierOpenBills(supplierId, { onlyOpen: !showPaid, branchId })
  const rows = bills.data?.bills ?? []
  const toggleId = `bills-show-paid-${supplierId}`

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex items-baseline gap-2">
            <dt className="text-muted-foreground">Outstanding</dt>
            <dd className="num font-semibold">{bills.data ? money(bills.data.total_outstanding) : "—"}</dd>
          </div>
          {bills.data && bills.data.unapplied_credit > 0.005 && (
            <div className="flex items-baseline gap-2">
              <dt className="text-muted-foreground">Advance</dt>
              <dd className="num font-semibold text-success">{money(bills.data.unapplied_credit)}</dd>
            </div>
          )}
        </dl>
        <div className="flex items-center gap-2">
          <Switch id={toggleId} checked={showPaid} onCheckedChange={setShowPaid} />
          <Label htmlFor={toggleId} className="text-sm font-normal">
            Show paid bills
          </Label>
        </div>
      </div>

      <QueryState
        isLoading={bills.isLoading}
        error={bills.error}
        onRetry={() => void bills.refetch()}
        retrying={bills.isFetching}
        errorTitle="Couldn't load bills"
        skeleton={<SkeletonTable rows={4} cols={6} />}
        isEmpty={rows.length === 0}
        empty={{
          icon: showPaid ? FileText : CheckCircle2,
          title: showPaid ? "No bills from this supplier" : "No unpaid bills",
          description: showPaid
            ? "Bills appear here once stock is received from this supplier."
            : "Everything billed by this supplier is paid. Turn on “Show paid bills” to see the history.",
        }}
      >
        <ScrollTable maxHeight={compact ? "max-h-[40vh]" : "max-h-[55vh]"} label="Supplier bills">
          <TableHeader className={stickyHeaderClass}>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Receipt no.</TableHead>
              <TableHead>Supplier bill</TableHead>
              {!compact && <TableHead className="text-right">Age</TableHead>}
              <TableHead className="text-right">Amount</TableHead>
              {!compact && <TableHead className="text-right">Paid</TableHead>}
              <TableHead className="text-right">Due</TableHead>
              <TableHead>Status</TableHead>
              {onPay && (
                <TableHead className="w-20">
                  <span className="sr-only">Action</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((bill) => {
              const date = bill.bill_date.slice(0, 10)
              const href = documentHref(bill)
              return (
                <TableRow key={bill.ledger_entry_id}>
                  <TableCell className="whitespace-nowrap">
                    <span className="num block">{date}</span>
                    <span className="num text-xs text-muted-foreground">BS {formatBsYmd(date)}</span>
                  </TableCell>
                  <TableCell className="max-w-[190px] font-mono text-xs">
                    {bill.is_opening ? (
                      <span className="font-sans text-sm text-muted-foreground">Opening balance</span>
                    ) : bill.document_number && href ? (
                      <Link href={href} className="block truncate underline-offset-2 hover:text-primary hover:underline" title={bill.document_number}>
                        {bill.document_number}
                      </Link>
                    ) : (
                      <span className="block truncate" title={bill.document_number ?? bill.description ?? undefined}>
                        {bill.document_number ?? "—"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[140px] truncate text-sm" title={bill.supplier_bill_number ?? undefined}>
                    {bill.supplier_bill_number ?? "—"}
                  </TableCell>
                  {!compact && (
                    <TableCell
                      className={cn(
                        "num whitespace-nowrap text-right text-sm",
                        bill.outstanding > 0.005 && bill.age_days > 90 && "font-semibold text-destructive",
                        bill.outstanding > 0.005 && bill.age_days > 30 && bill.age_days <= 90 && "text-warning",
                      )}
                    >
                      {bill.age_days} d
                    </TableCell>
                  )}
                  <MoneyCell value={bill.amount} />
                  {!compact && <MoneyCell value={bill.paid + bill.credited} blankZero />}
                  <MoneyCell value={bill.outstanding} strong blankZero />
                  <TableCell>
                    <SupplierBillStatusBadge status={bill.status} />
                  </TableCell>
                  {onPay && (
                    <TableCell className="py-1.5 text-right">
                      {bill.outstanding > 0.005 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() => onPay(bill)}
                          aria-label={`Pay ${bill.is_opening ? "opening balance" : bill.document_number ?? "bill"}: ${money(bill.outstanding)} due`}
                        >
                          <Send aria-hidden />
                          Pay
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </ScrollTable>
      </QueryState>
    </div>
  )
}
