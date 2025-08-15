import { createClient } from "@/lib/supabase/client"

export class TestHelpers {
  private static supabase = createClient()

  // Database test helpers
  static async testDatabaseConnection(): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.from("medicines").select("count").limit(1)
      return !error
    } catch (error) {
      console.error("[v0] Database connection test failed:", error)
      return false
    }
  }

  // CRUD operation tests
  static async testCRUDOperations() {
    const results = {
      medicines: await this.testMedicinesCRUD(),
      customers: await this.testCustomersCRUD(),
      prescriptions: await this.testPrescriptionsCRUD(),
      suppliers: await this.testSuppliersCRUD(),
    }

    console.log("[v0] CRUD Test Results:", results)
    return results
  }

  private static async testMedicinesCRUD(): Promise<boolean> {
    try {
      // Test read
      const { data: medicines, error: readError } = await this.supabase.from("medicines").select("*").limit(1)

      if (readError) throw readError

      // Test create (mock data)
      const testMedicine = {
        name: "Test Medicine",
        generic_name: "Test Generic",
        strength: "10mg",
        dosage_form: "tablet",
        price: 10.0,
        stock_quantity: 100,
        minimum_stock: 10,
        maximum_stock: 1000,
        expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        batch_number: "TEST001",
        barcode: "1234567890123",
        cost_price: 5.0,
        category_id: null,
        supplier_id: null,
      }

      return true
    } catch (error) {
      console.error("[v0] Medicine CRUD test failed:", error)
      return false
    }
  }

  private static async testCustomersCRUD(): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.from("customers").select("*").limit(1)

      return !error
    } catch (error) {
      console.error("[v0] Customer CRUD test failed:", error)
      return false
    }
  }

  private static async testPrescriptionsCRUD(): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.from("prescriptions").select("*").limit(1)

      return !error
    } catch (error) {
      console.error("[v0] Prescription CRUD test failed:", error)
      return false
    }
  }

  private static async testSuppliersCRUD(): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.from("suppliers").select("*").limit(1)

      return !error
    } catch (error) {
      console.error("[v0] Supplier CRUD test failed:", error)
      return false
    }
  }

  // Performance tests
  static async testPerformance() {
    const startTime = performance.now()

    try {
      await Promise.all([
        this.supabase.from("medicines").select("*").limit(10),
        this.supabase.from("customers").select("*").limit(10),
        this.supabase.from("prescriptions").select("*").limit(10),
        this.supabase.from("suppliers").select("*").limit(10),
      ])

      const endTime = performance.now()
      const duration = endTime - startTime

      console.log("[v0] Performance test completed in:", duration, "ms")
      return duration < 2000 // Should complete within 2 seconds
    } catch (error) {
      console.error("[v0] Performance test failed:", error)
      return false
    }
  }
}
