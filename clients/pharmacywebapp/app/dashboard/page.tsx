import DashboardLayout from "@/components/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import {
  Pill,
  Users,
  FileText,
  Wallet,
  AlertTriangle,
  TrendingUp,
  Clock,
  Package,
  ShoppingCart,
  ArrowRight,
  Home,
  CheckCircle2,
  UserPlus,
  FilePlus2,
  ShieldAlert,
} from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { CurrencyDisplay } from "@/components/currency-display"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import DashboardPrescriptionModal from "@/features/prescriptions/components/dashboard-prescription-modal"
import { getDashboardHomeData, getLicenseAlerts } from "@/lib/server/services/dashboard-page-service"
import { formatNepalDateTime, nepalYmdOf } from "@/lib/utils/nepal-time"
import { getLocalePreferences } from "@/lib/i18n/server"
import { createNamespaceTranslator } from "@/lib/i18n/translate"
import { formatBsDate, formatNumber } from "@/lib/i18n/format"

/** Server-rendered dates use Nepal time — the server's own zone (usually UTC) would shift late sales a day. */
const NEPAL_DATE: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }
import { getDotnetSession } from "@/lib/api/dotnet-server-session"
import { canManageBranches } from "@/lib/api/branches-api"
import { dotnetPermissionAllowed } from "@/lib/api/dotnet-permissions"
import { DefaultBranchPrompt } from "@/features/branches/components/default-branch-prompt"
import { GoLivePrompt } from "@/features/go-live/components/go-live-prompt"
import { BranchScopeLabel } from "@/features/branches/components/branch-filter"
import { OwnerKpiPanel } from "@/features/dashboard/components/owner-kpi-panel"
import { canViewOwnerDashboard } from "@/lib/api/owner-dashboard"


