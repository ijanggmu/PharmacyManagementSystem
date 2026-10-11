import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { customersApi, Customer, CustomersFilters } from "@/features/customers/api-client"
import { useToast } from "@/hooks/use-toast"

// Query keys for customers
export const customerKeys = {
  all: ["customers"] as const,
  lists: () => [...customerKeys.all, "list"] as const,
  list: (filters: CustomersFilters) => [...customerKeys.lists(), filters] as const,
  details: () => [...customerKeys.all, "detail"] as const,
  detail: (id: string) => [...customerKeys.details(), id] as const,
}

// Hook to fetch customers
export function useCustomers(filters: CustomersFilters = {}) {
  return useQuery({
    queryKey: customerKeys.list(filters),
    queryFn: () => customersApi.getCustomers(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Hook to fetch a single customer
export function useCustomer(id: string) {
  return useQuery({
    queryKey: customerKeys.detail(id),
    queryFn: () => customersApi.getCustomer(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Hook to create a customer
export function useCreateCustomer() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: customersApi.createCustomer,
    onSuccess: (result) => {
      if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
        return
      }

      // Invalidate and refetch customers list
      queryClient.invalidateQueries({ queryKey: customerKeys.lists() })
      
      toast({
        title: "Success",
        description: "Customer created successfully",
      })
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create customer",
        variant: "destructive",
      })
    },
  })
}

// Hook to update a customer
export function useUpdateCustomer() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Customer> }) =>
      customersApi.updateCustomer(id, updates),
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
      queryClient.setQueryData(customerKeys.detail(variables.id), result)
      
      // Invalidate and refetch customers list
      queryClient.invalidateQueries({ queryKey: customerKeys.lists() })
      
      toast({
        title: "Success",
        description: "Customer updated successfully",
      })
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update customer",
        variant: "destructive",
      })
    },
  })
}

// Hook to delete a customer
export function useDeleteCustomer() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: customersApi.deleteCustomer,
    onSuccess: (result, customerId) => {
      if (result.error) {
        toast({
          title: "Couldn't delete customer",
          description: result.error,
          variant: "destructive",
        })
        return
      }

      // Remove from cache optimistically
      queryClient.removeQueries({ queryKey: customerKeys.detail(customerId) })
      
      // Update customers list cache by removing the deleted item
      queryClient.setQueriesData(
        { queryKey: customerKeys.lists() },
        (oldData: any) => {
          if (!oldData?.data) return oldData
          return {
            ...oldData,
            data: oldData.data.filter((customer: Customer) => customer.id !== customerId)
          }
        }
      )
      
      toast({
        title: "Success",
        description: "Customer deleted successfully",
      })
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete customer",
        variant: "destructive",
      })
    },
  })
}
