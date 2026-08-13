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
import { Plus, Package, Truck, CheckCircle, Clock } from "lucide-react"
import { purchasesApi, type PurchaseOrder, type PurchaseOrderItem } from "@/features/purchases/api-client"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import CreatePurchaseOrderModal from "@/features/purchases/components/create-purchase-order-modal"
import ReorderSuggestions from "@/features/purchases/components/reorder-suggestions"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DIALOG_CONTENT_DETAIL_CLASS } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"

export default function PurchasesPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [receiveModalOpen, setReceiveModalOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null)
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, number>>({})
  const [receiveVatAmounts, setReceiveVatAmounts] = useState<Record<string, string>>({})
  const [receiveBatchNumbers, setReceiveBatchNumbers] = useState<Record<string, string>>({})
  const [receiveExpiryDates, setReceiveExpiryDates] = useState<Record<string, string>>({})
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("")
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const { toast } = useToast()

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

  useEffect(() => {
    loadOrders()
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
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading purchase orders...</p>
              ) : orders.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No purchase orders yet. Create your first one to manage procurement.
                </p>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12 text-center">SN</TableHead>
                        <TableHead>PO Number</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Order Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.map((order, index) => (
                        <TableRow key={order.id}>
                          <TableCell className="w-12 text-center">{index + 1}</TableCell>
                          <TableCell className="font-mono text-xs">{order.order_number}</TableCell>
                          <TableCell>{order.suppliers?.name || "—"}</TableCell>
                          <TableCell>{order.order_date}</TableCell>
                          <TableCell>
                            <Badge variant={order.status === "received" ? "default" : "secondary"}>
                              {order.status === "partially_received" ? "Partially received" : order.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{order.total_amount}</TableCell>
                          <TableCell className="text-right">
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
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
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
      </PageContainer>
    </DashboardLayout>
  )
}

