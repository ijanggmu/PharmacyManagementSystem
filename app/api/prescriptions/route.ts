/**
 * Prescriptions API Route
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { prescriptionSchema } from "@/lib/utils/validation"
import { z } from "zod"
import { requireAuth, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../middleware"

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

  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    const search = searchParams.get("search")
    const status = searchParams.get("status")
    const customerId = searchParams.get("customerId")
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "50")

    let query = supabase
      .from("prescriptions")
      .select(`
        *,
        customers (id, first_name, last_name),
        prescription_items (
          id,
          quantity_prescribed,
          quantity_dispensed,
          dosage_instructions,
          medicines (id, name, strength, form)
        )
      `, { count: "exact" })

    if (search) {
      query = query.ilike("prescription_number", `%${search}%`)
    }

    if (status) {
      query = query.eq("status", status)
    }

    if (customerId) {
      query = query.eq("customer_id", customerId)
    }

    query = query.order("created_at", { ascending: false })

    const from = (page - 1) * limit
    const to = from + limit - 1
    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) {
      logRequest(request, { 
        status: 500, 
        duration: Date.now() - startTime,
        userId: authResult.user.id,
        error: error.message 
      })
      return Errors.INTERNAL_ERROR(error.message)
    }

    const response = successResponse(data || [], {
      meta: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    })

    logRequest(request, { 
      status: 200, 
      duration: Date.now() - startTime,
      userId: authResult.user.id 
    })

    return response
  } catch (error) {
    logRequest(request, { 
      status: 500, 
      duration: Date.now() - startTime,
      userId: authResult.user.id,
      error: error instanceof Error ? error.message : "Unknown error"
    })
    return Errors.INTERNAL_ERROR(
      error instanceof Error ? error.message : "Internal server error"
    )
  }
}

export async function POST(request: NextRequest) {
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

  // CSRF validation
  const csrfResult = await requireCSRF(request)
  if (csrfResult) {
    logRequest(request, { status: 403, duration: Date.now() - startTime, userId: authResult.user.id })
    return csrfResult
  }

  try {
    const supabase = await createClient()
    const body = await request.json()

    const validatedData = prescriptionSchema.parse(body)

    const prescriptionNumber = `RX-${Date.now()}`

    const { data: prescriptionData, error: prescriptionError } = await supabase
      .from("prescriptions")
      .insert({
        prescription_number: prescriptionNumber,
        customer_id: validatedData.customer_id,
        doctor_name: validatedData.doctor_name,
        doctor_license: validatedData.doctor_license || null,
        issue_date: validatedData.issue_date,
        status: "pending",
        notes: validatedData.notes || null,
      })
      .select()
      .single()

    if (prescriptionError) {
      logRequest(request, { 
        status: 400, 
        duration: Date.now() - startTime,
        userId: authResult.user.id,
        error: prescriptionError.message 
      })
      return errorResponse("CREATE_FAILED", prescriptionError.message, { status: 400 })
    }

    // Insert prescription items
    if (validatedData.prescription_items && validatedData.prescription_items.length > 0) {
      const items = validatedData.prescription_items.map((item: any) => ({
        prescription_id: prescriptionData.id,
        medicine_id: item.medicine_id,
        quantity_prescribed: item.quantity_prescribed,
        dosage_instructions: item.dosage_instructions || null,
      }))

      const { error: itemsError } = await supabase
        .from("prescription_items")
        .insert(items)

      if (itemsError) {
        await supabase.from("prescriptions").delete().eq("id", prescriptionData.id)
        logRequest(request, { 
          status: 400, 
          duration: Date.now() - startTime,
          userId: authResult.user.id,
          error: itemsError.message 
        })
        return errorResponse("CREATE_FAILED", itemsError.message, { status: 400 })
      }
    }

    const { data: completePrescription } = await supabase
      .from("prescriptions")
      .select(`
        *,
        customers (id, first_name, last_name),
        prescription_items (
          id,
          quantity_prescribed,
          quantity_dispensed,
          dosage_instructions,
          medicines (id, name, strength, form)
        )
      `)
      .eq("id", prescriptionData.id)
      .single()

    const response = successResponse(completePrescription, { 
      message: "Prescription created successfully",
      status: 201 
    })

    logRequest(request, { 
      status: 201, 
      duration: Date.now() - startTime,
      userId: authResult.user.id 
    })

    return response
  } catch (error) {
    if (error instanceof z.ZodError) {
      logRequest(request, { 
        status: 400, 
        duration: Date.now() - startTime,
        userId: authResult.user.id,
        error: "Validation error" 
      })
      return Errors.VALIDATION_ERROR(error.errors)
    }
    
    logRequest(request, { 
      status: 500, 
      duration: Date.now() - startTime,
      userId: authResult.user.id,
      error: error instanceof Error ? error.message : "Unknown error"
    })
    
    return Errors.INTERNAL_ERROR(
      error instanceof Error ? error.message : "Internal server error"
    )
  }
}

