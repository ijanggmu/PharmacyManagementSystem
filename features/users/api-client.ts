import {
  apiGet,
  apiGetWithMeta,
  apiPost,
  apiPut,
  apiDelete,
  getCSRFToken,
} from "@/lib/api/client-helpers"
import { BaseFilters } from "@/lib/api/utils"

export interface User {
  id: string
  email: string
  full_name: string
  role: string
  phone: string | null
  is_active?: boolean
  created_at: string
  updated_at: string
}

export interface UsersFilters extends BaseFilters {
  role?: string
}

export interface CreateUserData {
  email: string
  full_name: string
  role: string
  phone?: string | null
  password: string
}

export interface UpdateUserData {
  email?: string
  full_name?: string
  role?: string
  phone?: string | null
  is_active?: boolean
}

function usersListPath(filters: UsersFilters = {}): string {
  const p = new URLSearchParams()
  if (filters.search?.trim()) p.set("search", filters.search.trim())
  if (filters.role) p.set("role", filters.role)
  if (filters.page != null) p.set("page", String(filters.page))
  if (filters.limit != null) p.set("limit", String(filters.limit))
  if (filters.sortBy) p.set("sortBy", filters.sortBy)
  if (filters.sortOrder) p.set("sortOrder", filters.sortOrder)
  const q = p.toString()
  return `/api/users${q ? `?${q}` : ""}`
}

export const usersApi = {
  getUsers: async (filters: UsersFilters = {}): Promise<{ data: User[]; error: string | null }> => {
    try {
      const { data } = await apiGetWithMeta<User[]>(usersListPath(filters))
      return { data: data ?? [], error: null }
    } catch (error) {
      return {
        data: [],
        error: error instanceof Error ? error.message : "Failed to fetch users",
      }
    }
  },

  getUser: async (id: string): Promise<{ data: User | null; error: string | null }> => {
    try {
      const data = await apiGet<User>(`/api/users/${encodeURIComponent(id)}`)
      return { data, error: null }
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "Failed to fetch user",
      }
    }
  },

  createUser: async (userData: CreateUserData): Promise<{ data: User | null; error: string | null }> => {
    try {
      const token = await getCSRFToken()
      const response = await fetch("/api/users/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        body: JSON.stringify({
          email: userData.email,
          fullName: userData.full_name,
          role: userData.role,
          phone: userData.phone,
          password: userData.password,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        const message = result?.error?.message || "Failed to create user"
        throw new Error(message)
      }

      const created: User = {
        id: result.data.id,
        email: result.data.email,
        full_name: result.data.full_name,
        role: result.data.role,
        phone: result.data.phone ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      return { data: created, error: null }
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "Failed to create user",
      }
    }
  },

  updateUser: async (id: string, updates: UpdateUserData): Promise<{ data: User | null; error: string | null }> => {
    try {
      const token = await getCSRFToken()
      const data = await apiPut<User>(`/api/users/${encodeURIComponent(id)}`, updates, token)
      return { data, error: null }
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "Failed to update user",
      }
    }
  },

  deleteUser: async (id: string): Promise<{ data: null; error: string | null }> => {
    try {
      const token = await getCSRFToken()
      await apiDelete(`/api/users/${encodeURIComponent(id)}`, token)
      return { data: null, error: null }
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "Failed to delete user",
      }
    }
  },
}
