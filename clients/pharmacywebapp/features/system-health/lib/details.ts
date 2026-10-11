import type { RecurringJobStatus } from "@/lib/api/system-health-api"
import { matchesQuery } from "./paginate"

/** Render an arbitrary health-check detail value as a single line of text. */
export function detailValueText(value: unknown): string {
  if (value === null || value === undefined) return "—"
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export type TenantRowTone = "healthy" | "warning" | "failing" | "unknown"

export interface TenantRow {
  tenant: string
  status: string
  tone: TenantRowTone
}

function toneOf(status: string): TenantRowTone {
  const s = status.toLowerCase()
  if (/(healthy|up[\s-]?to[\s-]?date|current|^ok$|applied|success)/.test(s)) return "healthy"
  if (/(pending|degraded|behind|warn)/.test(s)) return "warning"
  if (/(fail|error|unhealthy|unreachable|exception|down)/.test(s)) return "failing"
  return "unknown"
}

/** "db:tenants-migrations" details are keyed by tenant id; values may be strings or small objects. */
export function tenantRowsFromDetails(details: Record<string, unknown> | null | undefined): TenantRow[] {
  if (!details) return []
  return Object.entries(details)
    .map(([tenant, value]) => {
      let status: string
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const record = value as Record<string, unknown>
        const named = record.status ?? record.Status ?? record.state
        status = typeof named === "string" ? named : detailValueText(value)
      } else {
        status = detailValueText(value)
      }
      return { tenant, status, tone: toneOf(status) }
    })
    .sort((a, b) => toneRank(a.tone) - toneRank(b.tone) || a.tenant.localeCompare(b.tenant))
}

function toneRank(t: TenantRowTone): number {
  return t === "failing" ? 0 : t === "warning" ? 1 : t === "unknown" ? 2 : 3
}

export function filterRecurringJobs(jobs: readonly RecurringJobStatus[], query: string): RecurringJobStatus[] {
  return jobs.filter((j) => matchesQuery(query, [j.id, j.cron, j.queue, j.lastJobState, j.error]))
}

export type JobStateTone = "success" | "danger" | "info" | "muted" | "warning"

export function jobStateTone(state: string | null, error: string | null): JobStateTone {
  if (error) return "danger"
  switch (state) {
    case "Succeeded":
      return "success"
    case "Failed":
      return "danger"
    case "Processing":
    case "Enqueued":
      return "info"
    case "Deleted":
      return "warning"
    default:
      return "muted"
  }
}
