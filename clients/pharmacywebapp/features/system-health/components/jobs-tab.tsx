"use client"

import { useId, useMemo, useState } from "react"
import { Activity, AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, Clock, Cpu, FileWarning, Search, Server, Workflow, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import type { FailedJobSummary, JobServer, JobsStatus } from "@/lib/api/system-health-api"
import { cn } from "@/lib/utils"
import { useDebouncedValue, useNow } from "../hooks/use-system-health-data"
import { describeCron } from "../lib/cron"
import { filterRecurringJobs, jobStateTone } from "../lib/details"
import { paginate } from "../lib/paginate"
import { formatRelative, formatTimestamp, isStaleHeartbeat } from "../lib/time"
import { PageFooter, SectionCard } from "./status-ui"

const JOBS_PER_PAGE = 10
const FAILURES_PER_PAGE = 5

export interface JobsTabProps {
  data: JobsStatus | undefined
  loading: boolean
  error: Error | null
  onRetry: () => void
}

export function JobsTab({ data, loading, error, onRetry }: JobsTabProps) {
  const now = useNow(15_000)

  if (error && !data) return <ErrorState title="Couldn't load job status" message={error.message} onRetry={onRetry} />
  if (data && !data.enabled) {
    return (
      <SectionCard title="Background jobs" icon={Workflow}>
        <EmptyState size="compact" icon={Workflow} title="Background jobs are disabled" description="EnableJobs is off on this API instance, so no Hangfire server is running." />
      </SectionCard>
    )
  }
  if (data?.error) return <ErrorState title="Hangfire storage error" message={data.error} onRetry={onRetry} />

  const stats = data?.statistics
  const workers = data?.servers.reduce((sum, s) => sum + s.workersCount, 0) ?? 0
  const showSkeleton = loading && !data

  return (
    <div className="space-y-6">
      <StatGrid cols={5}>
        <StatCard label="Servers" value={stats?.servers ?? 0} hint={`${workers} worker${workers === 1 ? "" : "s"}`} icon={Cpu} tone={stats && stats.servers === 0 ? "danger" : "default"} loading={showSkeleton} />
        <StatCard label="Processing" value={stats?.processing ?? 0} hint={`${stats?.enqueued ?? 0} enqueued`} icon={Activity} tone="info" loading={showSkeleton} />
        <StatCard label="Scheduled" value={stats?.scheduled ?? 0} hint={`${stats?.recurring ?? 0} recurring`} icon={Clock} loading={showSkeleton} />
        <StatCard label="Succeeded" value={(stats?.succeeded ?? 0).toLocaleString()} hint="All time" icon={CheckCircle2} tone="success" loading={showSkeleton} />
        <StatCard
          label="Failed"
          value={(stats?.failed ?? 0).toLocaleString()}
          hint={stats?.failed ? "Awaiting retry or review" : "Nothing failed"}
          icon={XCircle}
          tone={stats?.failed ? "danger" : "success"}
          loading={showSkeleton}
        />
      </StatGrid>

      <ServersCard servers={data?.servers ?? []} loading={showSkeleton} now={now} />
      <RecurringJobsCard data={data} loading={showSkeleton} now={now} />
      <FailuresCard failures={data?.recentFailed ?? []} loading={showSkeleton} now={now} />
    </div>
  )
}

function ServersCard({ servers, loading, now }: { servers: JobServer[]; loading: boolean; now: number }) {
  const stale = servers.filter((s) => isStaleHeartbeat(s.heartbeat, now)).length
  return (
    <SectionCard
      title="Servers"
      titleId="job-servers-title"
      icon={Server}
      description="Hangfire workers and their last heartbeat. A heartbeat older than 2 minutes means the server likely stopped."
      aside={
        stale > 0 ? (
          <Badge variant="warning">
            <AlertTriangle aria-hidden />
            {stale} stale
          </Badge>
        ) : null
      }
    >
      {loading ? (
        <div className="space-y-2 p-4 sm:px-5" aria-hidden>
          <Skeleton className="h-12 w-full" />
        </div>
      ) : servers.length === 0 ? (
        <EmptyState size="compact" icon={Server} title="No servers running" description="Queued and scheduled jobs won't run until a Hangfire server starts." />
      ) : (
        <ul className="divide-y">
          {servers.map((s) => {
            const isStale = isStaleHeartbeat(s.heartbeat, now)
            return (
              <li key={s.name} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs font-medium" title={s.name}>
                    {s.name}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {s.queues.map((q) => (
                      <Badge key={q} variant="muted" className="font-mono">
                        {q}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="num text-muted-foreground">
                    {s.workersCount} worker{s.workersCount === 1 ? "" : "s"}
                  </span>
                  <span className="text-muted-foreground" title={formatTimestamp(s.startedAt)}>
                    Started {formatRelative(s.startedAt, now)}
                  </span>
                  <span className={cn("inline-flex items-center gap-1 font-medium", isStale ? "text-warning" : "text-success")} title={formatTimestamp(s.heartbeat)}>
                    {isStale ? <AlertTriangle className="size-3.5" aria-hidden /> : <CheckCircle2 className="size-3.5" aria-hidden />}
                    {isStale ? "Stale heartbeat" : "Heartbeat"} {s.heartbeat ? formatRelative(s.heartbeat, now) : "never"}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </SectionCard>
  )
}

function RecurringJobsCard({ data, loading, now }: { data: JobsStatus | undefined; loading: boolean; now: number }) {
  const [search, setSearch] = useState("")
  const [pageState, setPageState] = useState({ page: 1, key: "" })
  const debounced = useDebouncedValue(search, 200)
  const page = pageState.key === debounced ? pageState.page : 1
  const jobs = useMemo(() => filterRecurringJobs(data?.recurringJobs ?? [], debounced), [data, debounced])
  const pageData = paginate(jobs, page, JOBS_PER_PAGE)
  const total = data?.recurringJobs.length ?? 0

  return (
    <SectionCard
      title="Recurring jobs"
      titleId="recurring-title"
      icon={CalendarClock}
      description="Schedules are in UTC."
      aside={total > 0 ? <span className="num text-xs font-medium text-muted-foreground">{total} registered</span> : null}
    >
      <div className="border-b px-4 py-3 sm:px-5" role="search" aria-label="Filter recurring jobs">
        <div className="relative sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search jobs, queues, state" aria-label="Search recurring jobs" className="pl-9" />
        </div>
      </div>
      <Table>
        <TableCaption className="sr-only">Recurring jobs, page {pageData.page} of {pageData.totalPages}.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4 sm:pl-5">Job</TableHead>
            <TableHead>Schedule</TableHead>
            <TableHead>Last run</TableHead>
            <TableHead>Next run</TableHead>
            <TableHead className="pr-4 sm:pr-5">Last result</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={i} aria-hidden>
                <TableCell className="pl-4 sm:pl-5"><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell><Skeleton className="h-8 w-28" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                <TableCell className="pr-4 sm:pr-5"><Skeleton className="h-5 w-20" /></TableCell>
              </TableRow>
            ))
          ) : pageData.items.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={5} className="whitespace-normal">
                <EmptyState
                  size="compact"
                  icon={CalendarClock}
                  title={total === 0 ? "No recurring jobs registered" : "No jobs match"}
                  description={total === 0 ? "The API hasn't registered any recurring schedules." : "Try a different search."}
                  action={total > 0 ? { label: "Clear search", onClick: () => setSearch("") } : undefined}
                />
              </TableCell>
            </TableRow>
          ) : (
            pageData.items.map((j) => {
              const hint = describeCron(j.cron)
              return (
                <TableRow key={j.id}>
                  <TableCell className="pl-4 sm:pl-5">
                    <span className="block max-w-[220px] truncate font-mono text-xs font-medium" title={j.id}>
                      {j.id}
                    </span>
                    {j.queue && <span className="text-xs text-muted-foreground">queue: {j.queue}</span>}
                  </TableCell>
                  <TableCell>
                    <span className="block text-xs">{hint ?? <span className="font-mono">{j.cron ?? "—"}</span>}</span>
                    {hint && <span className="block font-mono text-[11px] text-muted-foreground">{j.cron}</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground" title={formatTimestamp(j.lastExecution)}>
                    {j.lastExecution ? formatRelative(j.lastExecution, now) : "Never"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground" title={formatTimestamp(j.nextExecution)}>
                    {formatRelative(j.nextExecution, now)}
                  </TableCell>
                  <TableCell className="pr-4 sm:pr-5">
                    <Badge variant={jobStateTone(j.lastJobState, j.error)} title={j.error ?? undefined}>
                      {j.error ? "Error" : (j.lastJobState ?? "Not run yet")}
                    </Badge>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
      <PageFooter page={pageData} onPageChange={(p) => setPageState({ page: p, key: debounced })} />
    </SectionCard>
  )
}

function FailuresCard({ failures, loading, now }: { failures: FailedJobSummary[]; loading: boolean; now: number }) {
  const [page, setPage] = useState(1)
  const pageData = paginate(failures, page, FAILURES_PER_PAGE)

  return (
    <SectionCard
      title="Recent failures"
      titleId="failures-title"
      icon={FileWarning}
      description="Latest failed jobs. Retry or delete them from the Hangfire dashboard."
      aside={failures.length > 0 ? <span className="num text-xs font-medium text-muted-foreground">{failures.length} shown</span> : null}
    >
      {loading ? (
        <div className="space-y-2 p-4 sm:px-5" aria-hidden>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : failures.length === 0 ? (
        <EmptyState size="compact" icon={CheckCircle2} title="No recent failures" description="No background job has failed recently." />
      ) : (
        <>
          <ul className="divide-y">
            {pageData.items.map((f) => (
              <FailureRow key={f.jobId} failure={f} now={now} />
            ))}
          </ul>
          <PageFooter page={pageData} onPageChange={setPage} />
        </>
      )}
    </SectionCard>
  )
}

function FailureRow({ failure: f, now }: { failure: FailedJobSummary; now: number }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const shortType = f.exceptionType?.split(".").pop()
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        className="flex min-h-10 w-full cursor-pointer items-start gap-2 px-4 py-3 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset sm:px-5"
      >
        <ChevronRight
          className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none", open && "rotate-90")}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="min-w-0 truncate font-mono text-xs font-medium">{f.job ?? `Job #${f.jobId}`}</span>
            <span className="text-xs text-muted-foreground" title={formatTimestamp(f.failedAt)}>
              {f.failedAt ? formatRelative(f.failedAt, now) : ""}
            </span>
          </span>
          <span className={cn("mt-1 block text-xs text-muted-foreground", !open && "line-clamp-1")}>
            {shortType && <span className="font-mono text-destructive">{shortType}: </span>}
            {f.exceptionMessage ?? "No message"}
          </span>
        </span>
      </button>
      {open && (
        <div id={id} className="mx-4 mb-3 space-y-1 rounded-md border bg-muted/40 p-3 text-xs animate-fade-in motion-reduce:animate-none sm:mx-5">
          <p className="font-mono text-muted-foreground">Job id: {f.jobId}</p>
          {f.exceptionType && <p className="font-mono break-all text-destructive">{f.exceptionType}</p>}
          <p className="break-words whitespace-pre-wrap">{f.exceptionMessage ?? "No message"}</p>
        </div>
      )}
    </li>
  )
}
