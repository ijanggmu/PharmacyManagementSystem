import { dotnetClient } from "@/lib/api/dotnet-client"

/**
 * System health sources:
 * - /api/system-health?probe=ready|live — ASP.NET health probes via our same-origin BFF route
 *   (db per module, hangfire storage, redis, tenant migrations).
 * - /api/v1/system/jobs — Hangfire monitoring (root only).
 * - /api/v1/system/migration-status — EF applied vs pending per module (root only).
 * IRD queue health lives in lib/api/ird-api.ts.
 */

export type HealthStatus = "Healthy" | "Degraded" | "Unhealthy"

export interface HealthEntry {
  name: string
  status: HealthStatus
  description?: string | null
  durationMs: number
  details?: Record<string, unknown> | null
}

export interface HealthResult {
  status: HealthStatus
  results: HealthEntry[]
}

export interface ProbeSnapshot {
  /** Upstream HTTP status; 0 when the API couldn't be reached. */
  httpStatus: number
  roundTripMs: number
  result: HealthResult | null
  error?: string
}

export async function getHealthProbe(probe: "live" | "ready", signal?: AbortSignal): Promise<ProbeSnapshot> {
  const res = await fetch(`/api/system-health?probe=${probe}`, { cache: "no-store", credentials: "same-origin", signal })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string; detail?: string } | null
    throw new Error(body?.message ?? body?.detail ?? `Health probe failed (${res.status})`)
  }
  return (await res.json()) as ProbeSnapshot
}

export interface JobStatistics {
  servers: number
  queues: number
  enqueued: number
  scheduled: number
  processing: number
  succeeded: number
  failed: number
  deleted: number
  recurring: number
}

export interface JobServer {
  name: string
  queues: string[]
  workersCount: number
  startedAt: string
  heartbeat: string | null
}

export interface RecurringJobStatus {
  id: string
  cron: string | null
  queue: string | null
  nextExecution: string | null
  lastExecution: string | null
  lastJobState: string | null
  error: string | null
}

export interface FailedJobSummary {
  jobId: string
  job: string | null
  exceptionType: string | null
  exceptionMessage: string | null
  failedAt: string | null
}

export interface JobsStatus {
  enabled: boolean
  generatedAtUtc: string | null
  statistics: JobStatistics | null
  servers: JobServer[]
  recurringJobs: RecurringJobStatus[]
  recentFailed: FailedJobSummary[]
  error: string | null
}

export function getJobsStatus(): Promise<JobsStatus> {
  return dotnetClient.get<JobsStatus>("/api/v1/system/jobs")
}

export interface MigrationContextStatus {
  module: string
  provider: string | null
  lastAppliedMigration: string | null
  pendingMigrations: string[]
  hasPendingMigrations: boolean
  error: string | null
}

export interface MigrationStatus {
  generatedAtUtc: string
  contexts: MigrationContextStatus[]
}

export function getMigrationStatus(): Promise<MigrationStatus> {
  return dotnetClient.get<MigrationStatus>("/api/v1/system/migration-status")
}

/** Health check names → readable labels ("db:accounting" → "Accounting database"). */
export function healthCheckLabel(name: string): string {
  if (name === "self") return "API process"
  if (name === "hangfire") return "Background jobs (Hangfire)"
  if (name === "redis") return "Cache (Redis / Valkey)"
  if (name === "db:tenants-migrations") return "Tenant database migrations"
  if (name.startsWith("db:")) {
    const mod = name.slice(3)
    return `${mod.charAt(0).toUpperCase()}${mod.slice(1)} database`
  }
  return name
}

export type HealthCheckGroup = "platform" | "databases" | "tenants"

export function healthCheckGroup(name: string): HealthCheckGroup {
  if (name === "db:tenants-migrations") return "tenants"
  if (name.startsWith("db:")) return "databases"
  return "platform"
}
