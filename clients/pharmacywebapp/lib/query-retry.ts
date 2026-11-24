/**
 * Retry policy for TanStack queries.
 *
 * A 429 means the API's per-minute limit was reached (a dashboard loads many figures at once). Waiting a few
 * seconds and asking again is what the user would do, so it is retried with a longer backoff instead of
 * showing "Rate limit exceeded". Other 4xx answers are final; server and network failures retry quickly.
 */

const MAX_RETRIES = 3

function errorStatus(error: unknown): number | undefined {
  const e = error as { status?: unknown; normalized?: { status?: unknown } } | null | undefined
  const status = e?.status ?? e?.normalized?.status
  return typeof status === "number" ? status : undefined
}

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  const status = errorStatus(error)
  if (status !== undefined && status >= 400 && status < 500 && status !== 429) return false
  return failureCount < MAX_RETRIES
}

export function queryRetryDelay(failureCount: number, error: unknown): number {
  const base = errorStatus(error) === 429 ? 5_000 : 1_000
  return Math.min(base * 2 ** failureCount, 30_000)
}
