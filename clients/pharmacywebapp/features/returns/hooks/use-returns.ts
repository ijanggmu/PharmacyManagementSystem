import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { returnsApi, Return, ReturnsFilters, CreateReturnData, UpdateReturnData } from "@/features/returns/api-client"
import {
  createQueryKeys,
  DEFAULT_QUERY_CONFIG,
  DEFAULT_MUTATION_CONFIG,
  useMutationSuccessHandler,
  createOptimisticUpdater
} from "@/lib/hooks/utils"

// Query keys for returns
export const returnKeys = createQueryKeys('returns')

// Hook to fetch returns
export function useReturns(filters: ReturnsFilters = {}) {
  return useQuery({
    queryKey: [...returnKeys.list(filters)],
    queryFn: () => returnsApi.getReturns(filters),
    ...DEFAULT_QUERY_CONFIG,
  })
}

// Hook to fetch a single return
export function useReturn(id: string) {
  return useQuery({
    queryKey: [...returnKeys.detail(id)],
    queryFn: () => returnsApi.getReturn(id),
    enabled: !!id,
    ...DEFAULT_QUERY_CONFIG,
  })
}

// Hook to fetch returns statistics
/**
 * `enabled: false` observes the cached stats without triggering a fetch (used for
 * tab count badges on the Returns & refunds page).
 */
export function useReturnsStats(options: { enabled?: boolean; branchId?: string } = {}) {
  return useQuery({
    queryKey: [...returnKeys.all, 'stats', options.branchId ?? ""],
    queryFn: () => returnsApi.getReturnsStats(options.branchId),
    ...DEFAULT_QUERY_CONFIG,
    enabled: options.enabled ?? true,
  })
}

// Hook to create a return
export function useCreateReturn() {
  const queryClient = useQueryClient()
  const { showSuccess, showError, invalidateQueries } = useMutationSuccessHandler()

  return useMutation({
    // Per-call data (including the submission's Idempotency-Key) rides through mutate(vars).
    mutationFn: (vars: { data: CreateReturnData; idempotencyKey: string }) => returnsApi.createReturn(vars.data, vars.idempotencyKey),
    ...DEFAULT_MUTATION_CONFIG,
    onSuccess: (result) => {
      if (result.error) {
        showError(result.error)
        return
      }

      if (result.data && result.data.length > 0) {
        // Optimistically add the new return to the list
        const optimisticUpdater = createOptimisticUpdater<Return>([...returnKeys.lists()])
        queryClient.setQueriesData(
          { queryKey: [...returnKeys.lists()] },
          optimisticUpdater.add(result.data[0])
        )
      }

      // Invalidate related queries
      invalidateQueries([...returnKeys.all])
      // The sale's returned/refunded quantities and (for returns) stock changed too.
      invalidateQueries(["sales"])
      invalidateQueries(["medicines"])

      showSuccess('Return created successfully')
    },
    onError: (error: Error) => {
      showError(error.message || 'Failed to create return')
    },
  })
}

// Hook to update a return
export function useUpdateReturn() {
  const queryClient = useQueryClient()
  const { showSuccess, showError, invalidateQueries } = useMutationSuccessHandler()

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateReturnData }) =>
      returnsApi.updateReturn(id, updates),
    ...DEFAULT_MUTATION_CONFIG,
    onSuccess: (result, variables) => {
      if (result.error) {
        showError(result.error)
        return
      }

      if (result.data && result.data.length > 0) {
        // Update cache optimistically
        queryClient.setQueryData([...returnKeys.detail(variables.id)], result)

        // Update list cache
        const optimisticUpdater = createOptimisticUpdater<Return>([...returnKeys.lists()])
        queryClient.setQueriesData(
          { queryKey: [...returnKeys.lists()] },
          optimisticUpdater.update(result.data[0])
        )
      }

      // Invalidate related queries
      invalidateQueries([...returnKeys.all])
      // The sale's returned/refunded quantities and (for returns) stock changed too.
      invalidateQueries(["sales"])
      invalidateQueries(["medicines"])

      showSuccess('Return updated successfully')
    },
    onError: (error: Error) => {
      showError(error.message || 'Failed to update return')
    },
  })
}

// Hook to update return status
export function useUpdateReturnStatus() {
  const queryClient = useQueryClient()
  const { showSuccess, showError, invalidateQueries } = useMutationSuccessHandler()

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Return['status'] }) =>
      returnsApi.updateReturnStatus(id, status),
    ...DEFAULT_MUTATION_CONFIG,
    onSuccess: (result, variables) => {
      if (result.error) {
        showError(result.error)
        return
      }

      if (result.data && result.data.length > 0) {
        // Update cache optimistically
        queryClient.setQueryData([...returnKeys.detail(variables.id)], result)

        // Update list cache
        const optimisticUpdater = createOptimisticUpdater<Return>([...returnKeys.lists()])
        queryClient.setQueriesData(
          { queryKey: [...returnKeys.lists()] },
          optimisticUpdater.update(result.data[0])
        )
      }

      // Invalidate related queries
      invalidateQueries([...returnKeys.all])
      // The sale's returned/refunded quantities and (for returns) stock changed too.
      invalidateQueries(["sales"])
      invalidateQueries(["medicines"])

      showSuccess('Return status updated successfully')
    },
    onError: (error: Error) => {
      showError(error.message || 'Failed to update return status')
    },
  })
}

// Hook to delete a return
export function useDeleteReturn() {
  const queryClient = useQueryClient()
  const { showSuccess, showError, invalidateQueries, removeQueries } = useMutationSuccessHandler()

  return useMutation({
    mutationFn: returnsApi.deleteReturn,
    ...DEFAULT_MUTATION_CONFIG,
    onSuccess: (result, returnId) => {
      if (result.error) {
        showError(result.error)
        return
      }

      // Remove from cache optimistically
      removeQueries([...returnKeys.detail(returnId)])

      // Update list cache by removing the deleted item
      const optimisticUpdater = createOptimisticUpdater<Return>([...returnKeys.lists()])
      queryClient.setQueriesData(
        { queryKey: [...returnKeys.lists()] },
        optimisticUpdater.remove(returnId)
      )

      // Invalidate related queries
      invalidateQueries([...returnKeys.all])
      // The sale's returned/refunded quantities and (for returns) stock changed too.
      invalidateQueries(["sales"])
      invalidateQueries(["medicines"])

      showSuccess('Return deleted successfully')
    },
    onError: (error: Error) => {
      showError(error.message || 'Failed to delete return')
    },
  })
}

