"use client"

import { useEffect, useRef } from "react"
import { usePathname, useSearchParams } from "next/navigation"

/** Below this, a navigation feels instant — showing a bar would only add noise. */
const SHOW_DELAY_MS = 120
/** Safety net if a navigation never commits (e.g. a link's onClick cancelled it). */
const MAX_DURATION_MS = 10_000

/**
 * Thin brand-colored bar at the top of the viewport during client navigations.
 * Starts on internal link clicks, completes when the URL commits. Drives the DOM directly
 * (no React state) so it never re-renders the tree it sits above.
 */
export function RouteProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const barRef = useRef<HTMLDivElement>(null)
  const timers = useRef<{ show?: number; trickle?: number; max?: number; hide?: number }>({})
  const progress = useRef(0)
  const active = useRef(false)

  const clearTimers = () => {
    const t = timers.current
    window.clearTimeout(t.show)
    window.clearInterval(t.trickle)
    window.clearTimeout(t.max)
    window.clearTimeout(t.hide)
    timers.current = {}
  }

  const setWidth = (value: number) => {
    progress.current = value
    const bar = barRef.current
    if (bar) bar.style.transform = `scaleX(${value})`
  }

  const finish = () => {
    if (!active.current) return
    active.current = false
    const bar = barRef.current
    const wasVisible = bar?.style.opacity === "1"
    clearTimers()
    if (!bar || !wasVisible) {
      setWidth(0)
      return
    }
    setWidth(1)
    timers.current.hide = window.setTimeout(() => {
      bar.style.opacity = "0"
      timers.current.hide = window.setTimeout(() => {
        bar.style.transition = "none"
        setWidth(0)
        void bar.offsetWidth
        bar.style.transition = ""
      }, 220)
    }, 160)
  }

  const start = () => {
    clearTimers()
    active.current = true
    setWidth(0)
    timers.current.show = window.setTimeout(() => {
      const bar = barRef.current
      if (!bar || !active.current) return
      bar.style.opacity = "1"
      setWidth(0.25)
      // Ease toward 90% — each tick covers a fraction of the remaining distance.
      timers.current.trickle = window.setInterval(() => {
        setWidth(progress.current + (0.9 - progress.current) * 0.08)
      }, 200)
    }, SHOW_DELAY_MS)
    timers.current.max = window.setTimeout(finish, MAX_DURATION_MS)
  }

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!anchor || anchor.hasAttribute("download")) return
      if (anchor.target && anchor.target !== "_self") return
      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      start()
    }
    // Capture phase: Next's <Link> calls preventDefault during bubbling.
    document.addEventListener("click", onClick, true)
    window.addEventListener("popstate", start)
    return () => {
      document.removeEventListener("click", onClick, true)
      window.removeEventListener("popstate", start)
      clearTimers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // URL committed → navigation done.
  useEffect(() => {
    finish()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams])

  return (
    // A dialog opened from the URL (e.g. ?auth=signin) marks its siblings data-aria-hidden before hydration.
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[2px]" aria-hidden suppressHydrationWarning>
      <div
        ref={barRef}
        className="h-full origin-left bg-primary opacity-0 shadow-[0_0_8px_var(--primary)] transition-[transform,opacity] duration-200 ease-out"
        style={{ transform: "scaleX(0)" }}
      />
    </div>
  )
}
