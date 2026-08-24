/**
 * Server-only tenant persistence. Used by `app/api/tenants/*`, `app/api/onboarding`,
 * and `app/api/auth/post-login-check` Route Handlers.
 *
 * Tenant + admin-user creation is nearly identical between the superadmin
 * "create tenant" flow and the public onboarding flow, so the shared steps
 * live here as small composable functions and each route keeps only the
 * error-handling behavior that is specific to it (e.g. onboarding treats a
 * settings-seed failure as fatal, the superadmin flow tolerates a known
 * duplicate-key case).
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface TenantListRow {
  id: string
  name: string
  code: string
  country: string | null
  timezone: string | null
  currency: string | null
  is_active: boolean
  created_at: string
}

export async function listTenants(
  supabase: SupabaseClient
): Promise<{ data: TenantListRow[]; error: Error | null }> {
  const { data, error } = await supabase
    .from("tenants")
    .select("id, name, code, country, timezone, currency, is_active, created_at")
    .order("created_at", { ascending: false })

  if (error) {
    return { data: [], error: new Error(error.message) }
  }
  return { data: (data as TenantListRow[]) || [], error: null }
}

export interface TenantAdminAuthSeed {
  email: string
  password: string
  fullName?: string | null
}

/** Creates the Supabase auth user for a new tenant's initial admin. */
export async function createTenantAdminAuthUser(
  supabase: SupabaseClient,
  seed: TenantAdminAuthSeed
): Promise<{ data: { id: string } | null; error: Error | null }> {
  const { data: userResult, error: createUserError } = await supabase.auth.admin.createUser({
    email: seed.email,
    password: seed.password,
    email_confirm: true, // TODO: revert to false once email confirmation flow is re-enabled
    user_metadata: { full_name: seed.fullName },
  })

  if (createUserError || !userResult.user) {
    return { data: null, error: new Error(createUserError?.message || "Failed to create user") }
  }
  return { data: { id: userResult.user.id }, error: null }
}

export interface InsertTenantInput {
  name: string
  code: string
  legalName?: string | null
  licenseNumber?: string | null
  country?: string | null
  timezone?: string | null
  currency?: string | null
  fiscalYearStartMonth?: number | null
}

export async function insertTenant(
  supabase: SupabaseClient,
  input: InsertTenantInput
): Promise<{ data: { id: string; code: string } | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("tenants")
    .insert({
      name: input.name,
      code: input.code,
      legal_name: input.legalName ?? input.name,
      license_number: input.licenseNumber ?? null,
      country: input.country ?? "Nepal",
      timezone: input.timezone ?? "Asia/Kathmandu",
      currency: input.currency ?? "NPR",
      // Nepal's fiscal year runs Shrawan 1 BS -> Ashadh end, which lands in
      // mid-July on the Gregorian calendar — not April (that was an India-style
      // default carried over by mistake; see domain audit item 15).
      fiscal_year_start_month: input.fiscalYearStartMonth ?? 7,
    })
    .select()
    .single()

  if (error || !data) {
    return { data: null, error: new Error(error?.message || "Failed to create tenant") }
  }
  return { data, error: null }
}

export interface InsertTenantAdminAppUserInput {
  id: string
  email: string
  fullName?: string | null
  fallbackName: string
  tenantId: string
  branchId?: string | null
}

export async function insertTenantAdminAppUser(
  supabase: SupabaseClient,
  input: InsertTenantAdminAppUserInput
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from("users").insert({
    id: input.id,
    email: input.email,
    full_name: input.fullName ?? input.fallbackName,
    role: "admin",
    tenant_id: input.tenantId,
    current_branch_id: input.branchId ?? null,
  })

  if (error) {
    return { error: new Error(error.message) }
  }
  return { error: null }
}

/** Seeds the tenant's first branch ("Head Office") so every new tenant has a
 * default branch to operate against instead of requiring manual setup. */
