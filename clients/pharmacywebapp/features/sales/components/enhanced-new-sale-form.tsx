"use client"

import type React from "react"
import { useState, useMemo, useRef, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { type CreateSaleData } from "@/features/sales/api-client"
import { checkoutFingerprint, createCheckoutKeyTracker, getSaleOnDotnet, postSaleOnDotnet } from "@/lib/api/sales-api"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useDebounce } from "@/lib/utils/performance"
import { invalidateMoneyMovementQueries } from "@/lib/hooks/money-movement-queries"
import { isTotalMismatchError, posCustomerSearchFilters, posCustomerSearchQueryKey } from "@/features/sales/lib/pos-data"
import { parseSafetyWarning, type SafetyWarningInfo } from "@/features/sales/lib/safety-warning"
import { isAmbiguousCreateFailure } from "@/lib/offline/offline-sale-retry"
import OfflineSalesIndicator from "./offline-sales-indicator"
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
import CreatePrescriptionModal from "@/features/prescriptions/components/create-prescription-modal"
import CreateCustomerModal from "@/features/customers/components/create-customer-modal"
import { CurrencyDisplay } from "@/components/currency-display"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
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
  AlertTriangle,
  Percent,
  ScanLine,
  Sparkles,
} from "lucide-react"
import { CreditMeter } from "@/features/customers/components/credit-meter"
import { useToast } from "@/hooks/use-toast"
import { EmptyState } from "@/components/ui/empty-state"
import { useVatRate } from "@/features/settings/hooks/use-vat-rate"
import { computeInclusiveVat } from "@/features/sales/lib/vat"
import { posLineTotal, posSubtotal, posTotal, posUnitPrice } from "@/features/sales/lib/pos-pricing"
import { Customer } from "@/features/customers/api-client"
import { enqueueOfflineSale } from "@/lib/offline/offline-sales-queue"
import { customersApi } from "@/features/customers/api-client"
import { prescriptionsApi } from "@/features/prescriptions/api-client"
import CartPanel from "./cart-panel"
import { formatBatchExpiry } from "@/lib/inventory/fefo"
import { CartItem, Medicine, NewSaleFormProps, PaymentLeg, Prescription } from "@/features/sales/types"

interface ConfirmSaleOptions {
  overrideCreditLimit?: boolean
  redeemLoyaltyPoints?: number
  acknowledgeSafetyWarnings?: boolean
}

