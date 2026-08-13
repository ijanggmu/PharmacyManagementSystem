import { apiGet } from "@/lib/api/client-helpers"

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

export const dashboardApi = {
  async getContext(): Promise<{ data: DashboardContextResponse | null; error: string | null }> {
    try {
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

