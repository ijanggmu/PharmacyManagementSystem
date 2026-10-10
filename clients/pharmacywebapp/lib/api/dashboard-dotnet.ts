/**
 * Pure mapping from .NET dashboard, report, identity and reference responses to the shapes the
 * dashboard pages and layout render. No I/O and no server imports, so every function is unit-testable.
 * DTO interfaces mirror the .NET contracts (camelCase JSON). Field names follow the .NET records.
 */

import type { DashboardContextResponse } from "@/features/dashboard/api-client"
import type { User } from "@/features/users/api-client"

const DAY_MS = 24 * 60 * 60 * 1000

// ---- .NET response shapes -------------------------------------------------------------------

/** PagedResponse<T> without items. Only the total is read for count KPIs. */
export interface DotnetPagedTotal {
  totalCount: number
}

/** PagedResponse<T> with items. */
export interface DotnetPaged<T> extends DotnetPagedTotal {
  items: T[]
}

/** Sales.Contracts SalesStatsDto. */
export interface DotnetSalesStats {
  saleCount: number
  totalRevenue: number
  totalDiscount: number
  averageSaleAmount: number
}

/** Prescriptions.Contracts PrescriptionStatsDto. */
export interface DotnetPrescriptionStats {
  total: number
  pending: number
  partiallyFilled: number
  filled: number
  cancelled: number
}

/** Inventory.Contracts ReorderSuggestionDto. */
export interface DotnetReorderSuggestion {
  medicineId: string
  medicineName: string
  reorderLevel: number
  totalQuantityOnHand: number
  suggestedOrderQuantity: number
}

/** Inventory.Contracts ExpiringBatchDto. */
export interface DotnetExpiringBatch {
  batchId: string
  medicineId: string
  medicineName: string
  batchNo: string
  expiryDate: string
  daysUntilExpiry: number
  quantityOnHand: number
}

/** Subset of Sales.Contracts SaleDto used by the home page. */
export interface DotnetSaleRow {
  id: string
  customerName: string | null
  saleDateUtc: string
  totalAmount: number
}

/** Identity.Contracts UserDto. */
export interface DotnetUserProfile {
  id?: string | null
  userName?: string | null
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phoneNumber?: string | null
  imageUrl?: string | null
  isActive?: boolean
  /** Authenticator (TOTP) sign-in is on; token issue then requires a code. */
  twoFactorEnabled?: boolean
  /** UTC creation timestamp (ISO 8601). */
  createdAtUtc?: string | null
  /** Branch the user works in; null means the tenant's default branch. */
  currentBranchId?: string | null
}

/** Identity.Contracts UserRoleDto. One row per role in the system; `enabled` marks the user's memberships. */
export interface DotnetUserRole {
  roleId?: string | null
  roleName?: string | null
  description?: string | null
  enabled: boolean
}

