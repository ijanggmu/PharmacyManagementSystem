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
import { useI18n, useTranslations } from "@/lib/i18n/i18n-provider"

export default function SuppliersPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [importOpen, setImportOpen] = useState(false)
  const t = useTranslations("suppliers")
  const { formatNumber } = useI18n()

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
          title={t("title")}
          description={t("list.description")}
          icon={Truck}
          actions={
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <FileUp aria-hidden />
              {t("list.import")}
            </Button>
          }
        />

        <Section spacing="lg">
          <StatGrid cols={3}>
            <StatCard
              label={t("list.totalSuppliers")}
              value={<span className="num">{formatNumber(totalSuppliers)}</span>}
              hint={t("list.totalHint")}
              icon={Users}
              tone="primary"
              loading={isLoading || allLoading}
            />
            <StatCard
              label={t("list.active")}
              value={<span className="num">{formatNumber(activeSuppliers)}</span>}
              hint={
                totalSuppliers > activeSuppliers
                  ? t("list.inactiveCount", { count: formatNumber(totalSuppliers - activeSuppliers) })
                  : t("list.allActive")
              }
              icon={CheckCircle2}
              tone="success"
              loading={isLoading || activeLoading}
            />
            <StatCard
              label={t("list.incompleteProfiles")}
              value={<span className="num">{formatNumber(incompleteSuppliers)}</span>}
              hint={
                incompleteSuppliers > 0
                  ? t("list.incompleteHint")
                  : t("list.completeHint")
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
              <CardTitle>{t("list.allSuppliers")}</CardTitle>
              <CardDescription>
                {t("list.allSuppliersDescription")}
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
