/**
 * Shared helpers for the Inventory and Purchasing .NET branches.
 *
 * dotnetClient (dotnet-client.ts) sends no X-CSRF-Token, but the same-origin BFF proxy
 * (app/api/dotnet/[...path]) requires one on every POST/PUT/DELETE. Mutations therefore go through
 * dotnetMutate here, which attaches the same token the legacy apiPost calls use.
 */

import { apiRequestErrorMessage, getCSRFToken } from "@/lib/api/client-helpers"
import { DOTNET_PROXY_BASE, DotnetApiError, dotnetClient } from "@/lib/api/dotnet-client"
import { problemToNormalizedError } from "@/lib/api/dotnet-problem"

/** Shape of the .NET PagedResponse<T> (camelCase JSON). */
export interface DotnetPagedResponse<T> {
  items: T[]
  pageNumber: number
  pageSize: number
  totalCount: number
  totalPages: number
}

/**
 * POST with the CSRF header the BFF requires. Throws DotnetApiError on failure. Pass an `idempotencyKey`
 * (one per user action, reused when that action is retried — see lib/api/idempotency.ts) for stock and money
 * writes, so the server applies a retried submit only once.
 */
export async function dotnetMutate<T>(path: string, body: unknown = {}, idempotencyKey?: string): Promise<T> {
  const csrf = await getCSRFToken()
  const headers: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json", "X-CSRF-Token": csrf }
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey
  let response: Response
  try {
    response = await fetch(`${DOTNET_PROXY_BASE}${path}`, {
      method: "POST",
      headers,
      credentials: "same-origin",
      body: JSON.stringify(body),
    })
  } catch {
    throw new DotnetApiError({ code: "NETWORK_ERROR", message: "Network error - please check your connection", status: 0 })
  }
  const parsed = await response.json().catch(() => null)
  if (!response.ok) throw new DotnetApiError(problemToNormalizedError(response.status, parsed))
  return parsed as T
}

/** Reads every page of a .NET paged list and returns the items in one array. */
export async function dotnetGetAllPages<T>(path: string, query: Record<string, string | undefined> = {}, pageSize = 100): Promise<T[]> {
  const items: T[] = []
  for (let pageNumber = 1; ; pageNumber++) {
    const sp = new URLSearchParams({ pageNumber: String(pageNumber), pageSize: String(pageSize) })
    for (const [k, v] of Object.entries(query)) if (v !== undefined) sp.set(k, v)
    const page = await dotnetClient.get<DotnetPagedResponse<T>>(`${path}?${sp.toString()}`)
    items.push(...page.items)
    if (pageNumber >= page.totalPages || page.items.length === 0) break
  }
  return items
}

/** Error text for either branch, falling back to the caller's default message. */
export function stockErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof DotnetApiError) return error.normalized.message || fallback
  return apiRequestErrorMessage(error) || fallback
}

/** Money as the legacy Postgres numeric strings ("123.00"). */
export function money2(value: number): string {
  return value.toFixed(2)
}
