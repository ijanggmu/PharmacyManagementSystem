/**
 * IRD calls, switchable per backend target (SALES): sending a completed sale's invoice to the IRD queue,
 * and the queue health panel. The legacy path keeps /api/ird and /api/system-health; the dotnet path uses
 * the Sales module's /api/v1/sales/{id}/ird/send and /api/v1/sales/reports/ird-health.
 *
 * No real CBMS credentials are involved here. Dispatch happens in the backend worker via tenant config.
 */

import { getCSRFToken } from "@/lib/api/client-helpers"
import { backendTarget } from "@/lib/api/backend-target"
import { dotnetClient } from "@/lib/api/dotnet-client"

/** The legacy queue-health shape (SystemHealth.ird in system-diagnostics-service). */
export interface IrdFailedItem {
  id: string
  last_error: string | null
  created_at: string
}

export interface IrdQueueHealth {
  pendingCount: number
  failedCount: number
  salesFailedCount: number
  recentFailed: IrdFailedItem[]
}

export interface IrdSendResult {
  saleId: string
  invoiceNumber: string
}

/** IrdQueueHealthDto (Sales module, camelCase JSON). */
export interface DotnetIrdFailedItemDto {
  id: string
  lastError: string | null
  createdAtUtc: string
}

export interface DotnetIrdQueueHealthDto {
  pendingCount: number
  failedCount: number
  salesFailedCount: number
  recentFailed: DotnetIrdFailedItemDto[]
}

/** SendIrdInvoiceResponseDto. */
export interface DotnetSendIrdResponseDto {
  saleId: string
  queueItemId: string
  invoiceNumber: string
}

export function toIrdQueueHealth(dto: DotnetIrdQueueHealthDto): IrdQueueHealth {
  return {
    pendingCount: dto.pendingCount,
    failedCount: dto.failedCount,
    salesFailedCount: dto.salesFailedCount,
    recentFailed: dto.recentFailed.map((item) => ({
      id: item.id,
      last_error: item.lastError,
      created_at: item.createdAtUtc,
    })),
  }
}

export function toIrdSendResult(dto: DotnetSendIrdResponseDto): IrdSendResult {
  return { saleId: dto.saleId, invoiceNumber: dto.invoiceNumber }
}

/** Body for POST /api/v1/sales/{id}/ird/send. The endpoint takes the sale id from the route only. */
export function buildSendIrdBody(): Record<string, never> {
  return {}
}

export async function getIrdQueueHealth(): Promise<IrdQueueHealth> {
  if (backendTarget("SALES") === "dotnet") {
    return toIrdQueueHealth(await dotnetClient.get<DotnetIrdQueueHealthDto>("/api/v1/sales/reports/ird-health"))
  }
  const res = await fetch("/api/system-health")
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.message || "Failed to load system health")
  }
  const body = (await res.json()) as { data: { ird: IrdQueueHealth } }
  return body.data.ird
}

export async function sendIrdInvoice(saleId: string): Promise<IrdSendResult> {
  if (backendTarget("SALES") === "dotnet") {
    const dto = await dotnetClient.post<DotnetSendIrdResponseDto>(
      `/api/v1/sales/${saleId}/ird/send`,
      buildSendIrdBody(),
      crypto.randomUUID(),
    )
    return toIrdSendResult(dto)
  }
  const csrf = await getCSRFToken()
  const res = await fetch("/api/ird", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    body: JSON.stringify({ saleId }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body?.error?.message || "Failed to send invoice to IRD")
  }
  return body.data as IrdSendResult
}
