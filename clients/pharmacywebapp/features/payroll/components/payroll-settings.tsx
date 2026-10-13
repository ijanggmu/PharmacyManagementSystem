"use client"

import { useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingState } from "@/components/ui/loading-state"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { useCurrency } from "@/lib/contexts/currency-context"
import type { PayrollSettings } from "@/features/payroll/api-client"
import { usePayrollSettings, useUpdatePayrollSettings } from "@/features/payroll/hooks/use-payroll"

/** SSF rates and the retirement deduction cap (editable), plus the tax slabs in use (read-only). */
export function PayrollSettingsPanel() {
  const settings = usePayrollSettings()
  if (settings.isLoading) return <LoadingState />
  if (settings.isError || !settings.data)
    return <ErrorState message={apiRequestErrorMessage(settings.error)} onRetry={() => void settings.refetch()} />
  return <SettingsForm key={settings.data.updatedAtUtc ?? "defaults"} settings={settings.data} />
}

function SettingsForm({ settings }: { settings: PayrollSettings }) {
  const { toast } = useToast()
  const { formatCurrency } = useCurrency()
  const save = useUpdatePayrollSettings()
  const [form, setForm] = useState({
    employeeSsfRatePercent: String(settings.employeeSsfRatePercent),
    employerSsfRatePercent: String(settings.employerSsfRatePercent),
    retirementDeductionCap: String(settings.retirementDeductionCap),
  })
  const values = {
    employeeSsfRatePercent: Number(form.employeeSsfRatePercent),
    employerSsfRatePercent: Number(form.employerSsfRatePercent),
    retirementDeductionCap: Number(form.retirementDeductionCap),
  }
  const invalid =
    !(values.employeeSsfRatePercent >= 0 && values.employeeSsfRatePercent <= 100) ||
    !(values.employerSsfRatePercent >= 0 && values.employerSsfRatePercent <= 100) ||
    !(values.retirementDeductionCap >= 0)

  const slabRows = (bands: PayrollSettings["taxSlabs"]["singleSlabs"]) =>
    bands.map((b, i) => {
      const from = i === 0 ? 0 : (bands[i - 1].upTo ?? 0)
      return (
        <TableRow key={i}>
          <TableCell className="tabular-nums">
            {b.upTo == null ? `Above ${formatCurrency(from)}` : `${formatCurrency(from)} – ${formatCurrency(b.upTo)}`}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {b.ratePercent}%{i === 0 ? " (social security tax; nil for SSF contributors)" : ""}
          </TableCell>
        </TableRow>
      )
    })

  return (
    <div className="space-y-4">
      <Alert>
        <AlertDescription>{settings.note}</AlertDescription>
      </Alert>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rates</CardTitle>
          <CardDescription>Used by new and recalculated runs. Posted runs keep the figures they were posted with.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ssf-employee">Employee SSF % of basic</Label>
            <Input id="ssf-employee" type="number" min={0} max={100} step="0.01" className="w-40" value={form.employeeSsfRatePercent}
              onChange={(e) => setForm((f) => ({ ...f, employeeSsfRatePercent: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ssf-employer">Employer SSF % of basic</Label>
            <Input id="ssf-employer" type="number" min={0} max={100} step="0.01" className="w-40" value={form.employerSsfRatePercent}
              onChange={(e) => setForm((f) => ({ ...f, employerSsfRatePercent: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="retirement-cap">Yearly retirement deduction cap</Label>
            <Input id="retirement-cap" type="number" min={0} step="1" className="w-48" value={form.retirementDeductionCap}
              onChange={(e) => setForm((f) => ({ ...f, retirementDeductionCap: e.target.value }))} />
          </div>
          <Button
            disabled={invalid || save.isPending}
            onClick={() =>
              save.mutate(values, {
                onSuccess: () => toast({ title: "Payroll settings saved" }),
                onError: (error) => toast({ title: "Could not save", description: apiRequestErrorMessage(error), variant: "destructive" }),
              })
            }
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Salary tax slabs — FY {settings.taxSlabs.fiscalYearLabel}</CardTitle>
          <CardDescription>{settings.taxSlabs.source}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {(
            [
              ["Single", settings.taxSlabs.singleSlabs],
              ["Married (couple)", settings.taxSlabs.marriedSlabs],
            ] as const
          ).map(([title, bands]) => (
            <div key={title}>
              <p className="mb-1 text-sm font-medium">{title}</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Taxable income (yearly)</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>{slabRows(bands)}</TableBody>
              </Table>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
