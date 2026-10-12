/**
 * Bank statement import & reconciliation (2026-09 ERP audit, item #2). The
 * sibling "Reconciliation" tab compares GL control accounts to their own
 * sub-ledgers; this one compares the GL bank account to what the bank says,
 * which is the only check that catches cash the books never knew about.
 */

"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DatePicker } from "@/components/ui/date-picker"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  AlertTriangle,
  ArrowLeft,
  BookMarked,
  CheckCircle2,
  CircleDot,
  EyeOff,
  FileText,
  Landmark,
  Link2,
  Undo2,
  Upload,
  Wand2,
} from "lucide-react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { Amount, BalanceStatus, MoneyCell, ScrollTable, stickyHeaderClass } from "../accounting-ui"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { formatBsYmd } from "@/features/accounting/lib/date-presets"
import { useToast } from "@/hooks/use-toast"
import { useAccountingContext } from "../accounting-context"
import {
  bankReconciliationApi,
  parseStatementText,
  type BankStatementImport,
  type ReconciliationView,
  type CreateStatementInput,
} from "@/features/accounting/api-client-bank-reconciliation"
import { Pagination } from "@/components/ui/pagination"
import { createIdempotencyKeyTracker } from "@/lib/api/idempotency"

const STATEMENTS_PAGE_SIZE = 10


