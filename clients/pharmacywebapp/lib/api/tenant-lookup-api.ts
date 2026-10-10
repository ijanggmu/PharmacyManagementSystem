/**
 * Public pharmacy lookup for the sign-in page. Anonymous on the .NET API (GET /tenants/by-code/{code}):
 * returns the tenant's display name for a pharmacy code, or nulls when no active tenant matches.
 */

import { dotnetClient } from "@/lib/api/dotnet-client"

/** TenantLookupDto from Modules.Multitenancy.Contracts. */
export interface DotnetTenantLookupDto {
  name: string | null
  code: string | null
}

/** Returns the pharmacy's display name for a code, or null when the code is blank or unknown. */
export async function getPharmacyNameByCode(code: string): Promise<string | null> {
  const normalized = code.trim().toLowerCase()
  if (!normalized) return null
  const dto = await dotnetClient.get<DotnetTenantLookupDto>(`/tenants/by-code/${encodeURIComponent(normalized)}`)
  return dto.name ?? null
}
