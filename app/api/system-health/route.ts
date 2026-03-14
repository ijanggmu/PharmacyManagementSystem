import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requirePermission } from "@/lib/api/auth-middleware"
import { rateLimit } from "@/app/api/middleware"
import { logRequest } from "@/lib/api/logger"
import { Errors } from "@/lib/api/response-utils"

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

  // Restrict to users who can view settings/reports (typically admins/managers)
  const permResult = await requirePermission(request, "settings:read")
  if (permResult instanceof NextResponse) {
    logRequest(request, { status: 403, duration: Date.now() - startTime })
    return permResult
  }

  try {
    const supabase = await createClient()
    const tenantId = permResult.user.tenantId

    // IRD queue status
    const [{ data: irdPending }, { data: irdFailed }, { data: salesFailed }] = await Promise.all([
      supabase
        .from("ird_invoice_queue")
        .select("id, last_error, created_at")
        .eq("tenant_id", tenantId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("ird_invoice_queue")
        .select("id, last_error, created_at")
        .eq("tenant_id", tenantId)
        .eq("status", "failed")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("sales")
        .select("id, invoice_number, ird_status, ird_error, ird_synced_at")
        .eq("tenant_id", tenantId)
        .eq("ird_status", "failed")
        .order("sale_date", { ascending: false })
        .limit(50),
    ])

    const health = {
      ird: {
        pendingCount: irdPending?.length ?? 0,
        failedCount: irdFailed?.length ?? 0,
        recentFailed: (irdFailed || []).slice(0, 5).map((row: any) => ({
          id: row.id,
          last_error: row.last_error,
          created_at: row.created_at,
        })),
        salesFailedCount: salesFailed?.length ?? 0,
      },
    }

    logRequest(request, {
      status: 200,
      duration: Date.now() - startTime,
      userId: permResult.user.id,
    })

    return NextResponse.json({ data: health })
  } catch (error: any) {
    logRequest(request, {
      status: 500,
      duration: Date.now() - startTime,
      userId: permResult.user.id,
      error: error?.message,
    })

    return Errors.INTERNAL_ERROR(error?.message || "Failed to load system health")
  }
}

