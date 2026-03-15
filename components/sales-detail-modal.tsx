"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DIALOG_CONTENT_DETAIL_CLASS } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Eye, Receipt, RefreshCw, X, User, Calendar, CreditCard } from "lucide-react"
import { CurrencyDisplay } from "@/components/currency-display"
import PrintReceipt from "./print-receipt"
import ProcessReturnModal from "./process-return-modal"
import { Sale } from "@/lib/api/sales"

interface SaleItem {
  id: string
  quantity: number
  unit_price: string
  total_price: string
  medicines: {
    name: string
    strength: string
    form: string
  } | null
}

interface SalesDetailModalProps {
  isOpen: boolean
  onClose: () => void
  sale: Sale | null
  onReturnProcessed?: () => void
}

export default function SalesDetailModal({ isOpen, onClose, sale, onReturnProcessed }: SalesDetailModalProps) {
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false)
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false)

  if (!sale) return null

  const getPaymentMethodBadge = (method: string) => {
    switch (method) {
      case "cash":
        return { label: "Cash", variant: "default" as const }
      case "card":
        return { label: "Card", variant: "secondary" as const }
      case "insurance":
        return { label: "Insurance", variant: "outline" as const }
      case "mixed":
        return { label: "Mixed", variant: "secondary" as const }
      default:
        return { label: method, variant: "secondary" as const }
    }
  }

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return { label: "Paid", variant: "default" as const }
      case "pending":
        return { label: "Pending", variant: "secondary" as const }
      case "refunded":
        return { label: "Refunded", variant: "destructive" as const }
      default:
        return { label: status, variant: "secondary" as const }
    }
  }

  const subtotal = sale.sale_items.reduce((sum, item) => sum + Number.parseFloat(item.total_price), 0)
  const discount = Number.parseFloat(sale.discount_amount)
  const tax = Number.parseFloat(sale.tax_amount)
  const total = Number.parseFloat(sale.total_amount)

  const handlePrintReceipt = () => {
    setIsPrintModalOpen(true)
  }

  const handleProcessReturn = () => {
    setIsReturnModalOpen(true)
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className={DIALOG_CONTENT_DETAIL_CLASS}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Sale Details - {sale.sale_number}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Sale Information */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Customer
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {sale.customers ? (
                    <div className="space-y-1">
                      <div className="font-medium">
                        {sale.customers.first_name} {sale.customers.last_name}
                      </div>
                      {sale.customers.phone && <div className="text-sm text-gray-500">{sale.customers.phone}</div>}
                      {sale.customers.email && <div className="text-sm text-gray-500">{sale.customers.email}</div>}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">Walk-in Customer</div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Sale Date
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="font-medium">{new Date(sale.sale_date).toLocaleDateString()}</div>
                  <div className="text-sm text-gray-500">{new Date(sale.sale_date).toLocaleTimeString()}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Payment
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    <Badge variant={getPaymentMethodBadge(sale.payment_method).variant}>
                      {getPaymentMethodBadge(sale.payment_method).label}
                    </Badge>
                    <div>
                      <Badge variant={getPaymentStatusBadge(sale.payment_status).variant}>
                        {getPaymentStatusBadge(sale.payment_status).label}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Items Table */}
            <Card>
              <CardHeader>
                <CardTitle>Items ({sale.sale_items.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Medicine</TableHead>
                      <TableHead>Strength/Form</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sale.sale_items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium">{item.medicines?.name || "Unknown Medicine"}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-gray-500">
                            {item.medicines?.strength} {item.medicines?.form}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right">
                          <CurrencyDisplay amount={item.unit_price} />
                        </TableCell>
                        <TableCell className="text-right">
                          <CurrencyDisplay amount={item.total_price} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Totals */}
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span><CurrencyDisplay amount={subtotal.toFixed(2)} /></span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Discount:</span>
                      <span>-<CurrencyDisplay amount={discount.toFixed(2)} /></span>
                    </div>
                  )}
                  {tax > 0 && (
                    <div className="flex justify-between">
                      <span>Tax:</span>
                      <span><CurrencyDisplay amount={tax.toFixed(2)} /></span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total:</span>
                    <span><CurrencyDisplay amount={total.toFixed(2)} /></span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                <X className="h-4 w-4 mr-2" />
                Close
              </Button>
              <Button onClick={handlePrintReceipt}>
                <Receipt className="h-4 w-4 mr-2" />
                Print Receipt
              </Button>
              {sale.payment_status === "paid" && (
                <Button variant="destructive" onClick={handleProcessReturn}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Process Return
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Print Receipt Modal */}
      <PrintReceipt
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        saleData={{
          id: sale.id,
          sale_number: sale.sale_number,
          sale_date: sale.sale_date,
          payment_method: sale.payment_method,
          total_amount: sale.total_amount,
          discount_amount: sale.discount_amount,
          tax_amount: sale.tax_amount,
          items: sale.sale_items.map(item => ({
            medicineId: item.id,
            medicineName: item.medicines?.name || "Unknown Medicine",
            strength: item.medicines?.strength || "",
            form: item.medicines?.form || "",
            quantity: item.quantity,
            unitPrice: Number.parseFloat(item.unit_price),
            totalPrice: Number.parseFloat(item.total_price)
          })),
          customer: sale.customers ? {
            id: sale.customers.id || sale.customer_id || "",
            first_name: sale.customers.first_name,
            last_name: sale.customers.last_name,
            phone: sale.customers.phone,
            email: sale.customers.email,
            address: null,
            date_of_birth: null,
            insurance_provider: null,
            insurance_number: null,
            created_at: sale.sale_date,
            prescriptions: [],
            sales: []
          } : null,
          subtotal,
          taxAmount: tax,
          total
        }}
      />

      {/* Return Modal */}
      <ProcessReturnModal
        isOpen={isReturnModalOpen}
        onClose={() => setIsReturnModalOpen(false)}
        sale={sale}
        onSuccess={() => {
          setIsReturnModalOpen(false)
          onReturnProcessed?.()
        }}
      />
    </>
  )
}
