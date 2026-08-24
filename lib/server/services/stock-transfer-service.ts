/**
 * Inter-branch stock transfer — the old stock_transfers table was dropped as unused
 * with no replacement (see audit, Module 03). This is a fresh, minimal, atomic
 * version: see create_stock_transfer() in scripts/87-purchasing-accounting-controls.sql.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface CreateStockTransferInput {
  from_branch_id: string
  to_branch_id: string
  notes?: string | null
  items: Array<{ medicine_id: string; quantity: number }>
}

export async function createStockTransfer(
  supabase: SupabaseClient,
  tenantId: string,
  actorUserId: string,
  input: CreateStockTransferInput
): Promise<{ data: { id: string } | null; error: Error | null }> {
  if (input.items.length === 0) {
    return { data: null, error: new Error("At least one item is required") }
  }

  const { data, error } = await supabase.rpc("create_stock_transfer", {
    p_tenant_id: tenantId,
    p_from_branch_id: input.from_branch_id,
    p_to_branch_id: input.to_branch_id,
    p_actor_user_id: actorUserId,
    p_notes: input.notes ?? null,
    p_items: input.items,
  })

  if (error) return { data: null, error: new Error(error.message) }
  return { data: { id: data as string }, error: null }
}

const TRANSFER_SELECT = `
  *,
  from_branch:branches!stock_transfers_from_branch_id_fkey (id, name, code),
  to_branch:branches!stock_transfers_to_branch_id_fkey (id, name, code),
  stock_transfer_items (
    id,
    medicine_id,
    quantity,
    medicines (id, name, strength, form)
  )
`

export async function receiveStockTransfer(
  supabase: SupabaseClient,
  tenantId: string,
  actorUserId: string,
  transferId: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc("receive_stock_transfer", {
    p_transfer_id: transferId,
    p_tenant_id: tenantId,
    p_actor_user_id: actorUserId,
  })
  if (error) return { error: new Error(error.message) }
  return { error: null }
}

export async function cancelStockTransfer(
  supabase: SupabaseClient,
  tenantId: string,
  actorUserId: string,
  transferId: string,
  reason: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc("cancel_stock_transfer", {
    p_transfer_id: transferId,
    p_tenant_id: tenantId,
    p_actor_user_id: actorUserId,
    p_reason: reason,
  })
  if (error) return { error: new Error(error.message) }
  return { error: null }
}

export async function listStockTransfers(
  supabase: SupabaseClient,
  tenantId: string,
  filters: { branchId?: string; limit?: number } = {}
) {
  let query = supabase
    .from("stock_transfers")
    .select(TRANSFER_SELECT)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 50)

  if (filters.branchId) {
    query = query.or(`from_branch_id.eq.${filters.branchId},to_branch_id.eq.${filters.branchId}`)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data ?? []
}
