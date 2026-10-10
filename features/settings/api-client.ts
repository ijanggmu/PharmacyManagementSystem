import { settingCategoryOf, settingsDotnetApi, type TenantSettingRow } from "@/lib/api/reference-api"

export interface SystemSetting {
  id: string
  key: string
  value: string
  type: string
  category?: string | null
  tenant_id: string
  updated_at?: string
}

/** The .NET store has no row id or tenant column, so those are left empty; the category comes from the key prefix. */
export function toLegacySettingRow(row: TenantSettingRow): SystemSetting {
  return { id: "", key: row.key, value: row.value, type: row.type, category: settingCategoryOf(row.key), tenant_id: "" }
}

export const settingsApi = {
  async list(category?: string): Promise<{ data: SystemSetting[]; error: string | null }> {
    // Category = the key prefix before the first "." ("general" for undotted keys), filtered server-side.
    try {
      const rows = await settingsDotnetApi.listAll(category)
      return { data: rows.map(toLegacySettingRow), error: null }
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

  async upsert(key: string, value: string, _type = "string"): Promise<{ error: string | null }> {
    try {
      await settingsDotnetApi.upsert(key, value)
      return { error: null }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Failed to update setting",
      }
    }
  },
}
