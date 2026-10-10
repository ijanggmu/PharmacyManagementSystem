"use client"

import { cn } from "@/lib/utils"
import { HISTORY_SIZE, latencyStats, sparklinePoints, type HistoryEntry } from "../lib/history"
import { STATUS_META } from "./status-ui"

const SPARK_W = 96
const SPARK_H = 24

/** Last 30 polls as pips plus a round-trip sparkline. Fixed size so nothing shifts as it fills up. */
export function StatusHistory({ entries }: { entries: readonly HistoryEntry[] }) {
  const empty = Math.max(0, HISTORY_SIZE - entries.length)
  const counts = entries.reduce(
    (acc, e) => {
      if (e.status === "Healthy") acc.ok++
      else if (e.status === "Degraded") acc.degraded++
      else acc.failed++
      return acc
    },
    { ok: 0, degraded: 0, failed: 0 },
  )
  const stats = latencyStats(entries)
  const points = sparklinePoints(
    entries.map((e) => e.roundTripMs),
    SPARK_W,
    SPARK_H,
    { slots: HISTORY_SIZE },
  )
  const last = points ? points.split(" ").at(-1)?.split(",").map(Number) : undefined

  const pipsLabel = entries.length
    ? `Last ${entries.length} checks: ${counts.ok} healthy, ${counts.degraded} degraded, ${counts.failed} failed or unreachable`
    : "No checks recorded yet"
  const sparkLabel = stats
    ? `API round-trip over the last ${stats.count} checks: min ${stats.min} ms, average ${stats.avg} ms, max ${stats.max} ms`
    : "No round-trip measurements yet"

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div role="img" aria-label={pipsLabel} className="flex h-4 items-end gap-0.5">
        {Array.from({ length: empty }).map((_, i) => (
          <span key={`empty-${i}`} className="h-2 w-1.5 rounded-full bg-muted" aria-hidden />
        ))}
        {entries.map((e) => (
          <span
            key={e.at}
            title={`${new Date(e.at).toLocaleTimeString()} · ${STATUS_META[e.status].label}${e.roundTripMs !== null ? ` · ${e.roundTripMs} ms` : ""}`}
            className={cn(
              "w-1.5 rounded-full animate-fade-in motion-reduce:animate-none",
              STATUS_META[e.status].dot,
              e.status === "Healthy" ? "h-3" : "h-4",
            )}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <svg
          role="img"
          aria-label={sparkLabel}
          width={SPARK_W}
          height={SPARK_H}
          viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
          className="overflow-visible text-primary"
        >
          <line x1={0} x2={SPARK_W} y1={SPARK_H - 0.5} y2={SPARK_H - 0.5} className="stroke-border" strokeWidth={1} />
          {points && (
            <polyline
              points={points}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {last && last.length === 2 && <circle cx={last[0]} cy={last[1]} r={2} fill="currentColor" />}
        </svg>
        <span className="num w-24 text-xs text-muted-foreground" aria-hidden>
          {stats ? `avg ${stats.avg} ms` : "—"}
        </span>
      </div>
    </div>
  )
}
