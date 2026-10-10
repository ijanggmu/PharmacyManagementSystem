/**
 * Browser client for the .NET API. Calls go to the same-origin BFF proxy at /api/dotnet, which attaches
 * the httpOnly session token server-side, so this client never handles a bearer token.
 */

import type { NormalizedApiError } from "@/lib/api/http-client"
import { problemToNormalizedError } from "@/lib/api/dotnet-problem"

export const DOTNET_PROXY_BASE = "/api/dotnet"
const DEFAULT_TIMEOUT_MS = 15_000
const CSRF_TOKEN_PATH = "/api/csrf/token"
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"])

/** The proxy already prefixes /api/v1, so accept paths written either way without doubling it. */
export function normalizeDotnetPath(path: string): string {
  const withSlash = path.startsWith("/") ? path : `/${path}`
  return withSlash.replace(/^\/api\/v1(?=\/|\?|$)/, "")
}

async function fetchCsrfToken(fetchImpl: typeof fetch): Promise<string> {
  const res = await fetchImpl(CSRF_TOKEN_PATH, { credentials: "same-origin" })
  if (!res.ok) {
    throw new DotnetApiError({ code: "CSRF_UNAVAILABLE", message: "Could not start a secure request. Please retry.", status: res.status })
  }
  const body = (await res.json()) as { token: string }
  return body.token
}

export interface DotnetClientOptions {
  baseUrl?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

export class DotnetApiError extends Error {
  readonly normalized: NormalizedApiError
  constructor(normalized: NormalizedApiError) {
    super(normalized.message)
    this.name = "DotnetApiError"
    this.normalized = normalized
  }
}

export function createDotnetClient(options: DotnetClientOptions = {}) {
  const baseUrl = options.baseUrl ?? DOTNET_PROXY_BASE
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const fetchImpl = options.fetchImpl ?? fetch

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    idempotencyKey?: string,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json", ...extraHeaders }
    if (body !== undefined) headers["Content-Type"] = "application/json"
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey
    if (MUTATING.has(method)) headers["X-CSRF-Token"] = await fetchCsrfToken(fetchImpl)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let response: Response
    try {
      response = await fetchImpl(`${baseUrl}${normalizeDotnetPath(path)}`, {
        method,
        headers,
        credentials: "same-origin",
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (error) {
      const aborted = (error as { name?: string })?.name === "AbortError"
      throw new DotnetApiError(
        aborted
          ? { code: "TIMEOUT", message: "Request timed out. Please try again.", status: 0 }
          : { code: "NETWORK_ERROR", message: "Network error - please check your connection", status: 0 },
      )
    } finally {
      clearTimeout(timer)
    }

    if (response.status === 204) return undefined as T
    const parsed = await response.json().catch(() => null)
    if (!response.ok) throw new DotnetApiError(problemToNormalizedError(response.status, parsed))
    return parsed as T
  }

  return {
    get: <T>(path: string, headers?: Record<string, string>) => request<T>("GET", path, undefined, undefined, headers),
    post: <T>(path: string, body?: unknown, idempotencyKey?: string, headers?: Record<string, string>) =>
      request<T>("POST", path, body ?? {}, idempotencyKey, headers),
    put: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>("PUT", path, body ?? {}, undefined, headers),
    patch: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>("PATCH", path, body ?? {}, undefined, headers),
    delete: <T>(path: string, headers?: Record<string, string>) => request<T>("DELETE", path, undefined, undefined, headers),
  }
}

export const dotnetClient = createDotnetClient()
