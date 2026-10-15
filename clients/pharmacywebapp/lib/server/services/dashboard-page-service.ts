import { licensesNeedingAttention, type PharmacyLicense } from "@/lib/api/licenses-api"
import type { User } from "@/features/users/api-client"
import {
  countResult,
  homeDataFromDotnet,
  monthlyWindow,
  profileFromDotnet,
  salesStatsPath,
  todayWindow,
  totalOnlyQuery,
  type DashboardHomeData,
  type DotnetExpiringBatch,
  type DotnetPaged,
  type DotnetPagedTotal,
  type DotnetPrescriptionStats,
  type DotnetReorderSuggestion,
  type DotnetSaleRow,
  type DotnetSalesStats,
  type DotnetUserProfile,
  type DotnetUserRole,
  type ProfileUserData,
  userFromDotnet,
  userScopedTotalQuery,
} from "@/lib/api/dashboard-dotnet"
import { dotnetServerGet, getDotnetSession } from "@/lib/api/dotnet-server-session"

export interface DashboardContextUser {
  id: string
  name: string
  role: string
  rawRole: string
  initials: string
}

export interface DashboardContextTenant {
  name: string
  country: string | null
  planCode?: string
}

export interface DashboardContextNotifications {
  lowStock: number
  expiring: number
  pending: number
  pendingReturns: number
  pendingRefunds: number
}

export interface DashboardContextData {
  user: DashboardContextUser
  tenant: DashboardContextTenant | null
  notifications: DashboardContextNotifications
  /** Used to hide branch-to-branch features (e.g. Stock Transfers) for single-branch
   *  tenants, where they'd have nothing to do. */
  branchCount: number
}

/** Reference.Contracts DashboardContextDto (camelCase JSON), served by GET /api/v1/reference/dashboard-context. */
interface DotnetDashboardContext {
  userId: string
  userName: string
  userEmail: string | null
  tenantId: string
  tenantName: string | null
  tenantPlan: string | null
  lowStockCount: number
  expiringCount: number
  pendingPrescriptionsCount: number
  pendingReturnsCount: number
  pendingRefundsCount: number
  branchCount: number
}

/** The context endpoint covers user, tenant, counts and branch count. The role comes from the session claims. */
export async function getDashboardContextData(authUser: {
  id: string
  email?: string
}): Promise<DashboardContextData> {
  const [context, session] = await Promise.all([
    dotnetServerGet<DotnetDashboardContext>("/reference/dashboard-context"),
    getDotnetSession(),
  ])

  const fullName = context.userName || authUser.email?.split("@")[0] || "User"
  const initials = fullName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
  const rawRole = session?.user.role ?? "user"
  const roleDisplay = rawRole.charAt(0).toUpperCase() + rawRole.slice(1)

  return {
    user: { id: authUser.id, name: fullName, role: roleDisplay, rawRole, initials },
    // The .NET context has no country field, so it is null here.
    tenant: context.tenantId
      ? { name: context.tenantName ?? "", country: null, planCode: context.tenantPlan ?? undefined }
      : null,
    notifications: {
      lowStock: context.lowStockCount,
      expiring: context.expiringCount,
      pending: context.pendingPrescriptionsCount,
      pendingReturns: context.pendingReturnsCount,
      pendingRefunds: context.pendingRefundsCount,
    },
    branchCount: context.branchCount,
  }
}

const EMPTY_SALES_STATS: DotnetSalesStats = { saleCount: 0, totalRevenue: 0, totalDiscount: 0, averageSaleAmount: 0 }

/**
 * Same contract as dotnetServerGet, but a request error (404/empty result, e.g. a tenant with no branches
 * or pharmacy data such as the root SuperAdmin tenant) degrades to `fallback` instead of throwing, so the
 * home page renders zeros/empty lists rather than crashing.
 */
async function dotnetServerGetOrDefault<T>(path: string, fallback: T): Promise<T> {
  try {
    return await dotnetServerGet<T>(path)
  } catch {
    return fallback
  }
}

/** .NET home page: Sales stats, Inventory reports, Prescriptions stats and list totals. */
export async function getDashboardHomeData(): Promise<DashboardHomeData> {
  const now = new Date()
  const [medicineTotal, customerTotal, prescriptionStats, monthSales, todaySales, reorder, expiringBatches, recentPage, context] =
    await Promise.all([
      dotnetServerGetOrDefault<DotnetPagedTotal>(totalOnlyQuery("/inventory/medicines"), { totalCount: 0 }),
      dotnetServerGetOrDefault<DotnetPagedTotal>(totalOnlyQuery("/customers"), { totalCount: 0 }),
      // null = the role can't read the report; the counts then come from the shell context below.
      dotnetServerGetOrDefault<DotnetPrescriptionStats | null>("/prescriptions/reports/stats", null),
      dotnetServerGetOrDefault<DotnetSalesStats>(salesStatsPath(monthlyWindow(now)), EMPTY_SALES_STATS),
      dotnetServerGetOrDefault<DotnetSalesStats>(salesStatsPath(todayWindow(now)), EMPTY_SALES_STATS),
      dotnetServerGetOrDefault<DotnetReorderSuggestion[] | null>("/inventory/reports/reorder-suggestions", null),
      dotnetServerGetOrDefault<DotnetExpiringBatch[] | null>("/inventory/reports/expiring-batches?withinDays=30", null),
      dotnetServerGetOrDefault<DotnetPaged<DotnetSaleRow>>("/sales?pageNumber=1&pageSize=5", { totalCount: 0, items: [] }),
      dotnetServerGetOrDefault<DotnetDashboardContext | null>("/reference/dashboard-context", null),
    ])
  return homeDataFromDotnet({
    medicineTotal,
    customerTotal,
    prescriptionStats,
    monthSales,
    todaySales,
    reorder,
    expiringBatches,
    recentSales: recentPage.items,
    context,
  })
}

