"use client"

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import DashboardLayout from "@/components/dashboard-layout"
import EnhancedNewSaleForm from "@/features/sales/components/enhanced-new-sale-form"
import Link from "next/link"
import { Building2, History, ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { NewSaleFormProps } from "@/features/sales/types"
import { PageContainer, PageHeader } from "@/components/layouts"
import { medicinesApi } from "@/features/medicines/api-client"
import { prescriptionsApi } from "@/features/prescriptions/api-client"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { useBranchAccess } from "@/features/branches/hooks/use-branch-access"
import { posMedicinesQueryKey, posPrescriptionsQueryKey, toPosMedicines } from "@/features/sales/lib/pos-data"

/** Customers are searched server-side by the form (active only); nothing is preloaded. */
const NO_PRELOADED_CUSTOMERS: NewSaleFormProps["customers"] = []

export default function NewSalePage() {
  const [currentUser, setCurrentUser] = useState<NewSaleFormProps["currentUser"]>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  // Sales are recorded at the branch the cashier works in, so name it where the sale is made.
  const { ownBranch, ownBranchId, isLoading: branchLoading } = useBranchAccess()

  useEffect(() => {
    const load = async () => {
      const sessionRes = await fetch("/api/dotnet/auth/session", { cache: "no-store" })
      if (!sessionRes.ok) {
        window.location.href = "/?auth=signin"
        return
      }
      const sessionBody = await sessionRes.json()
      setCurrentUser(sessionBody?.user ?? null)
      setSessionLoaded(true)
    }
    void load()
  }, [])

  // The sale is attributed to the cashier's branch, and the server prices and deducts from that branch's
  // lots — so the catalog (stock and FEFO lot prices) is scoped to the same branch. React Query, keyed by
  // branch under "medicines": every sale (online, queued, synced) invalidates it, so the till never sells
  // from a stale catalog.
  const medicinesQuery = useQuery({
    queryKey: posMedicinesQueryKey(ownBranchId),
    enabled: !branchLoading,
    queryFn: async () => {
      const result = await medicinesApi.getMedicines({
        limit: 2000,
        sortBy: "name",
        sortOrder: "asc",
        branchId: ownBranchId ?? undefined,
      })
      if (result.error) throw new Error(result.error)
      // Sell only what this branch can actually sell (not recalled/expired) — never the tenant-wide total.
      return toPosMedicines(result.data || []) as unknown as NewSaleFormProps["medicines"]
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })

  const prescriptionsQuery = useQuery({
    queryKey: posPrescriptionsQueryKey(ownBranchId),
    enabled: !branchLoading,
    queryFn: async () => {
      const result = await prescriptionsApi.getPrescriptions({
        // Include partially_filled so a prescription with remaining unDispensed
        // items can still be selected for a follow-up sale, not just brand-new ones.
        statuses: ["pending", "partially_filled"],
        limit: 2000,
        sortBy: "created_at",
        sortOrder: "desc",
      })
      return (result.data || []) as NewSaleFormProps["prescriptions"]
    },
    staleTime: 30_000,
  })

  const isLoading = !sessionLoaded || medicinesQuery.isLoading || prescriptionsQuery.isLoading
  const medicines = medicinesQuery.data ?? []
  const prescriptions = prescriptionsQuery.data ?? []

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
            customers={NO_PRELOADED_CUSTOMERS}
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
