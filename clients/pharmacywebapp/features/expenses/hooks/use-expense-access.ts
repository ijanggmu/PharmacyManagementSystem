"use client"

import { useQuery } from "@tanstack/react-query"
import { loadDotnetCurrentUser } from "@/lib/api/auth-api"
import { expenseAccess, type ExpenseAccess } from "@/lib/api/dotnet-permissions"
import { currentUserQueryKey } from "@/features/branches/hooks/use-branch-access"
import { useHydrated } from "@/lib/hooks/use-hydrated"

/**
 * The signed-in user's expense permissions (Record / Update / Delete), from the cached current-user query.
 * Every action is false until the user loads (and during the hydration render, which must match the server's
 * HTML), so buttons appear rather than flash and vanish. The API still decides.
 */
export function useExpenseAccess(): ExpenseAccess & { isLoading: boolean } {
  const hydrated = useHydrated()
  const user = useQuery({
    queryKey: currentUserQueryKey,
    queryFn: () => loadDotnetCurrentUser(),
    staleTime: 5 * 60 * 1000,
  })
  const granted = hydrated ? (user.data?.info.permissions ?? []) : []
  return { ...expenseAccess(granted), isLoading: !hydrated || user.isLoading }
}
