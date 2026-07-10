/**
 * Server-only category persistence. Used by `app/api/categories/route.ts` Route Handlers.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { CreateCategoryInput } from "@/lib/server/schemas/categories"

export interface CategoryRecord {
  id: string
  name: string
}

export async function listCategoriesForTenant(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ data: CategoryRecord[]; error: Error | null }> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true })

  if (error) {
    return { data: [], error: new Error(error.message) }
  }
  return { data: (data as CategoryRecord[]) || [], error: null }
}

export async function createCategoryForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  input: CreateCategoryInput
): Promise<{ data: CategoryRecord | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("categories")
    .insert({ name: input.name, tenant_id: tenantId })
    .select("id, name")
    .single()

  if (error) {
    return { data: null, error: new Error(error.message) }
  }
  return { data: data as CategoryRecord, error: null }
}
