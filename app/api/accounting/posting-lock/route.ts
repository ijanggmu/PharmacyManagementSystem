import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireCSRF, requirePermission } from "@/lib/api/auth-middleware"
import { successResponse, Errors, errorResponse } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "@/app/api/middleware"
import { getPostingLockDate } from "@/lib/server/services/accounting-service"

const putBodySchema = z.object({
  lock_date: z.union([z.string(), z.null()]),
})

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const perm = await requirePermission(request, "accounting:read")
  if (perm instanceof NextResponse) return perm

  if (!perm.user.tenantId) {
    return Errors.FORBIDDEN("Tenant context required")
  }

  try {
    const supabase = await createClient()
    const { lockDate, error } = await getPostingLockDate(supabase, perm.user.tenantId)
    if (error) {
      logRequest(request, { status: 500, duration: Date.now() - startTime, userId: perm.user.id, error: error.message })
      return Errors.INTERNAL_ERROR(error.message)
    }
    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: perm.user.id })
    return successResponse({ lock_date: lockDate })
  } catch (e) {
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: perm.user.id, error: String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Failed to load posting lock")
  }
}

export async function PUT(request: NextRequest) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const perm = await requirePermission(request, "accounting:write")
  if (perm instanceof NextResponse) return perm

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  if (!perm.user.tenantId) {
    return Errors.FORBIDDEN("Tenant context required")
  }

  try {
    const body = await request.json()
    const parsed = putBodySchema.parse(body)
    const supabase = await createClient()

    const raw = parsed.lock_date
    const value =
      raw == null || raw.trim() === "" ? "" : raw.trim().slice(0, 10)

    const { data: existing, error: selErr } = await supabase
      .from("system_settings")
      .select("id")
      .eq("tenant_id", perm.user.tenantId)
      .eq("key", "accounting_posting_lock_date")
      .maybeSingle()

    if (selErr) {
      logRequest(request, { status: 400, duration: Date.now() - startTime, userId: perm.user.id, error: selErr.message })
      return errorResponse("UPDATE_FAILED", selErr.message, { status: 400 })
    }

    const payload = {
      tenant_id: perm.user.tenantId,
      key: "accounting_posting_lock_date" as const,
      value,
      type: "string" as const,
      updated_at: new Date().toISOString(),
    }

    const { error: writeErr } = existing?.id
      ? await supabase.from("system_settings").update(payload).eq("id", existing.id)
      : await supabase.from("system_settings").insert(payload)

    if (writeErr) {
      logRequest(request, { status: 400, duration: Date.now() - startTime, userId: perm.user.id, error: writeErr.message })
      return errorResponse("UPDATE_FAILED", writeErr.message, { status: 400 })
    }

    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: perm.user.id })
    return successResponse({ lock_date: value || null }, { message: "Posting lock updated" })
  } catch (e) {
    if (e instanceof z.ZodError) return Errors.VALIDATION_ERROR(e.errors)
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: perm.user.id, error: String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Failed to update posting lock")
  }
}
