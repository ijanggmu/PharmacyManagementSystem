"use client"

import { useMemo, useState } from "react"
import { CheckCircle2, Download, Eye, FileText, Play, Printer, RefreshCw, Send, Trash2, Wallet } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DatePicker } from "@/components/ui/date-picker"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SkeletonTable } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { newIdempotencyKey } from "@/lib/api/idempotency"
import { useCurrency } from "@/lib/contexts/currency-context"
import { nepalTodayYmd } from "@/lib/utils/date-limits"
import { downloadCsv } from "@/features/accounting/lib/csv"
import { PARTY_PAYMENT_METHODS } from "@/features/accounting/lib/payment-methods"
import { printHtmlDocument } from "@/features/accounting/lib/voucher-print"
import { usePharmacyProfile } from "@/features/accounting/hooks/use-pharmacy-profile"
import { useBranchAccess } from "@/features/branches/hooks/use-branch-access"
import { useBranchNameResolver } from "@/features/branches/components/branch-filter"
import type { PayrollMonth, PayrollRun, PayrollRunLine, PayrollTotals } from "@/features/payroll/api-client"
import { usePayrollPreview, usePayrollRun, usePayrollRunCommand, usePayrollRuns, type RunCommand } from "@/features/payroll/hooks/use-payroll"
import {
  bsMonthLabel,
  bsMonthOf,
  buildPayslipsHtml,
  fiscalYearLabel,
  fiscalYearMonths,
  fiscalYearOf,
  payrollRegisterRows,
  REGISTER_HEADERS,
  registerFileName,
  runActions,
  runStatusVariant,
  shiftBsMonth,
} from "@/features/payroll/lib/payroll"

