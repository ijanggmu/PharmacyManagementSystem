/**
 * Server-only medicine/inventory persistence. Used by `app/api/medicines/*` Route Handlers.
 * Keeps Supabase and business rules out of the React tree and portable to .NET later.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { postDirectInventorySupplierReceipts } from "@/lib/server/services/inventory-supplier-receipt-service"
import { postInventoryAdjustmentVoucher } from "@/lib/server/services/accounting-service"
import { getPrimaryBranchId } from "@/lib/server/services/tenant-branch"
import { compareFefo, isSellableOn, type FefoPick } from "@/lib/inventory/fefo"

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
  /** Archived medicines (is_active = false) are hidden from the default list —
   *  they still exist for history/reporting but shouldn't clutter pickers. */
  includeArchived: boolean
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
    includeArchived: searchParams.get("includeArchived") === "true",
  }
}

type MedRow = {
  id: string
  stock_quantity: number
  minimum_stock: number
  expiry_date: string | null
}

function matchStock(m: MedRow, s: "in" | "low" | "out") {
  if (s === "out") return m.stock_quantity === 0
  if (s === "low") return m.stock_quantity <= m.minimum_stock && m.stock_quantity > 0
  return m.stock_quantity > m.minimum_stock
}

/** Matches on an already-resolved effective expiry (batch-aware — see
 *  effectiveExpiryFromAgg), not a raw medicines.expiry_date field. */
function matchExpiry(effectiveExpiry: string | null, s: "expiring" | "expired", currentDate: string, thirtyDaysFromNow: string) {
  if (!effectiveExpiry) return false
  if (s === "expired") return effectiveExpiry < currentDate
  return effectiveExpiry >= currentDate && effectiveExpiry <= thirtyDaysFromNow
}

/** Expiry filtering can't be a plain SQL WHERE on medicines.expiry_date — a
 *  medicine's real expiry depends on its batches (see effectiveExpiryFromAgg),
 *  which lives in a different table. So it's never applied here; any expiry
 *  filter routes listMedicinesForTenant to the batch-aware in-memory path
 *  below instead (see needsClientSideFilter). */
