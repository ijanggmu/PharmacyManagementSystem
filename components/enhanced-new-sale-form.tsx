"use client"

import type React from "react"
import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Loader2,
  ShoppingCart,
  Plus,
  Receipt,
  Search,
  UserPlus,
  FileText,
  ChevronLeft,
  ChevronRight,
  X,
  Package,
  DollarSign,
  Users,
} from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { useToast } from "@/hooks/use-toast"

interface Customer {
  id: string
  first_name: string
  last_name: string
  phone: string | null
  email: string | null
}

interface Medicine {
  id: string
  name: string
  generic_name: string | null
  strength: string
  form: string
  unit_price: string
  stock_quantity: number
  category: string | null
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

export default function EnhancedNewSaleForm({ customers, medicines, prescriptions, currentUser }: NewSaleFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [customerId, setCustomerId] = useState("")
  const [prescriptionId, setPrescriptionId] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("cash")
  const [discountAmount, setDiscountAmount] = useState(0)
  const [cart, setCart] = useState<CartItem[]>([])

  // Search and pagination states
  const [searchQuery, setSearchQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedCategory, setSelectedCategory] = useState("all")
  const itemsPerPage = 12

  // Dialog states
  const [showCustomerDialog, setShowCustomerDialog] = useState(false)
  const [showPrescriptionDialog, setShowPrescriptionDialog] = useState(false)
  const [showReceiptDialog, setShowReceiptDialog] = useState(false)
  const [lastSale, setLastSale] = useState<any>(null)

  // New customer form
  const [newCustomer, setNewCustomer] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    address: "",
    insurance_provider: "",
    insurance_number: "",
  })

  // Filter and paginate medicines
  const filteredMedicines = useMemo(() => {
    return medicines.filter((medicine) => {
      const matchesSearch =
        medicine.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (medicine.generic_name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
      const matchesCategory = selectedCategory === "all" || medicine.category === selectedCategory
      return matchesSearch && matchesCategory && medicine.stock_quantity > 0
    })
  }, [medicines, searchQuery, selectedCategory])

  const paginatedMedicines = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filteredMedicines.slice(startIndex, startIndex + itemsPerPage)
  }, [filteredMedicines, currentPage])

  const totalPages = Math.ceil(filteredMedicines.length / itemsPerPage)
  const categories = [...new Set(medicines.map((m) => m.category).filter(Boolean))]

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

    toast({
      title: "Added to Cart",
      description: `${medicine.name} added successfully`,
    })
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

  const createCustomer = async () => {
    try {
      const { data, error } = await supabase.from("customers").insert([newCustomer]).select().single()

      if (error) throw error

      setCustomerId(data.id)
      setShowCustomerDialog(false)
      setNewCustomer({
        first_name: "",
        last_name: "",
        phone: "",
        email: "",
        address: "",
        insurance_provider: "",
        insurance_number: "",
      })

      toast({
        title: "Success",
        description: "Customer created successfully",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create customer",
        variant: "destructive",
      })
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

      if (saleError) throw saleError

      // Insert sale items
      const saleItems = cart.map((item) => ({
        sale_id: sale.id,
        medicine_id: item.medicineId,
        quantity: item.quantity,
        unit_price: item.unitPrice.toFixed(2),
        total_price: item.totalPrice.toFixed(2),
      }))

      const { error: itemsError } = await supabase.from("sale_items").insert(saleItems)
      if (itemsError) throw itemsError

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

      // Set sale data for receipt
      setLastSale({
        ...sale,
        items: cart,
        customer: customerId ? customers.find((c) => c.id === customerId) : null,
        subtotal,
        taxAmount,
        total,
      })

      // Clear cart
      setCart([])
      setCustomerId("")
      setPrescriptionId("")
      setDiscountAmount(0)

      toast({
        title: "Success",
        description: `Sale ${saleNumber} completed successfully`,
      })

      // Show receipt dialog
      setShowReceiptDialog(true)
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
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
      {/* Product Selection - Takes 3 columns */}
      <div className="xl:col-span-3 space-y-8">
        {/* Customer & Prescription Selection */}
        <Card className="border-0 shadow-lg bg-gradient-to-r from-blue-50 to-indigo-50">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Users className="h-5 w-5 text-blue-600" />
              Customer & Prescription
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Customer</Label>
                  <Dialog open={showCustomerDialog} onOpenChange={setShowCustomerDialog}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 bg-transparent">
                        <UserPlus className="h-3 w-3 mr-1" />
                        New Customer
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Add New Customer</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">First Name</Label>
                            <Input
                              value={newCustomer.first_name}
                              onChange={(e) => setNewCustomer((prev) => ({ ...prev, first_name: e.target.value }))}
                              className="h-9"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Last Name</Label>
                            <Input
                              value={newCustomer.last_name}
                              onChange={(e) => setNewCustomer((prev) => ({ ...prev, last_name: e.target.value }))}
                              className="h-9"
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs">Phone</Label>
                          <Input
                            value={newCustomer.phone}
                            onChange={(e) => setNewCustomer((prev) => ({ ...prev, phone: e.target.value }))}
                            className="h-9"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Email</Label>
                          <Input
                            type="email"
                            value={newCustomer.email}
                            onChange={(e) => setNewCustomer((prev) => ({ ...prev, email: e.target.value }))}
                            className="h-9"
                          />
                        </div>
                        <Button onClick={createCustomer} className="w-full h-9">
                          Create Customer
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Select customer (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        <div className="flex flex-col">
                          <span>
                            {customer.first_name} {customer.last_name}
                          </span>
                          {customer.phone && <span className="text-xs text-gray-500">{customer.phone}</span>}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Prescription</Label>
                  <Button variant="outline" size="sm" className="h-8 bg-transparent">
                    <FileText className="h-3 w-3 mr-1" />
                    New Prescription
                  </Button>
                </div>
                <Select
                  value={prescriptionId}
                  onValueChange={(value) => {
                    setPrescriptionId(value)
                    // if (value) loadPrescriptionItems(value)
                  }}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Select prescription (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {prescriptions.map((prescription) => (
                      <SelectItem key={prescription.id} value={prescription.id}>
                        <div className="flex flex-col">
                          <span>{prescription.prescription_number}</span>
                          {prescription.customers && (
                            <span className="text-xs text-gray-500">
                              {prescription.customers.first_name} {prescription.customers.last_name}
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Product Search and Filters */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Package className="h-5 w-5 text-green-600" />
              Product Catalog
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Search and Filter Controls */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search medicines..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="pl-10 h-11"
                />
              </div>
              <Select
                value={selectedCategory}
                onValueChange={(value) => {
                  setSelectedCategory(value)
                  setCurrentPage(1)
                }}
              >
                <SelectTrigger className="w-48 h-11">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category!}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {paginatedMedicines.map((medicine) => (
                <Card
                  key={medicine.id}
                  className="group hover:shadow-md transition-all duration-200 border border-gray-200 hover:border-blue-300"
                >
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div>
                        <h3 className="font-semibold text-sm text-gray-900 line-clamp-2">{medicine.name}</h3>
                        <p className="text-xs text-gray-500 mt-1">
                          {medicine.strength} • {medicine.form}
                        </p>
                        {medicine.generic_name && (
                          <p className="text-xs text-blue-600 mt-1">Generic: {medicine.generic_name}</p>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-lg font-bold text-green-600">
                            ${Number.parseFloat(medicine.unit_price).toFixed(2)}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={medicine.stock_quantity > 10 ? "default" : "destructive"}
                              className="text-xs"
                            >
                              Stock: {medicine.stock_quantity}
                            </Badge>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => addToCart(medicine)}
                          disabled={medicine.stock_quantity === 0}
                          className="h-8 w-8 p-0 group-hover:scale-105 transition-transform"
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <p className="text-sm text-gray-600">
                  Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                  {Math.min(currentPage * itemsPerPage, filteredMedicines.length)} of {filteredMedicines.length}{" "}
                  products
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm px-3 py-1 bg-gray-100 rounded">
                    {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cart & Checkout - Takes 1 column */}
      <div className="space-y-6">
        {/* Cart */}
        <Card className="border-0 shadow-lg bg-gradient-to-b from-gray-50 to-white sticky top-4">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center justify-between text-lg">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-blue-600" />
                Shopping Cart
              </div>
              <Badge variant="secondary" className="text-sm">
                {cart.length} items
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {cart.length === 0 ? (
              <div className="text-center py-8">
                <ShoppingCart className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Your cart is empty</p>
                <p className="text-xs text-gray-400 mt-1">Add products to get started</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {cart.map((item) => (
                  <Card key={item.medicineId} className="border border-gray-200">
                    <CardContent className="p-3">
                      <div className="space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium text-gray-900 truncate">{item.medicineName}</h4>
                            <p className="text-xs text-gray-500">
                              {item.strength} • {item.form}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeFromCart(item.medicineId)}
                            className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min="1"
                              max={item.availableStock}
                              value={item.quantity}
                              onChange={(e) => updateCartQuantity(item.medicineId, Number.parseInt(e.target.value))}
                              className="w-16 h-7 text-xs"
                            />
                            <span className="text-xs text-gray-500">× ${item.unitPrice.toFixed(2)}</span>
                          </div>
                          <div className="text-sm font-semibold text-green-600">${item.totalPrice.toFixed(2)}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment */}
        {cart.length > 0 && (
          <Card className="border-0 shadow-lg">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <DollarSign className="h-5 w-5 text-green-600" />
                Payment Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="h-10 mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">💵 Cash</SelectItem>
                      <SelectItem value="card">💳 Card</SelectItem>
                      <SelectItem value="insurance">🏥 Insurance</SelectItem>
                      <SelectItem value="mixed">🔄 Mixed Payment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-sm font-medium">Discount Amount</Label>
                  <Input
                    type="number"
                    min="0"
                    max={subtotal}
                    step="0.01"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(Number.parseFloat(e.target.value) || 0)}
                    className="h-10 mt-1"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <Separator />

              {/* Order Summary */}
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal:</span>
                  <span className="font-medium">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Tax (8%):</span>
                  <span className="font-medium">${taxAmount.toFixed(2)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Discount:</span>
                    <span className="font-medium">-${discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>Total:</span>
                  <span className="text-green-600">${total.toFixed(2)}</span>
                </div>
              </div>

              <Button
                onClick={handleSubmit}
                disabled={loading || cart.length === 0}
                className="w-full h-12 text-base font-semibold bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Processing Sale...
                  </>
                ) : (
                  <>
                    <Receipt className="mr-2 h-5 w-5" />
                    Complete Sale (${total.toFixed(2)})
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Receipt Dialog */}
      <Dialog open={showReceiptDialog} onOpenChange={setShowReceiptDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">Sale Receipt</DialogTitle>
          </DialogHeader>
          {lastSale && (
            <div className="space-y-4 text-sm">
              <div className="text-center border-b pb-4">
                <h3 className="font-bold text-lg">Pharmacy Management</h3>
                <p className="text-gray-600">Sale Receipt</p>
                <p className="text-xs text-gray-500 mt-2">{new Date().toLocaleString()}</p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="font-medium">Sale #:</span>
                  <span>{lastSale.sale_number}</span>
                </div>
                {lastSale.customer && (
                  <div className="flex justify-between">
                    <span className="font-medium">Customer:</span>
                    <span>
                      {lastSale.customer.first_name} {lastSale.customer.last_name}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="font-medium">Payment:</span>
                  <span className="capitalize">{lastSale.payment_method}</span>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Items:</h4>
                <div className="space-y-1">
                  {lastSale.items.map((item: CartItem) => (
                    <div key={item.medicineId} className="flex justify-between text-xs">
                      <span>
                        {item.medicineName} × {item.quantity}
                      </span>
                      <span>${item.totalPrice.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t pt-4 space-y-1">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>${lastSale.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax:</span>
                  <span>${lastSale.taxAmount.toFixed(2)}</span>
                </div>
                {lastSale.discount_amount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount:</span>
                    <span>-${lastSale.discount_amount}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg border-t pt-2">
                  <span>Total:</span>
                  <span>${lastSale.total.toFixed(2)}</span>
                </div>
              </div>

              <div className="text-center text-xs text-gray-500 border-t pt-4">
                <p>Thank you for your business!</p>
                <p>Keep this receipt for your records</p>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()} className="flex-1">
              Print Receipt
            </Button>
            <Button onClick={() => setShowReceiptDialog(false)} className="flex-1">
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
