import { apiGet } from "@/lib/api/client-helpers"
import { backendTarget } from "@/lib/api/backend-target"
import { DOTNET_PROXY_BASE, dotnetClient } from "@/lib/api/dotnet-client"
import { dashboardContextFromDotnet, type DotnetDashboardContext } from "@/lib/api/dashboard-dotnet"

export interface DashboardContextResponse {
  user: {
    id: string
    name: string
    role: string
    rawRole: string
    initials: string
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

/** The .NET context DTO has no role, so the role comes from the BFF session route (same source as loadDotnetCurrentUser). */
async function dotnetSessionRole(): Promise<string | null> {
  const res = await fetch(`${DOTNET_PROXY_BASE}/auth/session`, { credentials: "same-origin" })
  if (!res.ok) return null
  const body = (await res.json()) as { user?: { role?: string | null } }
  return body.user?.role ?? null
}

export const dashboardApi = {
  async getContext(): Promise<{ data: DashboardContextResponse | null; error: string | null }> {
    try {
      if (backendTarget("DASHBOARD") === "dotnet") {
        const [context, role] = await Promise.all([
          dotnetClient.get<DotnetDashboardContext>("/reference/dashboard-context"),
          dotnetSessionRole(),
        ])
        return { data: dashboardContextFromDotnet(context, role), error: null }
      }
      const data = await apiGet<DashboardContextResponse>("/api/dashboard/context")
      return { data, error: null }
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "Failed to load dashboard context",
      }
    }
  },
}
