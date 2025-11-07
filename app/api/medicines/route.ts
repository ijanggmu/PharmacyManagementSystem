/**
 * Medicines API Route
 * REST API endpoints for medicine/inventory management
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { medicineSchema } from "@/lib/utils/validation"
import { z } from "zod"
import { requireAuth } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../middleware"

// GET /api/medicines - List medicines with filters
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

    // Get query parameters
    const search = searchParams.get("search")
    const category = searchParams.get("category")
    const stockStatus = searchParams.get("stockStatus")
    const expiryStatus = searchParams.get("expiryStatus")
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "50")
    const sortBy = searchParams.get("sortBy") || "name"
    const sortOrder = searchParams.get("sortOrder") || "asc"

    let query = supabase
      .from("medicines")
      .select(`
        *,
        categories (id, name),
        suppliers (id, name)
      `, { count: "exact" })

    // Apply filters
    if (search) {
      query = query.or(`name.ilike.%${search}%,generic_name.ilike.%${search}%,brand_name.ilike.%${search}%`)
    }

    if (category) {
      query = query.eq("category_id", category)
    }

    if (stockStatus === "low") {
      // Use RPC or filter by comparing stock_quantity <= minimum_stock
      // For now, we'll filter in application logic or use a database function
      // This is a limitation - Supabase doesn't support column comparison in filters directly
      // Consider creating a database view or function for this
    } else if (stockStatus === "out") {
      query = query.eq("stock_quantity", 0)
    }

    if (expiryStatus === "expiring") {
      const thirtyDaysFromNow = new Date()
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
      query = query.lte("expiry_date", thirtyDaysFromNow.toISOString().split("T")[0])
        .gte("expiry_date", new Date().toISOString().split("T")[0])
    } else if (expiryStatus === "expired") {
      query = query.lt("expiry_date", new Date().toISOString().split("T")[0])
    }

    // Apply sorting
    query = query.order(sortBy, { ascending: sortOrder === "asc" })

    // Apply pagination
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

// POST /api/medicines - Create new medicine
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

    // Validate request body
    const validatedData = medicineSchema.parse(body)

    // Generate sale number if not provided
    const { data, error } = await supabase
      .from("medicines")
      .insert(validatedData)
      .select()
      .single()

    if (error) {
      logRequest(request, { 
        status: 400, 
        duration: Date.now() - startTime,
        userId: authResult.user.id,
        error: error.message 
      })
      return errorResponse("CREATE_FAILED", error.message, { status: 400 })
    }

    const response = successResponse(data, { 
      message: "Medicine created successfully",
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

