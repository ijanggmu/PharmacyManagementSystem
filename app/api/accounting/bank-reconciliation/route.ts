/**
 * Bank statement imports — list and create. See
 * lib/server/services/bank-reconciliation-service.ts.
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../../middleware"
import { listBankStatementImports, createBankStatementImport } from "@/lib/server/services/bank-reconciliation-service"

const createSchema = z.object({
  account_id: z.string().uuid(),
  branch_id: z.string().uuid().nullable().optional(),
  statement_label: z.string().max(200).nullable().optional(),
  period_start: z.string().min(1),
  period_end: z.string().min(1),
  opening_balance: z.number().nullable().optional(),
  closing_balance: z.number().nullable().optional(),
  lines: z
    .array(
      z.object({
        txn_date: z.string().min(1),
        description: z.string().max(500).nullable().optional(),
        reference: z.string().max(200).nullable().optional(),
        debit: z.number().nonnegative().optional(),
        credit: z.number().nonnegative().optional(),
      })
    )
    .min(1)
    .max(2000),
})

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requirePermission(request, "accounting:read")
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context is required")

  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const { data, error } = await listBankStatementImports(supabase, authResult.user.tenantId, {
      accountId: searchParams.get("accountId"),
      limit: parseInt(searchParams.get("limit") || "50"),
    })
    if (error) return Errors.INTERNAL_ERROR(error.message)

    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data)
  } catch (e) {
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: e instanceof Error ? e.message : String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requirePermission(request, "accounting:write")
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context is required")

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  try {
    const body = await request.json()
    const parsed = createSchema.parse(body)

    const supabase = await createClient()
    const { data, error } = await createBankStatementImport(supabase, authResult.user.tenantId, authResult.user.id, {
      accountId: parsed.account_id,
      branchId: parsed.branch_id,
      statementLabel: parsed.statement_label,
      periodStart: parsed.period_start,
      periodEnd: parsed.period_end,
      openingBalance: parsed.opening_balance,
      closingBalance: parsed.closing_balance,
      lines: parsed.lines.map((l) => ({
        txnDate: l.txn_date,
        description: l.description,
        reference: l.reference,
        debit: l.debit,
        credit: l.credit,
      })),
    })
    if (error) return errorResponse("IMPORT_FAILED", error.message, { status: 400 })

    logRequest(request, { status: 201, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data, { message: "Statement imported", status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) return Errors.VALIDATION_ERROR(e.errors)
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: e instanceof Error ? e.message : String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
