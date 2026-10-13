/**
 * API Request Logger
 * Logs API requests for debugging and monitoring
 */

import { NextRequest } from "next/server"
import { reportServerError } from "@/lib/observability/error-reporter"

export interface LogEntry {
  method: string
  path: string
  status?: number
  duration?: number
  userId?: string
  ip?: string
  userAgent?: string
  timestamp: string
  error?: string
  errorDetails?: unknown
}

export function logRequest(
  request: NextRequest,
  options?: {
    status?: number
    duration?: number
    userId?: string
    error?: string
    errorDetails?: unknown
  }
) {
  const logEntry: LogEntry = {
    method: request.method,
    path: request.nextUrl.pathname,
    status: options?.status,
    duration: options?.duration,
    userId: options?.userId,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        request.headers.get("x-real-ip") ||
        "unknown",
    userAgent: request.headers.get("user-agent") || undefined,
    timestamp: new Date().toISOString(),
    error: options?.error,
    errorDetails: options?.errorDetails,
  }

  if (process.env.NODE_ENV === "development") {
    console.log("[API Request]", JSON.stringify(logEntry, null, 2))
  }

  // Failures go to the Sentry-compatible collector when SENTRY_DSN is set (a no-op otherwise). Fire-and-forget:
  // the reporter never throws and times out on its own, so logging never delays or breaks the response.
  if (options?.error || (options?.status !== undefined && options.status >= 500)) {
    void reportServerError(options?.errorDetails ?? new Error(options?.error ?? `HTTP ${options?.status}`), {
      method: logEntry.method,
      path: logEntry.path,
      tags: { status: options?.status, source: "api-route" },
    })
  }

  return logEntry
}

