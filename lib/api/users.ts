import { createClient } from "@/lib/supabase/client"
import { applyPagination, applySorting, listApiWrapper, BaseFilters } from "./utils"

export interface User {
  id: string
  email: string
  full_name: string
  role: string
  phone: string | null
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
}

export const usersApi = {
  // Get all users with filters
  getUsers: async (filters: UsersFilters = {}): Promise<{ data: User[]; error: string | null }> => {
    return listApiWrapper(async () => {
      const supabase = createClient()
      
      let query = supabase
        .from("users")
        .select("*")

      // Apply filters
      if (filters.search) {
        query = query.or(`full_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,role.ilike.%${filters.search}%`)
      }

      if (filters.role) {
        query = query.eq("role", filters.role)
      }

      // Apply sorting and pagination
      query = applySorting(query, filters.sortBy || 'created_at', filters.sortOrder)
      
      if (filters.page && filters.limit) {
        query = applyPagination(query, filters.page, filters.limit)
      }

      const { data, error } = await query

      if (error) {
        throw new Error(error.message)
      }

      return data || []
    }, 'Failed to fetch users')
  },

  // Get user by ID
  getUser: async (id: string): Promise<{ data: User | null; error: string | null }> => {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", id)
        .single()

      if (error) {
        throw new Error(error.message)
      }

      return { data, error: null }
    } catch (error) {
      return { 
        data: null, 
        error: error instanceof Error ? error.message : "Failed to fetch user" 
      }
    }
  },

  // Create user via backend invite endpoint
  createUser: async (userData: CreateUserData): Promise<{ data: User | null; error: string | null }> => {
    try {
      const supabase = createClient()

      // Obtain CSRF token from API
      const csrfRes = await fetch("/api/csrf/token")
      const csrfJson = await csrfRes.json()
      const csrfToken = csrfJson.token as string

      const response = await fetch("/api/users/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
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

  // Update user
  updateUser: async (id: string, updates: UpdateUserData): Promise<{ data: User | null; error: string | null }> => {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from("users")
        .update(updates)
        .eq("id", id)
        .select()
        .single()

      if (error) {
        throw new Error(error.message)
      }

      return { data, error: null }
    } catch (error) {
      return { 
        data: null, 
        error: error instanceof Error ? error.message : "Failed to update user" 
      }
    }
  },

  // Delete user
  deleteUser: async (id: string): Promise<{ data: null; error: string | null }> => {
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from("users")
        .delete()
        .eq("id", id)

      if (error) {
        throw new Error(error.message)
      }

      return { data: null, error: null }
    } catch (error) {
      return { 
        data: null, 
        error: error instanceof Error ? error.message : "Failed to delete user" 
      }
    }
  },
}

