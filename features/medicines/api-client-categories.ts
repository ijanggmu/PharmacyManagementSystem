import { apiGet, apiPost, getCSRFToken } from "@/lib/api/client-helpers"

export interface Category {
  id: string
  name: string
}

export const categoriesApi = {
  async getCategories(): Promise<{ data: Category[]; error: string | null }> {
    try {
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