/** Reference.Contracts DashboardContextDto. */
export interface DotnetDashboardContext {
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

// ---- Shapes the dashboard renders ------------------------------------------------------------

export interface DashboardLowStockItem {
  id: string
  name: string
  /** Total on-hand across batches. */
  stockQuantity: number
  /** The reorder level the medicine fell below. */
  minimumStock: number
}

export interface DashboardExpiringItem {
  id: string
  name: string
  /** Nearest batch expiry, YYYY-MM-DD. */
  expiry: string
  daysUntilExpiry: number
}

export interface DashboardRecentSale {
  id: string
  customerName: string | null
  saleDate: string
  totalAmount: number
}

export interface DashboardHomeData {
  counts: {
    medicines: number
    customers: number
    pendingPrescriptions: number
    monthlyRevenue: number
    todayRevenue: number
  }
  /** Medicines at or below their reorder level, in report order. */
  lowStock: DashboardLowStockItem[]
  /** Medicines whose nearest batch expires within the window, soonest first. */
  expiring: DashboardExpiringItem[]
  recentSales: DashboardRecentSale[]
}

export interface ProfileUserData {
  id: string | null
  email: string | null
  full_name: string | null
  phone: string | null
  /** The .NET user profile has no address column. Always null on the dotnet path. */
  address: null
  role: string | null
  created_at: string | null
  updated_at: null
}

// ---- Mappers ---------------------------------------------------------------------------------

/** Reorder report rows become the low-stock list. Stock is the total across batches. */
export function lowStockFromReorder(rows: readonly DotnetReorderSuggestion[]): DashboardLowStockItem[] {
  return rows.map((row) => ({
    id: row.medicineId,
    name: row.medicineName,
    stockQuantity: row.totalQuantityOnHand,
    minimumStock: row.reorderLevel,
  }))
}

/**
 * Expiring-batch rows are per batch. Keep the nearest batch per medicine, drop anything already expired
 * (the legacy list only counted expiries from today onward), and sort soonest first.
 */
export function expiringFromBatches(rows: readonly DotnetExpiringBatch[]): DashboardExpiringItem[] {
  const nearest = new Map<string, DotnetExpiringBatch>()
  for (const row of rows) {
    if (row.daysUntilExpiry < 0) continue
    const current = nearest.get(row.medicineId)
    if (!current || row.expiryDate < current.expiryDate) nearest.set(row.medicineId, row)
  }
  return [...nearest.values()]
    .map((row) => ({
      id: row.medicineId,
      name: row.medicineName,
      expiry: row.expiryDate,
      daysUntilExpiry: row.daysUntilExpiry,
    }))
    .sort((a, b) => (a.expiry < b.expiry ? -1 : a.expiry > b.expiry ? 1 : 0))
}

export function recentSalesFromDotnet(rows: readonly DotnetSaleRow[]): DashboardRecentSale[] {
  return rows.map((row) => ({
    id: row.id,
    customerName: row.customerName,
    saleDate: row.saleDateUtc,
    totalAmount: row.totalAmount,
  }))
}

/** Pending count for the home KPI. Uses the derived pending status from the prescriptions stats report. */
export function pendingPrescriptionsFromStats(stats: DotnetPrescriptionStats): number {
  return stats.pending
}

/**
 * Builds the home page data from the .NET reports. Each input is one report call; the page never sees
 * the raw .NET rows beyond what it renders.
 */
export function homeDataFromDotnet(input: {
  medicineTotal: DotnetPagedTotal
  customerTotal: DotnetPagedTotal
  prescriptionStats: DotnetPrescriptionStats
  monthSales: DotnetSalesStats
  todaySales: DotnetSalesStats
  reorder: readonly DotnetReorderSuggestion[]
  expiringBatches: readonly DotnetExpiringBatch[]
  recentSales: readonly DotnetSaleRow[]
}): DashboardHomeData {
  return {
    counts: {
      medicines: input.medicineTotal.totalCount,
      customers: input.customerTotal.totalCount,
      pendingPrescriptions: pendingPrescriptionsFromStats(input.prescriptionStats),
      monthlyRevenue: input.monthSales.totalRevenue,
      todayRevenue: input.todaySales.totalRevenue,
    },
    lowStock: lowStockFromReorder(input.reorder),
    expiring: expiringFromBatches(input.expiringBatches),
    recentSales: recentSalesFromDotnet(input.recentSales),
  }
}

/** Date window for the monthly KPI: the 30 days ending at `now`. Returns ISO strings for the query. */
export function monthlyWindow(now: Date): { dateFromUtc: string; dateToUtc: string } {
  return { dateFromUtc: new Date(now.getTime() - 30 * DAY_MS).toISOString(), dateToUtc: now.toISOString() }
}

/** Date window for today's KPI: from 00:00 UTC of `now`'s date to `now`. Matches the legacy UTC date filter. */
export function todayWindow(now: Date): { dateFromUtc: string; dateToUtc: string } {
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  return { dateFromUtc: startOfDay.toISOString(), dateToUtc: now.toISOString() }
}

/** Sales stats path for a window. Parameter names match the .NET endpoint (dateFromUtc, dateToUtc). */
export function salesStatsPath(window: { dateFromUtc: string; dateToUtc: string }): string {
  return `/sales/stats?${new URLSearchParams({ dateFromUtc: window.dateFromUtc, dateToUtc: window.dateToUtc }).toString()}`
}

/** Count-only paged query, used for "total" KPIs. */
export function totalOnlyQuery(path: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}pageNumber=1&pageSize=1`
}

/** A settings-page stat in the { count, error } shape the page reads. */
export function countResult(total: DotnetPagedTotal | number): { count: number; error: null } {
  return { count: typeof total === "number" ? total : total.totalCount, error: null }
}

/**
 * Identity profile plus the session role, in the users-row shape the profile page and form read.
 * created_at is null when the backend sends no createdAtUtc; the page shows a dash then.
 */
export function profileFromDotnet(profile: DotnetUserProfile, role: string | null): ProfileUserData {
  const fullName = [profile.firstName, profile.lastName].map((part) => part?.trim() ?? "").filter(Boolean).join(" ")
  return {
    id: profile.id ?? null,
    email: profile.email ?? null,
    full_name: fullName || profile.userName?.trim() || null,
    phone: profile.phoneNumber?.trim() || null,
    address: null,
    role,
    created_at: profile.createdAtUtc || null,
    updated_at: null,
  }
}

/**
 * Maps an Identity UserDto plus its role rows to the users-list row the settings page renders.
 * created_at comes from createdAtUtc; it is an empty string when absent (the list shows a dash).
 * updated_at has no backend source, so it is an empty string. The role is the first enabled role;
 * an empty string when the user holds none.
 */
export function userFromDotnet(user: DotnetUserProfile, roles: readonly DotnetUserRole[]): User {
  const fullName = [user.firstName, user.lastName].map((part) => part?.trim() ?? "").filter(Boolean).join(" ")
  return {
    id: user.id ?? "",
    email: user.email ?? "",
    full_name: fullName || user.userName?.trim() || "",
    role: roles.find((role) => role.enabled)?.roleName ?? "",
    phone: user.phoneNumber?.trim() || null,
    is_active: user.isActive ?? true,
    branch_id: user.currentBranchId ?? null,
    created_at: user.createdAtUtc || "",
    updated_at: "",
  }
}

/**
 * Count-only query for a list filtered to one user, e.g. sales by cashierUserId or prescriptions by
 * createdByUserId. Reads totalCount only.
 */
export function userScopedTotalQuery(path: string, filterName: string, userId: string): string {
  return totalOnlyQuery(`${path}?${new URLSearchParams({ [filterName]: userId }).toString()}`)
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "U"
  )
}

/**
 * Maps the .NET dashboard context to the layout's context shape. The DTO carries no role, so the caller
 * passes the session role. The DTO has no country, so `country` is left unset.
 */
export function dashboardContextFromDotnet(
  ctx: DotnetDashboardContext,
  role: string | null,
  permissions: readonly string[] = [],
): DashboardContextResponse {
  const emailName = ctx.userEmail?.split("@")[0] ?? ""
  const name = ctx.userName?.trim() || emailName || "User"
  const rawRole = role ?? "user"
  return {
    user: {
      id: ctx.userId,
      name,
      role: rawRole.charAt(0).toUpperCase() + rawRole.slice(1),
      rawRole,
      initials: initialsOf(name),
      permissions: [...permissions],
    },
    tenant: {
      name: ctx.tenantName ?? ctx.tenantId,
      planCode: ctx.tenantPlan ?? undefined,
    },
    notifications: {
      lowStock: ctx.lowStockCount,
      expiring: ctx.expiringCount,
      pending: ctx.pendingPrescriptionsCount,
      pendingReturns: ctx.pendingReturnsCount,
      pendingRefunds: ctx.pendingRefundsCount,
    },
    branchCount: ctx.branchCount,
  }
}
