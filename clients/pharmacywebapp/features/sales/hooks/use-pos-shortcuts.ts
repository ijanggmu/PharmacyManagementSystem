"use client"

import { useEffect, useRef } from "react"
import { isTypingElement, resolvePosShortcut, type PosShortcutAction } from "@/features/sales/lib/pos-shortcuts"

/** True while a modal dialog, sheet or open popover is on screen (Radix marks them with data-state="open"). */
function anyDialogOpen(): boolean {
  if (typeof document === "undefined") return false
  return document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]') !== null
}

/**
 * Wires the POS shortcut map (features/sales/lib/pos-shortcuts.ts) to the window. `handlers` may change on every
 * render; the listener always calls the latest ones. `enabled` turns the whole map off (e.g. while loading).
 */
export function usePosShortcuts(handlers: Partial<Record<PosShortcutAction, () => void>>, enabled = true): void {
  const latest = useRef(handlers)
  latest.current = handlers

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      const action = resolvePosShortcut(event, { typing: isTypingElement(event.target), dialogOpen: anyDialogOpen() })
      if (!action) return
      const handler = latest.current[action]
      if (!handler) return
      event.preventDefault()
      handler()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [enabled])
}
