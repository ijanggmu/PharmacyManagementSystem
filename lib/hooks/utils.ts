import { useQueryClient } from "@tanstack/react-query"
import { useToast } from "@/hooks/use-toast"

// Common mutation success handler
export function useMutationSuccessHandler() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return {
    showSuccess: (message: string) => {
      toast({
        title: "Success",
        description: message,
      })
    },
    showError: (message: string) => {
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      })
    },
    invalidateQueries: (queryKey: any[]) => {
      queryClient.invalidateQueries({ queryKey })
    },
    removeQueries: (queryKey: any[]) => {
      queryClient.removeQueries({ queryKey })
    },
    updateQueryData: (queryKey: any[], updater: (oldData: any) => any) => {
      queryClient.setQueriesData({ queryKey }, updater)
    }
  }
}

// Common query configuration
export const DEFAULT_QUERY_CONFIG = {
  staleTime: 5 * 60 * 1000, // 5 minutes
  gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
  retry: 3,
  retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
} as const

// Common mutation configuration
export const DEFAULT_MUTATION_CONFIG = {
  retry: 1,
  retryDelay: 1000,
} as const

// Type-safe query key factory
export function createQueryKeys<T extends string>(baseKey: T) {
  return {
    all: [baseKey] as const,
    lists: () => [...createQueryKeys(baseKey).all, 'list'] as const,
    list: (filters: Record<string, any> = {}) => 
      [...createQueryKeys(baseKey).lists(), filters] as const,
    details: () => [...createQueryKeys(baseKey).all, 'detail'] as const,
    detail: (id: string) => 
      [...createQueryKeys(baseKey).details(), id] as const,
  }
}

// Common optimistic update helpers
export function createOptimisticUpdater<T extends { id: string }>(
  queryKey: any[]
) {
  return {
    add: (newItem: T) => (oldData: any) => {
      if (!oldData?.data) return oldData
      return {
        ...oldData,
        data: [newItem, ...oldData.data]
      }
    },
    update: (updatedItem: T) => (oldData: any) => {
      if (!oldData?.data) return oldData
      return {
        ...oldData,
        data: oldData.data.map((item: T) => 
          item.id === updatedItem.id ? updatedItem : item
        )
      }
    },
    remove: (id: string) => (oldData: any) => {
      if (!oldData?.data) return oldData
      return {
        ...oldData,
        data: oldData.data.filter((item: T) => item.id !== id)
      }
    }
  }
}
