import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, Errors } from "@/lib/api/response-utils"
import {
  ALLOWED_BULK_ENTITIES,
  bulkDeleteEntities,
  bulkExportEntities,
  bulkUpdateStatus,
  rowsToCsv,
} from "@/lib/server/services/bulk-operations-service"

export async function POST(request: NextRequest) {
  const csrf = await requireCSRF(request)
  if (csrf) return csrf
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const body = await request.json()
    const entityType = String(body?.entityType || "")
    const operation = String(body?.operation || "")
    const ids = Array.isArray(body?.ids) ? body.ids.filter((id: unknown) => typeof id === "string") : []
    const format = String(body?.format || "")
    const status = String(body?.status || "")

    if (!ALLOWED_BULK_ENTITIES.has(entityType)) return Errors.BAD_REQUEST("Unsupported entity type")
    if (ids.length === 0) return Errors.BAD_REQUEST("No items selected")

    const supabase = await createClient()

    if (operation === "delete") {
      const { affected, error } = await bulkDeleteEntities(supabase, entityType, ids)
      if (error) return Errors.DATABASE_ERROR(error.message)
      return successResponse({ affected })
    }

    if (operation === "status_update") {
      const { affected, error } = await bulkUpdateStatus(supabase, entityType, ids, status)
      if (error) return Errors.DATABASE_ERROR(error.message)
      return successResponse({ affected })
    }

    if (operation === "export") {
      const { rows, error } = await bulkExportEntities(supabase, entityType, ids)
      if (error) return Errors.DATABASE_ERROR(error.message)
      if (format === "json") return successResponse({ rows })
      // CSV as server-generated text payload keeps export deterministic.
      return successResponse({ csv: rowsToCsv(rows) })
    }

    return Errors.BAD_REQUEST("Unsupported operation")
  } catch (error) {
    return Errors.INTERNAL_ERROR(error instanceof Error ? error.message : "Bulk operation failed")
  }
}

