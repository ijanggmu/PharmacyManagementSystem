"use client"

import { useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { PharmacyError, NetworkError, DatabaseError } from "@/lib/error-handling/error-types"
import { ErrorRecoveryManager } from "@/lib/error-handling/error-recovery"

interface UseApiOptions {
  onSuccess?: (data: any) => void
  onError?: (error: PharmacyError) => void
  retryConfig?: {
    maxAttempts: number
    baseDelay: number
  }
}

interface UseApiState<T> {
  data: T | null
  loading: boolean
  error: PharmacyError | null
}

export function useApi<T = any>(options: UseApiOptions = {}) {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: false,
    error: null,
  })

  const supabase = createClient()
  const recoveryManager = ErrorRecoveryManager.getInstance()

  const execute = useCallback(
    async (operation: () => Promise<any>): Promise<T | null> => {
      setState((prev) => ({ ...prev, loading: true, error: null }))

      try {
        const result = await recoveryManager.executeWithRetry(operation, options.retryConfig, {
          operation: operation.name,
        })

        setState({ data: result, loading: false, error: null })

        if (options.onSuccess) {
          options.onSuccess(result)
        }

        return result
      } catch (error) {
        let pharmacyError: PharmacyError

        if (error instanceof PharmacyError) {
          pharmacyError = error
        } else if (error instanceof Error) {
          if (error.message.includes("fetch")) {
            pharmacyError = new NetworkError(
              error.message,
              "NETWORK_ERROR",
              "Unable to connect to the server. Please check your internet connection.",
            )
          } else if (error.message.includes("database") || error.message.includes("relation")) {
            pharmacyError = new DatabaseError(
              error.message,
              "DATABASE_ERROR",
              "There was a problem accessing the database. Please try again.",
            )
          } else {
            pharmacyError = new PharmacyError(
              error.message,
              "SYSTEM" as any,
              "MEDIUM" as any,
              "API_ERROR",
              "An unexpected error occurred. Please try again.",
              true,
              true,
            )
          }
        } else {
          pharmacyError = new PharmacyError(
            "Unknown error occurred",
            "SYSTEM" as any,
            "MEDIUM" as any,
            "UNKNOWN_ERROR",
            "An unexpected error occurred. Please try again.",
            true,
            true,
          )
        }

        setState({ data: null, loading: false, error: pharmacyError })

        if (options.onError) {
          options.onError(pharmacyError)
        }

        return null
      }
    },
    [options, recoveryManager, supabase],
  )

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null })
  }, [])

  return {
    ...state,
    execute,
    reset,
  }
}

// Specialized hooks for common operations
export function useMedicines() {
  const api = useApi()

  const fetchMedicines = useCallback(
    (filters?: any) => {
      return api.execute(async () => {
        let query = api.supabase.from("medicines").select(`
            *,
            categories (id, name),
            suppliers (id, name)
          `)

        if (filters?.search) {
          query = query.or(`name.ilike.%${filters.search}%,generic_name.ilike.%${filters.search}%`)
        }

        if (filters?.category && filters.category !== "all") {
          query = query.eq("categories.name", filters.category)
        }

        if (filters?.stockStatus && filters.stockStatus !== "all") {
          switch (filters.stockStatus) {
            case "low":
              query = query.lte("stock_quantity", api.supabase.rpc("minimum_stock"))
              break
            case "out":
              query = query.eq("stock_quantity", 0)
              break
            case "in":
              query = query.gt("stock_quantity", api.supabase.rpc("minimum_stock"))
              break
          }
        }

        const { data, error } = await query.order("name")

        if (error) throw error
        return data
      })
    },
    [api],
  )

  const createMedicine = useCallback(
    (medicineData: any) => {
      return api.execute(async () => {
        const { data, error } = await api.supabase.from("medicines").insert(medicineData).select().single()

        if (error) throw error
        return data
      })
    },
    [api],
  )

  const updateMedicine = useCallback(
    (id: string, medicineData: any) => {
      return api.execute(async () => {
        const { data, error } = await api.supabase.from("medicines").update(medicineData).eq("id", id).select().single()

        if (error) throw error
        return data
      })
    },
    [api],
  )

  const deleteMedicine = useCallback(
    (id: string) => {
      return api.execute(async () => {
        const { error } = await api.supabase.from("medicines").delete().eq("id", id)

        if (error) throw error
        return { success: true }
      })
    },
    [api],
  )

  return {
    ...api,
    fetchMedicines,
    createMedicine,
    updateMedicine,
    deleteMedicine,
  }
}

export function useCustomers() {
  const api = useApi()

  const fetchCustomers = useCallback(
    (filters?: any) => {
      return api.execute(async () => {
        let query = api.supabase.from("customers").select(`
            *,
            prescriptions (id),
            sales (id, total_amount)
          `)

        if (filters?.search) {
          query = query.or(
            `first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`,
          )
        }

        const { data, error } = await query.order("first_name")

        if (error) throw error
        return data
      })
    },
    [api],
  )

  const createCustomer = useCallback(
    (customerData: any) => {
      return api.execute(async () => {
        const { data, error } = await api.supabase.from("customers").insert(customerData).select().single()

        if (error) throw error
        return data
      })
    },
    [api],
  )

  const updateCustomer = useCallback(
    (id: string, customerData: any) => {
      return api.execute(async () => {
        const { data, error } = await api.supabase.from("customers").update(customerData).eq("id", id).select().single()

        if (error) throw error
        return data
      })
    },
    [api],
  )

  const deleteCustomer = useCallback(
    (id: string) => {
      return api.execute(async () => {
        const { error } = await api.supabase.from("customers").delete().eq("id", id)

        if (error) throw error
        return { success: true }
      })
    },
    [api],
  )

  return {
    ...api,
    fetchCustomers,
    createCustomer,
    updateCustomer,
    deleteCustomer,
  }
}
