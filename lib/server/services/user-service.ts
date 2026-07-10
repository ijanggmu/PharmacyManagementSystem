/**
 * Server-only user persistence. Used by `app/api/users/*` Route Handlers.
 * Keeps Supabase and business rules out of the React tree and portable later.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface ListUsersInput {
  search?: string | null
  role?: string | null
  page: number
  limit: number
  sortBy: string
  sortOrder: "asc" | "desc"
}

export async function listUsers(
  supabase: SupabaseClient,
  input: ListUsersInput
): Promise<{ data: unknown[]; count: number; error: Error | null }> {
  let query = supabase.from("users").select("*", { count: "exact" })

  if (input.search?.trim()) {
    const s = input.search.trim()
    query = query.or(`full_name.ilike.%${s}%,email.ilike.%${s}%,role.ilike.%${s}%`)
  }
  if (input.role) {
    query = query.eq("role", input.role)
  }

  query = query.order(input.sortBy, { ascending: input.sortOrder === "asc" })

  const from = (input.page - 1) * input.limit
  const to = from + input.limit - 1
  query = query.range(from, to)

  const { data, error, count } = await query
  if (error) {
    return { data: [], count: 0, error: new Error(error.message) }
  }
  return { data: data || [], count: count ?? 0, error: null }
}

export async function getUserById(
  supabase: SupabaseClient,
  id: string
): Promise<{ data: unknown | null; error: Error | null }> {
  const { data, error } = await supabase.from("users").select("*").eq("id", id).single()
  if (error) {
    return { data: null, error: new Error(error.message) }
  }
  return { data, error: null }
}

export interface UpdateUserPatch {
  email?: string
  full_name?: string
  role?: string
  phone?: string | null
}

/** Number of admin-equivalent (admin/superadmin) users remaining in a tenant, excluding one id. */
export async function countRemainingAdminsForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  excludingUserId: string
): Promise<{ count: number; error: Error | null }> {
  const { count, error } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .in("role", ["admin", "superadmin"])
    .neq("id", excludingUserId)

  if (error) {
    return { count: 0, error: new Error(error.message) }
  }
  return { count: count ?? 0, error: null }
}

/** Tenant-scoped update — id AND tenant_id must both match, preventing cross-tenant targeting. */
export async function updateUser(
  supabase: SupabaseClient,
  id: string,
  tenantId: string,
  patch: UpdateUserPatch
): Promise<{ data: unknown | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("users")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("*")
    .single()
  if (error) {
    return { data: null, error: new Error(error.message) }
  }
  return { data, error: null }
}

/** Tenant-scoped delete — id AND tenant_id must both match, preventing cross-tenant targeting. */
export async function deleteUser(
  supabase: SupabaseClient,
  id: string,
  tenantId: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from("users").delete().eq("id", id).eq("tenant_id", tenantId)
  if (error) {
    return { error: new Error(error.message) }
  }
  return { error: null }
}

/** Used by session/post-login-check flows to resolve tenant + role for the current app user. */
export async function getUserTenantAndRole(
  supabase: SupabaseClient,
  userId: string
): Promise<{ data: { tenant_id: string | null; role: string | null } | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("users")
    .select("tenant_id, role")
    .eq("id", userId)
    .single()
  if (error) {
    return { data: null, error: new Error(error.message) }
  }
  return { data: data as { tenant_id: string | null; role: string | null }, error: null }
}

/** Plan's max_users limit for the tenant's current active/trial subscription, if any is configured. */
export async function getActiveSubscriptionMaxUsers(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ maxUsers: number | null; error: Error | null }> {
  const { data: sub, error } = await supabase
    .from("tenant_subscriptions")
    .select("plan_id, status, plans!inner(max_users)")
    .eq("tenant_id", tenantId)
    .in("status", ["trial", "active"])
    .order("valid_from", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return { maxUsers: null, error: new Error(error.message) }
  }

  const plan = sub?.plans && Array.isArray(sub.plans) ? sub.plans[0] : (sub?.plans as { max_users?: number } | null)
  return { maxUsers: plan?.max_users ?? null, error: null }
}

export async function countUsersForTenant(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ count: number; error: Error | null }> {
  const { count, error } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)

  if (error) {
    return { count: 0, error: new Error(error.message) }
  }
  return { count: count ?? 0, error: null }
}

export interface InviteUserInput {
  email: string
  fullName: string
  role: string
  phone?: string | null
  password: string
}

/** Creates the auth user + app user row for a tenant invite (uses service-role client). */
export async function createTenantUserWithAuth(
  supabase: SupabaseClient,
  tenantId: string,
  input: InviteUserInput
): Promise<{
  data: { id: string; email: string; full_name: string; role: string; phone: string | null } | null
  error: Error | null
  step: "create_user" | "create_app_user" | null
}> {
  const { data: userResult, error: createUserError } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true, // TODO: revert to false once email confirmation flow is re-enabled
    user_metadata: {
      full_name: input.fullName,
      phone: input.phone,
    },
  })

  if (createUserError || !userResult.user) {
    return {
      data: null,
      error: new Error(createUserError?.message || "Failed to create auth user"),
      step: "create_user",
    }
  }

  const authUser = userResult.user

  const { error: appUserError } = await supabase.from("users").insert({
    id: authUser.id,
    email: input.email,
    full_name: input.fullName,
    role: input.role,
    phone: input.phone || null,
    tenant_id: tenantId,
  })

  if (appUserError) {
    return { data: null, error: new Error(appUserError.message), step: "create_app_user" }
  }

  return {
    data: {
      id: authUser.id,
      email: input.email,
      full_name: input.fullName,
      role: input.role,
      phone: input.phone || null,
    },
    error: null,
    step: null,
  }
}
