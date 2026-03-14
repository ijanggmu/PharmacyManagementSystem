import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "@/app/api/middleware"

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

  try {
    const supabase = await createClient()
    const body = await request.json()
    const { saleId } = body

    if (!saleId) {
      return Errors.VALIDATION_ERROR({ saleId: "saleId is required" })
    }

    // Load sale for this tenant
    const { data: sale, error: saleError } = await supabase
      .from("sales")
      .select(
        `
        *,
        customers (id, first_name, last_name, phone),
        sale_items (
          id,
          quantity,
          unit_price,
          total_price,
          medicines (id, name, generic_name, is_taxable)
        )
      `,
      )
      .eq("id", saleId)
      .eq("tenant_id", authResult.user.tenantId)
      .single()

    if (saleError || !sale) {
      return errorResponse("NOT_FOUND", "Sale not found", { status: 404 })
    }

    // Generate invoice number if missing (simple per-tenant pattern; can be replaced with IRD-specific sequencing)
    let invoiceNumber = sale.invoice_number
    if (!invoiceNumber) {
      const today = new Date()
      const y = today.getFullYear().toString().slice(-2)
      const m = String(today.getMonth() + 1).padStart(2, "0")
      const d = String(today.getDate()).padStart(2, "0")
      invoiceNumber = `INV-${y}${m}${d}-${Math.floor(Math.random() * 9000 + 1000)}`

      // Lock sale once it has an invoice number and is enqueued for IRD
      await supabase
        .from("sales")
        .update({
          invoice_number: invoiceNumber,
          locked_at: new Date().toISOString(),
          locked_by: authResult.user.id,
        })
        .eq("id", sale.id)
        .eq("tenant_id", authResult.user.tenantId)
    }

    // Build minimal IRD payload
    const payload = {
      invoiceNumber,
      saleDate: sale.sale_date,
      totalAmount: sale.total_amount,
      taxAmount: sale.tax_amount,
      discountAmount: sale.discount_amount,
      customer: sale.customers
        ? {
            id: sale.customers.id,
            name: `${sale.customers.first_name} ${sale.customers.last_name}`,
            phone: sale.customers.phone,
          }
        : null,
      items:
        sale.sale_items?.map((item: any) => ({
          name: item.medicines?.name,
          genericName: item.medicines?.generic_name,
          quantity: item.quantity,
          unitPrice: item.unit_price,
          totalPrice: item.total_price,
          isTaxable: item.medicines?.is_taxable ?? true,
        })) ?? [],
    }

    // Enqueue for IRD sync
    const { error: queueError } = await supabase.from("ird_invoice_queue").insert({
      tenant_id: authResult.user.tenantId,
      sale_id: sale.id,
      payload,
      status: "pending",
      attempts: 0,
    })

    if (queueError) {
      logRequest(request, {
        status: 400,
        duration: Date.now() - startTime,
        userId: authResult.user.id,
        error: queueError.message,
      })
      return errorResponse("QUEUE_FAILED", queueError.message, { status: 400 })
    }

    logRequest(request, {
      status: 201,
      duration: Date.now() - startTime,
      userId: authResult.user.id,
    })

    return successResponse(
      {
        saleId: sale.id,
        invoiceNumber,
      },
      { status: 201, message: "Invoice enqueued for IRD synchronization" },
    )
  } catch (error: any) {
    logRequest(request, {
      status: 500,
      duration: Date.now() - startTime,
      userId: authResult.user.id,
      error: error?.message,
    })
    return Errors.INTERNAL_ERROR(error?.message || "Failed to enqueue IRD invoice")
  }
}

