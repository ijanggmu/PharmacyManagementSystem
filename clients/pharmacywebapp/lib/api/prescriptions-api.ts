/**
 * Prescriptions on the .NET path (PRESCRIPTIONS area): raw DTOs and HTTP calls. The mapping to the legacy
 * UI shape lives in features/prescriptions/api-client.ts.
 *
 * Not yet on the .NET API: prescription number and customer / medicine names (the .NET PrescriptionDto
 * carries ids only). Refills due is also still not migrated. Notes and dosage instructions round-trip.
 */

import { dotnetClient } from "@/lib/api/dotnet-client"

/** PrescriptionStatsDto from Modules.Prescriptions.Contracts. */
export interface DotnetPrescriptionStatsDto {
  total: number
  pending: number
  partiallyFilled: number
  filled: number
  cancelled: number
}

/** Legacy stats row, as the /api/prescriptions/stats route returns it. */
export interface PrescriptionStatsRow {
  total: number
  pending: number
  filled: number
  partially_filled: number
  cancelled: number
}

export function toPrescriptionStats(dto: DotnetPrescriptionStatsDto): PrescriptionStatsRow {
  return {
    total: dto.total,
    pending: dto.pending,
    filled: dto.filled,
    partially_filled: dto.partiallyFilled,
    cancelled: dto.cancelled,
  }
}

/** Legacy callers receive an array of rows; the .NET endpoint returns a single object. */
export async function getPrescriptionStatsOnDotnet(): Promise<PrescriptionStatsRow[]> {
  const dto = await dotnetClient.get<DotnetPrescriptionStatsDto>("/prescriptions/reports/stats")
  return [toPrescriptionStats(dto)]
}

/** PrescriptionItemDto from Modules.Prescriptions.Contracts. */
export interface DotnetPrescriptionItemDto {
  id: string
  medicineId: string
  medicineName: string | null
  prescribedQuantity: number
  dispensedQuantity: number
  refillsAllowed: number
  refillsUsed: number
  dosageInstructions: string | null
}

/** PrescriptionDto from Modules.Prescriptions.Contracts. Status is "Active" or "Cancelled". */
export interface DotnetPrescriptionDto {
  id: string
  customerId: string
  customerName: string | null
  doctorName: string
  prescriptionDate: string
  expiryDate: string
  status: string
  createdAtUtc: string
  cancelledAtUtc: string | null
  cancelReason: string | null
  items: DotnetPrescriptionItemDto[]
  createdByUserId: string | null
  notes: string | null
  prescriptionNumber: string | null
}

export interface DotnetPagedPrescriptions {
  items: DotnetPrescriptionDto[]
  pageNumber: number
  pageSize: number
  totalCount: number
  totalPages: number
}

/** Server cap on GET /prescriptions pageSize (SearchPrescriptionsQueryValidator). Larger requests are rejected with 400. */
export const PRESCRIPTIONS_MAX_PAGE_SIZE = 200

/**
 * Filters accepted by GET /prescriptions. `statuses` takes stored names (Active, Cancelled) or fill states
 * (pending, partially_filled, filled). `search` matches the prescription number, the prescriber or the patient.
 */
export interface DotnetPrescriptionListFilters {
  page?: number
  limit?: number
  customerId?: string
  statuses?: string[]
  search?: string
  dateFrom?: string
  dateTo?: string
}

export function prescriptionsListQuery(filters: DotnetPrescriptionListFilters = {}): string {
  const p = new URLSearchParams()
  if (filters.page != null) p.set("pageNumber", String(filters.page))
  if (filters.limit != null) p.set("pageSize", String(Math.min(Math.max(Math.trunc(filters.limit), 1), PRESCRIPTIONS_MAX_PAGE_SIZE)))
  if (filters.customerId) p.set("customerId", filters.customerId)
  for (const status of filters.statuses ?? []) p.append("status", status)
  if (filters.search?.trim()) p.set("search", filters.search.trim())
  if (filters.dateFrom) p.set("dateFrom", filters.dateFrom)
  if (filters.dateTo) p.set("dateTo", filters.dateTo)
  const q = p.toString()
  return `/prescriptions${q ? `?${q}` : ""}`
}

/** PrescriptionRefillDto from Modules.Prescriptions.Contracts. */
export interface DotnetPrescriptionRefillDto {
  id: string
  prescriptionId: string
  prescriptionNumber: string | null
  customerId: string
  customerName: string | null
  prescriptionItemId: string
  medicineId: string
  medicineName: string | null
  quantityDispensed: number
  refilledAtUtc: string
  dispensedByUserId: string | null
  notes: string | null
}

export interface DotnetPagedPrescriptionRefills {
  items: DotnetPrescriptionRefillDto[]
  pageNumber: number
  pageSize: number
  totalCount: number
  totalPages: number
}

