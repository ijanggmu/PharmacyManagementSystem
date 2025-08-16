"use client"

import React, { useRef } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Printer, Download, Share2, Copy, QrCode } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface CartItem {
  medicineId: string
  medicineName: string
  strength: string
  form: string
  quantity: number
  unitPrice: number
  totalPrice: number
}

interface Customer {
  id: string
  first_name: string
  last_name: string
  phone: string | null
  email: string | null
}

interface SaleData {
  id: string
  sale_number: string
  sale_date: string
  payment_method: string
  total_amount: string
  discount_amount: string
  tax_amount: string
  items: CartItem[]
  customer: Customer | null
  subtotal: number
  taxAmount: number
  total: number
}

interface PrintReceiptProps {
  isOpen: boolean
  onClose: () => void
  saleData: SaleData | null
}

export default function PrintReceipt({ isOpen, onClose, saleData }: PrintReceiptProps) {
  const receiptRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()
  const [receiptFormat, setReceiptFormat] = React.useState("standard")

  const handlePrint = () => {
    if (!receiptRef.current) return

    const printWindow = window.open("", "_blank")
    if (!printWindow) return

    const receiptContent = receiptRef.current.innerHTML

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt - ${saleData?.sale_number}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: 'Courier New', monospace; 
              font-size: ${receiptFormat === "thermal" ? "12px" : "14px"};
              line-height: 1.4;
              color: #000;
              background: #fff;
              padding: ${receiptFormat === "thermal" ? "10px" : "20px"};
              max-width: ${receiptFormat === "thermal" ? "300px" : "400px"};
              margin: 0 auto;
            }
            .receipt-header { text-align: center; margin-bottom: 20px; }
            .receipt-title { font-size: ${receiptFormat === "thermal" ? "16px" : "18px"}; font-weight: bold; margin-bottom: 5px; }
            .receipt-subtitle { font-size: ${receiptFormat === "thermal" ? "12px" : "14px"}; color: #666; }
            .receipt-info { margin: 15px 0; }
            .receipt-info-row { display: flex; justify-content: space-between; margin: 5px 0; }
            .receipt-items { margin: 15px 0; }
            .receipt-item { display: flex; justify-content: space-between; margin: 8px 0; padding: 5px 0; }
            .item-details { flex: 1; }
            .item-name { font-weight: bold; }
            .item-desc { font-size: ${receiptFormat === "thermal" ? "10px" : "12px"}; color: #666; }
            .item-qty-price { text-align: right; }
            .receipt-totals { margin-top: 15px; border-top: 2px solid #000; padding-top: 10px; }
            .total-row { display: flex; justify-content: space-between; margin: 5px 0; }
            .total-final { font-weight: bold; font-size: ${receiptFormat === "thermal" ? "14px" : "16px"}; border-top: 1px solid #000; padding-top: 5px; margin-top: 10px; }
            .receipt-footer { text-align: center; margin-top: 20px; font-size: ${receiptFormat === "thermal" ? "10px" : "12px"}; color: #666; }
            .separator { border-top: 1px dashed #000; margin: 10px 0; }
            @media print {
              body { margin: 0; padding: 10px; }
              .no-print { display: none !important; }
            }
          </style>
        </head>
        <body>
          ${receiptContent}
        </body>
      </html>
    `)

    printWindow.document.close()
    printWindow.focus()

    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 250)

    toast({
      title: "Printing Receipt",
      description: "Receipt sent to printer successfully",
    })
  }

  const handleDownloadPDF = () => {
    toast({
      title: "Download Started",
      description: "Receipt PDF download will begin shortly",
    })
    // In a real implementation, you would generate a PDF here
  }

  const handleCopyReceipt = async () => {
    if (!saleData) return

    const receiptText = `
PHARMACY MANAGEMENT SYSTEM
Sale Receipt
${new Date().toLocaleString()}

Sale #: ${saleData.sale_number}
${saleData.customer ? `Customer: ${saleData.customer.first_name} ${saleData.customer.last_name}` : "Walk-in Customer"}
Payment: ${saleData.payment_method.toUpperCase()}

ITEMS:
${saleData.items
  .map(
    (item) =>
      `${item.medicineName} (${item.strength} ${item.form})
  ${item.quantity} × $${item.unitPrice.toFixed(2)} = $${item.totalPrice.toFixed(2)}`,
  )
  .join("\n")}

TOTALS:
Subtotal: $${saleData.subtotal.toFixed(2)}
Tax (8%): $${saleData.taxAmount.toFixed(2)}
${Number(saleData.discount_amount) > 0 ? `Discount: -$${saleData.discount_amount}` : ""}
TOTAL: $${saleData.total.toFixed(2)}

Thank you for your business!
    `.trim()

    try {
      await navigator.clipboard.writeText(receiptText)
      toast({
        title: "Receipt Copied",
        description: "Receipt text copied to clipboard",
      })
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Unable to copy receipt to clipboard",
        variant: "destructive",
      })
    }
  }

  if (!saleData) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Print Receipt</span>
            <div className="flex items-center gap-2">
              <Select value={receiptFormat} onValueChange={setReceiptFormat}>
                <SelectTrigger className="w-32 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="thermal">Thermal</SelectItem>
                  <SelectItem value="detailed">Detailed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Receipt Preview */}
          <div className="lg:col-span-2">
            <div className="border rounded-lg p-4 bg-white shadow-sm">
              <div
                ref={receiptRef}
                className={`receipt-preview ${receiptFormat === "thermal" ? "max-w-xs" : "max-w-md"} mx-auto`}
                style={{
                  fontFamily: receiptFormat === "thermal" ? "Courier New, monospace" : "system-ui, sans-serif",
                  fontSize: receiptFormat === "thermal" ? "12px" : "14px",
                }}
              >
                {/* Header */}
                <div className="text-center mb-6">
                  <h1 className={`font-bold ${receiptFormat === "thermal" ? "text-lg" : "text-xl"} mb-2`}>
                    PHARMACY MANAGEMENT
                  </h1>
                  <p className="text-gray-600 text-sm">Sale Receipt</p>
                  <p className="text-xs text-gray-500 mt-2">
                    {new Date(saleData.sale_date || new Date()).toLocaleString()}
                  </p>
                  {receiptFormat === "detailed" && (
                    <div className="mt-3 text-xs text-gray-500">
                      <p>123 Pharmacy Street</p>
                      <p>Medical District, City 12345</p>
                      <p>Phone: (555) 123-4567</p>
                      <p>License: PH-2024-001</p>
                    </div>
                  )}
                </div>

                <Separator className="my-4" />

                {/* Sale Information */}
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between">
                    <span className="font-medium">Sale #:</span>
                    <span className="font-mono">{saleData.sale_number}</span>
                  </div>
                  {saleData.customer && (
                    <>
                      <div className="flex justify-between">
                        <span className="font-medium">Customer:</span>
                        <span>
                          {saleData.customer.first_name} {saleData.customer.last_name}
                        </span>
                      </div>
                      {receiptFormat === "detailed" && saleData.customer.phone && (
                        <div className="flex justify-between">
                          <span className="font-medium">Phone:</span>
                          <span>{saleData.customer.phone}</span>
                        </div>
                      )}
                    </>
                  )}
                  <div className="flex justify-between">
                    <span className="font-medium">Payment:</span>
                    <span className="capitalize">{saleData.payment_method}</span>
                  </div>
                  {receiptFormat === "detailed" && (
                    <div className="flex justify-between">
                      <span className="font-medium">Cashier:</span>
                      <span>Staff Member</span>
                    </div>
                  )}
                </div>

                <Separator className="my-4" />

                {/* Items */}
                <div className="mb-4">
                  <h3 className="font-medium mb-3">Items Purchased:</h3>
                  <div className="space-y-3">
                    {saleData.items.map((item, index) => (
                      <div key={item.medicineId} className="space-y-1">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{item.medicineName}</p>
                            <p className="text-xs text-gray-500">
                              {item.strength} • {item.form}
                            </p>
                            {receiptFormat === "detailed" && <p className="text-xs text-gray-400">Item #{index + 1}</p>}
                          </div>
                          <div className="text-right ml-2">
                            <p className="text-sm font-medium">${item.totalPrice.toFixed(2)}</p>
                            <p className="text-xs text-gray-500">
                              {item.quantity} × ${item.unitPrice.toFixed(2)}
                            </p>
                          </div>
                        </div>
                        {index < saleData.items.length - 1 && receiptFormat !== "thermal" && (
                          <div className="border-t border-dashed border-gray-200 pt-2" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <Separator className="my-4" />

                {/* Totals */}
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span className="font-medium">${saleData.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tax (8%):</span>
                    <span className="font-medium">${saleData.taxAmount.toFixed(2)}</span>
                  </div>
                  {Number(saleData.discount_amount) > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Discount:</span>
                      <span className="font-medium">-${saleData.discount_amount}</span>
                    </div>
                  )}

                  <Separator className="my-2" />

                  <div className="flex justify-between text-lg font-bold">
                    <span>TOTAL:</span>
                    <span>${saleData.total.toFixed(2)}</span>
                  </div>

                  {receiptFormat === "detailed" && (
                    <div className="mt-4 p-3 bg-gray-50 rounded text-xs">
                      <p className="font-medium mb-1">Payment Details:</p>
                      <div className="flex justify-between">
                        <span>Amount Paid:</span>
                        <span>${saleData.total.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Change:</span>
                        <span>$0.00</span>
                      </div>
                    </div>
                  )}
                </div>

                <Separator className="my-4" />

                {/* Footer */}
                <div className="text-center text-xs text-gray-500 space-y-1">
                  <p className="font-medium">Thank you for your business!</p>
                  <p>Keep this receipt for your records</p>
                  {receiptFormat === "detailed" && (
                    <>
                      <p className="mt-3">Return Policy: 30 days with receipt</p>
                      <p>For questions, call: (555) 123-4567</p>
                      <p className="mt-2 font-mono text-xs">Receipt ID: {saleData.id.slice(-8).toUpperCase()}</p>
                    </>
                  )}
                </div>

                {receiptFormat === "detailed" && (
                  <div className="mt-6 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded">
                      <QrCode className="h-8 w-8 text-gray-400" />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Scan for digital receipt</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Actions Panel */}
          <div className="space-y-4">
            <div className="space-y-3">
              <h3 className="font-medium">Print Options</h3>

              <Button onClick={handlePrint} className="w-full" size="sm">
                <Printer className="h-4 w-4 mr-2" />
                Print Receipt
              </Button>

              <Button onClick={handleDownloadPDF} variant="outline" className="w-full bg-transparent" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>

              <Button onClick={handleCopyReceipt} variant="outline" className="w-full bg-transparent" size="sm">
                <Copy className="h-4 w-4 mr-2" />
                Copy Text
              </Button>

              <Button variant="outline" className="w-full bg-transparent" size="sm">
                <Share2 className="h-4 w-4 mr-2" />
                Share Receipt
              </Button>
            </div>

            <Separator />

            <div className="space-y-3">
              <h3 className="font-medium">Receipt Formats</h3>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <Badge variant={receiptFormat === "standard" ? "default" : "outline"} className="text-xs">
                    Standard
                  </Badge>
                  <span className="text-xs">Regular receipt format</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={receiptFormat === "thermal" ? "default" : "outline"} className="text-xs">
                    Thermal
                  </Badge>
                  <span className="text-xs">Compact for thermal printers</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={receiptFormat === "detailed" ? "default" : "outline"} className="text-xs">
                    Detailed
                  </Badge>
                  <span className="text-xs">Full details with QR code</span>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <h3 className="font-medium text-sm">Sale Summary</h3>
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-600">Items:</span>
                  <span>{saleData.items.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Qty:</span>
                  <span>{saleData.items.reduce((sum, item) => sum + item.quantity, 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Amount:</span>
                  <span className="font-medium">${saleData.total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print Now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
