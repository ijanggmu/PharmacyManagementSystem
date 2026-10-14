/** The `errors` marker of the 409 the API answers when a cash sale is attempted with no cash shift open. */
export const CASH_SHIFT_REQUIRED_MARKER = "cash_shift_required"

/** True when a checkout was refused because no cash shift is open at the branch. */
export function isCashShiftRequired(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const normalized = ((error as { normalized?: unknown }).normalized ?? error) as { status?: unknown; details?: unknown }
  return (
    normalized.status === 409 &&
    Array.isArray(normalized.details) &&
    normalized.details.includes(CASH_SHIFT_REQUIRED_MARKER)
  )
}
