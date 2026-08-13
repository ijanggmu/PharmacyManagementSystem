import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireCSRF, requirePermission } from "@/lib/api/auth-middleware"
import { successResponse, Errors, errorResponse } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "@/app/api/middleware"
import { listBankDeposits, recordBankDeposit } from "@/lib/server/services/bank-deposit-service"

const postSchema = z.object({
  branch_id: z.string().uuid(),
  amount: z.number().positive(),
  deposit_date: z.string().min(1),
  reference_note: z.string().max(500).optional().nullable(),
  cash_shift_id: z.string().uuid().optional().nullable(),
})

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const perm = await requirePermission(request, "accounting:read")
  if (perm instanceof NextResponse) return perm

  const tenantId = perm.user.tenantId
  if (!tenantId) return Errors.FORBIDDEN("Tenant context is required")

  try {
    const { searchParams } = new URL(request.url)
    const supabase = await createClient()
    const rows = await listBankDeposits(supabase, tenantId, {
      branch_id: searchParams.get("branch_id") || undefined,
      date_from: searchParams.get("from") || undefined,
      date_to: searchParams.get("to") || undefined,
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
    })
    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: perm.user.id })
    return successResponse(rows)
  } catch (e) {
    logRequest(request, {
      status: 500,
      duration: Date.now() - startTime,
      userId: perm.user.id,
      error: e instanceof Error ? e.message : String(e),
    })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Failed to list bank deposits")
  }
}

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

  try {
    const body = await request.json()
    const parsed = postSchema.parse(body)
    const supabase = await createClient()
    const { data, error } = await recordBankDeposit(supabase, perm.user.id, {
      branch_id: parsed.branch_id,
      amount: parsed.amount,
      deposit_date: parsed.deposit_date,
      reference_note: parsed.reference_note ?? null,
      cash_shift_id: parsed.cash_shift_id ?? null,
    })

    if (error) {
      logRequest(request, {
        status: 400,
        duration: Date.now() - startTime,
        userId: perm.user.id,
        error: error.message,
      })
      return errorResponse("BANK_DEPOSIT_FAILED", error.message, { status: 400 })
    }

    logRequest(request, { status: 201, duration: Date.now() - startTime, userId: perm.user.id })
    return successResponse(data, { message: "Bank deposit recorded", status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) return Errors.VALIDATION_ERROR(e.errors)
    logRequest(request, {
      status: 500,
      duration: Date.now() - startTime,
      userId: perm.user.id,
      error: e instanceof Error ? e.message : String(e),
    })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Bank deposit failed")
  }
}
