/**
 * Idempotency-Key helpers for .NET mutations (stock and money writes). The backend replays the stored
 * response when it sees a key again, so a retried submit (double click, timeout + retry) is applied once.
 *
 * Generate the key where the user action starts and reuse it while the same action is retried: a tracker
 * keyed by a fingerprint of the action (what is being submitted) hands back the same key until the action
 * changes or reset() is called after it succeeded.
 */

export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

export interface IdempotencyKeyTracker {
  /** The key for this action: reused while the fingerprint stays the same, fresh when it changes. */
  keyFor(fingerprint: string): string
  /** Forget the current key (call after the action succeeded, so the next one starts clean). */
  reset(): void
}

export function createIdempotencyKeyTracker(newKey: () => string = newIdempotencyKey): IdempotencyKeyTracker {
  let current: { fingerprint: string; key: string } | null = null
  return {
    keyFor(fingerprint: string): string {
      if (!current || current.fingerprint !== fingerprint) current = { fingerprint, key: newKey() }
      return current.key
    },
    reset(): void {
      current = null
    },
  }
}
