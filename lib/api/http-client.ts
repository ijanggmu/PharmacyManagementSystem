/**
 * Centralized axios instance for all browser -> /api/* calls.
 * Single place to configure base behavior, CSRF attachment, and error normalization
 * so lib/api/{domain}.ts modules and components never touch axios directly.
 */

import axios, { AxiosError, type AxiosInstance } from "axios"

const MUTATING_METHODS = new Set(["post", "put", "patch", "delete"])

export const httpClient: AxiosInstance = axios.create({
  baseURL: "",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
  // Resolve on every HTTP status so callers can inspect the { success, error } envelope
  // themselves instead of axios throwing on 4xx/5xx. Only network-level failures
  // (no response at all: offline, timeout, CORS, DNS) throw.
  validateStatus: () => true,
})

// Best-effort CSRF fallback: if a mutating request is sent without an explicit
// X-CSRF-Token header, fetch one before the request goes out. Callers that already
// pass a token (the common path via apiPost/apiPut/apiPatch/apiDelete) skip this.
httpClient.interceptors.request.use(async (config) => {
  const method = (config.method || "get").toLowerCase()
  const hasToken =
    !!config.headers?.["X-CSRF-Token"] || !!config.headers?.["x-csrf-token"]

  if (MUTATING_METHODS.has(method) && !hasToken) {
    try {
      const tokenResponse = await axios.get<{ token: string }>("/api/csrf/token", {
        withCredentials: true,
      })
      config.headers = config.headers ?? {}
      config.headers["X-CSRF-Token"] = tokenResponse.data.token
    } catch {
      // Let the request proceed; the server will reject it with a normal CSRF error
      // that flows through the same error-normalization path as any other failure.
    }
  }

  return config
})

export interface NormalizedApiError {
  code: string
  message: string
  status: number
  details?: unknown
}

/** Turns a network-level axios failure (no HTTP response reached) into the same shape as a server error. */
export function normalizeNetworkError(error: unknown): NormalizedApiError {
  const axiosError = error as AxiosError
  if (axiosError?.code === "ECONNABORTED") {
    return { code: "TIMEOUT", message: "Request timed out. Please try again.", status: 0 }
  }
  return {
    code: "NETWORK_ERROR",
    message: axiosError?.message || "Network error - please check your connection",
    status: 0,
  }
}
