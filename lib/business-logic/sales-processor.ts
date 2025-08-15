import { createClient } from "@/lib/supabase/client"
import { InventoryManager } from "./inventory-manager"

export interface SaleItem {
  medicine_id: string
  quantity: number
  unit_price: number
  discount?: number
}

export interface SaleData {
  customer_id?: string
  items: SaleItem[]
  payment_method: "cash" | "card" | "insurance"
  discount_amount?: number
  tax_amount?: number
  notes?: string
}

export interface SaleResult {
  success: boolean
  sale_id?: string
  total_amount?: number
  error?: string
}

export class SalesProcessor {
  private supabase = createClient()
  private inventoryManager = new InventoryManager()

  async processSale(saleData: SaleData): Promise<SaleResult> {
    try {
      // Validate sale items
      const validation = await this.validateSaleItems(saleData.items)
      if (!validation.isValid) {
        return { success: false, error: validation.errors.join(", ") }
      }

      // Calculate totals
      const subtotal = saleData.items.reduce((sum, item) => {
        const itemTotal = item.quantity * item.unit_price
        const itemDiscount = item.discount || 0
        return sum + (itemTotal - itemDiscount)
      }, 0)

      const discountAmount = saleData.discount_amount || 0
      const taxAmount = saleData.tax_amount || (subtotal - discountAmount) * 0.1 // 10% tax
      const totalAmount = subtotal - discountAmount + taxAmount

      // Create sale record
      const { data: sale, error: saleError } = await this.supabase
        .from("sales")
        .insert({
          customer_id: saleData.customer_id,
          subtotal_amount: subtotal.toFixed(2),
          discount_amount: discountAmount.toFixed(2),
          tax_amount: taxAmount.toFixed(2),
          total_amount: totalAmount.toFixed(2),
          payment_method: saleData.payment_method,
          notes: saleData.notes,
          created_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (saleError || !sale) {
        return { success: false, error: "Failed to create sale record" }
      }

      // Process sale items
      const processedItems: string[] = []

      try {
        for (const item of saleData.items) {
          // Create sale item record
          const { error: itemError } = await this.supabase.from("sale_items").insert({
            sale_id: sale.id,
            medicine_id: item.medicine_id,
            quantity: item.quantity,
            unit_price: item.unit_price.toFixed(2),
            discount_amount: (item.discount || 0).toFixed(2),
            total_amount: (item.quantity * item.unit_price - (item.discount || 0)).toFixed(2),
          })

          if (itemError) {
            throw new Error(`Failed to create sale item: ${itemError.message}`)
          }

          // Update inventory
          const stockUpdate = await this.inventoryManager.updateStock(
            item.medicine_id,
            item.quantity,
            "out",
            "Sale transaction",
            sale.id,
            "sale",
          )

          if (!stockUpdate.success) {
            throw new Error(stockUpdate.error)
          }

          processedItems.push(item.medicine_id)
        }

        // Generate receipt data
        await this.generateReceipt(sale.id)

        return {
          success: true,
          sale_id: sale.id,
          total_amount: totalAmount,
        }
      } catch (error) {
        // Rollback: delete sale and restore inventory
        await this.supabase.from("sales").delete().eq("id", sale.id)

        for (const medicineId of processedItems) {
          const item = saleData.items.find((i) => i.medicine_id === medicineId)
          if (item) {
            await this.inventoryManager.updateStock(
              medicineId,
              item.quantity,
              "in",
              "Rollback - sale processing failed",
              sale.id,
              "adjustment",
            )
          }
        }

        return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
      }
    } catch (error) {
      console.error("Error processing sale:", error)
      return { success: false, error: "Failed to process sale" }
    }
  }

  async validateSaleItems(items: SaleItem[]): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = []

    try {
      for (const item of items) {
        // Check if medicine exists
        const { data: medicine, error } = await this.supabase
          .from("medicines")
          .select("name, stock_quantity, unit_price")
          .eq("id", item.medicine_id)
          .single()

        if (error || !medicine) {
          errors.push(`Medicine with ID ${item.medicine_id} not found`)
          continue
        }

        // Check stock availability
        if (medicine.stock_quantity < item.quantity) {
          errors.push(
            `Insufficient stock for ${medicine.name}. Available: ${medicine.stock_quantity}, Required: ${item.quantity}`,
          )
        }

        // Validate quantity
        if (item.quantity <= 0) {
          errors.push(`Invalid quantity for ${medicine.name}`)
        }

        // Validate price
        if (item.unit_price <= 0) {
          errors.push(`Invalid price for ${medicine.name}`)
        }

        // Check if price matches current price (optional warning)
        const currentPrice = Number.parseFloat(medicine.unit_price)
        if (Math.abs(item.unit_price - currentPrice) > 0.01) {
          // This could be a warning instead of an error
          console.warn(`Price mismatch for ${medicine.name}. Current: ${currentPrice}, Sale: ${item.unit_price}`)
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
      }
    } catch (error) {
      console.error("Error validating sale items:", error)
      return {
        isValid: false,
        errors: ["Failed to validate sale items"],
      }
    }
  }

  async generateReceipt(saleId: string): Promise<void> {
    try {
      // In a real app, you might generate a PDF receipt or send to a printer
      // For now, we'll just create a receipt record
      const { data: sale, error } = await this.supabase
        .from("sales")
        .select(`
          *,
          customers (
            first_name,
            last_name,
            email,
            phone
          ),
          sale_items (
            *,
            medicines (
              name,
              strength,
              form
            )
          )
        `)
        .eq("id", saleId)
        .single()

      if (error || !sale) {
        console.error("Error fetching sale for receipt:", error)
        return
      }

      // Create receipt record
      await this.supabase.from("receipts").insert({
        sale_id: saleId,
        receipt_number: `RCP-${Date.now()}`,
        generated_at: new Date().toISOString(),
        receipt_data: JSON.stringify(sale),
      })
    } catch (error) {
      console.error("Error generating receipt:", error)
    }
  }

  async getSalesAnalytics(startDate: string, endDate: string) {
    try {
      const { data: sales, error } = await this.supabase
        .from("sales")
        .select(`
          id,
          total_amount,
          payment_method,
          created_at,
          sale_items (
            quantity,
            medicines (
              name,
              categories (
                name
              )
            )
          )
        `)
        .gte("created_at", startDate)
        .lte("created_at", endDate)

      if (error || !sales) return null

      const analytics = {
        total_sales: sales.length,
        total_revenue: 0,
        average_sale_value: 0,
        payment_methods: {} as Record<string, number>,
        top_selling_medicines: {} as Record<string, number>,
        sales_by_category: {} as Record<string, number>,
        daily_sales: {} as Record<string, number>,
      }

      for (const sale of sales) {
        const amount = Number.parseFloat(sale.total_amount)
        analytics.total_revenue += amount

        // Payment methods
        analytics.payment_methods[sale.payment_method] = (analytics.payment_methods[sale.payment_method] || 0) + 1

        // Daily sales
        const date = new Date(sale.created_at).toISOString().split("T")[0]
        analytics.daily_sales[date] = (analytics.daily_sales[date] || 0) + amount

        // Top selling medicines and categories
        for (const item of sale.sale_items) {
          const medicineName = item.medicines?.name || "Unknown"
          const categoryName = item.medicines?.categories?.name || "Uncategorized"

          analytics.top_selling_medicines[medicineName] =
            (analytics.top_selling_medicines[medicineName] || 0) + item.quantity

          analytics.sales_by_category[categoryName] = (analytics.sales_by_category[categoryName] || 0) + item.quantity
        }
      }

      analytics.average_sale_value = analytics.total_sales > 0 ? analytics.total_revenue / analytics.total_sales : 0

      return analytics
    } catch (error) {
      console.error("Error getting sales analytics:", error)
      return null
    }
  }
}
