/**
 * Prescription stats on the .NET path (PRESCRIPTIONS area). Not migrated: list (the .NET PrescriptionDto
 * has no prescription number, dosage or per-item instructions) and refills due (the .NET RefillDueDto has
 * no refill date, refill number or status).
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
