/**
 * Price-list versioning / effective-dated pricing (2026-09 ERP audit, priority
 * item #9). Automatic capture (any direct medicines.unit_price/cost_price edit)
 * is a DB trigger (scripts/102-price-list-versioning.sql) — nothing here needs
 * to duplicate that. This service covers the additive part: scheduling a
 * future price change, listing history, and sweeping due schedules into effect.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface MedicinePriceHistoryRow {
  id: string
  medicine_id: string
  unit_price: number
  cost_price: number | null
  effective_from: string
  effective_to: string | null
  status: "scheduled" | "active" | "superseded" | "cancelled"
  source: "trigger" | "manual"
  reason: string | null
  created_at: string
}

const SELECT = "id, medicine_id, unit_price, cost_price, effective_from, effective_to, status, source, reason, created_at"

export async function listMedicinePriceHistory(
  supabase: SupabaseClient,
  tenantId: string,
  medicineId: string
): Promise<{ data: MedicinePriceHistoryRow[]; error: Error | null }> {
  const { data, error } = await supabase
    .from("medicine_price_history")
    .select(SELECT)
    .eq("tenant_id", tenantId)
    .eq("medicine_id", medicineId)
    .neq("status", "cancelled")
    .order("effective_from", { ascending: false })
    .order("created_at", { ascending: false })

  if (error) return { data: [], error: new Error(error.message) }
  return { data: (data || []) as MedicinePriceHistoryRow[], error: null }
}

export async function scheduleMedicinePriceChange(
  supabase: SupabaseClient,
  input: { medicineId: string; unitPrice: number; effectiveFrom: string; costPrice?: number | null; reason?: string | null }
): Promise<{ data: { id: string } | null; error: Error | null }> {
  const { data, error } = await supabase.rpc("schedule_medicine_price", {
    p_medicine_id: input.medicineId,
    p_unit_price: input.unitPrice,
    p_effective_from: input.effectiveFrom,
    p_cost_price: input.costPrice ?? null,
    p_reason: input.reason ?? null,
  })

  if (error) return { data: null, error: new Error(error.message) }
  return { data: { id: data as string }, error: null }
}

export async function cancelScheduledMedicinePrice(
  supabase: SupabaseClient,
  historyId: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc("cancel_scheduled_medicine_price", { p_history_id: historyId })
  if (error) return { error: new Error(error.message) }
  return { error: null }
}

/** Promotes any 'scheduled' rows whose effective_from has arrived. Cheap to
 *  call opportunistically (e.g. from the medicines list route) since it first
 *  checks whether anything is actually due before doing any writes. */
export async function applyDueMedicinePriceSchedulesIfAny(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ applied: number; error: Error | null }> {
  const { data: due, error: checkErr } = await supabase
    .from("medicine_price_history")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("status", "scheduled")
    .lte("effective_from", new Date().toISOString().slice(0, 10))
    .limit(1)

  if (checkErr) return { applied: 0, error: new Error(checkErr.message) }
  if (!due || due.length === 0) return { applied: 0, error: null }

  const { data, error } = await supabase.rpc("apply_due_medicine_price_schedules")
  if (error) return { applied: 0, error: new Error(error.message) }
  return { applied: Number(data ?? 0), error: null }
}
