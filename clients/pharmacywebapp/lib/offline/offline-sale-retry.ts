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
  /** When the sale was queued (ISO). */
  createdAt?: string
}

/**
 * The first replay of a queued sale waits at least this long after it was queued: the online attempt that
 * timed out may still be in flight (or may already have been recorded), and replaying immediately would
 * race it. The replay always carries the original Idempotency-Key, so the server returns the existing sale.
 */
export const FIRST_ATTEMPT_DELAY_MS = 60_000

/** When a freshly queued sale may first be replayed. */
export function firstAttemptAt(now: Date = new Date()): string {
  return new Date(now.getTime() + FIRST_ATTEMPT_DELAY_MS).toISOString()
}

/** True while a queued sale is still inside its first-attempt grace period (see FIRST_ATTEMPT_DELAY_MS). */
export function inFirstAttemptGrace(record: RetryState, now: Date = new Date()): boolean {
  if (!record.createdAt) return false
  const created = new Date(record.createdAt).getTime()
  if (Number.isNaN(created)) return false
  return now.getTime() - created < FIRST_ATTEMPT_DELAY_MS
}

/**
 * A pending record is due when it is past its first-attempt grace period and has no scheduled time or that
 * time has passed. `force` (back online / "sync now" / manual retry) skips the backoff schedule but never
 * the first-attempt grace period.
 */
export function isDue(record: RetryState, now: Date = new Date(), force = false): boolean {
  if (record.status !== "pending") return false
  if (inFirstAttemptGrace(record, now)) return false
  if (force || !record.nextAttemptAt) return true
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
