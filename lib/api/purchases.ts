/**
 * Purchase Orders API
 */

import { createClient } from "@/lib/supabase/client"

export interface PurchaseOrder {
  id: string
  order_number: string
  supplier_id: string
  order_date: string
  expected_delivery_date: string | null
  status: "draft" | "pending" | "approved" | "ordered" | "received" | "cancelled"
  total_amount: string
  notes: string | null
  created_at: string
  suppliers: {
    id: string
    name: string
  } | null
  purchase_order_items: PurchaseOrderItem[]
}

export interface PurchaseOrderItem {
  id: string
  purchase_order_id: string
  medicine_id: string
  quantity_ordered: number
  quantity_received: number
  unit_cost: string
  total_cost: string
  medicines: {
    id: string
    name: string
  } | null
}

export const purchasesApi = {
  getPurchaseOrders: async (filters: {
    status?: string
    supplierId?: string
    page?: number
    limit?: number
  } = {}) => {
    const supabase = createClient()
    let query = supabase
      .from("purchase_orders")
      .select(`
        *,
        suppliers (id, name),
        purchase_order_items (
          *,
          medicines (id, name)
        )
      `, { count: "exact" })

    if (filters.status) {
      query = query.eq("status", filters.status)
    }

    if (filters.supplierId) {
      query = query.eq("supplier_id", filters.supplierId)
    }

    query = query.order("created_at", { ascending: false })

    const page = filters.page || 1
    const limit = filters.limit || 50
    const from = (page - 1) * limit
    const to = from + limit - 1

    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) throw error

    return {
      data: data || [],
      count: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
      error: null,
    }
  },

  createPurchaseOrder: async (orderData: {
    supplier_id: string
    order_date: string
    expected_delivery_date?: string
    notes?: string
    items: Array<{
      medicine_id: string
      quantity_ordered: number
      unit_cost: string
    }>
  }) => {
    const supabase = createClient()

    const orderNumber = `PO-${Date.now()}`

    const { data: order, error: orderError } = await supabase
      .from("purchase_orders")
      .insert({
        order_number: orderNumber,
        supplier_id: orderData.supplier_id,
        order_date: orderData.order_date,
        expected_delivery_date: orderData.expected_delivery_date || null,
        status: "draft",
        notes: orderData.notes || null,
      })
      .select()
      .single()

    if (orderError) throw orderError

    // Insert items
    if (orderData.items.length > 0) {
      const items = orderData.items.map((item) => ({
        purchase_order_id: order.id,
        medicine_id: item.medicine_id,
        quantity_ordered: item.quantity_ordered,
        quantity_received: 0,
        unit_cost: item.unit_cost,
        total_cost: (parseFloat(item.unit_cost) * item.quantity_ordered).toString(),
      }))

      const { error: itemsError } = await supabase
        .from("purchase_order_items")
        .insert(items)

      if (itemsError) {
        await supabase.from("purchase_orders").delete().eq("id", order.id)
        throw itemsError
      }
    }

    return { data: order, error: null }
  },
}

