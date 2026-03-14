import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse } from "@/lib/api/response-utils"

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const { tenantId } = authResult.user
  if (!tenantId) {
    return errorResponse("FORBIDDEN", "Tenant context required", { status: 403 })
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("branches")
      .select("id, name, code, address, phone, email, is_active, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })

    if (error) return errorResponse("LIST_FAILED", error.message, { status: 500 })
    return successResponse(data ?? [])
  } catch (e: any) {
    return errorResponse("INTERNAL_ERROR", e?.message ?? "Failed to list branches", { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const { tenantId } = authResult.user
  if (!tenantId) {
    return errorResponse("FORBIDDEN", "Tenant context required", { status: 403 })
  }

  try {
    const body = await request.json()
    const { name, code, address, phone, email, is_active } = body
    if (!name || !code) {
      return errorResponse("VALIDATION_ERROR", "name and code are required", { status: 400 })
    }

    const supabase = await createClient()
    const slug = String(code).trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 60) || "branch"

    const { data, error } = await supabase
      .from("branches")
      .insert({
        tenant_id: tenantId,
        name: String(name).trim(),
        code: slug,
        address: address ? String(address).trim() : null,
        phone: phone ? String(phone).trim() : null,
        email: email ? String(email).trim() : null,
        is_active: is_active !== false,
      })
      .select()
      .single()

    if (error) {
      if (error.code === "23505") return errorResponse("CONFLICT", "A branch with this code already exists", { status: 409 })
      return errorResponse("CREATE_FAILED", error.message, { status: 500 })
    }
    return successResponse(data, { status: 201 })
  } catch (e: any) {
    return errorResponse("INTERNAL_ERROR", e?.message ?? "Failed to create branch", { status: 500 })
  }
}
