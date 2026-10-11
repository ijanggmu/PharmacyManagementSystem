import { redirect } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import UserManagement from "@/features/users/components/user-management"
import RoleManagement from "@/features/users/components/role-management"
import SystemSettings from "@/features/settings/components/system-settings"
import PharmacyProfileSettings from "@/features/settings/components/pharmacy-profile-settings"
import { LicensesSettings } from "@/features/settings/components/licenses-settings"
import PaymentSettings from "@/features/settings/components/payment-settings"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertTriangle, Building2, CreditCard, Pill, Receipt, Settings, Shield, UserRound, Users } from "lucide-react"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { getSettingsPageData } from "@/lib/server/services/dashboard-page-service"
import { getDotnetSession } from "@/lib/api/dotnet-server-session"
import { dotnetPermissionAllowed } from "@/lib/api/dotnet-permissions"

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const validTabs = ["users", "roles", "system", "profile", "payments"]
  const initialTab = tab && validTabs.includes(tab) ? tab : "users"

  const user = (await getDotnetSession())?.user ?? null

  if (!user) {
    return redirect("/?auth=signin")
  }

  const { users, medicinesCount, customersCount, prescriptionsCount, salesCount } = await getSettingsPageData()

  // Gate on the permission claims the page's own actions need (user management or pharmacy/system
  // settings) rather than a hand-maintained role string — matches the Settings nav item's check in
  // dashboard-layout.tsx exactly. dotnetPermissionAllowed already grants a SuperAdmin (isDotnetRootUser)
  // every permission, so this also fixes SuperAdmin being redirected away from Settings.
  const permissions = user.permissions ?? []
  if (!dotnetPermissionAllowed("users:read", permissions) && !dotnetPermissionAllowed("settings:read", permissions)) {
    redirect("/dashboard")
  }
  const canEditSettings = dotnetPermissionAllowed("settings:write", permissions)

  // Check for errors in count queries
  const countErrors = [medicinesCount, customersCount, prescriptionsCount, salesCount].some(result => result.error)
  if (countErrors) {
    console.error("Error fetching system statistics")
    // Continue with the page but show warning
  }

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Settings"
          description="Manage staff accounts, roles, your pharmacy profile and system preferences."
          icon={Settings}
        />

        <Section spacing="lg">
          {countErrors && (
            <p role="status" className="mb-3 flex items-center gap-2 text-sm text-warning">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              Some counts couldn&apos;t be loaded and may show as 0. Refresh the page to try again.
            </p>
          )}
          <StatGrid cols={4}>
            <StatCard label="Staff users" value={users?.length || 0} icon={Users} tone="primary" hint="Accounts with access" />
            <StatCard label="Medicines" value={medicinesCount.count || 0} icon={Pill} tone="info" hint="In inventory" />
            <StatCard label="Customers" value={customersCount.count || 0} icon={UserRound} tone="default" hint="Registered" />
            <StatCard label="Total sales" value={salesCount.count || 0} icon={Receipt} tone="success" hint="All time" />
          </StatGrid>
        </Section>

        <Section spacing="lg">
          <Tabs defaultValue={initialTab} className="space-y-6">
            <div className="-mx-1 overflow-x-auto px-1">
              <TabsList className="inline-flex w-full min-w-max sm:grid sm:min-w-0 sm:grid-cols-5">
                <TabsTrigger value="users" className="flex items-center gap-2">
                  <Users className="h-4 w-4" aria-hidden />
                  Users
                </TabsTrigger>
                <TabsTrigger value="roles" className="flex items-center gap-2">
                  <Shield className="h-4 w-4" aria-hidden />
                  Roles &amp; permissions
                </TabsTrigger>
                <TabsTrigger value="profile" className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" aria-hidden />
                  Pharmacy profile
                </TabsTrigger>
                <TabsTrigger value="payments" className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" aria-hidden />
                  Payments
                </TabsTrigger>
                <TabsTrigger value="system" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" aria-hidden />
                  System
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="users">
              <Card>
                <CardHeader>
                  <CardTitle className="font-display text-lg">Users</CardTitle>
                  <CardDescription>Add staff, assign roles and deactivate accounts that no longer need access.</CardDescription>
                </CardHeader>
                <CardContent>
                  <UserManagement users={users || []} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="roles">
              <Card>
                <CardHeader>
                  <CardTitle className="font-display text-lg">Roles &amp; permissions</CardTitle>
                  <CardDescription>What each role can see and do across the system.</CardDescription>
                </CardHeader>
                <CardContent>
                  <RoleManagement />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="profile">
              <Card>
                <CardHeader>
                  <CardTitle className="font-display text-lg">Pharmacy profile</CardTitle>
                  <CardDescription>
                    Legal name, license number and PAN/VAT registration — printed on invoices when set.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <PharmacyProfileSettings />
                </CardContent>
              </Card>
              <Card id="licenses" className="mt-6 scroll-mt-24">
                <CardHeader>
                  <CardTitle className="font-display text-lg">Licenses &amp; registrations</CardTitle>
                  <CardDescription>
                    DDA license, pharmacist registration, PAN/VAT and more — with reminders before each one expires.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <LicensesSettings />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="payments">
              <Card>
                <CardHeader>
                  <CardTitle className="font-display text-lg">Payments</CardTitle>
                  <CardDescription>
                    QR options the POS offers at checkout: your static bank QR and Fonepay dynamic QR.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <PaymentSettings canEdit={canEditSettings} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="system" className="min-w-0 space-y-6">
              <div>
                <h2 className="font-display text-lg font-semibold text-foreground">System</h2>
                <p className="text-sm text-muted-foreground">System-wide settings and preferences.</p>
              </div>
              <SystemSettings />
            </TabsContent>
          </Tabs>
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
