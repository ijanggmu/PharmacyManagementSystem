import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  prescriptionsApi,
  type Prescription,
  type PrescriptionsFilters,
  type UpdatePrescriptionData,
} from "@/features/prescriptions/api-client"
import {
  createQueryKeys,
  DEFAULT_QUERY_CONFIG,
  DEFAULT_MUTATION_CONFIG,
  useMutationSuccessHandler,
  createOptimisticUpdater,
} from "@/lib/hooks/utils"

// Query keys for prescriptions
export const prescriptionKeys = createQueryKeys("prescriptions")

// Hook to fetch prescriptions
export function usePrescriptions(filters: PrescriptionsFilters = {}) {
  return useQuery({
    queryKey: prescriptionKeys.list(filters),
    queryFn: () => prescriptionsApi.getPrescriptions(filters),
    ...DEFAULT_QUERY_CONFIG,
  })
}

// Hook to fetch a single prescription
export function usePrescription(id: string) {
  return useQuery({
    queryKey: prescriptionKeys.detail(id),
    queryFn: () => prescriptionsApi.getPrescription(id),
    enabled: !!id,
    ...DEFAULT_QUERY_CONFIG,
  })
}

// Hook to fetch prescription statistics
export function usePrescriptionStats({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...prescriptionKeys.all, "stats"],
    queryFn: () => prescriptionsApi.getPrescriptionStats(),
    ...DEFAULT_QUERY_CONFIG,
    enabled,
  })
}

// Hook to create a prescription
export function useCreatePrescription() {
  const queryClient = useQueryClient()
  const { showSuccess, showError, invalidateQueries } = useMutationSuccessHandler()

  return useMutation({
    mutationFn: prescriptionsApi.createPrescription,
    ...DEFAULT_MUTATION_CONFIG,
    onSuccess: (result) => {
      if (result.error) {
        showError(result.error)
        return
      }

      if (result.data && result.data.length > 0) {
        // Optimistically add the new prescription to the list
        const optimisticUpdater = createOptimisticUpdater<Prescription>([...prescriptionKeys.lists()])
        queryClient.setQueriesData({ queryKey: prescriptionKeys.lists() }, optimisticUpdater.add(result.data[0]))
      }

      // Invalidate related queries
      invalidateQueries([...prescriptionKeys.all])

      showSuccess("Prescription created successfully")
    },
    onError: (error: Error) => {
      showError(error.message || "Failed to create prescription")
    },
  })
}

// Hook to update a prescription
export function useUpdatePrescription() {
  const queryClient = useQueryClient()
  const { showSuccess, showError, invalidateQueries } = useMutationSuccessHandler()

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdatePrescriptionData }) =>
      prescriptionsApi.updatePrescription(id, updates),
    ...DEFAULT_MUTATION_CONFIG,
    onSuccess: (result, variables) => {
      if (result.error) {
        showError(result.error)
        return
      }

      if (result.data && result.data.length > 0) {
        // Update cache optimistically
        queryClient.setQueryData([...prescriptionKeys.detail(variables.id)], result)

        // Update list cache
        const optimisticUpdater = createOptimisticUpdater<Prescription>([...prescriptionKeys.lists()])
        queryClient.setQueriesData({ queryKey: prescriptionKeys.lists() }, optimisticUpdater.update(result.data[0]))
      }

      // Invalidate related queries
      invalidateQueries([...prescriptionKeys.all])

      showSuccess("Prescription updated successfully")
    },
    onError: (error: Error) => {
      showError(error.message || "Failed to update prescription")
    },
  })
}

// Hook to update prescription status
export function useUpdatePrescriptionStatus() {
  const queryClient = useQueryClient()
  const { showSuccess, showError, invalidateQueries } = useMutationSuccessHandler()

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Prescription["status"] }) =>
      prescriptionsApi.updatePrescriptionStatus(id, status),
    ...DEFAULT_MUTATION_CONFIG,
    onSuccess: (result, variables) => {
      if (result.error) {
        showError(result.error)
        return
      }

      if (result.data && result.data.length > 0) {
        // Update cache optimistically
        queryClient.setQueryData([...prescriptionKeys.detail(variables.id)], result)

        // Update list cache
        const optimisticUpdater = createOptimisticUpdater<Prescription>([...prescriptionKeys.lists()])
        queryClient.setQueriesData({ queryKey: prescriptionKeys.lists() }, optimisticUpdater.update(result.data[0]))
      }

      // Invalidate related queries
      invalidateQueries([...prescriptionKeys.all])

      showSuccess("Prescription status updated successfully")
    },
    onError: (error: Error) => {
      showError(error.message || "Failed to update prescription status")
    },
  })
}

// Hook to delete a prescription
export function useDeletePrescription() {
  const queryClient = useQueryClient()
  const { showSuccess, showError, invalidateQueries, removeQueries } = useMutationSuccessHandler()

  return useMutation({
    mutationFn: prescriptionsApi.deletePrescription,
    ...DEFAULT_MUTATION_CONFIG,
    onSuccess: (result, prescriptionId) => {
      if (result.error) {
        showError(result.error)
        return
      }

      // Remove from cache optimistically
      removeQueries([...prescriptionKeys.detail(prescriptionId)])

      // Update list cache by removing the deleted item
        const optimisticUpdater = createOptimisticUpdater<Prescription>([...prescriptionKeys.lists()])
      queryClient.setQueriesData({ queryKey: prescriptionKeys.lists() }, optimisticUpdater.remove(prescriptionId))

      // Invalidate related queries
      invalidateQueries([...prescriptionKeys.all])

      showSuccess("Prescription deleted successfully")
    },
    onError: (error: Error) => {
      showError(error.message || "Failed to delete prescription")
    },
  })
}

// Hook to fill a prescription (business logic)
export function useFillPrescription() {
  const updateStatusMutation = useUpdatePrescriptionStatus()

  return useMutation({
    mutationFn: async ({
      id,
      items,
    }: {
      id: string
      items: { id: string; quantity_dispensed: number }[]
    }) => {
      // This would typically involve updating inventory as well
      // For now, we'll just update the status to 'filled'
      return updateStatusMutation.mutateAsync({ id, status: "filled" })
    },
    ...DEFAULT_MUTATION_CONFIG,
  })
}

// Hook to partially fill a prescription
export function usePartiallyFillPrescription() {
  const updateStatusMutation = useUpdatePrescriptionStatus()

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      return updateStatusMutation.mutateAsync({ id, status: "partially_filled" })
    },
    ...DEFAULT_MUTATION_CONFIG,
  })
}

// Hook to cancel a prescription
export function useCancelPrescription() {
  const updateStatusMutation = useUpdatePrescriptionStatus()

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      return updateStatusMutation.mutateAsync({ id, status: "cancelled" })
    },
    ...DEFAULT_MUTATION_CONFIG,
  })
}

export type { PrescriptionsFilters } from "@/features/prescriptions/api-client"