function applyBaseFilters(
  query: any,
  input: ListMedicinesInput,
  opts: { forCount?: boolean }
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

export interface BatchAgg {
  nearestExpiry: string | null
  count: number
  racks: Set<string>
  /** Lots the counter should physically pick, soonest expiry first. Expired and
   *  disposed lots stay in count/nearestExpiry (inventory still needs to see
   *  them) but are left out of this list. */
  fefoPicks: FefoPick[]
}

type BatchAggRow = {
  medicine_id: string
  expiry_date: string | null
  rack_location?: string | null
  batch_number?: string | null
  quantity_remaining?: number | null
  received_at?: string | null
  disposed_at?: string | null
}

/** Groups sellable (non-recalled, quantity remaining) batch rows by medicine —
 *  nearest expiry, how many such batches, and distinct rack locations. Shared
 *  by attachBatchSummary (list rows) and getMedicineInventoryStats (dashboard
 *  aggregate) so both agree on what "this medicine's expiry" means once real
 *  per-lot batches exist, instead of each recomputing it differently.
 *  `today` is YYYY-MM-DD and decides which lots are still dispensable. */
function aggregateBatchesByMedicine(batches: BatchAggRow[], today: string): Map<string, BatchAgg> {
  const byId = new Map<string, BatchAgg>()
  const pendingPicks = new Map<string, Array<FefoPick & { received_at: string }>>()
  for (const b of batches) {
    const agg = byId.get(b.medicine_id) ?? {
      nearestExpiry: null,
      count: 0,
      racks: new Set<string>(),
      fefoPicks: [],
    }
    agg.count += 1
    if (b.expiry_date && (!agg.nearestExpiry || b.expiry_date < agg.nearestExpiry)) agg.nearestExpiry = b.expiry_date
    if (b.rack_location) agg.racks.add(b.rack_location)
    byId.set(b.medicine_id, agg)

    const remaining = Number(b.quantity_remaining ?? 0)
    if (!b.disposed_at && b.batch_number && remaining > 0 && isSellableOn(b.expiry_date, today)) {
      const list = pendingPicks.get(b.medicine_id) ?? []
      list.push({
        batch_number: b.batch_number,
        expiry_date: b.expiry_date,
        rack_location: b.rack_location ?? null,
        quantity_remaining: remaining,
        received_at: b.received_at ?? "",
      })
      pendingPicks.set(b.medicine_id, list)
    }
  }
  for (const [medicineId, agg] of byId) {
    const list = pendingPicks.get(medicineId) ?? []
    list.sort(compareFefo)
    agg.fefoPicks = list.map(({ received_at: _receivedAt, ...pick }) => pick)
  }
  return byId
}

/** One query for the given medicine ids' sellable (non-recalled, quantity
 *  remaining) batches, grouped per medicine. Shared by every caller that needs
 *  "this medicine's real batch expiry" — the list display, the dashboard
 *  stats, and expiry-status filtering — so a single query result can back all
 *  of them instead of each re-querying. Exported for other dashboard/report
 *  services that show medicine expiry outside this file. */
export async function fetchBatchAggMap(
  supabase: SupabaseClient,
  ids: string[],
  branchId: string | null
): Promise<Map<string, BatchAgg>> {
  if (ids.length === 0) return new Map()

  let query = supabase
    .from("medicine_batches")
    .select("medicine_id, batch_number, expiry_date, rack_location, quantity_remaining, received_at, disposed_at")
    .in("medicine_id", ids)
    .gt("quantity_remaining", 0)
    .is("recalled_at", null)

  if (branchId) query = query.eq("branch_id", branchId)

  const { data: batches } = await query
  const today = new Date().toISOString().slice(0, 10)
  return aggregateBatchesByMedicine((batches || []) as BatchAggRow[], today)
}

/** A medicine's real expiry once it has sellable batches: the nearest one
 *  among them (even if that's null — no batch has an expiry set), not the
 *  static medicines.expiry_date, which is set once at creation and never kept
 *  in sync. Falls back to that field only when the medicine has no batch rows
 *  yet, matching the fallback deduct_fefo_batches uses for pre-batch-tracking
 *  stock. Shared by the list decorator and the expiry-status filter below so
 *  both agree on what "this medicine's expiry" means. */
export function effectiveExpiryFromAgg(agg: BatchAgg | undefined, staticExpiry: string | null): string | null {
  return agg ? agg.nearestExpiry : staticExpiry
}

/** Decorates rows with batch_nearest_expiry/batch_count/batch_rack_locations
 *  from an already-fetched aggregate map — pure, no I/O, so callers that
 *  already have the map (e.g. after filtering by it) don't re-query. Generic
 *  so callers keep their row type merged with the new fields instead of
 *  collapsing to just the new fields (as `unknown[]` in/out would). */
export function decorateWithBatchAgg<T extends { id: string }>(rows: T[], byId: Map<string, BatchAgg>) {
  return rows.map((r) => {
    const agg = byId.get(r.id)
    return {
      ...r,
      batch_nearest_expiry: agg?.nearestExpiry ?? null,
      batch_count: agg?.count ?? 0,
      batch_rack_locations: agg ? Array.from(agg.racks) : [],
      fefo_picks: agg?.fefoPicks ?? [],
    }
  })
}

/** Per-medicine batch summary for the inventory list — nearest sellable batch
 *  expiry, how many such batches exist, and their distinct rack locations.
 *  One query for the whole page (like attachBranchStock above), not one per
 *  row. Used only where the caller doesn't already have an aggregate map from
 *  filtering (see listMedicinesForTenant). */
async function attachBatchSummary(supabase: SupabaseClient, rows: unknown[], branchId: string | null) {
  if (rows.length === 0) return rows
  const typedRows = rows as { id: string }[]
  const byId = await fetchBatchAggMap(supabase, typedRows.map((r) => r.id), branchId)
  return decorateWithBatchAgg(typedRows, byId)
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

  // Expiry filtering always needs the in-memory path: a medicine's real
  // expiry depends on its batches (a different table), so it can't be a plain
  // SQL WHERE on medicines.expiry_date without silently missing/misclassifying
  // any medicine whose batches disagree with that stale field.
  const hasExpiryFilter = input.expiryStatuses.length > 0 || (!!input.expiryStatus && input.expiryStatus !== "all")
  const needsClientSideFilter =
    input.stockStatuses.length > 0 ||
    hasExpiryFilter ||
    input.stockStatus === "low" ||
    input.stockStatus === "in"

  if (needsClientSideFilter) {
    let baseQuery = supabase.from("medicines").select(MEDICINE_SELECT).eq("tenant_id", tenantId)
    if (!input.includeArchived) baseQuery = baseQuery.eq("is_active", true)
    const query = applyBaseFilters(baseQuery, input, { forCount: false })
    const { data: rows, error } = await query.range(0, cap - 1)
    if (error) {
      return { data: [], count: 0, error: new Error(error.message) }
    }
    const candidates = (rows || []) as MedRow[]

    // Fetched once for the whole candidate set and reused both for filtering
    // and (after pagination) for the returned rows' batch summary — avoids
    // querying medicine_batches twice for the same medicines.
    const batchAgg = hasExpiryFilter
      ? await fetchBatchAggMap(supabase, candidates.map((m) => m.id), branchId ?? null)
      : new Map<string, BatchAgg>()

    let filtered = candidates
    if (input.stockStatuses.length) {
      filtered = filtered.filter((m) => input.stockStatuses.some((s) => matchStock(m, s)))
    } else if (input.stockStatus && input.stockStatus !== "all") {
      if (input.stockStatus === "low") filtered = filtered.filter((m) => matchStock(m, "low"))
      else if (input.stockStatus === "in") filtered = filtered.filter((m) => matchStock(m, "in"))
      else if (input.stockStatus === "out") filtered = filtered.filter((m) => matchStock(m, "out"))
    }
    if (input.expiryStatuses.length) {
      filtered = filtered.filter((m) =>
        input.expiryStatuses.some((e) => matchExpiry(effectiveExpiryFromAgg(batchAgg.get(m.id), m.expiry_date), e, currentDate, thirtyDaysFromNow))
      )
    } else if (input.expiryStatus && input.expiryStatus !== "all") {
      filtered = filtered.filter((m) =>
        matchExpiry(effectiveExpiryFromAgg(batchAgg.get(m.id), m.expiry_date), input.expiryStatus as "expired" | "expiring", currentDate, thirtyDaysFromNow)
      )
    }
    const count = filtered.length
    const from = (input.page - 1) * input.limit
    const data = filtered.slice(from, from + input.limit)
    const withStock = await attachBranchStock(supabase, data, branchId ?? null)
    const withBatchSummary = hasExpiryFilter
      ? decorateWithBatchAgg(withStock as { id: string }[], batchAgg)
      : await attachBatchSummary(supabase, withStock, branchId ?? null)
    return { data: withBatchSummary, count, error: null }
  }

  let countBaseQuery = supabase.from("medicines").select(MEDICINE_SELECT, { count: "exact" }).eq("tenant_id", tenantId)
  if (!input.includeArchived) countBaseQuery = countBaseQuery.eq("is_active", true)
  const query = applyBaseFilters(countBaseQuery, input, { forCount: false })
  const from = (input.page - 1) * input.limit
  const to = from + input.limit - 1
  const { data: rows, error, count } = await query.range(from, to)

  if (error) {
    return { data: [], count: 0, error: new Error(error.message) }
  }
  const withStock = await attachBranchStock(supabase, rows || [], branchId ?? null)
  return { data: await attachBatchSummary(supabase, withStock, branchId ?? null), count: count ?? 0, error: null }
}

export interface MedicineInventoryStats {
  total: number
  lowStock: number
  expiringSoon: number
  expired: number
  totalValue: number
}

/** Tenant-wide inventory counts for the dashboard stat cards. Selects only the
 *  columns the math needs (no category/supplier joins, no full row), instead of
 *  shipping up to thousands of full medicine records just to derive 4 numbers —
 *  the previous approach the Inventory page used.
 *
 *  Expiring/expired counts prefer each medicine's nearest real batch expiry
 *  (aggregateBatchesByMedicine, same helper the inventory list uses) over the
 *  static medicines.expiry_date, which is set once at creation and never kept
 *  in sync — without this, a medicine whose only real batch expires next week
 *  could sit uncounted in "Expiring Soon" while a stale field says otherwise. */
export async function getMedicineInventoryStats(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ data: MedicineInventoryStats | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("medicines")
    .select("id, stock_quantity, minimum_stock, expiry_date, unit_price")
    .eq("tenant_id", tenantId)

  if (error) {
    return { data: null, error: new Error(error.message) }
  }

  const rows = (data || []) as {
    id: string
    stock_quantity: number
    minimum_stock: number
    expiry_date: string | null
    unit_price: string | number
  }[]

  const batchByMedicine = await fetchBatchAggMap(supabase, rows.map((r) => r.id), null)

  const currentDate = new Date()
  const thirtyDaysFromNow = new Date(currentDate.getTime() + 30 * 24 * 60 * 60 * 1000)

  let lowStock = 0
  let expiringSoon = 0
  let expired = 0
  let totalValue = 0

  for (const row of rows) {
    if (row.stock_quantity <= row.minimum_stock) lowStock++
    const effectiveExpiry = effectiveExpiryFromAgg(batchByMedicine.get(row.id), row.expiry_date)
    if (effectiveExpiry) {
      const expiryDate = new Date(effectiveExpiry)
      if (expiryDate < currentDate) expired++
      else if (expiryDate <= thirtyDaysFromNow) expiringSoon++
    }
    totalValue += row.stock_quantity * Number.parseFloat(String(row.unit_price))
  }

  return {
    data: { total: rows.length, lowStock, expiringSoon, expired, totalValue },
    error: null,
  }
}

/** Active (remaining > 0) batches for a medicine, FEFO-ordered, across all branches. */
export async function listBatchesForMedicine(
  supabase: SupabaseClient,
  tenantId: string,
  medicineId: string
): Promise<{ data: unknown[]; error: Error | null }> {
  const { data, error } = await supabase
    .from("medicine_batches")
    .select(
      "id, batch_number, expiry_date, quantity_received, quantity_remaining, selling_price, rack_location, received_at, recalled_at, recall_reason, branches (id, name, code)"
    )
    .eq("tenant_id", tenantId)
    .eq("medicine_id", medicineId)
    .gt("quantity_remaining", 0)
    .order("expiry_date", { ascending: true, nullsFirst: false })
    .order("received_at", { ascending: true })

  if (error) return { data: [], error: new Error(error.message) }
  return { data: data || [], error: null }
}

/** Sets/clears the shelf/rack/bin label for one batch — kept editable any time
 *  independent of receiving, since staff typically place stock on the shelf
 *  and note where it landed after the fact, not while filling out a receipt. */
export async function updateBatchRackLocation(
  supabase: SupabaseClient,
  tenantId: string,
  batchId: string,
  rackLocation: string | null
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from("medicine_batches")
    .update({ rack_location: rackLocation })
    .eq("id", batchId)
    .eq("tenant_id", tenantId)

  if (error) return { error: new Error(error.message) }
  return { error: null }
}

/** Flags every non-recalled batch row of this lot (across all branches) as recalled,
 *  blocking it from FEFO sale everywhere it exists. See scripts/85-inventory-safety-controls.sql. */
export async function recallMedicineBatch(
  supabase: SupabaseClient,
  tenantId: string,
  medicineId: string,
  batchNumber: string,
  actorUserId: string,
  reason: string | null
): Promise<{ affected: number; error: Error | null }> {
  const { data, error } = await supabase.rpc("recall_medicine_batch", {
    p_tenant_id: tenantId,
    p_medicine_id: medicineId,
    p_batch_number: batchNumber,
    p_actor_user_id: actorUserId,
    p_reason: reason,
  })

  if (error) return { affected: 0, error: new Error(error.message) }
  return { affected: (data as number) ?? 0, error: null }
}

/** Expired, still-in-stock, not-yet-disposed batches across the whole tenant —
 *  item 10 of the domain audit: expired stock was excluded from sale but never
 *  routed anywhere, so it just sat as invisible dead inventory forever. */
export async function listExpiredBatchesForTenant(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ data: unknown[]; error: Error | null }> {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from("medicine_batches")
    .select(
      "id, batch_number, expiry_date, quantity_remaining, received_at, branch_id, medicines (id, name, cost_price), branches (id, name)"
    )
    .eq("tenant_id", tenantId)
    .gt("quantity_remaining", 0)
    .is("disposed_at", null)
    .lt("expiry_date", today)
    .order("expiry_date", { ascending: true })

  if (error) return { data: [], error: new Error(error.message) }
  return { data: data || [], error: null }
}

/** Writes off an expired batch: zeroes quantity_remaining, decrements the branch's
 *  sellable stock to match, audits it in inventory_transactions, and posts a GL
 *  write-off voucher (reuses postInventoryAdjustmentVoucher, same shrinkage
 *  account as manual stock decreases). */
export async function disposeExpiredBatch(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  batchId: string,
  reason: string | null
): Promise<{ error: Error | null }> {
  const { data: batch, error: fetchErr } = await supabase
    .from("medicine_batches")
    .select("id, medicine_id, branch_id, quantity_remaining, expiry_date, disposed_at, medicines (cost_price)")
    .eq("id", batchId)
    .eq("tenant_id", tenantId)
    .single()

  if (fetchErr || !batch) return { error: new Error(fetchErr?.message || "Batch not found") }
  const b = batch as unknown as {
    id: string
    medicine_id: string
    branch_id: string
    quantity_remaining: number
    expiry_date: string | null
    disposed_at: string | null
    medicines: { cost_price: number | string } | { cost_price: number | string }[] | null
  }

  if (b.disposed_at) return { error: new Error("This batch was already disposed") }
  if (b.quantity_remaining <= 0) return { error: new Error("This batch has no remaining quantity to dispose") }
  const today = new Date().toISOString().slice(0, 10)
  if (!b.expiry_date || b.expiry_date >= today) {
    return { error: new Error("Only expired batches can be disposed through this action") }
  }

  const qty = b.quantity_remaining
  const costPrice = Number(
    (Array.isArray(b.medicines) ? b.medicines[0]?.cost_price : b.medicines?.cost_price) ?? 0
  )

  const { data: branchStock } = await supabase
    .from("medicine_branch_stock")
    .select("stock_quantity")
    .eq("branch_id", b.branch_id)
    .eq("medicine_id", b.medicine_id)
    .maybeSingle()
  const currentStock = Number((branchStock as { stock_quantity?: number } | null)?.stock_quantity ?? 0)
  const newStock = Math.max(0, currentStock - qty)

  const { error: stockErr } = await supabase
    .from("medicine_branch_stock")
    .update({ stock_quantity: newStock })
    .eq("branch_id", b.branch_id)
    .eq("medicine_id", b.medicine_id)
  if (stockErr) return { error: new Error(`Stock update failed: ${stockErr.message}`) }

  const { error: batchErr } = await supabase
    .from("medicine_batches")
    .update({
      quantity_remaining: 0,
      disposed_at: new Date().toISOString(),
      disposed_by: userId,
      disposal_reason: reason,
    })
    .eq("id", batchId)
    .eq("tenant_id", tenantId)
  if (batchErr) return { error: new Error(`Batch update failed: ${batchErr.message}`) }

  const { error: invErr } = await supabase.from("inventory_transactions").insert({
    medicine_id: b.medicine_id,
    transaction_type: "adjustment",
    quantity: -qty,
    reference_id: batchId,
    reference_type: "expired_disposal",
    reason_code: "expiry_writeoff",
    notes: reason,
    user_id: userId,
    tenant_id: tenantId,
    branch_id: b.branch_id,
  })
  if (invErr) return { error: new Error(`Audit trail failed: ${invErr.message}`) }

  const { error: voucherErr } = await postInventoryAdjustmentVoucher(supabase, tenantId, userId, {
    medicineId: b.medicine_id,
    voucherDate: today,
    quantity: -qty,
    unitCost: costPrice,
    reasonCode: "expiry_writeoff",
  })
  if (voucherErr) {
    console.error(`[disposeExpiredBatch] Voucher posting failed for batch ${batchId} (tenant ${tenantId}): ${voucherErr.message}`)
  }

  return { error: null }
}

/** Levenshtein edit distance — small inputs only (medicine names), no external dep. */
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const prev = new Array(n + 1)
  const curr = new Array(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j]
  }
  return prev[n]
}

