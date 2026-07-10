import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requirePermission } from "@/lib/api/auth-middleware"
import { rateLimit } from "@/app/api/middleware"
import { logRequest } from "@/lib/api/logger"
import { successResponse, Errors } from "@/lib/api/response-utils"
import { getIrdReportRows, type IrdReportType } from "@/lib/server/services/reports-service"

// IRD reporting endpoint
// Supports:
//   type = sales-register | purchase-register | annex-13 | annex-14
//   periodStart=YYYY-MM-DD
//   periodEnd=YYYY-MM-DD
//   format = json | csv (default json)

export async function GET(request: NextRequest) {
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

  // Require reports:read permission for IRD exports
  const permResult = await requirePermission(request, "reports:read")
  if (permResult instanceof NextResponse) {
    logRequest(request, { status: 403, duration: Date.now() - startTime })
    return permResult
  }

  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const type = searchParams.get("type") || "sales-register"
    const periodStart = searchParams.get("periodStart")
    const periodEnd = searchParams.get("periodEnd")
    const format = (searchParams.get("format") || "json").toLowerCase()

    if (!periodStart || !periodEnd) {
      return Errors.VALIDATION_ERROR({
        period: "periodStart and periodEnd (YYYY-MM-DD) are required",
      })
    }

    if (format !== "json" && format !== "csv") {
      return Errors.VALIDATION_ERROR({
        format: "Invalid format. Must be one of: json, csv",
      })
    }

    if (
      type !== "sales-register" &&
      type !== "purchase-register" &&
      type !== "annex-13" &&
      type !== "annex-14"
    ) {
      return Errors.VALIDATION_ERROR({
        type: "Invalid type. Must be one of: sales-register, purchase-register, annex-13, annex-14",
      })
    }

    const rows = await getIrdReportRows(
      supabase,
      authResult.user.tenantId,
      type as IrdReportType,
      periodStart,
      periodEnd
    )

    // CSV export
    if (format === "csv") {
      const csv = toCsv(rows)
      const filename = `ird-${type}-${periodStart}-to-${periodEnd}.csv`

      logRequest(request, {
        status: 200,
        duration: Date.now() - startTime,
        userId: authResult.user.id,
      })

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      })
    }

    logRequest(request, {
      status: 200,
      duration: Date.now() - startTime,
      userId: authResult.user.id,
    })

    return successResponse({
      type,
      periodStart,
      periodEnd,
      rows,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : undefined
    logRequest(request, {
      status: 500,
      duration: Date.now() - startTime,
      userId: authResult.user.id,
      error: message,
    })
    return Errors.INTERNAL_ERROR(message || "Failed to generate IRD report")
  }
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows || rows.length === 0) {
    return ""
  }

  const headers = Object.keys(rows[0])
  const escape = (value: unknown) => {
    if (value === null || value === undefined) return ""
    const str = String(value)
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
  ]

  return lines.join("\n")
}
