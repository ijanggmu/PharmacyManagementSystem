/**
 * Receive goods against a purchase order (GRN + stock + supplier ledger).
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAuth, requireCSRF, requirePermission } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../../middleware"
import { createClient } from "@/lib/supabase/server"
import { receiveGoods } from "@/lib/server/services/purchase-service"

const bodySchema = z.object({
  purchaseOrderId: z.string().uuid(),
  receiptDate: z.string().min(1),
  supplierInvoiceNumber: z.string().max(120).optional().nullable(),
  items: z.array(
    z.object({
      purchase_order_item_id: z.string().uuid(),
      medicine_id: z.string().uuid(),
      quantity_to_receive: z.number().int().nonnegative(),
      unit_cost: z.string().min(1),
      vat_amount: z.coerce.number().min(0).optional().default(0),
      batch_number: z.string().max(100).optional().nullable(),
      expiry_date: z.string().optional().nullable(),
    })
  ),
})

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const perm = await requirePermission(request, "inventory:write")
  if (perm instanceof NextResponse) return perm

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  const tenantId = perm.user.tenantId
  if (!tenantId) {
    return Errors.FORBIDDEN("Tenant context is required for purchase orders")
  }

  try {
    const body = await request.json()
    const parsed = bodySchema.parse(body)
    const supabase = await createClient()

    const data = await receiveGoods(
      supabase,
      {
        purchaseOrderId: parsed.purchaseOrderId,
        receiptDate: parsed.receiptDate,
        actorUserId: perm.user.id,
        supplierInvoiceNumber: parsed.supplierInvoiceNumber ?? null,
        items: parsed.items.map((row) => ({
          purchase_order_item_id: row.purchase_order_item_id,
          medicine_id: row.medicine_id,
          quantity_to_receive: row.quantity_to_receive,
          unit_cost: row.unit_cost,
          vat_amount: row.vat_amount,
          batch_number: row.batch_number ?? null,
          expiry_date: row.expiry_date ?? null,
        })),
      },
      tenantId
    )

    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: perm.user.id })
    return successResponse(data, { message: "Goods received" })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return Errors.VALIDATION_ERROR(e.errors)
    }
    logRequest(request, {
      status: 400,
      duration: Date.now() - startTime,
      userId: perm.user.id,
      error: e instanceof Error ? e.message : String(e),
    })
    return errorResponse("RECEIVE_FAILED", e instanceof Error ? e.message : "Receive failed", { status: 400 })
  }
}
