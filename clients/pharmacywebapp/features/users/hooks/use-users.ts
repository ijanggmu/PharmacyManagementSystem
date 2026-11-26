import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { usersApi, User, UsersFilters, CreateUserData, UpdateUserData } from "@/features/users/api-client"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"

// Query keys for users
export const userKeys = {
  all: ["users"] as const,
  lists: () => [...userKeys.all, "list"] as const,
  list: (filters: UsersFilters) => [...userKeys.lists(), filters] as const,
  details: () => [...userKeys.all, "detail"] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
}

// Hook to fetch users
export function useUsers(filters: UsersFilters = {}) {
  return useQuery({
    queryKey: userKeys.list(filters),
    queryFn: () => usersApi.getUsers(filters),
    // Keep the current rows on screen while a new search/page loads instead of flashing a skeleton.
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Hook to fetch a single user
export function useUser(id: string) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: () => usersApi.getUser(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Hook to create a user
export function useCreateUser() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const { toast } = useToast()

  return useMutation({
    mutationFn: usersApi.createUser,
    onSuccess: (result) => {
      if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
        return
      }

      // Invalidate and refetch users list; the refresh updates the server-rendered "Staff users" count.
      queryClient.invalidateQueries({ queryKey: userKeys.lists() })
      router.refresh()

      toast({
        title: "Success",
        description: "User created successfully",
      })
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create user",
        variant: "destructive",
      })
    },
  })
}

// Hook to update a user
export function useUpdateUser() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateUserData }) =>
      usersApi.updateUser(id, updates),
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
      queryClient.setQueryData(userKeys.detail(variables.id), result)
      
      // Invalidate and refetch users list
      queryClient.invalidateQueries({ queryKey: userKeys.lists() })
      
      toast({
        title: "Success",
        description: "User updated successfully",
      })
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update user",
        variant: "destructive",
      })
    },
  })
}

// Hook to delete a user
export function useDeleteUser() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: usersApi.deleteUser,
    onSuccess: (result, userId) => {
      if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
        return
      }

      queryClient.removeQueries({ queryKey: userKeys.detail(userId) })
      // Refetch so the row, the total and the "Deleted" filter all agree.
      queryClient.invalidateQueries({ queryKey: userKeys.lists() })

      toast({
        title: "User deleted",
        description: "They can no longer sign in. Their past records keep their name.",
      })
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete user",
        variant: "destructive",
      })
    },
  })
}

/**
 * Admin sets another user's password. Resolves to the error message, or null on success, so the dialog can
 * show it in place instead of a toast.
 */
export function useSetUserPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => usersApi.setPassword(id, password),
  })
}
