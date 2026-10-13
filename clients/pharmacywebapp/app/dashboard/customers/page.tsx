"use client"

import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import CustomerTable from "@/features/customers/components/customer-table"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { UserPlus, Users, UserCheck, UserX, Calendar, FileUp } from "lucide-react"
import { CustomerImportDialog } from "@/features/imports/components/import-dialogs"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { useCustomers } from "@/features/customers/hooks/use-customers"
import { CUSTOMERS_MAX_PAGE_SIZE } from "@/lib/api/customers-api"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { SkeletonTable } from "@/components/ui/skeleton"
import { useI18n, useTranslations } from "@/lib/i18n/i18n-provider"

export default function CustomersPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [shouldOpenCreateModal, setShouldOpenCreateModal] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const t = useTranslations("customers")
  const { formatNumber } = useI18n()

  // Customer figures come from the server totals (one row per request), not from the length of a page.
  const { data: allCustomersResponse, isLoading: allLoading } = useCustomers({ limit: 1 })
  const { data: activeCustomersResponse, isLoading: activeLoading } = useCustomers({ activity: "active", limit: 1 })
  const { data: inactiveCustomersResponse, isLoading: inactiveLoading } = useCustomers({ activity: "inactive", limit: 1 })
  // Newest first, one full page: enough to count this month's sign-ups (shown as "200+" past the cap).
  const { data: newestCustomersResponse, isLoading: newestLoading } = useCustomers({
    sortBy: "created",
    sortOrder: "desc",
    limit: CUSTOMERS_MAX_PAGE_SIZE,
  })

  const totalCustomers = allCustomersResponse?.total ?? 0
  const activeCustomers = activeCustomersResponse?.total ?? 0
  const inactiveCustomers = inactiveCustomersResponse?.total ?? 0

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const newestCustomers = newestCustomersResponse?.data ?? []
  const newCustomersThisMonth = newestCustomers.filter((customer) => new Date(customer.created_at) >= monthStart).length
  const newCustomersLabel =
    newCustomersThisMonth >= CUSTOMERS_MAX_PAGE_SIZE ? `${formatNumber(CUSTOMERS_MAX_PAGE_SIZE)}+` : formatNumber(newCustomersThisMonth)

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

  // Check for action query parameter to open create modal
  useEffect(() => {
    const action = searchParams.get("action")
    if (action === "create") {
      setShouldOpenCreateModal(true)
      // Remove query parameter from URL without reload
      router.replace("/dashboard/customers", { scroll: false })
    }
  }, [searchParams, router])

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title={t("title")}
          icon={Users}
          description={t("list.description")}
          actions={
            <>
              <Button variant="outline" onClick={() => setImportOpen(true)} disabled={isLoading}>
                <FileUp aria-hidden />
                {t("list.import")}
              </Button>
              <Button onClick={() => setShouldOpenCreateModal(true)} disabled={isLoading}>
                <UserPlus aria-hidden />
                {t("list.addCustomer")}
              </Button>
            </>
          }
        />

        <Section spacing="lg">
          <h2 className="sr-only">{t("list.figures")}</h2>
          <StatGrid cols={4}>
            <StatCard
              label={t("list.totalCustomers")}
              value={formatNumber(totalCustomers)}
              hint={t("list.totalHint")}
              icon={Users}
              tone="primary"
              loading={isLoading || allLoading}
            />
            <StatCard
              label={t("list.active")}
              value={formatNumber(activeCustomers)}
              hint={t("list.activeHint")}
              icon={UserCheck}
              tone="success"
              loading={isLoading || activeLoading}
            />
            <StatCard
              label={t("list.newThisMonth")}
              value={newCustomersLabel}
              hint={t("list.newThisMonthHint")}
              icon={Calendar}
              tone="info"
              loading={isLoading || newestLoading}
            />
            <StatCard
              label={t("list.inactive")}
              value={formatNumber(inactiveCustomers)}
              hint={t("list.inactiveHint")}
              icon={UserX}
              loading={isLoading || inactiveLoading}
            />
          </StatGrid>
        </Section>

        <Section spacing="lg">
          <Card className="shadow-none">
            <CardContent>
              {isLoading ? (
                <SkeletonTable rows={6} cols={6} />
              ) : (
                <CustomerTable
                  openCreateModal={shouldOpenCreateModal}
                  onCreateModalClose={() => setShouldOpenCreateModal(false)}
                />
              )}
            </CardContent>
          </Card>
        </Section>
      </PageContainer>
      <CustomerImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </DashboardLayout>
  )
}
