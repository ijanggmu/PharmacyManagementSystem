/**
 * Compliance Reporting API
 * Jurisdiction-agnostic compliance reports (inventory discrepancy, audit trail).
 * Nepal-specific compliance reporting lives at /api/reports/dda-narcotic and /api/reports/ird.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requirePermission } from "@/lib/api/auth-middleware"
import { rateLimit } from "@/app/api/middleware"
import { logRequest } from "@/lib/api/logger"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import {
  generateAuditTrailComplianceReport,
  generateInventoryDiscrepancyComplianceReport,
  type AuditTrailComplianceReport,
  type InventoryDiscrepancyReport,
} from "@/lib/server/services/reports-service"

type ComplianceReportData = InventoryDiscrepancyReport | AuditTrailComplianceReport

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  // Rate limiting
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) {
    logRequest(request, { status: 429, duration: Date.now() - startTime })
    return rateLimitResult
  }

  // Authentication
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) {
    logRequest(request, { status: 401, duration: Date.now() - startTime })
    return authResult
  }

  // Permission check - restrict compliance reports to users with reports:read
  const permResult = await requirePermission(request, "reports:read")
  if (permResult instanceof NextResponse) {
    logRequest(request, { status: 403, duration: Date.now() - startTime })
    return permResult
  }

  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const reportType = searchParams.get("type") || "inventory"
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")

    let reportData: ComplianceReportData

    // DEA / State Board / PDMP are US-specific regulatory concepts with no meaning for
    // a Nepal pharmacy (this system's actual jurisdiction) — serving them risked
    // giving a false sense of regulatory coverage. Real Nepal-specific compliance
    // reporting lives at /api/reports/dda-narcotic (narcotic register) and
    // /api/reports/ird (tax reporting); this endpoint keeps only the jurisdiction-
    // agnostic report types.
    if (reportType === "dea" || reportType === "state-board" || reportType === "pmp") {
      return errorResponse(
        "NOT_APPLICABLE",
        "This report type is a US regulatory concept and does not apply to this pharmacy's jurisdiction. " +
          "Use the DDA Narcotic Register (/dashboard/reports/dda-narcotic) for controlled-substance reporting " +
          "and the IRD Reports page for tax compliance.",
        { status: 400 }
      )
    }

    switch (reportType) {
      case "inventory":
        // Inventory Discrepancy Report
        reportData = await generateInventoryDiscrepancyComplianceReport(
          supabase,
          authResult.user.tenantId,
          startDate,
          endDate
        )
        break
      case "audit":
        // Audit Trail Report
        reportData = await generateAuditTrailComplianceReport(supabase, authResult.user.tenantId, startDate, endDate)
        break
      default:
        return Errors.VALIDATION_ERROR({ reportType: "Invalid report type. Must be one of: inventory, audit" })
    }

    logRequest(request, {
      status: 200,
      duration: Date.now() - startTime,
      userId: authResult.user.id
    })

    return successResponse({
      ...reportData,
      meta: {
        reportType,
        generatedAt: new Date().toISOString(),
        generatedBy: authResult.user.id,
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate compliance report"
    logRequest(request, {
      status: 500,
      duration: Date.now() - startTime,
      userId: authResult.user.id,
      error: message
    })
    return errorResponse("INTERNAL_ERROR", message)
  }
}
