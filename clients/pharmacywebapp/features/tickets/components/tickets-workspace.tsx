"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Globe2, LifeBuoy, Plus, RefreshCw } from "lucide-react"
import { PageContainer, PageHeader } from "@/components/layouts"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { ReportIssueDialog } from "@/components/report-issue-dialog"
import { cn } from "@/lib/utils"
import { canViewAllTickets, canViewTickets, canViewTicketsAcrossTenants, ticketErrorMessage } from "@/lib/api/tickets-api"
import { TicketDetailPanel } from "@/features/tickets/components/ticket-detail-panel"
import { TicketListbox, TicketListSkeleton, ticketRowDomId } from "@/features/tickets/components/ticket-listbox"
import { TicketListToolbar } from "@/features/tickets/components/ticket-list-toolbar"
import { TicketListPagination } from "@/features/tickets/components/ticket-list-pagination"
import { TicketStatChips } from "@/features/tickets/components/ticket-stat-chips"
import { useTicketListUrl } from "@/features/tickets/hooks/use-ticket-list-url"
import { useMediaQuery } from "@/features/tickets/hooks/use-media-query"
import {
  useInvalidateTicketLists,
  useTicketPage,
  useTicketStatusCounts,
  useTicketsCurrentUser,
  type TicketListScope,
} from "@/features/tickets/hooks/use-ticket-list"
import { hasActiveTicketFilters } from "@/features/tickets/lib/ticket-list-params"
import { isPermissionErrorMessage } from "@/features/tickets/lib/ticket-list-utils"

const DESKTOP_QUERY = "(min-width: 1024px)"

interface ScopeCopy {
  title: string
  description: string
  listLabel: string
  searchPlaceholder: string
  deniedTitle: string
  deniedMessage: string
  emptyTitle: string
  emptyDescription: string
  emptyFilteredDescription: string
  /** Suffix after the total, e.g. "12 tickets in your pharmacy". */
  countSuffix: string
}

/**
 * "tenant" = tenant ticket admin (Tickets.ViewAll): every ticket of the pharmacy.
 * "mine" = everyone else: the backend filters GET /tickets to the caller's own reports.
 */
type CopyKey = TicketListScope | "mine"

const COPY: Record<CopyKey, ScopeCopy> = {
  mine: {
    title: "My tickets",
    description: "Issues you've reported, tracked through to resolution.",
    listLabel: "Tickets you reported",
    searchPlaceholder: "Search by title or number",
    deniedTitle: "You don't have access to tickets",
    deniedMessage: "Your account doesn't hold the Tickets.View permission. Ask an administrator to grant it.",
    emptyTitle: "You haven't reported any issues",
    emptyDescription: "If something isn't working, report it here. You'll be able to follow its progress and reply to support.",
    emptyFilteredDescription: "None of your tickets match these filters. Try clearing the search or filters.",
    countSuffix: " reported by you",
  },
  tenant: {
    title: "Tickets",
    description: "Issues reported from your pharmacy, tracked through to resolution.",
    listLabel: "Your pharmacy's tickets",
    searchPlaceholder: "Search by title or number",
    deniedTitle: "You don't have access to tickets",
    deniedMessage: "Your account doesn't hold the Tickets.View permission. Ask an administrator to grant it.",
    emptyTitle: "No tickets yet",
    emptyDescription: "When something needs attention, report it and track progress right here.",
    emptyFilteredDescription: "No tickets match these filters. Try clearing the search or filters.",
    countSuffix: " in your pharmacy",
  },
  "all-tenants": {
    title: "All tenants' tickets",
    description: "SuperAdmin support-desk view: support tickets reported across every pharmacy tenant.",
    listLabel: "Tickets across every tenant",
    searchPlaceholder: "Search by title, number or tenant",
    deniedTitle: "You don't have access to this view",
    deniedMessage: "Your account doesn't hold the Tickets.ViewCrossTenant permission. This view is SuperAdmin-only.",
    emptyTitle: "No tickets yet",
    emptyDescription: "No tenant has reported a support ticket yet.",
    emptyFilteredDescription: "No tickets match these filters. Try clearing the search, tenant, status or priority filter.",
    countSuffix: " across every tenant",
  },
}

/**
 * Master-detail ticket list shared by /dashboard/tickets (tenant) and
 * /dashboard/tickets/all-tenants (SuperAdmin, read-only detail). Page, filters and the selected
 * ticket live in the URL (?page&size&q&status&priority&tenant&ticket).
 */
