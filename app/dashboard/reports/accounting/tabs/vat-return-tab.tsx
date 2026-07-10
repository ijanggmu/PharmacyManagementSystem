"use client"

import { useCallback, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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

interface VatReturnTabProps {
  dateRange: DateRange | undefined
  branchFilterId: string
}

export default function VatReturnTab({ dateRange, branchFilterId }: VatReturnTabProps) {
  const { toast } = useToast()

  const [vatReport, setVatReport] = useState<{
    period_from: string
    period_to: string
    output_vat_gl: number
    input_vat_gl: number
    net_vat_payable: number
    output_vat_operational: number
    input_vat_operational: number
    gl_vs_operational_output_diff: number
    gl_vs_operational_input_diff: number
    trial_balance_ok: boolean
  } | null>(null)
  const [vatLoading, setVatLoading] = useState(false)

  const rangeStr = useMemo(() => {
    if (!dateRange) return { from: "", to: "" }
    return { from: toYmd(dateRange.from), to: toYmd(dateRange.to) }
  }, [dateRange])

  const reportBranchId = branchFilterId || undefined

  const loadVatReturn = useCallback(async () => {
    if (!dateRange) return
    setVatLoading(true)
    try {
      const res = await accountingApi.vatReturn(rangeStr.from, rangeStr.to, reportBranchId)
      setVatReport(res)
    } catch (e) {
      toast({
        title: "VAT return failed",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      })
    } finally {
      setVatLoading(false)
    }
  }, [dateRange, rangeStr.from, rangeStr.to, reportBranchId, toast])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>VAT return summary</CardTitle>
          <CardDescription>
            Output vs input VAT for the selected period (GL accounts vs operational sales/GRN tax).
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadVatReturn()} disabled={vatLoading}>
          {vatLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Load
        </Button>
      </CardHeader>
      <CardContent>
        {vatReport == null ? (
          <p className="text-sm text-muted-foreground">Choose a date range and load the VAT summary.</p>
        ) : (
          <div className="space-y-4">
            {!vatReport.trial_balance_ok && (
              <p className="text-sm text-destructive">Trial balance is not balanced for this period.</p>
            )}
            <p className="text-sm text-muted-foreground">
              Period {vatReport.period_from} → {vatReport.period_to}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">Output VAT (GL)</p>
                <p className="text-2xl font-semibold">{fmt(vatReport.output_vat_gl)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sales tax column: {fmt(vatReport.output_vat_operational)}
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">Input VAT (GL)</p>
                <p className="text-2xl font-semibold">{fmt(vatReport.input_vat_gl)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  GRN VAT column: {fmt(vatReport.input_vat_operational)}
                </p>
              </div>
              <div className="rounded-lg border p-4 bg-muted/30">
                <p className="text-xs text-muted-foreground">Net VAT payable (GL)</p>
                <p className="text-2xl font-semibold">{fmt(vatReport.net_vat_payable)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm max-w-md">
              <div className="text-muted-foreground">GL vs sales output diff</div>
              <div className="text-right font-medium">{fmt(vatReport.gl_vs_operational_output_diff)}</div>
              <div className="text-muted-foreground">GL vs GRN input diff</div>
              <div className="text-right font-medium">{fmt(vatReport.gl_vs_operational_input_diff)}</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
