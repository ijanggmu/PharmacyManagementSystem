"use client"

import { useQuery } from "@tanstack/react-query"

import { loadDotnetCurrentUser } from "@/lib/api/auth-api"
import { isDotnetRootUser } from "@/lib/api/dotnet-permissions"
import { currentUserQueryKey } from "@/features/branches/hooks/use-branch-access"
import { useHydrated } from "@/lib/hooks/use-hydrated"

/**
 * Whether the signed-in user holds a .NET permission (e.g. "Permissions.Suppliers.Suppliers.View"), from the cached
 * current-user query. Use it to skip loading a widget the API would refuse with 403; the API still decides.
 * `allowed` is false while loading, so a gated query simply starts once the user is known. It is also false (and
 * `isLoading` true) during the server and hydration renders: the server has no cached user, so a client that
 * already holds one would otherwise render a different tree and fail hydration.
 */
export function useHasPermission(permission: string): { allowed: boolean; isLoading: boolean } {
  const hydrated = useHydrated()
  const user = useQuery({
    queryKey: currentUserQueryKey,
    queryFn: () => loadDotnetCurrentUser(),
    staleTime: 5 * 60 * 1000,
  })
  const granted = hydrated ? (user.data?.info.permissions ?? []) : []
  return { allowed: isDotnetRootUser(granted) || granted.includes(permission), isLoading: !hydrated || user.isLoading }
}
