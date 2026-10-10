/** Heartbeats older than this mean the Hangfire server has probably stopped. */
export const STALE_HEARTBEAT_MS = 2 * 60_000

function parse(value: string | number | Date): number {
  if (typeof value === "number") return value
  if (value instanceof Date) return value.getTime()
  return new Date(value).getTime()
}

/**
 * Compact relative time in both directions: "just now", "45s ago", "12 min ago", "in 3 h", "in 2 d".
 * Unlike formatDate(…, "relative") this handles future timestamps (next job run).
 */
export function formatRelative(value: string | number | Date | null | undefined, now: number = Date.now()): string {
  if (value === null || value === undefined) return "—"
  const t = parse(value)
  if (!Number.isFinite(t)) return "—"
  const diff = t - now
  const abs = Math.abs(diff)
  const future = diff > 0
  if (abs < 5_000) return "just now"
  let text: string
  if (abs < 60_000) text = `${Math.round(abs / 1000)}s`
  else if (abs < 3_600_000) text = `${Math.round(abs / 60_000)} min`
  else if (abs < 86_400_000) text = `${Math.round(abs / 3_600_000)} h`
  else text = `${Math.round(abs / 86_400_000)} d`
  return future ? `in ${text}` : `${text} ago`
}

/** "Checked 12s ago" style label for the header. */
export function formatSecondsAgo(at: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000))
  if (seconds < 5) return "just now"
  if (seconds < 60) return `${seconds}s ago`
  return `${Math.round(seconds / 60)}m ago`
}

export function isStaleHeartbeat(heartbeat: string | null | undefined, now: number = Date.now()): boolean {
  if (!heartbeat) return true
  const t = parse(heartbeat)
  if (!Number.isFinite(t)) return true
  return now - t > STALE_HEARTBEAT_MS
}

/** Absolute timestamp for title tooltips. */
export function formatTimestamp(value: string | number | Date | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined
  const t = parse(value)
  if (!Number.isFinite(t)) return undefined
  return new Date(t).toLocaleString()
}
