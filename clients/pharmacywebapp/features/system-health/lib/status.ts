import type { HealthEntry, HealthStatus, ProbeSnapshot } from "@/lib/api/system-health-api"

/** Overall API state as the header shows it. "Loading" only before the first answer. */
export type OverallStatus = HealthStatus | "Unreachable" | "Loading"

/** Status of a single row; "Unknown" when a source didn't report it. */
export type RowStatus = HealthStatus | "Unknown"

/** Lower = worse. Used to sort problems first. */
export function statusRank(status: OverallStatus | RowStatus): number {
  switch (status) {
    case "Unreachable":
      return 0
    case "Unhealthy":
      return 1
    case "Degraded":
      return 2
    case "Unknown":
    case "Loading":
      return 3
    case "Healthy":
      return 4
  }
}

export function overallStatus(snapshot: ProbeSnapshot | undefined, opts: { loading: boolean; failed: boolean }): OverallStatus {
  if (!snapshot) {
    if (opts.failed) return "Unreachable"
    return opts.loading ? "Loading" : "Unreachable"
  }
  if (snapshot.httpStatus === 0 || !snapshot.result) return "Unreachable"
  return snapshot.result.status
}

/** The worst of several statuses (e.g. aggregating a group of checks). */
export function worstStatus(statuses: readonly RowStatus[]): RowStatus {
  if (statuses.length === 0) return "Unknown"
  return statuses.reduce<RowStatus>((worst, s) => (statusRank(s) < statusRank(worst) ? s : worst), "Healthy")
}

export interface CheckSummary {
  total: number
  passing: number
  failing: number
  degraded: number
  slowest: HealthEntry | null
}

export function summarizeChecks(results: readonly HealthEntry[]): CheckSummary {
  let passing = 0
  let failing = 0
  let degraded = 0
  let slowest: HealthEntry | null = null
  for (const r of results) {
    if (r.status === "Healthy") passing++
    else if (r.status === "Degraded") degraded++
    else failing++
    if (!slowest || r.durationMs > slowest.durationMs) slowest = r
  }
  return { total: results.length, passing, failing, degraded, slowest }
}

/** "db:accounting" → "accounting"; null for non-module checks (including tenant migrations). */
export function moduleKeyOfCheck(name: string): string | null {
  if (!name.startsWith("db:") || name === "db:tenants-migrations") return null
  return name.slice(3).toLowerCase()
}

export function isPlatformCheck(name: string): boolean {
  return moduleKeyOfCheck(name) === null
}
