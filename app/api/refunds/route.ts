/**
 * Refunds API Route
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/api/auth-middleware"
import { successResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../middleware"

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) {
    logRequest(request, { status: 429, duration: Date.now() - startTime })
    return rateLimitResult
  }

  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) {
    logRequest(request, { status: 401, duration: Date.now() - startTime })
    return authResult
  }

  try {
    const supabase = await createClient()
    const tenantId = authResult.user.tenantId

    if (!tenantId) {
      logRequest(request, {
        status: 403,
        duration: Date.now() - startTime,
        userId: authResult.user.id,
        error: "Tenant context is required for refunds",
      })
      return Errors.FORBIDDEN("Tenant context is required for refunds")
    }
    const { searchParams } = new URL(request.url)

    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "50")
    const status = searchParams.get("status")

    let query = supabase
      .from("sales_refunds")
      .select("*", { count: "exact" })
      .eq("tenant_id", tenantId)

    if (status) {
      query = query.eq("status", status)
    }

    query = query.order("created_at", { ascending: false })

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

    logRequest(request, { 
      status: 200, 
      duration: Date.now() - startTime,
      userId: authResult.user.id 
    })

    return successResponse(data || [], {
      meta: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    })
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

