import type { NextRequest } from "next/server"
import { tenantForAnonymousRequest } from "@/lib/api/dotnet-bff"
import { ROOT_TENANT } from "@/lib/api/dotnet-session"

/**
 * The pharmacy a public booking call is for: the pharmacy code in the link (/book?code=…), else the pharmacy of the
 * request host. The booking endpoints are public by design, so naming any pharmacy is fine; the operator (root)
 * tenant has no doctors and is never a booking pharmacy. Null when no pharmacy can be told.
 */
export function bookingTenant(request: NextRequest, code: string | null | undefined): string | null {
  const fromLink = code?.trim().toLowerCase()
  const tenant = fromLink && /^[a-z0-9-]{1,64}$/.test(fromLink) ? fromLink : tenantForAnonymousRequest(request)
  return tenant && tenant !== ROOT_TENANT ? tenant : null
}
