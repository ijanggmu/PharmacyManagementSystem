"use client"

import { useCallback } from "react"
import { keepPreviousData, useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  listTickets,
  listTicketsAcrossTenants,
  type DotnetPagedResponse,
  type DotnetTicketDto,
  type IssueSeverity,
  type TicketStatus,
} from "@/lib/api/tickets-api"
import { loadDotnetCurrentUser } from "@/lib/api/auth-api"
import { TICKET_STATUSES } from "@/features/tickets/lib/ticket-list-params"

export type TicketListScope = "tenant" | "all-tenants"

export interface TicketListQuery {
  page: number
  pageSize: number
  /** Server-side keyword (both endpoints filter the whole result set before paging). */
  search: string
  status: TicketStatus | null
  priority: IssueSeverity | null
  /** Exact tenant id — only the all-tenants endpoint supports it. */
  tenant: string
}

const ROOT_KEY = "tickets-list"
const STALE_MS = 30_000

function fetchPage(scope: TicketListScope, q: TicketListQuery): Promise<DotnetPagedResponse<DotnetTicketDto>> {
  if (scope === "tenant") {
    return listTickets({
      pageNumber: q.page,
      pageSize: q.pageSize,
      search: q.search || undefined,
      status: q.status ?? undefined,
      priority: q.priority ?? undefined,
    })
  }
  return listTicketsAcrossTenants({
    pageNumber: q.page,
    pageSize: q.pageSize,
    tenantId: q.tenant || undefined,
    search: q.search || undefined,
    status: q.status ?? undefined,
    priority: q.priority ?? undefined,
  })
}

/** One server page of tickets. Keeps the previous page on screen while the next one loads. */
export function useTicketPage(scope: TicketListScope, query: TicketListQuery) {
  return useQuery({
    queryKey: [ROOT_KEY, scope, "page", query],
    queryFn: () => fetchPage(scope, query),
    placeholderData: keepPreviousData,
    staleTime: STALE_MS,
    retry: false,
  })
}

/**
 * Per-status totals for the stat chips: one `pageSize=1` request per status, reading only
 * `totalCount`. Honours every filter except status. Returns null unless all four succeeded, so
 * the UI never shows partial or guessed numbers.
 */
export function useTicketStatusCounts(scope: TicketListScope, query: Omit<TicketListQuery, "page" | "pageSize" | "status">, enabled: boolean) {
  const results = useQueries({
    queries: TICKET_STATUSES.map((status) => ({
      queryKey: [ROOT_KEY, scope, "count", status, query],
      queryFn: () => fetchPage(scope, { ...query, status, page: 1, pageSize: 1 }),
      placeholderData: keepPreviousData,
      staleTime: STALE_MS,
      retry: false,
      enabled,
    })),
  })
  const pending = enabled && results.some((r) => r.isPending && !r.isError)
  if (!enabled || results.some((r) => r.data === undefined || r.isError)) return { counts: null, pending }
  const counts = {} as Record<TicketStatus, number>
  TICKET_STATUSES.forEach((status, i) => {
    counts[status] = results[i]?.data?.totalCount ?? 0
  })
  return { counts, pending: false }
}

/** Invalidates every ticket list/count query (call after a mutation or a new report). */
export function useInvalidateTicketLists() {
  const queryClient = useQueryClient()
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [ROOT_KEY] })
  }, [queryClient])
}

/** Signed-in user's id + permission claims; `permissions` is null until known. */
export function useTicketsCurrentUser() {
  const query = useQuery({
    queryKey: [ROOT_KEY, "current-user"],
    queryFn: () => loadDotnetCurrentUser(),
    staleTime: 5 * 60_000,
    retry: false,
  })
  const permissions: string[] | null = query.isPending ? null : (query.data?.info.permissions ?? [])
  return { permissions, userId: query.data?.id ?? null }
}
