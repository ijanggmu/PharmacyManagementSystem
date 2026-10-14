"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Ban, HandCoins, Info, ReceiptText, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DetailSheet } from "@/components/ui/detail-sheet"
import { Pagination } from "@/components/ui/pagination"
import { SkeletonTable } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useBranches } from "@/features/branches/hooks/use-branches"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { customersApi } from "@/features/customers/api-client"
import { useArAging } from "@/features/accounting/hooks/use-accounting-reports"
import { AgingReport, type AgingRow } from "@/features/accounting/components/aging-report"
import { RecordPaymentDialog, type PaymentPartyPreset } from "@/features/accounting/components/record-payment-dialog"
import { VoidPaymentDialog, type VoidPaymentTarget } from "@/features/accounting/components/void-payment-dialog"
import { usePaymentVoidPermission } from "@/features/accounting/hooks/use-payment-void-permission"
import { isPaymentVoidEntry, isVoidablePayment } from "@/features/accounting/lib/payment-void"
import { formatBsYmd } from "@/features/accounting/lib/date-presets"
import { MoneyCell, QueryState, ScrollTable, stickyHeaderClass } from "../accounting-ui"
import { useAccountingContext } from "../accounting-context"
import { CustomerOpenDues } from "@/features/customers/components/customer-open-dues"
import { SendDuesReminderButton } from "@/features/sms/components/send-dues-reminder-button"

const LEDGER_PAGE_SIZE = 20
const OPEN_INVOICES_PAGE_SIZE = 10

interface DateRange {
  from: Date
  to: Date
}

interface ReceivablesTabProps {
  dateRange: DateRange | undefined
  branchFilterId: string
}

interface LedgerRow {
  id: string
  entry_date: string
  entry_type: string
  description: string | null
  amount: number
  balance_after: number | null
  /** INV-… / CN-… / RCP-…; null on entries recorded before numbering. */
  reference_number: string | null
  debit: number
  credit: number
  branch_id: string | null
  reference_type: string | null
  is_voided: boolean
}

const LEDGER_TYPE: Record<string, { label: string; variant: "info" | "success" | "warning" | "muted" }> = {
  invoice: { label: "Sale", variant: "info" },
  payment: { label: "Receipt", variant: "success" },
  credit_note: { label: "Credit note", variant: "warning" },
  adjustment: { label: "Adjustment", variant: "muted" },
}

interface OpenInvoice {
  sale_id: string
  sale_date: string
  invoice_number: string | null
  open_amount: number
}

