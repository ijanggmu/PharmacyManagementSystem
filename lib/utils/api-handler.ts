/**
 * Standardized API and Supabase operation handler
 * Provides consistent success/error handling across all modules
 */

import { useToast } from "@/hooks/use-toast"
import { useQueryClient } from "@tanstack/react-query"

export interface ApiHandlerOptions {
  successMessage?: string
  errorMessage?: string
  onSuccess?: () => void
  onError?: (error: Error) => void
  invalidateQueries?: string[][]
  showToast?: boolean
}

/**
 * Standardized handler for API/Supabase operations
 * Use this in all components for consistent error/success handling
 */
export function useApiHandler() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const handleOperation = async <T>(
    operation: () => Promise<T>,
    options: ApiHandlerOptions = {}
  ): Promise<{ data: T | null; error: Error | null }> => {
    const {
      successMessage = "Operation completed successfully",
      errorMessage = "Operation failed",
      onSuccess,
      onError,
      invalidateQueries = [],
      showToast = true,
    } = options

    try {
      const data = await operation()

      if (showToast) {
        toast({
          title: "Success",
          description: successMessage,
        })
      }

      // Invalidate queries to refresh data
      invalidateQueries.forEach((queryKey) => {
        queryClient.invalidateQueries({ queryKey })
      })

      if (onSuccess) {
        onSuccess()
      }

      return { data, error: null }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      const message = err.message || errorMessage

      if (showToast) {
        toast({
          title: "Error",
          description: message,
          variant: "destructive",
        })
      }

      if (onError) {
        onError(err)
      }

      return { data: null, error: err }
    }
  }

  return { handleOperation }
}

/**
 * Helper to trigger data refresh without page reload
 * Dispatches custom events that components can listen to
 */
export function triggerDataRefresh(tableName?: string) {
  // Dispatch custom event for data refresh
  if (tableName) {
    window.dispatchEvent(new CustomEvent(`refresh-${tableName}`))
  }
  window.dispatchEvent(new CustomEvent("refresh-data"))
}

