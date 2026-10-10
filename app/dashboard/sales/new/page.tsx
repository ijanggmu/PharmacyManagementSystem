"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import EnhancedNewSaleForm from "@/features/sales/components/enhanced-new-sale-form"
import Link from "next/link"
import { Building2, History, ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { NewSaleFormProps } from "@/features/sales/types"
import { PageContainer, PageHeader } from "@/components/layouts"
import { customersApi } from "@/features/customers/api-client"
import { medicinesApi } from "@/features/medicines/api-client"
import { prescriptionsApi } from "@/features/prescriptions/api-client"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { useBranchAccess } from "@/features/branches/hooks/use-branch-access"

export default function NewSalePage() {
  const [currentUser, setCurrentUser] = useState<NewSaleFormProps["currentUser"]>(null)
  const [customers, setCustomers] = useState<NewSaleFormProps["customers"]>([])
  const [medicines, setMedicines] = useState<NewSaleFormProps["medicines"]>([])
  const [prescriptions, setPrescriptions] = useState<NewSaleFormProps["prescriptions"]>([])
  const [isLoading, setIsLoading] = useState(true)
  // Sales are recorded at the branch the cashier works in, so name it where the sale is made.
  const { ownBranch } = useBranchAccess()

  useEffect(() => {
    const load = async () => {
      const sessionRes = await fetch("/api/dotnet/auth/session", { cache: "no-store" })
      if (!sessionRes.ok) {
        window.location.href = "/?auth=signin"
        return
      }
      const sessionBody = await sessionRes.json()
      setCurrentUser(sessionBody?.user ?? null)

      const [customersResult, medicinesResult, prescriptionsResult] = await Promise.all([
        customersApi.getCustomers({ limit: 2000, sortBy: "first_name", sortOrder: "asc" }),
        medicinesApi.getMedicines({ limit: 2000, sortBy: "name", sortOrder: "asc" }),
        prescriptionsApi.getPrescriptions({
          // Include partially_filled so a prescription with remaining unDispensed
          // items can still be selected for a follow-up sale, not just brand-new ones.
          statuses: ["pending", "partially_filled"],
          limit: 2000,
          sortBy: "created_at",
          sortOrder: "desc",
        }),
      ])
      setCustomers(customersResult.data || [])
      setMedicines((medicinesResult.data || []).filter((m) => m.stock_quantity > 0))
      setPrescriptions(prescriptionsResult.data || [])
      setIsLoading(false)
    }
    load()
  }, [])

  return (
    <DashboardLayout>
      <PageContainer>
        {/* Focused workspace: title and one escape hatch, no breadcrumb or intro copy. */}
        <PageHeader
          title="Point of sale"
          icon={ShoppingCart}
          className="mb-3 sm:mb-4"
          badge={
            ownBranch ? (
              <Badge variant="outline" className="gap-1.5" title="Sales on this screen are recorded at this branch">
                <Building2 className="size-3.5" aria-hidden />
                <span className="sr-only">Selling from </span>
                {ownBranch.name}
                <span className="font-mono text-[11px] text-muted-foreground">{ownBranch.code}</span>
              </Badge>
            ) : undefined
          }
          actions={
            <Button asChild variant="ghost" size="sm" className="min-h-10 text-muted-foreground">
              <Link href="/dashboard/sales">
                <History className="h-4 w-4" aria-hidden />
                Sales history
              </Link>
            </Button>
          }
        />

        {isLoading ? (
          <PosSkeleton />
        ) : (
          <EnhancedNewSaleForm
            customers={customers}
            medicines={medicines}
            prescriptions={prescriptions}
            currentUser={currentUser}
          />
        )}
      </PageContainer>
    </DashboardLayout>
  )
}

function PosSkeleton() {
  return (
    <div role="status" aria-live="polite" className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px]">
      <span className="sr-only">Loading point of sale…</span>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 rounded-xl border bg-card p-3 shadow-xs sm:grid-cols-2">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
        <div className="space-y-4 rounded-xl border bg-card p-4 shadow-xs">
          <Skeleton className="h-12 w-full" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
      <div className="hidden space-y-3 rounded-xl border bg-card p-4 shadow-xs lg:block">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    </div>
  )
}
