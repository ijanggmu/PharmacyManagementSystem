import type { SupabaseClient } from "@supabase/supabase-js"
import { getPrimaryBranchId } from "@/lib/server/services/tenant-branch"

export interface CreateSupplierReturnItemInput {
  medicine_id: string
  quantity: number
  unit_cost: number
  return_reason: string
  notes?: string | null
}

export interface CreateSupplierReturnInput {
  supplier_id: string
  notes?: string | null
  items: CreateSupplierReturnItemInput[]
}

export async function createSupplierReturnForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  input: CreateSupplierReturnInput
): Promise<{ data: unknown | null; error: Error | null; conflict?: string }> {
  const totalQuantity = input.items.reduce((sum, i) => sum + i.quantity, 0)
  const totalCost = input.items.reduce((sum, i) => sum + i.quantity * i.unit_cost, 0)
  const today = new Date().toISOString().slice(0, 10)

  let branchId: string | null = null
  const { data: actor } = await supabase
    .from("users")
    .select("current_branch_id")
    .eq("id", userId)
    .maybeSingle()
  branchId = (actor as { current_branch_id: string | null } | null)?.current_branch_id ?? null
  if (!branchId) {
    branchId = await getPrimaryBranchId(supabase, tenantId)
  }

  for (const item of input.items) {
    const { data: med, error: medErr } = await supabase
      .from("medicines")
      .select("id")
      .eq("id", item.medicine_id)
      .eq("tenant_id", tenantId)
      .single()
    if (medErr || !med) {
      return { data: null, error: new Error(`Medicine not found: ${item.medicine_id}`) }
    }

    const { data: branchStock } = await supabase
      .from("medicine_branch_stock")
      .select("stock_quantity")
      .eq("branch_id", branchId)
      .eq("medicine_id", item.medicine_id)
      .maybeSingle()
    const available = Number((branchStock as { stock_quantity?: number } | null)?.stock_quantity ?? 0)

    if (available < item.quantity) {
      return {
        data: null,
        error: new Error(`Insufficient stock for medicine ${item.medicine_id} at this branch. Available: ${available}`),
      }
    }
  }

  const { data: returnHeader, error: returnErr } = await supabase
    .from("supplier_returns")
    .insert({
      supplier_id: input.supplier_id,
      user_id: userId,
      quantity_returned: totalQuantity,
      total_cost: totalCost,
      return_reason: "supplier_return",
      status: "completed",
      notes: input.notes ?? null,
      tenant_id: tenantId,
      return_date: today,
      medicine_id: null,
    })
    .select()
    .single()

  if (returnErr || !returnHeader) {
    return { data: null, error: new Error(returnErr?.message || "Failed to create supplier return") }
  }

  const rows = input.items.map((i) => ({
    return_id: returnHeader.id,
    medicine_id: i.medicine_id,
    quantity: i.quantity,
    unit_cost: i.unit_cost,
    total_cost: i.quantity * i.unit_cost,
    return_reason: i.return_reason,
    notes: i.notes ?? null,
    tenant_id: tenantId,
  }))
  const { error: itemsErr } = await supabase.from("supplier_return_items").insert(rows)
  if (itemsErr) {
    await supabase.from("supplier_returns").delete().eq("id", returnHeader.id).eq("tenant_id", tenantId)
    return { data: null, error: new Error(itemsErr.message) }
  }

  for (const item of input.items) {
    const { data: branchStock } = await supabase
      .from("medicine_branch_stock")
      .select("stock_quantity")
      .eq("branch_id", branchId)
      .eq("medicine_id", item.medicine_id)
      .maybeSingle()
    const newStock = Number((branchStock as { stock_quantity?: number } | null)?.stock_quantity ?? 0) - item.quantity

    const { error: stockErr } = await supabase
      .from("medicine_branch_stock")
      .upsert(
        { tenant_id: tenantId, branch_id: branchId, medicine_id: item.medicine_id, stock_quantity: Math.max(0, newStock) },
        { onConflict: "branch_id,medicine_id" }
      )
    if (stockErr) return { data: null, error: new Error(stockErr.message) }

    const { error: invErr } = await supabase.from("inventory_transactions").insert({
      medicine_id: item.medicine_id,
      transaction_type: "adjustment",
      quantity: -item.quantity,
      reference_id: returnHeader.id,
      reference_type: "supplier_return",
      tenant_id: tenantId,
      branch_id: branchId,
      notes: `Return to supplier ${returnHeader.return_number ?? returnHeader.id}`,
    })
    if (invErr) return { data: null, error: new Error(invErr.message) }
  }

  return { data: returnHeader, error: null }
}
