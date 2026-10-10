import type { IrdQueueHealth } from "@/lib/api/ird-api"
import { healthCheckLabel, type HealthEntry, type JobsStatus, type MigrationStatus, type ProbeSnapshot } from "@/lib/api/system-health-api"
import { moduleKeyOfCheck } from "./status"
import type { HealthTab } from "./tabs"
import { isStaleHeartbeat } from "./time"

export type AttentionSeverity = "critical" | "warning"

export interface AttentionItem {
  id: string
  severity: AttentionSeverity
  title: string
  /** Plain-language explanation of impact / what to do. */
  description: string
  tab: HealthTab
}

export interface AttentionInput {
  readiness?: { snapshot: ProbeSnapshot | undefined; error: string | null }
  jobs?: JobsStatus
  migrations?: MigrationStatus
  ird?: IrdQueueHealth
  now?: number
}

function explainCheck(entry: HealthEntry): string {
  const degraded = entry.status === "Degraded"
  const mod = moduleKeyOfCheck(entry.name)
  if (mod) {
    return degraded
      ? `The ${mod} database is responding slowly or with warnings. Screens that use it may feel sluggish.`
      : `The ${mod} database isn't responding. Features that read or save ${mod} data will fail until it recovers.`
  }
  switch (entry.name) {
    case "self":
      return "The API process reported a problem with itself. Restarting the API usually clears this."
    case "hangfire":
      return "Background job storage isn't healthy, so scheduled work (IRD sync, invoices, cleanup) may not run."
    case "redis":
      return "The cache is unavailable. The app still works but will be slower and sessions may be affected."
    case "db:tenants-migrations":
      return "One or more pharmacy (tenant) databases are behind on migrations or couldn't be checked."
    default:
      return degraded ? "This check is reporting warnings." : "This check is failing."
  }
}

/** Every problem worth surfacing on the Overview, worst first. */
export function buildAttentionItems(input: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = []
  const now = input.now ?? Date.now()

  if (input.readiness) {
    const { snapshot, error } = input.readiness
    if (!snapshot || snapshot.httpStatus === 0 || !snapshot.result) {
      if (error || snapshot) {
        items.push({
          id: "api-unreachable",
          severity: "critical",
          title: "The API can't be reached",
          description: snapshot?.error ?? error ?? "The web app couldn't contact the backend. Check that the API is running.",
          tab: "services",
        })
      }
    } else {
      for (const entry of snapshot.result.results) {
        if (entry.status === "Healthy") continue
        items.push({
          id: `check:${entry.name}`,
          severity: entry.status === "Unhealthy" ? "critical" : "warning",
          title: `${healthCheckLabel(entry.name)} is ${entry.status.toLowerCase()}`,
          description: entry.description ? `${explainCheck(entry)} (${entry.description})` : explainCheck(entry),
          tab: moduleKeyOfCheck(entry.name) ? "modules" : "services",
        })
      }
    }
  }

  const jobs = input.jobs
  if (jobs && jobs.enabled) {
    if (jobs.error) {
      items.push({ id: "jobs-error", severity: "critical", title: "Job monitoring failed", description: `Hangfire storage returned an error: ${jobs.error}`, tab: "jobs" })
    }
    if (jobs.statistics && jobs.statistics.servers === 0) {
      items.push({
        id: "jobs-no-server",
        severity: "critical",
        title: "No background job server is running",
        description: "Nothing is processing queued or scheduled jobs. IRD sync and other scheduled tasks are on hold.",
        tab: "jobs",
      })
    }
    const stale = jobs.servers.filter((s) => isStaleHeartbeat(s.heartbeat, now))
    if (stale.length > 0) {
      items.push({
        id: "jobs-stale",
        severity: "warning",
        title: `${stale.length} job server${stale.length === 1 ? "" : "s"} stopped reporting`,
        description: "No heartbeat for over 2 minutes — the server may have crashed or lost its connection to storage.",
        tab: "jobs",
      })
    }
    for (const job of jobs.recurringJobs) {
      if (job.lastJobState !== "Failed" && !job.error) continue
      items.push({
        id: `recurring:${job.id}`,
        severity: "warning",
        title: `Recurring job "${job.id}" ${job.error ? "has an error" : "failed last run"}`,
        description: job.error ?? "Its most recent run failed. It will try again on its next schedule.",
        tab: "jobs",
      })
    }
    const failed = jobs.statistics?.failed ?? 0
    if (failed > 0) {
      items.push({
        id: "jobs-failed",
        severity: "warning",
        title: `${failed.toLocaleString()} failed background job${failed === 1 ? "" : "s"}`,
        description: "Failed jobs wait for a retry or manual review in the Hangfire dashboard.",
        tab: "jobs",
      })
    }
  }

  for (const ctx of input.migrations?.contexts ?? []) {
    if (ctx.error) {
      items.push({
        id: `migration-error:${ctx.module}`,
        severity: "critical",
        title: `Couldn't read migrations for ${ctx.module}`,
        description: ctx.error,
        tab: "migrations",
      })
    } else if (ctx.hasPendingMigrations || ctx.pendingMigrations.length > 0) {
      const n = ctx.pendingMigrations.length
      items.push({
        id: `migration-pending:${ctx.module}`,
        severity: "warning",
        title: `${ctx.module} has ${n || "some"} pending migration${n === 1 ? "" : "s"}`,
        description: "The database schema is behind the deployed code. Features in this module may error until migrations run.",
        tab: "migrations",
      })
    }
  }

  const ird = input.ird
  if (ird) {
    if (ird.failedCount > 0) {
      items.push({
        id: "ird-failed",
        severity: "warning",
        title: `${ird.failedCount} IRD queue item${ird.failedCount === 1 ? "" : "s"} failed`,
        description: "These invoices didn't reach the Inland Revenue Department. They are retried automatically.",
        tab: "ird",
      })
    }
    if (ird.salesFailedCount > 0) {
      items.push({
        id: "ird-sales-failed",
        severity: "warning",
        title: `${ird.salesFailedCount} sale${ird.salesFailedCount === 1 ? "" : "s"} need an IRD resend`,
        description: "Retries are exhausted for these sales. Resend them manually from the sale detail.",
        tab: "ird",
      })
    }
  }

  return items.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1))
}
