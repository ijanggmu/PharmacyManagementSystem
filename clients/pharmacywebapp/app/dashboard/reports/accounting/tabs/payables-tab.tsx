"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Plus, Send, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { suppliersApi } from "@/features/suppliers/api-client"
import { useApAging } from "@/features/accounting/hooks/use-accounting-reports"
import { AgingReport, type AgingRow } from "@/features/accounting/components/aging-report"
import { RecordPaymentDialog, type PaymentPartyPreset } from "@/features/accounting/components/record-payment-dialog"
import { downloadCsv } from "@/features/accounting/lib/csv"
import { SupplierAccountSheet } from "@/features/suppliers/components/bills/supplier-account-sheet"
import type { SupplierOpenBill } from "@/lib/api/suppliers-api"
import { useAccountingContext } from "../accounting-context"

interface DateRange {
  from: Date
  to: Date
}

interface PayablesTabProps {
  dateRange: DateRange | undefined
  branchFilterId: string
}

export default function PayablesTab({ dateRange, branchFilterId }: PayablesTabProps) {
  const { toast } = useToast()
  const { rangeStr } = useAccountingContext()
  const branchId = branchFilterId || undefined

  const aging = useApAging(rangeStr.to, branchId, !!dateRange)
  const agingRows = useMemo<AgingRow[] | undefined>(
    () =>
      aging.data?.rows.map((r, i) => ({
        id: r.supplier_id ?? `supplier-${i}`,
        name: r.supplier_name ?? "Unknown supplier",
        balance: Number(r.balance || 0),
        current: Number(r.current || 0),
        days_31_60: Number(r.days_31_60 || 0),
        days_61_90: Number(r.days_61_90 || 0),
        days_90_plus: Number(r.days_90_plus || 0),
      })),
    [aging.data],
  )

  /** Supplier whose account sheet is open. */
  const [account, setAccount] = useState<{ id: string; name: string } | null>(null)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentParty, setPaymentParty] = useState<PaymentPartyPreset | null>(null)
  const [paymentBill, setPaymentBill] = useState<SupplierOpenBill | null>(null)
  const [exporting, setExporting] = useState(false)

  const agingBalance = (id: string) => agingRows?.find((r) => r.id === id)?.balance ?? null

  const openPayment = (party: PaymentPartyPreset | null, bill: SupplierOpenBill | null = null) => {
    setPaymentParty(party)
    setPaymentBill(bill)
    setPaymentOpen(true)
  }

  const exportStatement = async () => {
    if (!account || !dateRange) return
    setExporting(true)
    try {
      const stmt = await suppliersApi.statement(account.id, rangeStr.from, rangeStr.to, branchId)
      downloadCsv(
        `supplier-statement-${account.name.replace(/[^\w-]+/g, "-")}-${rangeStr.from}-to-${rangeStr.to}.csv`,
        ["Date", "Type", "Receipt no", "Supplier bill no", "Description", "Debit", "Credit", "Balance"],
        stmt.lines.map((l) => [
          l.entry_date,
          l.entry_type,
          l.reference_number,
          l.supplier_bill_number,
          l.description,
          l.debit,
          l.credit,
          l.balance_after ?? "",
        ]),
      )
    } catch (e) {
      toast({ title: "Export failed", description: apiRequestErrorMessage(e), variant: "destructive" })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <AgingReport
        kind="payable"
        rows={agingRows}
        asOf={rangeStr.to}
        isLoading={aging.isLoading}
        isFetching={aging.isFetching}
        error={aging.error}
        onRetry={() => void aging.refetch()}
        selectedId={account?.id}
        onSelect={(r) => !r.id.startsWith("supplier-") && setAccount({ id: r.id, name: r.name })}
        emptyIcon={Wallet}
        rowAction={{
          label: "Pay",
          icon: Send,
          hidden: (r) => r.balance <= 0.005 || r.id.startsWith("supplier-"),
          onClick: (r) => openPayment({ id: r.id, name: r.name, outstanding: r.balance }),
        }}
        actions={
          <>
            <Button variant="ghost" asChild>
              <Link href="/dashboard/suppliers">
                <Plus aria-hidden />
                New supplier
              </Link>
            </Button>
            <Button onClick={() => openPayment(null)}>
              <Send aria-hidden />
              Record supplier payment
            </Button>
          </>
        }
      />

      <SupplierAccountSheet
        supplier={account}
        onOpenChange={(o) => !o && setAccount(null)}
        branchId={branchId}
        period={dateRange ? { from: rangeStr.from, to: rangeStr.to } : null}
        onPayBill={(bill) => account && openPayment({ id: account.id, name: account.name, outstanding: agingBalance(account.id) }, bill)}
        onRecordPayment={() => account && openPayment({ id: account.id, name: account.name, outstanding: agingBalance(account.id) })}
        onExportStatement={() => void exportStatement()}
        exporting={exporting}
      />

      <RecordPaymentDialog
        kind="payment"
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        party={paymentParty}
        bill={paymentBill}
        onRecorded={() => void aging.refetch()}
      />
    </div>
  )
}
