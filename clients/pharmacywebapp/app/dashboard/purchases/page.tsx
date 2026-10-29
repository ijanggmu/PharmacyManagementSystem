/**
 * Purchase Orders Page
 * Manage purchase orders and supplier orders
 */

"use client"

import { BillDueDateField } from "@/components/shared/bill-due-date-field"
import { dueDateError } from "@/lib/utils/payment-terms"
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Plus,
  Package,
  Truck,
  CheckCircle2,
  Clock,
  Ban,
  ClipboardList,
  FileText,
  ShieldCheck,
  PackageCheck,
  PackageOpen,
  XCircle,
  Search,
  Inbox,
  Boxes,
  TrendingDown,
  AlertTriangle,
  MoreHorizontal,
  X,
  type LucideIcon,
} from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useTabParam } from "@/hooks/use-tab-param"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import {
  purchasesApi,
  shortReceivedLines,
  type PurchaseOrder,
  type PurchaseOrderItem,
  type DirectGoodsReceipt,
  type GoodsReceiptSource,
  GOODS_RECEIPT_SOURCE_LABELS,
  type PurchaseOrderStatusCounts,
} from "@/features/purchases/api-client"
import { CurrencyDisplay } from "@/components/currency-display"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { DotnetApiError } from "@/lib/api/dotnet-client"
import { createIdempotencyKeyTracker } from "@/lib/api/idempotency"
import { BranchFilterSelect, useBranchFilter } from "@/features/branches/components/branch-filter"
import { SwitchBranchNotice, useIsOtherBranch } from "@/features/branches/components/switch-branch-notice"
import CreatePurchaseOrderModal from "@/features/purchases/components/create-purchase-order-modal"
import CreateDirectReceiptModal from "@/features/purchases/components/create-direct-receipt-modal"
import { FieldError } from "@/components/ui/field-error"
import { PriceCurrencyToggle } from "@/features/medicines/components/price-entry-controls"
import { priceTextInNpr, type PriceCurrency } from "@/features/medicines/lib/price-entry"
import { useCurrency } from "@/lib/contexts/currency-context"
import { PurchaseBillDetailDialog, purchaseBillKeys, type PurchaseBillTarget } from "@/features/purchases/components/purchase-bill-detail-dialog"
import { useQueryClient } from "@tanstack/react-query"
import ReorderSuggestions from "@/features/purchases/components/reorder-suggestions"
import {
  formatReceiptQuantity,
  initialReceiptSellingPrice,
  orderedRateText,
  proportionalFreeQuantity,
  receiptLineGross,
  receiptRateToSend,
} from "@/features/purchases/lib/receipt-units"
import { medicinesApi, type Medicine } from "@/features/medicines/api-client"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogScrollBody,
  DialogStickyFooter,
  DialogTitle,
  DIALOG_CONTENT_SCROLL_BODY_CLASS,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { DatePicker, EXPIRY_PRESETS } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { DataTable, Column } from "@/components/ui/data-table"
import { DateRangePicker } from "@/components/date-range-picker"
import { SupplierCombobox } from "@/features/suppliers/components/supplier-combobox"
import { useSupplierOptions } from "@/features/suppliers/hooks/use-supplier-options"
import { nepalDayEndInclusiveUtc, nepalDayStartUtc } from "@/lib/utils/nepal-time"
import { formatLocalDateYmd } from "@/lib/utils/date"
import { useToast } from "@/hooks/use-toast"
import { nepalTodayYmd } from "@/lib/utils/date-limits"
import { useSystemSettings } from "@/features/settings/hooks/use-system-settings"
import { parseInternalControls } from "@/features/settings/lib/internal-controls"

type BadgeTone = "success" | "warning" | "danger" | "info" | "muted"

