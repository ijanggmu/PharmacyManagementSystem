import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requirePermission } from "@/lib/api/auth-middleware"
import { rateLimit } from "@/app/api/middleware"
import { logRequest } from "@/lib/api/logger"
import { successResponse, Errors } from "@/lib/api/response-utils"

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

    let rows: any[] = []

    if (type === "sales-register") {
      const { data: sales, error } = await supabase
        .from("sales")
        .select(
          `
          id,
          sale_number,
          invoice_number,
          sale_date,
          total_amount,
          tax_amount,
          discount_amount,
          payment_method,
          ird_status,
          customers (first_name, last_name)
        `,
        )
        .eq("tenant_id", authResult.user.tenantId)
        .gte("sale_date", periodStart)
        .lte("sale_date", periodEnd)
        .order("sale_date", { ascending: true })

      if (error) throw error
      rows = sales || []
    } else if (type === "purchase-register") {
      const { data: purchases, error } = await supabase
        .from("purchase_orders")
        .select(
          `
          id,
          order_number,
          order_date,
          status,
          total_amount,
          suppliers (name)
        `,
        )
        .eq("tenant_id", authResult.user.tenantId)
        .gte("order_date", periodStart)
        .lte("order_date", periodEnd)
        .order("order_date", { ascending: true })

      if (error) throw error
      rows = purchases || []
    } else if (type === "annex-13") {
      // Annex 13: Sales register in IRD-approved flat format
      const { data: sales, error } = await supabase
        .from("sales")
        .select(
          `
          sale_number,
          invoice_number,
          sale_date,
          total_amount,
          tax_amount,
          discount_amount,
          payment_method,
          ird_status,
          customers (first_name, last_name)
        `,
        )
        .eq("tenant_id", authResult.user.tenantId)
        .gte("sale_date", periodStart)
        .lte("sale_date", periodEnd)
        .order("sale_date", { ascending: true })

      if (error) throw error

      rows =
        sales?.map((s: any) => ({
          sale_date: s.sale_date,
          invoice_number: s.invoice_number,
          customer_name: s.customers ? `${s.customers.first_name ?? ""} ${s.customers.last_name ?? ""}`.trim() : "",
          taxable_amount: Number(s.total_amount ?? 0) - Number(s.tax_amount ?? 0),
          tax_amount: s.tax_amount ?? 0,
          discount_amount: s.discount_amount ?? 0,
          total_amount: s.total_amount ?? 0,
          payment_method: s.payment_method ?? "",
          ird_status: s.ird_status ?? "",
        })) ?? []
    } else if (type === "annex-14") {
      // Annex 14: Purchase register in IRD-approved flat format
      const { data: purchases, error } = await supabase
        .from("purchase_orders")
        .select(
          `
          order_number,
          order_date,
          status,
          total_amount,
          suppliers (name)
        `,
        )
        .eq("tenant_id", authResult.user.tenantId)
        .gte("order_date", periodStart)
        .lte("order_date", periodEnd)
        .order("order_date", { ascending: true })

      if (error) throw error

      rows =
        purchases?.map((p: any) => ({
          order_date: p.order_date,
          purchase_number: p.order_number,
          supplier_name: p.suppliers?.name ?? "",
          total_amount: p.total_amount ?? 0,
          status: p.status ?? "",
        })) ?? []
    } else {
      return Errors.VALIDATION_ERROR({
        type: "Invalid type. Must be one of: sales-register, purchase-register, annex-13, annex-14",
      })
    }

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
  } catch (error: any) {
    logRequest(request, {
      status: 500,
      duration: Date.now() - startTime,
      userId: authResult.user.id,
      error: error?.message,
    })
    return Errors.INTERNAL_ERROR(error?.message || "Failed to generate IRD report")
  }
}

function toCsv(rows: any[]): string {
  if (!rows || rows.length === 0) {
    return ""
  }

  const headers = Object.keys(rows[0])
  const escape = (value: any) => {
    if (value === null || value === undefined) return ""
    const str = String(value)
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h as keyof typeof row])).join(",")),
  ]

  return lines.join("\n")
}

