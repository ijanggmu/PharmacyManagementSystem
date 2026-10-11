"use client"

import type { LucideIcon } from "lucide-react"
import { Boxes, CheckCircle2, HandCoins, Link2, RefreshCw, Truck, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SkeletonText } from "@/components/ui/skeleton"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { useGlReconciliations } from "@/features/accounting/hooks/use-accounting-reports"
import { formatBsLong } from "@/features/accounting/lib/date-presets"
import { Amount, FetchingIndicator, InlineAlert, MoneyCell, QueryState, ScrollTable, stickyHeaderClass } from "../accounting-ui"
import { useAccountingContext } from "../accounting-context"

interface DateRange {
  from: Date
  to: Date
}

interface ReconciliationTabProps {
  dateRange: DateRange | undefined
  branchFilterId: string
}

const isZero = (n: number) => Math.abs(Number(n || 0)) < 0.005

function StatusBadge({ difference }: { difference: number }) {
  return isZero(difference) ? (
    <Badge variant="success">
      <CheckCircle2 aria-hidden />
      Reconciled
    </Badge>
  ) : (
    <Badge variant="danger">
      <XCircle aria-hidden />
      Difference
    </Badge>
  )
}

function ReconCard({
  title,
  description,
  icon: Icon,
  rows,
  difference,
  tbOk,
  children,
}: {
  title: string
  description: string
  icon: LucideIcon
  rows: { label: string; value: number }[]
  difference: number
  tbOk: boolean
  children?: React.ReactNode
}) {
  const { amount } = useAccountingMoney()
  return (
    <Card className="gap-4">
      <CardHeader className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon className="h-4 w-4 text-primary" aria-hidden />
            {title}
          </CardTitle>
          <StatusBadge difference={difference} />
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!tbOk && <InlineAlert tone="warning">Trial balance is not balanced; interpret with care.</InlineAlert>}
        <dl className="divide-y rounded-lg border text-sm">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-3 px-3 py-2">
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd className="num text-right font-medium">{amount(r.value)}</dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 bg-muted/40 px-3 py-2 font-semibold">
            <dt>Difference</dt>
            <dd className="text-right">
              <Amount value={difference} />
            </dd>
          </div>
        </dl>
        {children}
      </CardContent>
    </Card>
  )
}

export default function ReconciliationTab({ dateRange, branchFilterId }: ReconciliationTabProps) {
  const { money } = useAccountingMoney()
  const { rangeStr } = useAccountingContext()
  const asOf = rangeStr.to
  const recon = useGlReconciliations(asOf, branchFilterId || undefined, !!dateRange)
  const d = recon.data
  const checks = d ? [d.ap.difference, d.inv.difference, d.ar.difference] : []
  const reconciled = checks.filter(isZero).length

  return (
    <div className="space-y-4">
      <StatGrid cols={4}>
        <StatCard
          label="Checks passing"
          value={d ? `${reconciled} of 3` : "—"}
          hint={d ? (reconciled === 3 ? "All sub-ledgers agree with the GL" : "Investigate the differences below") : undefined}
          icon={Link2}
          tone={d ? (reconciled === 3 ? "success" : "danger") : "default"}
          loading={recon.isLoading}
        />
        <StatCard label="Payables difference" value={d ? money(d.ap.difference) : "—"} hint="Supplier ledger − GL AP" icon={Truck} tone={d && !isZero(d.ap.difference) ? "danger" : "default"} loading={recon.isLoading} />
        <StatCard label="Stock difference" value={d ? money(d.inv.difference) : "—"} hint="Stock at cost − GL inventory" icon={Boxes} tone={d && !isZero(d.inv.difference) ? "danger" : "default"} loading={recon.isLoading} />
        <StatCard label="Receivables difference" value={d ? money(d.ar.difference) : "—"} hint="Credit sales − GL AR" icon={HandCoins} tone={d && !isZero(d.ar.difference) ? "danger" : "default"} loading={recon.isLoading} />
      </StatGrid>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          As of the period end <span className="num font-medium text-foreground">{asOf || "—"}</span>
          {asOf ? <> (BS {formatBsLong(asOf)})</> : null}.
        </p>
        <div className="flex items-center gap-2">
          <FetchingIndicator active={recon.isFetching && !recon.isLoading} />
          <Button variant="outline" onClick={() => void recon.refetch()}>
            <RefreshCw aria-hidden />
            Refresh
          </Button>
        </div>
      </div>

      <QueryState
        isLoading={recon.isLoading}
        error={recon.error}
        onRetry={() => void recon.refetch()}
        retrying={recon.isFetching}
        errorTitle="Couldn't run the reconciliation"
        skeleton={
          <div className="grid gap-4 lg:grid-cols-3">
            <SkeletonText lines={5} />
            <SkeletonText lines={5} />
            <SkeletonText lines={5} />
          </div>
        }
        isEmpty={!d}
        empty={{ icon: Link2, title: "Choose a period", description: "Reconciliation compares sub-ledgers with their GL control accounts as of the period end." }}
      >
        {d && (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <ReconCard
              title="Payables vs GL"
              description="Supplier ledger totals vs trade payables control (2000)."
              icon={Truck}
              rows={[
                { label: "Supplier sub-ledger", value: d.ap.subledger_ap_total },
                { label: "GL accounts payable", value: d.ap.gl_ap_total },
              ]}
              difference={d.ap.difference}
              tbOk={d.ap.trial_balance_ok}
            >
              {d.ap.gl_ap_breakdown.length > 0 && (
                <ScrollTable maxHeight="max-h-56" label="GL AP breakdown">
                  <TableHeader className={stickyHeaderClass}>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.ap.gl_ap_breakdown.map((r) => (
                      <TableRow key={r.account_id}>
                        <TableCell className="num font-mono text-xs">{r.code}</TableCell>
                        <TableCell className="max-w-[160px] truncate" title={r.name}>
                          {r.name}
                        </TableCell>
                        <MoneyCell value={r.balance} signed />
                      </TableRow>
                    ))}
                  </TableBody>
                </ScrollTable>
              )}
            </ReconCard>
            <ReconCard
              title="Stock vs GL inventory"
              description="Quantity × cost of stock on hand vs the inventory account (cumulative)."
              icon={Boxes}
              rows={[
                { label: "Stock at cost", value: d.inv.stock_valuation },
                { label: "GL inventory", value: d.inv.gl_inventory_balance },
              ]}
              difference={d.inv.difference}
              tbOk={d.inv.trial_balance_ok}
            >
              {d.inv.stock_is_current_only && (
                <p className="text-xs text-muted-foreground">
                  Stock is valued as it is today — stock history isn&apos;t kept — while the GL figure is as at the chosen
                  date. For a meaningful comparison, pick today&apos;s date.
                </p>
              )}
            </ReconCard>
            <ReconCard
              title="Receivables vs GL"
              description="Open credit sales vs accounts receivable control (1100)."
              icon={HandCoins}
              rows={[
                { label: "Credit sales outstanding", value: d.ar.subledger_ar_total },
                { label: "GL accounts receivable", value: d.ar.gl_ar_total },
              ]}
              difference={d.ar.difference}
              tbOk={d.ar.trial_balance_ok}
            />
          </div>
        )}
      </QueryState>
    </div>
  )
}
