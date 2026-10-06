import { createClient } from "@/lib/supabase/server"
import type { User } from "@/features/users/api-client"
import { fetchBatchAggMap, decorateWithBatchAgg } from "@/lib/server/services/medicine-service"
import { backendTarget } from "@/lib/api/backend-target"
import { dotnetServerGet, getDotnetSession } from "@/lib/api/dotnet-server-session"
import {
  countResult,
  homeDataFromDotnet,
  monthlyWindow,
  profileFromDotnet,
  salesStatsPath,
  todayWindow,
  totalOnlyQuery,
  type DashboardExpiringItem,
  type DashboardHomeData,
  type DashboardRecentSale,
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

interface DashboardContextUser {
  id: string
  name: string
  role: string
  rawRole: string
  initials: string
}

interface DashboardContextTenant {
  name: string
  country: string | null
  planCode?: string
}

interface DashboardContextNotifications {
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

interface SubscriptionRow {
  plan_id: string
  status: string
  valid_from: string
  plans: { code: string } | { code: string }[] | null
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

export async function getDashboardContextData(
  authUser: { id: string; email?: string },
  tenantId: string | null
): Promise<DashboardContextData> {
  return backendTarget("DASHBOARD") === "dotnet"
    ? dotnetDashboardContextData(authUser)
    : legacyDashboardContextData(authUser, tenantId)
}

/** .NET path: the context endpoint covers user, tenant, counts and branch count. The role comes from the session claims. */
async function dotnetDashboardContextData(authUser: { id: string; email?: string }): Promise<DashboardContextData> {
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
    // The .NET context has no country field, so it is null on this path.
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

async function legacyDashboardContextData(
  authUser: { id: string; email?: string },
  tenantId: string | null
): Promise<DashboardContextData> {
  const supabase = await createClient()

  const [{ data: userData }, { data: tenant }, { data: subscriptions }, branchCountResult] = await Promise.all([
    supabase.from("users").select("full_name, role").eq("id", authUser.id).single(),
    tenantId
      ? supabase.from("tenants").select("name, country").eq("id", tenantId).single()
      : Promise.resolve({ data: null }),
    tenantId
      ? supabase
          .from("tenant_subscriptions")
          .select("plan_id, status, valid_from, plans!inner(code)")
          .eq("tenant_id", tenantId)
          .order("valid_from", { ascending: false })
      : Promise.resolve({ data: [] }),
    tenantId
      ? supabase.from("branches").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId)
      : Promise.resolve({ count: 0 }),
  ])
  const branchCount = (branchCountResult as { count: number | null }).count ?? 0

  // Single aggregate RPC instead of 4 full-table reads (was: fetch every medicine,
  // prescription, return, and refund row for the tenant just to count in JS — on
  // every dashboard page load, since this runs from the shared client layout).
  const { data: countsRow } = tenantId
    ? await supabase.rpc("get_dashboard_notification_counts", { p_tenant_id: tenantId }).single()
    : { data: null }
  const counts = (countsRow as {
    low_stock: number
    expiring: number
    pending_prescriptions: number
    pending_returns: number
    pending_refunds: number
  } | null) ?? { low_stock: 0, expiring: 0, pending_prescriptions: 0, pending_returns: 0, pending_refunds: 0 }

  const lowStock = Number(counts.low_stock)
  const expiring = Number(counts.expiring)
  const pending = Number(counts.pending_prescriptions)
  const pendingReturns = Number(counts.pending_returns)
  const pendingRefunds = Number(counts.pending_refunds)

  const fullName = userData?.full_name || authUser.email?.split("@")[0] || "User"
  const initials = fullName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
  const rawRole = userData?.role || "user"
  const roleDisplay = rawRole.charAt(0).toUpperCase() + rawRole.slice(1)

  const subscriptionRows = (subscriptions || []) as SubscriptionRow[]
  const activeSub =
    subscriptionRows.find((s) => s.status === "active" || s.status === "trial") || subscriptionRows[0]
  const activeSubPlans = activeSub?.plans
  const planCode = Array.isArray(activeSubPlans) ? activeSubPlans[0]?.code : activeSubPlans?.code

  return {
    user: {
      id: authUser.id,
      name: fullName,
      role: roleDisplay,
      rawRole,
      initials,
    },
    tenant: tenant
      ? {
          name: tenant.name,
          country: tenant.country,
          planCode,
        }
      : null,
    notifications: { lowStock, expiring, pending, pendingReturns, pendingRefunds },
    branchCount,
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

/** The users list row the settings page's UserManagement renders (see features/users/api-client). */
type SettingsUser = User

interface LegacyMedicineRow {
  id: string
  name: string
  stock_quantity: number
  minimum_stock: number
  expiry_date: string | null
  unit_price: string
}

interface LegacySaleRow {
  id: string
  total_amount: string
  sale_date: string
  customers: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null
}

/**
 * Supabase path for the home page. The aggregates are computed here, so the page renders the same
 * DashboardHomeData shape for both targets.
 */
async function legacyHomeData(now: Date): Promise<DashboardHomeData> {
  const supabase = await createClient()
  const [medicinesResult, customersResult, prescriptionsResult, salesResult, todaySalesResult, recentSalesResult] =
    await Promise.all([
      supabase.from("medicines").select("id, name, stock_quantity, minimum_stock, expiry_date, unit_price"),
      supabase.from("customers").select("id, created_at"),
      supabase.from("prescriptions").select("id, status, created_at"),
      supabase
        .from("sales")
        .select("id, total_amount, sale_date")
        .gte("sale_date", new Date(now.getTime() - 30 * DAY_MS).toISOString()),
      supabase.from("sales").select("id, total_amount").gte("sale_date", now.toISOString().split("T")[0]),
      supabase
        .from("sales")
        .select("id, total_amount, sale_date, customers(first_name, last_name)")
        .order("sale_date", { ascending: false })
        .limit(5),
    ])

  // Attach the batch-aware fields the inventory list uses. The static medicines.expiry_date is not kept in
  // sync with real batches, so the nearest batch expiry wins once a medicine has batches.
  const medicineRows: LegacyMedicineRow[] = medicinesResult.data || []
  const batchAgg = await fetchBatchAggMap(
    supabase,
    medicineRows.map((m) => m.id),
    null
  )
  const medicines = decorateWithBatchAgg(medicineRows, batchAgg)

  const thirtyDaysFromNow = new Date(now.getTime() + 30 * DAY_MS)
  const expiring: DashboardExpiringItem[] = []
  for (const med of medicines) {
    const expiry = med.batch_count > 0 ? med.batch_nearest_expiry : med.expiry_date
    if (!expiry) continue
    const expiryDate = new Date(expiry)
    if (expiryDate > thirtyDaysFromNow || expiryDate < now) continue
    expiring.push({
      id: med.id,
      name: med.name,
      expiry,
      daysUntilExpiry: Math.ceil((expiryDate.getTime() - now.getTime()) / DAY_MS),
    })
  }

  const sumAmounts = (rows: { total_amount: string }[]) =>
    rows.reduce((sum, row) => sum + Number.parseFloat(row.total_amount), 0)

  const recentSales: DashboardRecentSale[] = ((recentSalesResult.data || []) as LegacySaleRow[]).map((sale) => {
    const customer = Array.isArray(sale.customers) ? sale.customers[0] : sale.customers
    return {
      id: sale.id,
      customerName: customer ? `${customer.first_name} ${customer.last_name}` : null,
      saleDate: sale.sale_date,
      totalAmount: Number.parseFloat(sale.total_amount),
    }
  })

  const prescriptionRows = (prescriptionsResult.data || []) as { status: string }[]
  return {
    counts: {
      medicines: medicines.length,
      customers: customersResult.data?.length ?? 0,
      pendingPrescriptions: prescriptionRows.filter((p) => p.status === "pending").length,
      monthlyRevenue: sumAmounts((salesResult.data || []) as { total_amount: string }[]),
      todayRevenue: sumAmounts((todaySalesResult.data || []) as { total_amount: string }[]),
    },
    lowStock: medicines
      .filter((m) => m.stock_quantity <= m.minimum_stock)
      .map((m) => ({ id: m.id, name: m.name, stockQuantity: m.stock_quantity, minimumStock: m.minimum_stock })),
    expiring,
    recentSales,
  }
}

/** .NET path for the home page: Sales stats, Inventory reports, Prescriptions stats and list totals. */
async function dotnetHomeData(now: Date): Promise<DashboardHomeData> {
  const [medicineTotal, customerTotal, prescriptionStats, monthSales, todaySales, reorder, expiringBatches, recentPage] =
    await Promise.all([
      dotnetServerGet<DotnetPagedTotal>(totalOnlyQuery("/inventory/medicines")),
      dotnetServerGet<DotnetPagedTotal>(totalOnlyQuery("/customers")),
      dotnetServerGet<DotnetPrescriptionStats>("/prescriptions/reports/stats"),
      dotnetServerGet<DotnetSalesStats>(salesStatsPath(monthlyWindow(now))),
      dotnetServerGet<DotnetSalesStats>(salesStatsPath(todayWindow(now))),
      dotnetServerGet<DotnetReorderSuggestion[]>("/inventory/reports/reorder-suggestions"),
      dotnetServerGet<DotnetExpiringBatch[]>("/inventory/reports/expiring-batches?withinDays=30"),
      dotnetServerGet<DotnetPaged<DotnetSaleRow>>("/sales?pageNumber=1&pageSize=5"),
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
  })
}

export async function getDashboardHomeData(): Promise<DashboardHomeData> {
  const now = new Date()
  return backendTarget("DASHBOARD") === "dotnet" ? dotnetHomeData(now) : legacyHomeData(now)
}

export interface ProfilePageData {
  userData: ProfileUserData | null
  /** Email from the .NET profile. The session claims carry no email, so the dotnet path reads it here. */
  email: string | null
  stats: { sales: number; prescriptions: number; customers: number }
}

/** Per-user sales and prescription counts on the Supabase (nextjs) path only. */
async function legacyUserActivityCounts(userId: string) {
  const supabase = await createClient()
  const [salesCount, prescriptionsCount] = await Promise.all([
    supabase.from("sales").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("prescriptions").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ])
  return { sales: salesCount.count || 0, prescriptions: prescriptionsCount.count || 0 }
}

export async function getProfilePageData(userId: string): Promise<ProfilePageData> {
  if (backendTarget("AUTH") === "dotnet") {
    const [profile, session, customerTotal, salesTotal, prescriptionsTotal] = await Promise.all([
      dotnetServerGet<DotnetUserProfile>("/identity/profile"),
      getDotnetSession(),
      dotnetServerGet<DotnetPagedTotal>(totalOnlyQuery("/customers")),
      dotnetServerGet<DotnetPagedTotal>(userScopedTotalQuery("/sales", "cashierUserId", userId)),
      dotnetServerGet<DotnetPagedTotal>(userScopedTotalQuery("/prescriptions", "createdByUserId", userId)),
    ])
    return {
      userData: profileFromDotnet(profile, session?.user.role ?? null),
      email: profile.email ?? null,
      stats: {
        sales: salesTotal.totalCount,
        prescriptions: prescriptionsTotal.totalCount,
        customers: customerTotal.totalCount,
      },
    }
  }

  const supabase = await createClient()
  const { data: userData } = await supabase.from("users").select("*").eq("id", userId).single()
  const [activity, customersCount] = await Promise.all([
    legacyUserActivityCounts(userId),
    supabase.from("customers").select("id", { count: "exact", head: true }),
  ])
  return {
    userData: (userData ?? null) as ProfileUserData | null,
    email: null,
    stats: { ...activity, customers: customersCount.count || 0 },
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

export async function getSettingsPageData(userId: string): Promise<SettingsPageData> {
  const supabase = await createClient()
  if (backendTarget("REFERENCE") === "dotnet") {
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

  const [
    { data: currentUser },
    { data: users, error: usersError },
    medicinesCount,
    customersCount,
    prescriptionsCount,
    salesCount,
  ] = await Promise.all([
    supabase.from("users").select("role").eq("id", userId).single(),
    supabase.from("users").select("*").order("created_at", { ascending: false }),
    // head: true — count only, no row data fetched (these were pulling every row's
    // id column just to read .count off the response).
    supabase.from("medicines").select("id", { count: "exact", head: true }),
    supabase.from("customers").select("id", { count: "exact", head: true }),
    supabase.from("prescriptions").select("id", { count: "exact", head: true }),
    supabase.from("sales").select("id", { count: "exact", head: true }),
  ])
  if (usersError) throw new Error("Failed to load user data. Please try again later.")
  return { currentUser, users: users || [], medicinesCount, customersCount, prescriptionsCount, salesCount }
}