/** Licenses expired or expiring within the reminder window, most urgent first (empty if unreadable). */
export async function getLicenseAlerts(): Promise<PharmacyLicense[]> {
  const licenses = await dotnetServerGetOrDefault<PharmacyLicense[]>("/reference/licenses", [])
  return licensesNeedingAttention(licenses)
}

export interface ProfilePageData {
  userData: ProfileUserData | null
  /** Email from the .NET profile. The session claims carry no email. */
  email: string | null
  twoFactorEnabled: boolean
  /** Permission names from the session, for gating self-service sections (e.g. sessions). */
  permissions: string[]
  /** Null where the user's role can't read that list (e.g. prescriptions for staff). */
  stats: { sales: number | null; prescriptions: number | null; customers: number | null }
}

export async function getProfilePageData(userId: string): Promise<ProfilePageData> {
  const [profile, session, customerTotal, salesTotal, prescriptionsTotal] = await Promise.all([
    dotnetServerGet<DotnetUserProfile>("/identity/profile"),
    getDotnetSession(),
    // Activity counts are optional: a role that can't read a list just doesn't see that count.
    dotnetServerGetOrDefault<DotnetPagedTotal | null>(totalOnlyQuery("/customers"), null),
    dotnetServerGetOrDefault<DotnetPagedTotal | null>(userScopedTotalQuery("/sales", "cashierUserId", userId), null),
    dotnetServerGetOrDefault<DotnetPagedTotal | null>(userScopedTotalQuery("/prescriptions", "createdByUserId", userId), null),
  ])
  return {
    userData: profileFromDotnet(profile, session?.user.role ?? null),
    email: profile.email ?? null,
    twoFactorEnabled: profile.twoFactorEnabled ?? false,
    permissions: session?.user.permissions ?? [],
    stats: {
      sales: salesTotal?.totalCount ?? null,
      prescriptions: prescriptionsTotal?.totalCount ?? null,
      customers: customerTotal?.totalCount ?? null,
    },
  }
}

export interface SettingsPageData {
  currentUser: { role: string | null } | null
  users: SettingsUser[]
  medicinesCount: { count: number | null; error: unknown }
  customersCount: { count: number | null; error: unknown }
  prescriptionsCount: { count: number | null; error: unknown }
  salesCount: { count: number | null; error: unknown }
}

/** The users list row the settings page's UserManagement renders (see features/users/api-client). */
type SettingsUser = User

/** Identity user search, paged through the 100-row cap, with each user's roles (one call per user). */
async function fetchDotnetUsers(): Promise<SettingsUser[]> {
  const pageSize = 100
  const first = await dotnetServerGet<DotnetPaged<DotnetUserProfile>>(
    `/identity/users/search?pageNumber=1&pageSize=${pageSize}`,
  )
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, Math.ceil(first.totalCount / pageSize) - 1) }, (_, index) =>
      dotnetServerGet<DotnetPaged<DotnetUserProfile>>(
        `/identity/users/search?pageNumber=${index + 2}&pageSize=${pageSize}`,
      ),
    ),
  )
  const rows = [first, ...rest].flatMap((page) => page.items)
  return Promise.all(
    rows.map(async (row) => {
      const roles = row.id
        ? await dotnetServerGet<DotnetUserRole[]>(`/identity/users/${encodeURIComponent(row.id)}/roles`)
        : []
      return userFromDotnet(row, roles)
    }),
  )
}

export async function getSettingsPageData(): Promise<SettingsPageData> {
  // The admin role comes from the session claims. Users come from the Identity search endpoint.
  const [session, users, medicinesTotal, customersTotal, prescriptionStats, salesTotal] = await Promise.all([
    getDotnetSession(),
    fetchDotnetUsers(),
    dotnetServerGet<DotnetPagedTotal>(totalOnlyQuery("/inventory/medicines")),
    dotnetServerGet<DotnetPagedTotal>(totalOnlyQuery("/customers")),
    dotnetServerGet<DotnetPrescriptionStats>("/prescriptions/reports/stats"),
    dotnetServerGet<DotnetPagedTotal>(totalOnlyQuery("/sales")),
  ])
  return {
    currentUser: session ? { role: session.user.role } : null,
    users,
    medicinesCount: countResult(medicinesTotal),
    customersCount: countResult(customersTotal),
    prescriptionsCount: countResult(prescriptionStats.total),
    salesCount: countResult(salesTotal),
  }
}
