/**
 * Customer by ID API Route
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { customerSchema } from "@/lib/utils/validation"
import { z } from "zod"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { id } = params

    const { data, error } = await supabase
      .from("customers")
      .select("*")
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

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { id } = params
    const body = await request.json()

    const validatedData = customerSchema.partial().parse(body)

    const { data, error } = await supabase
      .from("customers")
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { id } = params

    // Check for related records
    const [salesResult, prescriptionsResult] = await Promise.all([
      supabase.from("sales").select("id").eq("customer_id", id).limit(1),
      supabase.from("prescriptions").select("id").eq("customer_id", id).limit(1),
    ])

    if (salesResult.data?.length || prescriptionsResult.data?.length) {
      return NextResponse.json(
        { error: "Cannot delete customer with related records. Please archive the customer instead." },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from("customers")
      .delete()
      .eq("id", id)

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json({ message: "Customer deleted successfully" })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}

