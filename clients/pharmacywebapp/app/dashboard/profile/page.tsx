import { redirect } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { formatNepalDateTime } from "@/lib/utils/nepal-time"
import { PageContainer, PageHeader } from "@/components/layouts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { StatCard } from "@/components/shared/stat-card"
import { Calendar, ClipboardList, Mail, Receipt, ShieldCheck, ShieldOff, UserRound } from "lucide-react"
import ProfileForm from "@/components/profile-form"
import { SecuritySection } from "@/features/profile/components/security-section"
import { ConnectedAccountsCard } from "@/features/profile/components/connected-accounts-card"
import { LanguageSettingsCard } from "@/components/language-switcher"
import { getProfilePageData } from "@/lib/server/services/dashboard-page-service"
import { getDotnetSession } from "@/lib/api/dotnet-server-session"
import { isDotnetRootUser } from "@/lib/api/dotnet-permissions"
import { SESSIONS_REVOKE_PERMISSION, SESSIONS_VIEW_PERMISSION } from "@/lib/api/profile-api"

function initialsOf(name: string | null | undefined, email: string | null): string {
  const source = name?.trim() || email?.split("@")[0] || ""
  const letters = source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
  return letters || "U"
}

export default async function ProfilePage() {
  const user = (await getDotnetSession())?.user ?? null

  if (!user) {
    return redirect("/?auth=signin")
  }

  const { userData, stats, email, twoFactorEnabled, permissions } = await getProfilePageData(user.id)
  // The .NET session carries no email or created_at, so both come from the profile service.
  const roleLabel = userData?.role ? userData.role.charAt(0).toUpperCase() + userData.role.slice(1) : "User"
  const displayName = userData?.full_name?.trim() || email || "Your account"
  const memberSince = userData?.created_at
    ? formatNepalDateTime(userData.created_at, { year: "numeric", month: "long", day: "numeric" })
    : null
  const root = isDotnetRootUser(permissions)
  const canViewSessions = root || permissions.includes(SESSIONS_VIEW_PERMISSION)
  const canRevokeSessions = root || permissions.includes(SESSIONS_REVOKE_PERMISSION)

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="My profile"
          description="Your details, how you sign in, and your recent activity."
          icon={UserRound}
        />

        <Card className="mb-6">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-5 sm:p-6">
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 font-display text-xl font-semibold text-primary ring-1 ring-primary/15"
              aria-hidden
            >
              {initialsOf(userData?.full_name, email)}
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate font-display text-lg font-semibold text-foreground">{displayName}</h2>
                <Badge variant="info">{roleLabel}</Badge>
                {twoFactorEnabled ? (
                  <Badge variant="success">
                    <ShieldCheck aria-hidden />
                    2-step on
                  </Badge>
                ) : (
                  <Badge variant="warning">
                    <ShieldOff aria-hidden />
                    2-step off
                  </Badge>
                )}
              </div>
              <dl className="flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-5">
                <div className="flex min-w-0 items-center gap-1.5">
                  <dt className="sr-only">Email</dt>
                  <Mail className="h-4 w-4 shrink-0" aria-hidden />
                  <dd className="truncate">{email ?? "—"}</dd>
                </div>
                {memberSince && (
                  <div className="flex items-center gap-1.5">
                    <dt className="sr-only">Member since</dt>
                    <Calendar className="h-4 w-4 shrink-0" aria-hidden />
                    <dd>Member since {memberSince}</dd>
                  </div>
                )}
              </dl>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="font-display text-base">Profile details</CardTitle>
                <CardDescription>Your name and phone number as shown to colleagues and on records.</CardDescription>
              </CardHeader>
              <CardContent>
                <ProfileForm user={{ id: user.id, email }} userData={userData || null} />
              </CardContent>
            </Card>

            <SecuritySection
              twoFactorEnabled={twoFactorEnabled}
              canViewSessions={canViewSessions}
              canRevokeSessions={canRevokeSessions}
            />

            <LanguageSettingsCard />

            <ConnectedAccountsCard />
          </div>

          <aside aria-labelledby="activity-heading" className="space-y-3">
            <h2 id="activity-heading" className="font-display text-base font-semibold text-foreground">
              Your activity
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {stats.sales !== null && (
                <StatCard label="Sales processed" value={stats.sales} icon={Receipt} tone="primary" hint="Total sales you've handled" />
              )}
              {stats.prescriptions !== null && (
                <StatCard label="Prescriptions" value={stats.prescriptions} icon={ClipboardList} tone="info" hint="Prescriptions you've managed" />
              )}
            </div>
          </aside>
        </div>
      </PageContainer>
    </DashboardLayout>
  )
}
