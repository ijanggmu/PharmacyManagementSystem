import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../middleware"

const createSchema = z.object({
  prescription_id: z.string().uuid(),
  quantity_dispensed: z.number().int().positive(),
  refill_date: z.string().min(1),
  next_refill_date: z.string().optional(),
})

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context required")

  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const prescriptionId = searchParams.get("prescriptionId")
    const query = supabase
      .from("prescription_refills")
      .select("*")
      .eq("tenant_id", authResult.user.tenantId)
      .order("refill_date", { ascending: false })
    const scoped = prescriptionId ? query.eq("prescription_id", prescriptionId) : query
    const { data, error } = await scoped
    if (error) return Errors.INTERNAL_ERROR(error.message)
    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data || [])
  } catch (e) {
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult
  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context required")

  try {
    const body = await request.json()
    const input = createSchema.parse(body)
    const supabase = await createClient()

    const { data: prescription, error: prescriptionError } = await supabase
      .from("prescriptions")
      .select("status, refills_allowed")
      .eq("id", input.prescription_id)
      .eq("tenant_id", authResult.user.tenantId)
      .single()

    if (prescriptionError || !prescription) {
      return errorResponse("NOT_FOUND", "Prescription not found", { status: 404 })
    }
    if (prescription.status === "cancelled") {
      return errorResponse("PRESCRIPTION_CANCELLED", "Cannot record a refill against a cancelled prescription", {
        status: 400,
      })
    }

    const { count } = await supabase
      .from("prescription_refills")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", authResult.user.tenantId)
      .eq("prescription_id", input.prescription_id)

    if (prescription.refills_allowed != null && (count || 0) >= prescription.refills_allowed) {
      return errorResponse(
        "REFILL_LIMIT_REACHED",
        `This prescription allows ${prescription.refills_allowed} refill(s); that limit has been reached.`,
        { status: 400 }
      )
    }

    const refillNumber = (count || 0) + 1
    const { data, error } = await supabase
      .from("prescription_refills")
      .insert({
        tenant_id: authResult.user.tenantId,
        prescription_id: input.prescription_id,
        refill_number: refillNumber,
        quantity_dispensed: input.quantity_dispensed,
        refill_date: input.refill_date,
        next_refill_date: input.next_refill_date || null,
        status: "filled",
      })
      .select("*")
      .single()

    if (error) return errorResponse("CREATE_FAILED", error.message, { status: 400 })
    logRequest(request, { status: 201, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data, { status: 201, message: "Refill created" })
  } catch (e) {
    if (e instanceof z.ZodError) return Errors.VALIDATION_ERROR(e.errors)
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}

