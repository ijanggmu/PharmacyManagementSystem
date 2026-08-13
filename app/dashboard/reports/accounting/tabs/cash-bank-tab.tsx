"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { accountingApi } from "@/features/accounting/api-client"
import { bankDepositsApi } from "@/features/bank-deposits/api-client"
import { cashShiftsApi, type CashShift } from "@/features/cash-shifts/api-client"
import { Loader2 } from "lucide-react"
import { formatLocalDateYmd } from "@/lib/utils/date"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

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

interface CashBankTabProps {
  dateRange: DateRange | undefined
  branchFilterId: string
}

export default function CashBankTab({ dateRange, branchFilterId }: CashBankTabProps) {
  const { toast } = useToast()

  const [cashReport, setCashReport] = useState<Awaited<ReturnType<typeof accountingApi.cashMovement>> | null>(null)
  const [cashLoading, setCashLoading] = useState(false)
  const [bankDeposits, setBankDeposits] = useState<
    { id: string; deposit_date: string; amount: number | string; reference_note: string | null }[]
  >([])
  const [depositAmount, setDepositAmount] = useState("")
  const [depositDate, setDepositDate] = useState(toYmd(new Date()))
  const [depositNote, setDepositNote] = useState("")
  const [depositSaving, setDepositSaving] = useState(false)
  const [closedShifts, setClosedShifts] = useState<CashShift[]>([])
  const [depositShiftId, setDepositShiftId] = useState<string>("")

  const rangeStr = useMemo(() => {
    if (!dateRange) return { from: "", to: "" }
    return { from: toYmd(dateRange.from), to: toYmd(dateRange.to) }
  }, [dateRange])

  const reportBranchId = branchFilterId || undefined

  useEffect(() => {
    setDepositShiftId("")
    if (!branchFilterId) {
      setClosedShifts([])
      return
    }
    let cancelled = false
    cashShiftsApi
      .list({ branch_id: branchFilterId, status: "closed" })
      .then((shifts) => {
        if (!cancelled) setClosedShifts(shifts.slice(0, 20))
      })
      .catch(() => {
        if (!cancelled) setClosedShifts([])
      })
    return () => {
      cancelled = true
    }
  }, [branchFilterId])

  const loadCashMovement = useCallback(async () => {
    if (!dateRange) return
    setCashLoading(true)
    try {
      const res = await accountingApi.cashMovement(rangeStr.from, rangeStr.to, reportBranchId)
      setCashReport(res)
      const deposits = await bankDepositsApi.list({
        branch_id: reportBranchId,
        from: rangeStr.from,
        to: rangeStr.to,
        limit: 20,
      })
      setBankDeposits(deposits || [])
    } catch (e) {
      toast({
        title: "Cash report failed",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      })
    } finally {
      setCashLoading(false)
    }
  }, [dateRange, rangeStr.from, rangeStr.to, reportBranchId, toast])

  const submitBankDeposit = async () => {
    const branch = reportBranchId || branchFilterId
    if (!branch) {
      toast({ title: "Select a branch for bank deposit", variant: "destructive" })
      return
    }
    const amount = Number.parseFloat(depositAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: "Enter a valid deposit amount", variant: "destructive" })
      return
    }
    setDepositSaving(true)
    try {
      await bankDepositsApi.record({
        branch_id: branch,
        amount,
        deposit_date: depositDate,
        reference_note: depositNote.trim() || null,
        cash_shift_id: depositShiftId || null,
      })
      toast({ title: "Bank deposit recorded", description: "Voucher: Dr Bank, Cr Cash" })
      setDepositAmount("")
      setDepositNote("")
      setDepositShiftId("")
      await loadCashMovement()
    } catch (e) {
      toast({
        title: "Deposit failed",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      })
    } finally {
      setDepositSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>Cash &amp; bank movement</CardTitle>
            <CardDescription>
              Posted GL for cash (1000) and bank (1010). Filter by branch when selected.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadCashMovement()} disabled={cashLoading}>
            {cashLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {cashReport == null ? (
            <p className="text-sm text-muted-foreground">Click Refresh to load movement for the date range.</p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-md border p-3 space-y-1 text-sm">
                  <p className="font-medium">Cash on hand (1000)</p>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Opening</span>
                    <span>{fmt(cashReport.cash_opening)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Receipts</span>
                    <span>{fmt(cashReport.cash_receipts)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Payments</span>
                    <span>{fmt(cashReport.cash_payments)}</span>
                  </div>
                  <div className="flex justify-between font-medium border-t pt-1">
                    <span>Closing</span>
                    <span>{fmt(cashReport.cash_closing)}</span>
                  </div>
                </div>
                <div className="rounded-md border p-3 space-y-1 text-sm">
                  <p className="font-medium">Bank (1010)</p>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Opening</span>
                    <span>{fmt(cashReport.bank_opening)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Receipts</span>
                    <span>{fmt(cashReport.bank_receipts)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Payments</span>
                    <span>{fmt(cashReport.bank_payments)}</span>
                  </div>
                  <div className="flex justify-between font-medium border-t pt-1">
                    <span>Closing</span>
                    <span>{fmt(cashReport.bank_closing)}</span>
                  </div>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Voucher</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cashReport.lines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-muted-foreground">
                        No cash/bank lines in this period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    cashReport.lines.map((line) => (
                      <TableRow key={`${line.voucher_id}-${line.account_code}-${line.debit_amount}`}>
                        <TableCell>{line.voucher_date}</TableCell>
                        <TableCell className="font-mono text-xs">{line.voucher_no}</TableCell>
                        <TableCell>
                          {line.account_code} {line.account_name}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">{line.description}</TableCell>
                        <TableCell className="text-right">{line.debit_amount ? fmt(line.debit_amount) : ""}</TableCell>
                        <TableCell className="text-right">{line.credit_amount ? fmt(line.credit_amount) : ""}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Record bank deposit</CardTitle>
          <CardDescription>
            Transfer cash to bank (posts Dr Bank 1010, Cr Cash 1000). Requires a branch filter.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3 max-w-xl">
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Deposit date</Label>
              <Input type="date" value={depositDate} onChange={(e) => setDepositDate(e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-3">
              <Label>From cash shift (optional)</Label>
              <Select value={depositShiftId || "none"} onValueChange={(v) => setDepositShiftId(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Not linked to a shift" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not linked to a shift</SelectItem>
                  {closedShifts.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      Closed {new Date(s.closed_at || s.opened_at).toLocaleString()} — counted{" "}
                      {s.counted_cash_closing != null ? s.counted_cash_closing.toFixed(2) : "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Links this deposit back to the shift whose counted cash it came from.
              </p>
            </div>
            <div className="space-y-1 sm:col-span-3">
              <Label>Reference note</Label>
              <Input value={depositNote} onChange={(e) => setDepositNote(e.target.value)} />
            </div>
          </div>
          <Button onClick={() => void submitBankDeposit()} disabled={depositSaving}>
            {depositSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Post bank deposit
          </Button>
          {bankDeposits.length > 0 && (
            <div className="pt-2">
              <h4 className="text-sm font-medium mb-2">Recent deposits (period)</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bankDeposits.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>{d.deposit_date}</TableCell>
                      <TableCell className="text-right">{fmt(Number(d.amount))}</TableCell>
                      <TableCell>{d.reference_note || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
