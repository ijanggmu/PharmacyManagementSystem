import { apiGet, apiPost, getCSRFToken } from "@/lib/api/client-helpers"
import { backendTarget } from "@/lib/api/backend-target"
import { categoriesDotnetApi } from "@/lib/api/reference-api"

export interface Category {
  id: string
  name: string
}

export const categoriesApi = {
  async getCategories(): Promise<{ data: Category[]; error: string | null }> {
    try {
      if (backendTarget("REFERENCE") === "dotnet") return { data: await categoriesDotnetApi.list(), error: null }
      const data = await apiGet<Category[]>("/api/categories")
      return { data: data ?? [], error: null }
    } catch (error) {
      return {
        data: [],
        error: error instanceof Error ? error.message : "Failed to fetch categories",
      }
    }
  },

  async createCategory(name: string): Promise<{ data: Category | null; error: string | null }> {
    try {
      if (backendTarget("REFERENCE") === "dotnet") return { data: await categoriesDotnetApi.create(name), error: null }
      const token = await getCSRFToken()
      const data = await apiPost<Category>("/api/categories", { name }, token)
      return { data, error: null }
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "Failed to create category",
      }
    }
  },
}
