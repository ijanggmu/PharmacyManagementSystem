import { redirect } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import UserManagement from "@/features/users/components/user-management"
import RoleManagement from "@/features/users/components/role-management"
import SystemSettings from "@/features/settings/components/system-settings"
import PharmacyProfileSettings from "@/features/settings/components/pharmacy-profile-settings"
import { LicensesSettings } from "@/features/settings/components/licenses-settings"
import PaymentSettings from "@/features/settings/components/payment-settings"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TabsContent } from "@/components/ui/tabs"
import { PageTabs } from "@/components/ui/page-tabs"
import { Building2, CreditCard, MessageSquare, Settings, Shield, Users } from "lucide-react"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { getSettingsPageData } from "@/lib/server/services/dashboard-page-service"
import { getDotnetSession } from "@/lib/api/dotnet-server-session"
import { canViewSmsLog, dotnetPermissionAllowed, isDotnetRootUser } from "@/lib/api/dotnet-permissions"
import IrdEBillingSettings from "@/features/settings/components/ird-ebilling-settings"
import SmsSettingsPanel from "@/features/sms/components/sms-settings"

export default async function SettingsPage() {
  // The ?tab= section is read and written client-side by PageTabs.
  const user = (await getDotnetSession())?.user ?? null

  if (!user) {
    return redirect("/?auth=signin")
  }

  // Gate on the permission claims the page's own actions need (user management or pharmacy/system
  // settings) rather than a hand-maintained role string — matches the Settings nav item's check in
  // dashboard-layout.tsx exactly. dotnetPermissionAllowed already grants a SuperAdmin (isDotnetRootUser)
  // every permission, so this also fixes SuperAdmin being redirected away from Settings.
  const permissions = user.permissions ?? []
  if (!dotnetPermissionAllowed("users:read", permissions) && !dotnetPermissionAllowed("settings:write", permissions)) {
    redirect("/dashboard")
  }
  // Only now load the figures: a role without access is sent away above instead of crashing on a 403 here.
  const { users } = await getSettingsPageData()

  const canEditSettings = dotnetPermissionAllowed("settings:write", permissions)
  const canManageIrd = isDotnetRootUser(permissions) || permissions.includes("Permissions.Sales.Ird.Manage")

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Settings"
          description="Manage staff accounts, roles, your pharmacy profile and system preferences."
          icon={Settings}
        />

        {/* No stat row here: settings is a place to change things, not to read business figures. */}
        <Section spacing="lg">
          <PageTabs
            label="Settings sections"
            param="tab"
            defaultValue="users"
            className="gap-6"
            items={[
              { value: "users", label: "Users", icon: <Users aria-hidden /> },
              { value: "roles", label: "Roles & permissions", icon: <Shield aria-hidden /> },
              { value: "profile", label: "Pharmacy profile", icon: <Building2 aria-hidden /> },
              { value: "payments", label: "Payments", icon: <CreditCard aria-hidden /> },
              { value: "sms", label: "SMS", icon: <MessageSquare aria-hidden /> },
              { value: "system", label: "System", icon: <Settings aria-hidden /> },
            ]}
          >
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
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="font-display text-lg">IRD e-billing (CBMS)</CardTitle>
                  <CardDescription>
                    Real-time reporting of bills and credit notes to the Inland Revenue Department, and the abbreviated
                    tax invoice limit.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <IrdEBillingSettings canEdit={canManageIrd} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sms">
              <Card>
                <CardHeader>
                  <CardTitle className="font-display text-lg">SMS</CardTitle>
                  <CardDescription>
                    Dues and refill reminders and SMS receipts through Sparrow SMS or Aakash SMS, with quiet hours and
                    templates in English or Nepali.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <SmsSettingsPanel canEdit={canEditSettings} canViewLog={canViewSmsLog(permissions)} />
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
          </PageTabs>
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
