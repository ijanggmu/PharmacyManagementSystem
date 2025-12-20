/**
 * API Request Logger
 * Logs API requests for debugging and monitoring
 */

import { NextRequest } from "next/server"

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
}

export function logRequest(
  request: NextRequest,
  options?: {
    status?: number
    duration?: number
    userId?: string
    error?: string
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
  }

  // In production, send to logging service
  // For now, just console log
  if (process.env.NODE_ENV === "development") {
    console.log("[API Request]", JSON.stringify(logEntry, null, 2))
  }

  // TODO: Send to logging service (e.g., Sentry, LogRocket, etc.)
  return logEntry
}

