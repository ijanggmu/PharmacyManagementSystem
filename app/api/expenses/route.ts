/**
 * Operating expenses — list and create. See lib/server/services/expense-service.ts.
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../middleware"
import { EXPENSE_CATEGORIES, listExpensesForTenant, createExpenseForTenant } from "@/lib/server/services/expense-service"

const createSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().max(500).nullable().optional(),
  amount: z.number().positive(),
  expense_date: z.string().min(1),
  payment_method: z.enum(["cash", "bank", "card", "other"]).nullable().optional(),
  receipt_reference: z.string().max(120).nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
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
    const { data, count, error } = await listExpensesForTenant(supabase, authResult.user.tenantId, {
      from: searchParams.get("from"),
      to: searchParams.get("to"),
      category: searchParams.get("category"),
      page: parseInt(searchParams.get("page") || "1"),
      limit: parseInt(searchParams.get("limit") || "50"),
    })
    if (error) return Errors.INTERNAL_ERROR(error.message)

    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data, { meta: { total: count } })
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
    const { data, error } = await createExpenseForTenant(supabase, authResult.user.tenantId, authResult.user.id, parsed)
    if (error) return errorResponse("CREATE_FAILED", error.message, { status: 400 })

    logRequest(request, { status: 201, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data, { message: "Expense recorded", status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) return Errors.VALIDATION_ERROR(e.errors)
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: e instanceof Error ? e.message : String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
