/**
 * Server-only superadmin persistence. Used by `app/api/superadmin/*` Route Handlers.
 * All functions here use a service-role Supabase client passed in by the caller.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export const TENANT_USER_ROLE_VALUES = ["admin", "pharmacist", "cashier", "manager", "staff"] as const
export type TenantUserRole = (typeof TENANT_USER_ROLE_VALUES)[number]

export interface TenantOverviewStats {
  users: number
  medicines: number
  customers: number
  sales: number
  branches: number
}

export interface TenantOverviewResult {
  tenant: Record<string, unknown>
  stats: TenantOverviewStats
  users: unknown[]
}

/** Superadmin: tenant record + aggregate counts + recent users for a tenant. */
export async function getTenantOverview(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ data: TenantOverviewResult | null; error: Error | null }> {
  const [
    { data: tenant },
    usersCount,
    usersRes,
    medicinesCount,
    customersCount,
    salesCount,
    branchesCount,
  ] = await Promise.all([
    supabase.from("tenants").select("*").eq("id", tenantId).single(),
    supabase.from("users").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    supabase
      .from("users")
      .select("id, email, full_name, role, phone, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("medicines").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    supabase.from("sales").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    supabase.from("branches").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
  ])

  if (!tenant) {
    return { data: null, error: null }
  }

  return {
    data: {
      tenant,
      stats: {
        users: usersCount.count || 0,
        medicines: medicinesCount.count || 0,
        customers: customersCount.count || 0,
        sales: salesCount.count || 0,
        branches: branchesCount.count || 0,
      },
      users: usersRes?.data ?? [],
    },
    error: null,
  }
}

export interface CreateTenantUserInput {
  email: string
  fullName: string
  phone?: string | null
  role: TenantUserRole
  password: string
}

/** Superadmin: create an auth user + app user row bound to a specific tenant, with compensation on partial failure. */
export async function createTenantUser(
  supabase: SupabaseClient,
  tenantId: string,
  input: CreateTenantUserInput
): Promise<{
  data: { id: string; email: string; full_name: string; role: string; phone: string | null } | null
  error: Error | null
  step: "create_user" | "create_app_user" | null
}> {
  const { data: authResult, error: createAuthError } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true, // TODO: revert to false once email confirmation flow is re-enabled
    user_metadata: {
      full_name: input.fullName,
      phone: input.phone,
      role: input.role,
      tenant_id: tenantId,
    },
  })

  if (createAuthError || !authResult?.user) {
    return {
      data: null,
      error: new Error(createAuthError?.message || "Failed to create user"),
      step: "create_user",
    }
  }

  const authUser = authResult.user

  const { error: appInsertError } = await supabase.from("users").insert({
    id: authUser.id,
    email: input.email,
    full_name: input.fullName,
    role: input.role,
    phone: input.phone,
    tenant_id: tenantId,
  })

  if (appInsertError) {
    // Compensating action: remove auth user if app user row fails.
    await supabase.auth.admin.deleteUser(authUser.id).catch(() => null)
    return { data: null, error: new Error(appInsertError.message), step: "create_app_user" }
  }

  return {
    data: {
      id: authUser.id,
      email: input.email,
      full_name: input.fullName,
      role: input.role,
      phone: input.phone ?? null,
    },
    error: null,
    step: null,
  }
}

export interface TenantUserRecord {
  id: string
  role: string
  tenant_id: string | null
}

export async function getTenantUserById(
  supabase: SupabaseClient,
  userId: string
): Promise<{ data: TenantUserRecord | null; error: Error | null }> {
  const { data, error } = await supabase.from("users").select("id, role, tenant_id").eq("id", userId).single()
  if (error || !data) {
    return { data: null, error: error ? new Error(error.message) : null }
  }
  return { data: data as TenantUserRecord, error: null }
}

export async function countTenantAdmins(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ count: number; error: Error | null }> {
  const { count, error } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("role", "admin")

  if (error) {
    return { count: 0, error: new Error(error.message) }
  }
  return { count: count ?? 0, error: null }
}

export interface UpdateTenantUserPatch {
  fullName: string
  phone: string | null
  role: TenantUserRole
}

export async function updateTenantUser(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  patch: UpdateTenantUserPatch
): Promise<{ data: unknown | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("users")
    .update({
      full_name: patch.fullName,
      phone: patch.phone,
      role: patch.role,
    })
    .eq("id", userId)
    .eq("tenant_id", tenantId)
    .select("id, email, full_name, role, phone, created_at")
    .single()

  if (error) {
    return { data: null, error: new Error(error.message) }
  }
  return { data, error: null }
}

export async function deleteTenantUser(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string
): Promise<{ error: Error | null }> {
  // Delete auth user first (also prevents future logins)
  await supabase.auth.admin.deleteUser(userId).catch(() => null)

  const { error } = await supabase.from("users").delete().eq("id", userId).eq("tenant_id", tenantId)
  if (error) {
    return { error: new Error(error.message) }
  }
  return { error: null }
}

export interface TenantUserEmailRecord {
  id: string
  email: string
  role: string
  tenant_id: string | null
}

export async function getTenantUserWithEmail(
  supabase: SupabaseClient,
  userId: string
): Promise<{ data: TenantUserEmailRecord | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("users")
    .select("id, email, role, tenant_id")
    .eq("id", userId)
    .single()

  if (error || !data) {
    return { data: null, error: error ? new Error(error.message) : null }
  }
  return { data: data as TenantUserEmailRecord, error: null }
}

export async function sendTenantUserPasswordReset(
  supabase: SupabaseClient,
  email: string,
  redirectTo: string
): Promise<{ error: Error | null }> {
  const { error } = await (supabase.auth.admin as unknown as {
    generateLink: (params: {
      type: string
      email: string
      options: { redirectTo: string }
    }) => Promise<{ error: { message: string } | null }>
  }).generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  })

  if (error) {
    return { error: new Error(error.message || "Failed to generate reset link") }
  }
  return { error: null }
}
