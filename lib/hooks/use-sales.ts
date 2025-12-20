import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { salesApi, Sale, SalesFilters, CreateSaleData, UpdateSaleData } from "@/lib/api/sales"
import { 
  createQueryKeys, 
  DEFAULT_QUERY_CONFIG, 
  DEFAULT_MUTATION_CONFIG,
  useMutationSuccessHandler,
  createOptimisticUpdater
} from "./utils"

// Query keys for sales
export const saleKeys = createQueryKeys('sales')

// Hook to fetch sales
export function useSales(filters: SalesFilters = {}) {
  return useQuery({
    queryKey: saleKeys.list(filters),
    queryFn: () => salesApi.getSales(filters),
    ...DEFAULT_QUERY_CONFIG,
  })
}

// Hook to fetch a single sale
export function useSale(id: string) {
  return useQuery({
    queryKey: saleKeys.detail(id),
    queryFn: () => salesApi.getSale(id),
    enabled: !!id,
    ...DEFAULT_QUERY_CONFIG,
  })
}

// Hook to fetch sales statistics
export function useSalesStats() {
  return useQuery({
    queryKey: [...saleKeys.all, 'stats'],
    queryFn: () => salesApi.getSalesStats(),
    ...DEFAULT_QUERY_CONFIG,
  })
}

// Hook to create a sale
export function useCreateSale() {
  const queryClient = useQueryClient()
  const { showSuccess, showError, invalidateQueries } = useMutationSuccessHandler()

  return useMutation({
    mutationFn: salesApi.createSale,
    ...DEFAULT_MUTATION_CONFIG,
    onSuccess: (result) => {
      if (result.error) {
        showError(result.error)
        return
      }

      if (result.data && result.data.length > 0) {
        // Optimistically add the new sale to the list
        const optimisticUpdater = createOptimisticUpdater<Sale>([...saleKeys.lists()])
        queryClient.setQueriesData(
          { queryKey: [...saleKeys.lists()] },
          optimisticUpdater.add(result.data[0])
        )
      }

      // Invalidate related queries
      invalidateQueries([...saleKeys.all])
      
      showSuccess('Sale created successfully')
    },
    onError: (error: Error) => {
      showError(error.message || 'Failed to create sale')
    },
  })
}

// Hook to update a sale
export function useUpdateSale() {
  const queryClient = useQueryClient()
  const { showSuccess, showError, invalidateQueries } = useMutationSuccessHandler()

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateSaleData }) =>
      salesApi.updateSale(id, updates),
    ...DEFAULT_MUTATION_CONFIG,
    onSuccess: (result, variables) => {
      if (result.error) {
        showError(result.error)
        return
      }

      if (result.data && result.data.length > 0) {
        // Update cache optimistically
        queryClient.setQueryData([...saleKeys.detail(variables.id)], result)
        
        // Update list cache
        const optimisticUpdater = createOptimisticUpdater<Sale>([...saleKeys.lists()])
        queryClient.setQueriesData(
          { queryKey: [...saleKeys.lists()] },
          optimisticUpdater.update(result.data[0])
        )
      }

      // Invalidate related queries
      invalidateQueries([...saleKeys.all])
      
      showSuccess('Sale updated successfully')
    },
    onError: (error: Error) => {
      showError(error.message || 'Failed to update sale')
    },
  })
}

// Hook to update sale payment status
export function useUpdateSalePaymentStatus() {
  const queryClient = useQueryClient()
  const { showSuccess, showError, invalidateQueries } = useMutationSuccessHandler()

  return useMutation({
    mutationFn: ({ id, paymentStatus }: { id: string; paymentStatus: Sale['payment_status'] }) =>
      salesApi.updateSalePaymentStatus(id, paymentStatus),
    ...DEFAULT_MUTATION_CONFIG,
    onSuccess: (result, variables) => {
      if (result.error) {
        showError(result.error)
        return
      }

      if (result.data && result.data.length > 0) {
        // Update cache optimistically
        queryClient.setQueryData([...saleKeys.detail(variables.id)], result)
        
        // Update list cache
        const optimisticUpdater = createOptimisticUpdater<Sale>([...saleKeys.lists()])
        queryClient.setQueriesData(
          { queryKey: [...saleKeys.lists()] },
          optimisticUpdater.update(result.data[0])
        )
      }

      // Invalidate related queries
      invalidateQueries([...saleKeys.all])
      
      showSuccess('Sale payment status updated successfully')
    },
    onError: (error: Error) => {
      showError(error.message || 'Failed to update sale payment status')
    },
  })
}

// Hook to delete a sale
export function useDeleteSale() {
  const queryClient = useQueryClient()
  const { showSuccess, showError, invalidateQueries, removeQueries } = useMutationSuccessHandler()

  return useMutation({
    mutationFn: salesApi.deleteSale,
    ...DEFAULT_MUTATION_CONFIG,
    onSuccess: (result, saleId) => {
      if (result.error) {
        showError(result.error)
        return
      }

      // Remove from cache optimistically
      removeQueries([...saleKeys.detail(saleId)])
      
      // Update list cache by removing the deleted item
      const optimisticUpdater = createOptimisticUpdater<Sale>([...saleKeys.lists()])
      queryClient.setQueriesData(
        { queryKey: [...saleKeys.lists()] },
        optimisticUpdater.remove(saleId)
      )
      
      // Invalidate related queries
      invalidateQueries([...saleKeys.all])
      
      showSuccess('Sale deleted successfully')
    },
    onError: (error: Error) => {
      showError(error.message || 'Failed to delete sale')
    },
  })
}

// Hook to mark sale as completed
export function useCompleteSale() {
  const updatePaymentStatusMutation = useUpdateSalePaymentStatus()
  
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      return updatePaymentStatusMutation.mutateAsync({ id, paymentStatus: 'completed' })
    },
    ...DEFAULT_MUTATION_CONFIG,
  })
}

// Hook to mark sale as failed
export function useFailSale() {
  const updatePaymentStatusMutation = useUpdateSalePaymentStatus()
  
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      return updatePaymentStatusMutation.mutateAsync({ id, paymentStatus: 'failed' })
    },
    ...DEFAULT_MUTATION_CONFIG,
  })
}

// Hook to mark sale as refunded
export function useRefundSale() {
  const updatePaymentStatusMutation = useUpdateSalePaymentStatus()
  
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      return updatePaymentStatusMutation.mutateAsync({ id, paymentStatus: 'refunded' })
    },
    ...DEFAULT_MUTATION_CONFIG,
  })
}

// Hook to get sales by date range
export function useSalesByDateRange(startDate: string, endDate: string) {
  return useQuery({
    queryKey: [...saleKeys.all, 'dateRange', startDate, endDate],
    queryFn: () => salesApi.getSalesByDateRange(startDate, endDate),
    enabled: !!startDate && !!endDate,
    ...DEFAULT_QUERY_CONFIG,
  })
}
