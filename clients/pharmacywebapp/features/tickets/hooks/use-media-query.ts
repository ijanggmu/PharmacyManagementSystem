"use client"

import { useCallback, useSyncExternalStore } from "react"

/**
 * Live `matchMedia` result. Returns `null` during SSR / before hydration so callers can avoid
 * rendering the wrong layout (e.g. a Sheet flashing open on desktop) on the first paint.
 */
export function useMediaQuery(query: string): boolean | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    [query],
  )
  return useSyncExternalStore<boolean | null>(
    subscribe,
    () => window.matchMedia(query).matches,
    () => null,
  )
}
