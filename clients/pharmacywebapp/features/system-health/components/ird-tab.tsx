"use client"

import { useState } from "react"
import { AlertTriangle, CheckCircle2, Clock, FileWarning, XCircle } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import type { IrdQueueHealth } from "@/lib/api/ird-api"
import { paginate } from "../lib/paginate"
import { formatRelative, formatTimestamp } from "../lib/time"
import { PageFooter, SectionCard } from "./status-ui"

const PER_PAGE = 5

export interface IrdTabProps {
  data: IrdQueueHealth | undefined
  loading: boolean
  error: Error | null
  onRetry: () => void
}

export function IrdTab({ data, loading, error, onRetry }: IrdTabProps) {
  const [page, setPage] = useState(1)
  if (error && !data) return <ErrorState title="Couldn't load IRD queue health" message={error.message} onRetry={onRetry} />

  const showSkeleton = loading && !data
  const failures = data?.recentFailed ?? []
  const pageData = paginate(failures, page, PER_PAGE)

  return (
    <div className="space-y-6">
      <StatGrid cols={3}>
        <StatCard label="Pending invoices" value={data?.pendingCount ?? 0} hint="Queued for IRD" icon={Clock} tone="info" loading={showSkeleton} />
        <StatCard
          label="Failed queue items"
          value={data?.failedCount ?? 0}
          hint={data?.failedCount ? "Retried automatically" : "None failed"}
          icon={XCircle}
          tone={data?.failedCount ? "danger" : "success"}
          loading={showSkeleton}
        />
        <StatCard
          label="Sales with IRD failure"
          value={data?.salesFailedCount ?? 0}
          hint={data?.salesFailedCount ? "Need a manual resend" : "Nothing to resend"}
          icon={AlertTriangle}
          tone={data?.salesFailedCount ? "warning" : "success"}
          loading={showSkeleton}
        />
      </StatGrid>

      <SectionCard
        title="Recent IRD failures"
        titleId="ird-failures-title"
        icon={FileWarning}
        description="Invoices that didn't reach the Inland Revenue Department, newest first."
        aside={failures.length > 0 ? <span className="num text-xs font-medium text-muted-foreground">{failures.length} shown</span> : null}
      >
        {showSkeleton ? (
          <div className="space-y-2 p-4 sm:px-5" aria-hidden>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : failures.length === 0 ? (
          <EmptyState size="compact" icon={CheckCircle2} title="No recent IRD failures" description="Every recent invoice reached the IRD or is still queued." />
        ) : (
          <>
            <ul className="divide-y">
              {pageData.items.map((f) => (
                <li key={f.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4 sm:px-5">
                  <span className="min-w-0 flex-1 text-xs break-words">
                    <span className="sr-only">Error: </span>
                    {f.last_error ?? "Unknown error"}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground" title={formatTimestamp(f.created_at)}>
                    {formatRelative(f.created_at)}
                  </span>
                </li>
              ))}
            </ul>
            <PageFooter page={pageData} onPageChange={setPage} />
          </>
        )}
      </SectionCard>
    </div>
  )
}
