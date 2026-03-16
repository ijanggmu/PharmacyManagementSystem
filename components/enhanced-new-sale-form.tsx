"use client"

import type React from "react"
import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MultiSelect } from "@/components/ui/multi-select"
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
import { CurrencyDisplay } from "@/components/currency-display"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
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
  category?: string | null
  categories?: { id: string; name: string } | null
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

function CartPanel({
  cart,
  filteredCartItems,
  cartSearchQuery,
  setCartSearchQuery,
  subtotal,
  taxAmount,
  taxRate,
  discountAmount,
  discountPercent,
  setDiscountPercent,
  total,
  paymentMethod,
  setPaymentMethod,
  loading,
  onRemove,
  onUpdateQty,
  onClear,
  onSubmit,
}: {
  cart: CartItem[]
  filteredCartItems: CartItem[]
  cartSearchQuery: string
  setCartSearchQuery: (q: string) => void
  subtotal: number
  taxAmount: number
  taxRate: number
  discountAmount: number
  discountPercent: number
  setDiscountPercent: (p: number) => void
  total: number
  paymentMethod: string
  setPaymentMethod: (m: string) => void
  loading: boolean
  onRemove: (id: string) => void
  onUpdateQty: (id: string, qty: number) => void
  onClear: () => void
  onSubmit: () => void
}) {
  return (
    <div className="flex flex-col rounded-lg border bg-card p-4 min-h-[420px]">
      <div className="flex items-center justify-between gap-2 border-b pb-3">
        <h2 id="cart-heading" className="flex items-center gap-2 text-lg font-semibold">
          <ShoppingCart className="h-5 w-5 text-primary" aria-hidden />
          Cart
        </h2>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{cart.length} item{cart.length !== 1 ? "s" : ""}</Badge>
          {cart.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-destructive hover:bg-destructive/10"
              onClick={onClear}
              aria-label="Clear all items from cart"
              title="Clear cart"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {cart.length > 0 && (
        <div className="mt-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              placeholder="Search cart..."
              value={cartSearchQuery}
              onChange={(e) => setCartSearchQuery(e.target.value)}
              className="h-10 pl-9 text-sm"
              aria-label="Search cart items"
            />
          </div>
        </div>
      )}

      <div className="mt-4 flex-1 min-h-0 flex flex-col gap-4">
        {cart.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
            <ShoppingCart className="h-12 w-12 text-muted-foreground/40" aria-hidden />
            <p className="mt-2 text-sm font-medium text-muted-foreground">Cart is empty</p>
            <p className="mt-1 text-xs text-muted-foreground">Add products from the catalog</p>
          </div>
        ) : filteredCartItems.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
            <Search className="h-10 w-10 text-muted-foreground/40" aria-hidden />
            <p className="mt-2 text-sm text-muted-foreground">No items match your search</p>
          </div>
        ) : (
          <>
            <div className="overflow-auto border rounded-md max-h-[220px] min-h-0">
              <Table>
                <TableHeader>
                  <TableRow className="sticky top-0 bg-muted/95 backdrop-blur">
                    <TableHead className="w-9 text-xs">#</TableHead>
                    <TableHead className="text-xs">Product</TableHead>
                    <TableHead className="text-center text-xs w-20">Qty</TableHead>
                    <TableHead className="text-right text-xs">Unit</TableHead>
                    <TableHead className="text-right text-xs">Total</TableHead>
                    <TableHead className="w-11" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCartItems.map((item, index) => (
                    <TableRow key={item.medicineId} className="hover:bg-muted/50">
                      <TableCell className="text-muted-foreground text-sm py-2">{index + 1}</TableCell>
                      <TableCell className="py-2">
                        <div>
                          <div className="font-medium text-sm">{item.medicineName}</div>
                          <div className="text-xs text-muted-foreground">{item.strength} • {item.form}</div>
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <Input
                          type="number"
                          min={1}
                          max={item.availableStock}
                          value={item.quantity}
                          onChange={(e) => onUpdateQty(item.medicineId, Number.parseInt(e.target.value, 10) || 1)}
                          className="h-9 w-16 text-center text-sm"
                          aria-label={`Quantity for ${item.medicineName}`}
                        />
                      </TableCell>
                      <TableCell className="text-right text-sm py-2">
                        <CurrencyDisplay amount={item.unitPrice} />
                      </TableCell>
                      <TableCell className="text-right font-medium text-sm py-2">
                        <CurrencyDisplay amount={item.totalPrice} />
                      </TableCell>
                      <TableCell className="py-2">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 text-destructive hover:bg-destructive/10"
                          onClick={() => onRemove(item.medicineId)}
                          aria-label={`Remove ${item.medicineName} from cart`}
                          title="Remove"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Payment & discount on main POS */}
            <div className="space-y-3 border-t pt-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-medium">Payment</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="h-10 mt-1 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="insurance">Insurance</SelectItem>
                      <SelectItem value="fonepay">Fonepay</SelectItem>
                      <SelectItem value="esewa">eSewa</SelectItem>
                      <SelectItem value="khalti">Khalti</SelectItem>
                      <SelectItem value="bank">Bank</SelectItem>
                      <SelectItem value="mixed">Mixed</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium">Discount %</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={discountPercent === 0 ? "" : discountPercent}
                    onChange={(e) => setDiscountPercent(Number.parseFloat(e.target.value) || 0)}
                    className="h-10 mt-1 text-sm"
                    placeholder="0"
                    aria-label="Discount percentage"
                  />
                </div>
              </div>
            </div>

            {/* Totals */}
            <div className="space-y-1.5 border-t pt-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium"><CurrencyDisplay amount={subtotal} /></span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax ({(taxRate * 100).toFixed(0)}%)</span>
                <span className="font-medium"><CurrencyDisplay amount={taxAmount} /></span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-sm text-primary">
                  <span>Discount</span>
                  <span className="font-medium">-<CurrencyDisplay amount={discountAmount} /></span>
                </div>
              )}
              <Separator className="my-2" />
              <div className="flex justify-between items-baseline">
                <span className="text-base font-semibold">Total</span>
                <span className="text-xl font-bold text-primary">
                  <CurrencyDisplay amount={total} />
                </span>
              </div>
            </div>

            <Button
              type="button"
              size="lg"
              className="w-full h-12 text-base font-semibold"
              onClick={onSubmit}
              disabled={loading || cart.length === 0}
              title={cart.length === 0 ? "Add items to cart" : undefined}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Processing…
                </>
              ) : (
                <>
                  <Receipt className="mr-2 h-4 w-4" aria-hidden />
                  Review & pay <CurrencyDisplay amount={total} />
                </>
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  )
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
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
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
  const [cartSheetOpen, setCartSheetOpen] = useState(false)
  const [addedToCartAnnouncement, setAddedToCartAnnouncement] = useState("")
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

  // Derive category list from medicines (categories relation)
  const categoryList = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>()
    medicines.forEach((m) => {
      const cat = m.categories
      if (cat?.id && cat?.name && !seen.has(cat.id)) seen.set(cat.id, { id: cat.id, name: cat.name })
    })
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [medicines])

  // Filter and paginate medicines (support multiple categories)
  const filteredMedicines = useMemo(() => {
    return medicines.filter((medicine) => {
      const matchesSearch =
        medicine.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (medicine.generic_name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
      const categoryId = medicine.categories?.id ?? null
      const matchesCategory =
        selectedCategoryIds.length === 0 ||
        (categoryId && selectedCategoryIds.includes(categoryId))
      return matchesSearch && matchesCategory && medicine.stock_quantity > 0
    })
  }, [medicines, searchQuery, selectedCategoryIds])

  const paginatedMedicines = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filteredMedicines.slice(startIndex, startIndex + itemsPerPage)
  }, [filteredMedicines, currentPage])

  const totalPages = Math.ceil(filteredMedicines.length / itemsPerPage)

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

    setAddedToCartAnnouncement(`${quantity} × ${medicine.name} added to cart`)
    setTimeout(() => setAddedToCartAnnouncement(""), 2000)
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
      setCartSheetOpen(false)

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

          setCart([])
          setCustomerId("")
          setPrescriptionId("")
          setDiscountAmount(0)
          setCartSheetOpen(false)

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
  const discountPercent = subtotal > 0 ? (discountAmount / subtotal) * 100 : 0
  const setDiscountPercent = (pct: number) => setDiscountAmount((subtotal * Math.max(0, Math.min(100, pct))) / 100)

  return (
    <>
      {/* Screen reader announcement when item added to cart */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {addedToCartAnnouncement}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px]">
        {/* Left: Customer, Prescription, Catalog */}
        <div className="flex min-w-0 flex-col gap-6">
          {/* Customer & Prescription - single section */}
          <section className="rounded-lg border bg-card p-4" aria-labelledby="customer-prescription-heading">
            <h2 id="customer-prescription-heading" className="sr-only">
              Customer and prescription
            </h2>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Customer (optional) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="customer-select" className="text-sm font-medium">
                    Customer (optional)
                  </Label>
                  <CreateCustomerModal
                    isOpen={showCustomerDialog}
                    onClose={() => setShowCustomerDialog(false)}
                    onCreate={handleCustomerCreated}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 min-w-[44px] text-sm"
                    onClick={() => setShowCustomerDialog(true)}
                    aria-label="Add new customer"
                  >
                    <UserPlus className="h-4 w-4 mr-1.5" />
                    New customer
                  </Button>
                </div>

                {selectedCustomer ? (
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <Users className="h-4 w-4 text-primary" aria-hidden />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">
                            {selectedCustomer.first_name} {selectedCustomer.last_name}
                          </p>
                          {selectedCustomer.phone && (
                            <p className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Phone className="h-3 w-3 shrink-0" aria-hidden />
                              {selectedCustomer.phone}
                            </p>
                          )}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setCustomerId("")}
                        aria-label="Remove customer"
                        title="Remove customer"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="customer-select"
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={customerSearchOpen}
                        aria-label="Select customer (optional). Walk-in sale if none selected."
                        title="Select customer to link this sale"
                        className="h-11 w-full justify-between bg-background text-sm"
                      >
                        <span className="text-muted-foreground">Walk-in sale</span>
                        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
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

              {/* Prescription (optional) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="prescription-select" className="text-sm font-medium">
                    Prescription (optional)
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 min-w-[44px] text-sm"
                    onClick={() => setShowPrescriptionDialog(true)}
                    disabled={!customerId}
                    title={!customerId ? "Select a customer first to add a prescription" : "Create new prescription"}
                    aria-label={!customerId ? "Select a customer first to add a prescription" : "New prescription"}
                  >
                    <FileText className="h-4 w-4 mr-1.5" aria-hidden />
                    New prescription
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
                    onValueChange={(value) => setPrescriptionId(value)}
                  >
                    <SelectTrigger id="prescription-select" className="h-11 bg-background text-sm" title="Select a prescription to dispense from">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
                        <SelectValue placeholder="No prescription" />
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
          </section>

          {/* Product Catalog */}
          <section className="rounded-lg border bg-card p-4" aria-labelledby="catalog-heading">
            <h2 id="catalog-heading" className="sr-only">
              Product catalog
            </h2>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  type="search"
                  placeholder="Search medicines..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="h-11 pl-10 text-sm"
                  aria-label="Search products"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Categories:</span>
                <MultiSelect
                  options={categoryList.map((c) => ({ value: c.id, label: c.name }))}
                  value={selectedCategoryIds}
                  onValueChange={(v) => {
                    setSelectedCategoryIds(v)
                    setCurrentPage(1)
                  }}
                  placeholder="All"
                  className="h-11 min-w-[140px]"
                  allLabel="All"
                  showAllOption={true}
                />
              </div>
            </div>

            {filteredMedicines.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
                <Package className="h-12 w-12 text-muted-foreground/50" aria-hidden />
                <p className="mt-2 text-sm font-medium text-muted-foreground">No products match your search or filters</p>
                <p className="mt-1 text-xs text-muted-foreground">Try a different search term or clear the category filter</p>
              </div>
            ) : (
              <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {paginatedMedicines.map((medicine) => (
                <article
                  key={medicine.id}
                  className="group flex min-h-[120px] flex-col justify-between rounded-lg border bg-background p-4 transition hover:border-primary/30 hover:shadow-sm"
                >
                  <div className="space-y-1">
                    <h3 className="font-medium text-sm leading-snug text-foreground line-clamp-2">{medicine.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {medicine.strength} • {medicine.form}
                    </p>
                    {medicine.generic_name && (
                      <p className="text-xs text-primary">Generic: {medicine.generic_name}</p>
                    )}
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-primary">
                        <CurrencyDisplay amount={Number.parseFloat(medicine.unit_price)} />
                      </p>
                      <Badge
                        variant={medicine.stock_quantity > 10 ? "secondary" : "destructive"}
                        className="mt-1 text-xs"
                      >
                        Stock: {medicine.stock_quantity}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-11 min-w-[44px] px-2"
                        onClick={() => addToCart(medicine, 1)}
                        disabled={medicine.stock_quantity === 0}
                        aria-label={`Add 1 ${medicine.name} to cart`}
                        title="Add 1"
                      >
                        +1
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-11 min-w-[44px] px-2"
                        onClick={() => addToCart(medicine, 5)}
                        disabled={medicine.stock_quantity < 5}
                        aria-label={`Add 5 ${medicine.name} to cart`}
                        title="Add 5"
                      >
                        +5
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-11 min-w-[44px] px-2"
                        onClick={() => addToCart(medicine, 1)}
                        disabled={medicine.stock_quantity === 0}
                        aria-label={`Add ${medicine.name} to cart`}
                        title="Add to cart"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
                <p className="text-sm text-muted-foreground">
                  Showing {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, filteredMedicines.length)} of {filteredMedicines.length}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 min-w-[44px]"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="min-w-[4rem] text-center text-sm text-muted-foreground">
                    {currentPage} of {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 min-w-[44px]"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
              </div>
            )}
          </section>
        </div>

        {/* Right: Cart sidebar (desktop) / content for sheet (mobile) */}
        <aside
          className="hidden lg:block lg:sticky lg:top-4 lg:self-start"
          aria-labelledby="cart-heading"
        >
          <CartPanel
            cart={cart}
            filteredCartItems={filteredCartItems}
            cartSearchQuery={cartSearchQuery}
            setCartSearchQuery={setCartSearchQuery}
            subtotal={subtotal}
            taxAmount={taxAmount}
            taxRate={taxRate}
            discountAmount={discountAmount}
            discountPercent={discountPercent}
            setDiscountPercent={setDiscountPercent}
            total={total}
            paymentMethod={paymentMethod}
            setPaymentMethod={setPaymentMethod}
            loading={loading}
            onRemove={removeFromCart}
            onUpdateQty={updateCartQuantity}
            onClear={clearCart}
            onSubmit={() => handleSubmit({ preventDefault: () => {} } as React.FormEvent)}
          />
        </aside>
      </div>

      {/* Mobile: Sticky bottom bar + Sheet */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setCartSheetOpen(true)}
          className="sticky bottom-0 z-40 flex w-full items-center justify-between gap-3 border-t bg-background px-4 py-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]"
          aria-label="Open cart"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <ShoppingCart className="h-5 w-5" aria-hidden />
            {cart.length} item{cart.length !== 1 ? "s" : ""}
          </span>
          <span className="text-lg font-bold text-primary">
            <CurrencyDisplay amount={total} />
          </span>
          <span className="text-sm font-semibold">Review & pay</span>
        </button>
        <Sheet open={cartSheetOpen} onOpenChange={setCartSheetOpen}>
          <SheetContent side="bottom" className="flex h-[85vh] flex-col overflow-hidden">
            <SheetHeader>
              <SheetTitle>Cart</SheetTitle>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <CartPanel
                cart={cart}
                filteredCartItems={filteredCartItems}
                cartSearchQuery={cartSearchQuery}
                setCartSearchQuery={setCartSearchQuery}
                subtotal={subtotal}
                taxAmount={taxAmount}
                taxRate={taxRate}
                discountAmount={discountAmount}
                discountPercent={discountPercent}
                setDiscountPercent={setDiscountPercent}
                total={total}
                paymentMethod={paymentMethod}
                setPaymentMethod={setPaymentMethod}
                loading={loading}
                onRemove={removeFromCart}
                onUpdateQty={updateCartQuantity}
                onClear={clearCart}
                onSubmit={() => handleSubmit({ preventDefault: () => {} } as React.FormEvent)}
              />
            </div>
          </SheetContent>
        </Sheet>
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
    </>
  )
}
