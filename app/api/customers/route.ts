/**
 * Customers API Route
 * REST API endpoints for customer management
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { customerSchema } from "@/lib/utils/validation"
import { z } from "zod"
import { requireAuth, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../middleware"

// GET /api/customers - List customers with filters
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
    const status = searchParams.get("status")
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "50")
    const sortBy = searchParams.get("sortBy") || "created_at"
    const sortOrder = searchParams.get("sortOrder") || "desc"

    let query = supabase
      .from("customers")
      .select("*", { count: "exact" })

    if (search) {
      // Sanitize search term to prevent injection
      const sanitizedSearch = search.trim().replace(/[%_]/g, '') // Remove SQL wildcards for safety
      const searchPattern = `%${sanitizedSearch}%`
      // Use explicit parameterization with multiple filters instead of string interpolation
      query = query.or(`first_name.ilike.${searchPattern},last_name.ilike.${searchPattern},email.ilike.${searchPattern},phone.ilike.${searchPattern}`)
    }

    if (status) {
      query = query.eq("status", status)
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

// POST /api/customers - Create new customer
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

  // CSRF validation
  const csrfResult = await requireCSRF(request)
  if (csrfResult) {
    logRequest(request, { status: 403, duration: Date.now() - startTime, userId: authResult.user.id })
    return csrfResult
  }

  try {
    const supabase = await createClient()
    const body = await request.json()

    const validatedData = customerSchema.parse(body)

    const { data, error } = await supabase
      .from("customers")
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
      message: "Customer created successfully",
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

