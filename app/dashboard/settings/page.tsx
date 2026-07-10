import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import UserManagement from "@/features/users/components/user-management"
import RoleManagement from "@/features/users/components/role-management"
import SystemSettings from "@/features/settings/components/system-settings"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Users, Settings, Shield, Database, GitBranch } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { getSettingsPageData } from "@/lib/server/services/dashboard-page-service"

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const validTabs = ["users", "roles", "system"]
  const initialTab = tab && validTabs.includes(tab) ? tab : "users"

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return redirect("/?auth=signin")
  }

  const { currentUser, users, medicinesCount, customersCount, prescriptionsCount, salesCount } = await getSettingsPageData(user.id)

  // Only allow admin access
  if (currentUser?.role !== "admin") {
    redirect("/dashboard")
  }

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
          title="Admin Settings"
          description="Manage users, roles, system settings, and administrative controls"
        />

        <Section spacing="lg">
          {/* System Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{users?.length || 0}</div>
              <p className="text-xs text-muted-foreground">System users</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Medicines</CardTitle>
              <Database className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{medicinesCount.count || 0}</div>
              <p className="text-xs text-muted-foreground">In inventory</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Customers</CardTitle>
              <Users className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{customersCount.count || 0}</div>
              <p className="text-xs text-muted-foreground">Registered</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
              <Shield className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{salesCount.count || 0}</div>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>
        </div>
        </Section>

        <Section spacing="lg">
          {/* Quick Actions */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Database Management</CardTitle>
              <CardDescription>Check migration status and database health</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link href="/dashboard/settings/migrations" className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4" />
                  Check Migration Status
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Admin Tabs */}
        <Tabs defaultValue={initialTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              User Management
            </TabsTrigger>
            <TabsTrigger value="roles" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Role Management
            </TabsTrigger>
            <TabsTrigger value="system" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              System Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>Manage user accounts, roles, and permissions</CardDescription>
              </CardHeader>
              <CardContent>
                <UserManagement users={users || []} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="roles">
            <Card>
              <CardHeader>
                <CardTitle>Role Management</CardTitle>
                <CardDescription>Configure role permissions and access levels</CardDescription>
              </CardHeader>
              <CardContent>
                <RoleManagement />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="system">
            <Card>
              <CardHeader>
                <CardTitle>System Configuration</CardTitle>
                <CardDescription>Configure system-wide settings and preferences</CardDescription>
              </CardHeader>
              <CardContent>
                <SystemSettings />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
