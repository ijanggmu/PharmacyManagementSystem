/**
 * Recognises the .NET SafetyWarningException (409) the create-sale endpoint returns when the cart has a
 * drug interaction or matches a customer allergy. The ProblemDetails body carries title
 * "SafetyWarningException", the generic detail message, and `errors`: one line per interaction plus one
 * "Customer has a recorded allergy to: …" line. The cashier may resubmit with acknowledgeWarnings.
 */

export interface SafetyWarningInfo {
  /** One description per drug interaction. */
  interactions: string[]
  /** The allergy line, when the customer's recorded allergies match the cart. */
  allergy: string | null
}

const SAFETY_TITLE = "SafetyWarningException"
const SAFETY_MESSAGE_HINT = /drug interaction or allergy warning/i
const ALLERGY_PREFIX = /^customer has a recorded allergy/i

interface NormalizedLike {
  status?: unknown
  title?: unknown
  message?: unknown
  details?: unknown
}

/** The warning details when `error` is a safety-warning 409, otherwise null. */
export function parseSafetyWarning(error: unknown): SafetyWarningInfo | null {
  if (!error || typeof error !== "object") return null
  const normalized = ((error as { normalized?: NormalizedLike }).normalized ?? error) as NormalizedLike
  if (normalized.status !== 409) return null

  const message = typeof normalized.message === "string" ? normalized.message : ""
  const isSafety = normalized.title === SAFETY_TITLE || SAFETY_MESSAGE_HINT.test(message)
  if (!isSafety) return null

  const lines = Array.isArray(normalized.details)
    ? normalized.details.filter((d): d is string => typeof d === "string" && d.trim().length > 0)
    : []
  const allergy = lines.find((line) => ALLERGY_PREFIX.test(line)) ?? null
  const interactions = lines.filter((line) => line !== allergy)
  if (interactions.length === 0 && !allergy && message) interactions.push(message)
  return { interactions, allergy }
}