export default function BankReconciliationTab() {
  const { toast } = useToast()
  const { accounts, accountsLoading } = useAccountingContext()
  const { money } = useAccountingMoney()

  // Ledger (leaf) asset accounts only — heads and group accounts hold no postings to reconcile.
  const bankAccounts = accounts.filter((a) => a.account_type === "asset" && !a.is_root_head && !a.has_children)

  const [accountId, setAccountId] = useState("")
  const [imports, setImports] = useState<BankStatementImport[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [statementsPage, setStatementsPage] = useState(1)
  const [statementsTotalCount, setStatementsTotalCount] = useState(0)
  const [statementsTotalPages, setStatementsTotalPages] = useState(1)
  const [openId, setOpenId] = useState<string | null>(null)
  const [view, setView] = useState<ReconciliationView | null>(null)
  const [viewLoading, setViewLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  const [label, setLabel] = useState("")
  const [periodStart, setPeriodStart] = useState("")
  const [periodEnd, setPeriodEnd] = useState("")
  const [closingBalance, setClosingBalance] = useState("")
  const [pasted, setPasted] = useState("")
  const [importing, setImporting] = useState(false)
  // One Idempotency-Key per statement import: re-submitting the same statement after a timeout reuses it,
  // so the statement is imported once.
  const importKeys = useRef(createIdempotencyKeyTracker())

  const [matchTarget, setMatchTarget] = useState<string | null>(null)
  const [confirmComplete, setConfirmComplete] = useState(false)

  // Only the latest request may write state: switching account resets the page, which briefly fires a
  // load for the old page too, and a slower stale response must not overwrite the fresh one.
  const importsRequest = useRef(0)
  const loadImports = useCallback(
    async (page: number) => {
      const requestId = ++importsRequest.current
      if (!accountId) {
        setImports([])
        setStatementsTotalCount(0)
        setStatementsTotalPages(1)
        return
      }
      setListLoading(true)
      setListError(null)
      const result = await bankReconciliationApi.search(accountId, page, STATEMENTS_PAGE_SIZE)
      if (requestId !== importsRequest.current) return
      if (result.error) setListError(result.error)
      setImports(result.items)
      setStatementsTotalCount(result.totalCount)
      setStatementsTotalPages(Math.max(1, result.totalPages))
      setListLoading(false)
    },
    [accountId, toast]
  )

  // Reset to page 1 whenever the selected bank account changes.
  useEffect(() => {
    setStatementsPage(1)
  }, [accountId])

  useEffect(() => {
    void loadImports(statementsPage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, statementsPage])

  useEffect(() => {
    if (!accountId && bankAccounts.length > 0) setAccountId(bankAccounts[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankAccounts.length])

  const loadView = useCallback(
    async (id: string) => {
      setViewLoading(true)
      const { data, error } = await bankReconciliationApi.get(id)
      if (error) toast({ title: "Could not load reconciliation", description: error, variant: "destructive" })
      setView(data)
      setViewLoading(false)
    },
    [toast]
  )

  const openReconciliation = async (id: string) => {
    setOpenId(id)
    setMatchTarget(null)
    await loadView(id)
  }

  const handleImport = async () => {
    if (!accountId || !periodStart || !periodEnd) {
      toast({ title: "Select an account and statement period", variant: "destructive" })
      return
    }
    const { lines, errors } = parseStatementText(pasted)
    if (errors.length > 0) {
      toast({ title: `${errors.length} row(s) could not be read`, description: errors.slice(0, 3).join(" · "), variant: "destructive" })
      return
    }
    if (lines.length === 0) {
      toast({ title: "No statement rows found", variant: "destructive" })
      return
    }

    const payload: CreateStatementInput = {
      account_id: accountId,
      statement_label: label.trim() || null,
      period_start: periodStart,
      period_end: periodEnd,
      closing_balance: closingBalance ? Number(closingBalance) : null,
      lines,
    }

    setImporting(true)
    const { data, error } = await bankReconciliationApi.create(payload, importKeys.current.keyFor(JSON.stringify(payload)))
    setImporting(false)
    if (error) {
      toast({ title: "Import failed", description: error, variant: "destructive" })
      return
    }
    importKeys.current.reset()
    toast({ title: `Imported ${lines.length} statement line(s)` })
    setLabel("")
    setPasted("")
    setClosingBalance("")
    setStatementsPage(1)
    await loadImports(1)
    if (data) await openReconciliation(data.id)
  }

  const runAction = async (fn: () => Promise<{ error: string | null }>, successTitle: string) => {
    setBusy(true)
    const { error } = await fn()
    setBusy(false)
    if (error) {
      toast({ title: successTitle + " failed", description: error, variant: "destructive" })
      return false
    }
    if (openId) await loadView(openId)
    return true
  }

  const handleAutoMatch = async () => {
    if (!openId) return
    setBusy(true)
    const { matched, error } = await bankReconciliationApi.autoMatch(openId)
    setBusy(false)
    if (error) {
      toast({ title: "Auto-match failed", description: error, variant: "destructive" })
      return
    }
    toast({
      title: `Auto-matched ${matched} line(s)`,
      description: matched === 0 ? "Nothing matched confidently — match the rest by hand." : undefined,
    })
    await loadView(openId)
  }

  const handleComplete = async () => {
    if (!openId) return
    const ok = await runAction(() => bankReconciliationApi.complete(openId), "Complete")
    if (ok) {
      toast({ title: "Statement reconciled" })
      await loadImports(statementsPage)
    }
  }

  if (accountsLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <SkeletonCard />
        <SkeletonTable rows={4} cols={5} />
        <span className="sr-only">Loading accounts…</span>
      </div>
    )
  }

  if (openId && view) {
    const s = view.summary
    const balanced = Math.abs(s.difference) < 0.01
    const locked = view.import.status === "reconciled"

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => { setOpenId(null); setView(null) }}>
            <ArrowLeft aria-hidden />
            Back to statements
          </Button>
          {locked ? (
            <Badge variant="success">
              <CheckCircle2 aria-hidden />
              Reconciled
            </Badge>
          ) : (
            <Badge variant="info">
              <CircleDot aria-hidden />
              Open
            </Badge>
          )}
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-3 space-y-0 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <CardTitle>
                {view.import.statement_label || "Statement"} ·{" "}
                <span className="num">{view.import.period_start}</span> →{" "}
                <span className="num">{view.import.period_end}</span>
              </CardTitle>
              <CardDescription>
                Statement movement vs. ledger movement over the same period. A non-zero difference means one side has a
                transaction the other doesn&apos;t.
              </CardDescription>
            </div>
            {!locked && (
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button variant="outline" onClick={handleAutoMatch} loading={busy}>
                  {!busy && <Wand2 aria-hidden />}
                  Auto-match
                </Button>
                <Button onClick={() => setConfirmComplete(true)} disabled={busy}>
                  <CheckCircle2 aria-hidden />
                  Mark reconciled
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <StatGrid cols={4}>
              <StatCard label="Statement net" value={<Amount value={s.statement_net} />} icon={FileText} />
              <StatCard label="Ledger net" value={<Amount value={s.ledger_net} />} icon={BookMarked} />
              <StatCard
                label="Difference"
                value={<Amount value={s.difference} />}
                hint={balanced ? "Statement and ledger agree" : "Find the missing transaction"}
                icon={balanced ? CheckCircle2 : AlertTriangle}
                tone={balanced ? "success" : "danger"}
              />
              <StatCard
                label="Unmatched"
                value={`${s.unmatched_statement_lines} stmt · ${s.unmatched_ledger_lines} GL`}
                hint={s.unmatched_statement_lines + s.unmatched_ledger_lines === 0 ? "Everything matched" : "Lines still to match"}
                icon={Link2}
                tone={s.unmatched_statement_lines + s.unmatched_ledger_lines === 0 ? "success" : "warning"}
              />
            </StatGrid>
            <BalanceStatus
              balanced={balanced}
              difference={s.difference}
              
              balancedLabel="Balanced — statement matches the ledger"
            />
          </CardContent>
        </Card>

        {matchTarget && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/25 bg-primary/5 px-4 py-2.5 text-sm"
          >
            <span className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" aria-hidden />
              Matching a statement line — pick its ledger entry and select <span className="font-semibold">Link</span>.
            </span>
            <Button size="sm" variant="ghost" onClick={() => setMatchTarget(null)}>
              Cancel matching
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bank statement lines</CardTitle>
              <CardDescription>
                {matchTarget ? "Now pick the matching ledger entry on the right." : "Select a line, then choose its ledger entry."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollTable maxHeight="max-h-[60vh]">
                <TableHeader className={stickyHeaderClass}>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">In</TableHead>
                    <TableHead className="text-right">Out</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.lines.length === 0 && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                        This statement has no lines.
                      </TableCell>
                    </TableRow>
                  )}
                  {view.lines.map((l) => (
                    <TableRow
                      key={l.id}
                      data-state={matchTarget === l.id ? "selected" : undefined}
                      className={matchTarget === l.id ? "bg-primary/5" : undefined}
                    >
                      <TableCell className="whitespace-nowrap">
                        <span className="num block">{l.txn_date}</span>
                        <span className="num text-xs text-muted-foreground">BS {formatBsYmd(l.txn_date)}</span>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate" title={l.description || ""}>{l.description || "—"}</TableCell>
                      <MoneyCell value={l.debit_amount} blankZero />
                      <MoneyCell value={l.credit_amount} blankZero />
                      <TableCell>
                        {l.status === "matched" && (
                          <Badge variant="success">
                            <CheckCircle2 aria-hidden />
                            Matched
                          </Badge>
                        )}
                        {l.status === "ignored" && (
                          <Badge variant="muted">
                            <EyeOff aria-hidden />
                            Ignored
                          </Badge>
                        )}
                        {l.status === "unmatched" && (
                          <Badge variant="warning">
                            <CircleDot aria-hidden />
                            Unmatched
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {!locked && l.status === "unmatched" && (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant={matchTarget === l.id ? "default" : "outline"}
                              aria-pressed={matchTarget === l.id}
                              onClick={() => setMatchTarget(matchTarget === l.id ? null : l.id)}
                            >
                              {matchTarget === l.id ? "Selecting…" : "Match"}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Ignore this line"
                              aria-label={`Ignore statement line ${l.description || l.txn_date}`}
                              onClick={() => runAction(() => bankReconciliationApi.ignoreLine(l.id), "Ignore")}
                              disabled={busy}
                            >
                              <EyeOff aria-hidden />
                            </Button>
                          </div>
                        )}
                        {!locked && l.status !== "unmatched" && (
                          <div className="flex justify-end">
                            <Button size="sm" variant="ghost" onClick={() => runAction(() => bankReconciliationApi.unmatchLine(l.id), "Unmatch")} disabled={busy}>
                              <Undo2 aria-hidden />
                              Undo
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </ScrollTable>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ledger entries in this period</CardTitle>
              <CardDescription>Posted vouchers hitting this account. Greyed rows are already matched.</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollTable maxHeight="max-h-[60vh]">
                <TableHeader className={stickyHeaderClass}>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Voucher</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Dr</TableHead>
                    <TableHead className="text-right">Cr</TableHead>
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.ledger.map((c) => (
                    <TableRow key={c.voucher_line_id} className={c.matched ? "text-muted-foreground opacity-60" : undefined}>
                      <TableCell className="whitespace-nowrap">
                        <span className="num block">{c.voucher_date}</span>
                        <span className="num text-xs text-muted-foreground">BS {formatBsYmd(c.voucher_date)}</span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{c.voucher_no}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={c.description || ""}>
                        {c.matched && <span className="sr-only">Matched: </span>}
                        {c.description || "—"}
                      </TableCell>
                      <MoneyCell value={c.debit_amount} blankZero />
                      <MoneyCell value={c.credit_amount} blankZero />
                      <TableCell className="text-right">
                        {matchTarget && !c.matched && !locked && (
                          <Button
                            size="sm"
                            variant="default"
                            disabled={busy}
                            onClick={async () => {
                              const ok = await runAction(() => bankReconciliationApi.matchLine(matchTarget, c.voucher_line_id), "Match")
                              if (ok) setMatchTarget(null)
                            }}
                          >
                            <Link2 aria-hidden />
                            Link
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {view.ledger.length === 0 && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                        No posted ledger entries on this account in the statement period.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </ScrollTable>
            </CardContent>
          </Card>
        </div>

        <ConfirmDialog
          isOpen={confirmComplete}
          onClose={() => setConfirmComplete(false)}
          onConfirm={() => {
            setConfirmComplete(false)
            void handleComplete()
          }}
          title="Mark statement as reconciled?"
          description={
            balanced
              ? "This locks the statement — matches can no longer be changed."
              : `The statement still differs from the ledger by ${money(Math.abs(s.difference))}. Marking it reconciled locks it — matches can no longer be changed.`
          }
          confirmText="Mark reconciled"
          variant="default"
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-xs sm:flex-row sm:items-end sm:p-4">
        <div className="w-full space-y-1.5 sm:w-[320px]">
          <Label htmlFor="br_account" className="text-xs font-medium text-muted-foreground">
            Bank account
          </Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger id="br_account" className="w-full">
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {bankAccounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground sm:pb-2">
          Each bank account is a separate asset account in your chart of accounts.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-start">
      <Card>
        <CardHeader>
          <CardTitle>Statements</CardTitle>
          <CardDescription>Open a statement to match its lines against the ledger.</CardDescription>
        </CardHeader>
        <CardContent>
          {listLoading || viewLoading ? (
            <SkeletonTable rows={4} cols={4} />
          ) : listError ? (
            <ErrorState size="compact" title="Couldn't load statements" message={listError} onRetry={() => void loadImports(statementsPage)} />
          ) : !accountId ? (
            <EmptyState
              size="compact"
              icon={Landmark}
              title="Choose a bank account"
              description="Pick the bank account above to see its imported statements."
            />
          ) : imports.length === 0 ? (
            <EmptyState
              size="compact"
              icon={FileText}
              title="No statements imported yet"
              description="Paste your first bank statement in the import form to start reconciling this account."
            />
          ) : (
            <>
            <ScrollTable maxHeight="max-h-[60vh]" label="Bank statements">
              <TableHeader className={stickyHeaderClass}>
                <TableRow>
                  <TableHead>Statement</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Closing balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {imports.map((imp) => (
                  <TableRow key={imp.id}>
                    <TableCell className="max-w-[200px] truncate font-medium" title={imp.statement_label || undefined}>
                      {imp.statement_label || "—"}
                    </TableCell>
                    <TableCell className="num whitespace-nowrap">{imp.period_start} → {imp.period_end}</TableCell>
                    <TableCell className="text-right">
                      {imp.closing_balance != null ? <Amount value={Number(imp.closing_balance)} /> : "—"}
                    </TableCell>
                    <TableCell>
                      {imp.status === "reconciled" ? (
                        <Badge variant="success">
                          <CheckCircle2 aria-hidden />
                          Reconciled
                        </Badge>
                      ) : (
                        <Badge variant="info">
                          <CircleDot aria-hidden />
                          Open
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => openReconciliation(imp.id)}>
                        {imp.status === "reconciled" ? "View" : "Reconcile"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </ScrollTable>
            <Pagination
              currentPage={statementsPage}
              totalPages={statementsTotalPages}
              totalItems={statementsTotalCount}
              itemsPerPage={STATEMENTS_PAGE_SIZE}
              startIndex={(statementsPage - 1) * STATEMENTS_PAGE_SIZE}
              onPageChange={setStatementsPage}
              className="mt-4"
            />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import a bank statement</CardTitle>
          <CardDescription>
            Paste the statement rows as CSV or tab-separated text: date, description, [reference], money-in, money-out.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              void handleImport()
            }}
          >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="br_period_start">
                Period start <span className="text-destructive" aria-hidden>*</span>
              </Label>
              <DatePicker id="br_period_start" value={periodStart} onChange={setPeriodStart} max={periodEnd || undefined} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="br_period_end">
                Period end <span className="text-destructive" aria-hidden>*</span>
              </Label>
              <DatePicker id="br_period_end" value={periodEnd} onChange={setPeriodEnd} min={periodStart || undefined} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="br_label">Statement label</Label>
              <Input id="br_label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. NIC Asia — Shrawan 2082" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="br_closing">Closing balance (optional)</Label>
              <Input
                id="br_closing"
                type="number"
                inputMode="decimal"
                step="0.01"
                className="num text-right"
                value={closingBalance}
                onChange={(e) => setClosingBalance(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="br_rows">
              Statement rows <span className="text-destructive" aria-hidden>*</span>
            </Label>
            <Textarea
              id="br_rows"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={8}
              className="font-mono text-xs"
              placeholder={"2026-08-01,Cash deposit,DEP-001,50000,\n2026-08-03,Bank charges,,,250"}
              aria-describedby="br_rows_help"
            />
            <p id="br_rows_help" className="text-xs text-muted-foreground">
              One row per line: date, description, reference (optional), money in, money out. Leave the unused amount empty.
            </p>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={!accountId} loading={importing} loadingText="Importing…">
              <Upload aria-hidden />
              Import statement
            </Button>
          </div>
          </form>
        </CardContent>
      </Card>
      </div>
    </div>
  )
}
