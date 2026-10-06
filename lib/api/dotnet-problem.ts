/**
 * Maps the .NET API's RFC 7807 ProblemDetails responses (see BuildingBlocks/Web GlobalExceptionHandler)
 * onto the NormalizedApiError shape the UI already handles.
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

export function problemToNormalizedError(status: number, body: unknown): NormalizedApiError {
  const problem = (body ?? {}) as { title?: unknown; detail?: unknown; errors?: unknown }
  const detail = typeof problem.detail === "string" ? problem.detail : undefined
  const title = typeof problem.title === "string" ? problem.title : undefined
  const code = STATUS_CODES[status] ?? (status >= 500 ? "INTERNAL" : "BAD_REQUEST")
  return {
    code,
    message: detail ?? title ?? `Request failed with status ${status}`,
    status,
    details: problem.errors,
  }
}
