"use client"

import { useState } from "react"
import { AlertTriangle, CheckCircle2, Database } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { MigrationContextStatus, MigrationStatus } from "@/lib/api/system-health-api"
import { shortMigrationName } from "../lib/modules"
import { paginate } from "../lib/paginate"
import { formatRelative, formatTimestamp } from "../lib/time"
import { PageFooter, SectionCard } from "./status-ui"

const PER_PAGE = 10
type Filter = "all" | "pending"

const needsWork = (c: MigrationContextStatus) => Boolean(c.error) || c.hasPendingMigrations || c.pendingMigrations.length > 0

export interface MigrationsTabProps {
  data: MigrationStatus | undefined
  loading: boolean
  error: Error | null
  onRetry: () => void
}

export function MigrationsTab({ data, loading, error, onRetry }: MigrationsTabProps) {
  const [filter, setFilter] = useState<Filter>("all")
  const [pageState, setPageState] = useState({ page: 1, filter: "all" as Filter })
  const page = pageState.filter === filter ? pageState.page : 1

  if (error && !data) return <ErrorState title="Couldn't load migration status" message={error.message} onRetry={onRetry} />

  const contexts = [...(data?.contexts ?? [])].sort((a, b) => Number(needsWork(b)) - Number(needsWork(a)) || a.module.localeCompare(b.module))
  const pending = contexts.filter((c) => c.hasPendingMigrations || c.pendingMigrations.length > 0).length
  const errored = contexts.filter((c) => c.error).length
  const visible = filter === "pending" ? contexts.filter(needsWork) : contexts
  const pageData = paginate(visible, page, PER_PAGE)

  return (
    <SectionCard
      title="Database migrations"
      titleId="migrations-title"
      icon={Database}
      description={
        <>
          Applied vs pending EF Core migrations per module.
          {data?.generatedAtUtc && (
            <span title={formatTimestamp(data.generatedAtUtc)}> Generated {formatRelative(data.generatedAtUtc)}.</span>
          )}
        </>
      }
      aside={
        data ? (
          pending || errored ? (
            <Badge variant="warning">
              <AlertTriangle aria-hidden />
              {[pending ? `${pending} pending` : "", errored ? `${errored} errored` : ""].filter(Boolean).join(" · ")}
            </Badge>
          ) : (
            <Badge variant="success">
              <CheckCircle2 aria-hidden />
              Up to date
            </Badge>
          )
        ) : null
      }
    >
      <div className="flex gap-2 border-b px-4 py-3 sm:px-5" role="group" aria-label="Filter migrations">
        {(["all", "pending"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "secondary" : "ghost"} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === "all" ? `All (${contexts.length})` : `Pending or errored (${pending + errored})`}
          </Button>
        ))}
      </div>
      <Table>
        <TableCaption className="sr-only">EF Core migration status per module, page {pageData.page} of {pageData.totalPages}.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4 sm:pl-5">Module</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>Last applied migration</TableHead>
            <TableHead className="pr-4 text-right sm:pr-5">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && !data ? (
            Array.from({ length: PER_PAGE }).map((_, i) => (
              <TableRow key={i} aria-hidden>
                <TableCell className="pl-4 sm:pl-5"><Skeleton className="h-4 w-24" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                <TableCell className="pr-4 sm:pr-5"><Skeleton className="ml-auto h-5 w-16" /></TableCell>
              </TableRow>
            ))
          ) : pageData.items.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={4} className="whitespace-normal">
                <EmptyState
                  size="compact"
                  icon={filter === "pending" ? CheckCircle2 : Database}
                  title={filter === "pending" ? "Every module is up to date" : "No migration contexts reported"}
                  description={filter === "pending" ? "No module has pending migrations or lookup errors." : "The API didn't return any EF Core contexts."}
                />
              </TableCell>
            </TableRow>
          ) : (
            pageData.items.map((c) => (
              <TableRow key={c.module} className="align-top">
                <TableCell className="pl-4 font-medium sm:pl-5">{c.module}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{c.provider ?? "—"}</TableCell>
                <TableCell className="max-w-[360px] whitespace-normal">
                  <span className="block truncate font-mono text-xs text-muted-foreground" title={c.lastAppliedMigration ?? undefined}>
                    {shortMigrationName(c.lastAppliedMigration)}
                  </span>
                  {c.error && <span className="mt-1 block text-xs break-words text-destructive">{c.error}</span>}
                  {c.pendingMigrations.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {c.pendingMigrations.map((m) => (
                        <li key={m} className="font-mono text-[11px] break-all text-warning" title={m}>
                          + {shortMigrationName(m)}
                        </li>
                      ))}
                    </ul>
                  )}
                </TableCell>
                <TableCell className="pr-4 text-right sm:pr-5">
                  {c.error ? (
                    <Badge variant="danger">Error</Badge>
                  ) : c.pendingMigrations.length > 0 || c.hasPendingMigrations ? (
                    <Badge variant="warning" className="num">
                      {c.pendingMigrations.length || "Some"} pending
                    </Badge>
                  ) : (
                    <Badge variant="success">Current</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <PageFooter page={pageData} onPageChange={(p) => setPageState({ page: p, filter })} />
    </SectionCard>
  )
}
