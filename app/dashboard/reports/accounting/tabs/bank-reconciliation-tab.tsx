/**
 * Bank statement import & reconciliation (2026-09 ERP audit, item #2). The
 * sibling "Reconciliation" tab compares GL control accounts to their own
 * sub-ledgers; this one compares the GL bank account to what the bank says,
 * which is the only check that catches cash the books never knew about.
 */

"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DualDateInput } from "@/components/ui/dual-date-input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Wand2, CheckCircle2, Undo2, EyeOff, ArrowLeft } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useAccountingContext } from "../accounting-context"
import {
  bankReconciliationApi,
  parseStatementText,
  type BankStatementImport,
  type ReconciliationView,
  type CreateStatementInput,
} from "@/features/accounting/api-client-bank-reconciliation"

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function BankReconciliationTab() {
  const { toast } = useToast()
  const { accounts, accountsLoading } = useAccountingContext()

  const bankAccounts = accounts.filter((a) => a.account_type === "asset")

  const [accountId, setAccountId] = useState("")
  const [imports, setImports] = useState<BankStatementImport[]>([])
  const [listLoading, setListLoading] = useState(false)
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

  const [matchTarget, setMatchTarget] = useState<string | null>(null)

  const loadImports = useCallback(async () => {
    if (!accountId) {
      setImports([])
      return
    }
    setListLoading(true)
    const { data, error } = await bankReconciliationApi.list(accountId)
    if (error) toast({ title: "Could not load statements", description: error, variant: "destructive" })
    setImports(data)
    setListLoading(false)
  }, [accountId, toast])

  useEffect(() => {
    loadImports()
  }, [loadImports])

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
    const { data, error } = await bankReconciliationApi.create(payload)
    setImporting(false)
    if (error) {
      toast({ title: "Import failed", description: error, variant: "destructive" })
      return
    }
    toast({ title: `Imported ${lines.length} statement line(s)` })
    setLabel("")
    setPasted("")
    setClosingBalance("")
    await loadImports()
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
      await loadImports()
    }
  }

  if (accountsLoading) {
    return <p className="text-sm text-muted-foreground">Loading accounts…</p>
  }

  if (openId && view) {
    const s = view.summary
    const balanced = Math.abs(s.difference) < 0.01
    const locked = view.import.status === "reconciled"

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => { setOpenId(null); setView(null) }}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />Back to statements
          </Button>
          {locked && <Badge><CheckCircle2 className="h-3 w-3 mr-1" />Reconciled</Badge>}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {view.import.statement_label || "Statement"} · {view.import.period_start} → {view.import.period_end}
            </CardTitle>
            <CardDescription>
              Statement movement vs. ledger movement over the same period. A non-zero difference means one side has a
              transaction the other doesn't.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Statement net</div>
                <div className="text-lg font-semibold">{fmt(s.statement_net)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Ledger net</div>
                <div className="text-lg font-semibold">{fmt(s.ledger_net)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Difference</div>
                <div className={`text-lg font-semibold ${balanced ? "text-green-600" : "text-destructive"}`}>{fmt(s.difference)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Unmatched</div>
                <div className="text-lg font-semibold">
                  {s.unmatched_statement_lines} stmt · {s.unmatched_ledger_lines} GL
                </div>
              </div>
            </div>

            {!locked && (
              <div className="flex flex-wrap gap-2 pt-4">
                <Button onClick={handleAutoMatch} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
                  Auto-match
                </Button>
                <Button variant="outline" onClick={handleComplete} disabled={busy}>
                  <CheckCircle2 className="h-4 w-4 mr-2" />Mark reconciled
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bank statement lines</CardTitle>
              <CardDescription>
                {matchTarget ? "Now pick the matching ledger entry on the right." : "Select a line, then choose its ledger entry."}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">In</TableHead>
                    <TableHead className="text-right">Out</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.lines.map((l) => (
                    <TableRow key={l.id} className={matchTarget === l.id ? "bg-muted" : undefined}>
                      <TableCell className="whitespace-nowrap">{l.txn_date}</TableCell>
                      <TableCell className="max-w-[220px] truncate" title={l.description || ""}>{l.description || "—"}</TableCell>
                      <TableCell className="text-right">{l.debit_amount > 0 ? fmt(Number(l.debit_amount)) : ""}</TableCell>
                      <TableCell className="text-right">{l.credit_amount > 0 ? fmt(Number(l.credit_amount)) : ""}</TableCell>
                      <TableCell>
                        {l.status === "matched" && <Badge variant="secondary">Matched</Badge>}
                        {l.status === "ignored" && <Badge variant="outline">Ignored</Badge>}
                        {l.status === "unmatched" && <Badge variant="destructive">Unmatched</Badge>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {!locked && l.status === "unmatched" && (
                          <div className="flex gap-1">
                            <Button size="sm" variant={matchTarget === l.id ? "default" : "outline"} onClick={() => setMatchTarget(matchTarget === l.id ? null : l.id)}>
                              {matchTarget === l.id ? "Selecting…" : "Match"}
                            </Button>
                            <Button size="sm" variant="ghost" title="Ignore this line" onClick={() => runAction(() => bankReconciliationApi.ignoreLine(l.id), "Ignore")} disabled={busy}>
                              <EyeOff className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                        {!locked && l.status !== "unmatched" && (
                          <Button size="sm" variant="ghost" onClick={() => runAction(() => bankReconciliationApi.unmatchLine(l.id), "Unmatch")} disabled={busy}>
                            <Undo2 className="h-3.5 w-3.5 mr-1" />Undo
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ledger entries in this period</CardTitle>
              <CardDescription>Posted vouchers hitting this account. Greyed rows are already matched.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Voucher</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Dr</TableHead>
                    <TableHead className="text-right">Cr</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.ledger.map((c) => (
                    <TableRow key={c.voucher_line_id} className={c.matched ? "opacity-50" : undefined}>
                      <TableCell className="whitespace-nowrap">{c.voucher_date}</TableCell>
                      <TableCell className="font-mono text-xs">{c.voucher_no}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={c.description || ""}>{c.description || "—"}</TableCell>
                      <TableCell className="text-right">{c.debit_amount > 0 ? fmt(c.debit_amount) : ""}</TableCell>
                      <TableCell className="text-right">{c.credit_amount > 0 ? fmt(c.credit_amount) : ""}</TableCell>
                      <TableCell>
                        {matchTarget && !c.matched && !locked && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={async () => {
                              const ok = await runAction(() => bankReconciliationApi.matchLine(matchTarget, c.voucher_line_id), "Match")
                              if (ok) setMatchTarget(null)
                            }}
                          >
                            Link
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {view.ledger.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-sm text-muted-foreground">
                        No posted ledger entries on this account in the statement period.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Import a bank statement</CardTitle>
          <CardDescription>
            Paste the statement rows as CSV or tab-separated text: date, description, [reference], money-in, money-out.
            Each bank account is a separate asset account in your chart of accounts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Bank account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Period start</Label>
              <DualDateInput value={periodStart} onChange={setPeriodStart} />
            </div>
            <div className="space-y-2">
              <Label>Period end</Label>
              <DualDateInput value={periodEnd} onChange={setPeriodEnd} />
            </div>
            <div className="space-y-2">
              <Label>Closing balance (optional)</Label>
              <Input type="number" step="0.01" value={closingBalance} onChange={(e) => setClosingBalance(e.target.value)} placeholder="0.00" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Statement label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. NIC Asia — Shrawan 2082" />
          </div>

          <div className="space-y-2">
            <Label>Statement rows</Label>
            <Textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={8}
              className="font-mono text-xs"
              placeholder={"2026-08-01,Cash deposit,DEP-001,50000,\n2026-08-03,Bank charges,,,250"}
            />
          </div>

          <Button onClick={handleImport} disabled={importing}>
            {importing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Import statement
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Statements</CardTitle>
        </CardHeader>
        <CardContent>
          {listLoading || viewLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : imports.length === 0 ? (
            <p className="text-sm text-muted-foreground">No statements imported for this account yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Statement</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Closing balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {imports.map((imp) => (
                  <TableRow key={imp.id}>
                    <TableCell>{imp.statement_label || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{imp.period_start} → {imp.period_end}</TableCell>
                    <TableCell className="text-right">{imp.closing_balance != null ? fmt(Number(imp.closing_balance)) : "—"}</TableCell>
                    <TableCell>
                      {imp.status === "reconciled" ? <Badge>Reconciled</Badge> : <Badge variant="secondary">Open</Badge>}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => openReconciliation(imp.id)}>Reconcile</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