export async function seedDefaultBranch(
  supabase: SupabaseClient,
  tenantId: string,
  tenantCode: string
): Promise<{ data: { id: string } | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("branches")
    .insert({
      tenant_id: tenantId,
      name: "Head Office",
      code: `${tenantCode}-main`,
      is_active: true,
    })
    .select("id")
    .single()

  if (error || !data) {
    return { data: null, error: new Error(error?.message || "Failed to create default branch") }
  }
  return { data, error: null }
}

/** Standard chart of accounts every tenant needs for the accounting module's
 * auto-posting DB triggers (sales, purchases, returns, refunds, payments — see
 * scripts/53-accounting-auto-vouchers-all-flows.sql and friends) to actually post
 * anything. Those trigger functions silently no-op when an expected account code
 * is missing, so without this a tenant's entire accounting module stays dark with
 * no error anywhere — stock/sales/ledgers all work, but accounting_vouchers never
 * gets a row. Mirrors the codes seeded in scripts/51/53/58/65 and the backfill in
 * scripts/81-backfill-chart-of-accounts.sql. */
const DEFAULT_CHART_OF_ACCOUNTS = [
  { code: "1000", name: "Cash on hand", account_type: "asset" },
  { code: "1010", name: "Bank", account_type: "asset" },
  { code: "1100", name: "Accounts receivable", account_type: "asset" },
  { code: "1150", name: "Input VAT recoverable", account_type: "asset" },
  { code: "2000", name: "Output VAT / sales tax payable", account_type: "liability" },
  { code: "2100", name: "Trade payables", account_type: "liability" },
  { code: "3000", name: "Sales revenue", account_type: "revenue" },
  { code: "3100", name: "Sales returns and allowances", account_type: "revenue" },
  { code: "4000", name: "Cost of goods sold", account_type: "expense" },
  { code: "5000", name: "Merchandise inventory", account_type: "asset" },
  { code: "6100", name: "Cash over / short", account_type: "expense" },
] as const

export async function seedDefaultChartOfAccounts(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ error: Error | null }> {
  const { data: inserted, error } = await supabase
    .from("accounting_accounts")
    .insert(
      DEFAULT_CHART_OF_ACCOUNTS.map((a) => ({
        tenant_id: tenantId,
        code: a.code,
        name: a.name,
        account_type: a.account_type,
        is_system: true,
      }))
    )
    .select("id, code")

  if (error) {
    return { error: new Error(error.message) }
  }

  const cashOverShort = inserted?.find((a) => a.code === "6100")
  if (cashOverShort) {
    await supabase
      .from("accounting_account_map")
      .insert({ tenant_id: tenantId, map_key: "cash_over_short", account_id: cashOverShort.id })
  }

  return { error: null }
}

export interface SeedTenantSettingsInput {
  tenantId: string
  pharmacyName: string
  country?: string | null
  currency?: string | null
}

export async function seedDefaultTenantSettings(
  supabase: SupabaseClient,
  input: SeedTenantSettingsInput
): Promise<{ error: Error | null }> {
  const defaultSettings = [
    { key: "pharmacy_name", value: input.pharmacyName, type: "string", category: "general" },
    { key: "pharmacy_country", value: input.country ?? "Nepal", type: "string", category: "general" },
    { key: "tax_rate", value: "0.13", type: "number", category: "sales" },
    { key: "currency", value: input.currency ?? "NPR", type: "string", category: "general" },
    { key: "low_stock_threshold", value: "0.2", type: "number", category: "inventory" },
    { key: "expiry_warning_days", value: "30", type: "number", category: "inventory" },
    { key: "enable_barcode", value: "true", type: "boolean", category: "inventory" },
    { key: "enable_notifications", value: "true", type: "boolean", category: "general" },
  ]

  const { error } = await supabase.from("system_settings").insert(
    defaultSettings.map((s) => ({ ...s, tenant_id: input.tenantId }))
  )

  if (error) {
    return { error: new Error(error.message) }
  }
  return { error: null }
}

/** Best-effort: attach a subscription plan by code if it exists. Silently no-ops otherwise. */
export async function attachTenantPlan(supabase: SupabaseClient, tenantId: string, planCode: string): Promise<void> {
  const { data: plan } = await supabase.from("plans").select("id").eq("code", planCode).single()
  if (plan) {
    await supabase.from("tenant_subscriptions").insert({
      tenant_id: tenantId,
      plan_id: plan.id,
      status: "trial",
    })
  }
}

