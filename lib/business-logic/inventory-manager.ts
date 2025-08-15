import { createClient } from "@/lib/supabase/client"

export interface StockMovement {
  medicine_id: string
  movement_type: "in" | "out" | "adjustment"
  quantity: number
  reason: string
  reference_id?: string
  reference_type?: "sale" | "prescription" | "purchase" | "adjustment"
  created_by: string
}

export interface ReorderSuggestion {
  medicine_id: string
  medicine_name: string
  current_stock: number
  minimum_stock: number
  suggested_quantity: number
  supplier_id?: string
  supplier_name?: string
  priority: "high" | "medium" | "low"
}

export class InventoryManager {
  private supabase = createClient()

  async updateStock(
    medicineId: string,
    quantity: number,
    movementType: "in" | "out" | "adjustment",
    reason: string,
    referenceId?: string,
    referenceType?: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Get current stock
      const { data: medicine, error: fetchError } = await this.supabase
        .from("medicines")
        .select("stock_quantity, name, minimum_stock")
        .eq("id", medicineId)
        .single()

      if (fetchError || !medicine) {
        return { success: false, error: "Medicine not found" }
      }

      let newStock = medicine.stock_quantity

      switch (movementType) {
        case "in":
          newStock += quantity
          break
        case "out":
          if (newStock < quantity) {
            return { success: false, error: "Insufficient stock" }
          }
          newStock -= quantity
          break
        case "adjustment":
          newStock = quantity
          break
      }

      // Update stock in database
      const { error: updateError } = await this.supabase
        .from("medicines")
        .update({ stock_quantity: newStock })
        .eq("id", medicineId)

      if (updateError) {
        return { success: false, error: updateError.message }
      }

      // Record stock movement
      await this.recordStockMovement({
        medicine_id: medicineId,
        movement_type: movementType,
        quantity,
        reason,
        reference_id: referenceId,
        reference_type: referenceType as any,
        created_by: "system", // In real app, get from auth context
      })

      // Check if stock is below minimum and create alert
      if (newStock <= medicine.minimum_stock) {
        await this.createLowStockAlert(medicineId, medicine.name, newStock, medicine.minimum_stock)
      }

      return { success: true }
    } catch (error) {
      console.error("Error updating stock:", error)
      return { success: false, error: "Failed to update stock" }
    }
  }

  async recordStockMovement(movement: StockMovement): Promise<void> {
    try {
      await this.supabase.from("stock_movements").insert({
        ...movement,
        created_at: new Date().toISOString(),
      })
    } catch (error) {
      console.error("Error recording stock movement:", error)
    }
  }

  async createLowStockAlert(
    medicineId: string,
    medicineName: string,
    currentStock: number,
    minimumStock: number,
  ): Promise<void> {
    try {
      // Check if alert already exists for this medicine
      const { data: existingAlert } = await this.supabase
        .from("alerts")
        .select("id")
        .eq("medicine_id", medicineId)
        .eq("type", "low_stock")
        .eq("resolved", false)
        .single()

      if (!existingAlert) {
        await this.supabase.from("alerts").insert({
          type: "low_stock",
          medicine_id: medicineId,
          title: "Low Stock Alert",
          message: `${medicineName} is running low (${currentStock}/${minimumStock})`,
          priority: currentStock === 0 ? "high" : "medium",
          resolved: false,
          created_at: new Date().toISOString(),
        })
      }
    } catch (error) {
      console.error("Error creating low stock alert:", error)
    }
  }

  async getReorderSuggestions(): Promise<ReorderSuggestion[]> {
    try {
      const { data: medicines, error } = await this.supabase
        .from("medicines")
        .select(`
          id,
          name,
          stock_quantity,
          minimum_stock,
          maximum_stock,
          suppliers (
            id,
            name
          )
        `)
        .lte("stock_quantity", this.supabase.rpc("minimum_stock"))

      if (error || !medicines) return []

      return medicines.map((medicine) => {
        const suggestedQuantity = Math.max(medicine.maximum_stock - medicine.stock_quantity, medicine.minimum_stock * 2)

        let priority: "high" | "medium" | "low" = "low"
        if (medicine.stock_quantity === 0) priority = "high"
        else if (medicine.stock_quantity < medicine.minimum_stock * 0.5) priority = "medium"

        return {
          medicine_id: medicine.id,
          medicine_name: medicine.name,
          current_stock: medicine.stock_quantity,
          minimum_stock: medicine.minimum_stock,
          suggested_quantity: suggestedQuantity,
          supplier_id: medicine.suppliers?.id,
          supplier_name: medicine.suppliers?.name,
          priority,
        }
      })
    } catch (error) {
      console.error("Error getting reorder suggestions:", error)
      return []
    }
  }

  async processExpiredMedicines(): Promise<{ expired: number; expiringSoon: number }> {
    try {
      const now = new Date()
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

      // Get expired medicines
      const { data: expiredMedicines } = await this.supabase
        .from("medicines")
        .select("id, name, expiry_date, stock_quantity")
        .lt("expiry_date", now.toISOString())
        .gt("stock_quantity", 0)

      // Get medicines expiring soon
      const { data: expiringSoonMedicines } = await this.supabase
        .from("medicines")
        .select("id, name, expiry_date, stock_quantity")
        .gte("expiry_date", now.toISOString())
        .lte("expiry_date", thirtyDaysFromNow.toISOString())
        .gt("stock_quantity", 0)

      // Create alerts for expired medicines
      if (expiredMedicines) {
        for (const medicine of expiredMedicines) {
          await this.createExpiryAlert(medicine.id, medicine.name, medicine.expiry_date, "expired")
        }
      }

      // Create alerts for medicines expiring soon
      if (expiringSoonMedicines) {
        for (const medicine of expiringSoonMedicines) {
          await this.createExpiryAlert(medicine.id, medicine.name, medicine.expiry_date, "expiring_soon")
        }
      }

      return {
        expired: expiredMedicines?.length || 0,
        expiringSoon: expiringSoonMedicines?.length || 0,
      }
    } catch (error) {
      console.error("Error processing expired medicines:", error)
      return { expired: 0, expiringSoon: 0 }
    }
  }

  async createExpiryAlert(
    medicineId: string,
    medicineName: string,
    expiryDate: string,
    type: "expired" | "expiring_soon",
  ): Promise<void> {
    try {
      const { data: existingAlert } = await this.supabase
        .from("alerts")
        .select("id")
        .eq("medicine_id", medicineId)
        .eq("type", type)
        .eq("resolved", false)
        .single()

      if (!existingAlert) {
        const message =
          type === "expired"
            ? `${medicineName} expired on ${new Date(expiryDate).toLocaleDateString()}`
            : `${medicineName} expires on ${new Date(expiryDate).toLocaleDateString()}`

        await this.supabase.from("alerts").insert({
          type,
          medicine_id: medicineId,
          title: type === "expired" ? "Medicine Expired" : "Medicine Expiring Soon",
          message,
          priority: type === "expired" ? "high" : "medium",
          resolved: false,
          created_at: new Date().toISOString(),
        })
      }
    } catch (error) {
      console.error("Error creating expiry alert:", error)
    }
  }
}
