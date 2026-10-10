import type { HealthEntry, MigrationContextStatus } from "@/lib/api/system-health-api"
import { matchesQuery } from "./paginate"
import { moduleKeyOfCheck, type RowStatus } from "./status"

/** One business module: its database health check merged with its EF migration context. */
export interface ModuleRow {
  /** Lower-case key shared by "db:<key>" and the migration context's module name. */
  key: string
  name: string
  check: HealthEntry | null
  migration: MigrationContextStatus | null
  dbStatus: RowStatus
  latencyMs: number | null
  pendingCount: number
  migrationError: string | null
  /** True when the DB isn't healthy, migrations are pending, or the migration lookup failed. */
  hasIssue: boolean
}

function titleCase(key: string): string {
  return key
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function mergeModules(
  checks: readonly HealthEntry[],
  contexts: readonly MigrationContextStatus[] | null | undefined,
): ModuleRow[] {
  const byKey = new Map<string, { check: HealthEntry | null; migration: MigrationContextStatus | null }>()
  for (const check of checks) {
    const key = moduleKeyOfCheck(check.name)
    if (!key) continue
    byKey.set(key, { check, migration: byKey.get(key)?.migration ?? null })
  }
  for (const migration of contexts ?? []) {
    const key = migration.module.trim().toLowerCase()
    if (!key) continue
    byKey.set(key, { check: byKey.get(key)?.check ?? null, migration })
  }

  return Array.from(byKey, ([key, { check, migration }]) => {
    const dbStatus: RowStatus = check?.status ?? "Unknown"
    const pendingCount = migration?.pendingMigrations.length ?? 0
    const migrationError = migration?.error ?? null
    return {
      key,
      name: migration?.module ?? titleCase(key),
      check,
      migration,
      dbStatus,
      latencyMs: check ? check.durationMs : null,
      pendingCount,
      migrationError,
      hasIssue: dbStatus === "Unhealthy" || dbStatus === "Degraded" || pendingCount > 0 || Boolean(migration?.hasPendingMigrations) || Boolean(migrationError),
    }
  })
}

/** Sort key for "Status": failing DB/migration errors first, then degraded/pending, then unknown, then healthy. */
export function moduleSeverity(row: ModuleRow): number {
  if (row.dbStatus === "Unhealthy" || row.migrationError) return 0
  if (row.dbStatus === "Degraded" || row.pendingCount > 0) return 1
  return row.dbStatus === "Unknown" ? 2 : 3
}

export type ModuleStatusFilter = "all" | "issues" | "healthy"
export type ModuleSort = "name" | "latency" | "status"

export interface ModuleQuery {
  search: string
  status: ModuleStatusFilter
  sort: ModuleSort
}

export function filterAndSortModules(rows: readonly ModuleRow[], q: ModuleQuery): ModuleRow[] {
  const filtered = rows.filter((r) => {
    if (q.status === "issues" && !r.hasIssue) return false
    if (q.status === "healthy" && r.hasIssue) return false
    return matchesQuery(q.search, [r.name, r.key, r.check?.name, r.migration?.lastAppliedMigration, r.migrationError])
  })
  const byName = (a: ModuleRow, b: ModuleRow) => a.name.localeCompare(b.name)
  return filtered.sort((a, b) => {
    if (q.sort === "latency") return (b.latencyMs ?? -1) - (a.latencyMs ?? -1) || byName(a, b)
    if (q.sort === "status") return moduleSeverity(a) - moduleSeverity(b) || byName(a, b)
    return byName(a, b)
  })
}

/** Largest latency across rows (≥ 1 so it's a safe divisor). */
export function maxLatency(rows: readonly ModuleRow[]): number {
  return rows.reduce((max, r) => Math.max(max, r.latencyMs ?? 0), 1)
}

/** 0..1 bar fraction relative to the slowest module. */
export function latencyFraction(latencyMs: number | null, max: number): number {
  if (latencyMs === null || !Number.isFinite(latencyMs) || max <= 0) return 0
  return Math.min(1, Math.max(0, latencyMs / max))
}

/**
 * EF migration ids look like "20250114093000_AddSaleReturns". Show "AddSaleReturns · 2025-01-14";
 * anything else is returned unchanged.
 */
export function shortMigrationName(id: string | null | undefined): string {
  if (!id) return "None"
  const match = /^(\d{4})(\d{2})(\d{2})\d{6,}_(.+)$/.exec(id)
  if (!match) return id
  const [, y, m, d, name] = match
  return `${name} · ${y}-${m}-${d}`
}
