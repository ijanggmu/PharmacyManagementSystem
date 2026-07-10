"use client"

import { useCallback, useMemo } from "react"
import type { Dispatch, SetStateAction } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { accountingApi, type AccountingAccount } from "@/features/accounting/api-client"
import { Loader2 } from "lucide-react"
import { formatLocalDateYmd } from "@/lib/utils/date"

interface DateRange {
  from: Date
  to: Date
}

interface GlRow {
  voucher_date: string
  voucher_no: string
  voucher_id: string
  line_no: number
  description: string | null
  debit_amount: number
  credit_amount: number
  running_balance: number
}

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function toYmd(d: Date) {
  return formatLocalDateYmd(d)
}

function csvCell(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value)
  const escaped = text.replace(/"/g, '""')
  return `"${escaped}"`
}

interface GeneralLedgerTabProps {
  dateRange: DateRange | undefined
  branchFilterId: string
  accounts: AccountingAccount[]
  accountsLoading: boolean
  glAccountId: string
  setGlAccountId: Dispatch<SetStateAction<string>>
  glRows: GlRow[]
  setGlRows: Dispatch<SetStateAction<GlRow[]>>
  glOpening: number
  setGlOpening: Dispatch<SetStateAction<number>>
  glLoading: boolean
  setGlLoading: Dispatch<SetStateAction<boolean>>
}

