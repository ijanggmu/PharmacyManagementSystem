/**
 * Server-side error reporting to any Sentry-compatible collector (Sentry, GlitchTip, Bugsink, …) WITHOUT the
 * Sentry SDK: one envelope POST per error over `fetch`, so the bundle gains no dependency.
 *
 * Configuration (runtime environment of the web container — not NEXT_PUBLIC_, never sent to browsers):
 *   SENTRY_DSN          https://<public key>@<host>[/<path>]/<project id>. Unset/empty = reporting is a no-op.
 *   SENTRY_ENVIRONMENT  e.g. "production" (default: NODE_ENV)
 *   SENTRY_RELEASE      e.g. the deployed image sha (compose passes IMAGE_TAG)
 *
 * Privacy: only the error (type, message, stack), the request method + path (no query string, headers, cookies
 * or body) and a few tags are sent.
 * Reporting never throws and never blocks a response for long: it is fire-and-forget with a short timeout.
 */

export interface ParsedDsn {
  envelopeUrl: string
  publicKey: string
  projectId: string
}

export interface ErrorContext {
  method?: string
  path?: string
  /** Free-form string tags, e.g. routeType / status. */
  tags?: Record<string, string | number | undefined>
}

interface StackFrame {
  function?: string
  filename?: string
  lineno?: number
  colno?: number
  in_app?: boolean
}

const REPORT_TIMEOUT_MS = 3_000
const MAX_MESSAGE_LENGTH = 2_000

/** Parses a Sentry DSN; null for anything malformed (reporting then stays off rather than failing). */
export function parseSentryDsn(dsn: string | undefined | null): ParsedDsn | null {
  if (!dsn || !dsn.trim()) return null
  let url: URL
  try {
    url = new URL(dsn.trim())
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  const publicKey = decodeURIComponent(url.username)
  const segments = url.pathname.split("/").filter(Boolean)
  const projectId = segments.pop()
  if (!publicKey || !projectId || !/^\d+$/.test(projectId)) return null
  const prefix = segments.length > 0 ? `/${segments.join("/")}` : ""
  const query = new URLSearchParams({ sentry_key: publicKey, sentry_version: "7", sentry_client: "pharmacywebapp/1.0" })
  return {
    envelopeUrl: `${url.protocol}//${url.host}${prefix}/api/${projectId}/envelope/?${query.toString()}`,
    publicKey,
    projectId,
  }
}

/** V8 stack ("    at fn (file:line:col)") → Sentry frames, oldest call first as Sentry expects. */
export function parseStackFrames(stack: string | undefined): StackFrame[] {
  if (!stack) return []
  const frames: StackFrame[] = []
  for (const raw of stack.split("\n").slice(1, 51)) {
    const line = raw.trim()
    if (!line.startsWith("at ")) continue
    const withFn = /^at (.+?) \((.+):(\d+):(\d+)\)$/.exec(line)
    const bare = withFn ? null : /^at (.+):(\d+):(\d+)$/.exec(line)
    const frame: StackFrame = withFn
      ? { function: withFn[1], filename: withFn[2], lineno: Number(withFn[3]), colno: Number(withFn[4]) }
      : bare
        ? { filename: bare[1], lineno: Number(bare[2]), colno: Number(bare[3]) }
        : { function: line.slice(3) }
    frame.in_app = !!frame.filename && !frame.filename.includes("node_modules") && !frame.filename.startsWith("node:")
    frames.push(frame)
  }
  return frames.reverse()
}

function normalizeError(error: unknown): { type: string; value: string; stack?: string } {
  if (error instanceof Error) {
    return { type: error.name || "Error", value: error.message.slice(0, MAX_MESSAGE_LENGTH), stack: error.stack }
  }
  const value = typeof error === "string" ? error : (() => {
    try {
      return JSON.stringify(error)
    } catch {
      return String(error)
    }
  })()
  return { type: "NonError", value: (value ?? "unknown").slice(0, MAX_MESSAGE_LENGTH) }
}

function randomEventId(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

/** Builds the Sentry envelope body (newline-delimited JSON) for one error event. */
export function buildErrorEnvelope(
  error: unknown,
  context: ErrorContext,
  options: { dsn: string; environment?: string; release?: string; now?: Date; eventId?: string },
): string {
  const now = options.now ?? new Date()
  const eventId = options.eventId ?? randomEventId()
  const normalized = normalizeError(error)
  const digest =
    error && typeof error === "object" && "digest" in error && typeof (error as { digest: unknown }).digest === "string"
      ? (error as { digest: string }).digest
      : undefined

  const tags: Record<string, string> = {}
  for (const [key, value] of Object.entries(context.tags ?? {})) {
    if (value !== undefined && value !== "") tags[key] = String(value)
  }
  if (digest) tags.digest = digest

  // The path only — a query string can carry search terms or tokens.
  const path = context.path?.split("?")[0]
  const event = {
    event_id: eventId,
    timestamp: now.getTime() / 1000,
    platform: "node",
    level: "error",
    logger: "pharmacywebapp",
    environment: options.environment,
    release: options.release,
    transaction: path ? `${context.method ?? "GET"} ${path}` : undefined,
    request: path ? { method: context.method, url: path } : undefined,
    tags,
    exception: {
      values: [
        {
          type: normalized.type,
          value: normalized.value,
          stacktrace: normalized.stack ? { frames: parseStackFrames(normalized.stack) } : undefined,
        },
      ],
    },
  }

  return [
    JSON.stringify({ event_id: eventId, sent_at: now.toISOString(), dsn: options.dsn }),
    JSON.stringify({ type: "event", content_type: "application/json" }),
    JSON.stringify(event),
  ].join("\n")
}

/** True when a DSN is configured (lets callers skip building context they would otherwise discard). */
export function isErrorReportingEnabled(): boolean {
  return parseSentryDsn(process.env.SENTRY_DSN) !== null
}

/**
 * Sends `error` to the configured collector. A no-op when SENTRY_DSN is unset or malformed. Never throws;
 * a collector that is down or slow only costs one aborted request after REPORT_TIMEOUT_MS.
 */
export async function reportServerError(
  error: unknown,
  context: ErrorContext = {},
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const dsn = process.env.SENTRY_DSN
  const parsed = parseSentryDsn(dsn)
  if (!parsed || !dsn) return

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REPORT_TIMEOUT_MS)
  try {
    const body = buildErrorEnvelope(error, context, {
      dsn: dsn.trim(),
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
      release: process.env.SENTRY_RELEASE || undefined,
    })
    await fetchImpl(parsed.envelopeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope" },
      body,
      signal: controller.signal,
    })
  } catch {
    // Reporting must never take the request down with it.
  } finally {
    clearTimeout(timer)
  }
}
