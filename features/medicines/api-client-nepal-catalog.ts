import { apiGet } from "@/lib/api/client-helpers"
import { backendTarget } from "@/lib/api/backend-target"
import { catalogDotnetApi } from "@/lib/api/catalog-api"

export interface NepalMedicineCatalogItem {
  id: string
  brand_name: string
  generic_name: string
  form: string | null
  strength: string | null
  manufacturer: string | null
  category_name: string | null
  dosage: string | null
  unit_price: number | null
  cost_price: number | null
  description: string | null
  side_effects: string | null
  storage_instructions: string | null
  prescription_required: boolean
}

export const nepalMedicineCatalogApi = {
  async search(query: string, limit = 10): Promise<NepalMedicineCatalogItem[]> {
    if (backendTarget("CATALOG") === "dotnet") return catalogDotnetApi.searchNepal(query, limit)
    const params = new URLSearchParams()
    if (query.trim()) params.set("q", query.trim())
    params.set("limit", String(limit))
    const q = params.toString()
    return apiGet<NepalMedicineCatalogItem[]>(`/api/medicine-catalog/nepal${q ? `?${q}` : ""}`)
  },
}
