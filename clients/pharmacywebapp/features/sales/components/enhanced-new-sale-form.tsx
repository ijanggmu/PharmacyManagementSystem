"use client"

import type React from "react"
import { useState, useMemo, useRef, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { type CreateSaleData } from "@/features/sales/api-client"
import { checkoutFingerprint, createCheckoutKeyTracker, getSaleOnDotnet, postSaleOnDotnet } from "@/lib/api/sales-api"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useDebounce } from "@/lib/utils/performance"
import { CASH_SHIFTS_QUERY_KEY, invalidateMoneyMovementQueries } from "@/lib/hooks/money-movement-queries"
import {
  isTotalMismatchError,
  matchesPosSearch,
  pickMedicineForEnter,
  posCustomerSearchFilters,
  posCustomerSearchQueryKey,
} from "@/features/sales/lib/pos-data"
import { parseSafetyWarning, type SafetyWarningInfo } from "@/features/sales/lib/safety-warning"
import { isCashShiftRequired } from "@/features/sales/lib/cash-shift-required"
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
  PauseCircle,
  PlayCircle,
  Keyboard,
} from "lucide-react"
import { CreditMeter } from "@/features/customers/components/credit-meter"
import { useToast } from "@/hooks/use-toast"
import { useI18n, useTranslations } from "@/lib/i18n/i18n-provider"
import { EmptyState } from "@/components/ui/empty-state"
import { useVatRate } from "@/features/settings/hooks/use-vat-rate"
import { computeInclusiveVat } from "@/features/sales/lib/vat"
import { posPriceLine, posSubtotal, posTotal, posUnitPrice } from "@/features/sales/lib/pos-pricing"
import {
  addToCartLine,
  effectiveUnit,
  formatStockInUnits,
  formatUnitCount,
  hasBox,
  resolveSaleUnits,
  saleLineUnitFields,
  snapToPacks,
  unitFactor,
  unitLabel,
  type SaleUnit,
} from "@/features/sales/lib/sale-units"
import { Customer } from "@/features/customers/api-client"
import { enqueueOfflineSale } from "@/lib/offline/offline-sales-queue"
import { customersApi } from "@/features/customers/api-client"
import { prescriptionsApi } from "@/features/prescriptions/api-client"
import CartPanel from "./cart-panel"
import { formatBatchExpiry } from "@/lib/inventory/fefo"
import { CartItem, Medicine, NewSaleFormProps, PaymentLeg, Prescription } from "@/features/sales/types"
import { ApprovalDialog } from "@/features/approvals/components/approval-dialog"
import { parseApprovalRequired, withApprovalToken, type ApprovalRequest } from "@/features/approvals/lib/approval"
import { parkedSalesApi, priceLevelsApi } from "@/features/sales/api-client-pos"
import {
  buildParkBody,
  defaultParkLabel,
  listLocalParked,
  parkLocally,
  removeLocalParked,
  restoreParkedCart,
  type ParkedBill,
  type ParkedBillSummary,
} from "@/features/sales/lib/parked-bills"
import {
  levelPricer,
  priceLevelIdToSend,
  RETAIL_LEVEL_ID,
  ruleFromQuote,
  type PriceLevelRule,
} from "@/features/sales/lib/price-levels"
import { usePosShortcuts } from "@/features/sales/hooks/use-pos-shortcuts"
import { HeldBillsDialog, HoldBillDialog } from "./pos/held-bills"
import { ShortcutHelpDialog } from "./pos/shortcut-help-dialog"
import { DotnetApiError } from "@/lib/api/dotnet-client"

interface ConfirmSaleOptions {
  overrideCreditLimit?: boolean
  redeemLoyaltyPoints?: number
  acknowledgeSafetyWarnings?: boolean
  /** Buyer's name / PAN for the IRD tax invoice. */
  buyerName?: string
  buyerPan?: string
  /** "SMS receipt" ticked: the number to text (empty = the customer's phone). */
  smsReceipt?: boolean
  smsReceiptPhone?: string
  /** Manager approvals collected for this checkout (discount over cap, credit override). */
  approvalTokens?: string[]
}

interface PendingCheckout {
  payments: PaymentLeg[]
  discountAmount: number
  notes?: string
  options?: ConfirmSaleOptions
}


/** Prices a cart line lot by lot (see posPriceLine): unit price is the average, total the server's figure. At the
 *  customer's price level when `level` is set (the server applies the same rule). */
function priceLine(
  item: Pick<CartItem, "fefoPicks" | "catalogPrice" | "medicineId">,
  quantity: number,
  discountPercent: number,
  level: PriceLevelRule | null = null,
): Pick<CartItem, "unitPrice" | "totalPrice" | "mixedPrices" | "unpricedBatch"> {
  const priced = posPriceLine(
    item.fefoPicks,
    item.catalogPrice ?? 0,
    quantity,
    discountPercent,
    levelPricer(level, item.medicineId),
  )
  return {
    unitPrice: priced.unitPrice,
    totalPrice: priced.totalPrice,
    mixedPrices: priced.mixedPrices,
    unpricedBatch: priced.unpricedBatch,
  }
}

/** Stock counts on the product cards: 1,250 stays exact; 12,500 → 12.5K so the badge fits the card. */
const compactCount = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })
function formatStockCount(quantity: number): string {
  return quantity >= 10_000 ? compactCount.format(quantity) : quantity.toLocaleString("en-US")
}

