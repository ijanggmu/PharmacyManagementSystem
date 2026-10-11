"use client"

import { AlertTriangle, ArrowRight, CheckCircle2, Database, Gauge, ShieldCheck, Timer, Workflow, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { healthCheckLabel } from "@/lib/api/system-health-api"
import { cn } from "@/lib/utils"
import type { AttentionItem } from "../lib/attention"
import type { CheckSummary } from "../lib/status"
import type { HealthTab } from "../lib/tabs"
import { SectionCard } from "./status-ui"

const TAB_LABEL: Record<HealthTab, string> = {
  overview: "Overview",
  modules: "Modules",
  services: "Services",
  jobs: "Jobs",
  migrations: "Migrations",
  ird: "IRD queue",
}

export interface OverviewTabProps {
  summary: CheckSummary
  roundTripMs: number | null
  readinessLoading: boolean
  failedJobs: number | undefined
  pendingMigrations: number | undefined
  jobsLoading: boolean
  migrationsLoading: boolean
  canViewPlatform: boolean
  attention: AttentionItem[]
  /** Some sources are still loading, so the list may grow. */
  attentionPartial: boolean
  onNavigate: (tab: HealthTab) => void
}

export function OverviewTab(props: OverviewTabProps) {
  const { summary, roundTripMs, readinessLoading, failedJobs, pendingMigrations, jobsLoading, migrationsLoading, canViewPlatform, attention, attentionPartial, onNavigate } = props
  const allPassing = summary.total > 0 && summary.passing === summary.total

  return (
    <div className="space-y-6">
      <StatGrid cols={canViewPlatform ? 5 : 3}>
        <StatCard
          label="Checks passing"
          value={summary.total ? `${summary.passing}/${summary.total}` : "—"}
          hint={summary.total ? (allPassing ? "Every readiness check is healthy" : `${summary.failing} failing · ${summary.degraded} degraded`) : "No checks reported"}
          icon={allPassing ? CheckCircle2 : AlertTriangle}
          tone={!summary.total ? "default" : allPassing ? "success" : summary.failing ? "danger" : "warning"}
          loading={readinessLoading}
        />
        <StatCard
          label="API round-trip"
          value={roundTripMs === null ? "—" : `${roundTripMs} ms`}
          hint="Browser → web app → API → back"
          icon={Timer}
          tone="info"
          loading={readinessLoading}
        />
        <StatCard
          label="Slowest check"
          value={summary.slowest ? `${Math.round(summary.slowest.durationMs)} ms` : "—"}
          hint={summary.slowest ? healthCheckLabel(summary.slowest.name) : "—"}
          icon={Gauge}
          loading={readinessLoading}
        />
        {canViewPlatform && (
          <StatCard
            label="Failed jobs"
            value={failedJobs === undefined ? "—" : failedJobs.toLocaleString()}
            hint={failedJobs ? "Awaiting retry or review" : "No failed jobs"}
            icon={failedJobs ? XCircle : Workflow}
            tone={failedJobs ? "danger" : "success"}
            loading={jobsLoading}
            onClick={() => onNavigate("jobs")}
          />
        )}
        {canViewPlatform && (
          <StatCard
            label="Pending migrations"
            value={pendingMigrations === undefined ? "—" : pendingMigrations}
            hint={pendingMigrations ? "Schema behind deployed code" : "All modules up to date"}
            icon={Database}
            tone={pendingMigrations ? "warning" : "success"}
            loading={migrationsLoading}
            onClick={() => onNavigate("migrations")}
          />
        )}
      </StatGrid>

      <SectionCard
        title="Needs attention"
        titleId="attention-title"
        icon={AlertTriangle}
        description="Anything that isn't fully healthy, worst first."
        aside={
          attention.length > 0 ? (
            <span className="num text-xs font-medium text-muted-foreground">
              {attention.length} item{attention.length === 1 ? "" : "s"}
            </span>
          ) : null
        }
      >
        {readinessLoading && attention.length === 0 ? (
          <ul className="divide-y" aria-hidden>
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                <Skeleton className="size-8 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </li>
            ))}
          </ul>
        ) : attention.length === 0 ? (
          <EmptyState
            size="compact"
            icon={ShieldCheck}
            title={attentionPartial ? "Nothing needs attention so far" : "All clear"}
            description={
              attentionPartial
                ? "Some sources are still loading — this list updates automatically."
                : "Every check, job, migration and queue we can see is healthy. This view refreshes on its own while Live is on."
            }
          />
        ) : (
          <ul className="divide-y">
            {attention.map((item) => (
              <AttentionRow key={item.id} item={item} onNavigate={onNavigate} />
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}

function AttentionRow({ item, onNavigate }: { item: AttentionItem; onNavigate: (tab: HealthTab) => void }) {
  const critical = item.severity === "critical"
  const Icon = critical ? XCircle : AlertTriangle
  return (
    <li className="flex flex-col gap-3 px-4 py-3.5 animate-fade-in motion-reduce:animate-none sm:flex-row sm:items-center sm:px-5">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg ring-1",
            critical ? "bg-destructive/10 text-destructive ring-destructive/20" : "bg-warning/10 text-warning ring-warning/25",
          )}
          aria-hidden
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">
            <span className="sr-only">{critical ? "Critical: " : "Warning: "}</span>
            {item.title}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed break-words text-muted-foreground">{item.description}</p>
        </div>
      </div>
      <Button variant="outline" size="sm" className="self-start sm:self-center" onClick={() => onNavigate(item.tab)}>
        Open {TAB_LABEL[item.tab]}
        <ArrowRight aria-hidden />
      </Button>
    </li>
  )
}

/** Placeholder shown while a whole tab's data is missing. */
export function TabCardSkeleton({ rows = 6, rowClass = "h-10" }: { rows?: number; rowClass?: string }) {
  return (
    <Card className="gap-0 py-0" aria-hidden>
      <div className="border-b px-4 py-3.5 sm:px-5">
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="space-y-2 p-4 sm:px-5">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className={cn("w-full", rowClass)} />
        ))}
      </div>
    </Card>
  )
}
