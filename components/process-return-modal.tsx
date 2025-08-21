"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { RefreshCw, X, AlertTriangle, CheckCircle } from "lucide-react"
import { CurrencyDisplay } from "@/components/currency-display"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"

interface SaleItem {
  id: string
  quantity: number
  unit_price: string
  total_price: string
  medicines: {
    id: string
    name: string
    strength: string
    form: string
  } | null
}

interface Sale {
  id: string
  sale_number: string
  total_amount: string
  discount_amount: string
  tax_amount: string
  payment_method: string
  payment_status: string
  sale_date: string
  customers: {
    id: string
    first_name: string
    last_name: string
    phone: string | null
    email: string | null
  } | null
  sale_items: SaleItem[]
}

interface ReturnItem {
  saleItemId: string
  medicineId: string
  medicineName: string
  originalQuantity: number
  returnQuantity: number
  unitPrice: number
  totalPrice: number
  reason: string
}

interface ProcessReturnModalProps {
  isOpen: boolean
  onClose: () => void
  sale: Sale | null
  onSuccess?: () => void
}

export default function ProcessReturnModal({ isOpen, onClose, sale, onSuccess }: ProcessReturnModalProps) {
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([])
  const [returnReason, setReturnReason] = useState("")
  const [refundMethod, setRefundMethod] = useState("original")
  const [isProcessing, setIsProcessing] = useState(false)
  const { toast } = useToast()

  if (!sale) return null

  const handleItemReturnChange = (saleItemId: string, field: keyof ReturnItem, value: any) => {
    setReturnItems(prev => {
      const existing = prev.find(item => item.saleItemId === saleItemId)
      if (existing) {
        return prev.map(item => 
          item.saleItemId === saleItemId 
            ? { ...item, [field]: value }
            : item
        )
      } else {
        const saleItem = sale.sale_items.find(item => item.id === saleItemId)
        if (!saleItem) return prev

        return [...prev, {
          saleItemId,
          medicineId: saleItem.medicines?.id || "",
          medicineName: saleItem.medicines?.name || "Unknown Medicine",
          originalQuantity: saleItem.quantity,
          returnQuantity: value,
          unitPrice: Number.parseFloat(saleItem.unit_price),
          totalPrice: Number.parseFloat(saleItem.unit_price) * value,
          reason: ""
        }]
      }
    })
  }

  const handleItemReasonChange = (saleItemId: string, reason: string) => {
    setReturnItems(prev => 
      prev.map(item => 
        item.saleItemId === saleItemId 
          ? { ...item, reason }
          : item
      )
    )
  }

  const removeReturnItem = (saleItemId: string) => {
    setReturnItems(prev => prev.filter(item => item.saleItemId !== saleItemId))
  }

  const getTotalReturnAmount = () => {
    return returnItems.reduce((sum, item) => sum + item.totalPrice, 0)
  }

  const handleProcessReturn = async () => {
    if (returnItems.length === 0) {
      toast({
        title: "No items selected",
        description: "Please select at least one item to return.",
        variant: "destructive"
      })
      return
    }

    if (!returnReason.trim()) {
      toast({
        title: "Return reason required",
        description: "Please provide a general reason for the return.",
        variant: "destructive"
      })
      return
    }

    const itemsWithoutReason = returnItems.filter(item => !item.reason.trim())
    if (itemsWithoutReason.length > 0) {
      toast({
        title: "Item reasons required",
        description: "Please provide a reason for each returned item.",
        variant: "destructive"
      })
      return
    }

    setIsProcessing(true)

    try {
      const supabase = createClient()
      const totalReturnAmount = getTotalReturnAmount()

      // Create return record
      const { data: returnRecord, error: returnError } = await supabase
        .from("medicine_returns")
        .insert({
          sale_id: sale.id,
          customer_id: sale.customers?.id,
          return_date: new Date().toISOString(),
          total_return_amount: totalReturnAmount.toFixed(2),
          return_reason: returnReason,
          refund_method: refundMethod,
          status: "completed"
        })
        .select()
        .single()

      if (returnError) throw returnError

      // Create return items
      const returnItemsData = returnItems.map(item => ({
        return_id: returnRecord.id,
        sale_item_id: item.saleItemId,
        medicine_id: item.medicineId,
        quantity_returned: item.returnQuantity,
        unit_price: item.unitPrice,
        total_amount: item.totalPrice,
        reason: item.reason
      }))

      const { error: itemsError } = await supabase
        .from("return_items")
        .insert(returnItemsData)

      if (itemsError) throw itemsError

             // Update medicine stock
       for (const item of returnItems) {
         // Get current stock
         const { data: currentMedicine, error: fetchError } = await supabase
           .from("medicines")
           .select("stock_quantity")
           .eq("id", item.medicineId)
           .single()

         if (fetchError) {
           console.error("Error fetching medicine stock:", item.medicineId, fetchError)
           continue
         }

         // Update stock by adding returned quantity
         const newStockQuantity = (currentMedicine?.stock_quantity || 0) + item.returnQuantity
         const { error: stockError } = await supabase
           .from("medicines")
           .update({ stock_quantity: newStockQuantity })
           .eq("id", item.medicineId)

         if (stockError) {
           console.error("Error updating stock for medicine:", item.medicineId, stockError)
         }
       }

      // Update sale status if all items are returned
      const totalOriginalItems = sale.sale_items.reduce((sum, item) => sum + item.quantity, 0)
      const totalReturnedItems = returnItems.reduce((sum, item) => sum + item.returnQuantity, 0)

      if (totalReturnedItems >= totalOriginalItems) {
        await supabase
          .from("sales")
          .update({ payment_status: "refunded" })
          .eq("id", sale.id)
      }

      toast({
        title: "Return processed successfully",
        description: `Return processed for ${returnItems.length} item(s). Total refund: ${totalReturnAmount.toFixed(2)}`,
      })

      onSuccess?.()
      onClose()
    } catch (error) {
      console.error("Error processing return:", error)
      toast({
        title: "Error processing return",
        description: "An error occurred while processing the return. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Process Return - {sale.sale_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Sale Information */}
          <Card>
            <CardHeader>
              <CardTitle>Sale Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Customer:</span>
                  <span className="ml-2">
                    {sale.customers ? `${sale.customers.first_name} ${sale.customers.last_name}` : "Walk-in Customer"}
                  </span>
                </div>
                <div>
                  <span className="font-medium">Sale Date:</span>
                  <span className="ml-2">{new Date(sale.sale_date).toLocaleDateString()}</span>
                </div>
                <div>
                  <span className="font-medium">Original Amount:</span>
                  <span className="ml-2"><CurrencyDisplay amount={sale.total_amount} /></span>
                </div>
                <div>
                  <span className="font-medium">Payment Method:</span>
                  <span className="ml-2">{sale.payment_method}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Return Items */}
          <Card>
            <CardHeader>
              <CardTitle>Select Items to Return</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Medicine</TableHead>
                    <TableHead>Original Qty</TableHead>
                    <TableHead>Return Qty</TableHead>
                    <TableHead>Unit Price</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sale.sale_items.map((item) => {
                    const returnItem = returnItems.find(ri => ri.saleItemId === item.id)
                    const isSelected = returnItem && returnItem.returnQuantity > 0

                    return (
                      <TableRow key={item.id} className={isSelected ? "bg-blue-50" : ""}>
                        <TableCell>
                          <div className="font-medium">{item.medicines?.name || "Unknown Medicine"}</div>
                          <div className="text-sm text-gray-500">
                            {item.medicines?.strength} {item.medicines?.form}
                          </div>
                        </TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            max={item.quantity}
                            value={returnItem?.returnQuantity || 0}
                            onChange={(e) => handleItemReturnChange(item.id, "returnQuantity", parseInt(e.target.value) || 0)}
                            className="w-20"
                          />
                        </TableCell>
                        <TableCell>
                          <CurrencyDisplay amount={item.unit_price} />
                        </TableCell>
                        <TableCell>
                          {returnItem ? (
                            <CurrencyDisplay amount={returnItem.totalPrice.toFixed(2)} />
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>
                          {isSelected && (
                            <Input
                              placeholder="Reason..."
                              value={returnItem?.reason || ""}
                              onChange={(e) => handleItemReasonChange(item.id, e.target.value)}
                              className="w-32"
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          {isSelected && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeReturnItem(item.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Return Summary */}
          {returnItems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Return Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="return-reason">General Return Reason *</Label>
                    <Textarea
                      id="return-reason"
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value)}
                      placeholder="Enter the general reason for this return..."
                      rows={3}
                    />
                  </div>

                  <div>
                    <Label htmlFor="refund-method">Refund Method</Label>
                    <Select value={refundMethod} onValueChange={setRefundMethod}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="original">Original Payment Method</SelectItem>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="store_credit">Store Credit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm text-gray-500">Items to return: {returnItems.length}</div>
                      <div className="text-sm text-gray-500">
                        Total quantity: {returnItems.reduce((sum, item) => sum + item.returnQuantity, 0)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-500">Total Return Amount</div>
                      <div className="text-2xl font-bold text-red-600">
                        <CurrencyDisplay amount={getTotalReturnAmount().toFixed(2)} />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={isProcessing}>
              Cancel
            </Button>
            <Button 
              onClick={handleProcessReturn} 
              disabled={isProcessing || returnItems.length === 0}
              className="bg-red-600 hover:bg-red-700"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Process Return
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
