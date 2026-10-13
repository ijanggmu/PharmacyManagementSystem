"use client"

import { useState } from "react"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SkeletonTable } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { useCurrency } from "@/lib/contexts/currency-context"
import { nepalTodayYmd } from "@/lib/utils/date-limits"
import { downloadCsv } from "@/features/accounting/lib/csv"
import { BranchFilterSelect, useBranchFilter } from "@/features/branches/components/branch-filter"
import { useSalaryTdsReport, useSsfReport } from "@/features/payroll/hooks/use-payroll"
import { bsMonthLabel, bsMonthOf, shiftBsMonth, type BsMonth } from "@/features/payroll/lib/payroll"

const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2)

/** Monthly SSF contributions and salary TDS from posted / paid runs — what is deposited with the SSF and IRD. */
export function PayrollReports() {
  const { formatCurrency } = useCurrency()
  const filter = useBranchFilter()
  const last = shiftBsMonth(bsMonthOf(nepalTodayYmd()), -1)
  const [month, setMonth] = useState<BsMonth>(last)
  const months = Array.from({ length: 18 }, (_, i) => shiftBsMonth(last, -i))
  const query = { ...month, branchId: filter.branchId }
  const ssf = useSsfReport(query)
  const tds = useSalaryTdsReport(query)
  const tag = `${month.bsYear}-${String(month.bsMonth).padStart(2, "0")}`

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="report-month">Month</Label>
          <Select
            value={`${month.bsYear}-${month.bsMonth}`}
            onValueChange={(v) => {
              const [y, m] = v.split("-").map(Number)
              setMonth({ bsYear: y, bsMonth: m })
            }}
          >
            <SelectTrigger id="report-month" className="h-9 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={`${m.bsYear}-${m.bsMonth}`} value={`${m.bsYear}-${m.bsMonth}`}>
                  {bsMonthLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <BranchFilterSelect filter={filter} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">SSF contributions — {bsMonthLabel(month)}</CardTitle>
            <CardDescription>Employee and employer shares on basic salary, from posted runs.</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!ssf.data || ssf.data.rows.length === 0}
            onClick={() =>
              ssf.data &&
              downloadCsv(
                `ssf-${tag}.csv`,
                ["Employee", "SSF no.", "Basic", "Employee SSF", "Employer SSF", "Total"],
                ssf.data.rows.map((r) => [r.employeeName, r.ssfNumber ?? "", money(r.basic), money(r.employeeSsf), money(r.employerSsf), money(r.total)]),
              )
            }
          >
            <Download className="mr-1 h-4 w-4" /> CSV
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {ssf.isLoading ? (
            <SkeletonTable rows={3} cols={5} />
          ) : ssf.isError ? (
            <ErrorState message={apiRequestErrorMessage(ssf.error)} onRetry={() => void ssf.refetch()} />
          ) : !ssf.data || ssf.data.rows.length === 0 ? (
            <EmptyState size="compact" title="No SSF contributions" description="Nothing posted for SSF-enrolled employees this month." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>SSF no.</TableHead>
                  <TableHead className="text-right">Basic</TableHead>
                  <TableHead className="text-right">Employee</TableHead>
                  <TableHead className="text-right">Employer</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ssf.data.rows.map((r) => (
                  <TableRow key={`${r.employeeId}-${r.branchId}`}>
                    <TableCell>{r.employeeName}</TableCell>
                    <TableCell>{r.ssfNumber ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(r.basic)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(r.employeeSsf)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(r.employerSsf)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(r.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2}>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(ssf.data.totalBasic)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(ssf.data.totalEmployeeSsf)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(ssf.data.totalEmployerSsf)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(ssf.data.total)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Salary TDS — {bsMonthLabel(month)}</CardTitle>
            <CardDescription>Social security tax (1%) and income tax withheld, from posted runs.</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!tds.data || tds.data.rows.length === 0}
            onClick={() =>
              tds.data &&
              downloadCsv(
                `salary-tds-${tag}.csv`,
                ["Employee", "PAN", "Gross", "Social security tax", "Income tax", "TDS"],
                tds.data.rows.map((r) => [r.employeeName, r.pan ?? "", money(r.gross), money(r.socialSecurityTax), money(r.incomeTax), money(r.tds)]),
              )
            }
          >
            <Download className="mr-1 h-4 w-4" /> CSV
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {tds.isLoading ? (
            <SkeletonTable rows={3} cols={5} />
          ) : tds.isError ? (
            <ErrorState message={apiRequestErrorMessage(tds.error)} onRetry={() => void tds.refetch()} />
          ) : !tds.data || tds.data.rows.length === 0 ? (
            <EmptyState size="compact" title="No salary TDS" description="No payroll was posted for this month." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>PAN</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Social security tax</TableHead>
                  <TableHead className="text-right">Income tax</TableHead>
                  <TableHead className="text-right">TDS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tds.data.rows.map((r) => (
                  <TableRow key={`${r.employeeId}-${r.branchId}`}>
                    <TableCell>{r.employeeName}</TableCell>
                    <TableCell>{r.pan ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(r.gross)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(r.socialSecurityTax)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(r.incomeTax)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(r.tds)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2}>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(tds.data.totalGross)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(tds.data.totalSocialSecurityTax)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(tds.data.totalIncomeTax)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(tds.data.totalTds)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
