import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "@/app/api/middleware"
import { enqueueIrdInvoice } from "@/lib/server/services/reports-service"

// IRD CBMS integration stub:
// - Accepts a sale ID
// - Generates or updates invoice_number
// - Enqueues a payload into ird_invoice_queue
// Actual HTTP calls to IRD should be implemented in a background worker or cron.

export async function POST(request: NextRequest) {
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

  const csrfResult = await requireCSRF(request)
  if (csrfResult) {
    logRequest(request, { status: 403, duration: Date.now() - startTime, userId: authResult.user.id })
    return csrfResult
  }

  try {
    const supabase = await createClient()
    const body = await request.json()
    const { saleId } = body

    if (!saleId) {
      return Errors.VALIDATION_ERROR({ saleId: "saleId is required" })
    }

    const result = await enqueueIrdInvoice(supabase, authResult.user.tenantId, authResult.user.id, saleId)

    if (result.status === "not_found") {
      return errorResponse("NOT_FOUND", "Sale not found", { status: 404 })
    }

    if (result.status === "queue_failed") {
      logRequest(request, {
        status: 400,
        duration: Date.now() - startTime,
        userId: authResult.user.id,
        error: result.message,
      })
      return errorResponse("QUEUE_FAILED", result.message, { status: 400 })
    }

    logRequest(request, {
      status: 201,
      duration: Date.now() - startTime,
      userId: authResult.user.id,
    })

    return successResponse(
      {
        saleId: result.saleId,
        invoiceNumber: result.invoiceNumber,
      },
      { status: 201, message: "Invoice enqueued for IRD synchronization" },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : undefined
    logRequest(request, {
      status: 500,
      duration: Date.now() - startTime,
      userId: authResult.user.id,
      error: message,
    })
    return Errors.INTERNAL_ERROR(message || "Failed to enqueue IRD invoice")
  }
}
