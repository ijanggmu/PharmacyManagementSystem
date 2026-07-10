/**
 * Server-only medicine/inventory persistence. Used by `app/api/medicines/*` Route Handlers.
 * Keeps Supabase and business rules out of the React tree and portable to .NET later.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { postDirectInventorySupplierReceipts } from "@/lib/server/services/inventory-supplier-receipt-service"
import { getPrimaryBranchId } from "@/lib/server/services/tenant-branch"

const MEDICINE_SELECT = `
  *,
  categories (id, name),
  suppliers (id, name)
`

export interface ListMedicinesInput {
  search: string | null
  category: string | null
  categoryIds: string[]
  stockStatus: string | null
  stockStatuses: ("in" | "low" | "out")[]
  expiryStatus: string | null
  expiryStatuses: ("expiring" | "expired")[]
  page: number
  limit: number
  sortBy: string
  sortOrder: string
}

/** Build list input from GET /api/medicines query string. */
export function parseListMedicinesInput(searchParams: URLSearchParams): ListMedicinesInput {
  const categoryIdsRaw = searchParams.get("categoryIds")
  const categoryIds = categoryIdsRaw
    ? categoryIdsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : []
  const stockStatusesRaw = searchParams.get("stockStatuses")
  const stockStatuses = stockStatusesRaw
    ? (stockStatusesRaw.split(",").map((s) => s.trim()).filter(Boolean) as ("in" | "low" | "out")[])
    : []
  const expiryStatusesRaw = searchParams.get("expiryStatuses")
  const expiryStatuses = expiryStatusesRaw
    ? (expiryStatusesRaw.split(",").map((s) => s.trim()).filter(Boolean) as ("expiring" | "expired")[])
    : []

  return {
    search: searchParams.get("search"),
    category: searchParams.get("category"),
    categoryIds,
    stockStatus: searchParams.get("stockStatus"),
    stockStatuses,
    expiryStatus: searchParams.get("expiryStatus"),
    expiryStatuses,
    page: parseInt(searchParams.get("page") || "1"),
    limit: parseInt(searchParams.get("limit") || "50"),
    sortBy: searchParams.get("sortBy") || "name",
    sortOrder: searchParams.get("sortOrder") || "asc",
  }
}

type MedRow = {
  stock_quantity: number
  minimum_stock: number
  expiry_date: string | null
}

function matchStock(m: MedRow, s: "in" | "low" | "out") {
  if (s === "out") return m.stock_quantity === 0
  if (s === "low") return m.stock_quantity <= m.minimum_stock && m.stock_quantity > 0
  return m.stock_quantity > m.minimum_stock
}

function matchExpiry(m: MedRow, s: "expiring" | "expired", currentDate: string, thirtyDaysFromNow: string) {
  const d = m.expiry_date
  if (!d) return false
  if (s === "expired") return d < currentDate
  return d >= currentDate && d <= thirtyDaysFromNow
}

function applyBaseFilters(
  query: any,
  input: ListMedicinesInput,
  opts: { forCount?: boolean },
  currentDate: string,
  thirtyDaysFromNow: string
) {
  let qq = query
  if (input.search) {
    qq = qq.or(
      `name.ilike.%${input.search}%,generic_name.ilike.%${input.search}%,brand_name.ilike.%${input.search}%`
    )
  }
  if (input.categoryIds.length) {
    qq = qq.in("category_id", input.categoryIds)
  } else if (input.category) {
    qq = qq.eq("category_id", input.category)
  }
  if (input.stockStatuses.length === 0 && input.stockStatus === "out") {
    qq = qq.eq("stock_quantity", 0)
  }
  const singleExpiry = input.expiryStatuses.length === 0 && input.expiryStatus && input.expiryStatus !== "all"
  if (singleExpiry) {
    if (input.expiryStatus === "expired") {
      qq = qq.lt("expiry_date", currentDate)
    } else if (input.expiryStatus === "expiring") {
      qq = qq.gte("expiry_date", currentDate).lte("expiry_date", thirtyDaysFromNow)
    }
  }
  if (!opts.forCount) {
    qq = qq.order(input.sortBy, { ascending: input.sortOrder === "asc" })
  }
  return qq
}

/** Merges each row's stock at a specific branch (`branch_stock_quantity`) alongside
 *  the tenant-wide total the row already carries — the list otherwise only ever
 *  shows the aggregate, which looks unchanged when switching branches. */
