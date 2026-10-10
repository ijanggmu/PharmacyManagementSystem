import { useMutation, useQueryClient } from "@tanstack/react-query"
import { usersApi } from "@/features/users/api-client"
import { userKeys } from "@/features/users/hooks/use-users"

/**
 * Admin reset of another user's two-step verification. Resolves with the API's `{ error }` envelope
 * (like the other users mutations) so the caller decides the toast; refreshes user lists on success.
 */
export function useResetTwoFactor() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (userId: string) => usersApi.resetTwoFactor(userId),
    onSuccess: (result, userId) => {
      if (result.error) return
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: userKeys.detail(userId) })
    },
  })
}
