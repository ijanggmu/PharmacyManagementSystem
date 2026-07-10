/**
 * Post supplier payable + purchase voucher for inventory already added against a supplier
 * (single medicine, bulk rows, or import — one GRN per supplier batch).
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireCSRF, requirePermission } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../../middleware"
import { createClient } from "@/lib/supabase/server"
import { postDirectInventorySupplierReceipts } from "@/lib/server/services/inventory-supplier-receipt-service"

const lineSchema = z.object({
  medicineId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unitCost: z.coerce.number().nonnegative(),
  vatAmount: z.coerce.number().min(0).optional().default(0),
})

const batchSchema = z.object({
  supplierId: z.string().uuid(),
  lines: z.array(lineSchema).min(1),
})

const bodySchema = z.object({
  receiptDate: z.string().min(1),
  supplierInvoiceNumber: z.string().max(120).optional().nullable(),
  batches: z.array(batchSchema).min(1),
})

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const perm = await requirePermission(request, "inventory:write")
  if (perm instanceof NextResponse) return perm

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  const tenantId = perm.user.tenantId
  if (!tenantId) {
    return Errors.FORBIDDEN("Tenant context is required")
  }

  try {
    const body = await request.json()
    const parsed = bodySchema.parse(body)
    const supabase = await createClient()

    const data = await postDirectInventorySupplierReceipts(supabase, tenantId, perm.user.id, {
      receiptDate: parsed.receiptDate,
      supplierInvoiceNumber: parsed.supplierInvoiceNumber ?? null,
      batches: parsed.batches.map((b) => ({
        supplierId: b.supplierId,
        lines: b.lines.map((l) => ({
          medicineId: l.medicineId,
          quantity: l.quantity,
          unitCost: l.unitCost,
          vatAmount: l.vatAmount,
        })),
      })),
    })

    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: perm.user.id })
    return successResponse(data, { message: "Supplier inventory receipt posted" })
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
    return errorResponse(
      "SUPPLIER_RECEIPT_FAILED",
      e instanceof Error ? e.message : "Failed to post supplier receipt",
      { status: 400 }
    )
  }
}
