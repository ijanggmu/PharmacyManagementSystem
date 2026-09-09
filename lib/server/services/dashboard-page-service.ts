import { createClient } from "@/lib/supabase/server"
import { fetchBatchAggMap, decorateWithBatchAgg } from "@/lib/server/services/medicine-service"

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

export async function getDashboardContextData(
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

export async function getDashboardHomeData() {
  const supabase = await createClient()
  const [medicinesResult, customersResult, prescriptionsResult, salesResult, todaySalesResult, recentSalesResult] =
    await Promise.all([
      supabase.from("medicines").select("id, name, stock_quantity, minimum_stock, expiry_date, unit_price"),
      supabase.from("customers").select("id, created_at"),
      supabase.from("prescriptions").select("id, status, created_at"),
      supabase
        .from("sales")
        .select("id, total_amount, sale_date")
        .gte("sale_date", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      supabase.from("sales").select("id, total_amount").gte("sale_date", new Date().toISOString().split("T")[0]),
      supabase
        .from("sales")
        .select("id, total_amount, sale_date, customers(first_name, last_name)")
        .order("sale_date", { ascending: false })
        .limit(5),
    ])

  // The "Expiring Medicines" widget on this page used to read medicines.expiry_date
  // directly — a field set once at creation and never kept in sync with real
  // per-lot batches, so it went stale the moment a medicine had more than one
  // batch. Attach the same batch-aware fields the inventory list uses.
  //
  // Kept as `any[]` (matching this function's existing untyped contract — its
  // consumer, app/dashboard/page.tsx, already casts each row to the much
  // richer `Medicine` type via callback parameter annotations, which only
  // type-checks because this was `any[]` before too): typing this array
  // precisely to its actual 6 selected columns would make TS start enforcing
  // that cast against a type it can't satisfy, which is a wider, pre-existing
  // looseness this fix isn't the place to close.
  const medicineRows: any[] = medicinesResult.data || []
  const batchAgg = await fetchBatchAggMap(
    supabase,
    medicineRows.map((m) => m.id),
    null
  )

  return {
    medicines: decorateWithBatchAgg(medicineRows, batchAgg),
    customers: customersResult.data || [],
    prescriptions: prescriptionsResult.data || [],
    sales: salesResult.data || [],
    todaySales: todaySalesResult.data || [],
    recentSales: recentSalesResult.data || [],
  }
}

export async function getProfilePageData(userId: string) {
  const supabase = await createClient()
  const { data: userData } = await supabase.from("users").select("*").eq("id", userId).single()
  const [salesCount, prescriptionsCount, customersCount] = await Promise.all([
    supabase.from("sales").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("prescriptions").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("customers").select("id", { count: "exact", head: true }),
  ])
  return {
    userData,
    stats: {
      sales: salesCount.count || 0,
      prescriptions: prescriptionsCount.count || 0,
      customers: customersCount.count || 0,
    },
  }
}

export async function getSettingsPageData(userId: string) {
  const supabase = await createClient()
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

