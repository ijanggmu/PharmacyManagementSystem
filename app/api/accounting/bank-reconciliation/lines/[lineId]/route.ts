/** Match / unmatch / ignore a single bank statement line. */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../../../../middleware"
import {
  matchBankStatementLine,
  unmatchBankStatementLine,
  ignoreBankStatementLine,
} from "@/lib/server/services/bank-reconciliation-service"

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("match"), voucher_line_id: z.string().uuid() }),
  z.object({ action: z.literal("unmatch") }),
  z.object({ action: z.literal("ignore"), note: z.string().max(500).nullable().optional() }),
])

export async function PATCH(request: NextRequest, context: { params: Promise<{ lineId: string }> }) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requirePermission(request, "accounting:write")
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context is required")

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  try {
    const { lineId } = await context.params
    const body = await request.json()
    const parsed = bodySchema.parse(body)
    const supabase = await createClient()

    let error: Error | null = null
    if (parsed.action === "match") {
      ;({ error } = await matchBankStatementLine(supabase, authResult.user.tenantId, authResult.user.id, lineId, parsed.voucher_line_id))
    } else if (parsed.action === "unmatch") {
      ;({ error } = await unmatchBankStatementLine(supabase, authResult.user.tenantId, lineId))
    } else {
      ;({ error } = await ignoreBankStatementLine(supabase, authResult.user.tenantId, lineId, parsed.note ?? null))
    }

    if (error) return errorResponse("UPDATE_FAILED", error.message, { status: 400 })

    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse({ action: parsed.action })
  } catch (e) {
    if (e instanceof z.ZodError) return Errors.VALIDATION_ERROR(e.errors)
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: e instanceof Error ? e.message : String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
