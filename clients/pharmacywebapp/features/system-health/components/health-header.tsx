"use client"

import { Pause, Play, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useNow } from "../hooks/use-system-health-data"
import type { HistoryEntry } from "../lib/history"
import type { OverallStatus } from "../lib/status"
import { formatSecondsAgo } from "../lib/time"
import { StatusHistory } from "./status-history"
import { STATUS_META } from "./status-ui"

const HEADLINE: Record<OverallStatus, string> = {
  Healthy: "All systems operational",
  Degraded: "Running with degraded components",
  Unhealthy: "Some components are failing",
  Unreachable: "The API can't be reached",
  Loading: "Checking systems…",
}

export interface HealthHeaderProps {
  overall: OverallStatus
  checkedAt: number
  live: boolean
  visible: boolean
  onToggleLive: () => void
  onRefresh: () => void
  fetching: boolean
  history: readonly HistoryEntry[]
  message?: string | null
}

export function HealthHeader({ overall, checkedAt, live, visible, onToggleLive, onRefresh, fetching, history, message }: HealthHeaderProps) {
  const now = useNow(1_000)
  const meta = STATUS_META[overall]
  const Icon = meta.icon

  return (
    <div className="rounded-xl border bg-card p-3.5 shadow-xs sm:p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg ring-1", meta.tile)} aria-hidden>
            <Icon className={cn("size-[18px]", overall === "Loading" && "animate-pulse motion-reduce:animate-none")} />
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold tracking-tight" role="status" aria-live="polite" aria-atomic>
              <span className={meta.text}>{meta.label}</span>
              <span className="font-normal text-muted-foreground">· {HEADLINE[overall]}</span>
            </p>
            <p className="num truncate text-xs text-muted-foreground" title={message ?? undefined}>
              {checkedAt ? `Checked ${formatSecondsAgo(checkedAt, now)}` : "Waiting for the first check"}
              {message && ` · ${message}`}
              {live && !visible && " · paused while tab is hidden"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onToggleLive} aria-pressed={live} aria-label={live ? "Live updates on. Pause updates" : "Updates paused. Resume live updates"}>
            {live ? <Pause aria-hidden /> : <Play aria-hidden />}
            <span aria-hidden>{live ? "Live" : "Paused"}</span>
            {live && <span className="size-1.5 rounded-full bg-success animate-pulse motion-reduce:animate-none" aria-hidden />}
          </Button>
          <Button size="sm" onClick={onRefresh} disabled={fetching} aria-busy={fetching}>
            <RefreshCw className={cn(fetching && "animate-spin motion-reduce:animate-none")} aria-hidden />
            Check now
          </Button>
        </div>
      </div>
      <div className="mt-3 border-t pt-3">
        <StatusHistory entries={history} />
      </div>
    </div>
  )
}
