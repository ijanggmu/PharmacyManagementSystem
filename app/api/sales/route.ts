/**
 * Sales API Route
 * REST API endpoints for sales management
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { saleSchema } from "@/lib/utils/validation"
import { z } from "zod"

// GET /api/sales - List sales with filters
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    const search = searchParams.get("search")
    const paymentStatus = searchParams.get("paymentStatus")
    const paymentMethod = searchParams.get("paymentMethod")
    const customerId = searchParams.get("customerId")
    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "50")
    const sortBy = searchParams.get("sortBy") || "sale_date"
    const sortOrder = searchParams.get("sortOrder") || "desc"

    let query = supabase
      .from("sales")
      .select(`
        *,
        customers (id, first_name, last_name, phone, email),
        sale_items (
          id,
          quantity,
          unit_price,
          total_price,
          medicines (id, name, strength, form)
        )
      `, { count: "exact" })

    if (search) {
      query = query.ilike("sale_number", `%${search}%`)
    }

    if (paymentStatus) {
      query = query.eq("payment_status", paymentStatus)
    }

    if (paymentMethod) {
      query = query.eq("payment_method", paymentMethod)
    }

    if (customerId) {
      query = query.eq("customer_id", customerId)
    }

    if (dateFrom) {
      query = query.gte("sale_date", dateFrom)
    }

    if (dateTo) {
      query = query.lte("sale_date", dateTo)
    }

    query = query.order(sortBy, { ascending: sortOrder === "asc" })

    const from = (page - 1) * limit
    const to = from + limit - 1
    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      data: data || [],
      count: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}

// POST /api/sales - Create new sale
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const validatedData = saleSchema.parse(body)

    // Generate sale number if not provided
    const saleNumber = validatedData.sale_number || `SALE-${Date.now()}`

    // Start transaction
    const { data: saleData, error: saleError } = await supabase
      .from("sales")
      .insert({
        sale_number: saleNumber,
        customer_id: validatedData.customer_id || null,
        total_amount: validatedData.total_amount,
        discount_amount: validatedData.discount_amount || "0",
        tax_amount: validatedData.tax_amount || "0",
        payment_method: validatedData.payment_method,
        payment_status: validatedData.payment_status || "completed",
        sale_date: validatedData.sale_date || new Date().toISOString().split("T")[0],
        notes: validatedData.notes || null,
      })
      .select()
      .single()

    if (saleError) {
      return NextResponse.json(
        { error: saleError.message },
        { status: 400 }
      )
    }

    // Insert sale items
    if (validatedData.items && validatedData.items.length > 0) {
      const saleItems = validatedData.items.map((item: any) => ({
        sale_id: saleData.id,
        medicine_id: item.medicine_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: (parseFloat(item.unit_price) * item.quantity).toString(),
      }))

      const { error: itemsError } = await supabase
        .from("sale_items")
        .insert(saleItems)

      if (itemsError) {
        // Rollback sale
        await supabase.from("sales").delete().eq("id", saleData.id)
        return NextResponse.json(
          { error: itemsError.message },
          { status: 400 }
        )
      }

      // Update stock quantities
      for (const item of validatedData.items) {
        await supabase.rpc("decrement_stock", {
          medicine_id: item.medicine_id,
          quantity: item.quantity,
        })
      }
    }

    // Fetch complete sale with relations
    const { data: completeSale } = await supabase
      .from("sales")
      .select(`
        *,
        customers (id, first_name, last_name, phone, email),
        sale_items (
          id,
          quantity,
          unit_price,
          total_price,
          medicines (id, name, strength, form)
        )
      `)
      .eq("id", saleData.id)
      .single()

    return NextResponse.json({ data: completeSale }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}

