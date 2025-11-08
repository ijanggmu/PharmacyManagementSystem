"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Loader2, ShoppingCart, Receipt } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useCreateSale } from "@/lib/hooks/use-sales"
import { CustomerSelector } from "./customer-selector"
import { MedicineSelector } from "./medicine-selector"
import { CartSummary } from "./cart-summary"
import { PaymentSection } from "./payment-section"
import { PrescriptionSelector } from "./prescription-selector"
import { CartItem, Customer, Medicine, Prescription } from "./types"

interface NewSaleFormProps {
  customers: Customer[]
  medicines: Medicine[]
  prescriptions: Prescription[]
  currentUser: any
}

export default function NewSaleForm({ customers, medicines, prescriptions, currentUser }: NewSaleFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const createSaleMutation = useCreateSale()
  
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'insurance' | 'other'>('cash')
  const [notes, setNotes] = useState('')

  const subtotal = cartItems.reduce((sum, item) => sum + item.totalPrice, 0)
  const tax = subtotal * 0.1 // 10% tax
  const total = subtotal + tax

  const handleAddToCart = (medicine: Medicine, quantity: number) => {
    const existingItem = cartItems.find(item => item.medicineId === medicine.id)
    
    if (existingItem) {
      setCartItems(prev => prev.map(item => 
        item.medicineId === medicine.id 
          ? { ...item, quantity: item.quantity + quantity, totalPrice: (item.quantity + quantity) * item.unitPrice }
          : item
      ))
    } else {
      const newItem: CartItem = {
        medicineId: medicine.id,
        medicineName: medicine.name,
        strength: medicine.strength,
        form: medicine.form,
        quantity,
        unitPrice: parseFloat(medicine.unit_price),
        totalPrice: quantity * parseFloat(medicine.unit_price),
        availableStock: medicine.stock_quantity
      }
      setCartItems(prev => [...prev, newItem])
    }
  }

  const handleRemoveFromCart = (medicineId: string) => {
    setCartItems(prev => prev.filter(item => item.medicineId !== medicineId))
  }

  const handleUpdateQuantity = (medicineId: string, quantity: number) => {
    setCartItems(prev => prev.map(item => 
      item.medicineId === medicineId 
        ? { ...item, quantity, totalPrice: quantity * item.unitPrice }
        : item
    ))
  }

  const handleCreateSale = async () => {
    if (!selectedCustomer || cartItems.length === 0) {
      toast({
        title: "Error",
        description: "Please select a customer and add items to cart",
        variant: "destructive"
      })
      return
    }

    try {
      const saleData = {
        sale_number: `SALE-${Date.now()}`,
        customer_id: selectedCustomer.id,
        total_amount: total.toFixed(2),
        discount_amount: "0.00",
        tax_amount: tax.toFixed(2),
        payment_method: paymentMethod,
        payment_status: 'completed' as const,
        sale_date: new Date().toISOString(),
        notes: notes || undefined,
        sale_items: cartItems.map(item => ({
          medicine_id: item.medicineId,
          quantity: item.quantity,
          unit_price: item.unitPrice.toFixed(2),
          total_price: item.totalPrice.toFixed(2)
        }))
      }

      await createSaleMutation.mutateAsync(saleData)
      
      toast({
        title: "Success",
        description: "Sale created successfully"
      })
      
      router.push('/dashboard/sales')
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create sale",
        variant: "destructive"
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Sale</h1>
          <p className="text-muted-foreground">
            Create a new sale transaction
          </p>
        </div>
        <Button onClick={handleCreateSale} disabled={createSaleMutation.isPending}>
          {createSaleMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Receipt className="mr-2 h-4 w-4" />
          Complete Sale
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Customer & Medicine Selection */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Selection */}
          <CustomerSelector
            customers={customers}
            selectedCustomer={selectedCustomer}
            onCustomerSelect={setSelectedCustomer}
          />

          {/* Prescription Selection */}
          {selectedCustomer && (
            <PrescriptionSelector
              prescriptions={prescriptions.filter(p => 
                p.customers?.first_name === selectedCustomer.first_name &&
                p.customers?.last_name === selectedCustomer.last_name
              )}
              selectedPrescription={selectedPrescription}
              onPrescriptionSelect={setSelectedPrescription}
            />
          )}

          {/* Medicine Selection */}
          <MedicineSelector
            medicines={medicines}
            onAddToCart={handleAddToCart}
          />
        </div>

        {/* Right Column - Cart & Payment */}
        <div className="space-y-6">
          {/* Cart Summary */}
          <CartSummary
            items={cartItems}
            onRemoveItem={handleRemoveFromCart}
            onUpdateQuantity={handleUpdateQuantity}
            subtotal={subtotal}
            tax={tax}
            total={total}
          />

          <Separator />

          {/* Payment Section */}
          <PaymentSection
            paymentMethod={paymentMethod}
            onPaymentMethodChange={setPaymentMethod}
            notes={notes}
            onNotesChange={setNotes}
            total={total}
          />
        </div>
      </div>
    </div>
  )
}






