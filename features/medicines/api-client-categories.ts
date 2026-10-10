import { categoriesDotnetApi } from "@/lib/api/reference-api"
import { invalidateCategoryNameCache } from "@/features/medicines/api-client"

export interface Category {
  id: string
  name: string
}

export const categoriesApi = {
  async getCategories(): Promise<{ data: Category[]; error: string | null }> {
    try {
      return { data: await categoriesDotnetApi.list(), error: null }
    } catch (error) {
      return {
        data: [],
        error: error instanceof Error ? error.message : "Failed to fetch categories",
      }
    }
  },

  async createCategory(name: string): Promise<{ data: Category | null; error: string | null }> {
    try {
      const created = await categoriesDotnetApi.create(name)
      invalidateCategoryNameCache()
      return { data: created, error: null }
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "Failed to create category",
      }
    }
  },
}
