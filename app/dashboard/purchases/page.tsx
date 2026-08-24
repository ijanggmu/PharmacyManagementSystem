/**
 * Purchase Orders Page
 * Manage purchase orders and supplier orders
 */

"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Package, Truck, CheckCircle, Clock, Ban } from "lucide-react"
import { purchasesApi, type PurchaseOrder, type PurchaseOrderItem, type DirectGoodsReceipt } from "@/features/purchases/api-client"
import { CurrencyDisplay } from "@/components/currency-display"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import CreatePurchaseOrderModal from "@/features/purchases/components/create-purchase-order-modal"
import ReorderSuggestions from "@/features/purchases/components/reorder-suggestions"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DIALOG_CONTENT_DETAIL_CLASS } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DataTable, Column } from "@/components/ui/data-table"
import { useToast } from "@/hooks/use-toast"

export default function PurchasesPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [directReceipts, setDirectReceipts] = useState<DirectGoodsReceipt[]>([])
  const [directReceiptsLoading, setDirectReceiptsLoading] = useState(true)
  const [receiveModalOpen, setReceiveModalOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null)
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, number>>({})
  const [receiveVatAmounts, setReceiveVatAmounts] = useState<Record<string, string>>({})
  const [receiveBatchNumbers, setReceiveBatchNumbers] = useState<Record<string, string>>({})
  const [receiveExpiryDates, setReceiveExpiryDates] = useState<Record<string, string>>({})
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("")
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [voidTarget, setVoidTarget] = useState<DirectGoodsReceipt | null>(null)
  const [voidReason, setVoidReason] = useState("")
  const [voiding, setVoiding] = useState(false)
  const { toast } = useToast()

  // Purchase Orders table: search / status filter / pagination
  const [orderSearch, setOrderSearch] = useState("")
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("all")
  const [orderPage, setOrderPage] = useState(1)
  const ORDER_PAGE_SIZE = 10

  // Direct & Bulk Import Receipts table: search / status filter / pagination
  const [receiptSearch, setReceiptSearch] = useState("")
  const [receiptStatusFilter, setReceiptStatusFilter] = useState<string>("all")
  const [receiptPage, setReceiptPage] = useState(1)
  const RECEIPT_PAGE_SIZE = 10

  const loadOrders = async () => {
    try {
      setIsLoading(true)
      const res = await purchasesApi.getPurchaseOrders()
      setOrders(res.data as PurchaseOrder[])
    } catch (error) {
      console.error("Failed to load purchase orders", error)
      toast({
        title: "Error",
        description: "Failed to load purchase orders",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const loadDirectReceipts = async () => {
    try {
      setDirectReceiptsLoading(true)
      const res = await purchasesApi.getDirectReceipts()
      setDirectReceipts(res.data)
    } catch (error) {
      console.error("Failed to load direct receipts", error)
    } finally {
      setDirectReceiptsLoading(false)
    }
  }

  useEffect(() => {
    loadOrders()
    loadDirectReceipts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleApprove = async (order: PurchaseOrder) => {
    setApprovingId(order.id)
    try {
      const { error } = await purchasesApi.approvePurchaseOrder(order.id)
      if (error) throw new Error(error)
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

  const handleCancelOrder = async (order: PurchaseOrder) => {
    setCancellingId(order.id)
    try {
      const { error } = await purchasesApi.cancelPurchaseOrder(order.id)
      if (error) throw new Error(error)
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

  const handleVoidReceipt = async () => {
    if (!voidTarget) return
    setVoiding(true)
    try {
      const { error } = await purchasesApi.voidGoodsReceipt(voidTarget.id, voidReason.trim() || "Voided")
      if (error) throw new Error(error)
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
    const vatInit: Record<string, string> = {}
    order.purchase_order_items.forEach((item) => {
      vatInit[item.id] = ""
    })
    setReceiveVatAmounts(vatInit)
    setReceiveBatchNumbers({})
    setReceiveExpiryDates({})
    setSupplierInvoiceNumber("")
    setReceiveModalOpen(true)
  }

  const handleQuantityChange = (itemId: string, value: string) => {
    const qty = Number.parseInt(value || "0", 10)
    setReceiveQuantities((prev) => ({ ...prev, [itemId]: Number.isNaN(qty) ? 0 : qty }))
  }

  const handleVatChange = (itemId: string, value: string) => {
    setReceiveVatAmounts((prev) => ({ ...prev, [itemId]: value }))
  }

  const handleBatchNumberChange = (itemId: string, value: string) => {
    setReceiveBatchNumbers((prev) => ({ ...prev, [itemId]: value }))
  }

  const handleExpiryDateChange = (itemId: string, value: string) => {
    setReceiveExpiryDates((prev) => ({ ...prev, [itemId]: value }))
  }

  const handleReceiveSubmit = async () => {
    if (!selectedOrder) return

    try {
      const itemsPayload = selectedOrder.purchase_order_items
        .filter((item) => (receiveQuantities[item.id] || 0) > 0)
        .map((item) => {
          const vatStr = (receiveVatAmounts[item.id] ?? "").trim()
          const vat_amount =
            vatStr === "" ? 0 : Math.max(0, Number.parseFloat(vatStr) || 0)
          return {
            purchase_order_item_id: item.id,
            medicine_id: item.medicine_id,
            quantity_to_receive: receiveQuantities[item.id] || 0,
            unit_cost: String(item.unit_cost),
            vat_amount,
            batch_number: (receiveBatchNumbers[item.id] ?? "").trim() || null,
            expiry_date: (receiveExpiryDates[item.id] ?? "").trim() || null,
          }
        })

      if (itemsPayload.length === 0) {
        toast({
          title: "Nothing to receive",
          description: "Please enter a quantity for at least one item.",
          variant: "destructive",
        })
        return
      }

      const invalidVat = itemsPayload.some((row) => {
        const vatStr = (receiveVatAmounts[row.purchase_order_item_id] ?? "").trim()
        if (vatStr === "") return false
        const n = Number.parseFloat(vatStr)
        return Number.isNaN(n) || n < 0
      })
      if (invalidVat) {
        toast({
          title: "Invalid VAT",
          description: "Enter a non-negative number for VAT, or leave blank.",
          variant: "destructive",
        })
        return
      }

      const today = new Date().toISOString().split("T")[0]
      await purchasesApi.receiveGoods({
        purchaseOrderId: selectedOrder.id,
        receiptDate: today,
        supplierInvoiceNumber: supplierInvoiceNumber.trim() || null,
        items: itemsPayload,
      })

      toast({
        title: "Goods received",
        description: "Inventory and supplier ledger have been updated.",
      })

      setReceiveModalOpen(false)

      // Refresh orders
      const res = await purchasesApi.getPurchaseOrders()
      setOrders(res.data as PurchaseOrder[])
    } catch (error) {
      console.error("Failed to post GRN", error)
      toast({
        title: "Failed to post goods receipt",
        description: apiRequestErrorMessage(error),
        variant: "destructive",
      })
    }
  }

  const filteredOrders = orders.filter((o) => {
    const matchesStatus = orderStatusFilter === "all" || o.status === orderStatusFilter
    const q = orderSearch.trim().toLowerCase()
    const matchesSearch =
      !q || o.order_number.toLowerCase().includes(q) || (o.suppliers?.name || "").toLowerCase().includes(q)
    return matchesStatus && matchesSearch
  })
  const orderTotalPages = Math.max(1, Math.ceil(filteredOrders.length / ORDER_PAGE_SIZE))
  const paginatedOrders = filteredOrders.slice((orderPage - 1) * ORDER_PAGE_SIZE, orderPage * ORDER_PAGE_SIZE)

  const filteredReceipts = directReceipts.filter((r) => {
    const matchesStatus = receiptStatusFilter === "all" || r.status === receiptStatusFilter
    const q = receiptSearch.trim().toLowerCase()
    const matchesSearch =
      !q ||
      r.receipt_number.toLowerCase().includes(q) ||
      (r.supplier_name || "").toLowerCase().includes(q) ||
      (r.supplier_invoice_number || "").toLowerCase().includes(q)
    return matchesStatus && matchesSearch
  })
  const receiptTotalPages = Math.max(1, Math.ceil(filteredReceipts.length / RECEIPT_PAGE_SIZE))
  const paginatedReceipts = filteredReceipts.slice((receiptPage - 1) * RECEIPT_PAGE_SIZE, receiptPage * RECEIPT_PAGE_SIZE)

  const orderColumns: Column<PurchaseOrder>[] = [
    {
      key: "orderNumber",
      header: "PO Number",
      cell: (order) => <span className="font-mono text-xs">{order.order_number}</span>,
      exportValue: (order) => order.order_number,
    },
    {
      key: "supplier",
      header: "Supplier",
      cell: (order) => order.suppliers?.name || "—",
      exportValue: (order) => order.suppliers?.name || "",
    },
    {
      key: "orderDate",
      header: "Order Date",
      cell: (order) => order.order_date,
      exportValue: (order) => order.order_date,
    },
    {
      key: "status",
      header: "Status",
      cell: (order) => (
        <Badge variant={order.status === "received" ? "default" : "secondary"}>
          {order.status === "partially_received" ? "Partially received" : order.status}
        </Badge>
      ),
      exportValue: (order) => order.status,
    },
    {
      key: "total",
      header: "Total",
      className: "text-right",
      cell: (order) => <div className="text-right">{order.total_amount}</div>,
      exportValue: (order) => order.total_amount,
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      cell: (order) => (
        <div className="flex justify-end gap-2">
          {(order.status === "draft" || order.status === "pending") && (
            <Button
              size="sm"
              onClick={() => handleApprove(order)}
              disabled={approvingId === order.id}
              title="A different user than the creator must approve before it can be received"
            >
              {approvingId === order.id ? "Approving…" : "Approve"}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => openReceiveModal(order)}
            disabled={!["approved", "ordered", "partially_received"].includes(order.status)}
            title={
              !["approved", "ordered", "partially_received"].includes(order.status)
                ? "This order must be approved before it can be received"
                : undefined
            }
          >
            Receive
          </Button>
          {["draft", "pending", "approved", "ordered"].includes(order.status) && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => handleCancelOrder(order)}
              disabled={cancellingId === order.id}
              title="Only possible before anything has been received"
            >
              <Ban className="h-3.5 w-3.5 mr-1" />
              {cancellingId === order.id ? "Cancelling…" : "Cancel"}
            </Button>
          )}
        </div>
      ),
    },
  ]

  const receiptColumns: Column<DirectGoodsReceipt>[] = [
    {
      key: "receiptNumber",
      header: "Receipt #",
      cell: (r) => <span className="font-mono text-xs">{r.receipt_number}</span>,
      exportValue: (r) => r.receipt_number,
    },
    {
      key: "supplier",
      header: "Supplier",
      cell: (r) => r.supplier_name || "—",
      exportValue: (r) => r.supplier_name || "",
    },
    {
      key: "bill",
      header: "Bill / Invoice #",
      cell: (r) => <span className="font-mono text-xs">{r.supplier_invoice_number || "—"}</span>,
      exportValue: (r) => r.supplier_invoice_number || "",
    },
    {
      key: "date",
      header: "Date",
      cell: (r) => r.receipt_date,
      exportValue: (r) => r.receipt_date,
    },
    {
      key: "items",
      header: "Items",
      className: "text-right",
      cell: (r) => <div className="text-right tabular-nums">{r.item_count}</div>,
      exportValue: (r) => r.item_count,
    },
    {
      key: "total",
      header: "Total",
      className: "text-right",
      cell: (r) => (
        <div className="text-right tabular-nums font-medium">
          <CurrencyDisplay amount={r.total_cost} />
        </div>
      ),
      exportValue: (r) => r.total_cost,
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <Badge variant={r.status === "received" ? "default" : "secondary"}>{r.status}</Badge>,
      exportValue: (r) => r.status,
    },
    {
      key: "actions",
      header: "",
      className: "w-24",
      cell: (r) =>
        r.status === "received" && (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              setVoidTarget(r)
              setVoidReason("")
            }}
          >
            <Ban className="h-3.5 w-3.5 mr-1" />
            Void
          </Button>
        ),
    },
  ]

  const totalOrders = orders.length
  const pendingOrders = orders.filter(
    (o) => o.status === "pending" || o.status === "approved" || o.status === "ordered" || o.status === "partially_received"
  ).length
  const receivedOrders = orders.filter((o) => o.status === "received").length
  const partiallyReceivedOrders = orders.filter((o) => o.status === "partially_received").length
  const inTransitOrders = orders.filter((o) => o.status === "ordered").length

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Purchase Orders"
          description="Manage supplier orders and procurement"
          actions={
            <Button onClick={() => setCreateModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Purchase Order
            </Button>
          }
        />

        <Section spacing="lg">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalOrders}</div>
                <p className="text-xs text-muted-foreground">All purchase orders</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{pendingOrders}</div>
                <p className="text-xs text-muted-foreground">
                  Awaiting approval or receipt
                  {partiallyReceivedOrders > 0 ? ` (${partiallyReceivedOrders} partially received)` : ""}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">In Transit</CardTitle>
                <Truck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{inTransitOrders}</div>
                <p className="text-xs text-muted-foreground">Orders in transit</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Received</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{receivedOrders}</div>
                <p className="text-xs text-muted-foreground">Completed orders</p>
              </CardContent>
            </Card>
          </div>
        </Section>

        <Section spacing="lg">
          <ReorderSuggestions onCreated={loadOrders} />
        </Section>

        <Section spacing="lg">
          <Card>
            <CardHeader>
              <CardTitle>Purchase Orders</CardTitle>
              <CardDescription>View and manage all purchase orders</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable<PurchaseOrder>
                data={paginatedOrders}
                columns={orderColumns}
                isLoading={isLoading}
                emptyMessage="No purchase orders yet. Create your first one to manage procurement."
                searchPlaceholder="Search PO # or supplier..."
                searchValue={orderSearch}
                onSearch={(v) => {
                  setOrderSearch(v)
                  setOrderPage(1)
                }}
                currentPage={orderPage}
                totalPages={orderTotalPages}
                totalItems={filteredOrders.length}
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
                    <SelectTrigger className="w-[170px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="ordered">Ordered</SelectItem>
                      <SelectItem value="partially_received">Partially received</SelectItem>
                      <SelectItem value="received">Received</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                }
              />
            </CardContent>
          </Card>
        </Section>

        <Section spacing="lg">
          <Card>
            <CardHeader>
              <CardTitle>Direct &amp; Bulk Import Receipts</CardTitle>
              <CardDescription>
                Stock received without a purchase order — from Add Medicine or Bulk Import when a supplier was set
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable<DirectGoodsReceipt>
                data={paginatedReceipts}
                columns={receiptColumns}
                isLoading={directReceiptsLoading}
                emptyMessage="No direct receipts yet. These appear when you add or bulk-import medicines with a supplier selected."
                searchPlaceholder="Search receipt #, supplier, or bill #..."
                searchValue={receiptSearch}
                onSearch={(v) => {
                  setReceiptSearch(v)
                  setReceiptPage(1)
                }}
                currentPage={receiptPage}
                totalPages={receiptTotalPages}
                totalItems={filteredReceipts.length}
                itemsPerPage={RECEIPT_PAGE_SIZE}
                onPageChange={setReceiptPage}
                showSerialNumber
                serialOffset={(receiptPage - 1) * RECEIPT_PAGE_SIZE}
                enableExport
                exportFilename="direct-receipts"
                exportTitle="Direct & Bulk Import Receipts"
                filters={
                  <Select
                    value={receiptStatusFilter}
                    onValueChange={(v) => {
                      setReceiptStatusFilter(v)
                      setReceiptPage(1)
                    }}
                  >
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="received">Received</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                }
              />
            </CardContent>
          </Card>
        </Section>

        <Dialog open={receiveModalOpen} onOpenChange={setReceiveModalOpen}>
          <DialogContent className={DIALOG_CONTENT_DETAIL_CLASS}>
            <DialogHeader>
              <DialogTitle>Receive Goods</DialogTitle>
            </DialogHeader>
            {selectedOrder && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Posting goods receipt for PO <span className="font-mono">{selectedOrder.order_number}</span>
                </p>
                <div className="space-y-1">
                  <label className="text-sm font-medium" htmlFor="supplier-invoice-no">
                    Supplier tax invoice / bill no.
                  </label>
                  <Input
                    id="supplier-invoice-no"
                    placeholder="As printed on supplier document (IRD reconciliation)"
                    value={supplierInvoiceNumber}
                    onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                    maxLength={120}
                  />
                  <p className="text-xs text-muted-foreground">
                    Stored on the GRN and supplier ledger for statement matching.
                  </p>
                </div>
                <div className="rounded-md border max-h-80 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Ordered</TableHead>
                        <TableHead className="text-right">Received</TableHead>
                        <TableHead className="text-right">Receive Now</TableHead>
                        <TableHead>Batch #</TableHead>
                        <TableHead>Expiry</TableHead>
                        <TableHead className="text-right">Line VAT</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedOrder.purchase_order_items.map((item: PurchaseOrderItem) => {
                        const remaining = item.quantity_ordered - item.quantity_received
                        return (
                          <TableRow key={item.id}>
                            <TableCell>
                              <div className="font-medium">
                                {item.medicines?.name || "Medicine"}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">{item.quantity_ordered}</TableCell>
                            <TableCell className="text-right">{item.quantity_received}</TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                min={0}
                                max={remaining}
                                value={receiveQuantities[item.id] ?? 0}
                                onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                                className="w-24 ml-auto"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="text"
                                placeholder="Auto"
                                value={receiveBatchNumbers[item.id] ?? ""}
                                onChange={(e) => handleBatchNumberChange(item.id, e.target.value)}
                                className="w-32"
                                title="Batch/lot number from the supplier (optional — auto-generated if left blank)"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="date"
                                value={receiveExpiryDates[item.id] ?? ""}
                                onChange={(e) => handleExpiryDateChange(item.id, e.target.value)}
                                className="w-36"
                                title="Expiry date for this batch — enables FEFO (first-expiry-first-out) deduction at sale time"
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                placeholder="0"
                                value={receiveVatAmounts[item.id] ?? ""}
                                onChange={(e) => handleVatChange(item.id, e.target.value)}
                                className="w-28 ml-auto"
                                title="Recoverable VAT on this receipt line (optional)"
                              />
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setReceiveModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleReceiveSubmit}>Post GRN</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <CreatePurchaseOrderModal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onCreated={loadOrders}
        />

        <Dialog open={!!voidTarget} onOpenChange={(open) => !open && setVoidTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Void receipt {voidTarget?.receipt_number}?</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
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
                  placeholder="e.g. entered against the wrong supplier"
                  rows={2}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setVoidTarget(null)}>
                Keep receipt
              </Button>
              <Button variant="destructive" onClick={handleVoidReceipt} disabled={voiding}>
                {voiding ? "Voiding…" : "Void receipt"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </PageContainer>
    </DashboardLayout>
  )
}

