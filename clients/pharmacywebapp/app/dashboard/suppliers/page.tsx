"use client"

import { useState, useEffect } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import SupplierTable from "@/features/suppliers/components/supplier-table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, CheckCircle2, AlertCircle, Truck, FileUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SupplierImportDialog } from "@/features/imports/components/import-dialogs"
import { useSuppliers } from "@/features/suppliers/hooks/use-suppliers"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { SkeletonTable } from "@/components/ui/skeleton"

export default function SuppliersPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [importOpen, setImportOpen] = useState(false)

  // Supplier figures come from the server totals (one row per request), not from the length of a page.
  const { data: allSuppliersResponse, isLoading: allLoading } = useSuppliers({ limit: 1 })
  const { data: activeSuppliersResponse, isLoading: activeLoading } = useSuppliers({ active: "active", limit: 1 })
  const { data: incompleteSuppliersResponse, isLoading: incompleteLoading } = useSuppliers({ profile: "incomplete", limit: 1 })

  const totalSuppliers = allSuppliersResponse?.total ?? 0
  const activeSuppliers = activeSuppliersResponse?.total ?? 0
  const incompleteSuppliers = incompleteSuppliersResponse?.total ?? 0

  useEffect(() => {
    const checkUser = async () => {
      const res = await fetch("/api/dotnet/auth/session", { cache: "no-store" })
      if (!res.ok) {
        window.location.href = "/?auth=signin"
        return
      }
      setIsLoading(false)
    }
    checkUser()
  }, [])

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Suppliers"
          description="Keep supplier contacts up to date and track what you owe each one."
          icon={Truck}
          actions={
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <FileUp aria-hidden />
              Import
            </Button>
          }
        />

        <Section spacing="lg">
          <StatGrid cols={3}>
            <StatCard
              label="Total suppliers"
              value={<span className="num">{totalSuppliers}</span>}
              hint="All registered suppliers"
              icon={Users}
              tone="primary"
              loading={isLoading || allLoading}
            />
            <StatCard
              label="Active"
              value={<span className="num">{activeSuppliers}</span>}
              hint={totalSuppliers > activeSuppliers ? `${totalSuppliers - activeSuppliers} inactive` : "All suppliers are active"}
              icon={CheckCircle2}
              tone="success"
              loading={isLoading || activeLoading}
            />
            <StatCard
              label="Incomplete profiles"
              value={<span className="num">{incompleteSuppliers}</span>}
              hint={
                incompleteSuppliers > 0
                  ? "Missing contact person, phone or email. Edit to complete"
                  : "All suppliers have full contact details"
              }
              icon={AlertCircle}
              tone={incompleteSuppliers > 0 ? "warning" : "default"}
              loading={isLoading || incompleteLoading}
            />
          </StatGrid>
        </Section>

        <Section spacing="lg">
          <Card>
            <CardHeader>
              <CardTitle>All suppliers</CardTitle>
              <CardDescription>
                Click a supplier to see contact details, balances, medicines, cost history and returns.
              </CardDescription>
            </CardHeader>
            <CardContent>{isLoading ? <SkeletonTable rows={6} cols={6} /> : <SupplierTable />}</CardContent>
          </Card>
        </Section>
      </PageContainer>
      <SupplierImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </DashboardLayout>
  )
}
