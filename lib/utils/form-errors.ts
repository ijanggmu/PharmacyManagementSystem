import { ApiRequestError } from "@/lib/api/client-helpers"

export type FieldErrorMap = Record<string, string[]>

interface ValidationIssueLike {
  path?: Array<string | number>
  message?: string
}

function normalizeDetailsToFieldErrors(details: unknown): FieldErrorMap {
  const out: FieldErrorMap = {}

  if (!details) return out

  if (Array.isArray(details)) {
    for (const raw of details) {
      const issue = raw as ValidationIssueLike
      const key = issue.path?.length ? String(issue.path[0]) : "form"
      const message = issue.message?.trim()
      if (!message) continue
      if (!out[key]) out[key] = []
      out[key].push(message)
    }
    return out
  }

  if (typeof details === "object") {
    for (const [key, value] of Object.entries(details as Record<string, unknown>)) {
      if (typeof value === "string" && value.trim()) {
        out[key] = [value]
      }
    }
  }

  return out
}

export function extractFormErrors(
  error: unknown
): { formMessage: string; fieldErrors: FieldErrorMap } {
  if (error instanceof ApiRequestError) {
    const fieldErrors = normalizeDetailsToFieldErrors(error.details)
    return {
      formMessage: error.message || "Please fix the highlighted fields.",
      fieldErrors,
    }
  }

  if (error instanceof Error) {
    return { formMessage: error.message, fieldErrors: {} }
  }

  return { formMessage: "Something went wrong.", fieldErrors: {} }
}