/** Pay runs: pick a branch and Nepali month, preview, create a draft, then approve → post → pay. */
export function PayrollRuns() {
  const { toast } = useToast()
  const access = useBranchAccess()
  const branchName = useBranchNameResolver(access.branches)
  // Default to last month: salaries are run after the month ends.
  const [month, setMonth] = useState(() => shiftBsMonth(bsMonthOf(nepalTodayYmd()), -1))
  const [branchChoice, setBranchChoice] = useState<string>("")
  const branchId = branchChoice || access.ownBranchId || access.branches.find((b) => b.isActive)?.id || ""
  const [previewing, setPreviewing] = useState(false)
  const [openRunId, setOpenRunId] = useState<string | null>(null)
  const fy = fiscalYearOf(month)
  const runs = usePayrollRuns({ fiscalYear: fy, branchId: access.canViewAll ? undefined : branchId || undefined })
  const command = usePayrollRunCommand()
  const target: PayrollMonth | null = branchId ? { branchId, ...month } : null
  const preview = usePayrollPreview(previewing ? target : null)
  const existing = (runs.data ?? []).find((r) => r.branchId === branchId && r.bsYear === month.bsYear && r.bsMonth === month.bsMonth)
  const yearOptions = useMemo(() => [fy - 1, fy, fy + 1], [fy])

  const run = (cmd: RunCommand, done: string, after?: (r: PayrollRun | null) => void) =>
    command.mutate(cmd, {
      onSuccess: (r) => {
        toast({ title: done })
        after?.(r)
      },
      onError: (error) => toast({ title: "Payroll action failed", description: apiRequestErrorMessage(error), variant: "destructive" }),
    })

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run payroll</CardTitle>
          <CardDescription>One run per branch and Nepali month. Preview first; nothing is saved until you create the draft.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="run-branch">Branch</Label>
            <Select value={branchId} onValueChange={(v) => { setBranchChoice(v); setPreviewing(false) }} disabled={!access.canViewAll}>
              <SelectTrigger id="run-branch" className="h-9 w-48">
                <SelectValue placeholder="Branch" />
              </SelectTrigger>
              <SelectContent>
                {access.branches.filter((b) => b.isActive).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="run-fy">Fiscal year</Label>
            <Select
              value={String(fy)}
              onValueChange={(v) => { setMonth({ bsYear: Number(v), bsMonth: 4 }); setPreviewing(false) }}
            >
              <SelectTrigger id="run-fy" className="h-9 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {fiscalYearLabel(y)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="run-month">Month</Label>
            <Select
              value={`${month.bsYear}-${month.bsMonth}`}
              onValueChange={(v) => {
                const [y, m] = v.split("-").map(Number)
                setMonth({ bsYear: y, bsMonth: m })
                setPreviewing(false)
              }}
            >
              <SelectTrigger id="run-month" className="h-9 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fiscalYearMonths(fy).map((m) => (
                  <SelectItem key={`${m.bsYear}-${m.bsMonth}`} value={`${m.bsYear}-${m.bsMonth}`}>
                    {bsMonthLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => setPreviewing(true)} disabled={!target}>
            <Eye className="mr-1 h-4 w-4" /> Preview
          </Button>
          {existing ? (
            <Button onClick={() => setOpenRunId(existing.id)}>
              <FileText className="mr-1 h-4 w-4" /> Open {existing.status.toLowerCase()} run
            </Button>
          ) : (
            <Button
              disabled={!target || command.isPending}
              onClick={() =>
                target &&
                run({ kind: "create", month: target, idempotencyKey: newIdempotencyKey() }, `Draft payroll created for ${bsMonthLabel(month)}`, (r) => {
                  setPreviewing(false)
                  if (r) setOpenRunId(r.id)
                })
              }
            >
              <Play className="mr-1 h-4 w-4" /> Create draft run
            </Button>
          )}
        </CardContent>
      </Card>

      {previewing && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview — {bsMonthLabel(month)} · {branchName(branchId)}</CardTitle>
          </CardHeader>
          <CardContent>
            {preview.isLoading ? (
              <SkeletonTable rows={4} cols={8} />
            ) : preview.isError ? (
              <ErrorState message={apiRequestErrorMessage(preview.error)} onRetry={() => void preview.refetch()} />
            ) : preview.data ? (
              <div className="space-y-3">
                {preview.data.skipped.length > 0 && (
                  <Alert>
                    <AlertDescription>
                      Not included:{" "}
                      {preview.data.skipped.map((s) => `${s.employeeName} (${s.reason})`).join("; ")}
                    </AlertDescription>
                  </Alert>
                )}
                <LinesTable lines={preview.data.lines} totals={preview.data.totals} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Runs — FY {fiscalYearLabel(fy)}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {runs.isLoading ? (
            <SkeletonTable rows={4} cols={6} />
          ) : runs.isError ? (
            <ErrorState message={apiRequestErrorMessage(runs.error)} onRetry={() => void runs.refetch()} />
          ) : (runs.data ?? []).length === 0 ? (
            <EmptyState size="compact" title="No payroll runs this fiscal year" description="Pick a month above and create a draft run." />
          ) : (
            <RunsTable runs={runs.data ?? []} branchName={branchName} onOpen={setOpenRunId} />
          )}
        </CardContent>
      </Card>

      {openRunId && <RunDialog runId={openRunId} branchName={branchName} onClose={() => setOpenRunId(null)} />}
    </div>
  )
}

function RunsTable({ runs, branchName, onOpen }: { runs: PayrollRun[]; branchName: (id: string) => string; onOpen: (id: string) => void }) {
  const { formatCurrency } = useCurrency()
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Month</TableHead>
          <TableHead>Branch</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Employees</TableHead>
          <TableHead className="text-right">Gross</TableHead>
          <TableHead className="text-right">TDS</TableHead>
          <TableHead className="text-right">Net pay</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-medium">{r.periodLabel}</TableCell>
            <TableCell>{branchName(r.branchId)}</TableCell>
            <TableCell>
              <Badge variant={runStatusVariant(r.status)}>{r.status}</Badge>
            </TableCell>
            <TableCell className="text-right tabular-nums">{r.totals.employeeCount}</TableCell>
            <TableCell className="text-right tabular-nums">{formatCurrency(r.totals.gross)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatCurrency(r.totals.tds)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatCurrency(r.totals.net)}</TableCell>
            <TableCell className="text-right">
              <Button variant="ghost" size="sm" onClick={() => onOpen(r.id)}>
                Open
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function LinesTable({ lines, totals }: { lines: PayrollRunLine[]; totals: PayrollTotals }) {
  const { formatCurrency } = useCurrency()
  const money = (n: number) => <span className="tabular-nums">{formatCurrency(n)}</span>
  if (lines.length === 0) return <p className="text-sm text-muted-foreground">No employee can be paid for this month.</p>
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead className="text-right">Days</TableHead>
            <TableHead className="text-right">Gross</TableHead>
            <TableHead className="text-right">SSF 11%</TableHead>
            <TableHead className="text-right">SSF 20% (employer)</TableHead>
            <TableHead className="text-right">CIT</TableHead>
            <TableHead className="text-right">TDS</TableHead>
            <TableHead className="text-right">Other</TableHead>
            <TableHead className="text-right">Net pay</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l) => (
            <TableRow key={l.employeeId}>
              <TableCell>
                <div className="font-medium">{l.employeeName}</div>
                <div className="text-xs text-muted-foreground">
                  {l.maritalStatus === "Married" ? "Couple" : "Single"} slabs{l.ssfEnrolled ? " · SSF" : ""} · annual tax {formatCurrency(l.annualTax)}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {l.daysWorked}/{l.daysInMonth}
              </TableCell>
              <TableCell className="text-right">{money(l.gross)}</TableCell>
              <TableCell className="text-right">{money(l.employeeSsf)}</TableCell>
              <TableCell className="text-right">{money(l.employerSsf)}</TableCell>
              <TableCell className="text-right">{money(l.cit)}</TableCell>
              <TableCell className="text-right">{money(l.tds)}</TableCell>
              <TableCell className="text-right">{money(l.otherDeduction)}</TableCell>
              <TableCell className="text-right font-medium">{money(l.net)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>Total ({totals.employeeCount})</TableCell>
            <TableCell />
            <TableCell className="text-right">{money(totals.gross)}</TableCell>
            <TableCell className="text-right">{money(totals.employeeSsf)}</TableCell>
            <TableCell className="text-right">{money(totals.employerSsf)}</TableCell>
            <TableCell className="text-right">{money(totals.cit)}</TableCell>
            <TableCell className="text-right">{money(totals.tds)}</TableCell>
            <TableCell className="text-right">{money(totals.otherDeductions)}</TableCell>
            <TableCell className="text-right">{money(totals.net)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  )
}

function RunDialog({ runId, branchName, onClose }: { runId: string; branchName: (id: string) => string; onClose: () => void }) {
  const { toast } = useToast()
  const { profile } = usePharmacyProfile()
  const detail = usePayrollRun(runId)
  const command = usePayrollRunCommand()
  const [postingDate, setPostingDate] = useState("")
  const [paidOn, setPaidOn] = useState(nepalTodayYmd())
  const [paymentMethod, setPaymentMethod] = useState("bank")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const r = detail.data

  const act = (cmd: RunCommand, done: string, after?: () => void) =>
    command.mutate(cmd, {
      onSuccess: () => {
        toast({ title: done })
        after?.()
      },
      onError: (error) => toast({ title: "Payroll action failed", description: apiRequestErrorMessage(error), variant: "destructive" }),
    })

  const printSlips = (run: PayrollRun) =>
    void printHtmlDocument(
      buildPayslipsHtml(run.lines, { pharmacyName: profile.name, branchName: branchName(run.branchId), run }),
    ).catch((error: unknown) => toast({ title: "Could not print", description: apiRequestErrorMessage(error), variant: "destructive" }))

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>
            Payroll {r ? `— ${r.periodLabel} · ${branchName(r.branchId)}` : ""}
            {r && (
              <Badge className="ml-2" variant={runStatusVariant(r.status)}>
                {r.status}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {r
              ? `${r.periodStart} to ${r.periodEnd} · FY ${r.fiscalYearLabel}${r.preparedBy ? ` · prepared by ${r.preparedBy}` : ""}${r.approvedBy ? ` · approved by ${r.approvedBy}` : ""}${r.postingDate ? ` · posted ${r.postingDate}` : ""}${r.paidOn ? ` · paid ${r.paidOn} (${r.paymentMethod})` : ""}`
              : "Loading…"}
          </DialogDescription>
        </DialogHeader>

        {detail.isLoading ? (
          <SkeletonTable rows={4} cols={8} />
        ) : detail.isError || !r ? (
          <ErrorState message={apiRequestErrorMessage(detail.error)} onRetry={() => void detail.refetch()} />
        ) : (
          <div className="max-h-[60vh] space-y-4 overflow-y-auto">
            <LinesTable lines={r.lines} totals={r.totals} />
            {runActions(r.status).includes("post") && (
              <div className="flex flex-wrap items-end gap-3 rounded-md border p-3">
                <div className="space-y-1.5">
                  <Label htmlFor="post-date">Posting date (default: month end {r.periodEnd})</Label>
                  <DatePicker id="post-date" value={postingDate} onChange={setPostingDate} min={r.periodStart} clearable allowFuture />
                </div>
                <Button
                  disabled={command.isPending}
                  onClick={() =>
                    act({ kind: "post", id: r.id, postingDate: postingDate || null, idempotencyKey: newIdempotencyKey() }, "Payroll posted to the books")
                  }
                >
                  <Send className="mr-1 h-4 w-4" /> Post to accounts
                </Button>
                <p className="w-full text-xs text-muted-foreground">
                  Dr Salary Expense &amp; Employer SSF Expense / Cr Salaries Payable, SSF Payable, Salary TDS Payable, CIT Payable.
                </p>
              </div>
            )}
            {runActions(r.status).includes("pay") && (
              <div className="flex flex-wrap items-end gap-3 rounded-md border p-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pay-method">Paid by</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger id="pay-method" className="h-9 w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PARTY_PAYMENT_METHODS.filter((m) => m.value !== "card").map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pay-date">Paid on</Label>
                  <DatePicker id="pay-date" value={paidOn} onChange={setPaidOn} min={r.postingDate ?? r.periodStart} />
                </div>
                <Button
                  disabled={command.isPending || !paidOn}
                  onClick={() =>
                    act(
                      { kind: "pay", id: r.id, paymentMethod, paidOn: paidOn || null, idempotencyKey: newIdempotencyKey() },
                      "Salaries recorded as paid",
                    )
                  }
                >
                  <Wallet className="mr-1 h-4 w-4" /> Record payment
                </Button>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {r && (
              <>
                <Button variant="outline" onClick={() => printSlips(r)} disabled={r.lines.length === 0}>
                  <Printer className="mr-1 h-4 w-4" /> Payslips
                </Button>
                <Button
                  variant="outline"
                  onClick={() => downloadCsv(registerFileName(r, branchName(r.branchId)), REGISTER_HEADERS, payrollRegisterRows(r))}
                  disabled={r.lines.length === 0}
                >
                  <Download className="mr-1 h-4 w-4" /> Register CSV
                </Button>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {r && runActions(r.status).includes("recalculate") && (
              <Button variant="outline" disabled={command.isPending} onClick={() => act({ kind: "recalculate", id: r.id }, "Draft recalculated")}>
                <RefreshCw className="mr-1 h-4 w-4" /> Recalculate
              </Button>
            )}
            {r && runActions(r.status).includes("delete") && (
              <Button variant="outline" disabled={command.isPending} onClick={() => setConfirmDelete(true)}>
                <Trash2 className="mr-1 h-4 w-4" /> Delete draft
              </Button>
            )}
            {r && runActions(r.status).includes("approve") && (
              <Button disabled={command.isPending} onClick={() => act({ kind: "approve", id: r.id }, "Payroll approved")}>
                <CheckCircle2 className="mr-1 h-4 w-4" /> Approve
              </Button>
            )}
          </div>
        </DialogFooter>

        {r && (
          <ConfirmDialog
            isOpen={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title="Delete this draft run?"
            description={`The ${r.periodLabel} draft is removed; you can create it again.`}
            confirmText="Delete"
            variant="destructive"
            onConfirm={() => act({ kind: "delete", id: r.id }, "Draft deleted", onClose)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
