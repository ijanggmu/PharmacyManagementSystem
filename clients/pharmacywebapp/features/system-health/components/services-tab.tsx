"use client"

import { useState } from "react"
import { Cpu, Database, HardDrive, Layers, Server, Workflow, type LucideIcon } from "lucide-react"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { healthCheckLabel, type HealthEntry } from "@/lib/api/system-health-api"
import { cn } from "@/lib/utils"
import { tenantRowsFromDetails, type TenantRowTone } from "../lib/details"
import { paginate } from "../lib/paginate"
import { isPlatformCheck } from "../lib/status"
import { DetailList, PageFooter, SectionCard, StatusLabel } from "./status-ui"

const TENANT_CHECK = "db:tenants-migrations"
const PER_PAGE = 10

const SERVICE_INFO: Record<string, { icon: LucideIcon; blurb: string }> = {
  self: { icon: Cpu, blurb: "The API process itself is up and answering requests." },
  hangfire: { icon: Workflow, blurb: "Storage for background jobs — IRD sync, invoices and cleanup." },
  redis: { icon: HardDrive, blurb: "Distributed cache used for sessions, permissions and rate limits." },
  [TENANT_CHECK]: { icon: Layers, blurb: "Every pharmacy's database is on the latest schema." },
}

const TONE_LABEL: Record<TenantRowTone, { text: string; className: string; dot: string }> = {
  healthy: { text: "Healthy", className: "text-success", dot: "bg-success" },
  warning: { text: "Needs attention", className: "text-warning", dot: "bg-warning" },
  failing: { text: "Failing", className: "text-destructive", dot: "bg-destructive" },
  unknown: { text: "Reported", className: "text-muted-foreground", dot: "bg-muted-foreground/40" },
}

export interface ServicesTabProps {
  checks: HealthEntry[]
  loading: boolean
  error: Error | null
  onRetry: () => void
}

export function ServicesTab({ checks, loading, error, onRetry }: ServicesTabProps) {
  const [page, setPage] = useState(1)

  if (error && checks.length === 0) {
    return <ErrorState title="Couldn't reach the readiness probe" message={error.message} onRetry={onRetry} />
  }

  const known = ["self", "hangfire", "redis", TENANT_CHECK]
  const extras = checks.filter((c) => isPlatformCheck(c.name) && !known.includes(c.name)).map((c) => c.name)
  const ordered = [...known, ...extras]
  const tenantCheck = checks.find((c) => c.name === TENANT_CHECK)
  const tenantRows = tenantRowsFromDetails(tenantCheck?.details)
  const tenantPage = paginate(tenantRows, page, PER_PAGE)

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        {loading && checks.length === 0
          ? ordered.map((name) => <ServiceCardSkeleton key={name} />)
          : ordered.map((name) => <ServiceCard key={name} name={name} entry={checks.find((c) => c.name === name) ?? null} />)}
      </div>

      <SectionCard
        title="Tenant databases"
        titleId="tenants-title"
        icon={Layers}
        description="Per-pharmacy migration state from the tenant migrations check."
        aside={
          tenantRows.length > 0 ? (
            <span className="num text-xs font-medium text-muted-foreground">
              {tenantRows.length} tenant{tenantRows.length === 1 ? "" : "s"}
            </span>
          ) : null
        }
      >
        {loading && checks.length === 0 ? (
          <div className="space-y-2 p-4 sm:px-5" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : tenantRows.length === 0 ? (
          <EmptyState
            size="compact"
            icon={Database}
            title="No per-tenant details"
            description={tenantCheck ? "The tenant migrations check didn't report individual tenants." : "The readiness probe doesn't include a tenant migrations check."}
          />
        ) : (
          <>
            <Table>
              <TableCaption className="sr-only">Tenant database migration status, page {tenantPage.page} of {tenantPage.totalPages}.</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 sm:pl-5">Tenant</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="pr-4 sm:pr-5">Reported status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenantPage.items.map((t) => {
                  const tone = TONE_LABEL[t.tone]
                  return (
                    <TableRow key={t.tenant}>
                      <TableCell className="pl-4 font-mono text-xs sm:pl-5">{t.tenant}</TableCell>
                      <TableCell>
                        <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", tone.className)}>
                          <span className={cn("size-2 rounded-full", tone.dot)} aria-hidden />
                          {tone.text}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[360px] truncate pr-4 text-xs text-muted-foreground sm:pr-5" title={t.status}>
                        {t.status}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <PageFooter page={tenantPage} onPageChange={setPage} />
          </>
        )}
      </SectionCard>
    </div>
  )
}

function ServiceCard({ name, entry }: { name: string; entry: HealthEntry | null }) {
  const info = SERVICE_INFO[name] ?? { icon: Server, blurb: "" }
  const Icon = info.icon
  // Tenant details are shown in the table below rather than dumped into the card.
  const details = name === TENANT_CHECK ? null : entry?.details
  const tenantCount = name === TENANT_CHECK && entry?.details ? Object.keys(entry.details).length : null

  return (
    <Card className="gap-3 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border" aria-hidden>
            <Icon className="size-4" />
          </span>
          <h3 className="truncate text-sm font-semibold" title={name}>
            {healthCheckLabel(name)}
          </h3>
        </div>
        <StatusLabel status={entry?.status ?? "Unknown"} className="mt-1.5" />
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{info.blurb}</p>
      <div className="flex items-baseline justify-between gap-2 border-t pt-3 text-xs">
        <span className="text-muted-foreground">Check time</span>
        <span className="num font-medium">{entry ? `${Math.round(entry.durationMs)} ms` : "—"}</span>
      </div>
      {tenantCount !== null && (
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="text-muted-foreground">Tenants checked</span>
          <span className="num font-medium">{tenantCount}</span>
        </div>
      )}
      {entry?.description && <p className={cn("text-xs break-words", entry.status === "Healthy" ? "text-muted-foreground" : "text-destructive")}>{entry.description}</p>}
      <DetailList details={details} />
      {!entry && <p className="text-xs text-muted-foreground">Not included in this API&apos;s readiness probe.</p>}
    </Card>
  )
}

function ServiceCardSkeleton() {
  return (
    <Card className="gap-3 p-4 sm:p-5" aria-hidden>
      <div className="flex items-center gap-2.5">
        <Skeleton className="size-8 rounded-lg" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-2/3" />
      <div className="border-t pt-3">
        <Skeleton className="h-3 w-full" />
      </div>
    </Card>
  )
}
