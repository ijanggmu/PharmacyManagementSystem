import { flattenProblemErrors, isGenericValidationMessage } from "@/lib/api/dotnet-problem"

/** Pulls the human-readable Zod/field messages out of an API error `details` payload.
 *  The envelope message is often the generic "Validation failed" / "One or more validation errors occurred.".
 *  Handles Zod issue arrays (`[{ message }]`), plain string arrays (.NET CustomException `errors`) and field
 *  maps whose values are a string or a string[] (.NET FluentValidation `errors`). */
export function formatValidationDetails(details: unknown): string | null {
  const messages = flattenProblemErrors(details)
  return messages.length ? messages.join(" ") : null
}

/** Prefer the specific field messages over a generic validation envelope. */
export function userFacingErrorMessage(message: string, code: string, details?: unknown): string {
  const fromDetails = formatValidationDetails(details)
  if (fromDetails && (code === "VALIDATION_ERROR" || isGenericValidationMessage(message))) {
    return fromDetails
  }
  return message.trim() || fromDetails || "An unknown error occurred"
}
