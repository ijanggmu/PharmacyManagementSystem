/**
 * POS extras on the .NET Sales module: held (parked) bills and price levels. HTTP only (via the BFF proxy).
 */

import { dotnetClient } from "@/lib/api/dotnet-client"
import type { ParkSaleBody, ParkedBill, ParkedBillSummary, ParkedLine } from "@/features/sales/lib/parked-bills"
import type { PriceLevel, PriceQuote } from "@/features/sales/lib/price-levels"

const SALES = "/api/v1/sales"

/** ParkedSaleSummaryDto. */
interface DotnetParkedSummaryDto {
  id: string
  label: string
  customerId: string | null
  customerName: string | null
  lineCount: number
  totalAmount: number
  parkedByUserId: string | null
  parkedByName: string | null
  parkedAtUtc: string
  expiresAtUtc: string
}

/** ParkedSaleDto. */
interface DotnetParkedSaleDto extends DotnetParkedSummaryDto {
  branchId: string
  prescriptionId: string | null
  priceLevelId: string | null
  buyerName: string | null
  buyerPan: string | null
  billDiscountAmount: number
  notes: string | null
  lines: (Omit<ParkedLine, "saleUnit"> & { saleUnit: string | null })[]
}

function toSummary(dto: DotnetParkedSummaryDto): ParkedBillSummary {
  return {
    id: dto.id,
    label: dto.label,
    customerId: dto.customerId,
    customerName: dto.customerName,
    lineCount: dto.lineCount,
    totalAmount: dto.totalAmount,
    parkedByName: dto.parkedByName,
    parkedAtUtc: dto.parkedAtUtc,
    expiresAtUtc: dto.expiresAtUtc,
    source: "server",
  }
}

export function toParkedBill(dto: DotnetParkedSaleDto): ParkedBill {
  return {
    ...toSummary(dto),
    prescriptionId: dto.prescriptionId,
    priceLevelId: dto.priceLevelId,
    buyerName: dto.buyerName,
    buyerPan: dto.buyerPan,
    billDiscountAmount: dto.billDiscountAmount,
    notes: dto.notes,
    lines: dto.lines.map((l) => ({ ...l, saleUnit: l.saleUnit?.toLowerCase() === "pack" ? "pack" : null })),
  }
}

export const parkedSalesApi = {
  async list(): Promise<ParkedBillSummary[]> {
    return (await dotnetClient.get<DotnetParkedSummaryDto[]>(`${SALES}/parked`)).map(toSummary)
  },
  async park(body: ParkSaleBody): Promise<ParkedBillSummary> {
    return toSummary(await dotnetClient.post<DotnetParkedSummaryDto>(`${SALES}/parked`, body))
  },
  /** Takes the bill off hold; a 404 means another till recalled (or discarded) it first. */
  async recall(id: string): Promise<ParkedBill> {
    return toParkedBill(await dotnetClient.post<DotnetParkedSaleDto>(`${SALES}/parked/${id}/recall`))
  },
  async discard(id: string): Promise<void> {
    await dotnetClient.delete<void>(`${SALES}/parked/${id}`)
  },
}

export const priceLevelsApi = {
  async list(includeInactive = false): Promise<PriceLevel[]> {
    return dotnetClient.get<PriceLevel[]>(`${SALES}/price-levels${includeInactive ? "?includeInactive=true" : ""}`)
  },
  async get(id: string): Promise<PriceLevel & { items: { medicineId: string; unitPrice: number }[] }> {
    return dotnetClient.get(`${SALES}/price-levels/${id}`)
  },
  async create(body: { name: string; discountPercent: number; description?: string | null }): Promise<string> {
    return dotnetClient.post<string>(`${SALES}/price-levels`, body)
  },
  async update(id: string, body: { name: string; discountPercent: number; description?: string | null; isActive: boolean }): Promise<void> {
    await dotnetClient.put<void>(`${SALES}/price-levels/${id}`, body)
  },
  /** A null price removes the medicine's explicit price on the level. */
  async setItemPrice(levelId: string, medicineId: string, unitPrice: number | null): Promise<void> {
    await dotnetClient.put<void>(`${SALES}/price-levels/${levelId}/items/${medicineId}`, { unitPrice })
  },
  /** A null level puts the customer back on retail. */
  async assignCustomer(customerId: string, priceLevelId: string | null): Promise<void> {
    await dotnetClient.put<void>(`${SALES}/price-levels/customers/${customerId}`, { priceLevelId })
  },
  async quote(customerId: string | null, medicineIds: string[], priceLevelId?: string): Promise<PriceQuote> {
    return dotnetClient.post<PriceQuote>(`${SALES}/price-levels/quote`, {
      customerId: customerId || null,
      medicineIds,
      ...(priceLevelId ? { priceLevelId } : {}),
    })
  },
}
