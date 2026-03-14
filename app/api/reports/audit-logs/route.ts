import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requirePermission } from "@/lib/api/auth-middleware"
import { rateLimit } from "@/app/api/middleware"
import { logRequest } from "@/lib/api/logger"
import { successResponse, Errors } from "@/lib/api/response-utils"

// GET /api/reports/audit-logs
// Tenant-scoped audit logs list with basic filters
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

  const permResult = await requirePermission(request, "reports:read")
  if (permResult instanceof NextResponse) {
    logRequest(request, { status: 403, duration: Date.now() - startTime })
    return permResult
  }

  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    const page = parseInt(searchParams.get("page") || "1", 10)
    const limit = parseInt(searchParams.get("limit") || "50", 10)
    const tableName = searchParams.get("table") || undefined
    const action = searchParams.get("action") || undefined
    const dateFrom = searchParams.get("from") || undefined
    const dateTo = searchParams.get("to") || undefined

    const tenantId = authResult.user.tenantId
    if (!tenantId) {
      logRequest(request, {
        status: 403,
        duration: Date.now() - startTime,
        userId: authResult.user.id,
        error: "Tenant context is required for audit logs",
      })
      return Errors.FORBIDDEN("Tenant context is required for audit logs")
    }

    let query = supabase
      .from("audit_logs")
      .select(
        `
        id,
        user_id,
        table_name,
        record_id,
        action,
        created_at,
        ip_address,
        user_agent,
        tenant_id
      `,
        { count: "exact" },
      )
      .eq("tenant_id", tenantId)

    if (tableName) {
      query = query.eq("table_name", tableName)
    }

    if (action) {
      query = query.eq("action", action)
    }

    if (dateFrom) {
      query = query.gte("created_at", dateFrom)
    }

    if (dateTo) {
      query = query.lte("created_at", dateTo)
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
        error: error.message,
      })
      return Errors.INTERNAL_ERROR(error.message)
    }

    logRequest(request, {
      status: 200,
      duration: Date.now() - startTime,
      userId: authResult.user.id,
    })

    return successResponse(data || [], {
      meta: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    })
  } catch (error: any) {
    logRequest(request, {
      status: 500,
      duration: Date.now() - startTime,
      userId: authResult.user.id,
      error: error.message,
    })
    return Errors.INTERNAL_ERROR(error.message || "Failed to load audit logs")
  }
}

