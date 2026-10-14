/**
 * Maps the .NET API's RFC 7807 ProblemDetails responses (see BuildingBlocks/Web GlobalExceptionHandler)
 * onto the NormalizedApiError shape the UI already handles.
 *
 * `errors` comes in two shapes:
 *   - FluentValidation / model binding: `{ "Name": ["'Name' must not be empty."], ... }` with the generic
 *     detail "One or more validation errors occurred."
 *   - CustomException: `["Incorrect password.", ...]`
 * The generic detail tells the user nothing, so when it is generic the field messages become the message.
 * `details` keeps the raw `errors` value (the field map for forms — see problemFieldErrors).
 */

import type { NormalizedApiError } from "@/lib/api/http-client"

const STATUS_CODES: Record<number, string> = {
  400: "VALIDATION_ERROR",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  429: "RATE_LIMITED",
}

/** Envelope texts that carry no information on their own (ASP.NET / FluentValidation / BFF defaults). */
const GENERIC_MESSAGES = new Set(
  [
    "One or more validation errors occurred.",
    "One or more validation errors occurred",
    "Validation error",
    "Validation failed",
  ].map((m) => m.toLowerCase()),
)

export function isGenericValidationMessage(message: string | undefined | null): boolean {
  return !message || !message.trim() || GENERIC_MESSAGES.has(message.trim().toLowerCase())
}

function pushMessage(target: string[], value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed && !target.includes(trimmed)) target.push(trimmed)
  } else if (value && typeof value === "object" && typeof (value as { message?: unknown }).message === "string") {
    pushMessage(target, (value as { message: string }).message)
  }
}

/**
 * Flattens an `errors` payload into readable messages: a field map whose values are a string or string[]
 * (.NET validation), a string[] (.NET CustomException) or an issue array of `{ message }` (Zod).
 */
export function flattenProblemErrors(errors: unknown): string[] {
  const messages: string[] = []
  if (Array.isArray(errors)) {
    for (const value of errors) pushMessage(messages, value)
    return messages
  }
  if (errors && typeof errors === "object") {
    for (const value of Object.values(errors as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        for (const item of value) pushMessage(messages, item)
      } else {
        pushMessage(messages, value)
      }
    }
  }
  return messages
}

/**
 * Field → messages map from a .NET validation `errors` field map, for wiring into form fields. Each dotted
 * key segment is camel-cased to match the JSON/form field names ("Lines[0].Quantity" → "lines[0].quantity").
 * Returns {} for array or unknown shapes.
 */
export function problemFieldErrors(errors: unknown): Record<string, string[]> {
  if (!errors || typeof errors !== "object" || Array.isArray(errors)) return {}
  const result: Record<string, string[]> = {}
  for (const [rawKey, value] of Object.entries(errors as Record<string, unknown>)) {
    const key = rawKey
      .split(".")
      .map((segment) => (segment ? segment[0].toLowerCase() + segment.slice(1) : segment))
      .join(".")
    const messages = flattenProblemErrors(Array.isArray(value) ? value : [value])
    if (messages.length) result[key] = messages
  }
  return result
}

/** Shown for a permission refusal; the API's own text ("Unauthorized access.") tells staff nothing. */
export const FORBIDDEN_MESSAGE =
  "Your role isn't allowed to do this. Ask the pharmacy admin to add the permission in Settings → Roles & permissions."

/** The framework's ForbiddenException / authorization-policy texts, which carry no business reason. */
function isGenericForbiddenMessage(message: string | undefined): boolean {
  if (!message) return true
  const m = message.trim().toLowerCase()
  return m === "unauthorized access." || m === "forbidden" || m === "forbiddenexception"
}

export function problemToNormalizedError(status: number, body: unknown): NormalizedApiError {
  const problem = (body ?? {}) as { title?: unknown; detail?: unknown; errors?: unknown }
  const detail = typeof problem.detail === "string" ? problem.detail : undefined
  const title = typeof problem.title === "string" ? problem.title : undefined
  const code = STATUS_CODES[status] ?? (status >= 500 ? "INTERNAL" : "BAD_REQUEST")

  const fieldMessages = flattenProblemErrors(problem.errors)
  const envelope = detail ?? title
  const message =
    status === 403 && isGenericForbiddenMessage(envelope)
      ? FORBIDDEN_MESSAGE
      : fieldMessages.length > 0 && isGenericValidationMessage(envelope)
        ? fieldMessages.join(" ")
        : envelope ?? `Request failed with status ${status}`

  return {
    code,
    message,
    status,
    details: problem.errors,
    ...(title ? { title } : {}),
  }
}
