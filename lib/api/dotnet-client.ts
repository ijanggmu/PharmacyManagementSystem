/**
 * Thin fetch client for the .NET API. Used only by areas whose backend target is "dotnet"
 * (see backend-target.ts). Responses use the .NET envelope: success bodies are { data, meta },
 * error bodies are { error: { code, message, details } }.
 *
 * Auth: until the auth cutover (plan Phase 5) the .NET API has no session of its own, so callers
 * pass a bearer token via `getAccessToken`. Phase 0 passes none, so no area can reach .NET yet.
 */

import type { NormalizedApiError } from "@/lib/api/http-client"

const DEFAULT_TIMEOUT_MS = 15_000

export interface DotnetClientOptions {
  baseUrl?: string
  getAccessToken?: () => Promise<string | null> | string | null
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

export interface DotnetPage<T> {
  data: T[]
  meta: { page: number; limit: number; total: number; totalPages: number } | null
}

export class DotnetApiError extends Error {
  readonly normalized: NormalizedApiError
  constructor(normalized: NormalizedApiError) {
    super(normalized.message)
    this.name = "DotnetApiError"
    this.normalized = normalized
  }
}

/** Maps a .NET error envelope (or a network/timeout failure) into the shape the UI already handles. */
export function normalizeDotnetError(status: number, body: unknown): NormalizedApiError {
  const envelope = (body as { error?: { code?: unknown; message?: unknown; details?: unknown } } | null)?.error
  if (envelope && typeof envelope.code === "string" && typeof envelope.message === "string") {
    return { code: envelope.code, message: envelope.message, status, details: envelope.details }
  }
  return { code: "INTERNAL", message: `Request failed with status ${status}`, status }
}

export function createDotnetClient(options: DotnetClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? process.env.NEXT_PUBLIC_DOTNET_API_URL ?? "").replace(/\/+$/, "")
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const fetchImpl = options.fetchImpl ?? fetch

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!baseUrl) {
      throw new DotnetApiError({ code: "NOT_CONFIGURED", message: "NEXT_PUBLIC_DOTNET_API_URL is not set", status: 0 })
    }

    const headers: Record<string, string> = { Accept: "application/json" }
    if (body !== undefined) headers["Content-Type"] = "application/json"
    const token = options.getAccessToken ? await options.getAccessToken() : null
    if (token) headers.Authorization = `Bearer ${token}`

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let response: Response
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers,
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

    const parsed = response.status === 204 ? null : await response.json().catch(() => null)
    if (!response.ok) {
      throw new DotnetApiError(normalizeDotnetError(response.status, parsed))
    }
    return parsed as T
  }

  return {
    get: <T>(path: string) => request<T>("GET", path),
    post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
    put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
    delete: <T>(path: string) => request<T>("DELETE", path),
  }
}

export const dotnetClient = createDotnetClient()
