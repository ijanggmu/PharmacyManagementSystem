import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { User, Mail, Phone, Calendar, Shield, Edit, Save, X } from "lucide-react"
import ProfileForm from "@/components/profile-form"

export default async function ProfilePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return redirect("/?auth=signin")
  }

  // Get user details from users table
  const { data: userData } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single()

  // Get user statistics
  const [salesCount, prescriptionsCount, customersCount] = await Promise.all([
    supabase
      .from("sales")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("prescriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true }),
  ])

  const stats = {
    sales: salesCount.count || 0,
    prescriptions: prescriptionsCount.count || 0,
    customers: customersCount.count || 0,
  }

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="My Profile"
          description="Manage your account information and preferences"
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profile Information */}
          <div className="lg:col-span-2 space-y-6">
            <Section spacing="lg">
              <Card>
                <CardHeader>
                  <CardTitle>Profile Information</CardTitle>
                  <CardDescription>
                    Update your personal information and account details
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ProfileForm 
                    user={user} 
                    userData={userData || null}
                  />
                </CardContent>
              </Card>
            </Section>

            <Section spacing="lg">
              <Card>
                <CardHeader>
                  <CardTitle>Account Security</CardTitle>
                  <CardDescription>
                    Manage your password and security settings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">Password</p>
                      <p className="text-sm text-muted-foreground">
                        Last updated: {userData?.updated_at ? new Date(userData.updated_at).toLocaleDateString() : 'Never'}
                      </p>
                    </div>
                    <Button variant="outline" size="sm">
                      Change Password
                    </Button>
                  </div>
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">Two-Factor Authentication</p>
                      <p className="text-sm text-muted-foreground">
                        Add an extra layer of security to your account
                      </p>
                    </div>
                    <Button variant="outline" size="sm" disabled>
                      Enable 2FA
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </Section>
          </div>

          {/* Sidebar - Stats and Info */}
          <div className="space-y-6">
            <Section spacing="lg">
              <Card>
                <CardHeader>
                  <CardTitle>Account Overview</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Role</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {userData?.role || 'User'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Mail className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Email</p>
                      <p className="text-xs text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Calendar className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Member Since</p>
                      <p className="text-xs text-muted-foreground">
                        {userData?.created_at 
                          ? new Date(userData.created_at).toLocaleDateString()
                          : new Date(user.created_at || Date.now()).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Section>

            <Section spacing="lg">
              <Card>
                <CardHeader>
                  <CardTitle>Activity Statistics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="text-sm font-medium">Sales Processed</p>
                      <p className="text-xs text-muted-foreground">Total sales you've handled</p>
                    </div>
                    <div className="text-2xl font-bold text-primary">
                      {stats.sales}
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="text-sm font-medium">Prescriptions</p>
                      <p className="text-xs text-muted-foreground">Prescriptions you've managed</p>
                    </div>
                    <div className="text-2xl font-bold text-primary">
                      {stats.prescriptions}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Section>
          </div>
        </div>
      </PageContainer>
    </DashboardLayout>
  )
}

