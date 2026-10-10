"use client"

import { useCallback } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

/**
 * Tab state kept in the `?tab=` search param, so a tab can be linked to, survives a refresh and
 * steps with browser back/forward. Unknown values fall back to the first tab.
 */
export function useTabParam<T extends string>(tabs: readonly T[]): [T, (tab: string) => void] {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const raw = searchParams.get("tab")
  const active = tabs.find((t) => t === raw) ?? tabs[0]

  const setActive = useCallback(
    (tab: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (tab === tabs[0]) params.delete("tab")
      else params.set("tab", tab)
      const query = params.toString()
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams, tabs],
  )

  return [active, setActive]
}
