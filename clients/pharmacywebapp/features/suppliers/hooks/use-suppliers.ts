import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { suppliersApi, Supplier, SuppliersFilters } from "@/features/suppliers/api-client"
import { useToast } from "@/hooks/use-toast"

// Query keys for suppliers
export const supplierKeys = {
  all: ["suppliers"] as const,
  lists: () => [...supplierKeys.all, "list"] as const,
  list: (filters: SuppliersFilters) => [...supplierKeys.lists(), filters] as const,
  details: () => [...supplierKeys.all, "detail"] as const,
  detail: (id: string) => [...supplierKeys.details(), id] as const,
}

// Hook to fetch suppliers
export function useSuppliers(filters: SuppliersFilters = {}) {
  return useQuery({
    queryKey: supplierKeys.list(filters),
    queryFn: () => suppliersApi.getSuppliers(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Hook to fetch a single supplier
export function useSupplier(id: string) {
  return useQuery({
    queryKey: supplierKeys.detail(id),
    queryFn: () => suppliersApi.getSupplier(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Hook to create a supplier
export function useCreateSupplier() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: suppliersApi.createSupplier,
    onSuccess: (result) => {
      if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
        return
      }

      // Invalidate and refetch suppliers list
      queryClient.invalidateQueries({ queryKey: supplierKeys.lists() })
      
      toast({
        title: "Success",
        description: "Supplier created successfully",
      })
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create supplier",
        variant: "destructive",
      })
    },
  })
}

// Hook to update a supplier
export function useUpdateSupplier() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Supplier> }) =>
      suppliersApi.updateSupplier(id, updates),
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
      queryClient.setQueryData(supplierKeys.detail(variables.id), result)
      
      // Invalidate and refetch suppliers list
      queryClient.invalidateQueries({ queryKey: supplierKeys.lists() })
      
      toast({
        title: "Success",
        description: "Supplier updated successfully",
      })
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update supplier",
        variant: "destructive",
      })
    },
  })
}

// Hook to delete a supplier
export function useDeleteSupplier() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: suppliersApi.deleteSupplier,
    onSuccess: (result, supplierId) => {
      if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
        return
      }

      // Remove from cache optimistically
      queryClient.removeQueries({ queryKey: supplierKeys.detail(supplierId) })
      
      // Update suppliers list cache by removing the deleted item
      queryClient.setQueriesData(
        { queryKey: supplierKeys.lists() },
        (oldData: any) => {
          if (!oldData?.data) return oldData
          return {
            ...oldData,
            data: oldData.data.filter((supplier: Supplier) => supplier.id !== supplierId)
          }
        }
      )
      
      toast({
        title: "Success",
        description: "Supplier deleted successfully",
      })
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete supplier",
        variant: "destructive",
      })
    },
  })
}
