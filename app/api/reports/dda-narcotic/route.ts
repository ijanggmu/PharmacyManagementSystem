import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requirePermission } from "@/lib/api/auth-middleware"
import { rateLimit } from "@/app/api/middleware"
import { logRequest } from "@/lib/api/logger"
import { Errors } from "@/lib/api/response-utils"
import { getDdaNarcoticRegister } from "@/lib/server/services/reports-service"

// DDA Narcotic Register API
// Backed by dda_narcotic_register view.
// Query params:
//   periodStart=YYYY-MM-DD
//   periodEnd=YYYY-MM-DD
//   medicineName?=string
//   doctorName?=string
//   schedule?=string
//   format=json|csv (default json)

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

  // Require reports:read permission for DDA narcotic register exports
  const permResult = await requirePermission(request, "reports:read")
  if (permResult instanceof NextResponse) {
    logRequest(request, { status: 403, duration: Date.now() - startTime })
    return permResult
  }

  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const periodStart = searchParams.get("periodStart")
    const periodEnd = searchParams.get("periodEnd")
    const medicineName = searchParams.get("medicineName")
    const doctorName = searchParams.get("doctorName")
    const schedule = searchParams.get("schedule")
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

    const rows = await getDdaNarcoticRegister(supabase, authResult.user.tenantId, {
      periodStart,
      periodEnd,
      medicineName,
      doctorName,
      schedule,
    })

    if (format === "csv") {
      const csv = toCsv(
        rows.map((r) => ({
          sale_date: r.sale_date,
          sale_number: r.sale_number,
          invoice_number: r.invoice_number,
          customer_name: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(),
          date_of_birth: r.date_of_birth,
          prescription_number: r.prescription_number,
          doctor_name: r.doctor_name,
          doctor_license: r.doctor_license,
          medicine_name: r.medicine_name,
          generic_name: r.generic_name,
          strength: r.strength,
          form: r.form,
          quantity: r.quantity,
          unit_price: r.unit_price,
          line_total: r.line_total,
        })),
      )

      const filename = `dda-narcotic-${periodStart}-to-${periodEnd}.csv`

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

    return NextResponse.json({
      data: {
        periodStart,
        periodEnd,
        rows,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : undefined
    logRequest(request, {
      status: 500,
      duration: Date.now() - startTime,
      userId: authResult.user.id,
      error: message,
    })

    return Errors.INTERNAL_ERROR(message || "Failed to generate DDA narcotic register")
  }
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows || rows.length === 0) return ""

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
