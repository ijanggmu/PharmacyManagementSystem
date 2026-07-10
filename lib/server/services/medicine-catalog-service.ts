/**
 * Server-only medicine catalog persistence. Used by `app/api/medicine-catalog/*` Route Handlers.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface NepalMedicineCatalogRecord {
  id: string
  brand_name: string
  generic_name: string | null
  form: string | null
  strength: string | null
  manufacturer: string | null
  category_name: string | null
  dosage: string | null
  unit_price: number | null
  cost_price: number | null
  description: string | null
  side_effects: string | null
  storage_instructions: string | null
  prescription_required: boolean
}

export interface SearchNepalCatalogInput {
  query: string
  limit: number
}

export function parseSearchNepalCatalogInput(searchParams: URLSearchParams): SearchNepalCatalogInput {
  const query = searchParams.get("q")?.trim() ?? ""
  const limit = Math.min(Number(searchParams.get("limit") || "10"), 25)
  return { query, limit }
}

export async function searchNepalMedicineCatalog(
  supabase: SupabaseClient,
  input: SearchNepalCatalogInput
): Promise<{ data: NepalMedicineCatalogRecord[]; error: Error | null }> {
  let query = supabase
    .from("nepal_medicine_catalog")
    .select(
      "id, brand_name, generic_name, form, strength, manufacturer, category_name, dosage, unit_price, cost_price, description, side_effects, storage_instructions, prescription_required"
    )
    .order("brand_name", { ascending: true })
    .limit(input.limit)

  if (input.query.length >= 2) {
    query = query.or(`brand_name.ilike.%${input.query}%,generic_name.ilike.%${input.query}%`)
  }

  const { data, error } = await query
  if (error) {
    return { data: [], error: new Error(error.message) }
  }
  return { data: (data as NepalMedicineCatalogRecord[]) || [], error: null }
}
