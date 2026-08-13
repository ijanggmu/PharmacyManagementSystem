/**
 * Sales API Route — delegates persistence to `lib/server/services/sales-service`.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { saleSchema } from "@/lib/utils/validation"
import { z } from "zod"
import { requireAuth, requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../middleware"
import { ROLE_PERMISSIONS, type Role } from "@/lib/security/rbac-types"
import { checkDrugInteractions, checkAllergies, type AllergyMatch } from "@/lib/utils/drug-interactions"
import {
  parseListSalesInput,
  listSalesForTenant,
  createSaleWithRpc,
  resolveSalesBranchScope,
} from "@/lib/server/services/sales-service"

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) {
    logRequest(request, { status: 429, duration: Date.now() - startTime })
    return rateLimitResult
  }

  const authResult = await requirePermission(request, "sales:read")
  if (authResult instanceof NextResponse) {
    logRequest(request, { status: 401, duration: Date.now() - startTime })
    return authResult
  }

  if (!authResult.user.tenantId) {
    return Errors.FORBIDDEN("Tenant context required")
  }

  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const listInput = parseListSalesInput(searchParams, authResult.user.tenantId)
    listInput.branchId = await resolveSalesBranchScope(supabase, authResult.user.id, authResult.user.role)

    const { data, count, error } = await listSalesForTenant(supabase, listInput)

    if (error) {
      logRequest(request, {
        status: 500,
        duration: Date.now() - startTime,
        userId: authResult.user.id,
        error: error.message,
      })
      return Errors.INTERNAL_ERROR(error.message)
    }

    const response = successResponse(data || [], {
      meta: {
        page: listInput.page,
        limit: listInput.limit,
        total: count,
        totalPages: Math.ceil(count / listInput.limit),
      },
    })

    logRequest(request, {
      status: 200,
      duration: Date.now() - startTime,
      userId: authResult.user.id,
    })

    return response
  } catch (error) {
    logRequest(request, {
      status: 500,
      duration: Date.now() - startTime,
      userId: authResult.user.id,
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return Errors.INTERNAL_ERROR(
      error instanceof Error ? error.message : "Internal server error"
    )
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) {
    logRequest(request, { status: 429, duration: Date.now() - startTime })
    return rateLimitResult
  }

  const authResult = await requirePermission(request, "sales:write")
  if (authResult instanceof NextResponse) {
    logRequest(request, { status: 401, duration: Date.now() - startTime })
    return authResult
  }

  if (!authResult.user.tenantId) {
    return Errors.FORBIDDEN("Tenant context required")
  }

  const csrfResult = await requireCSRF(request)
  if (csrfResult) {
    logRequest(request, { status: 403, duration: Date.now() - startTime })
    return csrfResult
  }

  try {
    const supabase = await createClient()
    const body = await request.json()
    const validatedData = saleSchema.parse(body)

    // Controlled-substance sign-off gate: a role without controlled_substances:dispense
    // (e.g. a plain cashier) cannot check out a cart containing a controlled substance —
    // it needs a pharmacist/manager/admin account, not just generic sales:write.
    const medicineIds = [...new Set(validatedData.items.map((item) => item.medicine_id))]
    const { data: cartMedicines } = await supabase
      .from("medicines")
      .select("id, name, generic_name, controlled_substance")
      .in("id", medicineIds)
      .eq("tenant_id", authResult.user.tenantId)

    const hasControlledSubstance = (cartMedicines || []).some(
      (m: { controlled_substance: boolean }) => m.controlled_substance
    )
    if (hasControlledSubstance) {
      const role = authResult.user.role as Role | undefined
      const canDispense = role === "superadmin" || (role ? ROLE_PERMISSIONS[role].includes("controlled_substances:dispense") : false)
      if (!canDispense) {
        logRequest(request, { status: 403, duration: Date.now() - startTime, userId: authResult.user.id })
        return errorResponse(
          "CONTROLLED_SUBSTANCE_APPROVAL_REQUIRED",
          "This sale includes a controlled substance and requires a pharmacist, manager, or admin to complete.",
          { status: 403 }
        )
      }
    }

    // Drug interaction / allergy check — a real, blocking-with-acknowledgment safety
    // gate (previously this code existed but was never called from anywhere). Any
    // match requires the client to resubmit with acknowledge_safety_warnings: true.
    if (!validatedData.acknowledge_safety_warnings) {
      const medicineLabels = (cartMedicines || []).map(
        (m: { name: string; generic_name: string | null }) => m.generic_name || m.name
      )
      const interactions = checkDrugInteractions(medicineLabels)

      let allergyMatch: AllergyMatch | null = null
      if (validatedData.customer_id) {
        allergyMatch = await checkAllergies(supabase, authResult.user.tenantId, validatedData.customer_id, medicineLabels)
      }

      if (interactions.length > 0 || allergyMatch?.hasAllergy) {
        logRequest(request, { status: 409, duration: Date.now() - startTime, userId: authResult.user.id })
        return errorResponse(
          "SAFETY_WARNING",
          "This cart triggered a drug interaction or allergy warning — review before completing the sale.",
          {
            status: 409,
            details: {
              interactions,
              allergy: allergyMatch,
            },
          }
        )
      }
    }

    const { data: completeSale, error: createError } = await createSaleWithRpc(
      supabase,
      authResult.user.id,
      authResult.user.tenantId,
      validatedData
    )

    if (createError) {
      logRequest(request, {
        status: 400,
        duration: Date.now() - startTime,
        userId: authResult.user.id,
        error: createError.message,
      })
      return errorResponse("CREATE_FAILED", createError.message, { status: 400 })
    }

    const response = successResponse(completeSale, {
      message: "Sale created successfully",
      status: 201,
    })

    logRequest(request, {
      status: 201,
      duration: Date.now() - startTime,
      userId: authResult.user.id,
    })

    return response
  } catch (error) {
    if (error instanceof z.ZodError) {
      logRequest(request, {
        status: 400,
        duration: Date.now() - startTime,
        userId: authResult.user.id,
        error: "Validation error",
      })
      return Errors.VALIDATION_ERROR(error.errors)
    }

    logRequest(request, {
      status: 500,
      duration: Date.now() - startTime,
      userId: authResult.user.id,
      error: error instanceof Error ? error.message : "Unknown error",
    })

    return Errors.INTERNAL_ERROR(
      error instanceof Error ? error.message : "Internal server error"
    )
  }
}
