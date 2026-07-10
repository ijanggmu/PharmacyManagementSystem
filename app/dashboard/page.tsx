import { createClient } from "@/lib/supabase/server"
import DashboardLayout from "@/components/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Pill,
  Users,
  FileText,
  DollarSign,
  AlertTriangle,
  TrendingUp,
  Clock,
  Package,
  ShoppingCart,
  ArrowRight,
} from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Medicine } from "@/features/medicines/api-client"
import { Customer } from "@/features/customers/api-client"
import { Prescription } from "@/features/prescriptions/api-client"
import { Sale } from "@/features/sales/api-client"
import { CurrencyDisplay } from "@/components/currency-display"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import DashboardPrescriptionModal from "@/features/prescriptions/components/dashboard-prescription-modal"
import { getDashboardHomeData } from "@/lib/server/services/dashboard-page-service"

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // The middleware handles unauthenticated user redirects
  // This check is still useful for type safety and fallback
  if (!user) {
    return redirect("/?auth=signin")
  }

  const currentDate = new Date()
  const thirtyDaysFromNow = new Date(currentDate.getTime() + 30 * 24 * 60 * 60 * 1000)
  const { medicines, customers, prescriptions, sales, todaySales, recentSales } = await getDashboardHomeData()

  // Calculate metrics
  const lowStockMedicines = medicines.filter((med: Medicine) => med.stock_quantity <= med.minimum_stock)
  const pendingPrescriptions = prescriptions.filter((p: Prescription) => p.status === "pending")
  const monthlyRevenue = sales.reduce((sum: number, sale: Sale) => sum + Number.parseFloat(sale.total_amount), 0)
  const todayRevenue = todaySales.reduce((sum: number, sale: Sale) => sum + Number.parseFloat(sale.total_amount), 0)

  const expiringMedicines = medicines.filter((med: Medicine) => {
    if (!med.expiry_date) return false
    const expiryDate = new Date(med.expiry_date)
    return expiryDate <= thirtyDaysFromNow && expiryDate >= currentDate
  })

  const totalInventoryValue = medicines.reduce(
    (sum: number, med: Medicine) => sum + med.stock_quantity * Number.parseFloat(med.unit_price),
    0,
  )

  // Recent customers (last 7 days)
  const recentCustomers = customers.filter((customer: Customer) => {
    const customerDate = new Date(customer.created_at)
    const sevenDaysAgo = new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000)
    return customerDate >= sevenDaysAgo
  })

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Dashboard Overview"
          description="Welcome back! Here's your pharmacy's performance at a glance."
        />

        <Section spacing="lg">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                href: "/dashboard/inventory",
                label: "Total Medicines",
                value: medicines.length,
                hint: "Active inventory items",
                icon: Pill,
                tint: "from-teal-500 to-teal-700",
              },
              {
                href: "/dashboard/customers",
                label: "Total Customers",
                value: customers.length,
                hint: "Registered customers",
                icon: Users,
                tint: "from-indigo-500 to-indigo-700",
              },
              {
                href: "/dashboard/prescriptions",
                label: "Pending Prescriptions",
                value: pendingPrescriptions.length,
                hint: "Awaiting fulfillment",
                icon: FileText,
                tint: "from-amber-500 to-amber-700",
              },
            ].map(({ href, label, value, hint, icon: Icon, tint }) => (
              <Card
                key={label}
                className="group cursor-pointer border-border/60 py-5 shadow-none transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-md"
                asChild
              >
                <Link href={href}>
                  <CardContent className="flex items-start justify-between px-5">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                      <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums text-foreground">{value}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
                    </div>
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${tint} text-white shadow-sm transition-transform duration-200 group-hover:scale-105`}
                    >
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                  </CardContent>
                </Link>
              </Card>
            ))}

            <Card
              className="group cursor-pointer border-border/60 py-5 shadow-none transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-md"
              asChild
            >
              <Link href="/dashboard/sales">
                <CardContent className="flex items-start justify-between px-5">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Today&rsquo;s Revenue
                    </p>
                    <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums text-foreground">
                      <CurrencyDisplay amount={todayRevenue} />
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Monthly: <CurrencyDisplay amount={monthlyRevenue} />
                    </p>
                  </div>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 text-white shadow-sm transition-transform duration-200 group-hover:scale-105">
                    <DollarSign className="h-5 w-5" aria-hidden />
                  </span>
                </CardContent>
              </Link>
            </Card>
          </div>
        </Section>

        <Section spacing="lg">
          {/* Alerts */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Low Stock Alert */}
            {lowStockMedicines.length > 0 && (
              <Card className="border-border/60 shadow-none">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                      <AlertTriangle className="h-4 w-4" aria-hidden />
                    </span>
                    Low Stock Alert
                  </CardTitle>
                  <CardDescription>{lowStockMedicines.length} items need restocking</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {lowStockMedicines.slice(0, 3).map((medicine: Medicine) => (
                      <div
                        key={medicine.id}
                        className="flex items-center justify-between rounded-lg border border-destructive/15 bg-destructive/[0.04] px-3 py-2.5"
                      >
                        <span className="text-sm font-medium text-foreground">{medicine.name}</span>
                        <Badge variant="destructive" className="text-xs">
                          {medicine.stock_quantity} left
                        </Badge>
                      </div>
                    ))}
                    {lowStockMedicines.length > 0 && (
                      <Button variant="outline" size="sm" asChild className="mt-2 w-full bg-transparent">
                        <Link href="/dashboard/inventory?stockFilter=low">
                          View All {lowStockMedicines.length} Items
                          <ArrowRight className="ml-1 h-3 w-3" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Expiring Medicines */}
            {expiringMedicines.length > 0 && (
              <Card className="border-border/60 shadow-none">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-500">
                      <Clock className="h-4 w-4" aria-hidden />
                    </span>
                    Expiring Medicines
                  </CardTitle>
                  <CardDescription>{expiringMedicines.length} items expire within 30 days</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {expiringMedicines.slice(0, 3).map((medicine: Medicine) => {
                      if (!medicine.expiry_date) return null
                      const daysUntilExpiry = Math.ceil(
                        (new Date(medicine.expiry_date).getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24),
                      )
                      return (
                        <div
                          key={medicine.id}
                          className="flex items-center justify-between rounded-lg border border-amber-500/15 bg-amber-500/[0.04] px-3 py-2.5"
                        >
                          <div>
                            <span className="text-sm font-medium text-foreground">{medicine.name}</span>
                            <div className="text-xs text-muted-foreground">
                              {new Date(medicine.expiry_date).toLocaleDateString()}
                            </div>
                          </div>
                          <Badge variant={daysUntilExpiry <= 7 ? "destructive" : "secondary"} className="text-xs">
                            {daysUntilExpiry}d
                          </Badge>
                        </div>
                      )
                    })}
                    {expiringMedicines.length > 0 && (
                      <Button variant="outline" size="sm" asChild className="mt-2 w-full bg-transparent">
                        <Link href="/dashboard/inventory?expiryFilter=expiring">
                          View All {expiringMedicines.length} Items
                          <ArrowRight className="ml-1 h-3 w-3" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </Section>

        <Section spacing="lg">
          {/* Recent Activity */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="border-border/60 shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-500">
                    <TrendingUp className="h-4 w-4" aria-hidden />
                  </span>
                  Recent Sales
                </CardTitle>
                <CardDescription>Latest transactions and revenue</CardDescription>
              </CardHeader>
              <CardContent>
                {recentSales.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No recent sales yet</p>
                ) : (
                  <div className="space-y-1.5">
                    {recentSales.map((sale: Sale) => (
                      <div
                        key={sale.id}
                        className="flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50"
                      >
                        <div>
                          <div className="text-sm font-medium text-foreground">
                            {sale.customers
                              ? `${sale.customers.first_name} ${sale.customers.last_name}`
                              : "Walk-in Customer"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(sale.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-500">
                          <CurrencyDisplay amount={sale.total_amount} />
                        </div>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" asChild className="w-full bg-transparent">
                      <Link href="/dashboard/sales">
                        View All Sales
                        <ArrowRight className="ml-1 h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/60 shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-500">
                    <Package className="h-4 w-4" aria-hidden />
                  </span>
                  Quick Actions
                </CardTitle>
                <CardDescription>Common tasks and shortcuts</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button asChild className="w-full justify-start" title="Open Point of Sale (Ctrl+K or ⌘K)">
                  <Link href="/dashboard/sales/new" className="flex items-center justify-between">
                    <span className="flex items-center">
                      <ShoppingCart className="mr-2 h-4 w-4" />
                      New Sale
                    </span>
                    <kbd className="pointer-events-none hidden h-6 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex">
                      Ctrl+K
                    </kbd>
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full justify-start bg-transparent">
                  <Link href="/dashboard/inventory?action=create">
                    <Package className="mr-2 h-4 w-4" />
                    Add New Medicine
                  </Link>
                </Button>
                <DashboardPrescriptionModal>
                  <Button variant="outline" className="w-full justify-start bg-transparent">
                    <FileText className="mr-2 h-4 w-4" />
                    Add New Prescription
                  </Button>
                </DashboardPrescriptionModal>
                <Button asChild variant="outline" className="w-full justify-start bg-transparent">
                  <Link href="/dashboard/customers?action=create">
                    <Users className="mr-2 h-4 w-4" />
                    Add New Customer
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