export default async function DashboardPage() {
  const user = (await getDotnetSession())?.user ?? null

  // The middleware handles unauthenticated user redirects
  // This check is still useful for type safety and fallback
  if (!user) {
    return redirect("/?auth=signin")
  }

  // KPIs, low-stock, expiring and recent-sales rows come pre-computed from the service (.NET reports on
  // the dotnet path, Supabase aggregates otherwise).
  const [{ counts, lowStock, expiring, recentSales }, licenseAlerts] = await Promise.all([
    getDashboardHomeData(),
    getLicenseAlerts(),
  ])

  // Language from the preference cookie: Nepali shows BS dates and Nepali digits / grouping.
  const { locale, nepaliDigits } = await getLocalePreferences()
  const t = createNamespaceTranslator(locale, "dashboard")
  const tc = createNamespaceTranslator(locale, "common")
  const num = (n: number) => formatNumber(n, { locale, nepaliDigits })
  /** Nepal calendar day of an instant: BS for Nepali, "11 Oct 2026" for English. */
  const showDate = (iso: string) =>
    locale === "ne" ? formatBsDate(nepalYmdOf(new Date(iso)), { locale, nepaliDigits }) : formatNepalDateTime(iso, NEPAL_DATE)
  const licenseDue = (daysLeft: number) => {
    if (daysLeft < 0) return t(daysLeft === -1 ? "attention.licenseExpiredOne" : "attention.licenseExpiredOther", { count: num(-daysLeft) })
    if (daysLeft === 0) return t("attention.licenseExpiresToday")
    if (daysLeft === 1) return t("attention.licenseExpiresTomorrow")
    return t("attention.licenseExpiresIn", { count: num(daysLeft) })
  }

  const attentionCount =
    (counts.lowStock > 0 ? 1 : 0) +
    (counts.expiring > 0 ? 1 : 0) +
    (counts.pendingPrescriptions > 0 ? 1 : 0) +
    (licenseAlerts.length > 0 ? 1 : 0)

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title={t("header.title")}
          icon={Home}
          description={t("header.description")}
          badge={<BranchScopeLabel />}
          actions={
            <>
              {dotnetPermissionAllowed("inventory:write", user.permissions ?? []) && (
                <Button asChild variant="outline">
                  <Link href="/dashboard/inventory?action=create">
                    <Package aria-hidden />
                    {t("quick.addMedicine")}
                  </Link>
                </Button>
              )}
              <Button asChild title={t("header.openPosTitle")}>
                <Link href="/dashboard/sales/new">
                  <ShoppingCart aria-hidden />
                  {t("quick.newSale")}
                  <kbd className="pointer-events-none ml-1 hidden h-5 select-none items-center rounded border border-primary-foreground/30 bg-primary-foreground/10 px-1.5 font-mono text-[10px] font-medium sm:inline-flex">
                    Ctrl K
                  </kbd>
                </Link>
              </Button>
            </>
          }
        />

        <DefaultBranchPrompt canManage={canManageBranches(user.permissions ?? [])} />
        <GoLivePrompt />

        <Section spacing="lg">
          <h2 className="sr-only">{t("kpi.keyFigures")}</h2>
          <StatGrid cols={6}>
            <StatCard
              label={t("kpi.todayRevenue")}
              value={<CurrencyDisplay amount={counts.todayRevenue} />}
              hint={
                <>
                  {t("kpi.thisMonth")} <CurrencyDisplay amount={counts.monthlyRevenue} className="num" />
                </>
              }
              icon={Wallet}
              tone="primary"
              href="/dashboard/sales"
            />
            <StatCard
              label={t("kpi.pendingPrescriptions")}
              value={num(counts.pendingPrescriptions)}
              hint={counts.pendingPrescriptions > 0 ? t("kpi.awaitingFulfilment") : t("kpi.nothingWaiting")}
              icon={FileText}
              tone={counts.pendingPrescriptions > 0 ? "warning" : "success"}
              href="/dashboard/prescriptions"
            />
            <StatCard
              label={t("kpi.lowStock")}
              value={num(counts.lowStock)}
              hint={counts.lowStock > 0 ? t("kpi.lowStockHint") : t("kpi.allAboveReorder")}
              icon={AlertTriangle}
              tone={counts.lowStock > 0 ? "danger" : "success"}
              href="/dashboard/inventory?stockFilter=low"
            />
            <StatCard
              label={t("kpi.expiringSoon")}
              value={num(counts.expiring)}
              hint={t("kpi.within30Days")}
              icon={Clock}
              tone={counts.expiring > 0 ? "warning" : "success"}
              href="/dashboard/inventory?expiryFilter=expiring"
            />
            <StatCard
              label={t("kpi.medicines")}
              value={num(counts.medicines)}
              hint={t("kpi.activeItems")}
              icon={Pill}
              href="/dashboard/inventory"
            />
            <StatCard
              label={t("kpi.customers")}
              value={num(counts.customers)}
              hint={t("kpi.registeredCustomers")}
              icon={Users}
              href="/dashboard/customers"
            />
          </StatGrid>
        </Section>

        {canViewOwnerDashboard(user.permissions) && (
          <Section spacing="lg">
            <OwnerKpiPanel />
          </Section>
        )}

        <Section spacing="lg">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-heading-3">{t("attention.title")}</h2>
            <p className="text-sm text-muted-foreground">
              {attentionCount === 0
                ? t("attention.nothing")
                : t(attentionCount === 1 ? "attention.areasOne" : "attention.areasOther", { count: num(attentionCount) })}
            </p>
          </div>

          {attentionCount === 0 ? (
            <Card className="border-border/60 shadow-none">
              <EmptyState
                size="compact"
                icon={CheckCircle2}
                title={t("attention.allClear")}
                description={t("attention.allClearDescription")}
                action={{ label: t("quick.newSale"), href: "/dashboard/sales/new", icon: ShoppingCart }}
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {counts.lowStock > 0 && (
                <Card className="border-border/60 shadow-none">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2.5 text-base">
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive"
                        aria-hidden
                      >
                        <AlertTriangle className="h-4 w-4" />
                      </span>
                      {t("attention.lowStockTitle")}
                    </CardTitle>
                    <CardDescription>
                      {t(counts.lowStock === 1 ? "attention.lowStockOne" : "attention.lowStockOther", { count: num(counts.lowStock) })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {/* Empty when the role can't read the reorder report; the count still shows. */}
                    {lowStock.length > 0 && <ul className="space-y-1.5">
                      {lowStock.slice(0, 3).map((medicine) => (
                        <li
                          key={medicine.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5"
                        >
                          <span className="min-w-0 truncate text-sm font-medium text-foreground" title={medicine.name}>
                            {medicine.name}
                          </span>
                          <Badge variant="danger" className="num">
                            {t("attention.left", { count: num(medicine.stockQuantity) })}
                          </Badge>
                        </li>
                      ))}
                    </ul>}
                    <Button variant="outline" size="sm" asChild className="mt-3 w-full">
                      <Link href="/dashboard/inventory?stockFilter=low">
                        {t("attention.viewAllLowStock", { count: num(counts.lowStock) })}
                        <ArrowRight aria-hidden />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              )}

              {counts.expiring > 0 && (
                <Card className="border-border/60 shadow-none">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2.5 text-base">
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10 text-warning"
                        aria-hidden
                      >
                        <Clock className="h-4 w-4" />
                      </span>
                      {t("attention.expiringTitle")}
                    </CardTitle>
                    <CardDescription>
                      {t(counts.expiring === 1 ? "attention.expiringOne" : "attention.expiringOther", { count: num(counts.expiring) })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {expiring.length > 0 && <ul className="space-y-1.5">
                      {expiring.slice(0, 3).map((medicine) => {
                        const daysUntilExpiry = medicine.daysUntilExpiry
                        return (
                          <li
                            key={medicine.id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5"
                          >
                            <div className="min-w-0">
                              <span className="block truncate text-sm font-medium text-foreground" title={medicine.name}>
                                {medicine.name}
                              </span>
                              <span className="num text-xs text-muted-foreground">
                                {t("attention.expires", { date: showDate(medicine.expiry) })}
                              </span>
                            </div>
                            <Badge variant={daysUntilExpiry <= 7 ? "danger" : "warning"} className="num">
                              {daysUntilExpiry <= 0
                                ? t("attention.today")
                                : t(daysUntilExpiry === 1 ? "attention.dayOne" : "attention.dayOther", { count: num(daysUntilExpiry) })}
                            </Badge>
                          </li>
                        )
                      })}
                    </ul>}
                    <Button variant="outline" size="sm" asChild className="mt-3 w-full">
                      <Link href="/dashboard/inventory?expiryFilter=expiring">
                        {t("attention.viewAllExpiring", { count: num(counts.expiring) })}
                        <ArrowRight aria-hidden />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              )}

              {licenseAlerts.length > 0 && (
                <Card className="border-border/60 shadow-none">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2.5 text-base">
                      <span
                        className={
                          licenseAlerts[0].daysLeft < 0
                            ? "flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive"
                            : "flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10 text-warning"
                        }
                        aria-hidden
                      >
                        <ShieldAlert className="h-4 w-4" />
                      </span>
                      {t("attention.licensesTitle")}
                    </CardTitle>
                    <CardDescription>
                      {t(licenseAlerts.length === 1 ? "attention.licensesOne" : "attention.licensesOther", { count: num(licenseAlerts.length) })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1.5">
                      {licenseAlerts.slice(0, 3).map((license) => (
                        <li
                          key={license.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <span className="block truncate text-sm font-medium text-foreground" title={license.label}>
                              {license.label}
                            </span>
                            <span className="num font-mono text-xs text-muted-foreground">{license.number}</span>
                          </div>
                          <Badge variant={license.daysLeft <= 7 ? "danger" : "warning"} className="num shrink-0">
                            {licenseDue(license.daysLeft)}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                    <Button variant="outline" size="sm" asChild className="mt-3 w-full">
                      <Link href="/dashboard/settings?tab=profile#licenses">
                        {t("attention.reviewLicenses")}
                        <ArrowRight aria-hidden />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              )}

              {counts.pendingPrescriptions > 0 && (
                <Card className="border-border/60 shadow-none">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2.5 text-base">
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-info/10 text-info"
                        aria-hidden
                      >
                        <FileText className="h-4 w-4" />
                      </span>
                      {t("attention.prescriptionsTitle")}
                    </CardTitle>
                    <CardDescription>
                      {t(counts.pendingPrescriptions === 1 ? "attention.prescriptionsOne" : "attention.prescriptionsOther", {
                        count: num(counts.pendingPrescriptions),
                      })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {t("attention.prescriptionsHelp")}
                    </p>
                    <Button variant="outline" size="sm" asChild className="mt-3 w-full">
                      <Link href="/dashboard/prescriptions">
                        {t("attention.reviewPrescriptions")}
                        <ArrowRight aria-hidden />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </Section>

        <Section spacing="lg">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="border-border/60 shadow-none lg:col-span-2">
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <CardTitle className="flex items-center gap-2.5 text-base">
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success"
                      aria-hidden
                    >
                      <TrendingUp className="h-4 w-4" />
                    </span>
                    {t("recent.title")}
                  </CardTitle>
                  <CardDescription>{t("recent.description")}</CardDescription>
                </div>
                {recentSales.length > 0 && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/dashboard/sales">
                      {tc("actions.viewAll")}
                      <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {recentSales.length === 0 ? (
                  <EmptyState
                    size="compact"
                    icon={ShoppingCart}
                    title={t("recent.emptyTitle")}
                    description={t("recent.emptyDescription")}
                    action={{ label: t("quick.newSale"), href: "/dashboard/sales/new", icon: ShoppingCart }}
                  />
                ) : (
                  <ul className="divide-y">
                    {recentSales.map((sale) => (
                      <li key={sale.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <div
                            className="truncate text-sm font-medium text-foreground"
                            title={sale.customerName ?? t("recent.walkIn")}
                          >
                            {sale.customerName ?? t("recent.walkIn")}
                          </div>
                          <div className="num text-xs text-muted-foreground">
                            {showDate(sale.saleDate)}
                          </div>
                        </div>
                        <div className="num shrink-0 text-right text-sm font-semibold text-foreground">
                          <CurrencyDisplay amount={sale.totalAmount} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/60 shadow-none">
              <CardHeader>
                <CardTitle className="text-base">{t("quick.title")}</CardTitle>
                <CardDescription>{t("quick.description")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button asChild variant="outline" className="w-full justify-start" title={t("header.openPosTitle")}>
                  <Link href="/dashboard/sales/new">
                    <ShoppingCart aria-hidden />
                    {t("quick.newSale")}
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full justify-start">
                  <Link href="/dashboard/inventory?action=create">
                    <Package aria-hidden />
                    {t("quick.addMedicine")}
                  </Link>
                </Button>
                <DashboardPrescriptionModal>
                  <Button variant="outline" className="w-full justify-start">
                    <FilePlus2 aria-hidden />
                    {t("quick.addPrescription")}
                  </Button>
                </DashboardPrescriptionModal>
                <Button asChild variant="outline" className="w-full justify-start">
                  <Link href="/dashboard/customers?action=create">
                    <UserPlus aria-hidden />
                    {t("quick.addCustomer")}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