export default function EnhancedNewSaleForm({
  customers: initialCustomers,
  medicines,
  prescriptions: initialPrescriptions,
  currentUser,
  branchId = null,
}: NewSaleFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const t = useTranslations("pos")
  const tc = useTranslations("common")
  const { formatNumber } = useI18n()
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
  /** Set from a 403 approval_required; `pending` is the exact checkout to resubmit with the approval token. */
  const [approvalPrompt, setApprovalPrompt] = useState<(ApprovalRequest & { pending: PendingCheckout }) | null>(null)
  const queryClient = useQueryClient()
  const [lastSale, setLastSale] = useState<any>(null)
  /** One Idempotency-Key per checkout attempt on the .NET path; a retry of the same cart reuses it. */
  const checkoutKeys = useRef(createCheckoutKeyTracker())
  const [cartSheetOpen, setCartSheetOpen] = useState(false)
  const [addedToCartAnnouncement, setAddedToCartAnnouncement] = useState("")

  /** The cart line the keyboard acts on (F9, +, −, Del): the last one added or clicked. */
  const [selectedMedicineId, setSelectedMedicineId] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const removeCustomerRef = useRef<HTMLButtonElement>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [holdOpen, setHoldOpen] = useState(false)
  const [heldOpen, setHeldOpen] = useState(false)
  const [holding, setHolding] = useState(false)
  const [recallBusyId, setRecallBusyId] = useState<string | null>(null)
  /** What changed in a recalled bill (prices, stock), shown until dismissed. */
  const [recallNotes, setRecallNotes] = useState<string[]>([])
  /** Buyer name / PAN typed in Review & pay, kept with the cart so holding the bill keeps them. */
  const [buyerDraft, setBuyerDraft] = useState({ buyerName: "", buyerPan: "" })
  /** Price level picked by the cashier: undefined = the customer's own, null = retail, else a level id. */
  const [priceLevelOverride, setPriceLevelOverride] = useState<string | null | undefined>(undefined)
  const [online, setOnline] = useState(true)
  useEffect(() => {
    const update = () => setOnline(typeof navigator === "undefined" || navigator.onLine !== false)
    update()
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    return () => {
      window.removeEventListener("online", update)
      window.removeEventListener("offline", update)
    }
  }, [])

  // Price level: the server tells the till which level applies (the customer's own, or the one picked) and its
  // explicit prices for the cart's medicines. Walk-ins at retail need no call. Display only — the server prices
  // the sale itself with the same rule.
  const cartMedicineKey = useMemo(() => [...new Set(cart.map((i) => i.medicineId))].sort().join(","), [cart])
  const levelsQuery = useQuery({
    queryKey: ["sales", "price-levels"],
    queryFn: () => priceLevelsApi.list(),
    staleTime: 5 * 60_000,
    retry: false,
  })
  const priceQuote = useQuery({
    queryKey: ["sales", "price-quote", customerId, priceLevelOverride ?? "own", cartMedicineKey],
    enabled: Boolean(customerId) || priceLevelOverride !== undefined,
    queryFn: () =>
      priceLevelsApi.quote(
        customerId || null,
        cartMedicineKey ? cartMedicineKey.split(",") : [],
        priceLevelOverride === undefined ? undefined : (priceLevelOverride ?? RETAIL_LEVEL_ID),
      ),
    // Keep the level while only the cart's medicines change, so lines don't flicker back to retail.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === customerId && previousQuery?.queryKey[3] === (priceLevelOverride ?? "own") ? previous : undefined,
    staleTime: 60_000,
    retry: false,
  })
  const quote = customerId || priceLevelOverride !== undefined ? (priceQuote.data ?? null) : null
  const priceRule = useMemo(() => ruleFromQuote(quote), [quote])
  const priceRuleRef = useRef<PriceLevelRule | null>(priceRule)
  priceRuleRef.current = priceRule
  const priceRuleKey = priceRule ? JSON.stringify(priceRule) : "retail"
  // Re-price every line when the level (or its explicit prices) changes.
  useEffect(() => {
    setCart((prev) =>
      prev.map((item) => ({ ...item, ...priceLine(item, item.quantity, item.discountPercent, priceRuleRef.current) })),
    )
  }, [priceRuleKey])
  /** `priceLine` at the current price level. */
  const linePrice = (item: Pick<CartItem, "fefoPicks" | "catalogPrice" | "medicineId">, quantity: number, discountPercent: number) =>
    priceLine(item, quantity, discountPercent, priceRuleRef.current)
  /** Sent with the checkout only when the cashier picked a level other than the customer's own. */
  const priceLevelIdForCheckout =
    priceLevelOverride === undefined ? undefined : priceLevelIdToSend(quote?.customerPriceLevelId ?? null, priceLevelOverride)

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
      const matchesSearch = matchesPosSearch(medicine, searchQuery)
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

  /** Adds `count` base units, or `count` whole packs when `unit` is "pack" (a line in pack mode only takes packs). */
  const addToCart = (medicine: Medicine, count = 1, unit: SaleUnit = "base") => {
    const existingItem = cart.find((item) => item.medicineId === medicine.id)
    const packUnits = resolveSaleUnits(medicine)
    const next = addToCartLine(existingItem ?? null, count, unit, packUnits)

    if (next.quantity > medicine.stock_quantity) {
      toast({
        title: t("toasts.insufficientStock"),
        description: t("toasts.onlyAvailable", { stock: formatStockInUnits(medicine.stock_quantity, packUnits) }),
        variant: "destructive",
      })
      return
    }

    if (existingItem) {
      setCart((prev) =>
        prev.map((item) =>
          item.medicineId === medicine.id
            ? {
                ...item,
                quantity: next.quantity,
                saleUnit: next.saleUnit,
                ...linePrice(item, next.quantity, item.discountPercent),
              }
            : item,
        ),
      )
    } else {
      const catalogPrice = Number.parseFloat(String(medicine.unit_price)) || 0
      const base = {
        medicineId: medicine.id,
        medicineName: medicine.name,
        strength: medicine.strength,
        form: medicine.form,
        quantity: next.quantity,
        availableStock: medicine.stock_quantity,
        discountPercent: 0,
        isTaxable: medicine.is_taxable !== false,
        fefoPicks: medicine.fefo_picks ?? [],
        batchTracked: (medicine.batch_count ?? 0) > 0 || (medicine.fefo_picks?.length ?? 0) > 0,
        catalogPrice,
        packUnits,
        saleUnit: next.saleUnit,
      }
      // Same pricing as the server: each unit at the price of the FEFO lot it is taken from (a pack is its
      // base units, so a strip of 10 costs 10 x the tablet price).
      const newItem: CartItem = { ...base, ...linePrice(base, next.quantity, 0) }
      setCart((prev) => [...prev, newItem])
    }

    setSelectedMedicineId(medicine.id)
    const addedUnit = effectiveUnit(unit, packUnits)
    const added = addedUnit !== "base" ? formatUnitCount(count, unitLabel(addedUnit, packUnits)) : `${count} ×`
    setAddedToCartAnnouncement(t("toasts.addedAnnouncement", { qty: added, name: medicine.name }))
    setTimeout(() => setAddedToCartAnnouncement(""), 2000)
    toast({
      title: t("toasts.addedTitle"),
      description: t("toasts.addedDescription", { name: medicine.name }),
    })
  }

  /**
   * Picking a prescription fills the cart with what it still owes (prescribed minus dispensed), capped at the stock
   * here; medicines already in the cart are left as they are. The pharmacist then checks the quantities.
   */
  const loadPrescriptionIntoCart = (prescription: Prescription) => {
    const added: string[] = []
    const notStocked: string[] = []
    let owedLines = 0
    for (const line of prescription.prescription_items) {
      const owed = Math.max(0, line.quantity_prescribed - line.quantity_dispensed)
      if (owed === 0) continue
      owedLines += 1
      const medicineId = line.medicine_id ?? line.medicines?.id
      if (!medicineId || cart.some((item) => item.medicineId === medicineId)) continue
      const medicine = medicines.find((m) => m.id === medicineId)
      const quantity = Math.min(owed, medicine?.stock_quantity ?? 0)
      if (!medicine || quantity <= 0) {
        notStocked.push(line.medicines?.name ?? medicine?.name ?? "")
        continue
      }
      addToCart(medicine, quantity)
      added.push(medicine.name)
    }
    if (owedLines === 0) {
      toast({ title: t("toasts.rxLoadedTitle"), description: t("toasts.rxNothingOwed") })
    } else if (added.length > 0) {
      toast({ title: t("toasts.rxLoadedTitle"), description: t("toasts.rxLoadedDescription", { names: added.join(", ") }) })
    }
    if (notStocked.length > 0) {
      toast({
        title: t("toasts.rxLoadedTitle"),
        description: t("toasts.rxNotStocked", { names: notStocked.filter(Boolean).join(", ") }),
        variant: "destructive",
      })
    }
  }

  /**
   * Switches a line between base units, whole packs and whole boxes; switching to packs (boxes) rounds to the
   * nearest whole pack (box) the stock can fill.
   */
  const updateCartUnit = (medicineId: string, requested: SaleUnit) => {
    const item = cart.find((i) => i.medicineId === medicineId)
    if (!item || !item.packUnits) return
    const unit = effectiveUnit(requested, item.packUnits)
    if (effectiveUnit(item.saleUnit, item.packUnits) === unit) return
    if (unit === "base") {
      setCart((prev) => prev.map((i) => (i.medicineId === medicineId ? { ...i, saleUnit: "base" } : i)))
      return
    }
    const quantity = snapToPacks(item.quantity, unitFactor(unit, item.packUnits), item.availableStock)
    if (quantity === 0) {
      toast({
        title: t("toasts.notEnoughForPack", { pack: unitLabel(unit, item.packUnits) }),
        description: t("toasts.onlyInStock", { stock: formatStockInUnits(item.availableStock, item.packUnits) }),
        variant: "destructive",
      })
      return
    }
    setCart((prev) =>
      prev.map((i) =>
        i.medicineId === medicineId
          ? { ...i, saleUnit: unit, quantity, ...linePrice(i, quantity, i.discountPercent) }
          : i,
      ),
    )
  }

  const removeFromCart = (medicineId: string) => {
    setCart((prev) => prev.filter((item) => item.medicineId !== medicineId))
  }

  const clearCart = () => {
    setCart([])
    setCartSearchQuery("")
    toast({
      title: t("toasts.cartCleared"),
      description: t("toasts.cartClearedDescription"),
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
              title: t("toasts.insufficientStock"),
              description: t("toasts.onlyAvailable", { stock: formatStockInUnits(item.availableStock, item.packUnits ?? null) }),
              variant: "destructive",
            })
            return item
          }
          return {
            ...item,
            quantity: newQuantity,
            ...linePrice(item, newQuantity, item.discountPercent),
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
              ...linePrice(item, item.quantity, discountPercent),
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
  // Only the selected patient's prescriptions can be dispensed on this bill (the server refuses another
  // patient's), so the picker lists just theirs, and a walk-in sale lists none.
  const customerPrescriptions = useMemo(
    () => (customerId ? prescriptions.filter((p) => (p.customer_id ?? p.customers?.id) === customerId) : []),
    [prescriptions, customerId],
  )
  useEffect(() => {
    if (selectedPrescription && (selectedPrescription.customer_id ?? selectedPrescription.customers?.id) !== customerId) {
      setPrescriptionId("")
    }
  }, [customerId, selectedPrescription])

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
        title: tc("toasts.failed"),
        description: t("validation.addItems"),
        variant: "destructive",
      })
      return
    }
    if (cartItemsRequiringRx.length > 0 && !prescriptionId) {
      toast({
        title: t("validation.rxRequired"),
        description: t("validation.rxRequiredDescription", { names: cartItemsRequiringRx.map((i) => i.medicineName).join(", ") }),
        variant: "destructive",
      })
      return
    }
    if (missingRxCoverage.length > 0) {
      toast({
        title: t("validation.rxNotCovering"),
        description: t("validation.rxNotCoveringDescription", { names: missingRxCoverage.map((i) => i.medicineName).join(", ") }),
        variant: "destructive",
      })
      return
    }
    // Hand over from the mobile cart sheet to the Review & pay panel (never two sheets stacked).
    setCartSheetOpen(false)
    setShowCompletionDialog(true)
  }

  /** Clears the cart and selections after a sale is recorded (or safely queued), or the bill is held. */
  const resetCheckout = () => {
    setCart([])
    setCustomerId("")
    setPrescriptionId("")
    setDiscountAmount(0)
    setCartSheetOpen(false)
    setBuyerDraft({ buyerName: "", buyerPan: "" })
    setPriceLevelOverride(undefined)
    setSelectedMedicineId(null)
    setRecallNotes([])
  }

  // ---- Hold / recall -------------------------------------------------------------------------

  const heldQuery = useQuery({
    queryKey: ["sales", "parked", branchId],
    enabled: heldOpen && online,
    queryFn: () => parkedSalesApi.list(),
    staleTime: 0,
    retry: false,
  })
  /** Bumped when a bill held on this device is added or removed, so the list re-reads storage. */
  const [localHeldVersion, setLocalHeldVersion] = useState(0)
  const heldBills: ParkedBillSummary[] = useMemo(() => {
    const local = heldOpen ? listLocalParked(branchId) : []
    return [...local, ...(heldQuery.data ?? [])]
    // listLocalParked reads storage; re-read whenever the dialog opens or the server list changes.
  }, [heldOpen, heldQuery.data, branchId, localHeldVersion])

  const holdBill = async (label: string) => {
    if (cart.length === 0) return
    const customerName = selectedCustomer ? `${selectedCustomer.first_name} ${selectedCustomer.last_name}`.trim() : null
    const body = buildParkBody(
      cart,
      {
        label,
        customerId: customerId || null,
        customerName,
        prescriptionId: prescriptionId || null,
        priceLevelId: priceLevelIdForCheckout ?? null,
        buyerName: buyerDraft.buyerName.trim() || null,
        buyerPan: buyerDraft.buyerPan.trim() || null,
        billDiscountAmount: discountAmount,
      },
      total,
      crypto.randomUUID(),
    )
    const holdHere = () => {
      setLocalHeldVersion((v) => v + 1)
      if (!parkLocally(body, branchId)) {
        toast({ title: t("held.holdFailed"), description: t("held.noOfflineStorage"), variant: "destructive" })
        return false
      }
      toast({ title: t("held.heldOnDevice"), description: t("held.heldOnDeviceDescription", { label: body.label }) })
      return true
    }

    setHolding(true)
    let held = false
    if (!online) {
      held = holdHere()
    } else {
      try {
        await parkedSalesApi.park(body)
        held = true
        toast({ title: t("held.held"), description: t("held.heldDescription", { label: body.label }) })
      } catch (error) {
        // No connection after all: keep it on this device rather than lose the cart.
        if (error instanceof DotnetApiError && error.normalized.status === 0) {
          held = holdHere()
        } else {
          toast({
            title: t("held.holdFailed"),
            description: error instanceof Error ? error.message : tc("states.tryAgain"),
            variant: "destructive",
          })
        }
      }
    }
    setHolding(false)
    if (held) {
      setHoldOpen(false)
      checkoutKeys.current.reset()
      resetCheckout()
      void queryClient.invalidateQueries({ queryKey: ["sales", "parked"] })
    }
  }

  const applyRecalledBill = async (bill: ParkedBill) => {
    // Re-price against today's lots at the bill's customer's level (or the level the bill was held at).
    const override =
      bill.priceLevelId == null ? undefined : bill.priceLevelId === RETAIL_LEVEL_ID ? null : bill.priceLevelId
    let rule: PriceLevelRule | null = null
    if (bill.customerId || override !== undefined) {
      try {
        rule = ruleFromQuote(
          await priceLevelsApi.quote(
            bill.customerId,
            bill.lines.map((l) => l.medicineId),
            override === undefined ? undefined : (override ?? RETAIL_LEVEL_ID),
          ),
        )
      } catch {
        rule = null
      }
    }
    const restored = restoreParkedCart(bill.lines, medicines, rule)
    priceRuleRef.current = rule
    setPriceLevelOverride(override)
    setCustomerId(bill.customerId ?? "")
    setPrescriptionId(bill.prescriptionId && prescriptions.some((p) => p.id === bill.prescriptionId) ? bill.prescriptionId : "")
    setCart(restored.cart)
    setDiscountAmount(bill.billDiscountAmount)
    setBuyerDraft({ buyerName: bill.buyerName ?? "", buyerPan: bill.buyerPan ?? "" })
    setSelectedMedicineId(restored.cart.at(-1)?.medicineId ?? null)
    setRecallNotes(restored.warnings)
    setHeldOpen(false)
    toast({
      title: t("held.recalled", { label: bill.label }),
      description: restored.warnings.length > 0 ? t("held.recalledChanged") : undefined,
    })
  }

  const recallBill = async (summary: ParkedBillSummary) => {
    if (cart.length > 0) return
    setRecallBusyId(summary.id)
    try {
      const bill = summary.source === "local" ? (removeLocalParked(summary.id) as ParkedBill | null) : await parkedSalesApi.recall(summary.id)
      if (!bill) throw new Error(t("held.noLongerHeld"))
      await applyRecalledBill(bill)
    } catch (error) {
      toast({
        title: t("held.recallFailed"),
        description:
          error instanceof DotnetApiError && error.normalized.status === 404
            ? t("held.recalledElsewhere")
            : error instanceof Error
              ? error.message
              : tc("states.tryAgain"),
        variant: "destructive",
      })
    } finally {
      setRecallBusyId(null)
      void queryClient.invalidateQueries({ queryKey: ["sales", "parked"] })
    }
  }

  const discardBill = async (summary: ParkedBillSummary) => {
    setRecallBusyId(summary.id)
    try {
      if (summary.source === "local") {
        removeLocalParked(summary.id)
        setLocalHeldVersion((v) => v + 1)
      }
      else await parkedSalesApi.discard(summary.id)
      toast({ title: t("held.discarded"), description: summary.label })
    } catch (error) {
      toast({
        title: t("held.discardFailed"),
        description: error instanceof Error ? error.message : tc("states.tryAgain"),
        variant: "destructive",
      })
    } finally {
      setRecallBusyId(null)
      void queryClient.invalidateQueries({ queryKey: ["sales", "parked"] })
    }
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
        title: t("validation.customerRequired"),
        description: t("validation.customerRequiredCredit"),
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
      buyer_name: options?.buyerName ?? null,
      buyer_pan: options?.buyerPan ?? null,
      sms_receipt: options?.smsReceipt === true,
      sms_receipt_phone: options?.smsReceiptPhone ?? null,
      // Not part of the checkout fingerprint, so the resubmission keeps the key the approval is bound to.
      approval_tokens: options?.approvalTokens,
      // Only when the cashier priced at a level other than the customer's own (the server checks it).
      ...(priceLevelIdForCheckout ? { price_level_id: priceLevelIdForCheckout } : {}),
      sale_items: cart.map((item) => ({
        medicine_id: item.medicineId,
        quantity: item.quantity,
        unit_price: item.unitPrice.toFixed(2),
        total_price: item.totalPrice.toFixed(2),
        discount_percent: item.discountPercent,
        // Quantity stays in base units; a whole-pack line also names the pack so the invoice reads "2 strips".
        ...saleLineUnitFields(item),
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

      // Discount over the cashier's cap / credit-limit override: a manager approves on this screen, then the same
      // checkout is resubmitted with the approval token (bound to this checkout's key).
      const approval = parseApprovalRequired(error)
      if (approval) {
        setApprovalPrompt({
          ...approval,
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
            title: t("toasts.queuedOffline"),
            description: t("toasts.queuedOfflineDescription"),
          })
        } catch (queueError) {
          console.error("Failed to queue offline sale:", queueError)
          toast({
            title: tc("toasts.failed"),
            description: t("toasts.queueFailed"),
            variant: "destructive",
          })
        }
        return
      }

      // No cash shift open: the banner above the till picks this up and offers to open one.
      if (isCashShiftRequired(error)) void queryClient.invalidateQueries({ queryKey: [...CASH_SHIFTS_QUERY_KEY] })

      // The server prices from the current FEFO lot and stock: a total/stock refusal means this screen is
      // stale, so reload the catalog before the cashier tries again.
      const stale = isTotalMismatchError(error)
      if (stale) void queryClient.invalidateQueries({ queryKey: ["medicines"] })
      toast({
        title: t("toasts.notRecorded"),
        description: `${error instanceof Error ? error.message : t("toasts.processFailed")}${
          stale ? ` ${t("toasts.pricesRefreshed")}` : ""
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
      title: t("toasts.successTitle"),
      // No number here: saleNumber is a client-side draft id, not the IRD invoice number the print dialog shows.
      description: t("toasts.saleCompleted"),
    })
    setShowPrintReceipt(true)
  }

  const selectedCustomer = customers.find((c) => c.id === customerId)
  const discountPercent = subtotal > 0 ? (discountAmount / subtotal) * 100 : 0
  const setDiscountPercent = (pct: number) => setDiscountAmount((subtotal * Math.max(0, Math.min(100, pct))) / 100)

  // ---- Keyboard shortcuts (features/sales/lib/pos-shortcuts.ts) ---------------------------------
  const selectedLine = cart.find((i) => i.medicineId === selectedMedicineId) ?? cart.at(-1) ?? null
  const selectedLineStep = selectedLine ? unitFactor(selectedLine.saleUnit, selectedLine.packUnits) : 1
  usePosShortcuts(
    {
      focusSearch: () => {
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      },
      focusCustomer: () => {
        if (selectedCustomer) removeCustomerRef.current?.focus()
        else setCustomerSearchOpen(true)
      },
      hold: () => {
        if (cart.length === 0) {
          toast({ title: t("held.nothingToHold"), description: t("held.addFirst") })
          return
        }
        setHoldOpen(true)
      },
      recall: () => setHeldOpen(true),
      checkout: () => {
        if (cart.length > 0) void handleSubmit({ preventDefault: () => {} } as React.FormEvent)
      },
      toggleUnit: () => {
        // Cycles base → pack → box (when the medicine has one) → base.
        if (selectedLine?.packUnits) {
          const current = effectiveUnit(selectedLine.saleUnit, selectedLine.packUnits)
          const nextUnit: SaleUnit =
            current === "base" ? "pack" : current === "pack" && hasBox(selectedLine.packUnits) ? "box" : "base"
          updateCartUnit(selectedLine.medicineId, nextUnit)
        }
      },
      increment: () => {
        if (selectedLine) updateCartQuantity(selectedLine.medicineId, selectedLine.quantity + selectedLineStep)
      },
      decrement: () => {
        if (selectedLine) updateCartQuantity(selectedLine.medicineId, selectedLine.quantity - selectedLineStep)
      },
      removeLine: () => {
        if (!selectedLine) return
        removeFromCart(selectedLine.medicineId)
        setAddedToCartAnnouncement(t("toasts.removedAnnouncement", { name: selectedLine.medicineName }))
      },
      help: () => setHelpOpen(true),
    },
    !loading,
  )
  const levelOptions = (levelsQuery.data ?? []).filter((l) => l.isActive)
  const customerLevelName = quote?.customerPriceLevelName ?? null
  const priceLevelSelectValue = priceLevelOverride === undefined ? "own" : (priceLevelOverride ?? "retail")

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
              {t("customer.sectionTitle")}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              {/* Customer (optional) */}
              <div className="min-w-0 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="customer-select" className="text-sm font-medium">
                    {t("customer.label")}
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
                    aria-label={t("customer.addNew")}
                  >
                    <UserPlus className="h-4 w-4 mr-1.5" aria-hidden />
                    {t("customer.new")}
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
                                <span className="num">{formatNumber(selectedCustomer.loyalty_points ?? 0)}</span> {t("loyalty.pts")}
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
                        ref={removeCustomerRef}
                        onClick={() => setCustomerId("")}
                        aria-label={t("customer.remove")}
                        title={t("customer.remove")}
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                    {((selectedCustomer.current_balance ?? 0) !== 0 || selectedCustomer.credit_limit != null) && (
                      <div className="mt-1.5 border-t pt-1.5">
                        <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("customer.owesOnAccount")}</p>
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
                        aria-keyshortcuts="F4"
                        variant="outline"
                        role="combobox"
                        aria-expanded={customerSearchOpen}
                        aria-label={t("customer.selectAria")}
                        title={t("customer.selectTitle")}
                        className="h-11 w-full justify-between bg-background text-sm"
                      >
                        <span className="text-muted-foreground">{t("customer.walkInChoose")}</span>
                        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
                      </Button>
                    </PopoverTrigger>
                  <PopoverContent className="w-full p-0 max-h-48" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder={t("customer.searchPlaceholder")}
                        value={customerSearchQuery}
                        onValueChange={setCustomerSearchQuery}
                        className="h-8 text-xs"
                      />
                      <CommandEmpty>
                        {customerSearch.isFetching
                          ? t("customer.searching")
                          : customerSearch.isError
                            ? t("customer.searchFailed")
                            : t("customer.noneFound")}
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
                            <span className="text-muted-foreground">{t("customer.noCustomer")}</span>
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
                      {t("customer.cardLabel")}
                    </Label>
                    <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                      id="customer-card-code"
                      value={cardCode}
                      onChange={(e) => {
                        setCardCode(e.target.value)
                        if (cardLookup === "missing") setCardLookup("idle")
                      }}
                      placeholder={t("customer.cardPlaceholder")}
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
                        {t("customer.cardNotFound")}
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
                    {t("prescription.label")}
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 min-w-[44px] text-sm"
                    onClick={() => setShowPrescriptionDialog(true)}
                    disabled={!customerId}
                    title={!customerId ? t("prescription.selectCustomerFirst") : t("prescription.create")}
                    aria-label={!customerId ? t("prescription.selectCustomerFirst") : t("prescription.new")}
                  >
                    <FileText className="h-4 w-4 mr-1.5" aria-hidden />
                    {t("prescription.new")}
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
                        title={t("prescription.remove")}
                        aria-label={t("prescription.remove")}
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Select
                    value={prescriptionId}
                    onValueChange={(value) => {
                      setPrescriptionId(value)
                      const picked = customerPrescriptions.find((p) => p.id === value)
                      if (picked) loadPrescriptionIntoCart(picked)
                    }}
                  >
                    <SelectTrigger id="prescription-select" className="h-11 bg-background text-sm" title={t("prescription.selectTitle")}>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
                        <SelectValue placeholder={t("prescription.none")} />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {customerPrescriptions.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          {customerId ? t("prescription.nonePending") : t("prescription.selectCustomerFirst")}
                        </div>
                      ) : (
                        customerPrescriptions.map((prescription) => (
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

            {/* Price level: the customer's own (wholesale / custom) by default; another level that comes out cheaper
                needs a manager's approval at checkout. */}
            {levelOptions.length > 0 || customerLevelName ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                <Label htmlFor="price-level-select" className="text-sm font-medium">
                  {t("priceLevel.label")}
                </Label>
                <Select
                  value={priceLevelSelectValue}
                  onValueChange={(value) =>
                    setPriceLevelOverride(value === "own" ? undefined : value === "retail" ? null : value)
                  }
                >
                  <SelectTrigger id="price-level-select" className="h-9 w-auto min-w-[12rem] bg-background text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="own">
                      {customerLevelName ? t("priceLevel.customersLevel", { name: customerLevelName }) : t("priceLevel.retail")}
                    </SelectItem>
                    {customerLevelName ? <SelectItem value="retail">{t("priceLevel.retail")}</SelectItem> : null}
                    {levelOptions
                      .filter((l) => l.id !== quote?.customerPriceLevelId)
                      .map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name} ({t("summary.percentOff", { percent: formatNumber(Number(l.discountPercent.toFixed(2))) })})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {priceRule ? (
                  <Badge variant="outline" className="gap-1" aria-live="polite">
                    <Percent className="h-3 w-3" aria-hidden />
                    {t("priceLevel.prices", { name: priceRule.name })}
                  </Badge>
                ) : null}
                {priceLevelIdForCheckout ? (
                  <span className="text-xs text-muted-foreground">{t("priceLevel.needsApproval")}</span>
                ) : null}
                {priceQuote.isError ? (
                  <span role="alert" className="text-xs text-warning">
                    {t("priceLevel.loadFailed")}
                  </span>
                ) : null}
              </div>
            ) : null}
          </section>

          {recallNotes.length > 0 ? (
            <div role="status" className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
                  {t("held.changedSinceHeld")}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setRecallNotes([])}
                  aria-label={t("held.dismissNotes")}
                >
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              </div>
              <ul className="mt-1 list-disc space-y-0.5 pl-6 text-muted-foreground">
                {recallNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Product Catalog */}
          <section className="rounded-xl border bg-card p-3 shadow-xs sm:p-4" aria-labelledby="catalog-heading">
            <div className="mb-2.5 flex items-baseline justify-between gap-2">
              <h2 id="catalog-heading" className="font-display text-base font-semibold">
                {t("catalog.title")}
              </h2>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => setHoldOpen(true)}
                  disabled={cart.length === 0 || loading}
                  aria-keyshortcuts="F6"
                  title={t("held.holdShortcut")}
                >
                  <PauseCircle className="h-4 w-4" aria-hidden />
                  {t("held.hold")}
                  <kbd className="hidden font-mono text-[10px] text-muted-foreground sm:inline">F6</kbd>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => setHeldOpen(true)}
                  aria-keyshortcuts="F7"
                  title={t("held.recallShortcut")}
                >
                  <PlayCircle className="h-4 w-4" aria-hidden />
                  {t("held.title")}
                  <kbd className="hidden font-mono text-[10px] text-muted-foreground sm:inline">F7</kbd>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setHelpOpen(true)}
                  aria-keyshortcuts="Shift+?"
                  aria-label={t("shortcuts.title")}
                  title={t("shortcuts.titleWithKey")}
                >
                  <Keyboard className="h-4 w-4" aria-hidden />
                </Button>
                <OfflineSalesIndicator />
                <p className="num text-xs text-muted-foreground">
                  {searchQuery || selectedCategoryIds.length > 0
                    ? t("catalog.inStockMatching", { n: formatNumber(filteredMedicines.length) })
                    : t("catalog.inStockCount", { n: formatNumber(filteredMedicines.length) })}
                </p>
              </div>
            </div>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  ref={searchInputRef}
                  type="search"
                  aria-keyshortcuts="F2"
                  placeholder={t("catalog.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1)
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || e.nativeEvent.isComposing) return
                    e.preventDefault()
                    // A scanner types the barcode and presses Enter: add that medicine. Typing a name that leaves
                    // one match and pressing Enter adds it too. The box clears for the next scan.
                    const picked = pickMedicineForEnter(searchQuery, medicines, filteredMedicines)
                    if (picked && picked.stock_quantity > 0) {
                      addToCart(picked)
                      setSearchQuery("")
                      setCurrentPage(1)
                    } else if (searchQuery.trim() && filteredMedicines.length === 0) {
                      toast({
                        title: t("catalog.noMatchTitle"),
                        description: t("catalog.noMatchDescription"),
                        variant: "destructive",
                      })
                    }
                  }}
                  className="h-12 pl-11 text-base shadow-xs"
                  aria-label={t("catalog.searchLabel")}
                  autoComplete="off"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="sr-only">{t("catalog.category")}</span>
                <MultiSelect
                  options={categoryList.map((c) => ({ value: c.id, label: c.name }))}
                  value={selectedCategoryIds}
                  onValueChange={(v) => {
                    setSelectedCategoryIds(v)
                    setCurrentPage(1)
                  }}
                  placeholder={tc("states.all")}
                  className="h-12 min-w-[160px]"
                  allLabel={tc("states.all")}
                  showAllOption={true}
                />
              </div>
            </div>

            {filteredMedicines.length === 0 ? (
              <EmptyState
                size="compact"
                icon={Package}
                className="rounded-lg border border-dashed"
                title={searchQuery || selectedCategoryIds.length > 0 ? t("catalog.noMatchTitle") : t("catalog.noStockTitle")}
                description={
                  searchQuery || selectedCategoryIds.length > 0
                    ? t("catalog.noMatchDescription")
                    : t("catalog.noStockDescription")
                }
                action={
                  searchQuery || selectedCategoryIds.length > 0
                    ? {
                        label: t("catalog.clearFilters"),
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
            <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3" aria-label={t("catalog.listLabel")}>
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
                        <Badge variant="warning" className="shrink-0 text-[10px]" title={t("validation.rxRequired")}>
                          <FileText aria-hidden />
                          Rx
                        </Badge>
                      )}
                    </div>
                    {/* Narcotic/scheduled: the counter must see it before dispensing, not only "Rx". Own line so
                        the medicine name keeps its width. */}
                    {medicine.controlled_substance && (
                      <Badge
                        variant="destructive"
                        className="text-[10px]"
                        title={
                          medicine.controlled_schedule
                            ? `Controlled substance (${medicine.controlled_schedule}) — recorded in the narcotic register`
                            : "Controlled substance — recorded in the narcotic register"
                        }
                      >
                        <AlertTriangle aria-hidden />
                        {medicine.controlled_schedule ? `Controlled · ${medicine.controlled_schedule}` : "Controlled"}
                      </Badge>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {[medicine.strength, medicine.form].filter(Boolean).join(" · ")}
                    </p>
                    {medicine.generic_name && (
                      <p className="line-clamp-1 text-xs text-muted-foreground">{t("catalog.generic", { name: medicine.generic_name })}</p>
                    )}
                    {medicine.fefo_picks?.[0] ? (
                      <p className="num text-[11px] leading-snug text-muted-foreground">
                        <span className="font-medium text-foreground">{medicine.fefo_picks[0].batch_number}</span>
                        {" · "}
                        {medicine.fefo_picks[0].rack_location || t("catalog.rackNotSet")}
                        {` · ${t("catalog.exp")} `}
                        {formatBatchExpiry(medicine.fefo_picks[0].expiry_date) ?? t("catalog.notSet")}
                        {" · "}
                        {t("catalog.inThisBatch", { n: formatNumber(medicine.fefo_picks[0].quantity_remaining) })}
                        {medicine.fefo_picks.length > 1
                          ? ` · ${t(medicine.fefo_picks.length - 1 === 1 ? "catalog.laterBatch" : "catalog.laterBatches", { n: formatNumber(medicine.fefo_picks.length - 1) })}`
                          : ""}
                      </p>
                    ) : (
                      <p className="flex items-start gap-1 text-[11px] leading-snug text-warning">
                        <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />
                        {(medicine.batch_count ?? 0) > 0
                          ? t("catalog.noSellableBatch")
                          : t("catalog.noBatch")}
                      </p>
                    )}
                  </div>

                  {/* Wraps instead of overflowing when a long price meets a large stock count. */}
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <p className="num truncate text-base font-semibold text-foreground">
                        <CurrencyDisplay amount={posUnitPrice(medicine)} />
                      </p>
                      <Badge
                        variant={medicine.is_taxable === false ? "muted" : "outline"}
                        className="h-4 gap-0.5 px-1 text-[10px] font-normal"
                        title={medicine.is_taxable === false ? t("catalog.notTaxable") : t("catalog.taxable")}
                      >
                        <Percent className="h-2.5 w-2.5" aria-hidden />
                        {medicine.is_taxable === false ? t("catalog.noTax") : t("catalog.tax")}
                      </Badge>
                    </div>
                    <Badge
                      variant={medicine.stock_quantity > 10 ? "muted" : "warning"}
                      className="num max-w-full whitespace-nowrap text-[11px]"
                      title={t("catalog.stockTitle", { stock: formatStockInUnits(medicine.stock_quantity, resolveSaleUnits(medicine)) })}
                    >
                      {medicine.stock_quantity > 10 ? t("catalog.inStock") : t("catalog.lowStock")}:{" "}
                      {formatStockCount(medicine.stock_quantity)}
                    </Badge>
                  </div>
                  {resolveSaleUnits(medicine) ? (
                    // Both units, so the cashier can sell by the strip: "35 tablets = 3 strips + 5".
                    <p className="num -mt-1 text-[11px] leading-snug text-muted-foreground">
                      {formatStockInUnits(medicine.stock_quantity, resolveSaleUnits(medicine))}
                    </p>
                  ) : null}

                  {/* Full-width action row: buttons share the row via flex-1 so they can
                      never spill past the card's edge, unlike the old fixed min-width row. */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(() => {
                      const packUnits = resolveSaleUnits(medicine)
                      // A medicine with a pack size gets "+1 strip" (sold in whole packs) in place of "+5", and one
                      // with a box also "+1 box".
                      const boxContents = hasBox(packUnits)
                        ? `${formatUnitCount(packUnits.packsPerBox ?? 0, packUnits.packLabel)} (${formatUnitCount(packUnits.unitsPerBox, packUnits.baseLabel)})`
                        : null
                      return packUnits ? (
                        // With a box there are two quick adds: they get their own row so "+1 strip" / "+1 box"
                        // stay readable on a narrow card, and Add wraps below at full width.
                        <div className={cn("flex min-w-0 gap-1.5", hasBox(packUnits) ? "w-full" : "flex-1")}>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-11 flex-1 min-w-0 text-xs font-medium"
                          onClick={() => addToCart(medicine, 1, "pack")}
                          disabled={medicine.stock_quantity < packUnits.unitsPerPack}
                          aria-label={t("catalog.addPackAria", {
                            pack: packUnits.packLabel,
                            units: formatUnitCount(packUnits.unitsPerPack, packUnits.baseLabel),
                            name: medicine.name,
                          })}
                          title={t("catalog.addPackTitle", {
                            pack: packUnits.packLabel,
                            units: formatUnitCount(packUnits.unitsPerPack, packUnits.baseLabel),
                          })}
                        >
                          <span className="truncate">+1 {packUnits.packLabel}</span>
                        </Button>
                        {hasBox(packUnits) && boxContents ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-11 flex-1 min-w-0 text-xs font-medium"
                            onClick={() => addToCart(medicine, 1, "box")}
                            disabled={medicine.stock_quantity < packUnits.unitsPerBox}
                            aria-label={t("catalog.addPackAria", { pack: packUnits.boxLabel, units: boxContents, name: medicine.name })}
                            title={t("catalog.addPackTitle", { pack: packUnits.boxLabel, units: boxContents })}
                          >
                            <span className="truncate">+1 {packUnits.boxLabel}</span>
                          </Button>
                        ) : null}
                        </div>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-11 flex-1 min-w-0 text-xs font-medium"
                          onClick={() => addToCart(medicine, 5)}
                          disabled={medicine.stock_quantity < 5}
                          aria-label={t("catalog.addFiveAria", { name: medicine.name })}
                          title={t("catalog.addFive")}
                        >
                          +5
                        </Button>
                      )
                    })()}
                    <Button
                      type="button"
                      size="sm"
                      className="h-11 flex-[2] min-w-0 gap-1 text-xs font-medium"
                      onClick={() => addToCart(medicine, 1)}
                      disabled={medicine.stock_quantity === 0}
                      aria-label={t("catalog.addAria", { name: medicine.name })}
                      title={t("catalog.addToCart")}
                    >
                      <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {t("catalog.add")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                <p className="num text-sm text-muted-foreground">
                  {tc("states.showing", {
                    from: formatNumber((currentPage - 1) * itemsPerPage + 1),
                    to: formatNumber(Math.min(currentPage * itemsPerPage, filteredMedicines.length)),
                    total: formatNumber(filteredMedicines.length),
                  })}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 min-w-11"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    aria-label={tc("actions.previous")}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                  </Button>
                  <span className="num min-w-[4rem] text-center text-sm text-muted-foreground">
                    {t("catalog.pageOf", { page: formatNumber(currentPage), total: formatNumber(totalPages) })}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 min-w-11"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    aria-label={tc("actions.next")}
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
            onUpdateUnit={updateCartUnit}
            onUpdateDiscount={updateCartDiscount}
            selectedId={selectedLine?.medicineId ?? null}
            onSelect={setSelectedMedicineId}
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
              ? t("cart.openEmpty")
              : t("cart.openWithItems", { n: formatNumber(cart.length) })
          }
        >
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShoppingCart className="h-5 w-5" aria-hidden />
            {cart.length > 0 ? (
              <span className="num absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
                {formatNumber(cart.length)}
              </span>
            ) : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-muted-foreground">{cart.length === 0 ? t("cart.empty") : t("summary.total")}</span>
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
            {cart.length === 0 ? t("cart.view") : t("checkout.reviewPay")}
          </span>
        </button>
        <Sheet open={cartSheetOpen} onOpenChange={setCartSheetOpen}>
          <SheetContent side="bottom" className="flex h-[85dvh] flex-col gap-0 overflow-hidden rounded-t-2xl p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>{t("cart.sheetTitle")}</SheetTitle>
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
              onUpdateUnit={updateCartUnit}
              onUpdateDiscount={updateCartDiscount}
              selectedId={selectedLine?.medicineId ?? null}
              onSelect={setSelectedMedicineId}
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
        initialBuyer={buyerDraft}
        onBuyerChange={setBuyerDraft}
        priceLevelName={priceRule?.name ?? null}
      />

      {/* Drug interaction / allergy warning — requires explicit override to proceed */}
      <Dialog open={!!safetyWarning} onOpenChange={(open) => !open && setSafetyWarning(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" aria-hidden />
              {t("safety.title")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {safetyWarning?.allergy && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <p className="font-medium text-destructive">{t("safety.allergy")}</p>
                <p className="text-muted-foreground mt-1">{safetyWarning.allergy}</p>
              </div>
            )}
            {safetyWarning?.interactions.map((interaction, i) => (
              <div key={i} className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
                <p className="font-medium">{t("safety.interaction")}</p>
                <p className="text-muted-foreground mt-1">{interaction}</p>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              {t("safety.note")}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setSafetyWarning(null)}>
              {t("safety.cancelSale")}
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
              {t("safety.override")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manager approval — discount over the cashier's cap, or going past a customer's credit limit */}
      <ApprovalDialog
        request={approvalPrompt}
        onCancel={() => setApprovalPrompt(null)}
        onApproved={(token) => {
          if (!approvalPrompt) return
          const { payments, discountAmount: disc, notes, options } = approvalPrompt.pending
          setApprovalPrompt(null)
          // Same checkout (same key), now carrying every approval collected so far.
          void handleConfirmSale(payments, disc, notes, {
            ...options,
            approvalTokens: withApprovalToken(options?.approvalTokens, token),
          })
        }}
      />

      {/* Hold (F6) / recall (F7) and the shortcut overlay (?) */}
      <HoldBillDialog
        open={holdOpen}
        onOpenChange={setHoldOpen}
        defaultLabel={defaultParkLabel(
          selectedCustomer ? `${selectedCustomer.first_name} ${selectedCustomer.last_name}`.trim() : null,
        )}
        lineCount={cart.length}
        total={total}
        offline={!online}
        busy={holding}
        onHold={(label) => void holdBill(label)}
      />
      <HeldBillsDialog
        open={heldOpen}
        onOpenChange={setHeldOpen}
        bills={heldBills}
        loading={online && heldQuery.isLoading}
        error={heldQuery.isError ? t("held.loadFailed") : null}

        busyId={recallBusyId}
        cartHasItems={cart.length > 0}
        onRecall={(bill) => void recallBill(bill)}
        onDiscard={(bill) => void discardBill(bill)}
      />
      <ShortcutHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />

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
