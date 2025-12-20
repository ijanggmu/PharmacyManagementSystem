/**
 * Sales API Route
 * REST API endpoints for sales management
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { saleSchema } from "@/lib/utils/validation"
import { z } from "zod"
import { requireAuth, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../middleware"

// GET /api/sales - List sales with filters
export async function GET(request: NextRequest) {
  const startTime = Date.now()
  
  // Rate limiting
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) {
    logRequest(request, { status: 429, duration: Date.now() - startTime })
    return rateLimitResult
  }

  // Authentication
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) {
    logRequest(request, { status: 401, duration: Date.now() - startTime })
    return authResult
  }

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
      logRequest(request, { 
        status: 500, 
        duration: Date.now() - startTime,
        userId: authResult.user.id,
        error: error.message 
      })
      return Errors.INTERNAL_ERROR(error.message)
    }

    const response = successResponse(data || [], {
      meta: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    })

    logRequest(request, { 
      status: 200, 
      duration: Date.now() - startTime,
      userId: authResult.user.id 
    })

    return response
  } catch (error) {
    logRequest(request, { 
      status: 500, 
      duration: Date.now() - startTime,
      userId: authResult.user.id,
      error: error instanceof Error ? error.message : "Unknown error"
    })
    return Errors.INTERNAL_ERROR(
      error instanceof Error ? error.message : "Internal server error"
    )
  }
}

// POST /api/sales - Create new sale
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  // Rate limiting
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) {
    logRequest(request, { status: 429, duration: Date.now() - startTime })
    return rateLimitResult
  }

  // Authentication
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) {
    logRequest(request, { status: 401, duration: Date.now() - startTime })
    return authResult
  }

  try {
    const supabase = await createClient()
    const body = await request.json()

    const validatedData = saleSchema.parse(body)

    // Calculate total amount from items
    const totalAmount = validatedData.items.reduce((sum: number, item: any) => {
      const itemTotal = item.unit_price * item.quantity
      const discount = item.discount ? (itemTotal * item.discount / 100) : 0
      return sum + itemTotal - discount
    }, 0)

    // Generate sale number
    const saleNumber = `SALE-${Date.now()}`

    // Use atomic transaction function for all-or-nothing operation
    const itemsJson = validatedData.items.map((item: any) => ({
      medicine_id: item.medicine_id,
      quantity: item.quantity,
      unit_price: item.unit_price.toString(),
    }))

    const { data: saleId, error: transactionError } = await supabase.rpc(
      "create_sale_with_items",
      {
        p_sale_number: saleNumber,
        p_customer_id: validatedData.customer_id || null,
        p_total_amount: (totalAmount + (validatedData.tax_amount || 0) - (validatedData.discount_amount || 0)).toString(),
        p_discount_amount: (validatedData.discount_amount || 0).toString(),
        p_tax_amount: (validatedData.tax_amount || 0).toString(),
        p_payment_method: validatedData.payment_method,
        p_sale_date: new Date().toISOString(),
        p_notes: validatedData.notes || null,
        p_user_id: authResult.user.id,
        p_items: itemsJson,
      }
    )

    if (transactionError) {
      logRequest(request, { 
        status: 400, 
        duration: Date.now() - startTime,
        userId: authResult.user.id,
        error: transactionError.message 
      })
      return errorResponse("CREATE_FAILED", transactionError.message, { status: 400 })
    }

    // Fetch complete sale with relations
    const { data: completeSale, error: fetchError } = await supabase
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
      .eq("id", saleId)
      .single()

    if (fetchError) {
      logRequest(request, { 
        status: 500, 
        duration: Date.now() - startTime,
        userId: authResult.user.id,
        error: fetchError.message 
      })
      return errorResponse("FETCH_FAILED", "Sale created but failed to fetch details", { status: 500 })
    }

    const response = successResponse(completeSale, { 
      message: "Sale created successfully",
      status: 201 
    })

    logRequest(request, { 
      status: 201, 
      duration: Date.now() - startTime,
      userId: authResult.user.id 
    })

    return response
  } catch (error) {
    if (error instanceof z.ZodError) {
      logRequest(request, { 
        status: 400, 
        duration: Date.now() - startTime,
        userId: authResult.user.id,
        error: "Validation error" 
      })
      return Errors.VALIDATION_ERROR(error.errors)
    }
    
    logRequest(request, { 
      status: 500, 
      duration: Date.now() - startTime,
      userId: authResult.user.id,
      error: error instanceof Error ? error.message : "Unknown error"
    })
    
    return Errors.INTERNAL_ERROR(
      error instanceof Error ? error.message : "Internal server error"
    )
  }
}

