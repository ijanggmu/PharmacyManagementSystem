/**
 * Medicine by ID API Route
 * REST API endpoints for individual medicine operations
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { medicineSchema } from "@/lib/utils/validation"
import { z } from "zod"

// GET /api/medicines/[id] - Get single medicine
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params

    const { data, error } = await supabase
      .from("medicines")
      .select(`
        *,
        categories (id, name),
        suppliers (id, name)
      `)
      .eq("id", id)
      .single()

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 404 }
      )
    }

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}

// PUT /api/medicines/[id] - Update medicine
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params
    const body = await request.json()

    // Validate request body (partial update)
    const validatedData = medicineSchema.partial().parse(body)

    const { data, error } = await supabase
      .from("medicines")
      .update(validatedData)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json({ data })
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

// DELETE /api/medicines/[id] - Delete medicine
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params

    // Check for related records
    const [inventoryResult, prescriptionResult, salesResult] = await Promise.all([
      supabase.from("inventory_transactions").select("id").eq("medicine_id", id).limit(1),
      supabase.from("prescription_items").select("id").eq("medicine_id", id).limit(1),
      supabase.from("sale_items").select("id").eq("medicine_id", id).limit(1),
    ])

    if (
      inventoryResult.data?.length ||
      prescriptionResult.data?.length ||
      salesResult.data?.length
    ) {
      return NextResponse.json(
        { error: "Cannot delete medicine with related records. Please archive the medicine instead." },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from("medicines")
      .delete()
      .eq("id", id)

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json({ message: "Medicine deleted successfully" })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}

