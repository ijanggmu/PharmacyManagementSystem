"use client"

import { useCallback, useMemo, useState } from "react"
import type { Dispatch, SetStateAction } from "react"
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

interface FinancialStatementsTabProps {
  dateRange: DateRange | undefined
  branchFilterId: string
  lockDate: string | null
  lockDraft: string
  setLockDraft: Dispatch<SetStateAction<string>>
  lockSaving: boolean
  setLockSaving: Dispatch<SetStateAction<boolean>>
  setLockDate: Dispatch<SetStateAction<string | null>>
}

export default function FinancialStatementsTab({
  dateRange,
  branchFilterId,
  lockDate,
  lockDraft,
  setLockDraft,
  lockSaving,
  setLockSaving,
  setLockDate,
}: FinancialStatementsTabProps) {
  const { toast } = useToast()

  const [plRows, setPlRows] = useState<
    { account_id: string; code: string; name: string; account_type: string; amount: number }[]
  >([])
  const [plNet, setPlNet] = useState(0)
  const [plLoading, setPlLoading] = useState(false)
  const [chartOfAccountsMissing, setChartOfAccountsMissing] = useState(false)

  const [bsAssets, setBsAssets] = useState<{ code: string; name: string; balance: number }[]>([])
  const [bsLiab, setBsLiab] = useState<{ code: string; name: string; balance: number }[]>([])
  const [bsEquity, setBsEquity] = useState<{ code: string; name: string; balance: number }[]>([])
  const [bsTotals, setBsTotals] = useState({
    total_assets: 0,
    total_liabilities: 0,
    total_equity: 0,
    accounting_equation_residual: 0,
  })
  const [bsLoading, setBsLoading] = useState(false)

  const rangeStr = useMemo(() => {
    if (!dateRange) return { from: "", to: "" }
    return { from: toYmd(dateRange.from), to: toYmd(dateRange.to) }
  }, [dateRange])

  const reportBranchId = branchFilterId || undefined

  const loadProfitAndLoss = useCallback(async () => {
    if (!dateRange) return
    setPlLoading(true)
    try {
      const res = await accountingApi.profitAndLoss(rangeStr.from, rangeStr.to, reportBranchId)
      const rows = (res.rows || []) as {
        account_id: string
        code: string
        name: string
        account_type: string
        amount: number
      }[]
      setPlRows(rows)
      setPlNet(Number(res.net_income ?? 0))
      setChartOfAccountsMissing(Boolean(res.chart_of_accounts_missing))
      if (res.chart_of_accounts_missing) {
        toast({
          title: "No chart of accounts set up",
          description: "Profit/loss shows 0 because nothing can post yet, not because there's no activity. Set up accounting first.",
          variant: "destructive",
        })
      }
      if (res.debits_equal_credits === false) {
        toast({
          title: "Trial balance not balanced",
          description: "P&L figures may be unreliable until debits equal credits.",
          variant: "destructive",
        })
      }
    } catch (e) {
      toast({
        title: "P&L failed",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      })
    } finally {
      setPlLoading(false)
    }
  }, [dateRange, rangeStr.from, rangeStr.to, reportBranchId, toast])

  const loadBalanceSheet = useCallback(async () => {
    if (!dateRange) return
    const asOf = rangeStr.to
    setBsLoading(true)
    try {
      const res = await accountingApi.balanceSheet(asOf, reportBranchId)
      setBsAssets((res.assets || []) as typeof bsAssets)
      setBsLiab((res.liabilities || []) as typeof bsLiab)
      setBsEquity((res.equity || []) as typeof bsEquity)
      setBsTotals({
        total_assets: res.total_assets,
        total_liabilities: res.total_liabilities,
        total_equity: res.total_equity,
        accounting_equation_residual: res.accounting_equation_residual,
      })
    } catch (e) {
      toast({
        title: "Balance sheet failed",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      })
    } finally {
      setBsLoading(false)
    }
  }, [dateRange, rangeStr.to, reportBranchId, toast])

  const savePostingLock = useCallback(async () => {
    setLockSaving(true)
    try {
      const next = lockDraft.trim() === "" ? null : lockDraft.trim().slice(0, 10)
      const res = await accountingApi.setPostingLock(next)
      setLockDate(res.lock_date ?? null)
      setLockDraft(res.lock_date ?? "")
      toast({ title: "Posting lock saved" })
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      })
    } finally {
      setLockSaving(false)
    }
  }, [lockDraft, toast, setLockSaving, setLockDate, setLockDraft])

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Profit &amp; loss</CardTitle>
              <CardDescription>Revenue and expense for the selected range (top of page).</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadProfitAndLoss()} disabled={plLoading}>
              {plLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Load
            </Button>
          </CardHeader>
          <CardContent>
            {chartOfAccountsMissing && (
              <div className="mb-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                No chart of accounts is set up for this pharmacy — nothing can post to the ledger yet, so every figure below reads as 0. This is not the same as "no profit."
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      Load P&amp;L for this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  plRows.map((r) => (
                    <TableRow key={r.account_id}>
                      <TableCell className="font-mono">{r.code}</TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell>{r.account_type}</TableCell>
                      <TableCell className="text-right">{fmt(r.amount)}</TableCell>
                    </TableRow>
                  ))
                )}
                {plRows.length > 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="font-semibold">
                      Net income
                    </TableCell>
                    <TableCell className="text-right font-semibold">{fmt(plNet)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Balance sheet</CardTitle>
              <CardDescription>Cumulative posted activity through range end date.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadBalanceSheet()} disabled={bsLoading}>
              {bsLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Load
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            {["Assets", "Liabilities", "Equity"].map((label, idx) => {
              const rows =
                idx === 0 ? bsAssets : idx === 1 ? bsLiab : bsEquity
              return (
                <div key={label}>
                  <h3 className="text-sm font-medium mb-2">{label}</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-muted-foreground text-center">
                            —
                          </TableCell>
                        </TableRow>
                      ) : (
                        rows.map((r) => (
                          <TableRow key={r.code}>
                            <TableCell className="font-mono">{r.code}</TableCell>
                            <TableCell>{r.name}</TableCell>
                            <TableCell className="text-right">{fmt(r.balance)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )
            })}
            <div className="text-sm space-y-1 border-t pt-3">
              <div className="flex justify-between">
                <span>Total assets</span>
                <span className="font-medium">{fmt(bsTotals.total_assets)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total liabilities</span>
                <span className="font-medium">{fmt(bsTotals.total_liabilities)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total equity</span>
                <span className="font-medium">{fmt(bsTotals.total_equity)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>A − L − E (unclosed P&amp;L hint)</span>
                <span>{fmt(bsTotals.accounting_equation_residual)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Period close (posting lock)</CardTitle>
          <CardDescription>
            Vouchers and automatic postings cannot use dates on or before this day. Current lock:{" "}
            <span className="font-medium">{lockDate || "—"}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-2 flex-1">
            <Label htmlFor="lock_date">Lock through (YYYY-MM-DD)</Label>
            <Input
              id="lock_date"
              type="date"
              value={lockDraft}
              onChange={(e) => setLockDraft(e.target.value)}
            />
          </div>
          <Button onClick={() => void savePostingLock()} disabled={lockSaving}>
            {lockSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save lock
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setLockDraft("")
              void (async () => {
                setLockSaving(true)
                try {
                  const res = await accountingApi.setPostingLock(null)
                  setLockDate(res.lock_date ?? null)
                  setLockDraft("")
                  toast({ title: "Posting lock cleared" })
                } catch (e) {
                  toast({
                    title: "Clear failed",
                    description: e instanceof Error ? e.message : "Error",
                    variant: "destructive",
                  })
                } finally {
                  setLockSaving(false)
                }
              })()
            }}
            disabled={lockSaving}
          >
            Clear
          </Button>
        </CardContent>
      </Card>
    </>
  )
}
