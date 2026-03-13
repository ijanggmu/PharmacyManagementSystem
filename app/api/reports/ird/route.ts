import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/api/auth-middleware"
import { rateLimit } from "@/app/api/middleware"
import { logRequest } from "@/lib/api/logger"
import { successResponse, Errors } from "@/lib/api/response-utils"

// IRD reporting endpoint
// Supports: ?type=sales-register|purchase-register&periodStart=YYYY-MM-DD&periodEnd=YYYY-MM-DD

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

  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const type = searchParams.get("type") || "sales-register"
    const periodStart = searchParams.get("periodStart")
    const periodEnd = searchParams.get("periodEnd")

    if (!periodStart || !periodEnd) {
      return Errors.VALIDATION_ERROR({
        period: "periodStart and periodEnd (YYYY-MM-DD) are required",
      })
    }

    let data: any[] = []

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
      data = sales || []
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
      data = purchases || []
    } else {
      return Errors.VALIDATION_ERROR({
        type: "Invalid type. Must be one of: sales-register, purchase-register",
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
      rows: data,
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

