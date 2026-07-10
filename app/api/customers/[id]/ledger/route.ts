import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requirePermission } from "@/lib/api/auth-middleware"
import { successResponse, Errors, errorResponse } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "@/app/api/middleware"
import { listCustomerLedger } from "@/lib/server/services/customer-ledger-service"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const perm = await requirePermission(request, "accounting:read")
  if (perm instanceof NextResponse) return perm

  const tenantId = perm.user.tenantId
  if (!tenantId) return Errors.FORBIDDEN("Tenant context required")

  const { id } = await params
  if (!id) return errorResponse("VALIDATION", "Customer id is required", { status: 400 })

  const { searchParams } = new URL(request.url)
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") || "200", 10) || 200))

  try {
    const supabase = await createClient()
    const { data, error } = await listCustomerLedger(supabase, tenantId, id, { limit })
    if (error) {
      logRequest(request, { status: 500, duration: Date.now() - startTime, userId: perm.user.id, error: error.message })
      return Errors.INTERNAL_ERROR(error.message)
    }
    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: perm.user.id })
    return successResponse({ rows: data })
  } catch (e) {
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: perm.user.id, error: String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Failed to load customer ledger")
  }
}