async function attachBranchStock(supabase: SupabaseClient, rows: unknown[], branchId: string | null) {
  if (!branchId || rows.length === 0) return rows
  const ids = rows.map((r) => (r as { id: string }).id)
  const { data: branchStock } = await supabase
    .from("medicine_branch_stock")
    .select("medicine_id, stock_quantity")
    .eq("branch_id", branchId)
    .in("medicine_id", ids)

  const byId = new Map<string, number>(
    (branchStock || []).map((r: { medicine_id: string; stock_quantity: number }) => [r.medicine_id, r.stock_quantity])
  )
  return rows.map((r) => ({
    ...(r as Record<string, unknown>),
    branch_stock_quantity: byId.get((r as { id: string }).id) ?? 0,
  }))
}

export async function listMedicinesForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  input: ListMedicinesInput,
  branchId?: string | null
): Promise<{ data: unknown[]; count: number; error: Error | null }> {
  const cap = 3000
  const currentDate = new Date().toISOString().split("T")[0]
  const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]

  const needsClientSideFilter =
    input.stockStatuses.length > 0 ||
    input.expiryStatuses.length > 0 ||
    input.stockStatus === "low" ||
    input.stockStatus === "in"

  if (needsClientSideFilter) {
    const query = applyBaseFilters(
      supabase.from("medicines").select(MEDICINE_SELECT).eq("tenant_id", tenantId),
      input,
      { forCount: false },
      currentDate,
      thirtyDaysFromNow
    )
    const { data: rows, error } = await query.range(0, cap - 1)
    if (error) {
      return { data: [], count: 0, error: new Error(error.message) }
    }
    let filtered = (rows || []) as MedRow[]
    if (input.stockStatuses.length) {
      filtered = filtered.filter((m) => input.stockStatuses.some((s) => matchStock(m, s)))
    } else if (input.stockStatus && input.stockStatus !== "all") {
      if (input.stockStatus === "low") filtered = filtered.filter((m) => matchStock(m, "low"))
      else if (input.stockStatus === "in") filtered = filtered.filter((m) => matchStock(m, "in"))
      else if (input.stockStatus === "out") filtered = filtered.filter((m) => matchStock(m, "out"))
    }
    if (input.expiryStatuses.length) {
      filtered = filtered.filter((m) => input.expiryStatuses.some((e) => matchExpiry(m, e, currentDate, thirtyDaysFromNow)))
    } else if (input.expiryStatus && input.expiryStatus !== "all") {
      if (input.expiryStatus === "expired") filtered = filtered.filter((m) => matchExpiry(m, "expired", currentDate, thirtyDaysFromNow))
      if (input.expiryStatus === "expiring") filtered = filtered.filter((m) => matchExpiry(m, "expiring", currentDate, thirtyDaysFromNow))
    }
    const count = filtered.length
    const from = (input.page - 1) * input.limit
    const data = filtered.slice(from, from + input.limit)
    return { data: await attachBranchStock(supabase, data, branchId ?? null), count, error: null }
  }

  const query = applyBaseFilters(
    supabase.from("medicines").select(MEDICINE_SELECT, { count: "exact" }).eq("tenant_id", tenantId),
    input,
    { forCount: false },
    currentDate,
    thirtyDaysFromNow
  )
  const from = (input.page - 1) * input.limit
  const to = from + input.limit - 1
  const { data: rows, error, count } = await query.range(from, to)

  if (error) {
    return { data: [], count: 0, error: new Error(error.message) }
  }
  return { data: await attachBranchStock(supabase, rows || [], branchId ?? null), count: count ?? 0, error: null }
}

/** Active (remaining > 0) batches for a medicine, FEFO-ordered, across all branches. */
export async function listBatchesForMedicine(
  supabase: SupabaseClient,
  tenantId: string,
  medicineId: string
): Promise<{ data: unknown[]; error: Error | null }> {
  const { data, error } = await supabase
    .from("medicine_batches")
    .select("id, batch_number, expiry_date, quantity_received, quantity_remaining, received_at, branches (id, name, code)")
    .eq("tenant_id", tenantId)
    .eq("medicine_id", medicineId)
    .gt("quantity_remaining", 0)
    .order("expiry_date", { ascending: true, nullsFirst: false })
    .order("received_at", { ascending: true })

  if (error) return { data: [], error: new Error(error.message) }
  return { data: data || [], error: null }
}