/** One tone + word + icon per purchase-order status, so status never relies on color alone. */
const PO_STATUS_META: Record<PurchaseOrder["status"], { label: string; tone: BadgeTone; icon: LucideIcon }> = {
  draft: { label: "Draft", tone: "muted", icon: FileText },
  pending: { label: "Pending approval", tone: "warning", icon: Clock },
  approved: { label: "Approved", tone: "info", icon: ShieldCheck },
  ordered: { label: "Ordered", tone: "info", icon: Truck },
  partially_received: { label: "Partially received", tone: "warning", icon: PackageOpen },
  received: { label: "Received", tone: "success", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", tone: "danger", icon: XCircle },
}

const RECEIPT_STATUS_META: Record<string, { label: string; tone: BadgeTone; icon: LucideIcon }> = {
  draft: { label: "Draft", tone: "muted", icon: FileText },
  received: { label: "Received", tone: "success", icon: CheckCircle2 },
  voided: { label: "Voided", tone: "danger", icon: XCircle },
  cancelled: { label: "Cancelled", tone: "danger", icon: XCircle },
}

function StatusPill({ meta, fallback }: { meta?: { label: string; tone: BadgeTone; icon: LucideIcon }; fallback: string }) {
  if (!meta) return <Badge variant="muted">{fallback}</Badge>
  const Icon = meta.icon
  return (
    <Badge variant={meta.tone}>
      <Icon aria-hidden />
      {meta.label}
    </Badge>
  )
}

const RECEIVABLE_STATUSES: PurchaseOrder["status"][] = ["approved", "ordered"]

/** "2026-10-01T00:00:00Z" -> "2026-10-01" (order dates are whole days). */
const dateOnly = (value: string | null | undefined) => (value ? value.slice(0, 10) : "")

const PURCHASE_TABS = ["orders", "receipts"] as const

/** "Export all" pages through the receipts API at its maximum page size, up to a sane cap. */
const RECEIPT_EXPORT_PAGE_SIZE = 200
const RECEIPT_EXPORT_MAX_ROWS = 10_000

export default function PurchasesPage() {
  return (
    <Suspense fallback={null}>
      <PurchasesPageContent />
    </Suspense>
  )
}

function PurchasesPageContent() {
  const [activeTab, setActiveTab] = useTabParam(PURCHASE_TABS)
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  // Server-paged rows actually shown in the "Purchase orders" table.
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [orderServerCount, setOrderServerCount] = useState(0)
  const [orderServerTotalPages, setOrderServerTotalPages] = useState(1)
  // Per-status totals for the KPI cards (GET /purchasing/purchase-orders/status-counts).
  const [statusCounts, setStatusCounts] = useState<PurchaseOrderStatusCounts | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [ordersError, setOrdersError] = useState<string | null>(null)
  const [receiving, setReceiving] = useState(false)
  // One server page of goods received (filters and paging are applied by the API).
  const [directReceipts, setDirectReceipts] = useState<DirectGoodsReceipt[]>([])
  const [directReceiptsCount, setDirectReceiptsCount] = useState(0)
  const [directReceiptsTotalPages, setDirectReceiptsTotalPages] = useState(1)
  const [directReceiptsLoading, setDirectReceiptsLoading] = useState(true)
  // One Idempotency-Key per user action (approve/cancel/void/receive of one document), reused if the same
  // action is retried, so a double click or a retried request is applied once on the server.
  const actionKeys = useRef(createIdempotencyKeyTracker())
  const [receiveModalOpen, setReceiveModalOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null)
  // One branch scope for orders, counts and receipts (ViewAll users pick; others are pinned).
  const branchFilter = useBranchFilter()
  const purchasesBranchId = branchFilter.branchId
  // An order is received into its own branch, so receiving it from another branch needs a switch first.
  const receivingElsewhere = useIsOtherBranch(selectedOrder?.branch_id)
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, number>>({})
  const [receiveBatchNumbers, setReceiveBatchNumbers] = useState<Record<string, string>>({})
  const [receiveExpiryDates, setReceiveExpiryDates] = useState<Record<string, string>>({})
  const [receiveSellingPrices, setReceiveSellingPrices] = useState<Record<string, string>>({})
  /** Free units typed per line; a line not typed in gets the ordered free goods (in proportion when short). */
  const [receiveFreeQuantities, setReceiveFreeQuantities] = useState<Record<string, string>>({})
  /** The rate on the supplier's bill per line, as typed; starts at the ordered rate. */
  const [receiveRates, setReceiveRates] = useState<Record<string, string>>({})
  /** Currency each line's selling price was typed in; INR (an Indian MRP) is converted to NPR when posted. */
  const [receiveSellingCurrencies, setReceiveSellingCurrencies] = useState<Record<string, PriceCurrency>>({})
  const allowInr = useCurrency().currentCurrency.code === "NPR"
  // The order's medicines, read when the receipt opens: their packing (to show "300 tablets (3 boxes)") and the
  // catalog selling price a new batch starts from.
  const [receiveMedicines, setReceiveMedicines] = useState<Record<string, Medicine>>({})
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("")
  const [invoiceNumberError, setInvoiceNumberError] = useState<string | null>(null)
  const [createBackorder, setCreateBackorder] = useState(true)
  /** A due date picked for the supplier's bill at receive; "" = the supplier's credit days decide. */
  const [receiveDueDate, setReceiveDueDate] = useState("")
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [receiptModalOpen, setReceiptModalOpen] = useState(false)
  const [billTarget, setBillTarget] = useState<PurchaseBillTarget | null>(null)
  const queryClient = useQueryClient()
  const [prefillLowStock, setPrefillLowStock] = useState(false)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [voidTarget, setVoidTarget] = useState<DirectGoodsReceipt | null>(null)
  const [voidReason, setVoidReason] = useState("")
  const [voiding, setVoiding] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<PurchaseOrder | null>(null)
  const [cancelReason, setCancelReason] = useState("")
  const { toast } = useToast()
  // Settings → Internal controls: when on, the user who raised an order can't approve it.
  const { data: settingRows } = useSystemSettings()
  const poSecondApprover = parseInternalControls(settingRows).poSecondApprover

  const handleConfirmCancel = async () => {
    const target = cancelTarget
    if (!target) return
    setCancellingId(target.id)
    try {
      const reason = cancelReason.trim()
      const key = actionKeys.current.keyFor(`cancel:${target.id}:${reason}`)
      const { error } = await purchasesApi.cancelPurchaseOrder(target.id, reason, key)
      if (error) throw new Error(error)
      actionKeys.current.reset()
      setCancelTarget(null)
      toast({ title: "Purchase order cancelled" })
      await loadOrders()
    } catch (error) {
      toast({
        title: "Could not cancel",
        description: apiRequestErrorMessage(error),
        variant: "destructive",
      })
    } finally {
      setCancellingId(null)
    }
  }

  // Purchase Orders table: search / status filter / pagination (all server-side)
  const [orderSearch, setOrderSearch] = useState("")
  const [debouncedOrderSearch, setDebouncedOrderSearch] = useState("")
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("all")
  const [orderPage, setOrderPage] = useState(1)
  const ORDER_PAGE_SIZE = 10

  // Goods received table: search / date / supplier / source / status filters and pagination (all on the server)
  const [receiptSearch, setReceiptSearch] = useState("")
  const [debouncedReceiptSearch, setDebouncedReceiptSearch] = useState("")
  const [receiptStatusFilter, setReceiptStatusFilter] = useState<string>("all")
  const [receiptSourceFilter, setReceiptSourceFilter] = useState<GoodsReceiptSource | "all">("all")
  const [receiptSupplierId, setReceiptSupplierId] = useState("")
  const [receiptSupplierSearch, setReceiptSupplierSearch] = useState("")
  const [receiptDateRange, setReceiptDateRange] = useState<{ from: Date; to: Date } | undefined>(undefined)
  const receiptSupplierOptions = useSupplierOptions({ search: receiptSupplierSearch, includeInactive: true })
  const [receiptPage, setReceiptPage] = useState(1)
  const RECEIPT_PAGE_SIZE = 10

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedOrderSearch(orderSearch.trim()), 300)
    return () => clearTimeout(timer)
  }, [orderSearch])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedReceiptSearch(receiptSearch.trim()), 300)
    return () => clearTimeout(timer)
  }, [receiptSearch])

  const loadStatusCounts = useCallback(async () => {
    const res = await purchasesApi.getStatusCounts(purchasesBranchId)
    if (res.data) setStatusCounts(res.data)
    return res
  }, [purchasesBranchId])

  // Only the latest table request may write state, so a slow earlier search cannot overwrite a newer one.
  const ordersRequestRef = useRef(0)
  const loadOrdersTable = useCallback(async () => {
    const requestId = ++ordersRequestRef.current
    try {
      setIsLoading(true)
      setOrdersError(null)
      const res = await purchasesApi.getPurchaseOrders({
        page: orderPage,
        limit: ORDER_PAGE_SIZE,
        status: orderStatusFilter !== "all" ? orderStatusFilter : undefined,
        search: debouncedOrderSearch || undefined,
        branchId: purchasesBranchId,
      })
      if (requestId !== ordersRequestRef.current) return
      if (res.error) throw new Error(res.error)
      setOrders(res.data)
      setOrderServerCount(res.count)
      setOrderServerTotalPages(Math.max(1, res.totalPages))
    } catch (error) {
      if (requestId !== ordersRequestRef.current) return
      console.error("Failed to load purchase orders", error)
      setOrders([])
      setOrdersError(apiRequestErrorMessage(error))
    } finally {
      if (requestId === ordersRequestRef.current) setIsLoading(false)
    }
  }, [orderPage, orderStatusFilter, debouncedOrderSearch, purchasesBranchId])

  /** Refreshes the summary counts and the current table page. Every mutation handler below calls it. */
  const loadOrders = useCallback(async () => {
    await Promise.all([loadStatusCounts(), loadOrdersTable()])
  }, [loadStatusCounts, loadOrdersTable])

  // The receipt filters as the API takes them; picked days are whole Nepal days, whatever the device's time zone.
  const receiptFilters = useMemo(
    () => ({
      branchId: purchasesBranchId,
      status: receiptStatusFilter,
      search: debouncedReceiptSearch || undefined,
      source: receiptSourceFilter,
      supplierId: receiptSupplierId || undefined,
      dateFrom: receiptDateRange?.from ? nepalDayStartUtc(formatLocalDateYmd(receiptDateRange.from)) : undefined,
      dateTo: receiptDateRange?.to ? nepalDayEndInclusiveUtc(formatLocalDateYmd(receiptDateRange.to)) : undefined,
    }),
    [purchasesBranchId, receiptStatusFilter, debouncedReceiptSearch, receiptSourceFilter, receiptSupplierId, receiptDateRange],
  )

  // Only the latest receipts request may write state (a slow earlier page/search can't overwrite a newer one).
  const receiptsRequestRef = useRef(0)
  const loadDirectReceipts = useCallback(async () => {
    const requestId = ++receiptsRequestRef.current
    try {
      setDirectReceiptsLoading(true)
      const res = await purchasesApi.getDirectReceipts({
        ...receiptFilters,
        page: receiptPage,
        limit: RECEIPT_PAGE_SIZE,
      })
      if (requestId !== receiptsRequestRef.current) return
      if (res.error) console.error("Failed to load goods received", res.error)
      setDirectReceipts(res.data)
      setDirectReceiptsCount(res.count)
      setDirectReceiptsTotalPages(Math.max(1, res.totalPages))
    } finally {
      if (requestId === receiptsRequestRef.current) setDirectReceiptsLoading(false)
    }
  }, [receiptFilters, receiptPage])

  // Export walks every server page for the current filters, not just the page on screen.
  const exportAllReceipts = useCallback(async (): Promise<DirectGoodsReceipt[]> => {
    const all: DirectGoodsReceipt[] = []
    for (let page = 1; all.length < RECEIPT_EXPORT_MAX_ROWS; page++) {
      const res = await purchasesApi.getDirectReceipts({
        ...receiptFilters,
        page,
        limit: RECEIPT_EXPORT_PAGE_SIZE,
      })
      if (res.error) throw new Error(res.error)
      all.push(...res.data)
      if (page >= res.totalPages || res.data.length === 0) break
    }
    return all
  }, [receiptFilters])

  // Initial load: summary counts.
  useEffect(() => {
    void loadStatusCounts()
  }, [loadStatusCounts])

  // Receipts from Add medicine / Bulk import are recorded a few seconds after the import (via the
  // outbox), so reload them each time the tab is opened and when the window regains focus.
  useEffect(() => {
    if (activeTab !== "receipts") return
    void loadDirectReceipts()
    const onFocus = () => void loadDirectReceipts()
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [activeTab, loadDirectReceipts])

  // Re-fetch the table whenever the page, status filter or (debounced) search term changes.
  useEffect(() => {
    void loadOrdersTable()
  }, [loadOrdersTable])

  // /dashboard/purchases?action=create&from=low-stock opens a new order pre-filled with low-stock medicines.
  useEffect(() => {
    if (searchParams.get("action") !== "create") return
    setPrefillLowStock(searchParams.get("from") === "low-stock")
    setCreateModalOpen(true)
    const params = new URLSearchParams(searchParams.toString())
    params.delete("action")
    params.delete("from")
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [searchParams, router, pathname])

  const openCreateModal = (fromLowStock: boolean) => {
    setPrefillLowStock(fromLowStock)
    setCreateModalOpen(true)
  }

  const handleApprove = async (order: PurchaseOrder) => {
    setApprovingId(order.id)
    try {
      const { error } = await purchasesApi.approvePurchaseOrder(order.id, actionKeys.current.keyFor(`approve:${order.id}`))
      if (error) throw new Error(error)
      actionKeys.current.reset()
      toast({ title: "Purchase order approved", description: `${order.order_number} can now be received.` })
      await loadOrders()
    } catch (error) {
      toast({
        title: "Could not approve",
        description: apiRequestErrorMessage(error),
        variant: "destructive",
      })
    } finally {
      setApprovingId(null)
    }
  }

  /** On the .NET backend a cancellation needs a reason, so it asks first. Legacy cancels directly, as before. */
  const handleCancelOrder = (order: PurchaseOrder) => {
    setCancelReason("")
    setCancelTarget(order)
  }

  const handleVoidReceipt = async () => {
    if (!voidTarget) return
    setVoiding(true)
    try {
      const reason = voidReason.trim() || "Voided"
      const key = actionKeys.current.keyFor(`void:${voidTarget.id}`)
      const { error } = await purchasesApi.voidGoodsReceipt(voidTarget.id, reason, key)
      if (error) throw new Error(error)
      actionKeys.current.reset()
      toast({
        title: "Receipt voided",
        description: voidTarget.purchase_order_number
          ? `Stock and the supplier payable were reversed. Purchase order ${voidTarget.purchase_order_number} is open again, so you can receive it with the right details.`
          : "Stock and the supplier payable were reversed.",
      })
      setVoidTarget(null)
      setVoidReason("")
      await Promise.all([loadDirectReceipts(), voidTarget.purchase_order_id ? loadOrders() : Promise.resolve()])
    } catch (error) {
      toast({
        title: "Could not void receipt",
        description: apiRequestErrorMessage(error),
        variant: "destructive",
      })
    } finally {
      setVoiding(false)
    }
  }

  const loadReceiveMedicines = async (order: PurchaseOrder) => {
    const ids = [...new Set(order.purchase_order_items.map((item) => item.medicine_id))]
    const results = await Promise.all(ids.map((id) => medicinesApi.getMedicine(id)))
    const byId: Record<string, Medicine> = {}
    results.forEach(({ data }) => {
      if (data) byId[data.id] = data
    })
    setReceiveMedicines(byId)
    // Fill only the prices still blank, so nothing the user typed meanwhile is overwritten.
    setReceiveSellingPrices((prev) => {
      const next = { ...prev }
      order.purchase_order_items.forEach((item) => {
        if ((next[item.id] ?? "").trim() === "") {
          next[item.id] = initialReceiptSellingPrice(
            item.selling_price,
            byId[item.medicine_id]?.unit_price,
            byId[item.medicine_id]?.latest_selling_price,
          )
        }
      })
      return next
    })
  }

  const openReceiveModal = (order: PurchaseOrder) => {
    setSelectedOrder(order)
    const initial: Record<string, number> = {}
    order.purchase_order_items.forEach((item) => {
      const remaining = item.quantity_ordered - item.quantity_received
      initial[item.id] = remaining > 0 ? remaining : 0
    })
    setReceiveQuantities(initial)
    // Pre-fill with any batch details already set at order time; receipt fills the rest.
    const batchInit: Record<string, string> = {}
    const expiryInit: Record<string, string> = {}
    const priceInit: Record<string, string> = {}
    const rateInit: Record<string, string> = {}
    order.purchase_order_items.forEach((item) => {
      batchInit[item.id] = item.batch_number ?? ""
      expiryInit[item.id] = item.expiry_date ?? ""
      priceInit[item.id] = item.selling_price !== null ? String(item.selling_price) : ""
      rateInit[item.id] = orderedRateText(item)
    })
    setReceiveFreeQuantities({})
    setReceiveRates(rateInit)
    setReceiveBatchNumbers(batchInit)
    setReceiveExpiryDates(expiryInit)
    setReceiveSellingPrices(priceInit)
    setReceiveSellingCurrencies({})
    setReceiveMedicines({})
    void loadReceiveMedicines(order)
    setSupplierInvoiceNumber(order.supplier_invoice_number ?? "")
    setInvoiceNumberError(null)
    setCreateBackorder(true)
    setReceiveDueDate("")
    setReceiveModalOpen(true)
  }

  const handleQuantityChange = (itemId: string, value: string, max: number) => {
    const qty = Number.parseFloat(value || "0")
    const clamped = Number.isFinite(qty) ? Math.min(Math.max(qty, 0), max) : 0
    setReceiveQuantities((prev) => ({ ...prev, [itemId]: clamped }))
  }

  const handleBatchNumberChange = (itemId: string, value: string) => {
    setReceiveBatchNumbers((prev) => ({ ...prev, [itemId]: value }))
  }

  const handleExpiryDateChange = (itemId: string, value: string) => {
    setReceiveExpiryDates((prev) => ({ ...prev, [itemId]: value }))
  }

  const handleSellingPriceChange = (itemId: string, value: string) => {
    setReceiveSellingPrices((prev) => ({ ...prev, [itemId]: value }))
  }

  /** Free units arriving on a line: as typed, else the ordered free goods (in proportion when the line is short). */
  const freeReceivedFor = (item: PurchaseOrderItem): number => {
    const received = receiveQuantities[item.id] ?? item.quantity_ordered - item.quantity_received
    if (received <= 0) return 0
    const typed = receiveFreeQuantities[item.id]
    if (typed !== undefined && typed.trim() !== "") {
      const free = Number(typed)
      if (!Number.isFinite(free) || free < 0) throw new Error("Free units must be zero or more.")
      return free
    }
    return proportionalFreeQuantity(item.quantity_ordered, item.free_quantity, received)
  }

  /** Quantity received × the rate on the bill, before discounts and VAT. */
  const lineAmountFor = (item: PurchaseOrderItem): number => {
    const received = receiveQuantities[item.id] ?? 0
    const rate = Number((receiveRates[item.id] ?? "").trim() || orderedRateText(item))
    return Number.isFinite(rate) ? receiptLineGross(received, rate, item.pack_size) : 0
  }

  const handleReceiveSubmit = async () => {
    if (!selectedOrder) return

    setReceiving(true)
    try {
      // A quantity below what was ordered is a short delivery: the order closes at the delivered
      // quantities and (optionally) the balance goes onto a new draft backorder.
      const itemsPayload = selectedOrder.purchase_order_items.map((item) => ({
        purchase_order_item_id: item.id,
        medicine_id: item.medicine_id,
        quantity_to_receive: receiveQuantities[item.id] ?? item.quantity_ordered - item.quantity_received,
        free_quantity_to_receive: freeReceivedFor(item),
        rate: receiptRateToSend(receiveRates[item.id], orderedRateText(item)),
        unit_cost: String(item.unit_cost),
        batch_number: (receiveBatchNumbers[item.id] ?? "").trim() || null,
        expiry_date: (receiveExpiryDates[item.id] ?? "").trim() || null,
        selling_price: priceTextInNpr((receiveSellingPrices[item.id] ?? "").trim(), receiveSellingCurrencies[item.id] ?? "NPR", 2) || null,
      }))

      // Every receipt is a supplier bill; its invoice number ties it to the VAT purchase register.
      if (!supplierInvoiceNumber.trim()) {
        setInvoiceNumberError("Enter the supplier's tax invoice / bill number.")
        document.getElementById("supplier-invoice-no")?.focus()
        return
      }

      if (!itemsPayload.some((item) => item.quantity_to_receive > 0)) {
        toast({
          title: "Nothing to receive",
          description: "Enter a quantity for at least one item, or cancel the order if nothing will arrive.",
          variant: "destructive",
        })
        return
      }

      // Today in Nepal — the UTC date is still "yesterday" between 00:00 and 05:45 NPT.
      const today = nepalTodayYmd()
      const dueProblem = dueDateError(today, receiveDueDate || null)
      if (dueProblem) {
        toast({ title: "Check the due date", description: dueProblem, variant: "destructive" })
        return
      }
      const receiveFingerprint = `receive:${selectedOrder.id}:${createBackorder}:${receiveDueDate}:${supplierInvoiceNumber.trim()}:${JSON.stringify(itemsPayload)}`
      const { data: received, error: receiveError } = await purchasesApi.receiveGoods({
        purchaseOrderId: selectedOrder.id,
        receiptDate: today,
        createBackorder,
        dueDate: receiveDueDate || null,
        supplierInvoiceNumber: supplierInvoiceNumber.trim(),
        items: itemsPayload,
        idempotencyKey: actionKeys.current.keyFor(receiveFingerprint),
      })
      if (receiveError) throw new Error(receiveError)
      actionKeys.current.reset()

      const shortLines = received?.short_line_count ?? 0
      toast({
        title: shortLines > 0 ? "Goods received (short delivery)" : "Goods received",
        description:
          shortLines > 0
            ? received?.backorder_id
              ? `Inventory and the supplier ledger were updated for what arrived. The balance of ${shortLines} ${shortLines === 1 ? "line" : "lines"} is on a new draft purchase order.`
              : `Inventory and the supplier ledger were updated for what arrived. The balance of ${shortLines} ${shortLines === 1 ? "line" : "lines"} was not reordered.`
            : "Inventory and supplier ledger have been updated.",
      })

      setReceiveModalOpen(false)
      // Show what was just received as the supplier's bill, as Add medicine and Bulk import do: the goods receipt
      // the delivery was booked on (an older server without receipts for orders shows the order).
      const receivedBill: PurchaseBillTarget =
        received?.goods_receipt_id && received.goods_receipt_id !== selectedOrder.id
          ? { kind: "receipt", id: received.goods_receipt_id }
          : { kind: "order", id: selectedOrder.id }
      // A bill opened before receiving is cached without the batches and quantities just posted.
      void queryClient.invalidateQueries({ queryKey: purchaseBillKeys.detail(receivedBill) })
      setBillTarget(receivedBill)

      // Refresh orders (stats snapshot + current table page)
      await Promise.all([loadOrders(), loadDirectReceipts()])
    } catch (error) {
      console.error("Failed to post GRN", error)
      // The API hides another branch's order (404); say why instead of "not found".
      const otherBranch =
        error instanceof DotnetApiError && error.normalized.status === 404 && selectedOrder.branch_id
          ? branchFilter.branchName(selectedOrder.branch_id)
          : null
      toast({
        title: "Failed to post goods receipt",
        description: otherBranch
          ? `This order belongs to ${otherBranch}. Switch to that branch to receive it.`
          : apiRequestErrorMessage(error),
        variant: "destructive",
      })
    } finally {
      setReceiving(false)
    }
  }

  // `orders` holds exactly the rows for the current page/status/search, fetched from the server.
  const paginatedOrders = orders
  const orderTotalPages = orderServerTotalPages
  const orderTotalItems = orderServerCount

  const receiveShortLineIds = selectedOrder
    ? shortReceivedLines(selectedOrder.purchase_order_items, receiveQuantities)
    : []

  // `directReceipts` is exactly the current server page for this status/search/branch.
  const receiptTotalPages = directReceiptsTotalPages
  const paginatedReceipts = directReceipts

  const orderColumns: Column<PurchaseOrder>[] = [
    {
      key: "orderNumber",
      header: "PO no.",
      cell: (order) => (
        <div className="max-w-[14rem]">
          <span className="block truncate whitespace-nowrap font-mono text-xs" title={order.order_number}>
            {order.order_number}
          </span>
          {order.goods_receipt_number && (
            <span className="block truncate whitespace-nowrap font-mono text-[11px] text-muted-foreground" title="Goods receipt (supplier bill)">
              → {order.goods_receipt_number}
            </span>
          )}
        </div>
      ),
      exportValue: (order) => order.order_number,
    },
    {
      key: "supplier",
      header: "Supplier",
      cell: (order) => (
        <span className="block max-w-[14rem] truncate" title={order.suppliers?.name || undefined}>
          {order.suppliers?.name || "—"}
        </span>
      ),
      exportValue: (order) => order.suppliers?.name || "",
    },
    {
      key: "orderDate",
      header: "Order date",
      cell: (order) => <span className="num whitespace-nowrap">{dateOnly(order.order_date)}</span>,
      exportValue: (order) => dateOnly(order.order_date),
    },
    ...(branchFilter.showBranchColumn
      ? [
          {
            key: "branch",
            header: "Branch",
            cell: (order: PurchaseOrder) => <span className="whitespace-nowrap text-sm">{branchFilter.branchName(order.branch_id)}</span>,
            exportValue: (order: PurchaseOrder) => branchFilter.branchName(order.branch_id),
          } satisfies Column<PurchaseOrder>,
        ]
      : []),
    {
      key: "status",
      header: "Status",
      cell: (order) => <StatusPill meta={PO_STATUS_META[order.status]} fallback={order.status} />,
      exportValue: (order) => order.status,
    },
    {
      key: "total",
      // The bill total the supplier is owed (VAT included), the same figure the payable and the bill show.
      header: "Total (incl. VAT)",
      className: "text-right",
      cell: (order) => (
        <div className="num text-right font-medium">
          <CurrencyDisplay amount={order.bill_total} />
        </div>
      ),
      exportValue: (order) => order.bill_total,
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      cell: (order) => {
        const canApprove = order.status === "draft" || order.status === "pending"
        const canReceive = RECEIVABLE_STATUSES.includes(order.status)
        const canCancel = ["draft", "pending", "approved", "ordered"].includes(order.status)
        // One primary action as a button; Cancel and View in a menu, so the column fits a laptop-width table
        // instead of clipping its buttons at the edge.
        return (
          <div className="flex items-center justify-end gap-1 whitespace-nowrap">
            {canApprove && (
              <Button
                size="sm"
                onClick={() => handleApprove(order)}
                loading={approvingId === order.id}
                loadingText="Approving…"
                title={
                  poSecondApprover
                    ? "A different user than the creator must approve before it can be received"
                    : "Approve so the order can be received"
                }
              >
                <ShieldCheck aria-hidden />
                Approve
              </Button>
            )}
            {canReceive && (
              <Button size="sm" onClick={() => openReceiveModal(order)}>
                <PackageCheck aria-hidden />
                Receive
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`More actions for ${order.order_number}`}>
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {order.goods_receipt_id && (
                  <DropdownMenuItem onClick={() => setBillTarget({ kind: "receipt", id: order.goods_receipt_id! })}>
                    <FileText aria-hidden />
                    View receipt {order.goods_receipt_number}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setBillTarget({ kind: "order", id: order.id })}>
                  <FileText aria-hidden />
                  View order
                </DropdownMenuItem>
                {canCancel && (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => handleCancelOrder(order)}
                    disabled={cancellingId === order.id}
                    title="Only possible before anything has been received"
                  >
                    <Ban aria-hidden />
                    {cancellingId === order.id ? "Cancelling…" : "Cancel order"}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]

  const receiptColumns: Column<DirectGoodsReceipt>[] = [
    {
      key: "receiptNumber",
      header: "Receipt no.",
      cell: (r) => (
        <div className="max-w-[14rem]">
          <span className="block truncate whitespace-nowrap font-mono text-xs" title={r.receipt_number}>
            {r.receipt_number}
          </span>
        </div>
      ),
      exportValue: (r) => r.receipt_number,
    },
    {
      key: "source",
      header: "From",
      cell: (r) => (
        <div className="max-w-[12rem]">
          <Badge variant={r.source === "purchase_order" ? "secondary" : "outline"} className="whitespace-nowrap font-normal">
            {GOODS_RECEIPT_SOURCE_LABELS[r.source]}
          </Badge>
          {r.purchase_order_number && (
            <span className="mt-0.5 block truncate whitespace-nowrap font-mono text-[11px] text-muted-foreground" title="Purchase order this delivery was for">
              {r.purchase_order_number}
            </span>
          )}
        </div>
      ),
      exportValue: (r) =>
        r.purchase_order_number
          ? `${GOODS_RECEIPT_SOURCE_LABELS[r.source]} ${r.purchase_order_number}`
          : GOODS_RECEIPT_SOURCE_LABELS[r.source],
    },
    {
      key: "supplier",
      header: "Supplier",
      cell: (r) => (
        <span className="block max-w-[14rem] truncate" title={r.supplier_name || undefined}>
          {r.supplier_name || "—"}
        </span>
      ),
      exportValue: (r) => r.supplier_name || "",
    },
    {
      key: "bill",
      header: "Bill / invoice no.",
      cell: (r) => <span className="font-mono text-xs">{r.supplier_invoice_number || "—"}</span>,
      exportValue: (r) => r.supplier_invoice_number || "",
    },
    {
      key: "date",
      header: "Date",
      cell: (r) => <span className="num whitespace-nowrap">{dateOnly(r.receipt_date)}</span>,
      exportValue: (r) => dateOnly(r.receipt_date),
    },
    ...(branchFilter.showBranchColumn
      ? [
          {
            key: "branch",
            header: "Branch",
            cell: (r: DirectGoodsReceipt) => <span className="whitespace-nowrap text-sm">{branchFilter.branchName(r.branch_id)}</span>,
            exportValue: (r: DirectGoodsReceipt) => branchFilter.branchName(r.branch_id),
          } satisfies Column<DirectGoodsReceipt>,
        ]
      : []),
    {
      key: "items",
      header: "Items",
      className: "text-right",
      cell: (r) => <div className="num text-right">{r.item_count}</div>,
      exportValue: (r) => r.item_count,
    },
    {
      key: "total",
      header: "Total",
      className: "text-right",
      cell: (r) => (
        <div className="num text-right font-medium">
          <CurrencyDisplay amount={r.total_cost} />
        </div>
      ),
      exportValue: (r) => r.total_cost,
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <StatusPill meta={RECEIPT_STATUS_META[r.status]} fallback={r.status} />,
      exportValue: (r) => r.status,
    },
    {
      key: "actions",
      header: "",
      className: "w-40 text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            aria-label={`View receipt ${r.receipt_number}`}
            onClick={() => setBillTarget({ kind: "receipt", id: r.id })}
          >
            <FileText aria-hidden />
            View
          </Button>
          {r.status === "received" && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              aria-label={`Void receipt ${r.receipt_number}`}
              onClick={() => {
                setVoidTarget(r)
                setVoidReason("")
              }}
            >
              <Ban aria-hidden />
              Void
            </Button>
          )}
        </div>
      ),
    },
  ]

  // KPI cards come from the server-side per-status counts, so they cover every order, not just one page.
  const totalOrders = statusCounts?.total ?? 0
  const awaitingApproval = statusCounts?.draft ?? 0
  const awaitingGoods = statusCounts?.approved ?? 0
  const pendingOrders = awaitingApproval + awaitingGoods
  const receivedOrders = statusCounts?.received ?? 0
  const countsLoading = statusCounts === null
  const orderFiltersActive = debouncedOrderSearch !== "" || orderStatusFilter !== "all"
  const receiptFiltersActive =
    receiptSearch.trim() !== "" ||
    receiptStatusFilter !== "all" ||
    receiptSourceFilter !== "all" ||
    receiptSupplierId !== "" ||
    receiptDateRange !== undefined
  const clearReceiptFilters = () => {
    setReceiptSearch("")
    setReceiptStatusFilter("all")
    setReceiptSourceFilter("all")
    setReceiptSupplierId("")
    setReceiptDateRange(undefined)
    setReceiptPage(1)
  }

  const ordersEmptyState = ordersError ? (
    <ErrorState
      size="compact"
      title="Couldn't load purchase orders"
      message={ordersError}
      onRetry={loadOrders}
      retrying={isLoading}
    />
  ) : orderFiltersActive ? (
    <EmptyState
      size="compact"
      icon={Search}
      title="No purchase orders match"
      description="Try a different PO number or supplier, or clear the status filter."
      action={{
        label: "Clear filters",
        onClick: () => {
          setOrderSearch("")
          setOrderStatusFilter("all")
          setOrderPage(1)
        },
      }}
    />
  ) : (
    <EmptyState
      size="compact"
      icon={ClipboardList}
      title="No purchase orders yet"
      description="Raise a purchase order to request stock from a supplier. Once approved, you can receive it into inventory."
      action={{ label: "New purchase order", icon: Plus, onClick: () => openCreateModal(false) }}
    />
  )

  const receiptsEmptyState = receiptFiltersActive ? (
    <EmptyState
      size="compact"
      icon={Search}
      title="No receipts match"
      description="Try a different receipt, bill or PO number, a wider date range, or clear the filters."
      action={{
        label: "Clear filters",
        onClick: () => {
          clearReceiptFilters()
          setReceiptPage(1)
        },
      }}
    />
  ) : (
    <EmptyState
      size="compact"
      icon={Inbox}
      title="Nothing received yet"
      description="Deliveries appear here when you receive a purchase order, record a supplier bill, or add stock with a supplier set."
    />
  )

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Purchases"
          description="Raise purchase orders, approve them and receive stock from suppliers."
          icon={ClipboardList}
          actions={
            <div className="flex flex-wrap items-end gap-2">
              <BranchFilterSelect
                filter={branchFilter}
                id="purchases-branch"
                hideLabel
                onChange={() => {
                  // Both lists are server-paged per branch: a page number from the old branch may not exist.
                  setOrderPage(1)
                  setReceiptPage(1)
                }}
              />
              <Button variant="outline" onClick={() => openCreateModal(true)}>
                <TrendingDown aria-hidden />
                Reorder low stock
              </Button>
              <Button onClick={() => openCreateModal(false)}>
                <Plus aria-hidden />
                New purchase order
              </Button>
            </div>
          }
        />

        <Section spacing="lg">
          <StatGrid cols={4}>
            <StatCard
              label="Total orders"
              value={<span className="num">{totalOrders}</span>}
              hint="All purchase orders"
              icon={Package}
              tone="primary"
              loading={countsLoading}
            />
            <StatCard
              label="Open orders"
              value={<span className="num">{pendingOrders}</span>}
              hint={
                awaitingApproval > 0
                  ? `Awaiting approval or receipt · ${awaitingApproval} to approve`
                  : "Awaiting approval or receipt"
              }
              icon={Clock}
              tone={pendingOrders > 0 ? "warning" : "default"}
              loading={countsLoading}
            />
            <StatCard
              label="Awaiting goods"
              value={<span className="num">{awaitingGoods}</span>}
              hint="Approved, not yet received"
              icon={Truck}
              tone="info"
              loading={countsLoading}
            />
            <StatCard
              label="Received"
              value={<span className="num">{receivedOrders}</span>}
              hint="Completed orders"
              icon={CheckCircle2}
              tone="success"
              loading={countsLoading}
            />
          </StatGrid>
        </Section>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-0">
          <TabsList aria-label="Purchase entries" className="max-w-full overflow-x-auto">
            <TabsTrigger value="orders">
              <ClipboardList aria-hidden />
              Purchase orders
              {pendingOrders > 0 && (
                <Badge variant="secondary" className="num ml-1 px-1.5 text-[11px]" aria-label={`${pendingOrders} open`}>
                  {pendingOrders}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="receipts">
              <Boxes aria-hidden />
              Goods received
            </TabsTrigger>
          </TabsList>

          <TabsContent value="orders">
            <Section spacing="lg">
              <ReorderSuggestions onCreated={loadOrders} />
            </Section>

            <Section spacing="lg">
              <Card>
                <CardHeader>
                  <CardTitle>Purchase orders</CardTitle>
                  <CardDescription>
                    Draft → approved → received. Approve drafts, then receive goods to add them to stock. A short
                    delivery is received as it arrived, and the balance can go onto a backorder.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <DataTable<PurchaseOrder>
                    data={paginatedOrders}
                    columns={orderColumns}
                    isLoading={isLoading}
                    emptyMessage="No purchase orders yet. Create your first one to manage procurement."
                    emptyState={ordersEmptyState}
                    searchPlaceholder="Search PO no. or supplier…"
                    searchValue={orderSearch}
                    onSearch={(v) => {
                      setOrderSearch(v)
                      setOrderPage(1)
                    }}
                    currentPage={orderPage}
                    totalPages={orderTotalPages}
                    totalItems={orderTotalItems}
                    itemsPerPage={ORDER_PAGE_SIZE}
                    onPageChange={setOrderPage}
                    showSerialNumber
                    serialOffset={(orderPage - 1) * ORDER_PAGE_SIZE}
                    enableExport
                    exportFilename="purchase-orders"
                    exportTitle="Purchase Orders"
                    filters={
                      <Select
                        value={orderStatusFilter}
                        onValueChange={(v) => {
                          setOrderStatusFilter(v)
                          setOrderPage(1)
                        }}
                      >
                        <SelectTrigger className="w-full sm:w-[180px]" aria-label="Filter by status">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All statuses</SelectItem>
                          <SelectItem value="open">Open (draft or approved)</SelectItem>
                          <SelectItem value="draft">Draft · awaiting approval</SelectItem>
                          <SelectItem value="approved">Approved · awaiting goods</SelectItem>
                          <SelectItem value="received">Received</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    }
                  />
                </CardContent>
              </Card>
            </Section>
          </TabsContent>

          <TabsContent value="receipts">
            <Section spacing="lg">
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                  <div className="space-y-1.5">
                    <CardTitle>Goods received (GRN)</CardTitle>
                    <CardDescription>
                      Every supplier delivery: received against a purchase order, recorded here as a supplier bill, or
                      added through Add medicine or Bulk import with a supplier set.
                    </CardDescription>
                  </div>
                  <Button onClick={() => setReceiptModalOpen(true)}>
                    <Plus aria-hidden />
                    Record supplier bill
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter goods received">
                    <DateRangePicker
                      dateRange={receiptDateRange}
                      onDateRangeChange={(range) => {
                        setReceiptDateRange(range)
                        setReceiptPage(1)
                      }}
                    />
                    <SupplierCombobox
                      suppliers={receiptSupplierOptions.options}
                      value={receiptSupplierId}
                      onValueChange={(v) => {
                        setReceiptSupplierId(v)
                        setReceiptPage(1)
                      }}
                      onSearchChange={setReceiptSupplierSearch}
                      isSearching={receiptSupplierOptions.isSearching}
                      isLoading={receiptSupplierOptions.isLoading}
                      error={receiptSupplierOptions.error}
                      onRetry={receiptSupplierOptions.refetch}
                      selectedLabel={receiptSupplierOptions.knownOptions.find((s) => s.id === receiptSupplierId)?.name}
                      placeholder="All suppliers"
                      aria-label="Filter by supplier"
                      className="h-10 w-full sm:w-[200px]"
                    />
                    <Select
                      value={receiptSourceFilter}
                      onValueChange={(v) => {
                        setReceiptSourceFilter(v as GoodsReceiptSource | "all")
                        setReceiptPage(1)
                      }}
                    >
                      <SelectTrigger className="w-full sm:w-[210px]" aria-label="Filter by where it came from">
                        <SelectValue placeholder="From" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">From anywhere</SelectItem>
                        <SelectItem value="purchase_order">{GOODS_RECEIPT_SOURCE_LABELS.purchase_order}</SelectItem>
                        <SelectItem value="supplier_bill">{GOODS_RECEIPT_SOURCE_LABELS.supplier_bill}</SelectItem>
                        <SelectItem value="stock_entry">{GOODS_RECEIPT_SOURCE_LABELS.stock_entry}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={receiptStatusFilter}
                      onValueChange={(v) => {
                        setReceiptStatusFilter(v)
                        setReceiptPage(1)
                      }}
                    >
                      <SelectTrigger className="w-full sm:w-[160px]" aria-label="Filter by status">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="received">Received</SelectItem>
                        <SelectItem value="voided">Voided</SelectItem>
                      </SelectContent>
                    </Select>
                    {receiptFiltersActive && (
                      <Button variant="ghost" size="sm" className="h-10" onClick={clearReceiptFilters}>
                        <X aria-hidden />
                        Clear filters
                      </Button>
                    )}
                  </div>
                  <DataTable<DirectGoodsReceipt>
                    data={paginatedReceipts}
                    columns={receiptColumns}
                    isLoading={directReceiptsLoading}
                    emptyMessage="Nothing received yet."
                    emptyState={receiptsEmptyState}
                    searchPlaceholder="Search GRN, PO, bill no. or supplier…"
                    searchValue={receiptSearch}
                    onSearch={(v) => {
                      setReceiptSearch(v)
                      setReceiptPage(1)
                    }}
                    currentPage={receiptPage}
                    totalPages={receiptTotalPages}
                    totalItems={directReceiptsCount}
                    itemsPerPage={RECEIPT_PAGE_SIZE}
                    onPageChange={setReceiptPage}
                    showSerialNumber
                    serialOffset={(receiptPage - 1) * RECEIPT_PAGE_SIZE}
                    enableExport
                    exportFilename="goods-received"
                    exportTitle="Goods Received"
                    onExportAll={exportAllReceipts}
                  />
                </CardContent>
              </Card>
            </Section>
          </TabsContent>
        </Tabs>

        <Dialog open={receiveModalOpen} onOpenChange={setReceiveModalOpen}>
          <DialogContent className={DIALOG_CONTENT_SCROLL_BODY_CLASS}>
            <DialogHeader className="px-6 pb-2 pt-6">
              <DialogTitle>Receive goods</DialogTitle>
            </DialogHeader>
            {selectedOrder && (
              <>
                <DialogScrollBody className="space-y-4 py-4">
                  <SwitchBranchNotice targetBranchId={selectedOrder.branch_id} action="receive this order" />
                  <p className="text-sm text-muted-foreground">
                    Posting a goods receipt (GRN) for PO{" "}
                    <span className="font-mono text-foreground">{selectedOrder.order_number}</span>
                    {selectedOrder.suppliers?.name && (
                      <>
                        {" "}from <span className="font-medium text-foreground">{selectedOrder.suppliers.name}</span>
                      </>
                    )}
                    {selectedOrder.branch_id && branchFilter.access.branches.length > 1 && (
                      <>
                        {" "}into <span className="font-medium text-foreground">{branchFilter.branchName(selectedOrder.branch_id)}</span>
                      </>
                    )}
                  </p>
                  <div className="space-y-1">
                    <Label htmlFor="supplier-invoice-no">
                      Supplier tax invoice / bill no.<span className="ml-0.5 text-destructive" aria-hidden>*</span>
                    </Label>
                    <Input
                      id="supplier-invoice-no"
                      placeholder="As printed on the bill that came with the goods"
                      value={supplierInvoiceNumber}
                      onChange={(e) => {
                        setSupplierInvoiceNumber(e.target.value)
                        if (invoiceNumberError) setInvoiceNumberError(null)
                      }}
                      maxLength={64}
                      required
                      aria-required
                      aria-invalid={!!invoiceNumberError}
                      aria-describedby="supplier-invoice-no-hint"
                    />
                    <FieldError message={invoiceNumberError ?? undefined} />
                    <p id="supplier-invoice-no-hint" className="text-xs text-muted-foreground">
                      Required. The bill number the goods came with; it is used for VAT records and the supplier ledger.
                    </p>
                  </div>
                  <div className="sm:max-w-xs">
                    <BillDueDateField
                      id="receive-due-date"
                      billDate={nepalTodayYmd()}
                      creditDays={undefined}
                      override={receiveDueDate}
                      onOverrideChange={setReceiveDueDate}
                    />
                  </div>
                  <p className="rounded-md border border-info/20 bg-info/10 px-3 py-2 text-xs text-foreground">
                    Enter what actually arrived, as on the supplier&apos;s bill: quantity, free units, rate, batch no.,
                    expiry and selling price. What you enter here replaces what was on the order. Batch no., expiry and
                    selling price (marked <span className="text-destructive">*</span>) are required for each line that
                    arrived; a line with 0 received needs none. Anything short closes at the delivered quantity. If you
                    make a mistake, void the receipt and receive the order again.
                  </p>
                  {receiveShortLineIds.length > 0 && (
                    <div
                      role="status"
                      className="space-y-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-foreground"
                    >
                      <p className="flex items-start gap-1.5">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
                        <span>
                          Short delivery on <span className="num">{receiveShortLineIds.length}</span>{" "}
                          {receiveShortLineIds.length === 1 ? "line" : "lines"}. Stock, the supplier payable and the
                          purchase voucher will use the quantities received.
                        </span>
                      </p>
                      <label htmlFor="create-backorder" className="flex items-center gap-2 font-medium">
                        <Switch id="create-backorder" checked={createBackorder} onCheckedChange={setCreateBackorder} />
                        Put the undelivered balance on a new draft purchase order (backorder)
                      </label>
                    </div>
                  )}
                  <div className="rounded-md border max-h-80 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead className="text-right">Ordered</TableHead>
                          <TableHead className="text-right">Received</TableHead>
                          <TableHead className="text-right">Receive now</TableHead>
                          <TableHead className="text-right" title="Free (bonus) units that came with this line, in units">
                            Free
                          </TableHead>
                          <TableHead className="text-right" title="The rate on the supplier's bill (per pack for a line ordered in packs)">
                            Rate
                          </TableHead>
                          <TableHead>
                            Batch no. <span className="text-destructive" aria-hidden>*</span>
                          </TableHead>
                          <TableHead>
                            Expiry <span className="text-destructive" aria-hidden>*</span>
                          </TableHead>
                          <TableHead className="text-right">
                            Selling price <span className="text-destructive" aria-hidden>*</span>
                          </TableHead>
                          <TableHead className="text-right" title="Quantity × rate, before discounts and VAT">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedOrder.purchase_order_items.map((item: PurchaseOrderItem) => {
                          const remaining = item.quantity_ordered - item.quantity_received
                          const itemName = item.medicines?.name || "Medicine"
                          const lineMedicine = receiveMedicines[item.medicine_id]
                          const receivingNow = receiveQuantities[item.id] ?? 0
                          return (
                            <TableRow key={item.id}>
                              <TableCell>
                                <div className="max-w-[12rem] truncate font-medium" title={itemName}>
                                  {itemName}
                                </div>
                              </TableCell>
                              <TableCell className="num whitespace-nowrap text-right">
                                {formatReceiptQuantity(item.quantity_ordered, lineMedicine)}
                                {item.free_quantity > 0 && (
                                  <span
                                    className="block text-xs text-muted-foreground"
                                    title="Free (bonus) units arrive with the paid ones; on a short delivery, in proportion"
                                  >
                                    + {item.free_quantity} free
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="num whitespace-nowrap text-right">
                                {formatReceiptQuantity(item.quantity_received, lineMedicine)}
                              </TableCell>
                              <TableCell className="text-right">
                                <Input
                                  type="number"
                                  min={0}
                                  max={remaining}
                                  step="any"
                                  value={receiveQuantities[item.id] ?? 0}
                                  onChange={(e) => handleQuantityChange(item.id, e.target.value, remaining)}
                                  className="num w-24 ml-auto text-right"
                                  aria-label={`Quantity to receive for ${itemName}`}
                                />
                                {lineMedicine && receivingNow > 0 && (
                                  <span className="num mt-1 block whitespace-nowrap text-xs text-muted-foreground">
                                    {formatReceiptQuantity(receivingNow, lineMedicine)}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <Input
                                  type="number"
                                  min={0}
                                  step="any"
                                  value={receivingNow > 0 ? (receiveFreeQuantities[item.id] ?? String(freeReceivedFor(item))) : "0"}
                                  disabled={receivingNow <= 0}
                                  onChange={(e) => setReceiveFreeQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                  className="num w-20 ml-auto text-right"
                                  aria-label={`Free units received for ${itemName}`}
                                  title="Free (bonus) units that came with this line. Can be more than ordered if the supplier added extra."
                                />
                              </TableCell>
                              <TableCell className="text-right">
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  value={receiveRates[item.id] ?? ""}
                                  disabled={receivingNow <= 0}
                                  onChange={(e) => setReceiveRates((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                  className="num w-24 ml-auto text-right"
                                  aria-label={`Rate on the bill for ${itemName}`}
                                  title="The rate on the supplier's bill. Change it if the bill differs from the order; the discount and VAT follow."
                                />
                                {item.pack_size && item.pack_size > 1 ? (
                                  <span className="mt-1 block whitespace-nowrap text-xs text-muted-foreground">
                                    per {item.pack_size.toLocaleString("en-US")} units
                                  </span>
                                ) : null}
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="text"
                                  placeholder="e.g. B2401"
                                  value={receiveBatchNumbers[item.id] ?? ""}
                                  onChange={(e) => handleBatchNumberChange(item.id, e.target.value)}
                                  className="w-32"
                                  aria-label={`Batch number for ${itemName}`}
                                  aria-required
                                  title="Batch/lot number from the supplier (required before the goods can be received)"
                                />
                              </TableCell>
                              <TableCell>
                                <DatePicker
                                  value={receiveExpiryDates[item.id] ?? ""}
                                  onChange={(v) => handleExpiryDateChange(item.id, v)}
                                  presets={EXPIRY_PRESETS}
                                  allowFuture
                                  placeholder="Expiry"
                                  compact
                                  className="w-40"
                                  aria-label={`Expiry date for ${itemName}`}
                                  aria-required
                                  title="Expiry date for this batch — enables FEFO (first-expiry-first-out) deduction at sale time (required before the goods can be received)"
                                />
                              </TableCell>
                              <TableCell>
                                <div className="flex justify-end gap-1">
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="0.00"
                                  value={receiveSellingPrices[item.id] ?? ""}
                                  onChange={(e) => handleSellingPriceChange(item.id, e.target.value)}
                                  className="num w-28 text-right"
                                  aria-label={`Selling price for ${itemName}`}
                                  aria-required
                                  title="Shelf selling price for this batch (required before the goods can be received)"
                                />
                                {allowInr && (
                                  <PriceCurrencyToggle
                                    label={`Selling price currency for ${itemName}`}
                                    value={receiveSellingCurrencies[item.id] ?? "NPR"}
                                    onChange={(next) => setReceiveSellingCurrencies((prev) => ({ ...prev, [item.id]: next }))}
                                    className="w-[4.75rem]"
                                  />
                                )}
                                </div>
                              </TableCell>
                              <TableCell className="num text-right">
                                <CurrencyDisplay amount={lineAmountFor(item)} />
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </DialogScrollBody>
                <DialogStickyFooter className="flex-col-reverse sm:flex-row">
                  <Button variant="outline" onClick={() => setReceiveModalOpen(false)} disabled={receiving}>
                    Cancel
                  </Button>
                  <Button onClick={handleReceiveSubmit} loading={receiving} loadingText="Posting…" disabled={receivingElsewhere}>
                    <PackageCheck aria-hidden />
                    Post GRN
                  </Button>
                </DialogStickyFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        <CreateDirectReceiptModal
          isOpen={receiptModalOpen}
          onClose={() => setReceiptModalOpen(false)}
          onCreated={() => void loadDirectReceipts()}
        />

        <PurchaseBillDetailDialog target={billTarget} onClose={() => setBillTarget(null)} />

        <CreatePurchaseOrderModal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onCreated={loadOrders}
          prefillLowStock={prefillLowStock}
        />

        <Dialog open={!!voidTarget} onOpenChange={(open) => !open && setVoidTarget(null)}>
          <DialogContent className={cn(DIALOG_CONTENT_SCROLL_BODY_CLASS, "sm:max-w-2xl")}>
            <DialogHeader className="px-6 pb-2 pt-6">
              <DialogTitle>Void receipt {voidTarget?.receipt_number}?</DialogTitle>
            </DialogHeader>
            <DialogScrollBody className="space-y-3 py-4">
              <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-foreground">
                This reverses the stock and supplier payable for every line on this receipt — as a return to{" "}
                {voidTarget?.supplier_name || "the supplier"}. It fails if any of that stock has already been sold or
                otherwise reduced below what was received.
                {voidTarget?.purchase_order_number && (
                  <>
                    {" "}
                    Purchase order <span className="font-mono">{voidTarget.purchase_order_number}</span> goes back to
                    Approved, so you can receive it again with the right rate, quantity, batch or bill.
                  </>
                )}
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="void-reason">Reason</Label>
                <Textarea
                  id="void-reason"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  maxLength={500}
                  placeholder="e.g. entered against the wrong supplier"
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">Optional — kept with the receipt for audit.</p>
              </div>
            </DialogScrollBody>
            <DialogStickyFooter className="flex-col-reverse sm:flex-row">
              <Button variant="outline" onClick={() => setVoidTarget(null)} disabled={voiding}>
                Keep receipt
              </Button>
              <Button variant="destructive" onClick={handleVoidReceipt} loading={voiding} loadingText="Voiding…">
                Void receipt
              </Button>
            </DialogStickyFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
          <DialogContent className={cn(DIALOG_CONTENT_SCROLL_BODY_CLASS, "sm:max-w-2xl")}>
            <DialogHeader className="px-6 pb-2 pt-6">
              <DialogTitle>Cancel purchase order {cancelTarget?.order_number}?</DialogTitle>
            </DialogHeader>
            <DialogScrollBody className="space-y-3 py-4">
              <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-foreground">
                This can&apos;t be undone. Only possible before anything has been received. The reason is kept with
                the order.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="cancel-reason">
                  Reason <span className="text-destructive" aria-hidden>*</span>
                </Label>
                <Textarea
                  id="cancel-reason"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. supplier could not deliver"
                  maxLength={512}
                  rows={2}
                  aria-required
                />
              </div>
            </DialogScrollBody>
            <DialogStickyFooter className="flex-col-reverse sm:flex-row">
              <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={cancellingId !== null}>
                Keep order
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmCancel}
                disabled={cancelReason.trim() === ""}
                loading={cancellingId !== null}
                loadingText="Cancelling…"
              >
                Cancel order
              </Button>
            </DialogStickyFooter>
          </DialogContent>
        </Dialog>
      </PageContainer>
    </DashboardLayout>
  )
}
