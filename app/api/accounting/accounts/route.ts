import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, Errors, errorResponse } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "@/app/api/middleware"
import { createAccountHead, listAccounts } from "@/lib/server/services/accounting-service"
import { z } from "zod"

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const perm = await requirePermission(request, "accounting:read")
  if (perm instanceof NextResponse) return perm

  if (!authResult.user.tenantId) {
    return Errors.FORBIDDEN("Tenant context required")
  }

  try {
    const supabase = await createClient()
    const { data, error } = await listAccounts(supabase, authResult.user.tenantId)
    if (error) {
      logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: error.message })
      return Errors.INTERNAL_ERROR(error.message)
    }
    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data)
  } catch (e) {
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Failed to load accounts")
  }
}

const createAccountSchema = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(200),
  account_type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
})

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const perm = await requirePermission(request, "accounting:write")
  if (perm instanceof NextResponse) return perm

  const csrf = await requireCSRF(request)
  if (csrf) return csrf

  if (!authResult.user.tenantId) {
    return Errors.FORBIDDEN("Tenant context required")
  }

  try {
    const body = await request.json()
    const input = createAccountSchema.parse(body)
    const supabase = await createClient()
    const { data, error } = await createAccountHead(supabase, authResult.user.tenantId, input)
    if (error || !data) {
      return errorResponse("CREATE_FAILED", error?.message || "Failed to create account", { status: 400 })
    }
    logRequest(request, { status: 201, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data, { status: 201, message: "Account head created" })
  } catch (e) {
    if (e instanceof z.ZodError) return Errors.VALIDATION_ERROR(e.errors)
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Failed to create account head")
  }
}
