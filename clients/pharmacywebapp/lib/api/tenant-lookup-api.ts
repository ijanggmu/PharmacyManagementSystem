/**
 * Public pharmacy lookup for the sign-in page. Anonymous on the .NET API (GET /tenants/by-code/{code}):
 * returns the tenant's display name for a pharmacy code, or 404 when no active tenant matches.
 */

import { DotnetApiError, dotnetClient } from "@/lib/api/dotnet-client"

/** TenantLookupDto from Modules.Multitenancy.Contracts. */
export interface DotnetTenantLookupDto {
  name: string | null
  code: string | null
}

/** Returns the pharmacy's display name for a code, or null when the code is blank or unknown. */
export async function getPharmacyNameByCode(code: string): Promise<string | null> {
  const normalized = code.trim().toLowerCase()
  if (!normalized) return null
  try {
    const dto = await dotnetClient.get<DotnetTenantLookupDto>(`/tenants/by-code/${encodeURIComponent(normalized)}`)
    return dto.name ?? null
  } catch (error) {
    // The API answers 404 for a code no active pharmacy uses.
    if (error instanceof DotnetApiError && error.normalized.status === 404) return null
    throw error
  }
}
