/**
 * Reference data calls, switchable per backend target (REFERENCE).
 * Medicine categories: the legacy path keeps the existing /api/categories routes. The dotnet path pages
 * through the Reference module's /api/v1/reference/categories and maps each row to the { id, name } shape
 * the UI uses. The UI only lists and creates categories, so only those two operations have a dotnet branch.
 * Tenant settings: the dotnet path reads /api/v1/reference/settings/all (a key/value dictionary) and
 * writes /api/v1/reference/settings/{key}. The store has no type or category, so see toSettingRows.
 */

import { dotnetClient } from "@/lib/api/dotnet-client"

export interface MedicineCategory {
  id: string
  name: string
}

/** One row of the Reference module's MedicineCategoryDto (camelCase JSON). */
export interface DotnetMedicineCategoryDto {
  id: string
  name: string
  slug: string
  description: string | null
  parentCategoryId: string | null
  createdAtUtc: string
  updatedAtUtc: string | null
}

/** PagedResponse<T> as serialised by BuildingBlocks (camelCase). */
export interface DotnetPagedResponse<T> {
  items: T[]
  pageNumber: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export const CATEGORY_PAGE_SIZE = 100

export function toMedicineCategory(dto: Pick<DotnetMedicineCategoryDto, "id" | "name">): MedicineCategory {
  return { id: dto.id, name: dto.name }
}

export function categoriesPagePath(pageNumber: number, pageSize: number = CATEGORY_PAGE_SIZE): string {
  return `/api/v1/reference/categories?pageNumber=${pageNumber}&pageSize=${pageSize}&sortBy=name&sortDir=asc`
}

/** Next page to request, or null when the last page has been read. */
export function nextCategoryPage(page: Pick<DotnetPagedResponse<unknown>, "pageNumber" | "totalPages">): number | null {
  return page.pageNumber < page.totalPages ? page.pageNumber + 1 : null
}

export function createCategoryBody(name: string): { name: string } {
  return { name: name.trim() }
}

export const categoriesDotnetApi = {
  list: async (): Promise<MedicineCategory[]> => {
    const all: MedicineCategory[] = []
    let page = 1
    for (;;) {
      const res = await dotnetClient.get<DotnetPagedResponse<DotnetMedicineCategoryDto>>(categoriesPagePath(page))
      all.push(...res.items.map(toMedicineCategory))
      const next = nextCategoryPage(res)
      if (next === null) break
      page = next
    }
    return all
  },
  /** The .NET create endpoint returns only the new id (a bare Guid), so the name is echoed from the request. */
  create: async (name: string): Promise<MedicineCategory> => {
    const id = await dotnetClient.post<string>("/api/v1/reference/categories", createCategoryBody(name))
    return { id, name: name.trim() }
  },
}

export type TenantSettingType = "string" | "number" | "boolean" | "json"

export interface TenantSettingRow {
  key: string
  value: string
  type: TenantSettingType
}

/** Types the settings UI reads as numbers or booleans. The .NET store keeps no type, so these are known up front. */
const KNOWN_SETTING_TYPES: Record<string, TenantSettingType> = {
  tax_rate: "number",
  low_stock_threshold: "number",
  expiry_warning_days: "number",
  auto_reorder_enabled: "boolean",
  enable_barcode: "boolean",
  enable_notifications: "boolean",
}

/** Known key type first, then "true"/"false" as boolean, otherwise string. */
export function inferSettingType(key: string, value: string): TenantSettingType {
  const known = KNOWN_SETTING_TYPES[key]
  if (known) return known
  if (value === "true" || value === "false") return "boolean"
  return "string"
}

/** Turns the .NET key/value dictionary into rows. Keys absent from the dictionary are simply not returned. */
export function toSettingRows(dictionary: Record<string, string>): TenantSettingRow[] {
  return Object.entries(dictionary).map(([key, value]) => ({ key, value, type: inferSettingType(key, value) }))
}

export function settingPath(key: string): string {
  return `/api/v1/reference/settings/${encodeURIComponent(key)}`
}

export function settingBody(value: string): { value: string } {
  return { value }
}

export const settingsDotnetApi = {
  listAll: async (): Promise<TenantSettingRow[]> => {
    const dictionary = await dotnetClient.get<Record<string, string>>("/api/v1/reference/settings/all")
    return toSettingRows(dictionary ?? {})
  },
  /** Upsert by key. The .NET body has no type field, so the legacy type argument is not sent. */
  upsert: async (key: string, value: string): Promise<void> => {
    await dotnetClient.put(settingPath(key), settingBody(value))
  },
}