export function TicketsWorkspace({ scope }: { scope: TicketListScope }) {
  const crossTenant = scope === "all-tenants"
  const idPrefix = crossTenant ? "all-tickets" : "tickets"

  const { state, update, select, clearSelection } = useTicketListUrl()
  const { permissions, userId } = useTicketsCurrentUser()
  // Non-admins get the "My tickets" framing; the list itself is already scoped server-side.
  const copy = COPY[!crossTenant && permissions !== null && !canViewAllTickets(permissions) ? "mine" : scope]
  const invalidate = useInvalidateTicketLists()
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const [reportOpen, setReportOpen] = useState(false)

  const viewDenied = permissions !== null && !(crossTenant ? canViewTicketsAcrossTenants(permissions) : canViewTickets(permissions))

  // Keyword search is server-side on both scopes, so it narrows the whole list (and the counts).
  const serverSearch = state.q
  const serverTenant = crossTenant ? state.tenant : ""
  const pageQuery = useTicketPage(scope, {
    page: state.page,
    pageSize: state.pageSize,
    search: serverSearch,
    status: state.status,
    priority: state.priority,
    tenant: serverTenant,
  })
  const { counts, pending: countsPending } = useTicketStatusCounts(
    scope,
    { search: serverSearch, priority: state.priority, tenant: serverTenant },
    permissions !== null && !viewDenied,
  )

  const data = pageQuery.data
  const loadError = pageQuery.isError ? ticketErrorMessage(pageQuery.error, "We couldn't load tickets") : null
  const permissionDenied = loadError !== null && isPermissionErrorMessage(loadError)
  const hasFilters = hasActiveTicketFilters(state)
  const tickets = useMemo(() => data?.items ?? [], [data])
  const totalCount = data?.totalCount ?? 0

  // A stale ?page beyond the last page (e.g. after filtering elsewhere) snaps back into range.
  useEffect(() => {
    if (!data || pageQuery.isPlaceholderData || data.totalCount === 0) return
    const last = Math.max(1, data.totalPages)
    if (state.page > last) update({ page: last })
  }, [data, pageQuery.isPlaceholderData, state.page, update])

  /* ---------------- selection, focus, Escape ---------------- */

  const selectedId = state.ticket
  const desktopOpen = isDesktop === true && selectedId !== null
  const sheetOpen = isDesktop === false && selectedId !== null
  const [lastSelected, setLastSelected] = useState<string | null>(selectedId)
  const prevSelected = useRef<string | null>(selectedId)

  useEffect(() => {
    if (selectedId) setLastSelected(selectedId)
    const previous = prevSelected.current
    prevSelected.current = selectedId
    // Closed (button, Escape or browser Back): return focus to the row that opened it.
    if (previous && !selectedId) {
      const id = window.requestAnimationFrame(() => document.getElementById(ticketRowDomId(previous))?.focus())
      return () => window.cancelAnimationFrame(id)
    }
  }, [selectedId])

  useEffect(() => {
    if (!desktopOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return
      // Let an open select/menu/dialog consume its own Escape first.
      if (document.querySelector("[data-radix-popper-content-wrapper], [role='dialog'][data-state='open'], [role='alertdialog']")) return
      clearSelection()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [desktopOpen, clearSelection])

  const panelHeadingId = `${idPrefix}-panel-heading`
  const panelTicketId = selectedId ?? lastSelected

  const clearFilters = useCallback(() => update({ q: "", status: null, priority: null, tenant: "" }), [update])

  /* ---------------- render ---------------- */

  let body: React.ReactNode
  if (pageQuery.isPending) {
    body = <TicketListSkeleton rows={Math.min(state.pageSize, 8)} showTenant={crossTenant} />
  } else if (loadError) {
    body = (
      <div className="p-4">
        <ErrorState
          title={permissionDenied ? copy.deniedTitle : "We couldn't load tickets"}
          message={permissionDenied ? copy.deniedMessage : `${loadError} Check your connection and try again.`}
          onRetry={permissionDenied ? undefined : () => void pageQuery.refetch()}
          retrying={pageQuery.isFetching}
          size="compact"
        />
      </div>
    )
  } else if (viewDenied) {
    body = (
      <div className="p-4">
        <ErrorState title={copy.deniedTitle} message={copy.deniedMessage} size="compact" />
      </div>
    )
  } else if (tickets.length === 0) {
    body = (
      <div className="p-4">
        <EmptyState
          icon={crossTenant ? Globe2 : LifeBuoy}
          title={hasFilters ? "No matching tickets" : copy.emptyTitle}
          description={hasFilters ? copy.emptyFilteredDescription : copy.emptyDescription}
          action={
            hasFilters
              ? { label: "Clear filters", onClick: clearFilters }
              : crossTenant
                ? undefined
                : { label: "Report an issue", onClick: () => setReportOpen(true), icon: Plus }
          }
          size="compact"
        />
      </div>
    )
  } else {
    body = (
      <TicketListbox
        tickets={tickets}
        selectedId={selectedId}
        onSelect={select}
        showTenant={crossTenant}
        currentUserId={userId}
        label={copy.listLabel}
        stale={pageQuery.isPlaceholderData}
      />
    )
  }

  const showFooter = !pageQuery.isPending && !loadError && !viewDenied && totalCount > 0

  return (
    <PageContainer>
      <PageHeader
        title={copy.title}
        description={copy.description}
        icon={crossTenant ? Globe2 : LifeBuoy}
        actions={
          crossTenant ? undefined : (
            <Button onClick={() => setReportOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Report an issue
            </Button>
          )
        }
      />

      <div className="space-y-4">
        {!viewDenied && !permissionDenied && (
          <TicketStatChips
            counts={counts}
            pending={countsPending}
            active={state.status}
            onToggle={(status) => update({ status })}
          />
        )}

        <div className={cn("grid gap-4 lg:items-start", desktopOpen && "lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]")}>
          <section
            aria-label={copy.listLabel}
            className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-xs"
          >
            <div className="space-y-3 border-b p-3 sm:p-4">
              <TicketListToolbar
                idPrefix={idPrefix}
                q={state.q}
                status={state.status}
                priority={state.priority}
                tenant={crossTenant ? state.tenant : undefined}
                searchPlaceholder={copy.searchPlaceholder}
                onQueryChange={(q) => update({ q })}
                onStatusChange={(status) => update({ status })}
                onPriorityChange={(priority) => update({ priority })}
                onTenantChange={crossTenant ? (tenant) => update({ tenant }) : undefined}
                hasFilters={hasFilters}
                onClearFilters={clearFilters}
              />
              <div className="flex min-h-5 items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
                {data && !loadError && (
                  <span>
                    <span className="num">{totalCount}</span> ticket{totalCount === 1 ? "" : "s"}
                    {copy.countSuffix}
                  </span>
                )}
                {pageQuery.isFetching && !pageQuery.isPending && (
                  <span className="ml-auto inline-flex items-center gap-1">
                    <RefreshCw className="size-3 animate-spin" aria-hidden />
                    Updating…
                  </span>
                )}
              </div>
            </div>

            {body}

            {showFooter && (
              <div className="border-t p-3 sm:px-4">
                <TicketListPagination
                  idPrefix={idPrefix}
                  page={state.page}
                  pageSize={state.pageSize}
                  totalCount={totalCount}
                  onPageChange={(page) => update({ page })}
                  onPageSizeChange={(pageSize) => update({ pageSize })}
                />
              </div>
            )}
          </section>

          {desktopOpen && selectedId && (
            <aside
              aria-labelledby={panelHeadingId}
              className="flex max-h-[calc(100dvh-8rem)] min-h-96 min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-xs animate-in fade-in-0 slide-in-from-right-2 duration-200 ease-out lg:sticky lg:top-4"
            >
              <TicketDetailPanel
                key={selectedId}
                ticketId={selectedId}
                crossTenant={crossTenant}
                variant="panel"
                headingId={panelHeadingId}
                onChanged={invalidate}
                onClose={clearSelection}
              />
            </aside>
          )}
        </div>
      </div>

      {isDesktop === false && (
        <Sheet
          open={sheetOpen}
          onOpenChange={(open) => {
            if (!open) clearSelection()
          }}
        >
          <SheetContent
            side="right"
            className="w-full gap-0 p-0 sm:max-w-xl [&>button:last-child]:hidden"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <SheetTitle className="sr-only">Ticket details</SheetTitle>
            <SheetDescription className="sr-only">Details, workflow actions and comments for the selected ticket.</SheetDescription>
            {panelTicketId && (
              <TicketDetailPanel
                key={panelTicketId}
                ticketId={panelTicketId}
                crossTenant={crossTenant}
                variant="panel"
                headingId={panelHeadingId}
                onChanged={invalidate}
                onClose={clearSelection}
              />
            )}
          </SheetContent>
        </Sheet>
      )}

      {!crossTenant && (
        <ReportIssueDialog
          open={reportOpen}
          onOpenChange={(open) => {
            setReportOpen(open)
            if (!open) invalidate()
          }}
        />
      )}
    </PageContainer>
  )
}
