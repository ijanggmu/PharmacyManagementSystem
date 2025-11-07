/**
 * Settings API Route
 */

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requirePermission } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
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
    const { searchParams } = new URL(request.url)
    const category = searchParams.get("category")

    let query = supabase
      .from("system_settings")
      .select("*")

    if (category) {
      query = query.eq("category", category)
    }

    query = query.order("key", { ascending: true })

    const { data, error } = await query

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

    return successResponse(data || [])
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

export async function PUT(request: NextRequest) {
  const startTime = Date.now()
  
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) {
    logRequest(request, { status: 429, duration: Date.now() - startTime })
    return rateLimitResult
  }

  // Require settings:write permission
  const permResult = await requirePermission(request, "settings:write")
  if (permResult instanceof NextResponse) {
    logRequest(request, { status: 403, duration: Date.now() - startTime })
    return permResult
  }

  try {
    const supabase = await createClient()
    const body = await request.json()
    const { key, value, type } = body

    if (!key || value === undefined) {
      return Errors.VALIDATION_ERROR({ key: "Key and value are required" })
    }

    const { data, error } = await supabase
      .from("system_settings")
      .upsert({
        key,
        value: String(value),
        type: type || "string",
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      logRequest(request, { 
        status: 400, 
        duration: Date.now() - startTime,
        userId: permResult.user.id,
        error: error.message 
      })
      return errorResponse("UPDATE_FAILED", error.message, { status: 400 })
    }

    logRequest(request, { 
      status: 200, 
      duration: Date.now() - startTime,
      userId: permResult.user.id 
    })

    return successResponse(data, { message: "Setting updated successfully" })
  } catch (error) {
    logRequest(request, { 
      status: 500, 
      duration: Date.now() - startTime,
      userId: permResult.user.id,
      error: error instanceof Error ? error.message : "Unknown error"
    })
    return Errors.INTERNAL_ERROR(
      error instanceof Error ? error.message : "Internal server error"
    )
  }
}

