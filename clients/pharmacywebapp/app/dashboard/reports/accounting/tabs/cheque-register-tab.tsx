"use client"

import { useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { ArrowDownLeft, ArrowUpRight, CalendarClock, History, MoreHorizontal, ScrollText, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Pagination } from "@/components/ui/pagination"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { nepalYmdOf } from "@/lib/utils/nepal-time"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { useCheque, useCheques, useGrantedPermissions } from "@/features/accounting/hooks/use-cheques"
import { usePaymentMethodAccounts } from "@/features/accounting/hooks/use-payment-accounts"
import { ChequeActionDialog } from "@/features/accounting/components/cheque-action-dialog"
import { depositTargetAccounts } from "@/features/accounting/lib/payment-accounts"
import {
  CHEQUE_STATUSES,
  canRunChequeAction,
  chequeActions,
  chequeFiltersFromSearch,
  chequeStatusLabel,
  chequeStatusTone,
  chequeTotals,
  isChequeDue,
  isPostDated,
  type ChequeActionDef,
  type ChequeFilters,
  type ChequeRow,
} from "@/features/accounting/lib/cheques"
import { FetchingIndicator, MoneyCell, QueryState, ScrollTable, SectionHeading, stickyHeaderClass } from "../accounting-ui"
import { useAccountingContext } from "../accounting-context"

const ALL = "all"

/**
 * Cheque register: cheques received from customers and issued to suppliers, post-dated ones included. The due list
 * (cheque date today or earlier, not yet cleared) is what to bank today and what may hit the bank account.
 */
export default function ChequeRegisterTab() {
  const { money } = useAccountingMoney()
  const { accounts, branchFilterId } = useAccountingContext()
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<ChequeFilters>(() => chequeFiltersFromSearch(searchParams?.toString() ?? ""))
  const [searchDraft, setSearchDraft] = useState("")
  const [actionTarget, setActionTarget] = useState<{ cheque: ChequeRow; def: ChequeActionDef } | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const granted = useGrantedPermissions()
  const today = nepalYmdOf(new Date())
  const branchId = branchFilterId || null

  const list = useCheques(filters, branchId)
  // The due count for the summary card, whatever the table shows.
  const due = useCheques({ ...filters, status: "", direction: "", from: "", to: "", search: "", dueOnly: true, page: 1, pageSize: 1 }, branchId)

  const paymentAccounts = usePaymentMethodAccounts()
  const bankAccounts = useMemo(() => depositTargetAccounts(accounts, paymentAccounts.data), [accounts, paymentAccounts.data])
  const defaultBankAccountId = useMemo(() => {
    const mapped = paymentAccounts.data?.find((r) => r.method === "cheque")?.account_id
    return mapped && bankAccounts.some((a) => a.id === mapped) ? mapped : (bankAccounts.find((a) => a.code === "1010")?.id ?? "")
  }, [paymentAccounts.data, bankAccounts])

  const rows = list.data?.rows ?? []
  const totals = chequeTotals(rows)
  const update = (patch: Partial<ChequeFilters>) => setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }))

  return (
    <div className="space-y-6">
      <StatGrid cols={3}>
        <StatCard
          label="Due for action"
          value={due.data ? String(due.data.total) : "—"}
          hint="Cheque date today or earlier, not yet cleared"
          icon={CalendarClock}
          tone={due.data && due.data.total > 0 ? "warning" : "default"}
          loading={due.isLoading}
          onClick={() => update({ dueOnly: !filters.dueOnly })}
          active={filters.dueOnly}
        />
        <StatCard label="Received (listed)" value={money(totals.received)} hint="Cheques from customers on this page" icon={ArrowDownLeft} />
        <StatCard label="Issued (listed)" value={money(totals.issued)} hint="Cheques to suppliers on this page" icon={ArrowUpRight} />
      </StatGrid>

      <section className="space-y-3">
        <SectionHeading
          title="Cheque register"
          description="Post-dated cheques sit in Cheques in Hand (1160) or Cheques Issued (2160) until you mark them cleared. A bounce voids the receipt or payment."
          icon={ScrollText}
          actions={<FetchingIndicator active={list.isFetching && !list.isLoading} />}
        />

        <div role="group" aria-label="Cheque filters" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="cheque-direction" className="text-xs text-muted-foreground">Direction</Label>
            <Select value={filters.direction || ALL} onValueChange={(v) => update({ direction: v === ALL ? "" : (v as ChequeFilters["direction"]) })}>
              <SelectTrigger id="cheque-direction" className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All cheques</SelectItem>
                <SelectItem value="received">Received</SelectItem>
                <SelectItem value="issued">Issued</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="cheque-status" className="text-xs text-muted-foreground">Status</Label>
            <Select value={filters.status || ALL} onValueChange={(v) => update({ status: v === ALL ? "" : (v as ChequeFilters["status"]) })}>
              <SelectTrigger id="cheque-status" className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any status</SelectItem>
                {CHEQUE_STATUSES.filter((s) => !filters.direction || !s.direction || s.direction === filters.direction).map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="cheque-from" className="text-xs text-muted-foreground">Cheque date from</Label>
            <DatePicker id="cheque-from" value={filters.from} onChange={(v) => update({ from: v })} clearable allowFuture compact className="sm:w-40" />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="cheque-to" className="text-xs text-muted-foreground">to</Label>
            <DatePicker id="cheque-to" value={filters.to} onChange={(v) => update({ to: v })} clearable allowFuture compact className="sm:w-40" />
          </div>
          <form
            className="flex min-w-0 flex-col gap-1.5"
            onSubmit={(e) => {
              e.preventDefault()
              update({ search: searchDraft })
            }}
          >
            <Label htmlFor="cheque-search" className="text-xs text-muted-foreground">Party or cheque no.</Label>
            <div className="flex gap-2">
              <Input id="cheque-search" value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} maxLength={100} className="sm:w-48" />
              <Button type="submit" variant="outline" size="icon" aria-label="Search cheques">
                <Search aria-hidden />
              </Button>
            </div>
          </form>
          <label className="flex min-h-9 items-center gap-2 text-sm font-medium">
            <Switch checked={filters.dueOnly} onCheckedChange={(v) => update({ dueOnly: v })} aria-label="Due for action only" />
            Due only
          </label>
        </div>

        <QueryState
          isLoading={list.isLoading}
          error={list.error}
          onRetry={() => void list.refetch()}
          retrying={list.isFetching}
          isEmpty={rows.length === 0}
          empty={{
            icon: ScrollText,
            title: filters.dueOnly ? "No cheques due" : "No cheques",
            description: "Cheques appear here when a customer receipt or supplier payment is recorded by cheque with its number.",
          }}
        >
          <ScrollTable label="Cheques">
            <TableHeader className={stickyHeaderClass}>
              <TableRow>
                <TableHead>Cheque date</TableHead>
                <TableHead>Party</TableHead>
                <TableHead>Cheque</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => {
                const actions = chequeActions(c).filter((d) => canRunChequeAction(d, c.direction, granted))
                const dueNow = isChequeDue(c, today)
                return (
                  <TableRow key={c.id}>
                    <TableCell className="num whitespace-nowrap">
                      {c.cheque_date}
                      {isPostDated(c) && (
                        <Badge variant="muted" className="ml-2" title="Dated after the payment">PDC</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {c.direction === "received" ? (
                          <ArrowDownLeft className="h-3.5 w-3.5 text-success" aria-label="Received" />
                        ) : (
                          <ArrowUpRight className="h-3.5 w-3.5 text-warning" aria-label="Issued" />
                        )}
                        <span className="font-medium">{c.party_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="num">#{c.cheque_number}</div>
                      {c.bank_name && <div className="text-xs text-muted-foreground">{c.bank_name}</div>}
                    </TableCell>
                    <MoneyCell value={c.amount} />
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={chequeStatusTone(c.status)}>{chequeStatusLabel(c.status)}</Badge>
                        {dueNow && <Badge variant="warning">Due</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      <span className="num">{c.payment_date}</span>
                      <div>{c.posted_to_bank ? "Posted to bank" : c.direction === "received" ? "In Cheques in Hand" : "In Cheques Issued"}</div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Actions for cheque ${c.cheque_number}`}>
                            <MoreHorizontal aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setDetailId(c.id)}>
                            <History aria-hidden />
                            History
                          </DropdownMenuItem>
                          {actions.length > 0 && <DropdownMenuSeparator />}
                          {actions.map((d) => (
                            <DropdownMenuItem
                              key={d.action}
                              variant={d.voidsPayment ? "destructive" : "default"}
                              onSelect={() => setActionTarget({ cheque: c, def: d })}
                            >
                              {d.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </ScrollTable>
          {list.data && (
            <Pagination
              currentPage={filters.page}
              totalPages={list.data.totalPages}
              totalItems={list.data.total}
              itemsPerPage={filters.pageSize}
              startIndex={(filters.page - 1) * filters.pageSize}
              onPageChange={(page) => update({ page })}
              className="pt-3"
            />
          )}
        </QueryState>
      </section>

      <ChequeActionDialog
        target={actionTarget}
        bankAccounts={bankAccounts}
        defaultBankAccountId={defaultBankAccountId}
        onClose={() => setActionTarget(null)}
      />
      <ChequeHistoryDialog id={detailId} onClose={() => setDetailId(null)} />
    </div>
  )
}

function ChequeHistoryDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { money } = useAccountingMoney()
  const cheque = useCheque(id)
  const c = cheque.data
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle>Cheque {c ? `#${c.cheque_number}` : ""}</DialogTitle>
          <DialogDescription>
            {c ? `${money(c.amount)} ${c.direction === "received" ? "from" : "to"} ${c.party_name}${c.bank_name ? ` · ${c.bank_name}` : ""} · dated ${c.cheque_date}` : "Loading…"}
          </DialogDescription>
        </DialogHeader>
        <QueryState isLoading={cheque.isLoading} error={cheque.error} onRetry={() => void cheque.refetch()}>
          <ol className="space-y-3">
            {(c?.history ?? []).map((h) => (
              <li key={h.id} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={chequeStatusTone(h.to_status)}>{chequeStatusLabel(h.to_status)}</Badge>
                  <span className="num text-muted-foreground">{h.date}</span>
                  <span className="text-muted-foreground">by {h.changed_by}</span>
                </div>
                {h.note && <p className="mt-1">{h.note}</p>}
                {h.voucher_id && <p className="mt-1 text-xs text-muted-foreground">Clearance voucher posted</p>}
              </li>
            ))}
          </ol>
        </QueryState>
      </DialogContent>
    </Dialog>
  )
}
