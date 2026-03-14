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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import PrintReceipt from "./print-receipt"
import SalesCompletionDialog from "./sales-completion-dialog"
import CreatePrescriptionModal from "./create-prescription-modal"
import CreateCustomerModal from "./create-customer-modal"
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
  Users,
  Check,
  ChevronsUpDown,
  Phone,
  Mail,
  Trash2,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/hooks/use-toast"
import { useSystemSettingsMap } from "@/lib/hooks/use-system-settings"
import { Customer } from "@/lib/api/customers"
import { enqueueOfflineSale } from "@/lib/offline/offline-sales-queue"
import { useOfflineSalesSync } from "@/lib/hooks/use-offline-sales-sync"

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

export default function EnhancedNewSaleForm({ customers: initialCustomers, medicines, prescriptions: initialPrescriptions, currentUser }: NewSaleFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [customerId, setCustomerId] = useState("")
  const [prescriptionId, setPrescriptionId] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("cash")
  const [discountAmount, setDiscountAmount] = useState(0)
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartSearchQuery, setCartSearchQuery] = useState("")

  // Search and pagination states
  const [searchQuery, setSearchQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedCategory, setSelectedCategory] = useState("all")
  const itemsPerPage = 8

  const [customerSearchOpen, setCustomerSearchOpen] = useState(false)
  const [customerSearchQuery, setCustomerSearchQuery] = useState("")

  // State for customers and prescriptions (can be updated without reload)
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers)
  const [prescriptions, setPrescriptions] = useState<Prescription[]>(initialPrescriptions)

  // Dialog states
  const [showCustomerDialog, setShowCustomerDialog] = useState(false)
  const [showPrescriptionDialog, setShowPrescriptionDialog] = useState(false)
  const [showReceiptDialog, setShowReceiptDialog] = useState(false)
  const [showPrintReceipt, setShowPrintReceipt] = useState(false)
  const [showCompletionDialog, setShowCompletionDialog] = useState(false)
  const [lastSale, setLastSale] = useState<any>(null)
  const { pendingCount } = useOfflineSalesSync()

  const filteredCustomers = useMemo(() => {
    if (!customerSearchQuery) return customers
    return customers.filter((customer) => {
      const fullName = `${customer.first_name} ${customer.last_name}`.toLowerCase()
      const query = customerSearchQuery.toLowerCase()
      return (
        fullName.includes(query) || customer.phone?.includes(query) || customer.email?.toLowerCase().includes(query)
      )
    })
  }, [customers, customerSearchQuery])

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
  const categories = useMemo(() => [...new Set(medicines.map((m) => m.category).filter((c): c is string => Boolean(c)))].sort(), [medicines])

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

  const clearCart = () => {
    setCart([])
    setCartSearchQuery("")
    toast({
      title: "Cart Cleared",
      description: "All items have been removed from the cart",
    })
  }

  // Filter cart items based on search query
  const filteredCartItems = useMemo(() => {
    if (!cartSearchQuery.trim()) return cart
    const query = cartSearchQuery.toLowerCase()
    return cart.filter(
      (item) =>
        item.medicineName.toLowerCase().includes(query) ||
        item.strength?.toLowerCase().includes(query) ||
        item.form?.toLowerCase().includes(query)
    )
  }, [cart, cartSearchQuery])

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

  const handleCustomerCreated = async () => {
    // Refresh customers list
    const supabase = createClient()
    const { data: newCustomers } = await supabase
      .from("customers")
      .select("id, first_name, last_name, phone, email")
      .order("first_name")
    
    if (newCustomers) {
      setCustomers(newCustomers)
      // Select the newly created customer (last one)
      if (newCustomers.length > 0) {
        const newCustomer = newCustomers[newCustomers.length - 1]
        setCustomerId(newCustomer.id)
      }
    }
  }

  const subtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0)
  // Get tax rate from system settings
  const { data: settings } = useSystemSettingsMap()
  const taxRate = settings?.tax_rate || 0.08 // Default to 8% if not set
  // Calculation order: Tax = subtotal * taxRate, Total = subtotal + tax - discount
  const taxAmount = subtotal * taxRate
  const total = subtotal + taxAmount - discountAmount

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (cart.length === 0) {
      toast({
        title: "Error",
        description: "Please add items to cart",
        variant: "destructive",
      })
      return
    }
    // Show completion dialog instead of directly submitting
    setShowCompletionDialog(true)
  }

  const handleConfirmSale = async (confirmedPaymentMethod: string, confirmedDiscountAmount: number) => {
    setShowCompletionDialog(false)
    setLoading(true)

    try {
      // Update local state with confirmed values
      setPaymentMethod(confirmedPaymentMethod)
      setDiscountAmount(confirmedDiscountAmount)

      const supabase = createClient()
      const saleNumber = generateSaleNumber()

      // Recalculate totals with confirmed discount
      // Calculation order: Tax = subtotal * taxRate, Total = subtotal + tax - discount
      const confirmedSubtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0)
      const confirmedTaxAmount = confirmedSubtotal * taxRate
      const confirmedTotal = confirmedSubtotal + confirmedTaxAmount - confirmedDiscountAmount

      // Prepare payload for API (used for both online and offline)
      const apiPayload = {
        customer_id: customerId || undefined,
        payment_method: confirmedPaymentMethod as
          | "cash"
          | "card"
          | "insurance"
          | "fonepay"
          | "esewa"
          | "khalti"
          | "bank"
          | "mixed"
          | "other",
        discount_amount: confirmedDiscountAmount,
        tax_amount: confirmedTaxAmount,
        notes: undefined as string | undefined,
        items: cart.map((item) => ({
          medicine_id: item.medicineId,
          quantity: item.quantity,
          unit_price: item.unitPrice,
        })),
      }

      // Try server-side transactional sale creation via API
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(apiPayload),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.message || res.statusText || "Failed to create sale")
      }

      const { data: sale } = (await res.json()) as { data: any }

      // Set sale data for receipt
      setLastSale({
        ...sale,
        items: cart,
        customer: customerId ? customers.find((c) => c.id === customerId) : null,
        subtotal: confirmedSubtotal,
        taxAmount: confirmedTaxAmount,
        total: confirmedTotal,
        staffName: currentUser?.full_name || currentUser?.email || "Staff Member",
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

      setShowPrintReceipt(true)
    } catch (error) {
      console.error("Error processing sale:", error)

      // If network/HTTP fails, queue sale offline
      if (error instanceof TypeError || (error instanceof Error && /fetch|network/i.test(error.message))) {
        try {
          const confirmedSubtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0)
          const confirmedTaxAmount = confirmedSubtotal * taxRate

          const offlinePayload = {
            customer_id: customerId || undefined,
            payment_method: confirmedPaymentMethod as
              | "cash"
              | "card"
              | "insurance"
              | "fonepay"
              | "esewa"
              | "khalti"
              | "bank"
              | "mixed"
              | "other",
            discount_amount: confirmedDiscountAmount,
            tax_amount: confirmedTaxAmount,
            notes: undefined as string | undefined,
            items: cart.map((item) => ({
              medicine_id: item.medicineId,
              quantity: item.quantity,
              unit_price: item.unitPrice,
            })),
          }

          await enqueueOfflineSale(offlinePayload)

          // Clear cart and reset local state
          setCart([])
          setCustomerId("")
          setPrescriptionId("")
          setDiscountAmount(0)

          toast({
            title: "Sale queued offline",
            description: "We will sync this sale automatically when you are back online.",
          })
        } catch (queueError) {
          console.error("Failed to queue offline sale:", queueError)
          toast({
            title: "Error",
            description: "Failed to process sale and unable to queue offline.",
            variant: "destructive",
          })
        }
      } else {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to process sale. Please try again.",
          variant: "destructive",
        })
      }
    } finally {
      setLoading(false)
    }
  }

  const selectedCustomer = customers.find((c) => c.id === customerId)

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      {/* Product Selection - Takes 3 columns */}
      <div className="xl:col-span-3 space-y-6">
        {/* Customer & Prescription Selection - compact */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="py-2 px-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" />
              Customer & Prescription
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-3 pt-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Customer Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Customer</Label>
                  <CreateCustomerModal
                    isOpen={showCustomerDialog}
                    onClose={() => setShowCustomerDialog(false)}
                    onCreate={handleCustomerCreated}
                  />
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 text-xs"
                    onClick={() => setShowCustomerDialog(true)}
                  >
                    <UserPlus className="h-3 w-3 mr-1" />
                    New
                  </Button>
                </div>

                {selectedCustomer ? (
                  <div className="rounded-md border bg-muted/30 p-2 space-y-1">
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Users className="h-3 w-3 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-xs truncate">
                            {selectedCustomer.first_name} {selectedCustomer.last_name}
                          </p>
                          {selectedCustomer.phone && (
                            <p className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <Phone className="h-2.5 w-2.5" />
                              {selectedCustomer.phone}
                            </p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCustomerId("")}
                        className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                        title="Remove customer"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={customerSearchOpen}
                        className="w-full justify-between h-9 bg-background hover:bg-accent text-xs"
                      >
                        <div className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-muted-foreground text-xs">Select customer (optional)</span>
                        </div>
                        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                  <PopoverContent className="w-full p-0 max-h-48" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search customers..."
                        value={customerSearchQuery}
                        onValueChange={setCustomerSearchQuery}
                        className="h-8 text-xs"
                      />
                      <CommandEmpty>No customer found.</CommandEmpty>
                      <CommandGroup>
                        <CommandList className="max-h-40">
                          <CommandItem
                            value=""
                            onSelect={() => {
                              setCustomerId("")
                              setCustomerSearchOpen(false)
                            }}
                          >
                            <Check className={`mr-2 h-4 w-4 ${customerId === "" ? "opacity-100" : "opacity-0"}`} />
                            <span className="text-muted-foreground">No customer (Walk-in)</span>
                          </CommandItem>
                          {filteredCustomers.map((customer) => {
                            const searchValue = `${customer.first_name} ${customer.last_name} ${customer.phone || ""} ${customer.email || ""}`
                            return (
                              <CommandItem
                                key={customer.id}
                                value={searchValue}
                                onSelect={() => {
                                  setCustomerId(customer.id)
                                  setCustomerSearchOpen(false)
                                }}
                              >
                                <Check
                                  className={`mr-2 h-4 w-4 ${customerId === customer.id ? "opacity-100" : "opacity-0"}`}
                                />
                                <div className="flex flex-col flex-1 min-w-0">
                                  <span className="font-medium truncate">
                                    {customer.first_name} {customer.last_name}
                                  </span>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    {customer.phone && (
                                      <div className="flex items-center gap-1">
                                        <Phone className="h-3 w-3" />
                                        {customer.phone}
                                      </div>
                                    )}
                                    {customer.email && (
                                      <div className="flex items-center gap-1">
                                        <Mail className="h-3 w-3" />
                                        {customer.email}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </CommandItem>
                            )
                          })}
                        </CommandList>
                      </CommandGroup>
                    </Command>
                  </PopoverContent>
                </Popover>
                )}
              </div>

              {/* Prescription Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Prescription</Label>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 text-xs"
                    onClick={() => setShowPrescriptionDialog(true)}
                    disabled={!customerId}
                    title={!customerId ? "Please select a customer first" : "Create new prescription"}
                  >
                    <FileText className="h-3 w-3 mr-1" />
                    New
                  </Button>
                </div>
                {prescriptionId ? (
                  <div className="rounded-md border bg-muted/30 p-2 space-y-1">
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <FileText className="h-3 w-3 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          {(() => {
                            const selectedPrescription = prescriptions.find((p) => p.id === prescriptionId)
                            return selectedPrescription ? (
                              <>
                                <p className="font-medium text-xs truncate">
                                  {selectedPrescription.prescription_number}
                                </p>
                                {selectedPrescription.customers && (
                                  <p className="text-[10px] text-muted-foreground">
                                    {selectedPrescription.customers.first_name} {selectedPrescription.customers.last_name}
                                  </p>
                                )}
                              </>
                            ) : null
                          })()}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPrescriptionId("")}
                        className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                        title="Remove prescription"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Select
                    value={prescriptionId}
                    onValueChange={(value) => {
                      setPrescriptionId(value)
                    }}
                  >
                    <SelectTrigger className="h-9 bg-background hover:bg-accent text-xs">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <SelectValue placeholder="Select prescription (optional)" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {prescriptions.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          No prescriptions available
                        </div>
                      ) : (
                        prescriptions.map((prescription) => (
                          <SelectItem key={prescription.id} value={prescription.id}>
                            <div className="flex flex-col">
                              <span className="font-medium">{prescription.prescription_number}</span>
                              {prescription.customers && (
                                <span className="text-xs text-muted-foreground">
                                  {prescription.customers.first_name} {prescription.customers.last_name}
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Product Catalog - compact */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="py-2 px-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4 text-primary" />
              Product Catalog
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-3 pt-0">
            {/* Search and Filter Controls */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search medicines..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="pl-8 h-9 text-sm"
                />
              </div>
              <Select
                value={selectedCategory}
                onValueChange={(value) => {
                  setSelectedCategory(value)
                  setCurrentPage(1)
                }}
              >
                <SelectTrigger className="w-48 h-10">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent className="max-h-60 z-[100]">
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {paginatedMedicines.map((medicine) => (
                <Card
                  key={medicine.id}
                  className="group hover:shadow-md transition-all duration-200 border hover:border-primary/50"
                >
                  <CardContent className="p-3">
                    <div className="space-y-2">
                      <div>
                        <h3 className="font-semibold text-xs text-foreground line-clamp-2">{medicine.name}</h3>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {medicine.strength} • {medicine.form}
                        </p>
                        {medicine.generic_name && (
                          <p className="text-[10px] text-primary mt-0.5">Generic: {medicine.generic_name}</p>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-bold text-primary">
                            ${Number.parseFloat(medicine.unit_price).toFixed(2)}
                          </div>
                          <div className="flex items-center gap-1">
                            <Badge
                              variant={medicine.stock_quantity > 10 ? "default" : "destructive"}
                              className="text-[10px] px-1.5 py-0"
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
                <p className="text-sm text-muted-foreground">
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
                  <span className="text-sm px-3 py-1 bg-muted rounded">
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

      <div className="space-y-4 flex flex-col min-h-0">
        {/* Cart - larger */}
        <Card className="border-0 shadow-sm sticky top-4 flex flex-col min-h-[420px]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base mb-2">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-primary" />
                Shopping Cart
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-sm">
                  {cart.length} items
                </Badge>
                {cart.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearCart}
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                    title="Clear all items"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardTitle>
            {cart.length > 0 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search cart items..."
                  value={cartSearchQuery}
                  onChange={(e) => setCartSearchQuery(e.target.value)}
                  className="pl-10 h-9 text-sm"
                />
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {cart.length === 0 ? (
              <div className="text-center py-6">
                <ShoppingCart className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Your cart is empty</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Add products to get started</p>
              </div>
            ) : filteredCartItems.length === 0 ? (
              <div className="text-center py-6">
                <Search className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No items found</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Try a different search term</p>
              </div>
            ) : (
              <>
                <div className="max-h-96 overflow-y-auto border rounded-md flex-1 min-h-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px] text-xs">#</TableHead>
                        <TableHead className="text-xs">Medicine</TableHead>
                        <TableHead className="text-center text-xs">Qty</TableHead>
                        <TableHead className="text-right text-xs">Unit</TableHead>
                        <TableHead className="text-right text-xs">Total</TableHead>
                        <TableHead className="w-[40px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCartItems.map((item, index) => (
                        <TableRow key={item.medicineId}>
                          <TableCell className="text-muted-foreground text-sm py-2">{index + 1}</TableCell>
                          <TableCell className="py-2">
                            <div>
                              <div className="font-medium text-sm">{item.medicineName}</div>
                              <div className="text-xs text-muted-foreground">
                                {item.strength} • {item.form}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-2">
                            <Input
                              type="number"
                              min="1"
                              max={item.availableStock}
                              value={item.quantity}
                              onChange={(e) => updateCartQuantity(item.medicineId, Number.parseInt(e.target.value) || 1)}
                              className="w-14 h-8 text-center text-sm"
                            />
                          </TableCell>
                          <TableCell className="text-right text-sm py-2">${item.unitPrice.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-medium text-sm py-2">${item.totalPrice.toFixed(2)}</TableCell>
                          <TableCell className="py-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removeFromCart(item.medicineId)}
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <Separator />

                {/* Order Summary */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal:</span>
                    <span className="font-medium">${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax (8%):</span>
                    <span className="font-medium">${taxAmount.toFixed(2)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-sm text-primary">
                      <span>Discount:</span>
                      <span className="font-medium">-${discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total:</span>
                    <span className="text-primary">${total.toFixed(2)}</span>
                  </div>
                </div>

                {/* Pay Button */}
                <Button
                  onClick={handleSubmit}
                  disabled={loading || cart.length === 0}
                  className="w-full h-11 text-base font-semibold"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Receipt className="mr-2 h-4 w-4" />
                      Pay ${total.toFixed(2)}
                    </>
                  )}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sales Completion Dialog */}
      <SalesCompletionDialog
        isOpen={showCompletionDialog}
        onClose={() => setShowCompletionDialog(false)}
        onConfirm={handleConfirmSale}
        cart={cart}
        customer={selectedCustomer || null}
        subtotal={subtotal}
        taxAmount={taxAmount}
        discountAmount={discountAmount}
        total={total}
        paymentMethod={paymentMethod}
        isLoading={loading}
      />

      {/* Receipt Dialog */}
      <PrintReceipt isOpen={showPrintReceipt} onClose={() => setShowPrintReceipt(false)} saleData={lastSale} />

      {/* Prescription Dialog */}
      <CreatePrescriptionModal
        isOpen={showPrescriptionDialog}
        onClose={() => setShowPrescriptionDialog(false)}
        onSuccess={async () => {
          setShowPrescriptionDialog(false)
          // Refresh prescriptions list without reloading page
          const supabase = createClient()
          const { data: newPrescriptions } = await supabase
            .from("prescriptions")
            .select(`
              id,
              prescription_number,
              customers (first_name, last_name),
              prescription_items (
                id,
                quantity_prescribed,
                quantity_dispensed,
                medicines (id, name, strength, form, unit_price)
              )
            `)
            .order("created_at", { ascending: false })
          
          if (newPrescriptions) {
            setPrescriptions(newPrescriptions)
            // If customer is selected, auto-select the newly created prescription for that customer
            if (customerId && newPrescriptions.length > 0) {
              const newPrescription = newPrescriptions.find((p: any) => p.customers?.id === customerId || !p.customers)
              if (newPrescription) {
                setPrescriptionId(newPrescription.id)
              }
            }
          }
        }}
        selectedCustomerId={customerId || undefined}
      />
    </div>
  )
}