export async function getMedicineById(
  supabase: SupabaseClient,
  tenantId: string,
  id: string
): Promise<{ data: unknown | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("medicines")
    .select(MEDICINE_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single()

  if (error || !data) {
    return { data: null, error: error ? new Error(error.message) : new Error("Medicine not found") }
  }
  return { data, error: null }
}

export async function createMedicineWithInventory(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  validatedData: Record<string, unknown>
): Promise<{ data: unknown | null; error: Error | null }> {
  const requestedInitialStock = Number((validatedData as { stock_quantity?: number }).stock_quantity ?? 0)

  // stock_quantity on `medicines` is a derived tenant-wide total maintained by a DB
  // trigger off medicine_branch_stock — insert at 0 here, then seed the real branch
  // row below so the aggregate is correct from the trigger, not a one-off direct write
  // that would get silently reset the next time any branch's stock changes.
  const payload = {
    ...validatedData,
    stock_quantity: 0,
    tenant_id: tenantId,
  }

  const { data, error } = await supabase
    .from("medicines")
    .insert(payload)
    .select(MEDICINE_SELECT)
    .single()

  if (error) {
    return { data: null, error: new Error(error.message) }
  }

  const createdMedicineId = (data as { id: string }).id
  const createdStock = requestedInitialStock
  const createdCost = Number((data as { cost_price?: string | number }).cost_price ?? 0)
  const createdSupplierId = (data as { supplier_id?: string | null }).supplier_id ?? null

  let branchId: string | null = null
  if (createdStock > 0) {
    const { data: actor } = await supabase
      .from("users")
      .select("current_branch_id")
      .eq("id", userId)
      .maybeSingle()
    branchId = (actor as { current_branch_id: string | null } | null)?.current_branch_id ?? null
    if (!branchId) {
      branchId = await getPrimaryBranchId(supabase, tenantId)
    }

    const { error: branchStockError } = await supabase.from("medicine_branch_stock").insert({
      tenant_id: tenantId,
      branch_id: branchId,
      medicine_id: createdMedicineId,
      stock_quantity: createdStock,
    })
    if (branchStockError) {
      await supabase.from("medicines").delete().eq("id", createdMedicineId).eq("tenant_id", tenantId)
      return { data: null, error: new Error(`Initial stock could not be recorded: ${branchStockError.message}`) }
    }
  }

  // Keep inventory_transactions in sync with initial stock on create.
  if (createdStock > 0) {
    const { error: invErr } = await supabase.from("inventory_transactions").insert({
      medicine_id: createdMedicineId,
      transaction_type: "purchase",
      quantity: createdStock,
      reference_type: "initial_stock",
      tenant_id: tenantId,
      branch_id: branchId,
    })
    if (invErr) {
      await supabase.from("medicines").delete().eq("id", createdMedicineId).eq("tenant_id", tenantId)
      return { data: null, error: new Error(`Initial stock transaction failed: ${invErr.message}`) }
    }
  }

  // If initial stock is added with supplier, supplier receipt/voucher is mandatory.
  if (createdStock > 0 && createdSupplierId) {
    try {
      await postDirectInventorySupplierReceipts(supabase, tenantId, userId, {
        receiptDate: new Date().toISOString().slice(0, 10),
        supplierInvoiceNumber: null,
        batches: [
          {
            supplierId: createdSupplierId,
            lines: [
              {
                medicineId: createdMedicineId,
                quantity: createdStock,
                unitCost: createdCost,
                vatAmount: 0,
              },
            ],
          },
        ],
      })
    } catch (voucherErr) {
      await supabase
        .from("inventory_transactions")
        .delete()
        .eq("medicine_id", createdMedicineId)
        .eq("reference_type", "initial_stock")
      await supabase.from("medicines").delete().eq("id", createdMedicineId).eq("tenant_id", tenantId)

      const msg = voucherErr instanceof Error ? voucherErr.message : "Supplier voucher could not be posted"
      return { data: null, error: new Error(`${msg}. Medicine creation was rolled back.`) }
    }
  }

  if (createdStock > 0) {
    // Reflect the trigger-recomputed stock_quantity total in the response.
    const { data: refreshed } = await supabase
      .from("medicines")
      .select(MEDICINE_SELECT)
      .eq("id", createdMedicineId)
      .eq("tenant_id", tenantId)
      .single()
    if (refreshed) return { data: refreshed, error: null }
  }

  return { data, error: null }
}

export async function updateMedicineWithInventory(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  id: string,
  validatedData: Record<string, unknown>
): Promise<{ data: unknown | null; error: Error | null; notFound?: boolean }> {
  const { data: previous, error: prevErr } = await supabase
    .from("medicines")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single()

  if (prevErr || !previous) {
    return { data: null, error: new Error(prevErr?.message || "Medicine not found"), notFound: true }
  }

  // stock_quantity is a derived tenant-wide total (SUM across medicine_branch_stock),
  // maintained by a DB trigger — it must never be written directly on `medicines`,
  // only adjusted per-branch below, or the aggregate will drift out of sync on the
  // next branch-level stock change.
  const { stock_quantity: requestedStock, ...fieldsPatch } = validatedData as { stock_quantity?: number }

  const { data, error } = await supabase
    .from("medicines")
    .update(fieldsPatch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select(MEDICINE_SELECT)
    .single()

  if (error) {
    return { data: null, error: new Error(error.message) }
  }

  const oldStock = Number((previous as { stock_quantity?: number }).stock_quantity ?? 0)
  const stockDelta = requestedStock != null ? Number(requestedStock) - oldStock : 0

  let branchId: string | null = null
  if (stockDelta !== 0) {
    const { data: actor } = await supabase
      .from("users")
      .select("current_branch_id")
      .eq("id", userId)
      .maybeSingle()
    branchId = (actor as { current_branch_id: string | null } | null)?.current_branch_id ?? null
    if (!branchId) {
      branchId = await getPrimaryBranchId(supabase, tenantId)
    }

    const { data: existingBranchStock } = await supabase
      .from("medicine_branch_stock")
      .select("stock_quantity")
      .eq("branch_id", branchId)
      .eq("medicine_id", id)
      .maybeSingle()

    const currentBranchStock = Number((existingBranchStock as { stock_quantity?: number } | null)?.stock_quantity ?? 0)
    const newBranchStock = currentBranchStock + stockDelta
    if (newBranchStock < 0) {
      return {
        data: null,
        error: new Error(
          `Stock update would leave this branch with negative stock (has ${currentBranchStock}, adjustment ${stockDelta}).`
        ),
      }
    }

    const { error: branchStockError } = await supabase
      .from("medicine_branch_stock")
      .upsert(
        { tenant_id: tenantId, branch_id: branchId, medicine_id: id, stock_quantity: newBranchStock },
        { onConflict: "branch_id,medicine_id" }
      )

    if (branchStockError) {
      return { data: null, error: new Error(`Stock update failed: ${branchStockError.message}`) }
    }

    // Re-fetch so the returned row reflects the trigger-recomputed tenant-wide total.
    const { data: refreshed } = await supabase
      .from("medicines")
      .select(MEDICINE_SELECT)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single()
    if (refreshed) {
      Object.assign(data as Record<string, unknown>, refreshed)
    }
  }
  const supplierId = ((data as { supplier_id?: string | null }).supplier_id ?? "").trim()
  const costPrice = Number((data as { cost_price?: string | number }).cost_price ?? 0)

  if (stockDelta > 0) {
    const { error: invErr } = await supabase.from("inventory_transactions").insert({
      medicine_id: id,
      transaction_type: "purchase",
      quantity: stockDelta,
      reference_type: "stock_increase",
      tenant_id: tenantId,
      branch_id: branchId,
    })
    if (invErr) {
      const rollbackPatch = Object.fromEntries(
        Object.keys(fieldsPatch).map((k) => [k, (previous as Record<string, unknown>)[k]])
      )
      if (Object.keys(rollbackPatch).length > 0) {
        await supabase.from("medicines").update(rollbackPatch).eq("id", id).eq("tenant_id", tenantId)
      }
      return { data: null, error: new Error(`Stock update failed: ${invErr.message}`) }
    }
  }

  if (stockDelta > 0 && supplierId) {
    try {
      await postDirectInventorySupplierReceipts(supabase, tenantId, userId, {
        receiptDate: new Date().toISOString().slice(0, 10),
        supplierInvoiceNumber: null,
        batches: [
          {
            supplierId,
            lines: [
              {
                medicineId: id,
                quantity: stockDelta,
                unitCost: costPrice,
                vatAmount: 0,
              },
            ],
          },
        ],
      })
    } catch (voucherErr) {
      await supabase
        .from("inventory_transactions")
        .delete()
        .eq("medicine_id", id)
        .eq("reference_type", "stock_increase")
        .eq("quantity", stockDelta)

      const rollbackPatch = Object.fromEntries(
        Object.keys(fieldsPatch).map((k) => [k, (previous as Record<string, unknown>)[k]])
      )
      if (Object.keys(rollbackPatch).length > 0) {
        await supabase.from("medicines").update(rollbackPatch).eq("id", id).eq("tenant_id", tenantId)
      }

      const msg = voucherErr instanceof Error ? voucherErr.message : "Supplier voucher could not be posted"
      return { data: null, error: new Error(`${msg}. Medicine update was rolled back.`) }
    }
  }

  return { data, error: null }
}

export async function medicineHasRelations(
  supabase: SupabaseClient,
  id: string
): Promise<boolean> {
  const [inventoryResult, prescriptionResult, salesResult] = await Promise.all([
    supabase.from("inventory_transactions").select("id").eq("medicine_id", id).limit(1),
    supabase.from("prescription_items").select("id").eq("medicine_id", id).limit(1),
    supabase.from("sale_items").select("id").eq("medicine_id", id).limit(1),
  ])

  return Boolean(
    inventoryResult.data?.length || prescriptionResult.data?.length || salesResult.data?.length
  )
}

export async function deleteMedicine(
  supabase: SupabaseClient,
  tenantId: string,
  id: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from("medicines").delete().eq("id", id).eq("tenant_id", tenantId)
  if (error) {
    return { error: new Error(error.message) }
  }
  return { error: null }
}
