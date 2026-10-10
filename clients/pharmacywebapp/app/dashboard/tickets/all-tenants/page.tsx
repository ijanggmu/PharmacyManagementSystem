"use client"

import { Suspense } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { TicketListSkeleton } from "@/features/tickets/components/ticket-listbox"
import { TicketsWorkspace } from "@/features/tickets/components/tickets-workspace"

/**
 * SuperAdmin-only: support tickets across every tenant. Separate route from /dashboard/tickets
 * (that page is the tenant-scoped "my pharmacy's tickets" view backed by GET /tickets) — this one
 * is backed by GET /tickets/all-tenants (ListTicketsAcrossTenantsQuery), gated on
 * Permissions.Tickets.ViewCrossTenant, and shows the owning tenant per row. The detail pane opens
 * read-only (workflow endpoints are tenant-scoped).
 */
export default function AllTenantsTicketsPage() {
  return (
    <DashboardLayout>
      <Suspense fallback={<TicketListSkeleton showTenant />}>
        <TicketsWorkspace scope="all-tenants" />
      </Suspense>
    </DashboardLayout>
  )
}
