import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { rateLimit } from "@/app/api/middleware"
import { createCategorySchema } from "@/lib/server/schemas/categories"
import { listCategoriesForTenant, createCategoryForTenant } from "@/lib/server/services/category-service"

export async function GET(request: NextRequest) {
  const limited = rateLimit(request)
  if (limited) return limited

  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) return auth
  if (!auth.user.tenantId) return Errors.FORBIDDEN("Tenant context is required")

  const supabase = await createClient()
  const { data, error } = await listCategoriesForTenant(supabase, auth.user.tenantId)

  if (error) return errorResponse("LIST_CATEGORIES_FAILED", error.message, { status: 400 })
  return successResponse(data)
}

export async function POST(request: NextRequest) {
  const limited = rateLimit(request)
  if (limited) return limited

  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) return auth
  if (!auth.user.tenantId) return Errors.FORBIDDEN("Tenant context is required")

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  try {
    const body = await request.json()
    const payload = createCategorySchema.parse(body)

    const supabase = await createClient()
    const { data, error } = await createCategoryForTenant(supabase, auth.user.tenantId, payload)

    if (error) return errorResponse("CREATE_CATEGORY_FAILED", error.message, { status: 400 })
    return successResponse(data, { status: 201, message: "Category created successfully" })
  } catch (error) {
    if (error instanceof z.ZodError) return Errors.VALIDATION_ERROR(error.errors)
    return Errors.INTERNAL_ERROR(error instanceof Error ? error.message : "Internal server error")
  }
}
