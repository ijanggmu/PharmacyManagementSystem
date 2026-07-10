import { apiGet, apiPut, getCSRFToken } from "@/lib/api/client-helpers"

export interface SystemSetting {
  id: string
  key: string
  value: string
  type: string
  category?: string | null
  tenant_id: string
  updated_at?: string
}

export const settingsApi = {
  async list(category?: string): Promise<{ data: SystemSetting[]; error: string | null }> {
    try {
      const query = category ? `?category=${encodeURIComponent(category)}` : ""
      const data = await apiGet<SystemSetting[]>(`/api/settings${query}`)
      return { data: data ?? [], error: null }
    } catch (error) {
      return {
        data: [],
        error: error instanceof Error ? error.message : "Failed to fetch settings",
      }
    }
  },

  async getByKey(key: string): Promise<{ value: string | null; error: string | null }> {
    const { data, error } = await this.list()
    if (error) return { value: null, error }
    const found = data.find((s) => s.key === key)
    return { value: found?.value ?? null, error: null }
  },

  async upsert(key: string, value: string, type = "string"): Promise<{ error: string | null }> {
    try {
      const token = await getCSRFToken()
      await apiPut("/api/settings", { key, value, type }, token)
      return { error: null }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Failed to update setting",
      }
    }
  },
}

