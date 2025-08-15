"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, ShoppingCart, Plus, Trash2, Receipt } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { useToast } from "@/hooks/use-toast"

interface Customer {
  id: string
  first_name: string
  last_name: string
  phone: string | null
}

interface Medicine {
  id: string
  name: string
  generic_name: string | null
  strength: string
  form: string
  unit_price: string
  stock_quantity: number
}

interface Prescription {
  id: string
  prescription_number: string
  customers: {
    first_name: string
    last_name: string
  } | null
  prescription_items: {
    id: string
    quantity_prescribed: number
    quantity_dispensed: number
    medicines: {
      id: string
      name: string
      strength: string
      form: string
      unit_price: string
    } | null
  }[]
}

interface CartItem {
  medicineId: string
  medicineName: string
  strength: string
  form: string
  quantity: number
  unitPrice: number
  totalPrice: number
  availableStock: number
}

interface NewSaleFormProps {
  customers: Customer[]
  medicines: Medicine[]
  prescriptions: Prescription[]
  currentUser: any
}

export default function NewSaleForm({ customers, medicines, prescriptions, currentUser }: NewSaleFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [customerId, setCustomerId] = useState("")
  const [prescriptionId, setPrescriptionId] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("cash")
  const [discountAmount, setDiscountAmount] = useState(0)
  const [cart, setCart] = useState<CartItem[]>([])

  const generateSaleNumber = () => {
    const date = new Date()
    const year = date.getFullYear().toString().slice(-2)
    const month = (date.getMonth() + 1).toString().padStart(2, "0")
    const day = date.getDate().toString().padStart(2, "0")
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0")
    return `SALE${year}${month}${day}${random}`
  }

  const addToCart = (medicine: Medicine, quantity = 1) => {
    const existingItem = cart.find((item) => item.medicineId === medicine.id)

    if (existingItem) {
      if (existingItem.quantity + quantity > medicine.stock_quantity) {
        toast({
          title: "Insufficient Stock",
          description: `Only ${medicine.stock_quantity} units available`,
          variant: "destructive",
        })
        return
      }

      setCart((prev) =>
        prev.map((item) =>
          item.medicineId === medicine.id
            ? {
                ...item,
                quantity: item.quantity + quantity,
                totalPrice: (item.quantity + quantity) * item.unitPrice,
              }
            : item,
        ),
      )
    } else {
      if (quantity > medicine.stock_quantity) {
        toast({
          title: "Insufficient Stock",
          description: `Only ${medicine.stock_quantity} units available`,
          variant: "destructive",
        })
        return
      }

      const newItem: CartItem = {
        medicineId: medicine.id,
        medicineName: medicine.name,
        strength: medicine.strength,
        form: medicine.form,
        quantity,
        unitPrice: Number.parseFloat(medicine.unit_price),
        totalPrice: quantity * Number.parseFloat(medicine.unit_price),
        availableStock: medicine.stock_quantity,
      }
      setCart((prev) => [...prev, newItem])
    }
  }

  const removeFromCart = (medicineId: string) => {
    setCart((prev) => prev.filter((item) => item.medicineId !== medicineId))
  }

  const updateCartQuantity = (medicineId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(medicineId)
      return
    }

    setCart((prev) =>
      prev.map((item) => {
        if (item.medicineId === medicineId) {
          if (newQuantity > item.availableStock) {
            toast({
              title: "Insufficient Stock",
              description: `Only ${item.availableStock} units available`,
              variant: "destructive",
            })
            return item
          }
          return {
            ...item,
            quantity: newQuantity,
            totalPrice: newQuantity * item.unitPrice,
          }
        }
        return item
      }),
    )
  }

  const loadPrescriptionItems = (prescriptionId: string) => {
    const prescription = prescriptions.find((p) => p.id === prescriptionId)
    if (!prescription) return

    // Clear current cart
    setCart([])

    // Add prescription items to cart
    prescription.prescription_items.forEach((item) => {
      if (item.medicines) {
        const medicine = medicines.find((m) => m.id === item.medicines!.id)
        if (medicine) {
          const remainingQuantity = item.quantity_prescribed - item.quantity_dispensed
          if (remainingQuantity > 0) {
            addToCart(medicine, remainingQuantity)
          }
        }
      }
    })

    // Set customer from prescription
    if (prescription.customers) {
      const customer = customers.find(
        (c) => c.first_name === prescription.customers!.first_name && c.last_name === prescription.customers!.last_name,
      )
      if (customer) {
        setCustomerId(customer.id)
      }
    }
  }

  const subtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0)
  const taxRate = 0.08 // 8% tax
  const taxAmount = subtotal * taxRate
  const total = subtotal + taxAmount - discountAmount

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (cart.length === 0) {
        throw new Error("Please add items to cart")
      }

      const saleNumber = generateSaleNumber()

      // Insert sale
      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .insert({
          sale_number: saleNumber,
          customer_id: customerId || null,
          prescription_id: prescriptionId || null,
          user_id: currentUser.id,
          total_amount: total.toFixed(2),
          discount_amount: discountAmount.toFixed(2),
          tax_amount: taxAmount.toFixed(2),
          payment_method: paymentMethod,
          payment_status: "paid",
        })
        .select()
        .single()

      if (saleError) {
        throw saleError
      }

      // Insert sale items
      const saleItems = cart.map((item) => ({
        sale_id: sale.id,
        medicine_id: item.medicineId,
        quantity: item.quantity,
        unit_price: item.unitPrice.toFixed(2),
        total_price: item.totalPrice.toFixed(2),
      }))

      const { error: itemsError } = await supabase.from("sale_items").insert(saleItems)

      if (itemsError) {
        throw itemsError
      }

      // Update inventory
      for (const item of cart) {
        const { error: inventoryError } = await supabase
          .from("medicines")
          .update({
            stock_quantity: item.availableStock - item.quantity,
          })
          .eq("id", item.medicineId)

        if (inventoryError) {
          console.error("Error updating inventory:", inventoryError)
        }

        // Add inventory transaction
        await supabase.from("inventory_transactions").insert({
          medicine_id: item.medicineId,
          transaction_type: "sale",
          quantity: -item.quantity,
          reference_id: sale.id,
          reference_type: "sale",
          user_id: currentUser.id,
        })
      }

      // Update prescription status if applicable
      if (prescriptionId) {
        await supabase.from("prescriptions").update({ status: "filled" }).eq("id", prescriptionId)
      }

      toast({
        title: "Success",
        description: `Sale ${saleNumber} completed successfully`,
      })

      router.push("/dashboard/sales")
    } catch (error) {
      console.error("Error processing sale:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to process sale. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Product Selection */}
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Customer & Prescription</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Customer (Optional)</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.first_name} {customer.last_name}
                        {customer.phone && ` - ${customer.phone}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Prescription (Optional)</Label>
                <Select
                  value={prescriptionId}
                  onValueChange={(value) => {
                    setPrescriptionId(value)
                    if (value) loadPrescriptionItems(value)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select prescription" />
                  </SelectTrigger>
                  <SelectContent>
                    {prescriptions.map((prescription) => (
                      <SelectItem key={prescription.id} value={prescription.id}>
                        {prescription.prescription_number}
                        {prescription.customers &&
                          ` - ${prescription.customers.first_name} ${prescription.customers.last_name}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add Products</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {medicines.slice(0, 12).map((medicine) => (
                <div key={medicine.id} className="border rounded-lg p-4 space-y-2">
                  <div>
                    <div className="font-medium text-sm">{medicine.name}</div>
                    <div className="text-xs text-gray-500">
                      {medicine.strength} {medicine.form}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">${Number.parseFloat(medicine.unit_price).toFixed(2)}</div>
                      <div className="text-xs text-gray-500">Stock: {medicine.stock_quantity}</div>
                    </div>
                    <Button size="sm" onClick={() => addToCart(medicine)} disabled={medicine.stock_quantity === 0}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cart & Checkout */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Cart ({cart.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cart.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">Cart is empty</p>
            ) : (
              <div className="space-y-2">
                {cart.map((item) => (
                  <div key={item.medicineId} className="flex items-center justify-between p-2 border rounded">
                    <div className="flex-1">
                      <div className="text-sm font-medium">{item.medicineName}</div>
                      <div className="text-xs text-gray-500">
                        {item.strength} {item.form}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="1"
                        max={item.availableStock}
                        value={item.quantity}
                        onChange={(e) => updateCartQuantity(item.medicineId, Number.parseInt(e.target.value))}
                        className="w-16 h-8 text-xs"
                      />
                      <div className="text-sm font-medium">${item.totalPrice.toFixed(2)}</div>
                      <Button size="sm" variant="ghost" onClick={() => removeFromCart(item.medicineId)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="insurance">Insurance</SelectItem>
                  <SelectItem value="mixed">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Discount Amount</Label>
              <Input
                type="number"
                min="0"
                max={subtotal}
                step="0.01"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(Number.parseFloat(e.target.value) || 0)}
              />
            </div>

            <div className="space-y-2 pt-4 border-t">
              <div className="flex justify-between text-sm">
                <span>Subtotal:</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Tax (8%):</span>
                <span>${taxAmount.toFixed(2)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Discount:</span>
                  <span>-${discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg border-t pt-2">
                <span>Total:</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>

            <Button onClick={handleSubmit} disabled={loading || cart.length === 0} className="w-full">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Receipt className="mr-2 h-4 w-4" />
                  Complete Sale
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
