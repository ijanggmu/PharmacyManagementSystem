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
import { licenseDueText } from "@/lib/api/licenses-api"
import { formatNepalDateTime } from "@/lib/utils/nepal-time"

/** Server-rendered dates use Nepal time — the server's own zone (usually UTC) would shift late sales a day. */
const NEPAL_DATE: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }
import { getDotnetSession } from "@/lib/api/dotnet-server-session"
import { canManageBranches } from "@/lib/api/branches-api"
import { DefaultBranchPrompt } from "@/features/branches/components/default-branch-prompt"
import { BranchScopeLabel } from "@/features/branches/components/branch-filter"

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

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

  const attentionCount =
    (lowStock.length > 0 ? 1 : 0) +
    (expiring.length > 0 ? 1 : 0) +
    (counts.pendingPrescriptions > 0 ? 1 : 0) +
    (licenseAlerts.length > 0 ? 1 : 0)

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Dashboard"
          icon={Home}
          description="Today at a glance — sales, stock that needs action and prescriptions waiting to be filled."
          badge={<BranchScopeLabel />}
          actions={
            <>
              <Button asChild variant="outline">
                <Link href="/dashboard/inventory?action=create">
                  <Package aria-hidden />
                  Add medicine
                </Link>
              </Button>
              <Button asChild title="Open point of sale (Ctrl+K or ⌘K)">
                <Link href="/dashboard/sales/new">
                  <ShoppingCart aria-hidden />
                  New sale
                  <kbd className="pointer-events-none ml-1 hidden h-5 select-none items-center rounded border border-primary-foreground/30 bg-primary-foreground/10 px-1.5 font-mono text-[10px] font-medium sm:inline-flex">
                    Ctrl K
                  </kbd>
                </Link>
              </Button>
            </>
          }
        />

        <DefaultBranchPrompt canManage={canManageBranches(user.permissions ?? [])} />

        <Section spacing="lg">
          <h2 className="sr-only">Key figures</h2>
          <StatGrid cols={6}>
            <StatCard
              label="Today's revenue"
              value={<CurrencyDisplay amount={counts.todayRevenue} />}
              hint={
                <>
                  This month: <CurrencyDisplay amount={counts.monthlyRevenue} className="num" />
                </>
              }
              icon={Wallet}
              tone="primary"
              href="/dashboard/sales"
            />
            <StatCard
              label="Pending prescriptions"
              value={counts.pendingPrescriptions}
              hint={counts.pendingPrescriptions > 0 ? "Awaiting fulfilment" : "Nothing waiting"}
              icon={FileText}
              tone={counts.pendingPrescriptions > 0 ? "warning" : "success"}
              href="/dashboard/prescriptions"
            />
            <StatCard
              label="Low stock"
              value={lowStock.length}
              hint={lowStock.length > 0 ? "At or below reorder level" : "All items above reorder level"}
              icon={AlertTriangle}
              tone={lowStock.length > 0 ? "danger" : "success"}
              href="/dashboard/inventory?stockFilter=low"
            />
            <StatCard
              label="Expiring soon"
              value={expiring.length}
              hint="Within the next 30 days"
              icon={Clock}
              tone={expiring.length > 0 ? "warning" : "success"}
              href="/dashboard/inventory?expiryFilter=expiring"
            />
            <StatCard
              label="Medicines"
              value={counts.medicines}
              hint="Active inventory items"
              icon={Pill}
              href="/dashboard/inventory"
            />
            <StatCard
              label="Customers"
              value={counts.customers}
              hint="Registered customers"
              icon={Users}
              href="/dashboard/customers"
            />
          </StatGrid>
        </Section>

        <Section spacing="lg">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-heading-3">Needs attention</h2>
            <p className="text-sm text-muted-foreground">
              {attentionCount === 0 ? "Nothing needs action right now" : plural(attentionCount, "area to review", "areas to review")}
            </p>
          </div>

          {attentionCount === 0 ? (
            <Card className="border-border/60 shadow-none">
              <EmptyState
                size="compact"
                icon={CheckCircle2}
                title="All clear"
                description="No low stock, no medicines expiring in the next 30 days and no pending prescriptions."
                action={{ label: "New sale", href: "/dashboard/sales/new", icon: ShoppingCart }}
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {lowStock.length > 0 && (
                <Card className="border-border/60 shadow-none">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2.5 text-base">
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive"
                        aria-hidden
                      >
                        <AlertTriangle className="h-4 w-4" />
                      </span>
                      Low stock
                    </CardTitle>
                    <CardDescription>{plural(lowStock.length, "item needs", "items need")} restocking</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1.5">
                      {lowStock.slice(0, 3).map((medicine) => (
                        <li
                          key={medicine.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5"
                        >
                          <span className="min-w-0 truncate text-sm font-medium text-foreground" title={medicine.name}>
                            {medicine.name}
                          </span>
                          <Badge variant="danger" className="num">
                            {medicine.stockQuantity} left
                          </Badge>
                        </li>
                      ))}
                    </ul>
                    <Button variant="outline" size="sm" asChild className="mt-3 w-full">
                      <Link href="/dashboard/inventory?stockFilter=low">
                        View all {lowStock.length} low-stock items
                        <ArrowRight aria-hidden />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              )}

              {expiring.length > 0 && (
                <Card className="border-border/60 shadow-none">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2.5 text-base">
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10 text-warning"
                        aria-hidden
                      >
                        <Clock className="h-4 w-4" />
                      </span>
                      Expiring soon
                    </CardTitle>
                    <CardDescription>{plural(expiring.length, "item expires", "items expire")} within 30 days</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1.5">
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
                                Expires {formatNepalDateTime(medicine.expiry, NEPAL_DATE)}
                              </span>
                            </div>
                            <Badge variant={daysUntilExpiry <= 7 ? "danger" : "warning"} className="num">
                              {daysUntilExpiry <= 0 ? "Today" : `${daysUntilExpiry} ${daysUntilExpiry === 1 ? "day" : "days"}`}
                            </Badge>
                          </li>
                        )
                      })}
                    </ul>
                    <Button variant="outline" size="sm" asChild className="mt-3 w-full">
                      <Link href="/dashboard/inventory?expiryFilter=expiring">
                        View all {expiring.length} expiring items
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
                      Licenses to renew
                    </CardTitle>
                    <CardDescription>
                      {plural(licenseAlerts.length, "license needs", "licenses need")} renewing within 60 days
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
                            {licenseDueText(license.daysLeft)}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                    <Button variant="outline" size="sm" asChild className="mt-3 w-full">
                      <Link href="/dashboard/settings?tab=profile#licenses">
                        Review licenses
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
                      Pending prescriptions
                    </CardTitle>
                    <CardDescription>
                      {plural(counts.pendingPrescriptions, "prescription is", "prescriptions are")} waiting to be filled
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Review each prescription, dispense the medicines and mark it as filled so the patient can be billed.
                    </p>
                    <Button variant="outline" size="sm" asChild className="mt-3 w-full">
                      <Link href="/dashboard/prescriptions">
                        Review pending prescriptions
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
                    Recent sales
                  </CardTitle>
                  <CardDescription>Latest transactions across the counter</CardDescription>
                </div>
                {recentSales.length > 0 && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/dashboard/sales">
                      View all
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
                    title="No sales yet"
                    description="Completed sales will show up here. Start a sale from the point of sale screen."
                    action={{ label: "New sale", href: "/dashboard/sales/new", icon: ShoppingCart }}
                  />
                ) : (
                  <ul className="divide-y">
                    {recentSales.map((sale) => (
                      <li key={sale.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <div
                            className="truncate text-sm font-medium text-foreground"
                            title={sale.customerName ?? "Walk-in customer"}
                          >
                            {sale.customerName ?? "Walk-in customer"}
                          </div>
                          <div className="num text-xs text-muted-foreground">
                            {formatNepalDateTime(sale.saleDate, NEPAL_DATE)}
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
                <CardTitle className="text-base">Quick actions</CardTitle>
                <CardDescription>Common counter tasks</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button asChild variant="outline" className="w-full justify-start" title="Open point of sale (Ctrl+K or ⌘K)">
                  <Link href="/dashboard/sales/new">
                    <ShoppingCart aria-hidden />
                    New sale
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full justify-start">
                  <Link href="/dashboard/inventory?action=create">
                    <Package aria-hidden />
                    Add medicine
                  </Link>
                </Button>
                <DashboardPrescriptionModal>
                  <Button variant="outline" className="w-full justify-start">
                    <FilePlus2 aria-hidden />
                    Add prescription
                  </Button>
                </DashboardPrescriptionModal>
                <Button asChild variant="outline" className="w-full justify-start">
                  <Link href="/dashboard/customers?action=create">
                    <UserPlus aria-hidden />
                    Add customer
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
