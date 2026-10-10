import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { medicinesApi, MedicinesFilters, MedicinesResponse } from "@/features/medicines/api-client"
import { Medicine } from "@/features/medicines/api-client"
import { useToast } from "@/hooks/use-toast"

// Query keys for consistent caching
export const medicineKeys = {
  all: ["medicines"] as const,
  lists: () => [...medicineKeys.all, "list"] as const,
  list: (filters: MedicinesFilters) => [...medicineKeys.lists(), filters] as const,
  details: () => [...medicineKeys.all, "detail"] as const,
  detail: (id: string) => [...medicineKeys.details(), id] as const,
  stats: () => [...medicineKeys.all, "stats"] as const,
}

// Hook to fetch medicines with filters
export function useMedicines(filters: MedicinesFilters = {}) {
  return useQuery({
    queryKey: medicineKeys.list(filters),
    queryFn: () => medicinesApi.getMedicines(filters),
    staleTime: 1000 * 60 * 2, // 2 minutes
  })
}

// Hook to fetch tenant-wide inventory stat-card counts (see medicinesApi.getInventoryStats)
export function useInventoryStats(branchId?: string) {
  return useQuery({
    // Prefix stays medicineKeys.stats() so invalidating stats refreshes every branch scope.
    queryKey: [...medicineKeys.stats(), branchId ?? ""],
    queryFn: () => medicinesApi.getInventoryStats(branchId),
    staleTime: 1000 * 60 * 2, // 2 minutes
  })
}

// Hook to fetch a single medicine
export function useMedicine(id: string) {
  return useQuery({
    queryKey: medicineKeys.detail(id),
    queryFn: () => medicinesApi.getMedicine(id),
    enabled: !!id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

// Hook to create a medicine
export function useCreateMedicine() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: medicinesApi.createMedicine,
    onSuccess: (result) => {
      if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
        return
      }

      // Invalidate and refetch medicines list + stat-card counts
      queryClient.invalidateQueries({ queryKey: medicineKeys.lists() })
      queryClient.invalidateQueries({ queryKey: medicineKeys.stats() })
      
      toast({
        title: "Success",
        description: "Medicine created successfully",
      })
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create medicine",
        variant: "destructive",
      })
    },
  })
}

// Hook to update a medicine
export function useUpdateMedicine() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Medicine> }) =>
      medicinesApi.updateMedicine(id, updates),
    onSuccess: (result, variables) => {
      if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
        return
      }

      // Update cache optimistically
      queryClient.setQueryData(medicineKeys.detail(variables.id), result)
      
      // Invalidate and refetch medicines list + stat-card counts
      queryClient.invalidateQueries({ queryKey: medicineKeys.lists() })
      queryClient.invalidateQueries({ queryKey: medicineKeys.stats() })
      
      toast({
        title: "Success",
        description: "Medicine updated successfully",
      })
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update medicine",
        variant: "destructive",
      })
    },
  })
}

// Hook to delete a medicine
export function useDeleteMedicine() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: medicinesApi.deleteMedicine,
    onSuccess: (result, medicineId) => {
      if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
        return
      }

      // Remove from cache optimistically
      queryClient.removeQueries({ queryKey: medicineKeys.detail(medicineId) })
      
      // Update medicines list cache by removing the deleted item
      queryClient.setQueriesData(
        { queryKey: medicineKeys.lists() },
        (oldData: MedicinesResponse | undefined) => {
          if (!oldData?.data) return oldData
          return {
            ...oldData,
            data: oldData.data.filter((medicine: Medicine) => medicine.id !== medicineId)
          }
        }
      )
      queryClient.invalidateQueries({ queryKey: medicineKeys.stats() })

      toast({
        title: result.archived ? "Medicine archived" : "Medicine deleted",
        description: result.archived
          ? "It has transaction history, so it was archived instead — hidden from pickers, records preserved. You can restore it from the Archived filter."
          : "Medicine deleted successfully",
      })
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete medicine",
        variant: "destructive",
      })
    },
  })
}

export function useUnarchiveMedicine() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: medicinesApi.unarchiveMedicine,
    onSuccess: (result) => {
      if (result.error) {
        toast({ title: "Error", description: result.error, variant: "destructive" })
        return
      }
      queryClient.invalidateQueries({ queryKey: medicineKeys.lists() })
      queryClient.invalidateQueries({ queryKey: medicineKeys.stats() })
      toast({ title: "Medicine restored", description: "It's visible in pickers and lists again." })
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to restore medicine",
        variant: "destructive",
      })
    },
  })
}
