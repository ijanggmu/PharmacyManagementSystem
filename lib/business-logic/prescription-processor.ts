import { createClient } from "@/lib/supabase/client"
import { InventoryManager } from "./inventory-manager"

export interface PrescriptionValidation {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

export interface PrescriptionItem {
  medicine_id: string
  quantity_prescribed: number
  instructions?: string
}

export class PrescriptionProcessor {
  private supabase = createClient()
  private inventoryManager = new InventoryManager()

  async validatePrescription(prescriptionItems: PrescriptionItem[]): Promise<PrescriptionValidation> {
    const errors: string[] = []
    const warnings: string[] = []

    try {
      for (const item of prescriptionItems) {
        // Check if medicine exists and requires prescription
        const { data: medicine, error } = await this.supabase
          .from("medicines")
          .select("name, prescription_required, stock_quantity, minimum_stock")
          .eq("id", item.medicine_id)
          .single()

        if (error || !medicine) {
          errors.push(`Medicine with ID ${item.medicine_id} not found`)
          continue
        }

        // Check if prescription is required
        if (!medicine.prescription_required) {
          warnings.push(`${medicine.name} does not require a prescription`)
        }

        // Check stock availability
        if (medicine.stock_quantity < item.quantity_prescribed) {
          if (medicine.stock_quantity === 0) {
            errors.push(`${medicine.name} is out of stock`)
          } else {
            errors.push(
              `Insufficient stock for ${medicine.name}. Available: ${medicine.stock_quantity}, Required: ${item.quantity_prescribed}`,
            )
          }
        }

        // Check if dispensing will cause low stock
        if (medicine.stock_quantity - item.quantity_prescribed <= medicine.minimum_stock) {
          warnings.push(`Dispensing ${medicine.name} will result in low stock`)
        }

        // Validate quantity
        if (item.quantity_prescribed <= 0) {
          errors.push(`Invalid quantity for ${medicine.name}`)
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
      }
    } catch (error) {
      console.error("Error validating prescription:", error)
      return {
        isValid: false,
        errors: ["Failed to validate prescription"],
        warnings: [],
      }
    }
  }

  async processPrescription(
    prescriptionId: string,
    items: PrescriptionItem[],
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Validate prescription first
      const validation = await this.validatePrescription(items)
      if (!validation.isValid) {
        return { success: false, error: validation.errors.join(", ") }
      }

      // Start transaction-like processing
      const processedItems: string[] = []

      try {
        for (const item of items) {
          // Update stock
          const stockUpdate = await this.inventoryManager.updateStock(
            item.medicine_id,
            item.quantity_prescribed,
            "out",
            "Prescription dispensed",
            prescriptionId,
            "prescription",
          )

          if (!stockUpdate.success) {
            throw new Error(stockUpdate.error)
          }

          // Update prescription item as dispensed
          const { error: updateError } = await this.supabase
            .from("prescription_items")
            .update({
              quantity_dispensed: item.quantity_prescribed,
              dispensed_at: new Date().toISOString(),
            })
            .eq("prescription_id", prescriptionId)
            .eq("medicine_id", item.medicine_id)

          if (updateError) {
            throw new Error(`Failed to update prescription item: ${updateError.message}`)
          }

          processedItems.push(item.medicine_id)
        }

        // Update prescription status
        const allItemsDispensed = await this.checkIfAllItemsDispensed(prescriptionId)
        const newStatus = allItemsDispensed ? "filled" : "partially_filled"

        const { error: statusError } = await this.supabase
          .from("prescriptions")
          .update({
            status: newStatus,
            filled_at: allItemsDispensed ? new Date().toISOString() : null,
          })
          .eq("id", prescriptionId)

        if (statusError) {
          throw new Error(`Failed to update prescription status: ${statusError.message}`)
        }

        return { success: true }
      } catch (error) {
        // Rollback processed items (in a real app, you'd use database transactions)
        console.error("Error processing prescription, attempting rollback:", error)

        for (const medicineId of processedItems) {
          const item = items.find((i) => i.medicine_id === medicineId)
          if (item) {
            await this.inventoryManager.updateStock(
              medicineId,
              item.quantity_prescribed,
              "in",
              "Rollback - prescription processing failed",
              prescriptionId,
              "adjustment",
            )
          }
        }

        return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
      }
    } catch (error) {
      console.error("Error processing prescription:", error)
      return { success: false, error: "Failed to process prescription" }
    }
  }

  async checkIfAllItemsDispensed(prescriptionId: string): Promise<boolean> {
    try {
      const { data: items, error } = await this.supabase
        .from("prescription_items")
        .select("quantity_prescribed, quantity_dispensed")
        .eq("prescription_id", prescriptionId)

      if (error || !items) return false

      return items.every((item) => item.quantity_dispensed >= item.quantity_prescribed)
    } catch (error) {
      console.error("Error checking prescription items:", error)
      return false
    }
  }

  async getPrescriptionAnalytics(startDate: string, endDate: string) {
    try {
      const { data: prescriptions, error } = await this.supabase
        .from("prescriptions")
        .select(`
          id,
          status,
          created_at,
          filled_at,
          prescription_items (
            quantity_prescribed,
            quantity_dispensed,
            medicines (
              name,
              unit_price
            )
          )
        `)
        .gte("created_at", startDate)
        .lte("created_at", endDate)

      if (error || !prescriptions) return null

      const analytics = {
        total_prescriptions: prescriptions.length,
        filled_prescriptions: prescriptions.filter((p) => p.status === "filled").length,
        pending_prescriptions: prescriptions.filter((p) => p.status === "pending").length,
        partially_filled: prescriptions.filter((p) => p.status === "partially_filled").length,
        total_items_prescribed: 0,
        total_items_dispensed: 0,
        total_value: 0,
        average_fill_time: 0,
      }

      let totalFillTime = 0
      let filledCount = 0

      for (const prescription of prescriptions) {
        for (const item of prescription.prescription_items) {
          analytics.total_items_prescribed += item.quantity_prescribed
          analytics.total_items_dispensed += item.quantity_dispensed
          analytics.total_value += item.quantity_dispensed * Number.parseFloat(item.medicines?.unit_price || "0")
        }

        if (prescription.filled_at && prescription.created_at) {
          const fillTime = new Date(prescription.filled_at).getTime() - new Date(prescription.created_at).getTime()
          totalFillTime += fillTime
          filledCount++
        }
      }

      analytics.average_fill_time = filledCount > 0 ? totalFillTime / filledCount / (1000 * 60 * 60) : 0 // in hours

      return analytics
    } catch (error) {
      console.error("Error getting prescription analytics:", error)
      return null
    }
  }
}
