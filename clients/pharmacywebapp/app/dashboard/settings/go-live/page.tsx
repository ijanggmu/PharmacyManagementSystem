"use client"

import { Lock, Rocket } from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader } from "@/components/layouts"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useOpeningBalancePermissions } from "@/features/accounting/hooks/use-opening-balances"
import { GoLiveSetup } from "@/features/go-live/components/go-live-setup"

/** Go-live setup: a pharmacy's first-day data (suppliers, customers, stock, cash & bank) from one Excel file. */
export default function GoLiveSetupPage() {
  const permissions = useOpeningBalancePermissions()
  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Go-live setup"
          icon={Rocket}
          description="Bring in everything you have on your first day — suppliers, customers, medicines and stock, cash and bank — from one Excel file."
        />
        {!permissions.loaded ? (
          <Skeleton className="h-64 w-full" />
        ) : permissions.canManage ? (
          <GoLiveSetup />
        ) : (
          <EmptyState
            icon={Lock}
            title="Only the owner or a manager can do the go-live setup"
            description="It sets opening balances, so it needs permission to manage them."
          />
        )}
      </PageContainer>
    </DashboardLayout>
  )
}
