"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export function useKeyboardShortcut(
  key: string,
  callback: () => void,
  deps: any[] = [],
  options: { shift?: boolean } = {}
) {
  const router = useRouter()
  const requireShift = options.shift ?? false

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if the key combination matches (e.g., Ctrl+K or Cmd+K, or Ctrl+Shift+M)
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === key.toLowerCase() &&
        event.shiftKey === requireShift &&
        !event.altKey
      ) {
        event.preventDefault()
        callback()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [key, callback, requireShift, ...deps])
}

