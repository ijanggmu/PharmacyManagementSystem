/** Pulls the human-readable Zod/field messages out of an API error `details` payload.
 *  The envelope message is often the generic "Validation failed". */
export function formatValidationDetails(details: unknown): string | null {
  if (Array.isArray(details)) {
    const messages = details
      .map((raw) => {
        if (!raw || typeof raw !== "object") return null
        const message = (raw as { message?: unknown }).message
        return typeof message === "string" ? message.trim() : null
      })
      .filter((message): message is string => !!message)
    return messages.length ? messages.join(" ") : null
  }

  if (details && typeof details === "object") {
    const messages = Object.values(details as Record<string, unknown>).filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0
    )
    return messages.length ? messages.join(" ") : null
  }

  return null
}

const GENERIC_VALIDATION_MESSAGE = "Validation failed"

/** Prefer the specific field messages over a generic validation envelope. */
export function userFacingErrorMessage(message: string, code: string, details?: unknown): string {
  const fromDetails = formatValidationDetails(details)
  if (fromDetails && (code === "VALIDATION_ERROR" || message === GENERIC_VALIDATION_MESSAGE || !message.trim())) {
    return fromDetails
  }
  return message.trim() || fromDetails || "An unknown error occurred"
}
