"use client"

import { useQuery } from "@tanstack/react-query"
import { usersApi } from "@/features/users/api-client"

interface CurrentUserProfile {
  id: string
  full_name: string
  email: string
}

/** The signed-in user's display profile, for "Processed by" fields. */
export function useCurrentUserProfile(enabled = true): CurrentUserProfile | null {
  const { data } = useQuery({
    queryKey: ["returns", "current-user-profile"],
    queryFn: async () => {
      const res = await fetch("/api/dotnet/auth/session", { cache: "no-store" })
      if (!res.ok) return null
      const body = await res.json()
      const userId = body?.user?.id as string | undefined
      if (!userId) return null
      const { data: user } = await usersApi.getUser(userId)
      return (user as CurrentUserProfile | null) ?? null
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  })
  return data ?? null
}
