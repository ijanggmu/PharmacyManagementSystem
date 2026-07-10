"use client"

import { useCallback, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { accountingApi } from "@/features/accounting/api-client"
import { Loader2 } from "lucide-react"
import { formatLocalDateYmd } from "@/lib/utils/date"

interface DateRange {
  from: Date
  to: Date
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

interface TrialBalanceTabProps {
  dateRange: DateRange | undefined
  branchFilterId: string
  onOpenLedgerAccount: (accountCode: string) => void
}

export default function TrialBalanceTab({ dateRange, branchFilterId, onOpenLedgerAccount }: TrialBalanceTabProps) {
  const { toast } = useToast()

  const [tbRows, setTbRows] = useState<
    {
      code: string
      name: string
      debit_total: number
      credit_total: number
      balance: number
    }[]
  >([])
  const [tbBalanced, setTbBalanced] = useState(true)
  const [tbGrouped, setTbGrouped] = useState(false)
  const [tbLoading, setTbLoading] = useState(false)

  const rangeStr = useMemo(() => {
    if (!dateRange) return { from: "", to: "" }
    return { from: toYmd(dateRange.from), to: toYmd(dateRange.to) }
  }, [dateRange])

  const reportBranchId = branchFilterId || undefined

  const loadTrialBalance = useCallback(async () => {
    if (!dateRange) return
    setTbLoading(true)
    try {
      if (tbGrouped) {
        const res = await accountingApi.trialBalanceGrouped(rangeStr.from, rangeStr.to, reportBranchId)
        const flat = (res.flat_rows || []) as typeof tbRows
        setTbRows(flat)
        setTbBalanced(!!res.debits_equal_credits)
      } else {
        const res = await accountingApi.trialBalance(rangeStr.from, rangeStr.to, reportBranchId)
        setTbRows((res.rows || []) as typeof tbRows)
        setTbBalanced(!!res.debits_equal_credits)
      }
    } catch (e) {
      toast({
        title: "Trial balance failed",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      })
    } finally {
      setTbLoading(false)
    }
  }, [dateRange, rangeStr.from, rangeStr.to, reportBranchId, tbGrouped, toast])

  const tbTotals = useMemo(() => {
    return tbRows.reduce(
      (acc, row) => {
        acc.debit += Number(row.debit_total || 0)
        acc.credit += Number(row.credit_total || 0)
        acc.balance += Number(row.balance || 0)
        return acc
      },
      { debit: 0, credit: 0, balance: 0 }
    )
  }, [tbRows])

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

  const exportTrialBalanceCsv = useCallback(() => {
    if (!tbRows.length) {
      toast({ title: "No trial balance rows to export", variant: "destructive" })
      return
    }
    const rows = tbRows.map((r) => [r.code, r.name, r.debit_total, r.credit_total, r.balance])
    rows.push(["TOTAL", "", tbTotals.debit, tbTotals.credit, tbTotals.balance])
    downloadCsv(`trial-balance-${rangeStr.from}-to-${rangeStr.to}.csv`, ["Code", "Account", "Debits", "Credits", "Net"], rows)
  }, [downloadCsv, rangeStr.from, rangeStr.to, tbRows, tbTotals.balance, tbTotals.credit, tbTotals.debit, toast])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Trial balance</CardTitle>
          <CardDescription>Posted activity in the selected date range.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={tbGrouped}
              onChange={(e) => setTbGrouped(e.target.checked)}
            />
            Roll up AP supplier heads under 2100
          </label>
          <Button variant="outline" size="sm" onClick={exportTrialBalanceCsv}>
            Export CSV
          </Button>
          <Button variant="outline" onClick={() => void loadTrialBalance()} disabled={tbLoading}>
            {tbLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!tbBalanced && (
          <p className="text-sm text-destructive font-medium">
            Warning: total debits and credits do not match for this period. Review vouchers.
          </p>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className="text-right">Debits</TableHead>
              <TableHead className="text-right">Credits</TableHead>
              <TableHead className="text-right">Net</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tbRows.map((r) => (
              <TableRow key={r.code}>
                <TableCell className="font-mono">
                  <button className="underline underline-offset-2" onClick={() => onOpenLedgerAccount(r.code)}>
                    {r.code}
                  </button>
                </TableCell>
                <TableCell>
                  <button className="underline underline-offset-2" onClick={() => onOpenLedgerAccount(r.code)}>
                    {r.name}
                  </button>
                </TableCell>
                <TableCell className="text-right">{fmt(r.debit_total)}</TableCell>
                <TableCell className="text-right">{fmt(r.credit_total)}</TableCell>
                <TableCell className="text-right">{fmt(r.balance)}</TableCell>
              </TableRow>
            ))}
            {tbRows.length > 0 && (
              <TableRow>
                <TableCell colSpan={2} className="font-semibold">Totals</TableCell>
                <TableCell className="text-right font-semibold">{fmt(tbTotals.debit)}</TableCell>
                <TableCell className="text-right font-semibold">{fmt(tbTotals.credit)}</TableCell>
                <TableCell className="text-right font-semibold">{fmt(tbTotals.balance)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
