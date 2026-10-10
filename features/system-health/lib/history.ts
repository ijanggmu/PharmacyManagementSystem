import type { OverallStatus } from "./status"

export const HISTORY_SIZE = 30

export interface HistoryEntry {
  /** Epoch ms of the poll. */
  at: number
  status: Exclude<OverallStatus, "Loading">
  /** Null when the API never answered. */
  roundTripMs: number | null
}

/** Ring buffer append: returns a new array holding at most `max` newest entries. Duplicate timestamps are ignored. */
export function pushHistory(buffer: readonly HistoryEntry[], entry: HistoryEntry, max = HISTORY_SIZE): HistoryEntry[] {
  if (buffer.length > 0 && buffer[buffer.length - 1].at === entry.at) return buffer.slice()
  const next = [...buffer, entry]
  return next.length > max ? next.slice(next.length - max) : next
}

export interface LatencyStats {
  min: number
  avg: number
  max: number
  count: number
}

export function latencyStats(entries: readonly HistoryEntry[]): LatencyStats | null {
  const values = entries.map((e) => e.roundTripMs).filter((v): v is number => typeof v === "number" && Number.isFinite(v))
  if (values.length === 0) return null
  const sum = values.reduce((a, b) => a + b, 0)
  return {
    min: Math.min(...values),
    avg: Math.round(sum / values.length),
    max: Math.max(...values),
    count: values.length,
  }
}

/**
 * SVG polyline points for a sparkline over `slots` evenly spaced x positions, right-aligned so the
 * newest value always sits at the right edge. Null values break nothing — they're skipped.
 */
export function sparklinePoints(
  values: readonly (number | null)[],
  width: number,
  height: number,
  opts: { slots?: number; padding?: number } = {},
): string {
  const slots = Math.max(2, opts.slots ?? values.length)
  const pad = opts.padding ?? 2
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v))
  if (nums.length === 0) return ""
  const lo = Math.min(...nums)
  const hi = Math.max(...nums)
  const span = hi - lo || 1
  const dx = (width - pad * 2) / (slots - 1)
  const offset = slots - values.length
  const points: string[] = []
  values.forEach((v, i) => {
    if (typeof v !== "number" || !Number.isFinite(v)) return
    const x = pad + (offset + i) * dx
    // Flat series draw through the middle rather than hugging an edge.
    const y = hi === lo ? height / 2 : height - pad - ((v - lo) / span) * (height - pad * 2)
    points.push(`${round(x)},${round(y)}`)
  })
  return points.join(" ")
}

const round = (n: number) => Math.round(n * 10) / 10
