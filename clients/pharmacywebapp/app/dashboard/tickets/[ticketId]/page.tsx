"use client"

import { useParams, useSearchParams } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { TicketDetailPanel } from "@/features/tickets/components/ticket-detail-panel"

/**
 * Deep-linkable full-page ticket view. All logic lives in TicketDetailPanel (shared with the
 * master-detail pane on the list pages). `?scope=all-tenants` = SuperAdmin cross-tenant, read-only.
 */
export default function TicketDetailPage() {
  const params = useParams<{ ticketId: string }>()
  const crossTenant = useSearchParams().get("scope") === "all-tenants"

  return (
    <DashboardLayout>
      <TicketDetailPanel key={params.ticketId} ticketId={params.ticketId} crossTenant={crossTenant} variant="page" />
    </DashboardLayout>
  )
}