export interface SimilarMedicineName {
  id: string
  name: string
  strength: string | null
  form: string | null
  distance: number
}

/** LASA (look-alike-sound-alike) check: finds existing tenant medicine names within
 *  edit distance 2 of `name`, so staff creating a new medicine can catch a near-duplicate
 *  or confusable name (e.g. "Amlodipine" vs "Amlopres") before it's saved. Non-blocking —
 *  callers surface this as a warning, not a validation error. */
export async function findSimilarMedicineNames(
  supabase: SupabaseClient,
  tenantId: string,
  name: string,
  excludeId?: string
): Promise<{ data: SimilarMedicineName[]; error: Error | null }> {
  const needle = name.trim().toLowerCase()
  if (needle.length < 3) return { data: [], error: null }

  let query = supabase
    .from("medicines")
    .select("id, name, strength, form")
    .eq("tenant_id", tenantId)
    .limit(500)
  if (excludeId) query = query.neq("id", excludeId)

  const { data, error } = await query
  if (error) return { data: [], error: new Error(error.message) }

  const threshold = needle.length <= 5 ? 1 : 2
  const matches = ((data || []) as { id: string; name: string; strength: string | null; form: string | null }[])
    .map((m) => ({ ...m, distance: levenshtein(needle, m.name.trim().toLowerCase()) }))
    .filter((m) => m.distance > 0 && m.distance <= threshold)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5)

  return { data: matches, error: null }
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

