"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, CalendarCheck2, CalendarClock, CalendarX2, Download, RefreshCw, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SkeletonTable } from "@/components/ui/skeleton"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { DueBadge } from "@/components/shared/due-badge"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { usePayablesDue } from "@/features/accounting/hooks/use-dues"
import { RecordPaymentDialog, type PaymentPartyPreset } from "@/features/accounting/components/record-payment-dialog"
import { downloadCsv } from "@/features/accounting/lib/csv"
import { formatBsYmd } from "@/features/accounting/lib/date-presets"
import type { PayableDueBill } from "@/lib/api/dues-api"
import type { SupplierOpenBill } from "@/lib/api/suppliers-api"
import { creditTermsLabel } from "@/lib/utils/payment-terms"
import {
  FetchingIndicator,
  MoneyCell,
  QueryState,
  ScrollTable,
  SectionHeading,
  stickyHeaderClass,
} from "@/features/accounting/components/accounting-ui"
import { useAccountingContext } from "../accounting-context"

interface PayablesDueTabProps {
  branchFilterId: string
}

const WINDOWS = [7, 14, 30] as const

/** The bill as the payment dialog's preset (the dialog reloads the supplier's open bills and uses the real row). */
function toBillPreset(bill: PayableDueBill): SupplierOpenBill {
  return {
    ledger_entry_id: bill.ledger_entry_id,
    bill_date: bill.bill_date,
    reference_type: bill.reference_type,
    reference_id: bill.reference_id,
    document_number: bill.document_number,
    supplier_bill_number: bill.supplier_bill_number,
    description: null,
    amount: bill.outstanding,
    paid: 0,
    credited: 0,
    outstanding: bill.outstanding,
    status: "open",
    age_days: bill.age_days,
    branch_id: null,
    due_date: bill.due_date,
    days_overdue: bill.days_overdue,
    is_opening: bill.reference_type === "LedgerEntry",
  }
}

function billLabel(bill: PayableDueBill): string {
  if (bill.reference_type === "LedgerEntry") return "Opening balance"
  return [bill.document_number, bill.supplier_bill_number ? `Bill ${bill.supplier_bill_number}` : null].filter(Boolean).join(" · ") || "Bill"
}

/**
 * Payment scheduling: supplier bills past their due date or due within the window, with totals per supplier and a
 * Pay action. Due dates come from the supplier's credit days (or a date set on the bill); bills from suppliers
 * without terms are counted under "No due date" and listed on the aging instead.
 */
