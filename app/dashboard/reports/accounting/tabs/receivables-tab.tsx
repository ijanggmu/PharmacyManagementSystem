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
import { customersApi, type Customer } from "@/features/customers/api-client"
import { customerPaymentsApi } from "@/features/customer-payments/api-client"
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

interface ReceivablesTabProps {
  dateRange: DateRange | undefined
  branchFilterId: string
}

export default function ReceivablesTab({ dateRange, branchFilterId }: ReceivablesTabProps) {
  const { toast } = useToast()

  const [arRows, setArRows] = useState<
    {
      customer_id: string | null
      customer_name: string
      balance: number
      current: number
      days_31_60: number
      days_61_90: number
      days_90_plus: number
    }[]
  >([])
  const [arLoading, setArLoading] = useState(false)

  const [arCustomers, setArCustomers] = useState<Customer[]>([])
  const [arCustomerId, setArCustomerId] = useState("")
  const [arCustomerLoading, setArCustomerLoading] = useState(false)
  const [customerLedgerRows, setCustomerLedgerRows] = useState<
    {
      id: string
      entry_date: string
      entry_type: string
      description: string | null
      amount: number
      balance_after: number | null
      reference_number: string | null
    }[]
  >([])
  const [customerOpenInvoices, setCustomerOpenInvoices] = useState<
    {
      sale_id: string
      sale_date: string
      invoice_number: string | null
      open_amount: number
    }[]
  >([])
  const [customerLedgerLoading, setCustomerLedgerLoading] = useState(false)
  const [customerPaymentAmount, setCustomerPaymentAmount] = useState("")
  const [customerPaymentMethod, setCustomerPaymentMethod] = useState<"cash" | "bank">("cash")
  const [customerPaymentDate, setCustomerPaymentDate] = useState(toYmd(new Date()))
  const [customerPaymentNote, setCustomerPaymentNote] = useState("")
  const [customerPaymentSaving, setCustomerPaymentSaving] = useState(false)

  const rangeStr = useMemo(() => {
    if (!dateRange) return { from: "", to: "" }
    return { from: toYmd(dateRange.from), to: toYmd(dateRange.to) }
  }, [dateRange])

  const reportBranchId = branchFilterId || undefined

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setArCustomerLoading(true)
      try {
        const res = await customersApi.getCustomers({ limit: 200, includeRelations: false })
        if (!cancelled) setArCustomers(res.data || [])
      } catch {
        if (!cancelled) toast({ title: "Unable to load customers", variant: "destructive" })
      } finally {
        if (!cancelled) setArCustomerLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [toast])

  useEffect(() => {
    if (!arCustomerId || !dateRange) {
      setCustomerLedgerRows([])
      setCustomerOpenInvoices([])
      return
    }
    let cancelled = false
    ;(async () => {
      setCustomerLedgerLoading(true)
      try {
        const [ledgerRes, openRes] = await Promise.all([
          fetch(`/api/customers/${encodeURIComponent(arCustomerId)}/ledger?limit=200`, { cache: "no-store" }),
          fetch(`/api/customers/${encodeURIComponent(arCustomerId)}/open-invoices?asOf=${encodeURIComponent(rangeStr.to)}`, {
            cache: "no-store",
          }),
        ])
        const ledgerBody = await ledgerRes.json()
        const openBody = await openRes.json()
        if (!ledgerRes.ok || !ledgerBody?.success) throw new Error(ledgerBody?.error?.message || "Failed to load ledger")
        if (!openRes.ok || !openBody?.success) throw new Error(openBody?.error?.message || "Failed to load open invoices")

        const rows = (ledgerBody?.data?.rows || []) as any[]
        const open = (openBody?.data?.rows || []) as any[]
        if (!cancelled) {
          setCustomerLedgerRows(
            rows.map((r) => ({
              id: r.id,
              entry_date: String(r.entry_date).slice(0, 10),
              entry_type: r.entry_type,
              description: r.description ?? null,
              amount: Number(r.amount || 0),
              balance_after: r.balance_after == null ? null : Number(r.balance_after),
              reference_number: r.reference_number ?? null,
            }))
          )
          setCustomerOpenInvoices(
            open.map((o) => ({
              sale_id: o.sale_id,
              sale_date: String(o.sale_date).slice(0, 10),
              invoice_number: o.invoice_number ?? null,
              open_amount: Number(o.open_amount || 0),
            }))
          )
        }
      } catch (e) {
        if (!cancelled) {
          toast({
            title: "Receivables load failed",
            description: e instanceof Error ? e.message : "Error",
            variant: "destructive",
          })
        }
      } finally {
        if (!cancelled) setCustomerLedgerLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [arCustomerId, dateRange, rangeStr.to, toast])

  const loadArAging = useCallback(async () => {
    if (!dateRange) return
    setArLoading(true)
    try {
      const res = await accountingApi.arAging(rangeStr.to, reportBranchId)
      setArRows((res.rows || []) as typeof arRows)
    } catch (e) {
      toast({
        title: "AR aging failed",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      })
    } finally {
      setArLoading(false)
    }
  }, [dateRange, rangeStr.to, reportBranchId, toast])

  const submitCustomerPayment = useCallback(async () => {
    const amt = Number.parseFloat(customerPaymentAmount)
    if (!arCustomerId || !Number.isFinite(amt) || amt <= 0) {
      toast({ title: "Customer and positive amount required", variant: "destructive" })
      return
    }
    setCustomerPaymentSaving(true)
    try {
      await customerPaymentsApi.post({
        customer_id: arCustomerId,
        amount: amt,
        payment_method: customerPaymentMethod,
        payment_date: customerPaymentDate,
        reference_note: customerPaymentNote.trim() || null,
        allocations: null,
      })
      toast({ title: "Customer receipt posted" })
      setCustomerPaymentAmount("")
      setCustomerPaymentNote("")
      // reload ledger + open invoices
      const current = arCustomerId
      setArCustomerId("")
      setTimeout(() => setArCustomerId(current), 0)
    } catch (e) {
      toast({
        title: "Customer payment failed",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      })
    } finally {
      setCustomerPaymentSaving(false)
    }
  }, [
    arCustomerId,
    customerPaymentAmount,
    customerPaymentMethod,
    customerPaymentDate,
    customerPaymentNote,
    toast,
  ])

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>AR aging</CardTitle>
            <CardDescription>
              Open credit invoices bucketed by age (as of range end). Use customer ledger to drill in.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadArAging()} disabled={arLoading}>
            {arLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">0–30</TableHead>
                <TableHead className="text-right">31–60</TableHead>
                <TableHead className="text-right">61–90</TableHead>
                <TableHead className="text-right">90+</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {arRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No open receivables or refresh to load.
                  </TableCell>
                </TableRow>
              ) : (
                arRows.map((r, i) => (
                  <TableRow key={`${r.customer_id ?? "walk"}-${i}`}>
                    <TableCell>{r.customer_name}</TableCell>
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

      <Card>
        <CardHeader>
          <CardTitle>Customer ledger</CardTitle>
          <CardDescription>Sub-ledger entries that reconcile to AR control (1100).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Customer</Label>
            <Select value={arCustomerId} onValueChange={setArCustomerId} disabled={arCustomerLoading}>
              <SelectTrigger>
                <SelectValue placeholder={arCustomerLoading ? "Loading…" : "Select customer"} />
              </SelectTrigger>
              <SelectContent>
                {arCustomers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.first_name} {c.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border p-4 space-y-3">
            <h3 className="font-medium">Record customer receipt</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Amount</Label>
                <Input
                  value={customerPaymentAmount}
                  onChange={(e) => setCustomerPaymentAmount(e.target.value)}
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-2">
                <Label>Method</Label>
                <Select
                  value={customerPaymentMethod}
                  onValueChange={(v) => setCustomerPaymentMethod(v as "cash" | "bank")}
                >
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
                <Label>Date</Label>
                <Input type="date" value={customerPaymentDate} onChange={(e) => setCustomerPaymentDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Reference</Label>
                <Input value={customerPaymentNote} onChange={(e) => setCustomerPaymentNote(e.target.value)} placeholder="Optional note" />
              </div>
            </div>
            <Button onClick={() => void submitCustomerPayment()} disabled={customerPaymentSaving || !arCustomerId}>
              {customerPaymentSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Post receipt
            </Button>
          </div>

          {customerLedgerLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Open invoices</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead className="text-right">Open</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerOpenInvoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">No open invoices.</TableCell>
                      </TableRow>
                    ) : (
                      customerOpenInvoices.map((inv) => (
                        <TableRow key={inv.sale_id}>
                          <TableCell>{inv.sale_date}</TableCell>
                          <TableCell className="font-mono text-xs">{inv.invoice_number || inv.sale_id}</TableCell>
                          <TableCell className="text-right">{fmt(inv.open_amount)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium">Ledger entries</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Ref</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerLedgerRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">No ledger rows.</TableCell>
                      </TableRow>
                    ) : (
                      customerLedgerRows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>{r.entry_date}</TableCell>
                          <TableCell className="capitalize">{r.entry_type}</TableCell>
                          <TableCell className="font-mono text-xs">{r.reference_number || "—"}</TableCell>
                          <TableCell className="text-right">{fmt(r.amount)}</TableCell>
                          <TableCell className="text-right">{r.balance_after == null ? "—" : fmt(r.balance_after)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
