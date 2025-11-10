"use client"

import type React from "react"
import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Loader2, Search, RefreshCw, DollarSign, Check, ChevronsUpDown } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/hooks/use-toast"

interface Sale {
  id: string
  sale_number: string
  total_amount: string
  tax_amount: string
  discount_amount: string
  payment_method: string
  sale_date: string
  customers: {
    id: string
    first_name: string
    last_name: string
    phone: string
    email: string
  } | null
  sale_items: {
    id: string
    medicine_id: string
    quantity: number
    unit_price: string
    total_price: string
    medicines: {
      id: string
      name: string
      generic_name: string
      strength: string
      form: string
    } | null
  }[]
}

interface RefundItem {
  saleItemId: string
  medicineId: string
  medicineName: string
  strength: string
  form: string
  originalQuantity: number
  refundQuantity: number
  unitPrice: number
  refundAmount: number
  condition: string
}

interface NewRefundFormProps {
  sales: Sale[]
  currentUser: any
  onSuccess?: () => void
}

export default function NewRefundForm({ sales, currentUser, onSuccess }: NewRefundFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const [selectedSaleId, setSelectedSaleId] = useState("")
  const [saleSearchOpen, setSaleSearchOpen] = useState(false)
  const [saleSearchQuery, setSaleSearchQuery] = useState("")

  const [refundType, setRefundType] = useState("partial_refund")
  const [refundReason, setRefundReason] = useState("")
  const [refundMethod, setRefundMethod] = useState("original_payment")
  const [processingFee, setProcessingFee] = useState(0)
  const [notes, setNotes] = useState("")

  const [refundItems, setRefundItems] = useState<RefundItem[]>([])

  const filteredSales = useMemo(() => {
    if (!saleSearchQuery) return sales
    return sales.filter((sale) => {
      const query = saleSearchQuery.toLowerCase()
      return (
        sale.sale_number.toLowerCase().includes(query) ||
        (sale.customers && `${sale.customers.first_name} ${sale.customers.last_name}`.toLowerCase().includes(query))
      )
    })
  }, [sales, saleSearchQuery])

  const selectedSale = sales.find((s) => s.id === selectedSaleId)

  const generateRefundNumber = () => {
    const date = new Date()
    const year = date.getFullYear().toString().slice(-2)
    const month = (date.getMonth() + 1).toString().padStart(2, "0")
    const day = date.getDate().toString().padStart(2, "0")
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0")
    return `REF${year}${month}${day}${random}`
  }

  const handleSaleSelect = (saleId: string) => {
    setSelectedSaleId(saleId)
    const sale = sales.find((s) => s.id === saleId)

    if (sale) {
      // Initialize refund items based on sale items
      const items: RefundItem[] = sale.sale_items.map((item) => ({
        saleItemId: item.id,
        medicineId: item.medicine_id,
        medicineName: item.medicines?.name || "Unknown Medicine",
        strength: item.medicines?.strength || "",
        form: item.medicines?.form || "",
        originalQuantity: item.quantity,
        refundQuantity: refundType === "full_refund" ? item.quantity : 0,
        unitPrice: Number.parseFloat(item.unit_price),
        refundAmount: 0,
        condition: "good",
      }))

      setRefundItems(items)

      // Set default refund method based on original payment
      setRefundMethod(sale.payment_method === "cash" ? "cash" : "original_payment")
    }

    setSaleSearchOpen(false)
  }

  const updateRefundQuantity = (itemIndex: number, quantity: number) => {
    setRefundItems((prev) =>
      prev.map((item, index) => {
        if (index === itemIndex) {
          const refundAmount = quantity * item.unitPrice
          return { ...item, refundQuantity: quantity, refundAmount }
        }
        return item
      }),
    )
  }

  const updateItemCondition = (itemIndex: number, condition: string) => {
    setRefundItems((prev) =>
      prev.map((item, index) => {
        if (index === itemIndex) {
          return { ...item, condition }
        }
        return item
      }),
    )
  }

  const subtotalRefund = refundItems.reduce((sum, item) => sum + item.refundAmount, 0)
  const taxRefund = selectedSale
    ? subtotalRefund * (Number(selectedSale.tax_amount) / Number(selectedSale.total_amount))
    : 0
  const totalRefund = subtotalRefund + taxRefund
  const netRefund = totalRefund - processingFee

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (!selectedSale) {
        throw new Error("Please select a sale to refund")
      }

      if (refundItems.filter((item) => item.refundQuantity > 0).length === 0) {
        throw new Error("Please select at least one item to refund")
      }

      if (!refundReason) {
        throw new Error("Please provide a refund reason")
      }

      const supabase = createClient()
      const refundNumber = generateRefundNumber()

      // Insert refund record
      const { data: refund, error: refundError } = await supabase
        .from("sales_refunds")
        .insert({
          refund_number: refundNumber,
          original_sale_id: selectedSale.id,
          customer_id: selectedSale.customers?.id || null,
          user_id: currentUser?.id,
          refund_type: refundType,
          refund_reason: refundReason,
          refund_amount: totalRefund.toFixed(2),
          tax_refund_amount: taxRefund.toFixed(2),
          processing_fee: processingFee.toFixed(2),
          net_refund_amount: netRefund.toFixed(2),
          refund_method: refundMethod,
          refund_status: "pending",
          notes: notes || null,
        })
        .select()
        .single()

      if (refundError) throw refundError

      // Insert refund items
      const refundItemsToInsert = refundItems
        .filter((item) => item.refundQuantity > 0)
        .map((item) => ({
          refund_id: refund.id,
          sale_item_id: item.saleItemId,
          medicine_id: item.medicineId,
          quantity_refunded: item.refundQuantity,
          unit_price: item.unitPrice.toFixed(2),
          total_refund_amount: item.refundAmount.toFixed(2),
          condition_returned: item.condition,
        }))

      const { error: itemsError } = await supabase.from("sales_refund_items").insert(refundItemsToInsert)

      if (itemsError) throw itemsError

      // Update inventory (add back refunded items)
      for (const item of refundItems.filter((item) => item.refundQuantity > 0)) {
        // Get current stock
        const { data: medicine } = await supabase
          .from("medicines")
          .select("stock_quantity")
          .eq("id", item.medicineId)
          .single()

        if (medicine) {
          // Update stock quantity
          await supabase
            .from("medicines")
            .update({
              stock_quantity: medicine.stock_quantity + item.refundQuantity,
            })
            .eq("id", item.medicineId)

          // Add inventory transaction
          await supabase.from("inventory_transactions").insert({
            medicine_id: item.medicineId,
            transaction_type: "refund",
            quantity: item.refundQuantity,
            reference_id: refund.id,
            reference_type: "refund",
            user_id: currentUser?.id,
            notes: `Refund: ${refundNumber}`,
          })
        }
      }

      toast({
        title: "Success",
        description: `Refund ${refundNumber} created successfully`,
      })

      if (onSuccess) {
        onSuccess()
      } else {
        router.push("/dashboard/refunds")
      }
    } catch (error) {
      console.error("Error creating refund:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create refund",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Sale Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-blue-600" />
            Select Sale to Refund
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Original Sale</Label>
            <Popover open={saleSearchOpen} onOpenChange={setSaleSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={saleSearchOpen}
                  className="w-full justify-between h-10 mt-1 bg-transparent"
                >
                  {selectedSale ? (
                    <div className="flex items-center gap-2 truncate">
                      <span className="truncate">{selectedSale.sale_number}</span>
                      <Badge variant="outline" className="text-xs">
                        ${Number(selectedSale.total_amount).toFixed(2)}
                      </Badge>
                    </div>
                  ) : (
                    "Select sale to refund"
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="Search sales..."
                    value={saleSearchQuery}
                    onValueChange={setSaleSearchQuery}
                  />
                  <CommandEmpty>No sale found.</CommandEmpty>
                  <CommandGroup>
                    <CommandList className="max-h-64">
                      {filteredSales.map((sale) => (
                        <CommandItem
                          key={sale.id}
                          value={`${sale.sale_number} ${sale.customers?.first_name || ""} ${sale.customers?.last_name || ""}`}
                          onSelect={() => handleSaleSelect(sale.id)}
                        >
                          <Check
                            className={`mr-2 h-4 w-4 ${selectedSaleId === sale.id ? "opacity-100" : "opacity-0"}`}
                          />
                          <div className="flex flex-col flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{sale.sale_number}</span>
                              <Badge variant="outline" className="text-xs">
                                ${Number(sale.total_amount).toFixed(2)}
                              </Badge>
                            </div>
                            <div className="text-xs text-gray-500">
                              {sale.customers
                                ? `${sale.customers.first_name} ${sale.customers.last_name}`
                                : "Walk-in Customer"}{" "}
                              • {new Date(sale.sale_date).toLocaleDateString()}
                            </div>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandList>
                  </CommandGroup>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {selectedSale && (
            <div className="p-4 bg-gray-50 rounded-lg space-y-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Sale Date:</span>{" "}
                  {new Date(selectedSale.sale_date).toLocaleDateString()}
                </div>
                <div>
                  <span className="font-medium">Payment Method:</span> {selectedSale.payment_method}
                </div>
                <div>
                  <span className="font-medium">Total Amount:</span> ${Number(selectedSale.total_amount).toFixed(2)}
                </div>
                <div>
                  <span className="font-medium">Customer:</span>{" "}
                  {selectedSale.customers
                    ? `${selectedSale.customers.first_name} ${selectedSale.customers.last_name}`
                    : "Walk-in Customer"}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Refund Details */}
      {selectedSale && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-green-600" />
              Refund Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-sm font-medium">Refund Type</Label>
                <Select value={refundType} onValueChange={setRefundType}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_refund">Full Refund</SelectItem>
                    <SelectItem value="partial_refund">Partial Refund</SelectItem>
                    <SelectItem value="exchange">Exchange</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-medium">Refund Reason *</Label>
                <Select value={refundReason} onValueChange={setRefundReason}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select reason" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="defective_product">Defective Product</SelectItem>
                    <SelectItem value="wrong_medication">Wrong Medication</SelectItem>
                    <SelectItem value="customer_dissatisfaction">Customer Dissatisfaction</SelectItem>
                    <SelectItem value="expired_product">Expired Product</SelectItem>
                    <SelectItem value="doctor_change">Doctor Change</SelectItem>
                    <SelectItem value="duplicate_purchase">Duplicate Purchase</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-medium">Refund Method</Label>
                <Select value={refundMethod} onValueChange={setRefundMethod}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="original_payment">Original Payment Method</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="store_credit">Store Credit</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">Processing Fee</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={processingFee}
                onChange={(e) => setProcessingFee(Number.parseFloat(e.target.value) || 0)}
                className="mt-1"
                placeholder="0.00"
              />
            </div>

            <div>
              <Label className="text-sm font-medium">Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1"
                rows={3}
                placeholder="Additional notes about the refund..."
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Items to Refund */}
      {selectedSale && refundItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-red-600" />
              Items to Refund
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              {refundItems.map((item, index) => (
                <div key={item.saleItemId} className="p-4 border rounded-lg space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium">{item.medicineName}</h4>
                      <p className="text-sm text-gray-500">
                        {item.strength} • {item.form}
                      </p>
                      <p className="text-sm text-gray-500">
                        Original: {item.originalQuantity} × ${item.unitPrice.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-red-600">${item.refundAmount.toFixed(2)}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label className="text-xs">Refund Quantity</Label>
                      <Input
                        type="number"
                        min="0"
                        max={item.originalQuantity}
                        value={item.refundQuantity}
                        onChange={(e) => updateRefundQuantity(index, Number.parseInt(e.target.value) || 0)}
                        className="h-8 mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs">Item Condition</Label>
                      <Select value={item.condition} onValueChange={(value) => updateItemCondition(index, value)}>
                        <SelectTrigger className="h-8 mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="good">Good Condition</SelectItem>
                          <SelectItem value="damaged">Damaged</SelectItem>
                          <SelectItem value="expired">Expired</SelectItem>
                          <SelectItem value="opened">Opened/Used</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-end">
                      <Badge variant={item.refundQuantity > 0 ? "default" : "outline"} className="text-xs">
                        {item.refundQuantity > 0 ? "Refunding" : "Not Refunding"}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Separator />

            {/* Refund Summary */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Subtotal Refund:</span>
                <span className="font-medium">${subtotalRefund.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Tax Refund:</span>
                <span className="font-medium">${taxRefund.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Total Refund:</span>
                <span className="font-medium">${totalRefund.toFixed(2)}</span>
              </div>
              {processingFee > 0 && (
                <div className="flex justify-between text-sm text-red-600">
                  <span>Processing Fee:</span>
                  <span className="font-medium">-${processingFee.toFixed(2)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-lg font-bold">
                <span>Net Refund Amount:</span>
                <span className="text-green-600">${netRefund.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submit Button */}
      {selectedSale && (
        <div className="flex justify-end gap-4">
          {!onSuccess && (
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            disabled={loading || !refundReason || refundItems.filter((item) => item.refundQuantity > 0).length === 0}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing Refund...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Create Refund (${netRefund.toFixed(2)})
              </>
            )}
          </Button>
        </div>
      )}
    </form>
  )
}