export interface UpdateTenantPatch {
  name?: string
  country?: string
  timezone?: string
  currency?: string
  is_active?: boolean
}

export async function updateTenant(
  supabase: SupabaseClient,
  tenantId: string,
  patch: UpdateTenantPatch | Record<string, unknown>
): Promise<{ data: unknown | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("tenants")
    .update(patch)
    .eq("id", tenantId)
    .select("id, name, code, country, timezone, currency, is_active, created_at")
    .single()

  if (error) {
    return { data: null, error: new Error(error.message) }
  }
  return { data, error: null }
}

export interface TenantDependencySummary {
  users: number
  sales: number
  medicines: number
  customers: number
  prescriptions: number
  purchaseOrders: number
}

/** Counts the tenant's core business records, used to decide whether a hard
 * delete needs the extra "this destroys data" confirmation step. */
export async function getTenantDependencySummary(
  supabase: SupabaseClient,
  tenantId: string
): Promise<TenantDependencySummary> {
  const countOf = async (table: string) => {
    const { count } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
    return count ?? 0
  }

  const [users, sales, medicines, customers, prescriptions, purchaseOrders] = await Promise.all([
    countOf("users"),
    countOf("sales"),
    countOf("medicines"),
    countOf("customers"),
    countOf("prescriptions"),
    countOf("purchase_orders"),
  ])

  return { users, sales, medicines, customers, prescriptions, purchaseOrders }
}

export function tenantHasDependentData(summary: TenantDependencySummary): boolean {
  return Object.values(summary).some((count) => count > 0)
}

/** Sales and prescriptions are dispensing records — the narcotic-register report
 *  assumes exactly this data survives, so a tenant that has any is not eligible for
 *  hard deletion at all (regardless of password confirmation). See audit Module 04:
 *  ON DELETE CASCADE meant this data could be destroyed on demand with no retention
 *  hold. deactivateTenant() (is_active=false) is the only path once this is true. */
export function tenantHasRetainedDispensingHistory(summary: TenantDependencySummary): boolean {
  return summary.sales > 0 || summary.prescriptions > 0
}

export async function deleteTenant(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ error: Error | null }> {
  // Auth users for this tenant aren't reachable via the tenants(id) FK chain
  // (public.users references auth.users, not the other way around), so a
  // cascading tenant delete would otherwise leave orphaned Supabase Auth
  // accounts behind.
  const { data: tenantUsers } = await supabase.from("users").select("id").eq("tenant_id", tenantId)
  for (const u of tenantUsers ?? []) {
    await supabase.auth.admin.deleteUser((u as { id: string }).id).catch(() => undefined)
  }

  const { error } = await supabase.from("tenants").delete().eq("id", tenantId)
  if (error) {
    return { error: new Error(error.message) }
  }
  return { error: null }
}

export interface TenantByCodeRow {
  id: string
  name: string
  code: string
}

/** Public lookup: resolve an active tenant by its slug/code. */
export async function getActiveTenantByCode(
  supabase: SupabaseClient,
  code: string
): Promise<{ data: TenantByCodeRow | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("tenants")
    .select("id, name, code")
    .eq("code", code.trim().toLowerCase())
    .eq("is_active", true)
    .single()

  if (error || !data) {
    return { data: null, error: error ? new Error(error.message) : null }
  }
  return { data: data as TenantByCodeRow, error: null }
}

export interface TenantStatusRow {
  id: string
  code: string
  is_active: boolean
}

/** Lookup used by post-login-check to validate the pharmacy code matches the user's tenant. */
export async function getTenantStatusById(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ data: TenantStatusRow | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("tenants")
    .select("id, code, is_active")
    .eq("id", tenantId)
    .single()

  if (error || !data) {
    return { data: null, error: error ? new Error(error.message) : null }
  }
  return { data: data as TenantStatusRow, error: null }
}