export default function ReceivablesTab({ dateRange, branchFilterId }: ReceivablesTabProps) {
  const { rangeStr, branchName } = useAccountingContext()
  const branchId = branchFilterId || undefined

  const aging = useArAging(rangeStr.to, branchId, !!dateRange)
  const agingRows = useMemo<AgingRow[] | undefined>(
    () =>
      aging.data?.rows.map((r, i) => ({
        id: r.customer_id ?? `walk-in-${i}`,
        name: r.customer_name ?? "Walk-in",
        balance: Number(r.balance || 0),
        current: Number(r.current || 0),
        days_31_60: Number(r.days_31_60 || 0),
        days_61_90: Number(r.days_61_90 || 0),
        days_90_plus: Number(r.days_90_plus || 0),
        due: r.due ?? undefined,
        advance: Number(r.advance || 0),
      })),
    [aging.data],
  )

  const [customerId, setCustomerId] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [receiptParty, setReceiptParty] = useState<PaymentPartyPreset | null>(null)

  const [ledgerPage, setLedgerPage] = useState(1)
  const [ledgerTotalCount, setLedgerTotalCount] = useState(0)
  const [ledgerTotalPages, setLedgerTotalPages] = useState(1)
  const [ledgerRows, setLedgerRows] = useState<LedgerRow[]>([])
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [ledgerError, setLedgerError] = useState<unknown>(null)

  const [openInvoices, setOpenInvoices] = useState<OpenInvoice[]>([])
  const [openInvoicesLoading, setOpenInvoicesLoading] = useState(false)
  const [openInvoicesError, setOpenInvoicesError] = useState<unknown>(null)
  const [openInvoicesPage, setOpenInvoicesPage] = useState(1)
  const [openInvoicesTotalCount, setOpenInvoicesTotalCount] = useState(0)
  const [openInvoicesTotalPages, setOpenInvoicesTotalPages] = useState(1)

  const [reloadTick, setReloadTick] = useState(0)
  const canVoid = usePaymentVoidPermission("receipt")
  const [voiding, setVoiding] = useState<VoidPaymentTarget | null>(null)

  // Only the latest request may write state (a customer switch resets the page, which also fires a
  // load for the previous page; its slower response must not replace the fresh one).
  const invoicesRequest = useRef(0)
  const ledgerRequest = useRef(0)

  const loadOpenInvoices = useCallback(
    async (page: number) => {
      const requestId = ++invoicesRequest.current
      if (!customerId) {
        setOpenInvoices([])
        setOpenInvoicesTotalCount(0)
        setOpenInvoicesTotalPages(1)
        return
      }
      setOpenInvoicesLoading(true)
      setOpenInvoicesError(null)
      try {
        const res = await customersApi.getOpenInvoicesPage(customerId, page, OPEN_INVOICES_PAGE_SIZE, branchId)
        if (requestId !== invoicesRequest.current) return
        if (res.error || !res.data) throw new Error(res.error || "Failed to load open invoices")
        setOpenInvoices(
          res.data.items.map((inv) => ({
            sale_id: inv.sale_id,
            sale_date: String(inv.sale_date).slice(0, 10),
            invoice_number: inv.invoice_number,
            open_amount: Number(inv.open_amount || 0),
          })),
        )
        setOpenInvoicesTotalCount(res.data.totalCount)
        setOpenInvoicesTotalPages(Math.max(1, res.data.totalPages))
      } catch (e) {
        if (requestId !== invoicesRequest.current) return
        setOpenInvoicesError(e)
        setOpenInvoices([])
      } finally {
        if (requestId === invoicesRequest.current) setOpenInvoicesLoading(false)
      }
    },
    [customerId, branchId],
  )

  const loadLedger = useCallback(
    async (page: number) => {
      const requestId = ++ledgerRequest.current
      if (!customerId) {
        setLedgerRows([])
        setLedgerTotalCount(0)
        setLedgerTotalPages(1)
        return
      }
      setLedgerLoading(true)
      setLedgerError(null)
      try {
        const res = await customersApi.getLedgerPage(customerId, page, LEDGER_PAGE_SIZE, branchId)
        if (requestId !== ledgerRequest.current) return
        if (res.error || !res.data) throw new Error(res.error || "Failed to load ledger")
        setLedgerRows(
          res.data.items.map((r) => ({
            id: r.id,
            entry_date: String(r.entry_date).slice(0, 10),
            entry_type: r.entry_type,
            description: r.description ?? null,
            amount: Number(r.amount || 0),
            balance_after: r.balance_after == null ? null : Number(r.balance_after),
            reference_number: r.reference_number ?? null,
            debit: Number(r.debit || 0),
            credit: Number(r.credit || 0),
            branch_id: r.branch_id ?? null,
            reference_type: r.reference_type ?? null,
            is_voided: r.is_voided === true,
          })),
        )
        setLedgerTotalCount(res.data.totalCount)
        setLedgerTotalPages(Math.max(1, res.data.totalPages))
      } catch (e) {
        if (requestId !== ledgerRequest.current) return
        setLedgerError(e)
      } finally {
        if (requestId === ledgerRequest.current) setLedgerLoading(false)
      }
    },
    [customerId, branchId],
  )

  useEffect(() => {
    setLedgerPage(1)
    setOpenInvoicesPage(1)
  }, [customerId, branchId])

  useEffect(() => {
    void loadOpenInvoices(openInvoicesPage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, openInvoicesPage, reloadTick, branchId])

  useEffect(() => {
    void loadLedger(ledgerPage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, ledgerPage, reloadTick, branchId])

  const openReceipt = (party: PaymentPartyPreset | null) => {
    setReceiptParty(party)
    setReceiptOpen(true)
  }

  /** Header action: starts on the customer selected in the aging table, if any. */
  const recordForSelected = () =>
    openReceipt(
      customerId
        ? {
            id: customerId,
            name: customerName,
            outstanding: agingRows?.find((r) => r.id === customerId)?.balance ?? null,
          }
        : null,
    )

  const selectCustomer = (id: string, name: string) => {
    setCustomerId(id)
    setCustomerName(name)
  }

  const branches = useBranches()
  const branchCode = useMemo(() => {
    const map = new Map((branches.data ?? []).map((b) => [b.id, b.code || b.name]))
    return (id: string | null) => (id ? map.get(id) ?? "—" : "—")
  }, [branches.data])
  const showBranch = (branches.data?.length ?? 0) > 1
  const selectedBalance = agingRows?.find((r) => r.id === customerId)?.balance ?? null

  return (
    <div className="space-y-4">
      <AgingReport
        kind="receivable"
        branchName={branchName}
        rows={agingRows}
        asOf={rangeStr.to}
        isLoading={aging.isLoading}
        isFetching={aging.isFetching}
        error={aging.error}
        onRetry={() => void aging.refetch()}
        selectedId={customerId}
        onSelect={(r) => {
          if (r.id.startsWith("walk-in-")) return
          selectCustomer(r.id, r.name)
        }}
        emptyIcon={Users}
        actions={
          <Button onClick={recordForSelected}>
            <HandCoins aria-hidden />
            Record customer payment
          </Button>
        }
        rowAction={{
          label: "Receive",
          icon: HandCoins,
          hidden: (r) => r.id.startsWith("walk-in-") || r.balance <= 0.005,
          onClick: (r) => openReceipt({ id: r.id, name: r.name, outstanding: r.balance }),
        }}
      />

      <RecordPaymentDialog
        kind="receipt"
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        party={receiptParty}
        onRecorded={() => {
          setReloadTick((t) => t + 1)
          void aging.refetch()
        }}
      />

      <VoidPaymentDialog
        kind="receipt"
        partyId={customerId}
        payment={voiding}
        onClose={() => setVoiding(null)}
        onVoided={() => {
          setReloadTick((t) => t + 1)
          void aging.refetch()
        }}
      />

      <DetailSheet
        open={!!customerId}
        onOpenChange={(o) => {
          if (!o) {
            setCustomerId("")
            setCustomerName("")
          }
        }}
        title={customerName || "Customer"}
        description="Sales on credit, receipts and credit notes. Receipts reduce the customer's balance, oldest sales first."
        size="xl"
        badges={
          selectedBalance != null ? (
            <Badge variant={selectedBalance > 0.005 ? "warning" : "success"}>
              {selectedBalance > 0.005 ? "Owes you" : selectedBalance < -0.005 ? "Advance" : "Settled"}
            </Badge>
          ) : null
        }
        footer={
          <>
            {(ledgerError || openInvoicesError) && (
              <Button variant="ghost" onClick={() => setReloadTick((t) => t + 1)}>
                Reload
              </Button>
            )}
            {customerId && selectedBalance != null && selectedBalance > 0.005 && (
              <SendDuesReminderButton customerId={customerId} customerName={customerName} size="default" />
            )}
            <Button onClick={recordForSelected}>
              <HandCoins aria-hidden />
              Record receipt
            </Button>
          </>
        }
      >
        <Tabs defaultValue="ledger" className="gap-4">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="ledger">Ledger</TabsTrigger>
            <TabsTrigger value="open">Open invoices</TabsTrigger>
            <TabsTrigger value="sales">
              Credit sales <span className="num ml-1 text-muted-foreground">({openInvoicesTotalCount})</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="open" className="space-y-2">
            {customerId && <CustomerOpenDues customerId={customerId} asOf={rangeStr.to} branchId={branchId} />}
          </TabsContent>

          <TabsContent value="ledger" className="space-y-2">
            <QueryState
              isLoading={ledgerLoading}
              error={ledgerError}
              onRetry={() => void loadLedger(ledgerPage)}
              skeleton={<SkeletonTable rows={4} cols={6} />}
              isEmpty={ledgerRows.length === 0}
              empty={{
                icon: Users,
                title: "No ledger entries yet",
                description: "Credit sales and receipts for this customer will appear here.",
              }}
            >
              <ScrollTable maxHeight="max-h-[55vh]" label="Customer ledger entries">
                <TableHeader className={stickyHeaderClass}>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Document no.</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    {showBranch && <TableHead>Branch</TableHead>}
                    {canVoid && <TableHead className="w-0"><span className="sr-only">Actions</span></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledgerRows.map((r) => {
                    const type = isPaymentVoidEntry(r.reference_type)
                      ? { label: "Receipt void", variant: "muted" as const }
                      : LEDGER_TYPE[r.entry_type] ?? { label: r.entry_type.replace(/_/g, " "), variant: "muted" as const }
                    return (
                      <TableRow key={r.id} className={r.is_voided ? "text-muted-foreground" : undefined}>
                        <TableCell className="whitespace-nowrap">
                          <span className="num block">{r.entry_date}</span>
                          <span className="num text-xs text-muted-foreground">BS {formatBsYmd(r.entry_date)}</span>
                        </TableCell>
                        <TableCell>
                          <span className="flex flex-wrap items-center gap-1">
                            <Badge variant={type.variant}>{type.label}</Badge>
                            {r.is_voided && <Badge variant="danger">Voided</Badge>}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[200px]" title={r.description || undefined}>
                          {r.reference_number ? (
                            <span className="block truncate font-mono text-xs">{r.reference_number}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <MoneyCell value={r.debit} blankZero />
                        <MoneyCell value={r.credit} blankZero />
                        <MoneyCell value={r.balance_after} strong signed />
                        {showBranch && <TableCell className="text-sm">{branchCode(r.branch_id)}</TableCell>}
                        {canVoid && (
                          <TableCell className="text-right">
                            {r.entry_type === "payment" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                disabled={!isVoidablePayment(r)}
                                title={r.is_voided ? "Already voided" : "Void this receipt"}
                                onClick={() =>
                                  setVoiding({ id: r.id, documentNumber: r.reference_number, amount: r.credit, date: r.entry_date })
                                }
                              >
                                <Ban aria-hidden />
                                Void
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </ScrollTable>
              <Pagination
                currentPage={ledgerPage}
                totalPages={ledgerTotalPages}
                totalItems={ledgerTotalCount}
                itemsPerPage={LEDGER_PAGE_SIZE}
                startIndex={(ledgerPage - 1) * LEDGER_PAGE_SIZE}
                onPageChange={setLedgerPage}
                className="mt-2"
              />
            </QueryState>
          </TabsContent>

          <TabsContent value="sales" className="space-y-3">
            <p className="flex gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                Sales left partly or fully unpaid at the till, with the amount that was due at the time of sale.
                Receipts are applied to the customer&apos;s overall balance (oldest first), not to a single invoice,
                so use the ledger balance for what is owed today.
              </span>
            </p>
            <QueryState
              isLoading={openInvoicesLoading}
              error={openInvoicesError}
              onRetry={() => void loadOpenInvoices(openInvoicesPage)}
              skeleton={<SkeletonTable rows={3} cols={3} />}
              isEmpty={openInvoices.length === 0}
              empty={{
                icon: ReceiptText,
                title: "No credit sales",
                description: "Every sale to this customer was paid in full at the time.",
              }}
            >
              <ScrollTable maxHeight="max-h-[50vh]" label="Credit sales">
                <TableHeader className={stickyHeaderClass}>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice no.</TableHead>
                    <TableHead className="text-right">Due at sale</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openInvoices.map((inv) => (
                    <TableRow key={inv.sale_id}>
                      <TableCell className="whitespace-nowrap">
                        <span className="num block">{inv.sale_date}</span>
                        <span className="num text-xs text-muted-foreground">BS {formatBsYmd(inv.sale_date)}</span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{inv.invoice_number || `SALE-${inv.sale_id.slice(0, 8)}`}</TableCell>
                      <MoneyCell value={inv.open_amount} strong />
                    </TableRow>
                  ))}
                </TableBody>
              </ScrollTable>
              <Pagination
                currentPage={openInvoicesPage}
                totalPages={openInvoicesTotalPages}
                totalItems={openInvoicesTotalCount}
                itemsPerPage={OPEN_INVOICES_PAGE_SIZE}
                startIndex={(openInvoicesPage - 1) * OPEN_INVOICES_PAGE_SIZE}
                onPageChange={setOpenInvoicesPage}
                className="mt-2"
              />
            </QueryState>
          </TabsContent>
        </Tabs>
      </DetailSheet>
    </div>
  )
}
