/**
 * Pure retry policy for the POS offline sales queue (no IndexedDB, no React) so it can be unit-tested.
 *
 * - Transient failures (network, timeout, 5xx, 408/429) are retried with exponential backoff.
 * - Permanent failures (any other 4xx: validation, conflict, forbidden) stop auto-retry and are
 *   surfaced as "needs attention" — retrying the same body would only fail the same way.
 */

export type SyncFailureKind = "transient" | "permanent"

const BASE_DELAY_MS = 30_000
const MAX_DELAY_MS = 30 * 60_000

/** Delay before the next attempt after `attempts` failed ones: 30s, 1m, 2m, 4m … capped at 30m. */
export function nextBackoffMs(attempts: number): number {
  const n = Math.max(1, Math.floor(attempts))
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (n - 1))
}

/** HTTP status carried by an error, 0 when the request never got a response, undefined when unknown. */
export function errorStatus(error: unknown): number | undefined {
  if (error && typeof error === "object") {
    const normalized = (error as { normalized?: { status?: unknown } }).normalized
    if (normalized && typeof normalized.status === "number") return normalized.status
    const status = (error as { status?: unknown }).status
    if (typeof status === "number") return status
  }
  return undefined
}

/** Whether a failed create/sync should be retried later or needs a person to look at it. */
export function classifySyncFailure(error: unknown): SyncFailureKind {
  const status = errorStatus(error)
  if (status === undefined) {
    // fetch() TypeError, IndexedDB hiccup, or an unknown error — assume the connection, retry.
    return "transient"
  }
  if (status === 0 || status >= 500 || status === 408 || status === 429) return "transient"
  return "permanent"
}

/**
 * True when a failed online checkout may or may not have reached the server (no response, timeout or
 * 5xx) — the sale must then be queued under the SAME idempotency key so a later retry either replays the
 * recorded sale or creates it once. A definite rejection (4xx) is shown to the cashier instead.
 */
export function isAmbiguousCreateFailure(error: unknown): boolean {
  return classifySyncFailure(error) === "transient"
}

export interface RetryState {
  status: "pending" | "failed" | "synced"
  attempts?: number
  nextAttemptAt?: string | null
}

/** A pending record is due when it has no scheduled time or that time has passed. */
export function isDue(record: RetryState, now: Date = new Date()): boolean {
  if (record.status !== "pending") return false
  if (!record.nextAttemptAt) return true
  return new Date(record.nextAttemptAt).getTime() <= now.getTime()
}

/** The record's state after one failed sync attempt. */
export function afterFailure<T extends RetryState & { lastError?: string }>(
  record: T,
  error: unknown,
  now: Date = new Date(),
): T {
  const attempts = (record.attempts ?? 0) + 1
  const message = error instanceof Error ? error.message : "Sync failed"
  if (classifySyncFailure(error) === "permanent") {
    return { ...record, attempts, status: "failed", nextAttemptAt: null, lastError: message }
  }
  return {
    ...record,
    attempts,
    status: "pending",
    nextAttemptAt: new Date(now.getTime() + nextBackoffMs(attempts)).toISOString(),
    lastError: message,
  }
}
