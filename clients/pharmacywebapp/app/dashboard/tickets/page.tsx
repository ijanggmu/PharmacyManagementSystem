"use client"

import { Suspense } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { TicketListSkeleton } from "@/features/tickets/components/ticket-listbox"
import { TicketsWorkspace } from "@/features/tickets/components/tickets-workspace"

/** Tenant-scoped tickets (GET /tickets, server-paged + keyword search) with an in-place detail pane. */
export default function TicketsPage() {
  return (
    <DashboardLayout>
      <Suspense fallback={<TicketListSkeleton showTenant={false} />}>
        <TicketsWorkspace scope="tenant" />
      </Suspense>
    </DashboardLayout>
  )
}
