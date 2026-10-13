"use client"

import { useMemo, useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Download, FileSpreadsheet, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonTable } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/layouts"
import { downloadCsv } from "@/features/accounting/lib/csv"
import { fiscalYearStartBsYear } from "@/features/accounting/lib/date-presets"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import {
  getIrdBillRegister,
  IRD_BILL_REGISTER_HEADERS,
  irdBillRegisterCsvRows,
  type IrdBillRegisterFilter,
} from "@/lib/api/ird-api"

type Mode = "fiscal" | "range"

function yesNo(value: boolean | null): string {
  return value == null ? "—" : value ? "Yes" : "No"
}

function money(value: number): string {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * IRD materialized view: every bill with the columns IRD's e-billing guidelines require (sync, print, realtime,
 * buyer PAN, entered/printed by, VAT refunded on credit notes, transaction id). Filter by fiscal year or by Nepal
 * dates; export as CSV in IRD's column order.
 */
export function IrdBillRegister() {
  const currentFy = fiscalYearStartBsYear(new Date())
  const fiscalYears = useMemo(() => Array.from({ length: 5 }, (_, i) => currentFy - i), [currentFy])
  const [mode, setMode] = useState<Mode>("fiscal")
  const [fiscalYear, setFiscalYear] = useState(currentFy)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  const filter: IrdBillRegisterFilter | null =
    mode === "fiscal" ? { fiscalYear } : from && to && from <= to ? { from, to } : null

  const query = useQuery({
    queryKey: ["ird", "bill-register", filter],
    queryFn: () => getIrdBillRegister(filter as IrdBillRegisterFilter),
    enabled: filter !== null,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
  const rows = query.data ?? []

  const exportCsv = () => {
    const suffix = mode === "fiscal" ? `FY${fiscalYear}-${String((fiscalYear + 1) % 100).padStart(2, "0")}` : `${from}_to_${to}`
    downloadCsv(`ird-materialized-view-${suffix}.csv`, IRD_BILL_REGISTER_HEADERS, irdBillRegisterCsvRows(rows))
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="IRD materialized view"
        description="Every bill issued, with its IRD sync, print and buyer details — the register IRD inspects."
        icon={FileSpreadsheet}
      />

      <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="mv-mode">Period</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <SelectTrigger id="mv-mode" className="w-full sm:w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fiscal">Fiscal year</SelectItem>
              <SelectItem value="range">Date range</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {mode === "fiscal" ? (
          <div className="space-y-1">
            <Label htmlFor="mv-fy">Fiscal year</Label>
            <Select value={String(fiscalYear)} onValueChange={(v) => setFiscalYear(Number(v))}>
              <SelectTrigger id="mv-fy" className="w-full sm:w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fiscalYears.map((fy) => (
                  <SelectItem key={fy} value={String(fy)}>
                    {fy}/{String((fy + 1) % 100).padStart(2, "0")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <Label htmlFor="mv-from">From (AD)</Label>
              <Input id="mv-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mv-to">To (AD)</Label>
              <Input id="mv-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </>
        )}
        <div className="flex gap-2 sm:ml-auto">
          <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={!filter || query.isFetching}>
            <RefreshCw className={query.isFetching ? "h-4 w-4 animate-spin motion-reduce:animate-none" : "h-4 w-4"} aria-hidden />
            Refresh
          </Button>
          <Button size="sm" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="h-4 w-4" aria-hidden />
            Export CSV
          </Button>
        </div>
      </div>

      {!filter ? (
        <EmptyState size="compact" icon={FileSpreadsheet} title="Choose a period" description="Pick a fiscal year, or a from and to date." />
      ) : query.isLoading ? (
        <SkeletonTable rows={8} cols={10} />
      ) : query.isError ? (
        <ErrorState
          size="compact"
          title="Couldn't load the materialized view"
          message={apiRequestErrorMessage(query.error) || "Failed to load bills."}
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
        />
      ) : rows.length === 0 ? (
        <EmptyState size="compact" icon={FileSpreadsheet} title="No bills in this period" description="Bills appear here once sales are completed." />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[1400px] text-sm">
            <caption className="sr-only">IRD materialized view, {rows.length} bills</caption>
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {IRD_BILL_REGISTER_HEADERS.map((h) => (
                  <th key={h} scope="col" className="whitespace-nowrap px-3 py-2 font-medium">
                    {h.replace(/_/g, " ")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.saleId} className={r.isBillActive ? undefined : "bg-muted/40 text-muted-foreground"}>
                  <td className="whitespace-nowrap px-3 py-1.5">{r.fiscalYear}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs">{r.billNo}</td>
                  <td className="px-3 py-1.5">{r.customerName || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs">{r.customerPan ?? "—"}</td>
                  <td className="num whitespace-nowrap px-3 py-1.5">{r.billDate}</td>
                  <td className="num px-3 py-1.5 text-right">{money(r.amount)}</td>
                  <td className="num px-3 py-1.5 text-right">{money(r.discount)}</td>
                  <td className="num px-3 py-1.5 text-right">{money(r.taxableAmount)}</td>
                  <td className="num px-3 py-1.5 text-right">{money(r.taxAmount)}</td>
                  <td className="num px-3 py-1.5 text-right font-medium">{money(r.totalAmount)}</td>
                  <td className="px-3 py-1.5">{yesNo(r.syncWithIrd)}</td>
                  <td className="px-3 py-1.5">{yesNo(r.isBillPrinted)}</td>
                  <td className="px-3 py-1.5">{yesNo(r.isBillActive)}</td>
                  <td className="num whitespace-nowrap px-3 py-1.5 text-xs">
                    {r.printedTimeUtc ? new Date(r.printedTimeUtc).toLocaleString("en-GB") : "—"}
                  </td>
                  <td className="px-3 py-1.5">{r.enteredBy ?? "—"}</td>
                  <td className="px-3 py-1.5">{r.printedBy ?? "—"}</td>
                  <td className="px-3 py-1.5">{yesNo(r.isRealtime)}</td>
                  <td className="px-3 py-1.5 capitalize">{r.paymentMethod}</td>
                  <td className="num px-3 py-1.5 text-right">{money(r.vatRefundAmount)}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{r.transactionId ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
