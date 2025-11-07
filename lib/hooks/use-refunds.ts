import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { refundsApi, Refund, RefundsFilters, CreateRefundData, UpdateRefundData } from "@/lib/api/refunds"
import {
  createQueryKeys,
  DEFAULT_QUERY_CONFIG,
  DEFAULT_MUTATION_CONFIG,
  useMutationSuccessHandler,
  createOptimisticUpdater
} from "./utils"

// Query keys for refunds
export const refundKeys = createQueryKeys('refunds')

// Hook to fetch refunds
export function useRefunds(filters: RefundsFilters = {}) {
  return useQuery({
    queryKey: refundKeys.list(filters),
    queryFn: () => refundsApi.getRefunds(filters),
    ...DEFAULT_QUERY_CONFIG,
  })
}

// Hook to fetch a single refund
export function useRefund(id: string) {
  return useQuery({
    queryKey: refundKeys.detail(id),
    queryFn: () => refundsApi.getRefund(id),
    enabled: !!id,
    ...DEFAULT_QUERY_CONFIG,
  })
}

// Hook to fetch refunds statistics
export function useRefundsStats() {
  return useQuery({
    queryKey: [...refundKeys.all, 'stats'],
    queryFn: () => refundsApi.getRefundsStats(),
    ...DEFAULT_QUERY_CONFIG,
  })
}

// Hook to create a refund
export function useCreateRefund() {
  const queryClient = useQueryClient()
  const { showSuccess, showError, invalidateQueries } = useMutationSuccessHandler()

  return useMutation({
    mutationFn: refundsApi.createRefund,
    ...DEFAULT_MUTATION_CONFIG,
    onSuccess: (result) => {
      if (result.error) {
        showError(result.error)
        return
      }

      if (result.data && result.data.length > 0) {
        // Optimistically add the new refund to the list
        const optimisticUpdater = createOptimisticUpdater<Refund>(refundKeys.lists())
        queryClient.setQueriesData(
          { queryKey: refundKeys.lists() },
          optimisticUpdater.add(result.data[0])
        )
      }

      // Invalidate related queries
      invalidateQueries(refundKeys.all)

      showSuccess('Refund created successfully')
    },
    onError: (error: Error) => {
      showError(error.message || 'Failed to create refund')
    },
  })
}

// Hook to update a refund
export function useUpdateRefund() {
  const queryClient = useQueryClient()
  const { showSuccess, showError, invalidateQueries } = useMutationSuccessHandler()

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateRefundData }) =>
      refundsApi.updateRefund(id, updates),
    ...DEFAULT_MUTATION_CONFIG,
    onSuccess: (result, variables) => {
      if (result.error) {
        showError(result.error)
        return
      }

      if (result.data && result.data.length > 0) {
        // Update cache optimistically
        queryClient.setQueryData(refundKeys.detail(variables.id), result)

        // Update list cache
        const optimisticUpdater = createOptimisticUpdater<Refund>(refundKeys.lists())
        queryClient.setQueriesData(
          { queryKey: refundKeys.lists() },
          optimisticUpdater.update(result.data[0])
        )
      }

      // Invalidate related queries
      invalidateQueries(refundKeys.all)

      showSuccess('Refund updated successfully')
    },
    onError: (error: Error) => {
      showError(error.message || 'Failed to update refund')
    },
  })
}

// Hook to update refund status
export function useUpdateRefundStatus() {
  const queryClient = useQueryClient()
  const { showSuccess, showError, invalidateQueries } = useMutationSuccessHandler()

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Refund['status'] }) =>
      refundsApi.updateRefundStatus(id, status),
    ...DEFAULT_MUTATION_CONFIG,
    onSuccess: (result, variables) => {
      if (result.error) {
        showError(result.error)
        return
      }

      if (result.data && result.data.length > 0) {
        // Update cache optimistically
        queryClient.setQueryData(refundKeys.detail(variables.id), result)

        // Update list cache
        const optimisticUpdater = createOptimisticUpdater<Refund>(refundKeys.lists())
        queryClient.setQueriesData(
          { queryKey: refundKeys.lists() },
          optimisticUpdater.update(result.data[0])
        )
      }

      // Invalidate related queries
      invalidateQueries(refundKeys.all)

      showSuccess('Refund status updated successfully')
    },
    onError: (error: Error) => {
      showError(error.message || 'Failed to update refund status')
    },
  })
}

// Hook to delete a refund
export function useDeleteRefund() {
  const queryClient = useQueryClient()
  const { showSuccess, showError, invalidateQueries, removeQueries } = useMutationSuccessHandler()

  return useMutation({
    mutationFn: refundsApi.deleteRefund,
    ...DEFAULT_MUTATION_CONFIG,
    onSuccess: (result, refundId) => {
      if (result.error) {
        showError(result.error)
        return
      }

      // Remove from cache optimistically
      removeQueries(refundKeys.detail(refundId))

      // Update list cache by removing the deleted item
      const optimisticUpdater = createOptimisticUpdater<Refund>(refundKeys.lists())
      queryClient.setQueriesData(
        { queryKey: refundKeys.lists() },
        optimisticUpdater.remove(refundId)
      )

      // Invalidate related queries
      invalidateQueries(refundKeys.all)

      showSuccess('Refund deleted successfully')
    },
    onError: (error: Error) => {
      showError(error.message || 'Failed to delete refund')
    },
  })
}

// Hook to approve a refund
export function useApproveRefund() {
  const updateStatusMutation = useUpdateRefundStatus()

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      return updateStatusMutation.mutateAsync({ id, status: 'approved' })
    },
    ...DEFAULT_MUTATION_CONFIG,
  })
}

// Hook to reject a refund
export function useRejectRefund() {
  const updateStatusMutation = useUpdateRefundStatus()

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      return updateStatusMutation.mutateAsync({ id, status: 'rejected' })
    },
    ...DEFAULT_MUTATION_CONFIG,
  })
}

// Hook to complete a refund
export function useCompleteRefund() {
  const updateStatusMutation = useUpdateRefundStatus()

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      return updateStatusMutation.mutateAsync({ id, status: 'completed' })
    },
    ...DEFAULT_MUTATION_CONFIG,
  })
}

// Hook to get refunds by date range
export function useRefundsByDateRange(startDate: string, endDate: string) {
  return useQuery({
    queryKey: [...refundKeys.all, 'dateRange', startDate, endDate],
    queryFn: () => refundsApi.getRefundsByDateRange(startDate, endDate),
    enabled: !!startDate && !!endDate,
    ...DEFAULT_QUERY_CONFIG,
  })
}





