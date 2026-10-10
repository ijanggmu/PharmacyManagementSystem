"use client"

import { useCallback, useMemo, useRef } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  applyTicketListPatch,
  buildTicketListSearch,
  parseTicketListParams,
  type TicketListPatch,
  type TicketListUrlState,
} from "@/features/tickets/lib/ticket-list-params"

export interface TicketListUrlControls {
  state: TicketListUrlState
  /** Filters / paging: replaces the history entry (page resets to 1 when a filter changes). */
  update: (patch: TicketListPatch) => void
  /** Opens a ticket. The first open pushes a history entry so browser Back closes the panel. */
  select: (ticketId: string) => void
  /** Closes the panel, popping the entry `select` pushed when that is still the current one. */
  clearSelection: () => void
}

/** Ticket-list state (page, size, filters, selected ticket) kept in the URL. */
export function useTicketListUrl(): TicketListUrlControls {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const state = useMemo(() => parseTicketListParams(searchParams), [searchParams])
  // True while the current history entry is the one `select` pushed for the open panel.
  const pushedSelectionRef = useRef(false)

  const navigate = useCallback(
    (next: TicketListUrlState, mode: "push" | "replace") => {
      const query = buildTicketListSearch(next, searchParams.entries())
      const href = query ? `${pathname}?${query}` : pathname
      if (mode === "push") router.push(href, { scroll: false })
      else router.replace(href, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  const update = useCallback(
    (patch: TicketListPatch) => {
      pushedSelectionRef.current = false
      navigate(applyTicketListPatch(state, patch), "replace")
    },
    [navigate, state],
  )

  const select = useCallback(
    (ticketId: string) => {
      if (state.ticket === ticketId) return
      const opening = state.ticket === null
      navigate(applyTicketListPatch(state, { ticket: ticketId }), opening ? "push" : "replace")
      if (opening) pushedSelectionRef.current = true
    },
    [navigate, state],
  )

  const clearSelection = useCallback(() => {
    if (state.ticket === null) return
    if (pushedSelectionRef.current) {
      pushedSelectionRef.current = false
      router.back()
      return
    }
    navigate(applyTicketListPatch(state, { ticket: null }), "replace")
  }, [navigate, router, state])

  return { state, update, select, clearSelection }
}