/** Filters accepted by GET /prescriptions/refills. */
export interface DotnetPrescriptionRefillListFilters {
  page?: number
  limit?: number
  prescriptionId?: string
  customerId?: string
  medicineId?: string
  dateFrom?: string
  dateTo?: string
}

export function prescriptionRefillsListQuery(filters: DotnetPrescriptionRefillListFilters = {}): string {
  const p = new URLSearchParams()
  if (filters.page != null) p.set("pageNumber", String(filters.page))
  if (filters.limit != null) p.set("pageSize", String(filters.limit))
  if (filters.prescriptionId) p.set("prescriptionId", filters.prescriptionId)
  if (filters.customerId) p.set("customerId", filters.customerId)
  if (filters.medicineId) p.set("medicineId", filters.medicineId)
  if (filters.dateFrom) p.set("dateFrom", filters.dateFrom)
  if (filters.dateTo) p.set("dateTo", filters.dateTo)
  const q = p.toString()
  return `/prescriptions/refills${q ? `?${q}` : ""}`
}

/** Body of CreatePrescriptionRefillCommand (prescriptionId comes from the URL). */
export interface DotnetCreatePrescriptionRefillBody {
  medicineId: string
  quantityDispensed: number
  notes?: string | null
}

/** Body of CreatePrescriptionCommand. Dates are yyyy-mm-dd. */
export interface DotnetCreatePrescriptionBody {
  customerId: string
  doctorName: string
  prescriptionDate: string
  expiryDate: string
  notes?: string | null
  items: { medicineId: string; prescribedQuantity: number; refillsAllowed: number; dosageInstructions?: string | null }[]
}

/** Body of UpdatePrescriptionCommand. Omitted fields keep the stored value; clearNotes removes notes. */
export interface DotnetUpdatePrescriptionBody {
  doctorName?: string
  expiryDate?: string
  notes?: string
  clearNotes?: boolean
  /** Dosage directions per existing item. A null value clears the directions. */
  items?: { itemId: string; dosageInstructions: string | null }[]
}

export const prescriptionsDotnet = {
  /** One page. A limit above the server cap is served by paging through 200-row pages and trimming to the limit. */
  list: async (filters: DotnetPrescriptionListFilters): Promise<DotnetPagedPrescriptions> => {
    if (filters.limit == null || filters.limit <= PRESCRIPTIONS_MAX_PAGE_SIZE) {
      return dotnetClient.get<DotnetPagedPrescriptions>(prescriptionsListQuery(filters))
    }
    const max = filters.limit
    const items: DotnetPrescriptionDto[] = []
    let totalCount = 0
    for (let pageNumber = 1; ; pageNumber++) {
      const page = await dotnetClient.get<DotnetPagedPrescriptions>(
        prescriptionsListQuery({ ...filters, page: pageNumber, limit: PRESCRIPTIONS_MAX_PAGE_SIZE }),
      )
      items.push(...page.items)
      totalCount = page.totalCount
      if (pageNumber >= page.totalPages || page.items.length === 0 || items.length >= max) break
    }
    const trimmed = items.slice(0, max)
    return { items: trimmed, pageNumber: 1, pageSize: max, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / max)) }
  },

  get: (id: string) => dotnetClient.get<DotnetPrescriptionDto>(`/prescriptions/${encodeURIComponent(id)}`),

  /** Returns the new prescription id. */
  create: (body: DotnetCreatePrescriptionBody) => dotnetClient.post<string>("/prescriptions", body),

  /** Header edits (doctor, expiry, notes). Returns the prescription id. */
  update: (id: string, body: DotnetUpdatePrescriptionBody) =>
    dotnetClient.put<string>(`/prescriptions/${encodeURIComponent(id)}`, body),

  /** Cancels the prescription. Returns the prescription id. */
  cancel: (id: string, reason: string) =>
    dotnetClient.post<string>(`/prescriptions/${encodeURIComponent(id)}/cancel`, { reason }),

  /** Hard-deletes a prescription with no dispensed items (the .NET side returns 409 otherwise). */
  delete: (id: string) => dotnetClient.delete<string>(`/prescriptions/${encodeURIComponent(id)}`),
}

export const prescriptionRefillsDotnet = {
  list: (filters: DotnetPrescriptionRefillListFilters) =>
    dotnetClient.get<DotnetPagedPrescriptionRefills>(prescriptionRefillsListQuery(filters)),

  get: (id: string) => dotnetClient.get<DotnetPrescriptionRefillDto>(`/prescriptions/refills/${encodeURIComponent(id)}`),

  /** Records a refill against one item of the prescription; runs through the same dispensing safety
   * checks as a sale (valid/non-expired prescription, refills remaining, quantity remaining). */
  create: (prescriptionId: string, body: DotnetCreatePrescriptionRefillBody) =>
    dotnetClient.post<DotnetPrescriptionRefillDto>(`/prescriptions/${encodeURIComponent(prescriptionId)}/refills`, body),
}
