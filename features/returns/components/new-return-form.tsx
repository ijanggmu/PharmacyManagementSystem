"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Plus, Package, Trash2, Truck } from "lucide-react"
import { cn } from "@/lib/utils"
import { Medicine } from "@/features/medicines/api-client"
import { supplierReturnsApi } from "@/features/suppliers/api-client-returns"
import { LAST_SUPPLIER_KEY } from "@/features/returns/components/supplier-returns-panel"
import { CurrencyDisplay } from "@/components/currency-display"

interface Supplier {
  id: string
  name: string
  contact_person: string
  phone: string
  email: string
}

interface User {
  id: string
  full_name: string
  email: string
}

interface ReturnItem {
  medicine_id: string
  medicine: Medicine | null
  quantity: number
  unit_cost: number
  total_cost: number
  return_reason: string
  notes: string
}

interface NewReturnFormProps {
  medicines: Medicine[]
  suppliers: Supplier[]
  currentUser: User | null
  onSuccess?: () => void
}

export default function NewReturnForm({ medicines, suppliers, currentUser, onSuccess }: NewReturnFormProps) {
  const [selectedSupplier, setSelectedSupplier] = useState("")
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([])
  const [notes, setNotes] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()
  const router = useRouter()

  const supplierMedicines = medicines.filter((med) => med.suppliers?.id === selectedSupplier)

  const addReturnItem = () => {
    const newItem: ReturnItem = {
      medicine_id: "",
      medicine: null as Medicine | null,
      quantity: 1,
      unit_cost: 0,
      total_cost: 0,
      return_reason: "expired",
      notes: "",
    }
    setReturnItems([...returnItems, newItem])
  }

  const removeReturnItem = (index: number) => {
    setReturnItems(returnItems.filter((_, i) => i !== index))
  }

  const updateReturnItem = (index: number, field: keyof ReturnItem, value: any) => {
    const updatedItems = [...returnItems]
    if (field === "medicine_id") {
      const medicine = supplierMedicines.find((med) => med.id === value)
      if (medicine) {
        updatedItems[index].medicine = medicine
        updatedItems[index].unit_cost = Number.parseFloat(medicine.unit_price)
        const stock = medicine.stock_quantity ?? 0
        updatedItems[index].quantity = stock > 0 ? Math.min(updatedItems[index].quantity || 1, stock) : 1
        updatedItems[index].total_cost = updatedItems[index].quantity * Number.parseFloat(medicine.unit_price)
      }
      updatedItems[index].medicine_id = value
    } else if (field === "quantity") {
      const stock = updatedItems[index].medicine?.stock_quantity ?? 0
      const clamped = stock > 0 ? Math.min(Math.max(1, value), stock) : Math.max(1, value)
      updatedItems[index].quantity = clamped
      updatedItems[index].total_cost = clamped * updatedItems[index].unit_cost
    } else if (field === "unit_cost") {
      updatedItems[index].unit_cost = value
      updatedItems[index].total_cost = updatedItems[index].quantity * value
    } else if (field === "return_reason") {
      updatedItems[index].return_reason = value
    } else if (field === "notes") {
      updatedItems[index].notes = value
    }
    setReturnItems(updatedItems)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUser || !selectedSupplier || returnItems.length === 0) {
      toast({
        title: "Error",
        description: "Please fill in all required fields and add at least one item",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)

    try {
      for (const item of returnItems) {
        const med = medicines.find((m) => m.id === item.medicine_id)
        const stock = med?.stock_quantity ?? 0
        if (stock < item.quantity) {
          throw new Error(`Insufficient stock for ${item.medicine?.name ?? "item"} (have ${stock})`)
        }
      }

      const result = await supplierReturnsApi.create({
        supplier_id: selectedSupplier,
        notes: notes || undefined,
        items: returnItems.map((item) => ({
          medicine_id: item.medicine_id,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          return_reason: item.return_reason,
          notes: item.notes || undefined,
        })),
      })
      if (result.error) throw new Error(result.error)

      toast({
        title: "Return posted",
        description: "Goods returned to supplier and stock updated successfully.",
      })

      try {
        localStorage.setItem(LAST_SUPPLIER_KEY, selectedSupplier)
      } catch {
        // storage unavailable — the list just won't preselect the supplier
      }
      if (onSuccess) {
        onSuccess()
      } else {
        router.push("/dashboard/returns?tab=supplier")
      }
    } catch (error) {
      console.error("Error creating return:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create return. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const isPage = !onSuccess
  const totalReturnValue = returnItems.reduce((sum, item) => sum + item.total_cost, 0)
  const required = (
    <span className="text-destructive" aria-hidden>
      {" "}
      *
    </span>
  )

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-6", isPage && "pb-24")}>
      <p className="text-sm text-muted-foreground">
        Fields marked <span className="text-destructive">*</span> are required.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck className="h-4 w-4 text-muted-foreground" aria-hidden />
            Supplier
          </CardTitle>
          <CardDescription>Choose who the goods go back to. Only that supplier&apos;s medicines can be added.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="supplier">Supplier{required}</Label>
              <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                <SelectTrigger id="supplier">
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                      {supplier.contact_person ? ` — ${supplier.contact_person}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="processed_by">Processed by</Label>
              <Input id="processed_by" value={currentUser?.full_name || ""} readOnly disabled />
              <p className="text-xs text-muted-foreground">Recorded automatically from your login.</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Return notes</Label>
            <Textarea
              id="notes"
              placeholder="e.g. Credit note requested, collected by supplier rep"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4 text-muted-foreground" aria-hidden />
              Items to return{required}
            </CardTitle>
            <CardDescription>Quantity can&apos;t exceed what you have in stock.</CardDescription>
          </div>
          {returnItems.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={addReturnItem} disabled={!selectedSupplier}>
              <Plus className="h-4 w-4" aria-hidden />
              Add item
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {returnItems.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-8 text-center">
              <p className="mb-3 text-sm text-muted-foreground">
                {!selectedSupplier
                  ? "Select a supplier first, then add the medicines you are sending back."
                  : "No items yet. Add the medicines you are sending back."}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={addReturnItem} disabled={!selectedSupplier}>
                <Plus className="h-4 w-4" aria-hidden />
                Add first item
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {returnItems.map((item, index) => (
                <div
                  key={index}
                  role="group"
                  aria-label={`Item ${index + 1}`}
                  className="space-y-4 rounded-lg border p-3 sm:p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">Item {index + 1}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => removeReturnItem(index)}
                      aria-label={`Remove item ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                      Remove
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                      <Label htmlFor={`ret-med-${index}`}>Medicine{required}</Label>
                      <Select
                        value={item.medicine_id}
                        onValueChange={(value) => updateReturnItem(index, "medicine_id", value)}
                      >
                        <SelectTrigger id={`ret-med-${index}`}>
                          <SelectValue placeholder="Select medicine" />
                        </SelectTrigger>
                        <SelectContent>
                          {supplierMedicines.map((medicine) => (
                            <SelectItem key={medicine.id} value={medicine.id}>
                              {medicine.name} {[medicine.strength, medicine.form].filter(Boolean).join(" ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`ret-qty-${index}`}>Quantity{required}</Label>
                      <Input
                        id={`ret-qty-${index}`}
                        type="number"
                        inputMode="numeric"
                        min="1"
                        max={item.medicine?.stock_quantity ?? undefined}
                        disabled={!item.medicine_id}
                        value={item.quantity}
                        onChange={(e) => updateReturnItem(index, "quantity", Number.parseInt(e.target.value) || 1)}
                        className="num text-right"
                        aria-describedby={item.medicine ? `ret-stock-${index}` : undefined}
                      />
                      {item.medicine && (
                        <p id={`ret-stock-${index}`} className="text-xs text-muted-foreground">
                          <span className="num">{item.medicine.stock_quantity ?? 0}</span> in stock
                        </p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`ret-cost-${index}`}>Unit cost</Label>
                      <Input
                        id={`ret-cost-${index}`}
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        value={item.unit_cost}
                        onChange={(e) => updateReturnItem(index, "unit_cost", Number.parseFloat(e.target.value) || 0)}
                        className="num text-right"
                      />
                      <p className="text-xs text-muted-foreground">Pre-filled from the medicine price.</p>
                    </div>
                    <div className="space-y-1.5">
                      <span className="text-sm font-medium leading-none">Line total</span>
                      <div className="num flex h-10 items-center justify-end rounded-md border bg-muted/50 px-3 text-sm font-medium sm:h-9">
                        <CurrencyDisplay amount={item.total_cost} />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor={`ret-reason-${index}`}>Return reason{required}</Label>
                      <Select
                        value={item.return_reason}
                        onValueChange={(value) => updateReturnItem(index, "return_reason", value)}
                      >
                        <SelectTrigger id={`ret-reason-${index}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="expired">Expired</SelectItem>
                          <SelectItem value="damaged">Damaged</SelectItem>
                          <SelectItem value="defective">Defective</SelectItem>
                          <SelectItem value="wrong_item">Wrong item</SelectItem>
                          <SelectItem value="overstocked">Overstocked</SelectItem>
                          <SelectItem value="recalled">Recalled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`ret-notes-${index}`}>Item notes</Label>
                      <Input
                        id={`ret-notes-${index}`}
                        placeholder="e.g. Batch B2291, 3 strips crushed"
                        value={item.notes}
                        onChange={(e) => updateReturnItem(index, "notes", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between border-t pt-4 text-base font-semibold">
                <span>Total return value</span>
                <span className="num">
                  <CurrencyDisplay amount={totalReturnValue} />
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div
        className={cn(
          "flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end",
          isPage &&
            "sticky bottom-0 z-10 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:mx-0 sm:rounded-lg sm:border sm:px-4"
        )}
      >
        <p className="mr-auto hidden text-sm text-muted-foreground sm:block">
          <span className="num">{returnItems.length}</span> {returnItems.length === 1 ? "item" : "items"} ·{" "}
          <span className="num font-medium text-foreground">
            <CurrencyDisplay amount={totalReturnValue} />
          </span>
        </p>
        {isPage && (
          <Button type="button" variant="outline" asChild>
            <Link href="/dashboard/returns">Cancel</Link>
          </Button>
        )}
        <Button
          type="submit"
          disabled={returnItems.length === 0}
          loading={isSubmitting}
          loadingText="Posting return…"
        >
          Post supplier return
        </Button>
      </div>
    </form>
  )
}