export default function EnhancedNewSaleForm({ customers: initialCustomers, medicines, prescriptions: initialPrescriptions, currentUser }: NewSaleFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [customerId, setCustomerId] = useState("")
  const [prescriptionId, setPrescriptionId] = useState("")
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
  // The page reloads prescriptions (React Query) after every sale; keep this list in step with it.
  useEffect(() => {
    setPrescriptions(initialPrescriptions)
  }, [initialPrescriptions])

  // Dialog states
  const [showCustomerDialog, setShowCustomerDialog] = useState(false)
  const [showPrescriptionDialog, setShowPrescriptionDialog] = useState(false)
  const [showReceiptDialog, setShowReceiptDialog] = useState(false)
  const [showPrintReceipt, setShowPrintReceipt] = useState(false)
  const [showCompletionDialog, setShowCompletionDialog] = useState(false)
  /** Set from a 409 SafetyWarning; `pending` is the exact checkout to resubmit once acknowledged. */
  const [safetyWarning, setSafetyWarning] = useState<
    | (SafetyWarningInfo & {
        pending: { payments: PaymentLeg[]; discountAmount: number; notes?: string; options?: ConfirmSaleOptions }
      })
    | null
  >(null)
  const queryClient = useQueryClient()
  const [lastSale, setLastSale] = useState<any>(null)
  /** One Idempotency-Key per checkout attempt on the .NET path; a retry of the same cart reuses it. */
  const checkoutKeys = useRef(createCheckoutKeyTracker())
  const [cartSheetOpen, setCartSheetOpen] = useState(false)
  const [addedToCartAnnouncement, setAddedToCartAnnouncement] = useState("")

  // Customer search runs on the server (debounced), over ACTIVE customers only — no preloaded list that
  // the 200-row page cap would silently truncate, and no inactive customer to pick by mistake.
  const debouncedCustomerQuery = useDebounce(customerSearchQuery.trim(), 300)
  const customerSearch = useQuery({
    queryKey: posCustomerSearchQueryKey(debouncedCustomerQuery),
    enabled: customerSearchOpen,
    queryFn: async () => {
      const result = await customersApi.getCustomers(posCustomerSearchFilters(debouncedCustomerQuery))
      if (result.error) throw new Error(result.error)
      return result.data
    },
    staleTime: 30_000,
  })
  const filteredCustomers: Customer[] = customerSearch.data ?? []

  /** Card number typed or scanned (a scanner types the QR's text and presses Enter). */
  const [cardCode, setCardCode] = useState("")
  const [cardLookup, setCardLookup] = useState<"idle" | "loading" | "missing">("idle")

  /** Puts a fresh copy of the customer in the list, so the credit panel shows today's balance. */
  const upsertCustomer = useCallback((customer: Customer) => {
    setCustomers((prev) => (prev.some((c) => c.id === customer.id) ? prev.map((c) => (c.id === customer.id ? customer : c)) : [customer, ...prev]))
  }, [])

  const selectCustomerByCode = useCallback(
    async (raw: string) => {
      const code = raw.replace(/\s+/g, "").toUpperCase()
      if (!code) return false
      const local = customers.find((c) => c.code?.toUpperCase() === code)
      if (local) {
        setCustomerId(local.id)
        setCardCode("")
        setCardLookup("idle")
        return true
      }
      setCardLookup("loading")
      const { data } = await customersApi.getCustomerByCode(code)
      if (!data) {
        setCardLookup("missing")
        return false
      }
      upsertCustomer(data)
      setCustomerId(data.id)
      setCardCode("")
      setCardLookup("idle")
      return true
    },
    [customers, upsertCustomer],
  )

  // The list was loaded with the page; refresh the chosen customer so balance and limit are current.
  useEffect(() => {
    if (!customerId) return
    let cancelled = false
    void customersApi.getCustomer(customerId).then(({ data }) => {
      if (!cancelled && data) upsertCustomer(data)
    })
    return () => {
      cancelled = true
    }
  }, [customerId, upsertCustomer])

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
                totalPrice: posLineTotal(item.quantity + quantity, item.unitPrice, item.discountPercent),
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
        // Same source the server prices from: first FEFO lot's selling price, else the catalog price.
        unitPrice: posUnitPrice(medicine),
        totalPrice: posLineTotal(quantity, posUnitPrice(medicine)),
        availableStock: medicine.stock_quantity,
        discountPercent: 0,
        isTaxable: medicine.is_taxable !== false,
        fefoPicks: medicine.fefo_picks ?? [],
        batchTracked: (medicine.batch_count ?? 0) > 0 || (medicine.fefo_picks?.length ?? 0) > 0,
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
            totalPrice: posLineTotal(newQuantity, item.unitPrice, item.discountPercent),
          }
        }
        return item
      }),
    )
  }

  const updateCartDiscount = (medicineId: string, discountPercent: number) => {
    setCart((prev) =>
      prev.map((item) =>
        item.medicineId === medicineId
          ? {
              ...item,
              discountPercent,
              totalPrice: posLineTotal(item.quantity, item.unitPrice, discountPercent),
            }
          : item,
      ),
    )
  }

  const handleCustomerCreated = async () => {
    const { data: refreshed, error } = await customersApi.getCustomers({
      limit: 200,
      includeRelations: true,
      sortBy: "created_at",
      sortOrder: "desc",
    })
    if (!error && refreshed.length) {
      setCustomers(refreshed)
      setCustomerId(refreshed[0].id)
    }
  }

  const subtotal = posSubtotal(cart)
  // The pharmacy's VAT rate (percent) from the .NET settings: the same rate the server applies to the
  // sale and prints on the invoice. Prices are VAT-inclusive, so VAT is carved out of the taxable
  // lines (after the order discount) — see features/sales/lib/vat.ts — and never added to the total.
  const { data: vatRatePercent = 0 } = useVatRate()
  const taxAmount = computeInclusiveVat(cart, vatRatePercent, discountAmount)
  const total = posTotal(subtotal, discountAmount)

  // Cart items whose medicine is prescription_required — matched back to `medicines`
  // since CartItem itself doesn't carry the flag.
  const cartItemsRequiringRx = useMemo(() => {
    return cart.filter((item) => medicines.find((m) => m.id === item.medicineId)?.prescription_required)
  }, [cart, medicines])

  const selectedPrescription = prescriptions.find((p) => p.id === prescriptionId)

  const missingRxCoverage = useMemo(() => {
    if (cartItemsRequiringRx.length === 0) return []
    if (!selectedPrescription) return cartItemsRequiringRx
    return cartItemsRequiringRx.filter(
      (item) => !selectedPrescription.prescription_items.some((pi) => (pi.medicines?.id ?? pi.medicine_id) === item.medicineId)
    )
  }, [cartItemsRequiringRx, selectedPrescription])

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
    if (cartItemsRequiringRx.length > 0 && !prescriptionId) {
      toast({
        title: "Prescription required",
        description: `${cartItemsRequiringRx.map((i) => i.medicineName).join(", ")} require a prescription. Select or create one before checking out.`,
        variant: "destructive",
      })
      return
    }
    if (missingRxCoverage.length > 0) {
      toast({
        title: "Prescription doesn't cover these items",
        description: `${missingRxCoverage.map((i) => i.medicineName).join(", ")} are not on the selected prescription.`,
        variant: "destructive",
      })
      return
    }
    // Hand over from the mobile cart sheet to the Review & pay panel (never two sheets stacked).
    setCartSheetOpen(false)
    setShowCompletionDialog(true)
  }

  /** Clears the cart and selections after a sale is recorded (or safely queued). */
  const resetCheckout = () => {
    setCart([])
    setCustomerId("")
    setPrescriptionId("")
    setDiscountAmount(0)
    setCartSheetOpen(false)
  }

  const handleConfirmSale = async (
    confirmedPayments: PaymentLeg[],
    confirmedDiscountAmount: number,
    confirmedNotes?: string,
    options?: ConfirmSaleOptions
  ) => {
    const acknowledgeSafetyWarnings = options?.acknowledgeSafetyWarnings === true
    if (confirmedPayments.some((p) => p.method === "credit") && !customerId) {
      toast({
        title: "Customer required",
        description: "Select a customer before recording a credit (accounts receivable) sale.",
        variant: "destructive",
      })
      return
    }
    if (!acknowledgeSafetyWarnings) {
      setShowCompletionDialog(false)
    }
    setLoading(true)

    setDiscountAmount(confirmedDiscountAmount)
    const saleNumber = generateSaleNumber()

    // Same arithmetic as the server (features/sales/lib/pos-pricing.ts, vat.ts).
    const confirmedSubtotal = posSubtotal(cart)
    const confirmedTaxAmount = computeInclusiveVat(cart, vatRatePercent, confirmedDiscountAmount)
    const confirmedTotal = posTotal(confirmedSubtotal, confirmedDiscountAmount)

    // .NET path: the server prices every line, so only ids, quantities, discounts and tender legs are sent.
    const checkoutData: CreateSaleData = {
      sale_number: saleNumber,
      customer_id: customerId || "",
      prescription_id: prescriptionId || null,
      total_amount: confirmedTotal.toFixed(2),
      discount_amount: confirmedDiscountAmount.toFixed(2),
      tax_amount: confirmedTaxAmount.toFixed(2),
      // Change is never a payment: only the applied amount and the leg's reference go to the server.
      payments: confirmedPayments.map((leg) => ({
        method: leg.method,
        amount: Math.round(leg.amount * 100) / 100,
        reference: leg.reference?.trim() || null,
      })),
      payment_status: "paid",
      sale_date: new Date().toISOString(),
      notes: confirmedNotes?.trim() || undefined,
      override_credit_limit: options?.overrideCreditLimit === true,
      redeem_loyalty_points: options?.redeemLoyaltyPoints ?? 0,
      acknowledge_warnings: acknowledgeSafetyWarnings,
      sale_items: cart.map((item) => ({
        medicine_id: item.medicineId,
        quantity: item.quantity,
        unit_price: item.unitPrice.toFixed(2),
        total_price: item.totalPrice.toFixed(2),
        discount_percent: item.discountPercent,
      })),
    }
    const idempotencyKey = checkoutKeys.current.keyFor(checkoutFingerprint(checkoutData))

    let saleId: string
    try {
      saleId = await postSaleOnDotnet(checkoutData, idempotencyKey)
    } catch (error) {
      setLoading(false)

      // Drug interaction / allergy: show the warnings; the cashier may resubmit with the acknowledgement.
      const safety = parseSafetyWarning(error)
      if (safety) {
        setSafetyWarning({
          ...safety,
          pending: { payments: confirmedPayments, discountAmount: confirmedDiscountAmount, notes: confirmedNotes, options },
        })
        return
      }

      // No response / timeout / 5xx: the server may or may not have recorded it. Queue the exact body under
      // the SAME key, so the sync either replays the recorded sale or records it once.
      if (isAmbiguousCreateFailure(error)) {
        try {
          await enqueueOfflineSale({ ...checkoutData, idempotency_key: idempotencyKey }, idempotencyKey)
          checkoutKeys.current.reset()
          resetCheckout()
          // The request may have been recorded after all; reload stock, prescriptions and balances.
          invalidateMoneyMovementQueries(queryClient)
          void queryClient.invalidateQueries({ queryKey: ["prescriptions"] })
          toast({
            title: "Sale queued offline",
            description: "We couldn't confirm it with the server. It will sync automatically - see the offline sales badge.",
          })
        } catch (queueError) {
          console.error("Failed to queue offline sale:", queueError)
          toast({
            title: "Error",
            description: "Failed to process sale and unable to queue offline. Retry with the same cart.",
            variant: "destructive",
          })
        }
        return
      }

      // The server prices from the current FEFO lot and stock: a total/stock refusal means this screen is
      // stale, so reload the catalog before the cashier tries again.
      const stale = isTotalMismatchError(error)
      if (stale) void queryClient.invalidateQueries({ queryKey: ["medicines"] })
      toast({
        title: "Sale not recorded",
        description: `${error instanceof Error ? error.message : "Failed to process sale. Please try again."}${
          stale ? " Prices and stock have been refreshed — check the cart and try again." : ""
        }`,
        variant: "destructive",
      })
      return
    }

    // The sale is recorded: the next checkout must start with a fresh key, and stock/sales views are stale.
    checkoutKeys.current.reset()
    // Sales, stock, the customer's balance, the cash drawer summary and the prescriptions it dispensed.
    invalidateMoneyMovementQueries(queryClient)
    void queryClient.invalidateQueries({ queryKey: ["prescriptions"] })

    // Read-back is best effort: a failure here must not re-queue (or re-submit) a sale that exists.
    let sale: Record<string, unknown> = { id: saleId }
    try {
      sale = (await getSaleOnDotnet(saleId)) as unknown as Record<string, unknown>
    } catch (readError) {
      console.warn("Sale recorded but could not be read back:", readError)
    }

    setLastSale({
      ...sale,
      items: cart,
      customer: customerId ? customers.find((c) => c.id === customerId) : null,
      subtotal: confirmedSubtotal,
      taxAmount: confirmedTaxAmount,
      total: confirmedTotal,
      staffName: currentUser?.full_name || currentUser?.email || "Staff Member",
      // The .NET sale DTO returns one aggregate payment row; show the legs the cashier took instead.
      sale_payments: confirmedPayments.map((leg) => ({
        payment_method: leg.method,
        amount: leg.amount.toFixed(2),
        reference: leg.reference ?? null,
      })),
      amount_tendered: confirmedPayments.reduce((sum, leg) => sum + (leg.tendered ?? leg.amount), 0),
      change_due: confirmedPayments.reduce(
        (sum, leg) => sum + (leg.tendered !== undefined ? Math.max(0, leg.tendered - leg.amount) : 0),
        0,
      ),
    })

    resetCheckout()
    setLoading(false)
    toast({
      title: "Success",
      description: `Sale ${saleNumber} completed successfully`,
    })
    setShowPrintReceipt(true)
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px]">
        {/* Left: Customer, Prescription, Catalog */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* Customer & Prescription - single section */}
          <section className="rounded-xl border bg-card p-3 shadow-xs sm:p-4" aria-labelledby="customer-prescription-heading">
            <h2 id="customer-prescription-heading" className="sr-only">
              Customer and prescription
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              {/* Customer (optional) */}
              <div className="min-w-0 space-y-1.5">
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
                    <UserPlus className="h-4 w-4 mr-1.5" aria-hidden />
                    New customer
                  </Button>
                </div>

                {selectedCustomer ? (
                  <div className="rounded-lg border bg-muted/30 px-2.5 py-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <Users className="h-4 w-4 text-primary" aria-hidden />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">
                            {selectedCustomer.first_name} {selectedCustomer.last_name}
                          </p>
                          <p className="flex items-center gap-2 text-xs text-muted-foreground">
                            {selectedCustomer.code && (
                              <span className="font-mono font-medium tracking-wide text-primary">{selectedCustomer.code}</span>
                            )}
                            {selectedCustomer.is_member && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-300">
                                <Sparkles className="h-3 w-3" aria-hidden />
                                <span className="num">{(selectedCustomer.loyalty_points ?? 0).toLocaleString()}</span> pts
                              </span>
                            )}
                            {selectedCustomer.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3 shrink-0" aria-hidden />
                                {selectedCustomer.phone}
                              </span>
                            )}
                          </p>
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
                        <X className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                    {((selectedCustomer.current_balance ?? 0) !== 0 || selectedCustomer.credit_limit != null) && (
                      <div className="mt-1.5 border-t pt-1.5">
                        <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Owes on account</p>
                        <CreditMeter compact balance={selectedCustomer.current_balance ?? 0} creditLimit={selectedCustomer.credit_limit} />
                      </div>
                    )}
                  </div>
                ) : (
                  <>
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
                        <span className="text-muted-foreground">Walk-in sale — choose a customer</span>
                        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
                      </Button>
                    </PopoverTrigger>
                  <PopoverContent className="w-full p-0 max-h-48" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Search customers..."
                        value={customerSearchQuery}
                        onValueChange={setCustomerSearchQuery}
                        className="h-8 text-xs"
                      />
                      <CommandEmpty>
                        {customerSearch.isFetching ? "Searching…" : customerSearch.isError ? "Couldn't search customers." : "No active customer found."}
                      </CommandEmpty>
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
                            const searchValue = `${customer.first_name} ${customer.last_name} ${customer.phone || ""} ${customer.email || ""} ${customer.code || ""}`
                            return (
                              <CommandItem
                                key={customer.id}
                                value={searchValue}
                                onSelect={() => {
                                  upsertCustomer(customer)
                                  setCustomerId(customer.id)
                                  setCustomerSearchOpen(false)
                                }}
                              >
                                <Check
                                  className={`mr-2 h-4 w-4 ${customerId === customer.id ? "opacity-100" : "opacity-0"}`}
                                />
                                <div className="flex flex-col flex-1 min-w-0">
                                  <span className="flex min-w-0 items-center gap-2">
                                    <span className="font-medium truncate">
                                      {customer.first_name} {customer.last_name}
                                    </span>
                                    {customer.code && (
                                      <span className="shrink-0 font-mono text-[11px] font-medium text-primary">{customer.code}</span>
                                    )}
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
                  <form
                    className="relative"
                    onSubmit={(e) => {
                      e.preventDefault()
                      void selectCustomerByCode(cardCode)
                    }}
                  >
                    <Label htmlFor="customer-card-code" className="sr-only">
                      Customer number or card scan
                    </Label>
                    <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                      id="customer-card-code"
                      value={cardCode}
                      onChange={(e) => {
                        setCardCode(e.target.value)
                        if (cardLookup === "missing") setCardLookup("idle")
                      }}
                      placeholder="Scan card or type customer no. (C-000123)"
                      autoComplete="off"
                      spellCheck={false}
                      className="h-10 pl-9 pr-9 font-mono text-sm"
                      aria-invalid={cardLookup === "missing" || undefined}
                      aria-describedby={cardLookup === "missing" ? "customer-card-code-error" : undefined}
                    />
                    {cardLookup === "loading" && (
                      <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />
                    )}
                    {cardLookup === "missing" && (
                      <p id="customer-card-code-error" className="mt-1 text-xs text-destructive" role="alert">
                        No customer has that number.
                      </p>
                    )}
                  </form>
                  </>
                )}
              </div>

              {/* Prescription (optional) */}
              <div className="min-w-0 space-y-1.5">
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
                  <div className="rounded-lg border bg-muted/30 px-2.5 py-1.5">
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <FileText className="h-4 w-4 text-primary" aria-hidden />
                        </div>
                        <div className="flex-1 min-w-0">
                          {(() => {
                            const selectedPrescription = prescriptions.find((p) => p.id === prescriptionId)
                            return selectedPrescription ? (
                              <>
                                <p className="num truncate text-sm font-medium">
                                  {selectedPrescription.prescription_number}
                                </p>
                                {selectedPrescription.customers && (
                                  <p className="truncate text-xs text-muted-foreground">
                                    {selectedPrescription.customers.first_name} {selectedPrescription.customers.last_name}
                                  </p>
                                )}
                              </>
                            ) : null
                          })()}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setPrescriptionId("")}
                        className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                        title="Remove prescription"
                        aria-label="Remove prescription"
                      >
                        <X className="h-4 w-4" aria-hidden />
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
                          No pending prescriptions. Use New prescription to add one.
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
          <section className="rounded-xl border bg-card p-3 shadow-xs sm:p-4" aria-labelledby="catalog-heading">
            <div className="mb-2.5 flex items-baseline justify-between gap-2">
              <h2 id="catalog-heading" className="font-display text-base font-semibold">
                Add medicines
              </h2>
              <div className="flex items-center gap-2">
                <OfflineSalesIndicator />
                <p className="num text-xs text-muted-foreground">
                  {filteredMedicines.length} in stock{searchQuery || selectedCategoryIds.length > 0 ? " matching" : ""}
                </p>
              </div>
            </div>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  type="search"
                  placeholder="Search by medicine or generic name…"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="h-12 pl-11 text-base shadow-xs"
                  aria-label="Search medicines by name or generic name"
                  autoComplete="off"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="sr-only">Category</span>
                <MultiSelect
                  options={categoryList.map((c) => ({ value: c.id, label: c.name }))}
                  value={selectedCategoryIds}
                  onValueChange={(v) => {
                    setSelectedCategoryIds(v)
                    setCurrentPage(1)
                  }}
                  placeholder="All"
                  className="h-12 min-w-[160px]"
                  allLabel="All"
                  showAllOption={true}
                />
              </div>
            </div>

            {filteredMedicines.length === 0 ? (
              <EmptyState
                size="compact"
                icon={Package}
                className="rounded-lg border border-dashed"
                title={searchQuery || selectedCategoryIds.length > 0 ? "No medicines match" : "No medicines in stock"}
                description={
                  searchQuery || selectedCategoryIds.length > 0
                    ? "Check the spelling, try the generic name, or clear the category filter."
                    : "Only medicines with stock on hand appear here. Receive a purchase to restock."
                }
                action={
                  searchQuery || selectedCategoryIds.length > 0
                    ? {
                        label: "Clear search and filters",
                        onClick: () => {
                          setSearchQuery("")
                          setSelectedCategoryIds([])
                          setCurrentPage(1)
                        },
                      }
                    : undefined
                }
              />
            ) : (
              <div>
            <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3" aria-label="Medicines in stock">
              {paginatedMedicines.map((medicine) => (
                <li
                  key={medicine.id}
                  className="group flex flex-col justify-between gap-2.5 rounded-xl border bg-background p-3 transition-[border-color,box-shadow] duration-150 ease-out hover:border-primary/30 hover:shadow-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-medium text-sm leading-snug text-foreground line-clamp-2" title={medicine.name}>
                        {medicine.name}
                      </h3>
                      {medicine.prescription_required && (
                        <Badge variant="warning" className="shrink-0 text-[10px]" title="Prescription required">
                          <FileText aria-hidden />
                          Rx
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[medicine.strength, medicine.form].filter(Boolean).join(" · ")}
                    </p>
                    {medicine.generic_name && (
                      <p className="line-clamp-1 text-xs text-muted-foreground">Generic: {medicine.generic_name}</p>
                    )}
                    {medicine.fefo_picks?.[0] ? (
                      <p className="num text-[11px] leading-snug text-muted-foreground">
                        <span className="font-medium text-foreground">{medicine.fefo_picks[0].batch_number}</span>
                        {" · "}
                        {medicine.fefo_picks[0].rack_location || "Rack not set"}
                        {" · Exp "}
                        {formatBatchExpiry(medicine.fefo_picks[0].expiry_date) ?? "not set"}
                        {" · "}
                        {medicine.fefo_picks[0].quantity_remaining} in this batch
                        {medicine.fefo_picks.length > 1
                          ? ` · ${medicine.fefo_picks.length - 1} later ${medicine.fefo_picks.length - 1 === 1 ? "batch" : "batches"}`
                          : ""}
                      </p>
                    ) : (
                      <p className="flex items-start gap-1 text-[11px] leading-snug text-warning">
                        <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />
                        {(medicine.batch_count ?? 0) > 0
                          ? "No sellable batch. Do not pick expired stock."
                          : "No batch on file. Pick from shelf stock."}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <p className="num text-base font-semibold text-foreground">
                        <CurrencyDisplay amount={posUnitPrice(medicine)} />
                      </p>
                      <Badge
                        variant={medicine.is_taxable === false ? "muted" : "outline"}
                        className="h-4 gap-0.5 px-1 text-[10px] font-normal"
                        title={medicine.is_taxable === false ? "Not taxable" : "Taxable"}
                      >
                        <Percent className="h-2.5 w-2.5" aria-hidden />
                        {medicine.is_taxable === false ? "No tax" : "Tax"}
                      </Badge>
                    </div>
                    <Badge
                      variant={medicine.stock_quantity > 10 ? "muted" : "warning"}
                      className="num text-[11px]"
                    >
                      {medicine.stock_quantity > 10 ? "In stock" : "Low stock"}: {medicine.stock_quantity}
                    </Badge>
                  </div>

                  {/* Full-width action row: buttons share the row via flex-1 so they can
                      never spill past the card's edge, unlike the old fixed min-width row. */}
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-11 flex-1 min-w-0 text-xs font-medium"
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
                      className="h-11 flex-[2] min-w-0 gap-1 text-xs font-medium"
                      onClick={() => addToCart(medicine, 1)}
                      disabled={medicine.stock_quantity === 0}
                      aria-label={`Add ${medicine.name} to cart`}
                      title="Add to cart"
                    >
                      <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      Add
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                <p className="num text-sm text-muted-foreground">
                  Showing {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, filteredMedicines.length)} of {filteredMedicines.length}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 min-w-11"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                  </Button>
                  <span className="num min-w-[4rem] text-center text-sm text-muted-foreground">
                    {currentPage} of {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 min-w-11"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden />
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
            className="lg:max-h-[calc(100dvh-6rem)]"
            cart={cart}
            filteredCartItems={filteredCartItems}
            cartSearchQuery={cartSearchQuery}
            setCartSearchQuery={setCartSearchQuery}
            subtotal={subtotal}
            taxAmount={taxAmount}
            vatRatePercent={vatRatePercent}
            discountAmount={discountAmount}
            discountPercent={discountPercent}
            setDiscountPercent={setDiscountPercent}
            total={total}
            loading={loading}
            onRemove={removeFromCart}
            onUpdateQty={updateCartQuantity}
            onUpdateDiscount={updateCartDiscount}
            onClear={clearCart}
            onSubmit={() => handleSubmit({ preventDefault: () => {} } as React.FormEvent)}
          />
        </aside>
      </div>

      {/* Mobile/tablet: sticky cart bar + bottom sheet */}
      <div className="sticky bottom-0 z-40 mt-4 pb-[env(safe-area-inset-bottom)] lg:hidden">
        <button
          type="button"
          onClick={() => setCartSheetOpen(true)}
          className="flex min-h-14 w-full items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left shadow-lg outline-none transition-colors duration-150 ease-out focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label={
            cart.length === 0
              ? "Open cart: no items yet"
              : `Open cart: ${cart.length} item${cart.length !== 1 ? "s" : ""}, then review and pay`
          }
        >
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShoppingCart className="h-5 w-5" aria-hidden />
            {cart.length > 0 ? (
              <span className="num absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
                {cart.length}
              </span>
            ) : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-muted-foreground">{cart.length === 0 ? "Cart is empty" : "Total"}</span>
            <span className="num block font-display text-lg font-semibold leading-tight text-foreground">
              <CurrencyDisplay amount={total} />
            </span>
          </span>
          <span
            className={cn(
              "shrink-0 rounded-lg px-3.5 py-2.5 text-sm font-semibold",
              cart.length === 0 ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground",
            )}
          >
            {cart.length === 0 ? "View cart" : "Review & pay"}
          </span>
        </button>
        <Sheet open={cartSheetOpen} onOpenChange={setCartSheetOpen}>
          <SheetContent side="bottom" className="flex h-[85dvh] flex-col gap-0 overflow-hidden rounded-t-2xl p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Cart</SheetTitle>
            </SheetHeader>
            <CartPanel
              inSheet
              cart={cart}
              filteredCartItems={filteredCartItems}
              cartSearchQuery={cartSearchQuery}
              setCartSearchQuery={setCartSearchQuery}
              subtotal={subtotal}
              taxAmount={taxAmount}
              vatRatePercent={vatRatePercent}
              discountAmount={discountAmount}
              discountPercent={discountPercent}
              setDiscountPercent={setDiscountPercent}
              total={total}
              loading={loading}
              onRemove={removeFromCart}
              onUpdateQty={updateCartQuantity}
              onUpdateDiscount={updateCartDiscount}
              onClear={clearCart}
              onSubmit={() => handleSubmit({ preventDefault: () => {} } as React.FormEvent)}
            />
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
        vatRatePercent={vatRatePercent}
        discountAmount={discountAmount}
        total={total}
        isLoading={loading}
      />

      {/* Drug interaction / allergy warning — requires explicit override to proceed */}
      <Dialog open={!!safetyWarning} onOpenChange={(open) => !open && setSafetyWarning(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" aria-hidden />
              Safety warning
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {safetyWarning?.allergy && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <p className="font-medium text-destructive">Customer allergy match</p>
                <p className="text-muted-foreground mt-1">{safetyWarning.allergy}</p>
              </div>
            )}
            {safetyWarning?.interactions.map((interaction, i) => (
              <div key={i} className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
                <p className="font-medium">Drug interaction</p>
                <p className="text-muted-foreground mt-1">{interaction}</p>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Reviewing and completing this sale anyway will be recorded as an acknowledged override.
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setSafetyWarning(null)}>
              Cancel sale
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!safetyWarning) return
                const { payments, discountAmount: disc, notes, options } = safetyWarning.pending
                setSafetyWarning(null)
                // Same checkout (incl. credit override / loyalty), now with the acknowledgement.
                void handleConfirmSale(payments, disc, notes, { ...options, acknowledgeSafetyWarnings: true })
              }}
            >
              Override &amp; complete sale
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Receipt Dialog */}
      <PrintReceipt isOpen={showPrintReceipt} onClose={() => setShowPrintReceipt(false)} saleData={lastSale} />

      {/* Prescription Dialog */}
      <CreatePrescriptionModal
        isOpen={showPrescriptionDialog}
        onClose={() => setShowPrescriptionDialog(false)}
        onSuccess={async () => {
          setShowPrescriptionDialog(false)
          // Refresh prescriptions list without reloading page
          const { data: newPrescriptions } = await prescriptionsApi.getPrescriptions({
            limit: 100,
            sortBy: "created_at",
            sortOrder: "desc",
          })
          
          if (newPrescriptions) {
            setPrescriptions(newPrescriptions)
            // If customer is selected, auto-select the newly created prescription for that customer
            if (customerId && newPrescriptions.length > 0) {
              const newPrescription = newPrescriptions.find((p) => p.customers?.id === customerId || !p.customers)
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
