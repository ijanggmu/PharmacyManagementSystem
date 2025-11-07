/**
 * Prescriptions API Route
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { prescriptionSchema } from "@/lib/utils/validation"
import { z } from "zod"

export async function GET(request: NextRequest) {
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
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      data: data || [],
      count: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const validatedData = prescriptionSchema.parse(body)

    const prescriptionNumber = validatedData.prescription_number || `RX-${Date.now()}`

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
      return NextResponse.json({ error: prescriptionError.message }, { status: 400 })
    }

    // Insert prescription items
    if (validatedData.items && validatedData.items.length > 0) {
      const items = validatedData.items.map((item: any) => ({
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
        return NextResponse.json({ error: itemsError.message }, { status: 400 })
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

    return NextResponse.json({ data: completePrescription }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}

