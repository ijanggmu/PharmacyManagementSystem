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
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { accountingApi, type AccountingVoucherRow } from "@/features/accounting/api-client"
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

interface VoucherRegisterTabProps {
  dateRange: DateRange | undefined
  branchFilterId: string
}

export default function VoucherRegisterTab({ dateRange, branchFilterId }: VoucherRegisterTabProps) {
  const { toast } = useToast()

  const [vouchers, setVouchers] = useState<AccountingVoucherRow[]>([])
  const [voucherMeta, setVoucherMeta] = useState<{ total?: number }>({})
  const [vouchersLoading, setVouchersLoading] = useState(false)
  const [reverseTargetId, setReverseTargetId] = useState<string | null>(null)

  const rangeStr = useMemo(() => {
    if (!dateRange) return { from: "", to: "" }
    return { from: toYmd(dateRange.from), to: toYmd(dateRange.to) }
  }, [dateRange])

  const reportBranchId = branchFilterId || undefined

  const loadVouchers = useCallback(async () => {
    if (!dateRange) return
    setVouchersLoading(true)
    try {
      const { data, meta } = await accountingApi.listVouchers({
        dateFrom: rangeStr.from,
        dateTo: rangeStr.to,
        branchId: reportBranchId,
        limit: 100,
        offset: 0,
      })
      setVouchers(data || [])
      setVoucherMeta({ total: meta?.total })
    } catch (e) {
      toast({
        title: "Voucher register failed",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      })
    } finally {
      setVouchersLoading(false)
    }
  }, [dateRange, rangeStr.from, rangeStr.to, reportBranchId, toast])

  const voucherTotals = useMemo(() => {
    return vouchers.reduce(
      (acc, row) => {
        acc.debit += Number(row.total_debit || 0)
        acc.credit += Number(row.total_credit || 0)
        return acc
      },
      { debit: 0, credit: 0 }
    )
  }, [vouchers])

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

  const exportVouchersCsv = useCallback(() => {
    if (!vouchers.length) {
      toast({ title: "No vouchers to export", variant: "destructive" })
      return
    }
    const rows = vouchers.map((v) => [
      v.voucher_no,
      v.voucher_date,
      v.voucher_type,
      v.source,
      v.source === "manual" && v.voucher_type === "journal" ? "MJE" : "SYS",
      v.status,
      v.narration || "",
      v.total_debit || 0,
      v.total_credit || 0,
    ])
    rows.push(["TOTAL", "", "", "", "", "", "", voucherTotals.debit, voucherTotals.credit])
    downloadCsv(
      `voucher-register-${rangeStr.from}-to-${rangeStr.to}.csv`,
      ["Voucher No", "Date", "Type", "Source", "Identifier", "Status", "Narration", "Debit", "Credit"],
      rows
    )
  }, [downloadCsv, rangeStr.from, rangeStr.to, toast, voucherTotals.credit, voucherTotals.debit, vouchers])

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

  const handleReverseVoucher = async (voucherId: string) => {
    try {
      await accountingApi.reverseVoucher(voucherId, rangeStr.to)
      toast({ title: "Voucher reversed" })
      await loadVouchers()
    } catch (e) {
      toast({
        title: "Reverse failed",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      })
    }
  }

  const handleConfirmReverse = async () => {
    if (!reverseTargetId) return
    const id = reverseTargetId
    setReverseTargetId(null)
    await handleReverseVoucher(id)
  }

  return (
    <>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Voucher register</CardTitle>
          <CardDescription>
            {voucherMeta.total != null ? `${voucherMeta.total} vouchers` : "Vouchers in range"}
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportVouchersCsv}>
            Export CSV
          </Button>
          <Button variant="outline" onClick={() => void loadVouchers()} disabled={vouchersLoading}>
            {vouchersLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>No.</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Identifier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Narration</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Credit</TableHead>
              <TableHead>Print</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vouchers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground">
                  No vouchers. Adjust range and refresh.
                </TableCell>
              </TableRow>
            ) : (
              vouchers.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-mono text-sm">
                    <button className="underline underline-offset-2" onClick={() => void printVoucher(v.id)}>
                      {v.voucher_no}
                    </button>
                  </TableCell>
                  <TableCell>{v.voucher_date}</TableCell>
                  <TableCell>{v.voucher_type}</TableCell>
                  <TableCell>{v.source}</TableCell>
                  <TableCell>{v.source === "manual" && v.voucher_type === "journal" ? "MJE" : "SYS"}</TableCell>
                  <TableCell>{v.status}</TableCell>
                  <TableCell className="max-w-[280px] truncate">{v.narration || "—"}</TableCell>
                  <TableCell className="text-right">{fmt(Number(v.total_debit || 0))}</TableCell>
                  <TableCell className="text-right">{fmt(Number(v.total_credit || 0))}</TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => void printVoucher(v.id)}>
                      Print
                    </Button>
                  </TableCell>
                  <TableCell>
                    {v.status === "posted" && (
                      <Button variant="outline" size="sm" onClick={() => setReverseTargetId(v.id)}>
                        Reverse
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
            {vouchers.length > 0 && (
              <TableRow>
                <TableCell colSpan={7} className="font-semibold">Totals</TableCell>
                <TableCell className="text-right font-semibold">{fmt(voucherTotals.debit)}</TableCell>
                <TableCell className="text-right font-semibold">{fmt(voucherTotals.credit)}</TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <ConfirmDialog
      isOpen={!!reverseTargetId}
      onClose={() => setReverseTargetId(null)}
      onConfirm={handleConfirmReverse}
      title="Reverse voucher?"
      description="Creates a reversing journal for this posted voucher. The original will be marked void. This cannot be undone."
      confirmText="Reverse"
    />
    </>
  )
}
