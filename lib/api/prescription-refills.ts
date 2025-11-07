/**
 * Prescription Refills API
 * Manages prescription refills and reminders
 */

import { createClient } from "@/lib/supabase/client"

export interface PrescriptionRefill {
  id: string
  prescription_id: string
  refill_number: number
  quantity_dispensed: number
  refill_date: string
  next_refill_date: string | null
  status: "pending" | "filled" | "cancelled"
  created_at: string
}

export const prescriptionRefillsApi = {
  // Get refills for a prescription
  getRefills: async (prescriptionId: string) => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("prescription_refills")
      .select("*")
      .eq("prescription_id", prescriptionId)
      .order("refill_date", { ascending: false })

    if (error) throw error
    return { data: data || [], error: null }
  },

  // Create a refill
  createRefill: async (refillData: {
    prescription_id: string
    quantity_dispensed: number
    refill_date: string
    next_refill_date?: string
  }) => {
    const supabase = createClient()

    // Get current refill count
    const { count } = await supabase
      .from("prescription_refills")
      .select("*", { count: "exact", head: true })
      .eq("prescription_id", refillData.prescription_id)

    const refillNumber = (count || 0) + 1

    const { data, error } = await supabase
      .from("prescription_refills")
      .insert({
        ...refillData,
        refill_number: refillNumber,
        status: "filled",
      })
      .select()
      .single()

    if (error) throw error
    return { data, error: null }
  },

  // Get prescriptions due for refill
  getDueRefills: async (daysAhead: number = 7) => {
    const supabase = createClient()
    const targetDate = new Date()
    targetDate.setDate(targetDate.getDate() + daysAhead)

    const { data, error } = await supabase
      .from("prescription_refills")
      .select(`
        *,
        prescriptions (
          id,
          prescription_number,
          customers (id, first_name, last_name, phone, email)
        )
      `)
      .lte("next_refill_date", targetDate.toISOString().split("T")[0])
      .eq("status", "filled")
      .is("next_refill_date", null)

    if (error) throw error
    return { data: data || [], error: null }
  },
}

