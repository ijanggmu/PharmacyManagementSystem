import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requirePermission } from "@/lib/api/auth-middleware"
import { rateLimit } from "@/app/api/middleware"
import { logRequest } from "@/lib/api/logger"
import { successResponse, Errors } from "@/lib/api/response-utils"
import { getSupplierLedgerForTenant } from "@/lib/server/services/supplier-ledger-service"

// Supplier ledger summary and entries per supplier

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

  const perm = await requirePermission(request, "suppliers:read")
  if (perm instanceof NextResponse) {
    logRequest(request, { status: 403, duration: Date.now() - startTime })
    return perm
  }
  if (!perm.user.tenantId) {
    return Errors.FORBIDDEN("Tenant context is required")
  }

  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const supplierId = searchParams.get("supplierId")

    if (!supplierId) {
      return Errors.VALIDATION_ERROR({ supplierId: "supplierId is required" })
    }

    const { data, error } = await getSupplierLedgerForTenant(supabase, perm.user.tenantId, supplierId)
    if (error) throw error

    logRequest(request, {
      status: 200,
      duration: Date.now() - startTime,
      userId: perm.user.id,
    })

    return successResponse(data)
  } catch (error: any) {
    logRequest(request, {
      status: 500,
      duration: Date.now() - startTime,
      userId: perm.user.id,
      error: error?.message,
    })
    return Errors.INTERNAL_ERROR(error?.message || "Failed to load supplier ledger")
  }
}