export default function GeneralLedgerTab({
  dateRange,
  branchFilterId,
  accounts,
  accountsLoading,
  glAccountId,
  setGlAccountId,
  glRows,
  setGlRows,
  glOpening,
  setGlOpening,
  glLoading,
  setGlLoading,
}: GeneralLedgerTabProps) {
  const { toast } = useToast()

  const rangeStr = useMemo(() => {
    if (!dateRange) return { from: "", to: "" }
    return { from: toYmd(dateRange.from), to: toYmd(dateRange.to) }
  }, [dateRange])

  const reportBranchId = branchFilterId || undefined

  const loadGeneralLedger = useCallback(async () => {
    if (!dateRange || !glAccountId) {
      toast({ title: "Select account and date range", variant: "destructive" })
      return
    }
    setGlLoading(true)
    try {
      const res = await accountingApi.generalLedger(glAccountId, rangeStr.from, rangeStr.to, reportBranchId)
      setGlOpening(Number(res.opening_balance ?? 0))
      setGlRows((res.rows || []) as typeof glRows)
    } catch (e) {
      toast({
        title: "General ledger failed",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      })
    } finally {
      setGlLoading(false)
    }
  }, [dateRange, glAccountId, rangeStr.from, rangeStr.to, reportBranchId, toast, setGlLoading, setGlOpening, setGlRows, glRows])

  const glTotals = useMemo(() => {
    const debit = glRows.reduce((sum, row) => sum + Number(row.debit_amount || 0), 0)
    const credit = glRows.reduce((sum, row) => sum + Number(row.credit_amount || 0), 0)
    const closing = glRows.length ? glRows[glRows.length - 1].running_balance : glOpening
    return { debit, credit, closing }
  }, [glRows, glOpening])

  const downloadCsv = useCallback((filename: string, headers: string[], rows: (string | number | null | undefined)[][]) => {
    const headerLine = headers.map((h) => csvCell(h)).join(",")
    const rowLines = rows.map((row) => row.map((c) => csvCell(c)).join(","))
    const content = [headerLine, ...rowLines].join("\n")
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, [])

  const exportLedgerCsv = useCallback(() => {
    if (!glRows.length) {
      toast({ title: "No ledger rows to export", variant: "destructive" })
      return
    }
    const rows = glRows.map((r) => [
      r.voucher_date,
      r.voucher_no,
      r.line_no,
      r.description || "",
      r.debit_amount,
      r.credit_amount,
      r.running_balance,
    ])
    rows.push(["TOTAL", "", "", "", glTotals.debit, glTotals.credit, glTotals.closing])
    downloadCsv(`general-ledger-${rangeStr.from}-to-${rangeStr.to}.csv`, ["Date", "Voucher", "Line", "Memo", "Debit", "Credit", "Running Balance"], rows)
  }, [downloadCsv, glRows, glTotals.closing, glTotals.credit, glTotals.debit, rangeStr.from, rangeStr.to, toast])

  const printVoucher = useCallback(async (voucherId: string) => {
    try {
      const detail = await accountingApi.getVoucher(voucherId)
      const voucher = detail.voucher
      const lines = detail.lines || []
      const totalDebit = lines.reduce((sum, l) => sum + Number(l.debit_amount || 0), 0)
      const totalCredit = lines.reduce((sum, l) => sum + Number(l.credit_amount || 0), 0)
      const identifier =
        voucher.source === "manual" && voucher.voucher_type === "journal" ? "MJE" : "SYS"
      const lineRows = lines
        .map(
          (line) => `
            <tr>
              <td style="padding:6px;border:1px solid #ccc;">${line.line_no}</td>
              <td style="padding:6px;border:1px solid #ccc;">${line.accounting_accounts?.code || ""}</td>
              <td style="padding:6px;border:1px solid #ccc;">${line.accounting_accounts?.name || ""}</td>
              <td style="padding:6px;border:1px solid #ccc;">${line.description || "-"}</td>
              <td style="padding:6px;border:1px solid #ccc;text-align:right;">${fmt(Number(line.debit_amount || 0))}</td>
              <td style="padding:6px;border:1px solid #ccc;text-align:right;">${fmt(Number(line.credit_amount || 0))}</td>
            </tr>
          `
        )
        .join("")

      const w = window.open("", "_blank", "width=1000,height=800")
      if (!w) {
        toast({ title: "Unable to open print preview", variant: "destructive" })
        return
      }
      w.document.write(`
        <html>
          <head><title>Voucher ${voucher.voucher_no}</title></head>
          <body style="font-family:Arial, sans-serif; padding:20px;">
            <h2>Voucher</h2>
            <p><strong>No:</strong> ${voucher.voucher_no} (${identifier})</p>
            <p><strong>Date:</strong> ${voucher.voucher_date}</p>
            <p><strong>Type:</strong> ${voucher.voucher_type}</p>
            <p><strong>Status:</strong> ${voucher.status}</p>
            <p><strong>Narration:</strong> ${voucher.narration || "-"}</p>
            <table style="border-collapse:collapse; width:100%; margin-top:12px;">
              <thead>
                <tr>
                  <th style="padding:6px;border:1px solid #ccc;">#</th>
                  <th style="padding:6px;border:1px solid #ccc;">Code</th>
                  <th style="padding:6px;border:1px solid #ccc;">Account</th>
                  <th style="padding:6px;border:1px solid #ccc;">Memo</th>
                  <th style="padding:6px;border:1px solid #ccc;">Debit</th>
                  <th style="padding:6px;border:1px solid #ccc;">Credit</th>
                </tr>
              </thead>
              <tbody>${lineRows}</tbody>
              <tfoot>
                <tr>
                  <td colspan="4" style="padding:6px;border:1px solid #ccc;font-weight:700;">Total</td>
                  <td style="padding:6px;border:1px solid #ccc;text-align:right;font-weight:700;">${fmt(totalDebit)}</td>
                  <td style="padding:6px;border:1px solid #ccc;text-align:right;font-weight:700;">${fmt(totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
            <script>window.print();</script>
          </body>
        </html>
      `)
      w.document.close()
    } catch (e) {
      toast({
        title: "Print failed",
        description: e instanceof Error ? e.message : "Unable to print voucher",
        variant: "destructive",
      })
    }
  }, [toast])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>General ledger</CardTitle>
            <CardDescription>Posted vouchers only. Running balance by account.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={exportLedgerCsv}>
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="space-y-2 flex-1 min-w-[200px]">
            <Label>Account</Label>
            <Select
              value={glAccountId}
              onValueChange={setGlAccountId}
              disabled={accountsLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder={accountsLoading ? "Loading…" : "Select account"} />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => void loadGeneralLedger()} disabled={glLoading}>
            {glLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Load
          </Button>
        </div>
        <div className="text-sm text-muted-foreground">
          Opening balance (before period): <span className="font-medium">{fmt(glOpening)}</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Voucher</TableHead>
              <TableHead>Line</TableHead>
              <TableHead>Memo</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Credit</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {glRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No rows. Choose an account and load.
                </TableCell>
              </TableRow>
            ) : (
              glRows.map((r, i) => (
                <TableRow key={`${r.voucher_no}-${r.line_no}-${i}`}>
                  <TableCell>{r.voucher_date}</TableCell>
                  <TableCell className="font-mono text-sm">
                    <button className="underline underline-offset-2" onClick={() => void printVoucher(r.voucher_id)}>
                      {r.voucher_no}
                    </button>
                  </TableCell>
                  <TableCell>{r.line_no}</TableCell>
                  <TableCell>{r.description || "—"}</TableCell>
                  <TableCell className="text-right">{r.debit_amount ? fmt(r.debit_amount) : "—"}</TableCell>
                  <TableCell className="text-right">{r.credit_amount ? fmt(r.credit_amount) : "—"}</TableCell>
                  <TableCell className="text-right font-medium">{fmt(r.running_balance)}</TableCell>
                </TableRow>
              ))
            )}
            {glRows.length > 0 && (
              <TableRow>
                <TableCell colSpan={4} className="font-semibold">Totals</TableCell>
                <TableCell className="text-right font-semibold">{fmt(glTotals.debit)}</TableCell>
                <TableCell className="text-right font-semibold">{fmt(glTotals.credit)}</TableCell>
                <TableCell className="text-right font-semibold">{fmt(glTotals.closing)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
