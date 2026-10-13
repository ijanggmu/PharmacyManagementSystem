/**
 * Purchase Orders Page
 * Manage purchase orders and supplier orders
 */

"use client"

import { BillDueDateField } from "@/components/shared/bill-due-date-field"
import { dueDateError } from "@/lib/utils/payment-terms"
import { Suspense, useCallback, useEffect, useRef, useState } from "react"
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
  type LucideIcon,
} from "lucide-react"
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
import { PurchaseBillDetailDialog, type PurchaseBillTarget } from "@/features/purchases/components/purchase-bill-detail-dialog"
import ReorderSuggestions from "@/features/purchases/components/reorder-suggestions"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DIALOG_CONTENT_DETAIL_CLASS } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { DatePicker, EXPIRY_PRESETS } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { DataTable, Column } from "@/components/ui/data-table"
import { useToast } from "@/hooks/use-toast"
import { nepalTodayYmd } from "@/lib/utils/date-limits"

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
  // One server page of direct receipts (status/search/paging are applied by the API).
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
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("")
  const [createBackorder, setCreateBackorder] = useState(true)
  /** A due date picked for the supplier's bill at receive; "" = the supplier's credit days decide. */
  const [receiveDueDate, setReceiveDueDate] = useState("")
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [receiptModalOpen, setReceiptModalOpen] = useState(false)
  const [billTarget, setBillTarget] = useState<PurchaseBillTarget | null>(null)
  const [prefillLowStock, setPrefillLowStock] = useState(false)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [voidTarget, setVoidTarget] = useState<DirectGoodsReceipt | null>(null)
  const [voidReason, setVoidReason] = useState("")
  const [voiding, setVoiding] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<PurchaseOrder | null>(null)
  const [cancelReason, setCancelReason] = useState("")
  const { toast } = useToast()

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

  // Direct & Bulk Import Receipts table: search / status filter / pagination
  const [receiptSearch, setReceiptSearch] = useState("")
  const [debouncedReceiptSearch, setDebouncedReceiptSearch] = useState("")
  const [receiptStatusFilter, setReceiptStatusFilter] = useState<string>("all")
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

  // Only the latest receipts request may write state (a slow earlier page/search can't overwrite a newer one).
  const receiptsRequestRef = useRef(0)
  const loadDirectReceipts = useCallback(async () => {
    const requestId = ++receiptsRequestRef.current
    try {
      setDirectReceiptsLoading(true)
      const res = await purchasesApi.getDirectReceipts({
        branchId: purchasesBranchId,
        page: receiptPage,
        limit: RECEIPT_PAGE_SIZE,
        status: receiptStatusFilter,
        search: debouncedReceiptSearch || undefined,
      })
      if (requestId !== receiptsRequestRef.current) return
      if (res.error) console.error("Failed to load direct receipts", res.error)
      setDirectReceipts(res.data)
      setDirectReceiptsCount(res.count)
      setDirectReceiptsTotalPages(Math.max(1, res.totalPages))
    } finally {
      if (requestId === receiptsRequestRef.current) setDirectReceiptsLoading(false)
    }
  }, [purchasesBranchId, receiptPage, receiptStatusFilter, debouncedReceiptSearch])

  // Export walks every server page for the current branch/status/search, not just the page on screen.
  const exportAllReceipts = useCallback(async (): Promise<DirectGoodsReceipt[]> => {
    const all: DirectGoodsReceipt[] = []
    for (let page = 1; all.length < RECEIPT_EXPORT_MAX_ROWS; page++) {
      const res = await purchasesApi.getDirectReceipts({
        branchId: purchasesBranchId,
        page,
        limit: RECEIPT_EXPORT_PAGE_SIZE,
        status: receiptStatusFilter,
        search: debouncedReceiptSearch || undefined,
      })
      if (res.error) throw new Error(res.error)
      all.push(...res.data)
      if (page >= res.totalPages || res.data.length === 0) break
    }
    return all
  }, [purchasesBranchId, receiptStatusFilter, debouncedReceiptSearch])

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
      toast({ title: "Receipt voided", description: "Stock and the supplier payable were reversed." })
      setVoidTarget(null)
      setVoidReason("")
      await loadDirectReceipts()
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
    order.purchase_order_items.forEach((item) => {
      batchInit[item.id] = item.batch_number ?? ""
      expiryInit[item.id] = item.expiry_date ?? ""
      priceInit[item.id] = item.selling_price !== null ? String(item.selling_price) : ""
    })
    setReceiveBatchNumbers(batchInit)
    setReceiveExpiryDates(expiryInit)
    setReceiveSellingPrices(priceInit)
    setSupplierInvoiceNumber(order.supplier_invoice_number ?? "")
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
        unit_cost: String(item.unit_cost),
        batch_number: (receiveBatchNumbers[item.id] ?? "").trim() || null,
        expiry_date: (receiveExpiryDates[item.id] ?? "").trim() || null,
        selling_price: (receiveSellingPrices[item.id] ?? "").trim() || null,
      }))

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
      const receiveFingerprint = `receive:${selectedOrder.id}:${createBackorder}:${receiveDueDate}:${JSON.stringify(itemsPayload)}`
      const { data: received, error: receiveError } = await purchasesApi.receiveGoods({
        purchaseOrderId: selectedOrder.id,
        receiptDate: today,
        createBackorder,
        dueDate: receiveDueDate || null,
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

      // Refresh orders (stats snapshot + current table page)
      await loadOrders()
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
        <span className="block max-w-[8rem] truncate font-mono text-xs" title={order.order_number}>
          {order.order_number}
        </span>
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
      header: "Total",
      className: "text-right",
      cell: (order) => (
        <div className="num text-right font-medium">
          <CurrencyDisplay amount={order.total_amount} />
        </div>
      ),
      exportValue: (order) => order.total_amount,
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      cell: (order) => {
        const canApprove = order.status === "draft" || order.status === "pending"
        const canReceive = RECEIVABLE_STATUSES.includes(order.status)
        const canCancel = ["draft", "pending", "approved", "ordered"].includes(order.status)
        return (
          <div className="flex flex-wrap justify-end gap-2">
            {canApprove && (
              <Button
                size="sm"
                onClick={() => handleApprove(order)}
                loading={approvingId === order.id}
                loadingText="Approving…"
                title="A different user than the creator must approve before it can be received"
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
            {canCancel && (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => handleCancelOrder(order)}
                disabled={cancellingId === order.id}
                title="Only possible before anything has been received"
                aria-label={`Cancel purchase order ${order.order_number}`}
              >
                <Ban aria-hidden />
                {cancellingId === order.id ? "Cancelling…" : "Cancel"}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              aria-label={`View purchase order ${order.order_number}`}
              onClick={() => setBillTarget({ kind: "order", id: order.id })}
            >
              <FileText aria-hidden />
              View
            </Button>
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
        <span className="block max-w-[14rem] truncate whitespace-nowrap font-mono text-xs" title={r.receipt_number}>
          {r.receipt_number}
        </span>
      ),
      exportValue: (r) => r.receipt_number,
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
      cell: (r) => <span className="num whitespace-nowrap">{r.receipt_date}</span>,
      exportValue: (r) => r.receipt_date,
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
  const receiptFiltersActive = receiptSearch.trim() !== "" || receiptStatusFilter !== "all"

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
      description="Try a different receipt, supplier or bill number, or clear the status filter."
      action={{
        label: "Clear filters",
        onClick: () => {
          setReceiptSearch("")
          setReceiptStatusFilter("all")
          setReceiptPage(1)
        },
      }}
    />
  ) : (
    <EmptyState
      size="compact"
      icon={Inbox}
      title="No direct receipts yet"
      description="These appear when you add or bulk-import medicines with a supplier selected."
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
              Direct &amp; bulk receipts
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
                    <CardTitle>Direct and bulk-import receipts</CardTitle>
                    <CardDescription>
                      Stock received without a purchase order — recorded here as a supplier bill, or from Add medicine
                      or Bulk import when a supplier was set.
                    </CardDescription>
                  </div>
                  <Button onClick={() => setReceiptModalOpen(true)}>
                    <Plus aria-hidden />
                    Record supplier bill
                  </Button>
                </CardHeader>
                <CardContent>
                  <DataTable<DirectGoodsReceipt>
                    data={paginatedReceipts}
                    columns={receiptColumns}
                    isLoading={directReceiptsLoading}
                    emptyMessage="No direct receipts yet. These appear when you add or bulk-import medicines with a supplier selected."
                    emptyState={receiptsEmptyState}
                    searchPlaceholder="Search receipt, supplier or bill no.…"
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
                    exportFilename="direct-receipts"
                    exportTitle="Direct & Bulk Import Receipts"
                    onExportAll={exportAllReceipts}
                    filters={
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
                    }
                  />
                </CardContent>
              </Card>
            </Section>
          </TabsContent>
        </Tabs>

        <Dialog open={receiveModalOpen} onOpenChange={setReceiveModalOpen}>
          <DialogContent className={DIALOG_CONTENT_DETAIL_CLASS}>
            <DialogHeader>
              <DialogTitle>Receive goods</DialogTitle>
            </DialogHeader>
            {selectedOrder && (
              <div className="space-y-4">
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
                  <Label htmlFor="supplier-invoice-no">Supplier tax invoice / bill no.</Label>
                  <Input
                    id="supplier-invoice-no"
                    placeholder="Not set on this order"
                    value={supplierInvoiceNumber}
                    disabled
                    maxLength={64}
                  />
                  <p className="text-xs text-muted-foreground">
                    Entered when the order was created; shown here for reference.
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
                  Enter what actually arrived. Batch no., expiry and selling price (marked{" "}
                  <span className="text-destructive">*</span>) are required for each line that arrived; a line with
                  0 received needs none. An order is received once — anything short closes at the delivered quantity.
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
                        <TableHead>
                          Batch no. <span className="text-destructive" aria-hidden>*</span>
                        </TableHead>
                        <TableHead>
                          Expiry <span className="text-destructive" aria-hidden>*</span>
                        </TableHead>
                        <TableHead className="text-right">
                          Selling price <span className="text-destructive" aria-hidden>*</span>
                        </TableHead>
                        <TableHead className="text-right">Line VAT</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedOrder.purchase_order_items.map((item: PurchaseOrderItem) => {
                        const remaining = item.quantity_ordered - item.quantity_received
                        const itemName = item.medicines?.name || "Medicine"
                        return (
                          <TableRow key={item.id}>
                            <TableCell>
                              <div className="max-w-[12rem] truncate font-medium" title={itemName}>
                                {itemName}
                              </div>
                            </TableCell>
                            <TableCell className="num text-right">
                              {item.quantity_ordered}
                              {item.free_quantity > 0 && (
                                <span
                                  className="block text-xs text-muted-foreground"
                                  title="Free (bonus) units arrive with the paid ones; on a short delivery, in proportion"
                                >
                                  + {item.free_quantity} free
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="num text-right">{item.quantity_received}</TableCell>
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
                              <Input
                                type="text"
                                inputMode="decimal"
                                placeholder="0.00"
                                value={receiveSellingPrices[item.id] ?? ""}
                                onChange={(e) => handleSellingPriceChange(item.id, e.target.value)}
                                className="num w-28 ml-auto text-right"
                                aria-label={`Selling price for ${itemName}`}
                                aria-required
                                title="Shelf selling price for this batch (required before the goods can be received)"
                              />
                            </TableCell>
                            <TableCell className="num text-right">
                              {Number(item.vat_amount ?? 0).toFixed(2)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                  <Button variant="outline" onClick={() => setReceiveModalOpen(false)} disabled={receiving}>
                    Cancel
                  </Button>
                  <Button onClick={handleReceiveSubmit} loading={receiving} loadingText="Posting…" disabled={receivingElsewhere}>
                    <PackageCheck aria-hidden />
                    Post GRN
                  </Button>
                </div>
              </div>
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
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Void receipt {voidTarget?.receipt_number}?</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-foreground">
                This reverses the stock and supplier payable for every line on this receipt — as a return to{" "}
                {voidTarget?.supplier_name || "the supplier"}. It fails if any of that stock has already been sold or
                otherwise reduced below what was received.
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
            </div>
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setVoidTarget(null)} disabled={voiding}>
                Keep receipt
              </Button>
              <Button variant="destructive" onClick={handleVoidReceipt} loading={voiding} loadingText="Voiding…">
                Void receipt
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancel purchase order {cancelTarget?.order_number}?</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
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
            </div>
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
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
            </div>
          </DialogContent>
        </Dialog>
      </PageContainer>
    </DashboardLayout>
  )
}
