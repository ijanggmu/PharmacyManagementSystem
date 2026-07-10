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

interface ReconciliationTabProps {
  dateRange: DateRange | undefined
  branchFilterId: string
}

export default function ReconciliationTab({ dateRange, branchFilterId }: ReconciliationTabProps) {
  const { toast } = useToast()

  const [reconAp, setReconAp] = useState<{
    subledger_ap_total: number
    gl_ap_total: number
    difference: number
    gl_ap_breakdown: { account_id: string; code: string; name: string; balance: number }[]
    trial_balance_ok: boolean
  } | null>(null)
  const [reconInv, setReconInv] = useState<{
    stock_valuation: number
    gl_inventory_balance: number
    difference: number
    trial_balance_ok: boolean
  } | null>(null)
  const [reconAr, setReconAr] = useState<{
    subledger_ar_total: number
    gl_ar_total: number
    difference: number
    trial_balance_ok: boolean
  } | null>(null)
  const [reconLoading, setReconLoading] = useState(false)

  const rangeStr = useMemo(() => {
    if (!dateRange) return { from: "", to: "" }
    return { from: toYmd(dateRange.from), to: toYmd(dateRange.to) }
  }, [dateRange])

  const reportBranchId = branchFilterId || undefined

  const loadReconciliationReports = useCallback(async () => {
    if (!dateRange) return
    setReconLoading(true)
    try {
      const asOf = rangeStr.to
      const [ap, inv, ar] = await Promise.all([
        accountingApi.apGlReconciliation(asOf, reportBranchId),
        accountingApi.inventoryGlReconciliation(asOf, reportBranchId),
        accountingApi.arGlReconciliation(asOf, reportBranchId),
      ])
      setReconAp({
        subledger_ap_total: ap.subledger_ap_total,
        gl_ap_total: ap.gl_ap_total,
        difference: ap.difference,
        gl_ap_breakdown: ap.gl_ap_breakdown,
        trial_balance_ok: ap.trial_balance_ok,
      })
      setReconInv({
        stock_valuation: inv.stock_valuation,
        gl_inventory_balance: inv.gl_inventory_balance,
        difference: inv.difference,
        trial_balance_ok: inv.trial_balance_ok,
      })
      setReconAr({
        subledger_ar_total: ar.subledger_ar_total,
        gl_ar_total: ar.gl_ar_total,
        difference: ar.difference,
        trial_balance_ok: ar.trial_balance_ok,
      })
    } catch (e) {
      toast({
        title: "Reconciliation failed",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      })
    } finally {
      setReconLoading(false)
    }
  }, [dateRange, rangeStr.to, reportBranchId, toast])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          As-of date uses the <span className="font-medium">range end</span> from the date picker above.
        </p>
        <Button variant="outline" onClick={() => void loadReconciliationReports()} disabled={reconLoading}>
          {reconLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Load reconciliation
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>AP sub-ledger vs GL</CardTitle>
            <CardDescription>
              Supplier ledger totals vs trade payables (2100 + per-supplier AP heads).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {reconAp == null ? (
              <p className="text-sm text-muted-foreground">Load to compare.</p>
            ) : (
              <>
                {!reconAp.trial_balance_ok && (
                  <p className="text-sm text-destructive">Trial balance is not balanced; interpret with care.</p>
                )}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Sub-ledger AP</div>
                  <div className="text-right font-medium">{fmt(reconAp.subledger_ap_total)}</div>
                  <div className="text-muted-foreground">GL AP (sum)</div>
                  <div className="text-right font-medium">{fmt(reconAp.gl_ap_total)}</div>
                  <div className="text-muted-foreground">Difference</div>
                  <div className="text-right font-medium">{fmt(reconAp.difference)}</div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">GL balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reconAp.gl_ap_breakdown.map((r) => (
                      <TableRow key={r.account_id}>
                        <TableCell className="font-mono">{r.code}</TableCell>
                        <TableCell>{r.name}</TableCell>
                        <TableCell className="text-right">{fmt(r.balance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Stock valuation vs GL inventory</CardTitle>
            <CardDescription>
              Σ (quantity × cost_price) on medicines vs account 5000 (cumulative to as-of).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {reconInv == null ? (
              <p className="text-sm text-muted-foreground">Load to compare.</p>
            ) : (
              <>
                {!reconInv.trial_balance_ok && (
                  <p className="text-sm text-destructive">Trial balance is not balanced; interpret with care.</p>
                )}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Stock at cost</div>
                  <div className="text-right font-medium">{fmt(reconInv.stock_valuation)}</div>
                  <div className="text-muted-foreground">GL 5000 (net DR)</div>
                  <div className="text-right font-medium">{fmt(reconInv.gl_inventory_balance)}</div>
                  <div className="text-muted-foreground">Difference</div>
                  <div className="text-right font-medium">{fmt(reconInv.difference)}</div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>AR sub-ledger vs GL</CardTitle>
            <CardDescription>
              Open credit sales vs accounts receivable (1100 / map key).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {reconAr == null ? (
              <p className="text-sm text-muted-foreground">Load to compare.</p>
            ) : (
              <>
                {!reconAr.trial_balance_ok && (
                  <p className="text-sm text-destructive">Trial balance is not balanced; interpret with care.</p>
                )}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Credit sales AR</div>
                  <div className="text-right font-medium">{fmt(reconAr.subledger_ar_total)}</div>
                  <div className="text-muted-foreground">GL AR (1100)</div>
                  <div className="text-right font-medium">{fmt(reconAr.gl_ar_total)}</div>
                  <div className="text-muted-foreground">Difference</div>
                  <div className="text-right font-medium">{fmt(reconAr.difference)}</div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