export default function PayablesDueTab({ branchFilterId }: PayablesDueTabProps) {
  const { money } = useAccountingMoney()
  const { rangeStr } = useAccountingContext()
  const branchId = branchFilterId || null
  const [withinDays, setWithinDays] = useState<number>(7)
  const [supplierFilter, setSupplierFilter] = useState<string | null>(null)
  const due = usePayablesDue(rangeStr.to, { withinDays, branchId })

  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentParty, setPaymentParty] = useState<PaymentPartyPreset | null>(null)
  const [paymentBill, setPaymentBill] = useState<SupplierOpenBill | null>(null)

  const suppliers = useMemo(() => due.data?.suppliers ?? [], [due.data])
  const bills = useMemo(
    () => (due.data?.bills ?? []).filter((b) => !supplierFilter || b.supplier_id === supplierFilter),
    [due.data, supplierFilter],
  )
  const windowLabel = withinDays === 7 ? "this week" : `in ${withinDays} days`

  const pay = (party: PaymentPartyPreset, bill: PayableDueBill | null) => {
    setPaymentParty(party)
    setPaymentBill(bill ? toBillPreset(bill) : null)
    setPaymentOpen(true)
  }

  const exportCsv = () => {
    downloadCsv(
      `payables-due-as-of-${rangeStr.to}.csv`,
      ["Due date", "Status", "Days overdue", "Supplier", "Receipt no.", "Supplier bill", "Bill date", "Outstanding"],
      bills.map((b) => [
        b.due_date ?? "",
        b.status,
        b.days_overdue ?? "",
        b.supplier_name,
        b.document_number ?? "",
        b.supplier_bill_number ?? "",
        b.bill_date,
        b.outstanding.toFixed(2),
      ]),
    )
  }

  return (
    <div className="space-y-4">
      <StatGrid cols={4}>
        <StatCard
          label="Overdue"
          value={due.data ? money(due.data.total_overdue) : "—"}
          hint={due.data && due.data.total_overdue > 0 ? "Past the due date — pay these first" : "Nothing past its due date"}
          icon={AlertTriangle}
          tone={due.data && due.data.total_overdue > 0 ? "danger" : "default"}
          loading={due.isLoading}
        />
        <StatCard
          label={`Due ${windowLabel}`}
          value={due.data ? money(due.data.total_due_soon) : "—"}
          hint="Due today or within the window"
          icon={CalendarClock}
          tone="warning"
          loading={due.isLoading}
        />
        <StatCard
          label="Due later"
          value={due.data ? money(due.data.total_later) : "—"}
          hint="Within the payment terms"
          icon={CalendarCheck2}
          tone="success"
          loading={due.isLoading}
        />
        <StatCard
          label="No due date"
          value={due.data ? money(due.data.total_no_due_date) : "—"}
          hint="Suppliers without credit days — set them on the supplier"
          icon={CalendarX2}
          loading={due.isLoading}
        />
      </StatGrid>

      <div className="rounded-xl border bg-card p-4 shadow-xs">
        <SectionHeading
          title="Payables due"
          description={
            <>
              Supplier bills overdue or due {windowLabel}, as of <span className="num">{rangeStr.to || "—"}</span>
              {rangeStr.to ? <> (BS {formatBsYmd(rangeStr.to)})</> : null}. Amounts are what is still owed after payments
              and returns.
            </>
          }
          actions={
            <>
              <FetchingIndicator active={due.isFetching && !due.isLoading} />
              <div className="flex items-center gap-2">
                <Label htmlFor="payables-due-window" className="text-sm font-normal text-muted-foreground">
                  Due within
                </Label>
                <Select value={String(withinDays)} onValueChange={(v) => setWithinDays(Number(v))}>
                  <SelectTrigger id="payables-due-window" className="h-9 w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WINDOWS.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} days
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={exportCsv} disabled={bills.length === 0}>
                <Download aria-hidden />
                CSV
              </Button>
              <Button variant="outline" onClick={() => void due.refetch()} aria-label="Refresh payables due">
                <RefreshCw aria-hidden />
              </Button>
            </>
          }
        />

        <div className="mt-4">
          <QueryState
            isLoading={due.isLoading}
            error={due.error}
            onRetry={() => void due.refetch()}
            retrying={due.isFetching}
            errorTitle="Couldn't load payables due"
            skeleton={<SkeletonTable rows={5} cols={6} />}
            isEmpty={suppliers.length === 0}
            empty={{
              icon: CalendarCheck2,
              title: "Nothing due",
              description: `No supplier bill is overdue or due ${windowLabel}.`,
            }}
          >
            <h3 className="mb-2 text-sm font-semibold">By supplier</h3>
            <ScrollTable maxHeight="max-h-[40vh]" label="Payables due by supplier">
              <TableHeader className={stickyHeaderClass}>
                <TableRow>
                  <TableHead className="min-w-[180px]">Supplier</TableHead>
                  <TableHead>Terms</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                  <TableHead className="text-right">Due {windowLabel}</TableHead>
                  <TableHead>Earliest due</TableHead>
                  <TableHead className="text-right">All open</TableHead>
                  <TableHead className="w-24">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((s) => {
                  const selected = supplierFilter === s.supplier_id
                  return (
                    <TableRow key={s.supplier_id} data-state={selected ? "selected" : undefined}>
                      <TableCell className="max-w-[260px] font-medium">
                        <button
                          type="button"
                          className="max-w-full truncate rounded-sm text-left underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => setSupplierFilter(selected ? null : s.supplier_id)}
                          aria-pressed={selected}
                          title={selected ? "Show every supplier's bills" : "Show only this supplier's bills"}
                        >
                          {s.supplier_name}
                        </button>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{creditTermsLabel(s.credit_days)}</TableCell>
                      <TableCell className="text-right">
                        <span className="num font-semibold text-destructive">{s.overdue > 0 ? money(s.overdue) : ""}</span>
                        {s.overdue_bill_count > 0 && (
                          <span className="block text-xs text-muted-foreground">
                            {s.overdue_bill_count} {s.overdue_bill_count === 1 ? "bill" : "bills"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="num text-warning">{s.due_soon > 0 ? money(s.due_soon) : ""}</span>
                        {s.due_soon_bill_count > 0 && (
                          <span className="block text-xs text-muted-foreground">
                            {s.due_soon_bill_count} {s.due_soon_bill_count === 1 ? "bill" : "bills"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="num whitespace-nowrap text-sm">{s.earliest_due_date ?? "—"}</TableCell>
                      <MoneyCell value={s.total} strong />
                      <TableCell className="py-1.5 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() => pay({ id: s.supplier_id, name: s.supplier_name, outstanding: s.total }, null)}
                          aria-label={`Pay ${s.supplier_name}`}
                        >
                          <Send aria-hidden />
                          Pay
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </ScrollTable>

            <div className="mb-2 mt-5 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                Bills{supplierFilter ? ` — ${suppliers.find((s) => s.supplier_id === supplierFilter)?.supplier_name ?? ""}` : ""}
                <span className="num ml-1 font-normal text-muted-foreground">({bills.length})</span>
              </h3>
              {supplierFilter && (
                <Button variant="ghost" size="sm" onClick={() => setSupplierFilter(null)}>
                  Show all suppliers
                </Button>
              )}
            </div>
            <ScrollTable maxHeight="max-h-[50vh]" label="Bills due">
              <TableHeader className={stickyHeaderClass}>
                <TableRow>
                  <TableHead>Due date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Bill</TableHead>
                  <TableHead>Bill date</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="w-24">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bills.map((b) => (
                  <TableRow key={b.ledger_entry_id}>
                    <TableCell className="whitespace-nowrap">
                      <span className="num block text-sm">{b.due_date ?? "—"}</span>
                      <DueBadge daysOverdue={b.days_overdue} className="mt-1" />
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate font-medium" title={b.supplier_name}>
                      {b.supplier_name}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate font-mono text-xs" title={billLabel(b)}>
                      {billLabel(b)}
                    </TableCell>
                    <TableCell className="num whitespace-nowrap text-sm">{b.bill_date}</TableCell>
                    <MoneyCell value={b.outstanding} strong />
                    <TableCell className="py-1.5 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => pay({ id: b.supplier_id, name: b.supplier_name, outstanding: null }, b)}
                        aria-label={`Pay ${billLabel(b)}: ${money(b.outstanding)} due`}
                      >
                        <Send aria-hidden />
                        Pay
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </ScrollTable>
          </QueryState>
        </div>
      </div>

      <RecordPaymentDialog
        kind="payment"
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        party={paymentParty}
        bill={paymentBill}
        onRecorded={() => void due.refetch()}
      />
    </div>
  )
}
