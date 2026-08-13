/**
 * Bulk medicine creation, grouped by supplier bill — each group becomes ONE
 * consolidated goods receipt / supplier ledger entry covering every medicine in it,
 * instead of one receipt per medicine. See lib/server/services/medicine-service.ts
 * (bulkCreateMedicinesWithConsolidatedReceipts).
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { rateLimit } from "../../middleware"
import { medicineSchema } from "@/lib/utils/validation"
import { bulkCreateMedicinesWithConsolidatedReceipts } from "@/lib/server/services/medicine-service"

// Same medicine fields as the single-create endpoint, minus supplier_id and
// supplier_invoice_number (both now live once on the group, not per row) and
// stock_adjustment_reason/notes (update-only signal fields, not real columns on
// `medicines` — stock_adjustment_notes has a `.transform()` that runs even when the
// key is absent, so leaving it in the schema would inject a phantom `null` column
// into the insert and 400 with "Could not find the 'stock_adjustment_notes' column").
const bulkRowSchema = medicineSchema.omit({
  supplier_id: true,
  supplier_invoice_number: true,
  stock_adjustment_reason: true,
  stock_adjustment_notes: true,
})

const bulkGroupSchema = z.object({
  supplierId: z.string().uuid().nullable(),
  supplierInvoiceNumber: z.string().max(120).nullable().optional(),
  receiptDate: z.string().min(1),
  rows: z.array(bulkRowSchema).min(1, "Each bill group needs at least one medicine"),
})

const bulkBodySchema = z.object({
  groups: z.array(bulkGroupSchema).min(1, "At least one bill group is required"),
})

export async function POST(request: NextRequest) {
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requirePermission(request, "inventory:write")
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context is required for medicines")

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  try {
    const body = await request.json()
    const parsed = bulkBodySchema.parse(body)

    // A bill group with a supplier needs a bill number to be worth consolidating —
    // without one there's nothing distinguishing this receipt from any other.
    for (const group of parsed.groups) {
      if (group.supplierId && !group.supplierInvoiceNumber?.trim()) {
        return errorResponse(
          "VALIDATION_ERROR",
          "Bill/invoice number is required for a bill group with a supplier",
          { status: 400 }
        )
      }
    }

    const supabase = await createClient()
    const { data, error } = await bulkCreateMedicinesWithConsolidatedReceipts(
      supabase,
      authResult.user.tenantId,
      authResult.user.id,
      parsed.groups.map((g) => ({
        supplierId: g.supplierId,
        supplierInvoiceNumber: g.supplierInvoiceNumber?.trim() || null,
        receiptDate: g.receiptDate,
        rows: g.rows,
      }))
    )

    if (error || !data) {
      return errorResponse("BULK_CREATE_FAILED", error?.message || "Bulk import failed", { status: 400 })
    }

    return successResponse(data, {
      message: `Created ${data.createdMedicines.length} medicine(s) across ${data.groups.length} bill group(s)`,
      status: 201,
    })
  } catch (e) {
    if (e instanceof z.ZodError) return Errors.VALIDATION_ERROR(e.errors)
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
