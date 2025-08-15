import { createClient } from "@/lib/supabase/client"

export interface BusinessRule {
  id: string
  name: string
  description: string
  rule_type: "validation" | "automation" | "alert"
  conditions: Record<string, any>
  actions: Record<string, any>
  active: boolean
}

export class BusinessRulesEngine {
  private supabase = createClient()

  async validateMedicineData(medicineData: any): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = []

    // Required fields validation
    if (!medicineData.name || medicineData.name.trim() === "") {
      errors.push("Medicine name is required")
    }

    if (!medicineData.strength || medicineData.strength.trim() === "") {
      errors.push("Medicine strength is required")
    }

    if (!medicineData.form || medicineData.form.trim() === "") {
      errors.push("Medicine form is required")
    }

    // Price validation
    if (!medicineData.unit_price || Number.parseFloat(medicineData.unit_price) <= 0) {
      errors.push("Valid unit price is required")
    }

    if (!medicineData.cost_price || Number.parseFloat(medicineData.cost_price) <= 0) {
      errors.push("Valid cost price is required")
    }

    // Cost price should not be higher than unit price
    if (medicineData.unit_price && medicineData.cost_price) {
      const unitPrice = Number.parseFloat(medicineData.unit_price)
      const costPrice = Number.parseFloat(medicineData.cost_price)

      if (costPrice > unitPrice) {
        errors.push("Cost price cannot be higher than unit price")
      }
    }

    // Stock validation
    if (medicineData.stock_quantity < 0) {
      errors.push("Stock quantity cannot be negative")
    }

    if (medicineData.minimum_stock < 0) {
      errors.push("Minimum stock cannot be negative")
    }

    if (medicineData.maximum_stock < medicineData.minimum_stock) {
      errors.push("Maximum stock cannot be less than minimum stock")
    }

    // Expiry date validation
    if (medicineData.expiry_date) {
      const expiryDate = new Date(medicineData.expiry_date)
      const today = new Date()

      if (expiryDate <= today) {
        errors.push("Expiry date must be in the future")
      }
    }

    // Barcode uniqueness validation
    if (medicineData.barcode) {
      const { data: existingMedicine } = await this.supabase
        .from("medicines")
        .select("id")
        .eq("barcode", medicineData.barcode)
        .neq("id", medicineData.id || "")
        .single()

      if (existingMedicine) {
        errors.push("Barcode already exists for another medicine")
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  }

  async validateCustomerData(customerData: any): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = []

    // Required fields
    if (!customerData.first_name || customerData.first_name.trim() === "") {
      errors.push("First name is required")
    }

    if (!customerData.last_name || customerData.last_name.trim() === "") {
      errors.push("Last name is required")
    }

    // Email validation
    if (customerData.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(customerData.email)) {
        errors.push("Invalid email format")
      }

      // Check email uniqueness
      const { data: existingCustomer } = await this.supabase
        .from("customers")
        .select("id")
        .eq("email", customerData.email)
        .neq("id", customerData.id || "")
        .single()

      if (existingCustomer) {
        errors.push("Email already exists for another customer")
      }
    }

    // Phone validation
    if (customerData.phone) {
      const phoneRegex = /^\+?[\d\s\-$$$$]+$/
      if (!phoneRegex.test(customerData.phone)) {
        errors.push("Invalid phone number format")
      }
    }

    // Date of birth validation
    if (customerData.date_of_birth) {
      const birthDate = new Date(customerData.date_of_birth)
      const today = new Date()
      const age = today.getFullYear() - birthDate.getFullYear()

      if (birthDate > today) {
        errors.push("Date of birth cannot be in the future")
      }

      if (age > 150) {
        errors.push("Invalid date of birth")
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  }

  async validatePrescriptionData(prescriptionData: any): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = []

    // Required fields
    if (!prescriptionData.prescription_number || prescriptionData.prescription_number.trim() === "") {
      errors.push("Prescription number is required")
    }

    if (!prescriptionData.doctor_name || prescriptionData.doctor_name.trim() === "") {
      errors.push("Doctor name is required")
    }

    if (!prescriptionData.customer_id) {
      errors.push("Customer is required")
    }

    if (!prescriptionData.issue_date) {
      errors.push("Issue date is required")
    }

    // Prescription number uniqueness
    if (prescriptionData.prescription_number) {
      const { data: existingPrescription } = await this.supabase
        .from("prescriptions")
        .select("id")
        .eq("prescription_number", prescriptionData.prescription_number)
        .neq("id", prescriptionData.id || "")
        .single()

      if (existingPrescription) {
        errors.push("Prescription number already exists")
      }
    }

    // Issue date validation
    if (prescriptionData.issue_date) {
      const issueDate = new Date(prescriptionData.issue_date)
      const today = new Date()
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)

      if (issueDate > today) {
        errors.push("Issue date cannot be in the future")
      }

      if (issueDate < thirtyDaysAgo) {
        errors.push("Prescription is too old (more than 30 days)")
      }
    }

    // Validate prescription items
    if (prescriptionData.items && prescriptionData.items.length === 0) {
      errors.push("At least one medication must be prescribed")
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  }

  async applyAutomationRules(): Promise<void> {
    try {
      // Auto-reorder medicines that are below minimum stock
      await this.autoReorderMedicines()

      // Auto-expire old prescriptions
      await this.autoExpirePrescriptions()

      // Generate low stock alerts
      await this.generateLowStockAlerts()

      // Generate expiry alerts
      await this.generateExpiryAlerts()
    } catch (error) {
      console.error("Error applying automation rules:", error)
    }
  }

  private async autoReorderMedicines(): Promise<void> {
    try {
      const { data: medicines } = await this.supabase
        .from("medicines")
        .select("id, name, stock_quantity, minimum_stock, maximum_stock, suppliers(id, name)")
        .lte("stock_quantity", this.supabase.rpc("minimum_stock"))

      if (medicines) {
        for (const medicine of medicines) {
          // Create purchase order suggestion
          const suggestedQuantity = medicine.maximum_stock - medicine.stock_quantity

          await this.supabase.from("purchase_orders").insert({
            supplier_id: medicine.suppliers?.id,
            status: "draft",
            notes: `Auto-generated reorder for ${medicine.name}`,
            created_at: new Date().toISOString(),
          })
        }
      }
    } catch (error) {
      console.error("Error in auto-reorder:", error)
    }
  }

  private async autoExpirePrescriptions(): Promise<void> {
    try {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      await this.supabase
        .from("prescriptions")
        .update({ status: "expired" })
        .eq("status", "pending")
        .lt("issue_date", thirtyDaysAgo.toISOString())
    } catch (error) {
      console.error("Error in auto-expire prescriptions:", error)
    }
  }

  private async generateLowStockAlerts(): Promise<void> {
    // This would be handled by the InventoryManager
  }

  private async generateExpiryAlerts(): Promise<void> {
    // This would be handled by the InventoryManager
  }
}
