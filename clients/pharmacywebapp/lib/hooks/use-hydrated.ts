"use client"

import { useSyncExternalStore } from "react"

const subscribe = () => () => {}

/**
 * False during the server render and the hydration render, true afterwards. Use it to keep data the client may
 * already hold (React Query results that arrived while a Suspense boundary was still streaming) out of the first
 * client render, so it matches the server's HTML instead of failing hydration.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
}
