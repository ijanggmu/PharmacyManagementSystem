"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { supplierPaymentsApi } from "@/features/suppliers/api-client-payments"
import { suppliersApi, type Supplier } from "@/features/suppliers/api-client"
import { Loader2 } from "lucide-react"
import { formatLocalDateYmd } from "@/lib/utils/date"

interface DateRange {
  from: Date
  to: Date
}

interface SupplierLedgerEntry {
  id: string
  entry_date: string
  entry_type: string
  reference_number?: string | null
  supplier_bill_number?: string | null
  amount: string | number
  balance_after?: string | number | null
  description?: string | null
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

interface PayablesTabProps {
  dateRange: DateRange | undefined
  branchFilterId: string
}

export default function PayablesTab({ dateRange, branchFilterId }: PayablesTabProps) {
  const { toast } = useToast()

  const [apRows, setApRows] = useState<
    {
      supplier_id: string
      supplier_name: string
      balance: number
      current: number
      days_31_60: number
      days_61_90: number
      days_90_plus: number
    }[]
  >([])
  const [apLoading, setApLoading] = useState(false)

  const [paySuppliers, setPaySuppliers] = useState<Supplier[]>([])
  const [paySupplierId, setPaySupplierId] = useState("")
  const [payAmount, setPayAmount] = useState("")
  const [payMethod, setPayMethod] = useState<"cash" | "bank">("cash")
  const [payDate, setPayDate] = useState(toYmd(new Date()))
  const [payNote, setPayNote] = useState("")
  const [payBillNumber, setPayBillNumber] = useState("")
  const [payBillDate, setPayBillDate] = useState("")
  const [payLedger, setPayLedger] = useState<SupplierLedgerEntry[]>([])
  const [payLedgerLoading, setPayLedgerLoading] = useState(false)
  const [paySaving, setPaySaving] = useState(false)
  const [payOverpaymentConfirmed, setPayOverpaymentConfirmed] = useState(false)
  const [payOverpaymentWarning, setPayOverpaymentWarning] = useState<string | null>(null)

  const rangeStr = useMemo(() => {
    if (!dateRange) return { from: "", to: "" }
    return { from: toYmd(dateRange.from), to: toYmd(dateRange.to) }
  }, [dateRange])

  const reportBranchId = branchFilterId || undefined

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await suppliersApi.getSuppliers({ limit: 500, status: "all" })
        if (!cancelled) setPaySuppliers(res.data || [])
      } catch {
        if (!cancelled) {
          toast({ title: "Unable to load suppliers", variant: "destructive" })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [toast])

  useEffect(() => {
    if (!paySupplierId) {
      setPayLedger([])
      setPayBillNumber("")
      setPayBillDate("")
      return
    }
    let cancelled = false
    ;(async () => {
      setPayLedgerLoading(true)
      try {
        const response = await fetch(`/api/supplier-ledger?supplierId=${encodeURIComponent(paySupplierId)}`)
        const body = await response.json()
        if (!response.ok || !body?.success) {
          throw new Error(body?.error?.message || "Failed to load supplier ledger")
        }
        const entries = ((body?.data?.entries || []) as SupplierLedgerEntry[]).sort((a, b) =>
          String(b.entry_date).localeCompare(String(a.entry_date))
        )
        if (!cancelled) {
          setPayLedger(entries)
        }
      } catch (e) {
        if (!cancelled) {
          toast({
            title: "Unable to load supplier bills",
            description: e instanceof Error ? e.message : "Error",
            variant: "destructive",
          })
        }
      } finally {
        if (!cancelled) setPayLedgerLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [paySupplierId, toast])

  const loadApAging = useCallback(async () => {
    if (!dateRange) return
    setApLoading(true)
    try {
      const res = await accountingApi.apAging(rangeStr.to, reportBranchId)
      setApRows((res.rows || []) as typeof apRows)
    } catch (e) {
      toast({
        title: "AP aging failed",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      })
    } finally {
      setApLoading(false)
    }
  }, [dateRange, rangeStr.to, reportBranchId, toast])

  const submitSupplierPayment = useCallback(async () => {
    const amt = Number.parseFloat(payAmount)
    if (!paySupplierId || !Number.isFinite(amt) || amt <= 0) {
      toast({ title: "Supplier and positive amount required", variant: "destructive" })
      return
    }
    setPaySaving(true)
    try {
      const billRef = [payBillNumber.trim(), payBillDate.trim()].filter(Boolean).join(" / ")
      const noteParts = [billRef ? `Bill: ${billRef}` : "", payNote.trim()].filter(Boolean)
      await supplierPaymentsApi.post({
        supplier_id: paySupplierId,
        amount: amt,
        payment_method: payMethod,
        payment_date: payDate,
        reference_note: noteParts.length ? noteParts.join(" | ") : null,
        allow_overpayment: payOverpaymentConfirmed,
      })
      toast({ title: "Payment recorded" })
      setPayAmount("")
      setPayNote("")
      setPayBillNumber("")
      setPayBillDate("")
      setPayOverpaymentConfirmed(false)
      setPayOverpaymentWarning(null)
      await loadApAging()
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error"
      if (/exceeds the outstanding balance/i.test(message)) {
        setPayOverpaymentWarning(message)
      } else {
        toast({ title: "Payment failed", description: message, variant: "destructive" })
      }
    } finally {
      setPaySaving(false)
    }
  }, [paySupplierId, payAmount, payMethod, payDate, payNote, payOverpaymentConfirmed, toast, loadApAging])

  const exportSupplierStatementCsv = async () => {
    if (!paySupplierId || !dateRange) {
      toast({ title: "Select supplier and date range", variant: "destructive" })
      return
    }
    try {
      const stmt = await suppliersApi.statement(paySupplierId, rangeStr.from, rangeStr.to, reportBranchId)
      const header = ["date", "type", "reference", "bill_no", "description", "amount", "balance"]
      const lines = [
        header.join(","),
        ...stmt.lines.map((l) =>
          [
            csvCell(l.entry_date),
            csvCell(l.entry_type),
            csvCell(l.reference_number),
            csvCell(l.supplier_bill_number),
            csvCell(l.description),
            l.amount,
            l.balance_after ?? "",
          ].join(",")
        ),
      ]
      const blob = new Blob([lines.join("\n")], { type: "text/csv" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `supplier-statement-${paySupplierId.slice(0, 8)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      })
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>AP aging</CardTitle>
            <CardDescription>Outstanding supplier balances by invoice age (as of range end).</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void exportSupplierStatementCsv()} disabled={!paySupplierId}>
              Export statement
            </Button>
            <Button variant="outline" size="sm" onClick={() => void loadApAging()} disabled={apLoading}>
              {apLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">0–30</TableHead>
                <TableHead className="text-right">31–60</TableHead>
                <TableHead className="text-right">61–90</TableHead>
                <TableHead className="text-right">90+</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No balances or refresh to load.
                  </TableCell>
                </TableRow>
              ) : (
                apRows.map((r) => (
                  <TableRow key={r.supplier_id}>
                    <TableCell>{r.supplier_name}</TableCell>
                    <TableCell className="text-right">{fmt(r.balance)}</TableCell>
                    <TableCell className="text-right">{fmt(r.current)}</TableCell>
                    <TableCell className="text-right">{fmt(r.days_31_60)}</TableCell>
                    <TableCell className="text-right">{fmt(r.days_61_90)}</TableCell>
                    <TableCell className="text-right">{fmt(r.days_90_plus)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Record supplier payment</CardTitle>
          <CardDescription>Posts sub-ledger payment and GL voucher (Dr AP, Cr cash/bank).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Supplier</Label>
            <Select
              value={paySupplierId}
              onValueChange={(v) => {
                setPaySupplierId(v)
                setPayOverpaymentConfirmed(false)
                setPayOverpaymentWarning(null)
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select supplier" />
              </SelectTrigger>
              <SelectContent>
                {paySuppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay_amt">Amount</Label>
            <Input
              id="pay_amt"
              type="text"
              inputMode="decimal"
              value={payAmount}
              onChange={(e) => {
                setPayAmount(e.target.value)
                setPayOverpaymentConfirmed(false)
                setPayOverpaymentWarning(null)
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>Method</Label>
            <Select value={payMethod} onValueChange={(v) => setPayMethod(v as "cash" | "bank")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash (1000)</SelectItem>
                <SelectItem value="bank">Bank (1010)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay_dt">Payment date</Label>
            <Input id="pay_dt" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay_ref">Reference (optional)</Label>
            <Input id="pay_ref" value={payNote} onChange={(e) => setPayNote(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay_bill_no">Supplier bill number (optional)</Label>
            <Input
              id="pay_bill_no"
              value={payBillNumber}
              onChange={(e) => setPayBillNumber(e.target.value)}
              placeholder="e.g. TAX-INV-1032"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay_bill_date">Supplier bill date (optional)</Label>
            <Input
              id="pay_bill_date"
              type="date"
              value={payBillDate}
              onChange={(e) => setPayBillDate(e.target.value)}
            />
          </div>
          {payOverpaymentWarning && (
            <div className="md:col-span-2 rounded-md border border-amber-400/50 bg-amber-50 p-3 text-sm space-y-2">
              <p className="text-amber-800">{payOverpaymentWarning}</p>
              <label className="flex items-center gap-2 text-amber-900">
                <input
                  type="checkbox"
                  checked={payOverpaymentConfirmed}
                  onChange={(e) => setPayOverpaymentConfirmed(e.target.checked)}
                />
                Record this as an intentional advance payment
              </label>
            </div>
          )}
          <div className="md:col-span-2">
            <Button
              onClick={() => void submitSupplierPayment()}
              disabled={paySaving || (!!payOverpaymentWarning && !payOverpaymentConfirmed)}
            >
              {paySaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Post payment
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Supplier bill & payable entries</CardTitle>
          <CardDescription>
            Select a supplier to see bill numbers/dates, payable invoices, and payment movements.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Supplier bill #</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!paySupplierId ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Choose supplier to view bill-wise payable entries.
                  </TableCell>
                </TableRow>
              ) : payLedgerLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Loading supplier entries...
                  </TableCell>
                </TableRow>
              ) : payLedger.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No entries found for this supplier.
                  </TableCell>
                </TableRow>
              ) : (
                payLedger.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{String(row.entry_date).slice(0, 10)}</TableCell>
                    <TableCell className="capitalize">{row.entry_type}</TableCell>
                    <TableCell className="font-mono text-xs">{row.supplier_bill_number || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{row.reference_number || "—"}</TableCell>
                    <TableCell className="text-right">{fmt(Number(row.amount || 0))}</TableCell>
                    <TableCell className="text-right">{fmt(Number(row.balance_after || 0))}</TableCell>
                    <TableCell>
                      {row.entry_type === "invoice" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setPayBillNumber(row.supplier_bill_number || "")
                            setPayBillDate(String(row.entry_date).slice(0, 10))
                          }}
                        >
                          Use bill
                        </Button>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}
