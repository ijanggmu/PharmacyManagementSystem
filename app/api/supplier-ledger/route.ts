import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/api/auth-middleware"
import { rateLimit } from "@/app/api/middleware"
import { logRequest } from "@/lib/api/logger"
import { successResponse, Errors } from "@/lib/api/response-utils"

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

  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const supplierId = searchParams.get("supplierId")

    if (!supplierId) {
      return Errors.VALIDATION_ERROR({ supplierId: "supplierId is required" })
    }

    const { data: entries, error } = await supabase
      .from("supplier_ledger_entries")
      .select("*")
      .eq("tenant_id", authResult.user.tenantId)
      .eq("supplier_id", supplierId)
      .order("entry_date", { ascending: true })
      .order("created_at", { ascending: true })

    if (error) throw error

    const balance = entries?.length ? entries[entries.length - 1].balance_after : 0

    logRequest(request, {
      status: 200,
      duration: Date.now() - startTime,
      userId: authResult.user.id,
    })

    return successResponse({
      supplierId,
      balance,
      entries: entries || [],
    })
  } catch (error: any) {
    logRequest(request, {
      status: 500,
      duration: Date.now() - startTime,
      userId: authResult.user.id,
      error: error?.message,
    })
    return Errors.INTERNAL_ERROR(error?.message || "Failed to load supplier ledger")
  }
}

