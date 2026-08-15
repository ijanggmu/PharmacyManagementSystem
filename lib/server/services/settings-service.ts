/**
 * Server-only settings persistence. Used by `app/api/settings/route.ts` Route Handlers.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface SystemSettingRecord {
  id: string
  tenant_id: string
  key: string
  value: string
  type: string
  category?: string | null
  updated_at?: string
}

export async function listSettingsForTenant(
  supabase: SupabaseClient,
  tenantId: string | undefined,
  category: string | null
): Promise<{ data: SystemSettingRecord[]; error: Error | null }> {
  let query = supabase
    .from("system_settings")
    .select("*")
    .eq("tenant_id", tenantId)

  if (category) {
    query = query.eq("category", category)
  }

  query = query.order("key", { ascending: true })

  const { data, error } = await query
  if (error) {
    return { data: [], error: new Error(error.message) }
  }
  return { data: (data as SystemSettingRecord[]) || [], error: null }
}

export interface UpsertSettingInput {
  key: string
  value: unknown
  type?: string
}

export async function upsertSettingForTenant(
  supabase: SupabaseClient,
  tenantId: string | undefined,
  input: UpsertSettingInput
): Promise<{ data: SystemSettingRecord | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("system_settings")
    .upsert(
      {
        key: input.key,
        value: String(input.value),
        type: input.type || "string",
        tenant_id: tenantId,
        updated_at: new Date().toISOString(),
      },
      // Without this, Supabase upserts on the primary key (id) — since we never pass
      // one, every save is actually an INSERT, which previously collided with the
      // now-removed global UNIQUE(key) constraint and always fails once any tenant
      // already has that key. Target the real per-tenant uniqueness instead.
      { onConflict: "tenant_id,key" }
    )
    .select()
    .single()

  if (error) {
    return { data: null, error: new Error(error.message) }
  }
  return { data: data as SystemSettingRecord, error: null }
}
