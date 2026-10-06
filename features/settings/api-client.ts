import { apiGet, apiPut, getCSRFToken } from "@/lib/api/client-helpers"
import { backendTarget } from "@/lib/api/backend-target"
import { settingsDotnetApi, type TenantSettingRow } from "@/lib/api/reference-api"

export interface SystemSetting {
  id: string
  key: string
  value: string
  type: string
  category?: string | null
  tenant_id: string
  updated_at?: string
}

/** The .NET store has no row id, category or tenant column, so those are left empty. */
export function toLegacySettingRow(row: TenantSettingRow): SystemSetting {
  return { id: "", key: row.key, value: row.value, type: row.type, category: null, tenant_id: "" }
}

export const settingsApi = {
  async list(category?: string): Promise<{ data: SystemSetting[]; error: string | null }> {
    try {
      // The .NET settings dictionary has no category, so a category filter stays on the legacy path.
      if (!category && backendTarget("REFERENCE") === "dotnet") {
        const rows = await settingsDotnetApi.listAll()
        return { data: rows.map(toLegacySettingRow), error: null }
      }
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
      if (backendTarget("REFERENCE") === "dotnet") {
        await settingsDotnetApi.upsert(key, value)
        return { error: null }
      }
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

