/**
 * Tenant-scoped view of the API health probe: removes platform-wide checks (which list every tenant),
 * strips check details (which can name other tenants or infrastructure), and recomputes the overall
 * status from what remains. Used by app/api/system-health/route.ts for non-platform users.
 */

/** Checks that describe every tenant (never shown to a tenant-scoped user). */
export const PLATFORM_ONLY_CHECKS = new Set(["db:tenants-migrations"])

interface ProbeEntry {
  name: string
  status: string
  details?: unknown
  [key: string]: unknown
}

export function redactHealthForTenant(body: unknown): unknown {
  if (!body || typeof body !== "object" || !Array.isArray((body as { results?: unknown }).results)) return body
  const results = ((body as { results: ProbeEntry[] }).results)
    .filter((r) => !PLATFORM_ONLY_CHECKS.has(r.name))
    .map(({ details: _details, ...rest }) => ({ ...rest, details: null }))
  const status = results.some((r) => r.status === "Unhealthy")
    ? "Unhealthy"
    : results.some((r) => r.status === "Degraded")
      ? "Degraded"
      : "Healthy"
  return { ...(body as object), status, results }
}
