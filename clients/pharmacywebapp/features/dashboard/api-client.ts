import { DOTNET_PROXY_BASE, dotnetClient } from "@/lib/api/dotnet-client"
import { dashboardContextFromDotnet, type DotnetDashboardContext } from "@/lib/api/dashboard-dotnet"

export interface DashboardContextResponse {
  user: {
    id: string
    name: string
    role: string
    rawRole: string
    initials: string
    /** .NET permission claims (same array requirePermission/dotnetPermissionAllowed enforce server-side). */
    permissions: string[]
  }
  tenant: {
    name: string
    country?: string
    planCode?: string
  } | null
  notifications: {
    lowStock: number
    expiring: number
    pending: number
    pendingReturns: number
    pendingRefunds: number
  }
  branchCount: number
}

/** The .NET context DTO has no role/permissions, so both come from the BFF session route (same source as loadDotnetCurrentUser). */
async function dotnetSessionRoleAndPermissions(): Promise<{ role: string | null; permissions: string[] }> {
  const res = await fetch(`${DOTNET_PROXY_BASE}/auth/session`, { credentials: "same-origin" })
  if (!res.ok) return { role: null, permissions: [] }
  const body = (await res.json()) as { user?: { role?: string | null; permissions?: string[] } }
  return { role: body.user?.role ?? null, permissions: body.user?.permissions ?? [] }
}

export const dashboardApi = {
  async getContext(): Promise<{ data: DashboardContextResponse | null; error: string | null }> {
    try {
      const [context, { role, permissions }] = await Promise.all([
        dotnetClient.get<DotnetDashboardContext>("/reference/dashboard-context"),
        dotnetSessionRoleAndPermissions(),
      ])
      return { data: dashboardContextFromDotnet(context, role, permissions), error: null }
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "Failed to load dashboard context",
      }
    }
  },
}