export interface CreateMedicineRecordResult {
  data: unknown | null
  error: Error | null
  medicineId?: string
  createdStock: number
  createdCost: number
  createdSupplierId: string | null
  branchId: string | null
}

/** Creates a medicine_batches row for stock added outside the formal PO/GRN receive
 *  flow (Add Medicine, Bulk Import, Edit Medicine stock increases). Without this,
 *  deduct_fefo_batches has nothing to allocate against for the majority of stock
 *  entered through the app's primary flows, and silently falls back to the
 *  medicine-level expiry_date instead of per-lot FEFO (see AUDIT-001). Non-fatal by
 *  design: the physical stock/branch-stock/inventory_transactions rows this always
 *  runs after have already succeeded and must not be rolled back over a batch-row
 *  failure — logs and continues instead. */
async function insertMedicineBatchRow(
  supabase: SupabaseClient,
  tenantId: string,
  branchId: string,
  medicineId: string,
  quantity: number,
  batchNumber: string | null | undefined,
  expiryDate: string | null | undefined,
  goodsReceiptId: string | null = null,
  sellingPrice: number | string | null | undefined = null
): Promise<void> {
  const resolvedBatchNumber = batchNumber?.trim() || `AUTO-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const resolvedSellingPrice = sellingPrice != null && sellingPrice !== "" ? Number(sellingPrice) : null
  const { error } = await supabase.from("medicine_batches").insert({
    tenant_id: tenantId,
    branch_id: branchId,
    medicine_id: medicineId,
    batch_number: resolvedBatchNumber,
    expiry_date: expiryDate || null,
    quantity_received: quantity,
    quantity_remaining: quantity,
    goods_receipt_id: goodsReceiptId,
    // Snapshots whatever unit_price the medicine had at the moment this lot was
    // added — lets a later delivery at a different manufacturer MRP be priced
    // correctly without retroactively repricing older, still-in-stock batches.
    selling_price: resolvedSellingPrice,
  })
  if (error) {
    console.error(`[insertMedicineBatchRow] Failed for medicine ${medicineId} (tenant ${tenantId}): ${error.message}`)
  }
}

/** Inserts the medicine row and, if it carries initial stock, seeds branch stock +
 *  an inventory_transactions row — but never posts a supplier receipt. That's left
 *  entirely to the caller: `createMedicineWithInventory` posts its own single-line
 *  receipt right after calling this, while `bulkCreateMedicinesWithConsolidatedReceipts`
 *  calls this once per row and posts one consolidated receipt per bill group
 *  afterwards. Rolls back the medicine/branch-stock/inventory_transactions rows
 *  itself on failure. */
export async function createMedicineRecordOnly(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  medicineFields: Record<string, unknown>
): Promise<CreateMedicineRecordResult> {
  const requestedInitialStock = Number((medicineFields as { stock_quantity?: number }).stock_quantity ?? 0)

  // stock_quantity on `medicines` is a derived tenant-wide total maintained by a DB
  // trigger off medicine_branch_stock — insert at 0 here, then seed the real branch
  // row below so the aggregate is correct from the trigger, not a one-off direct write
  // that would get silently reset the next time any branch's stock changes.
  const payload = {
    ...medicineFields,
    stock_quantity: 0,
    tenant_id: tenantId,
  }

  const { data, error } = await supabase
    .from("medicines")
    .insert(payload)
    .select(MEDICINE_SELECT)
    .single()

  if (error) {
    return { data: null, error: new Error(error.message), createdStock: 0, createdCost: 0, createdSupplierId: null, branchId: null }
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
      return {
        data: null,
        error: new Error(`Initial stock could not be recorded: ${branchStockError.message}`),
        createdStock,
        createdCost,
        createdSupplierId,
        branchId,
      }
    }

    // Keep inventory_transactions in sync with initial stock on create.
    const { error: invErr } = await supabase.from("inventory_transactions").insert({
      medicine_id: createdMedicineId,
      transaction_type: "purchase",
      quantity: createdStock,
      reference_type: "initial_stock",
      tenant_id: tenantId,
      branch_id: branchId,
    })
    if (invErr) {
      await Promise.all([
        supabase.from("medicine_branch_stock").delete().eq("medicine_id", createdMedicineId).eq("tenant_id", tenantId),
        supabase.from("medicines").delete().eq("id", createdMedicineId).eq("tenant_id", tenantId),
      ])
      return {
        data: null,
        error: new Error(`Initial stock transaction failed: ${invErr.message}`),
        createdStock,
        createdCost,
        createdSupplierId,
        branchId,
      }
    }

    await insertMedicineBatchRow(
      supabase,
      tenantId,
      branchId,
      createdMedicineId,
      createdStock,
      (medicineFields as { batch_number?: string | null }).batch_number,
      (medicineFields as { expiry_date?: string | null }).expiry_date,
      null,
      (data as { unit_price?: number | string | null }).unit_price
    )
  }

  return { data, error: null, medicineId: createdMedicineId, createdStock, createdCost, createdSupplierId, branchId }
}

/** Deletes medicine rows (and their branch-stock / initial-stock inventory_transactions
 *  rows) created moments ago in this request — used to roll back a whole bulk-import
 *  batch when the consolidated supplier receipt for one of its bill groups fails. */
async function rollbackCreatedMedicines(supabase: SupabaseClient, tenantId: string, medicineIds: string[]): Promise<void> {
  if (medicineIds.length === 0) return
  await Promise.all([
    supabase.from("medicine_branch_stock").delete().eq("tenant_id", tenantId).in("medicine_id", medicineIds),
    supabase
      .from("inventory_transactions")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("reference_type", "initial_stock")
      .in("medicine_id", medicineIds),
  ])
  await supabase.from("medicines").delete().eq("tenant_id", tenantId).in("id", medicineIds)
}

export async function createMedicineWithInventory(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  validatedData: Record<string, unknown>
): Promise<{ data: unknown | null; error: Error | null }> {
  const {
    supplier_invoice_number,
    vat_amount,
    stock_adjustment_reason: _createIgnoredReason,
    stock_adjustment_notes: _createIgnoredNotes,
    ...medicineFields
  } = validatedData as Record<string, unknown> & {
    supplier_invoice_number?: string | null
    vat_amount?: number | null
    stock_adjustment_reason?: string | null
    stock_adjustment_notes?: string | null
  }

  const created = await createMedicineRecordOnly(supabase, tenantId, userId, medicineFields)
  if (created.error || !created.medicineId) {
    return { data: created.data, error: created.error }
  }

  const { data, medicineId: createdMedicineId, createdStock, createdCost, createdSupplierId } = created

  // If initial stock is added with supplier, supplier receipt/voucher is mandatory.
  if (createdStock > 0 && createdSupplierId) {
    try {
      const { receipts } = await postDirectInventorySupplierReceipts(supabase, tenantId, userId, {
        receiptDate: new Date().toISOString().slice(0, 10),
        supplierInvoiceNumber: supplier_invoice_number ?? null,
        batches: [
          {
            supplierId: createdSupplierId,
            lines: [
              {
                medicineId: createdMedicineId,
                quantity: createdStock,
                unitCost: createdCost,
                vatAmount: vat_amount ?? 0,
              },
            ],
          },
        ],
      })
      // Defensive: the helper can resolve without throwing yet still produce zero
      // receipts (e.g. a batch it silently skipped) — treat that the same as a
      // hard failure instead of letting the medicine end up with stock and a
      // supplier but no goods receipt / ledger entry / voucher to show for it.
      if (receipts.length === 0) {
        throw new Error("Supplier receipt was not created")
      }
    } catch (voucherErr) {
      const msg = voucherErr instanceof Error ? voucherErr.message : "Supplier voucher could not be posted"
      console.error(
        `[createMedicineWithInventory] Supplier receipt failed for medicine ${createdMedicineId} (tenant ${tenantId}): ${msg}`
      )

      const [branchStockDel, invTxDel, medicineDel] = await Promise.all([
        supabase.from("medicine_branch_stock").delete().eq("medicine_id", createdMedicineId).eq("tenant_id", tenantId),
        supabase
          .from("inventory_transactions")
          .delete()
          .eq("medicine_id", createdMedicineId)
          .eq("reference_type", "initial_stock"),
        supabase.from("medicines").delete().eq("id", createdMedicineId).eq("tenant_id", tenantId),
      ])

      const rollbackError = branchStockDel.error || invTxDel.error || medicineDel.error
      if (rollbackError) {
        // Rollback itself failed (e.g. FK constraint) — the medicine likely still
        // exists with stock but no receipt. Say so explicitly instead of claiming
        // a rollback that didn't actually happen.
        console.error(
          `[createMedicineWithInventory] Rollback FAILED for medicine ${createdMedicineId}: ${rollbackError.message}`
        )
        return {
          data: null,
          error: new Error(
            `${msg}. Automatic cleanup also failed (${rollbackError.message}) — medicine ${createdMedicineId} may exist with stock recorded but no supplier receipt. Please check Inventory and contact support if it appears.`
          ),
        }
      }

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

export interface BulkMedicineGroupInput {
  /** null = no-supplier group; created individually, no receipt posted. */
  supplierId: string | null
  supplierInvoiceNumber?: string | null
  receiptDate: string
  /** Each row is the same shape createMedicineWithInventory expects, minus
   *  supplier_invoice_number (that lives on the group, not the row). vat_amount may
   *  still be set per row — VAT is often per-line even on one consolidated bill. */
  rows: (Record<string, unknown> & { vat_amount?: number | null })[]
}

export interface BulkMedicineGroupResult {
  supplierId: string | null
  supplierInvoiceNumber: string | null
  medicineIds: string[]
  receiptId?: string
}

/** Creates every medicine row across every bill-group card in one bulk-import
 *  submission, then posts ONE consolidated supplier receipt per group that has a
 *  supplier — instead of one receipt per medicine. If the receipt step fails for
 *  any group, every medicine created anywhere in this request is rolled back (an
 *  "all bills in this submission" atomicity, not per-group), so a partial import
 *  can never leave some bills posted and others silently missing their receipt. */
export async function bulkCreateMedicinesWithConsolidatedReceipts(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  groups: BulkMedicineGroupInput[]
): Promise<{
  data: { groups: BulkMedicineGroupResult[]; createdMedicines: unknown[] } | null
  error: Error | null
}> {
  type CreatedRow = {
    groupIndex: number
    medicineId: string
    quantity: number
    unitCost: number
    vatAmount: number
    data: unknown
  }

  const created: CreatedRow[] = []

  // Phase 1: create every medicine row across every group — no receipts posted yet.
  for (let gi = 0; gi < groups.length; gi++) {
    for (const row of groups[gi].rows) {
      const { vat_amount, ...medicineFields } = row
      const result = await createMedicineRecordOnly(supabase, tenantId, userId, medicineFields)
      if (result.error || !result.medicineId) {
        await rollbackCreatedMedicines(supabase, tenantId, created.map((c) => c.medicineId))
        return {
          data: null,
          error: new Error(
            `Failed to create medicine in bill group ${gi + 1}: ${result.error?.message || "Unknown error"}. Nothing in this import was saved.`
          ),
        }
      }
      created.push({
        groupIndex: gi,
        medicineId: result.medicineId,
        quantity: result.createdStock,
        unitCost: result.createdCost,
        vatAmount: Number(vat_amount ?? 0),
        data: result.data,
      })
    }
  }

  // Phase 2: one consolidated receipt per group that has a supplier and at least
  // one line with stock — groups without a supplier need no receipt at all.
  const batchGroupIndices: number[] = []
  const batches = groups
    .map((group, gi) => {
      const lines = created
        .filter((c) => c.groupIndex === gi && c.quantity > 0)
        .map((c) => ({ medicineId: c.medicineId, quantity: c.quantity, unitCost: c.unitCost, vatAmount: c.vatAmount }))
      if (!group.supplierId || lines.length === 0) return null
      batchGroupIndices.push(gi)
      return {
        supplierId: group.supplierId,
        supplierInvoiceNumber: group.supplierInvoiceNumber ?? null,
        receiptDate: group.receiptDate,
        lines,
      }
    })
    .filter((b): b is NonNullable<typeof b> => b !== null)

  const groupResults: BulkMedicineGroupResult[] = groups.map((g, gi) => ({
    supplierId: g.supplierId,
    supplierInvoiceNumber: g.supplierInvoiceNumber ?? null,
    medicineIds: created.filter((c) => c.groupIndex === gi).map((c) => c.medicineId),
  }))

  if (batches.length > 0) {
    try {
      const { receipts } = await postDirectInventorySupplierReceipts(supabase, tenantId, userId, {
        receiptDate: groups[0]?.receiptDate || new Date().toISOString().slice(0, 10),
        batches,
      })
      // Every line here has cost > 0 (enforced client-side before submit), so
      // totalGrossForAp > 0 for every batch and none get silently skipped inside
      // postDirectInventorySupplierReceipts — receipts lines up 1:1 with batches.
      receipts.forEach((r, i) => {
        const gi = batchGroupIndices[i]
        if (gi != null) groupResults[gi].receiptId = r.goods_receipt_id
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Supplier receipt could not be posted"
      console.error(`[bulkCreateMedicinesWithConsolidatedReceipts] Receipt posting failed (tenant ${tenantId}): ${msg}`)
      await rollbackCreatedMedicines(supabase, tenantId, created.map((c) => c.medicineId))
      return { data: null, error: new Error(`${msg}. All medicines in this bulk import were rolled back.`) }
    }
  }

  return { data: { groups: groupResults, createdMedicines: created.map((c) => c.data) }, error: null }
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
  const {
    stock_quantity: requestedStock,
    supplier_invoice_number,
    vat_amount,
    stock_adjustment_reason: adjustmentReason,
    stock_adjustment_notes: adjustmentNotes,
    ...fieldsPatch
  } = validatedData as {
    stock_quantity?: number
    supplier_invoice_number?: string | null
    vat_amount?: number | null
    stock_adjustment_reason?: string | null
    stock_adjustment_notes?: string | null
  }

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
  let preUpdateBranchStock: number | null = null
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
    preUpdateBranchStock = currentBranchStock
    const newBranchStock = currentBranchStock + stockDelta
    if (newBranchStock < 0) {
      return {
        data: null,
        error: new Error(
          `Stock update would leave this branch with negative stock (has ${currentBranchStock}, adjustment ${stockDelta}).`
        ),
      }
    }

    if (stockDelta < 0 && !adjustmentReason) {
      const rollbackPatch = Object.fromEntries(
        Object.keys(fieldsPatch).map((k) => [k, (previous as Record<string, unknown>)[k]])
      )
      if (Object.keys(rollbackPatch).length > 0) {
        await supabase.from("medicines").update(rollbackPatch).eq("id", id).eq("tenant_id", tenantId)
      }
      return {
        data: null,
        error: new Error(
          "A reason is required when manually decreasing stock (breakage, theft, expiry write-off, count correction, or other)."
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

    if (branchId) {
      await insertMedicineBatchRow(
        supabase,
        tenantId,
        branchId,
        id,
        stockDelta,
        (data as { batch_number?: string | null }).batch_number,
        (data as { expiry_date?: string | null }).expiry_date,
        null,
        (data as { unit_price?: number | string | null }).unit_price
      )
    }
  }

  // Manual decreases previously wrote no inventory_transactions row at all — shrinkage
  // was indistinguishable from a typo in the audit trail. Now audited with a reason code.
  if (stockDelta < 0) {
    const { error: invErr } = await supabase.from("inventory_transactions").insert({
      medicine_id: id,
      transaction_type: "adjustment",
      quantity: stockDelta,
      reference_type: "stock_decrease",
      reason_code: adjustmentReason ?? "other",
      notes: adjustmentNotes ?? null,
      user_id: userId,
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
      if (branchId && preUpdateBranchStock != null) {
        await supabase
          .from("medicine_branch_stock")
          .update({ stock_quantity: preUpdateBranchStock })
          .eq("branch_id", branchId)
          .eq("medicine_id", id)
      }
      return { data: null, error: new Error(`Stock adjustment could not be recorded: ${invErr.message}`) }
    }

    // Reduce the GL inventory asset to match — previously only inventory_transactions
    // was written here, so the balance sheet kept overstating inventory after every
    // manual decrease. Non-fatal: the physical stock correction above already
    // succeeded and must not be undone just because the bookkeeping entry failed.
    const { error: voucherErr } = await postInventoryAdjustmentVoucher(supabase, tenantId, userId, {
      medicineId: id,
      voucherDate: new Date().toISOString().slice(0, 10),
      quantity: stockDelta,
      unitCost: costPrice,
      reasonCode: adjustmentReason ?? "other",
    })
    if (voucherErr) {
      console.error(`[updateMedicineWithInventory] Shrinkage voucher failed for medicine ${id} (tenant ${tenantId}): ${voucherErr.message}`)
    }
  }

  if (stockDelta > 0 && supplierId) {
    try {
      const { receipts } = await postDirectInventorySupplierReceipts(supabase, tenantId, userId, {
        receiptDate: new Date().toISOString().slice(0, 10),
        supplierInvoiceNumber: supplier_invoice_number ?? null,
        batches: [
          {
            supplierId,
            lines: [
              {
                medicineId: id,
                quantity: stockDelta,
                unitCost: costPrice,
                vatAmount: vat_amount ?? 0,
              },
            ],
          },
        ],
      })
      // Defensive: resolved without throwing but produced no receipt (a batch it
      // silently skipped) — treat as failure so we never end up with the branch
      // stock already increased and no receipt/ledger entry/voucher for it.
      if (receipts.length === 0) {
        throw new Error("Supplier receipt was not created")
      }
    } catch (voucherErr) {
      const msg = voucherErr instanceof Error ? voucherErr.message : "Supplier voucher could not be posted"
      console.error(
        `[updateMedicineWithInventory] Supplier receipt failed for medicine ${id} (tenant ${tenantId}): ${msg}`
      )

      const rollbackPatch = Object.fromEntries(
        Object.keys(fieldsPatch).map((k) => [k, (previous as Record<string, unknown>)[k]])
      )

      const results = await Promise.all([
        supabase
          .from("inventory_transactions")
          .delete()
          .eq("medicine_id", id)
          .eq("reference_type", "stock_increase")
          .eq("quantity", stockDelta),
        branchId && preUpdateBranchStock != null
          ? supabase
              .from("medicine_branch_stock")
              .update({ stock_quantity: preUpdateBranchStock })
              .eq("branch_id", branchId)
              .eq("medicine_id", id)
          : Promise.resolve({ error: null }),
        Object.keys(rollbackPatch).length > 0
          ? supabase.from("medicines").update(rollbackPatch).eq("id", id).eq("tenant_id", tenantId)
          : Promise.resolve({ error: null }),
      ])

      const rollbackError = results.find((r) => r.error)?.error
      if (rollbackError) {
        console.error(`[updateMedicineWithInventory] Rollback FAILED for medicine ${id}: ${rollbackError.message}`)
        return {
          data: null,
          error: new Error(
            `${msg}. Automatic cleanup also failed (${rollbackError.message}) — this medicine's stock may be inflated with no matching supplier receipt. Please check Inventory and contact support if it appears.`
          ),
        }
      }

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

/** Soft-delete: hides the medicine from active pickers/lists while keeping every
 *  inventory_transactions/sale_items/prescription_items row it's referenced by
 *  intact. Used instead of deleteMedicine whenever medicineHasRelations is true. */
export async function archiveMedicine(
  supabase: SupabaseClient,
  tenantId: string,
  id: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from("medicines")
    .update({ is_active: false })
    .eq("id", id)
    .eq("tenant_id", tenantId)
  if (error) return { error: new Error(error.message) }
  return { error: null }
}

export async function unarchiveMedicine(
  supabase: SupabaseClient,
  tenantId: string,
  id: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from("medicines")
    .update({ is_active: true })
    .eq("id", id)
    .eq("tenant_id", tenantId)
  if (error) return { error: new Error(error.message) }
  return { error: null }
}
