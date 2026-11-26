"use client"

import { Suspense } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { AlertTriangle, Info } from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { PageTabsBar } from "@/components/ui/page-tabs"
import { ExpiredStockPanel } from "@/features/inventory/components/expired-stock-panel"
import { ExpiringSoonPanel } from "@/features/inventory/components/expiring-soon-panel"
import { ExpiryClaimsPanel } from "@/features/expiry-claims/components/expiry-claims-panel"
import { allowedExpiryTabs, resolveExpiryTab, type ExpiryTab } from "@/features/inventory/lib/expiry-area"
import { useTranslations } from "@/lib/i18n/i18n-provider"
import { useGrantedPermissions } from "@/lib/hooks/use-has-permission"

/**
 * Stock › Expiry: one place for stock that is about to expire, has expired, or is being claimed back from the
 * supplier. The tab lives in `?tab=` (replace, not push, so Back leaves the page rather than walking the tabs).
 * /dashboard/inventory/expired and /dashboard/suppliers/expiry-claims redirect here.
 */
export default function ExpiryPage() {
  const t = useTranslations("expiry")
  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader title={t("title")} icon={AlertTriangle} description={t("description")} />
        <Suspense fallback={<LoadingState text={t("title")} />}>
          <ExpiryTabs />
        </Suspense>
      </PageContainer>
    </DashboardLayout>
  )
}

function ExpiryTabs() {
  const t = useTranslations("expiry")
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { granted, isLoading } = useGrantedPermissions()
  const allowed = allowedExpiryTabs(granted)
  const tab = resolveExpiryTab(searchParams.get("tab"), allowed)

  if (isLoading) return <LoadingState text={t("title")} />
  if (!tab) return <EmptyState icon={AlertTriangle} title={t("title")} description={t("noAccess")} />

  const select = (next: string) => {
    // A tab's own sub-state (e.g. the claims view) doesn't carry over to another tab.
    const params = new URLSearchParams({ tab: next })
    router.replace(`${pathname}?${params}`, { scroll: false })
  }

  return (
    <Section spacing="lg">
      <Tabs value={tab} onValueChange={select}>
        {/* The shared underline strip used by every page-level tab bar (scrolls instead of clipping). */}
        <PageTabsBar sticky items={allowed.map((id) => ({ value: id, label: t(`tabs.${id}`) }))} value={tab} label={t("title")} />
        {allowed.map((id) => (
          <TabsContent key={id} value={id} className="space-y-4">
            <p className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {t(`hints.${id}`)}
            </p>
            {/* Only the open tab mounts, so a tab's lists load when it is first shown. */}
            {tab === id && <TabPanel tab={id} />}
          </TabsContent>
        ))}
      </Tabs>
    </Section>
  )
}

function TabPanel({ tab }: { tab: ExpiryTab }) {
  switch (tab) {
    case "expiring":
      return <ExpiringSoonPanel />
    case "expired":
      return <ExpiredStockPanel />
    case "claims":
      return <ExpiryClaimsPanel />
  }
}
