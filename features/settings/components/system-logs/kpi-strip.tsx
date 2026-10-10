"use client"

import type { ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { Activity, AlertTriangle, Gauge, KeyRound, Timer, Workflow } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  getActivityStats,
  getAuditSummary,
  listIntegrationEvents,
} from "@/lib/api/system-logs-dotnet"
import { formatDuration, presetWindow } from "./shared"

type Tone = "default" | "good" | "warn" | "bad"

function Tile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  loading,
  onClick,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon: typeof Activity
  tone?: Tone
  loading?: boolean
  onClick?: () => void
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon
          className={cn(
            "h-4 w-4",
            tone === "bad" ? "text-destructive" : tone === "warn" ? "text-warning" : tone === "good" ? "text-success" : "text-primary",
          )}
          aria-hidden
        />
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-20" />
      ) : (
        <p
          className={cn(
            "num mt-1 font-display text-2xl font-semibold tabular-nums leading-tight",
            tone === "bad" && "text-destructive",
            tone === "warn" && "text-warning",
          )}
        >
          {value}
        </p>
      )}
      <p className="mt-0.5 min-h-[1rem] truncate text-xs text-muted-foreground">{loading ? "" : hint}</p>
    </>
  )
  const className =
    "rounded-lg border bg-card p-3 text-left shadow-xs transition-colors duration-150"
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={cn(className, "hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
    >
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  )
}

export type KpiTarget = "requests" | "errors" | "security" | "integrations"

/** Last-24h health strip. Each tile jumps to the tab that explains it. */
export function KpiStrip({ tenantId, onNavigate }: { tenantId?: string; onNavigate: (tab: KpiTarget) => void }) {
  const stats = useQuery({
    queryKey: ["system-logs", "kpi", "activity", tenantId ?? null],
    queryFn: () => getActivityStats({ ...presetWindow("24h", Date.now()), tenantId }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
  const summary = useQuery({
    queryKey: ["system-logs", "kpi", "summary", tenantId ?? null],
    queryFn: () => getAuditSummary({ ...presetWindow("24h", Date.now()), tenantId }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
  const failedBus = useQuery({
    queryKey: ["system-logs", "kpi", "bus-failed", tenantId ?? null],
    queryFn: async () => {
      const window = presetWindow("7d", Date.now())
      const [failed, dead] = await Promise.all([
        listIntegrationEvents({ ...window, tenantId, status: "Failed", pageSize: 1 }),
        listIntegrationEvents({ ...window, tenantId, status: "Dead", pageSize: 1 }),
      ])
      return { failed: failed.totalCount, dead: dead.totalCount }
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  const s = stats.data
  const errorPct = s ? s.errorRate * 100 : 0
  const securityCount = summary.data?.eventsByType?.Security ?? 0
  const exceptionCount = summary.data?.eventsByType?.Exception ?? 0
  const busBroken = (failedBus.data?.failed ?? 0) + (failedBus.data?.dead ?? 0)
  const unavailable = <span className="text-base text-muted-foreground">n/a</span>

  return (
    <section aria-label="Last 24 hours at a glance" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Tile
        label="Requests · 24h"
        icon={Activity}
        loading={stats.isLoading}
        value={stats.isError ? unavailable : (s?.totalRequests ?? 0).toLocaleString()}
        hint={s ? `${s.slowRequests.toLocaleString()} slow (≥ ${formatDuration(s.slowThresholdMs)})` : undefined}
        onClick={() => onNavigate("requests")}
      />
      <Tile
        label="Error rate"
        icon={Gauge}
        loading={stats.isLoading}
        tone={!s ? "default" : errorPct >= 5 ? "bad" : errorPct >= 1 ? "warn" : "good"}
        value={stats.isError ? unavailable : `${errorPct.toFixed(errorPct < 10 ? 1 : 0)}%`}
        hint={s ? `${s.clientErrors.toLocaleString()} × 4xx · ${s.serverErrors.toLocaleString()} × 5xx` : undefined}
        onClick={() => onNavigate("requests")}
      />
      <Tile
        label="Latency"
        icon={Timer}
        loading={stats.isLoading}
        tone={s && (s.p95DurationMs ?? 0) >= 1000 ? "warn" : "default"}
        value={stats.isError ? unavailable : formatDuration(s?.p95DurationMs ?? null)}
        hint={s ? `p95 · avg ${formatDuration(s.avgDurationMs != null ? Math.round(s.avgDurationMs) : null)}` : undefined}
      />
      <Tile
        label="Exceptions · 24h"
        icon={AlertTriangle}
        loading={summary.isLoading}
        tone={exceptionCount > 0 ? "bad" : "good"}
        value={summary.isError ? unavailable : exceptionCount.toLocaleString()}
        hint="Unhandled server errors"
        onClick={() => onNavigate("errors")}
      />
      <Tile
        label="Security · 24h"
        icon={KeyRound}
        loading={summary.isLoading}
        value={summary.isError ? unavailable : securityCount.toLocaleString()}
        hint="Sign-ins, tokens, denials"
        onClick={() => onNavigate("security")}
      />
      <Tile
        label="Failed events · 7d"
        icon={Workflow}
        loading={failedBus.isLoading}
        tone={busBroken > 0 ? "bad" : "good"}
        value={failedBus.isError ? unavailable : busBroken.toLocaleString()}
        hint={failedBus.data ? `${failedBus.data.failed} retrying · ${failedBus.data.dead} dead` : undefined}
        onClick={() => onNavigate("integrations")}
      />
    </section>
  )
}
