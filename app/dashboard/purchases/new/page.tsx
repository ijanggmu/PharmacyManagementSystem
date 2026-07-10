/**
 * Create purchase order
 */

"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { purchasesApi } from "@/features/purchases/api-client"
import { suppliersApi, type Supplier } from "@/features/suppliers/api-client"
import { medicinesApi, type Medicine } from "@/features/medicines/api-client"
import { formatLocalDateYmd } from "@/lib/utils/date"
import { ArrowLeft, Plus, Trash2 } from "lucide-react"

interface LineRow {
  id: string
  medicine_id: string
  quantity_ordered: number
  unit_cost: string
}

export default function NewPurchaseOrderPage() {
  const { toast } = useToast()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [loadingRefs, setLoadingRefs] = useState(true)
  const [saving, setSaving] = useState(false)

  const [supplierId, setSupplierId] = useState("")
  const [orderDate, setOrderDate] = useState(formatLocalDateYmd(new Date()))
  const [expectedDate, setExpectedDate] = useState("")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<LineRow[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [supRes, medRes] = await Promise.all([
          suppliersApi.getSuppliers({ limit: 500, status: "all" }),
          medicinesApi.getMedicines({ limit: 500 }),
        ])
        if (cancelled) return
        setSuppliers(supRes.data || [])
        setMedicines(medRes.data || [])
      } catch {
        if (!cancelled) {
          toast({ title: "Failed to load suppliers or medicines", variant: "destructive" })
        }
      } finally {
        if (!cancelled) setLoadingRefs(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [toast])

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        medicine_id: "",
        quantity_ordered: 1,
        unit_cost: "0",
      },
    ])
  }

  const removeLine = (id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id))
  }

  const updateLine = (id: string, patch: Partial<LineRow>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supplierId) {
      toast({ title: "Select a supplier", variant: "destructive" })
      return
    }
    const items = lines
      .filter((l) => l.medicine_id && l.quantity_ordered > 0)
      .map((l) => ({
        medicine_id: l.medicine_id,
        quantity_ordered: l.quantity_ordered,
        unit_cost: l.unit_cost,
      }))
    if (items.length === 0) {
      toast({ title: "Add at least one line item", variant: "destructive" })
      return
    }

    setSaving(true)
    try {
      await purchasesApi.createPurchaseOrder({
        supplier_id: supplierId,
        order_date: orderDate,
        expected_delivery_date: expectedDate || undefined,
        notes: notes || undefined,
        items,
      })
      toast({ title: "Purchase order created" })
      window.location.href = "/dashboard/purchases"
    } catch (err) {
      toast({
        title: "Create failed",
        description: err instanceof Error ? err.message : "Error",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="New purchase order"
          description="Create a draft PO with line items"
          actions={
            <Button variant="outline" asChild>
              <Link href="/dashboard/purchases">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Link>
            </Button>
          }
        />

        <Section spacing="lg">
          <Card>
            <CardHeader>
              <CardTitle>Order details</CardTitle>
              <CardDescription>Select supplier and dates, then add medicines.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingRefs ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (
                <form className="space-y-6" onSubmit={handleSubmit}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Supplier</Label>
                      <Select value={supplierId} onValueChange={setSupplierId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose supplier" />
                        </SelectTrigger>
                        <SelectContent>
                          {suppliers.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="order_date">Order date</Label>
                      <Input
                        id="order_date"
                        type="date"
                        value={orderDate}
                        onChange={(e) => setOrderDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="expected">Expected delivery (optional)</Label>
                      <Input
                        id="expected"
                        type="date"
                        value={expectedDate}
                        onChange={(e) => setExpectedDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="notes">Notes</Label>
                      <Input
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Optional"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Line items</Label>
                      <Button type="button" variant="outline" size="sm" onClick={addLine}>
                        <Plus className="h-4 w-4 mr-1" />
                        Add line
                      </Button>
                    </div>
                    {lines.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No lines yet.</p>
                    ) : (
                      <div className="rounded-md border overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Medicine</TableHead>
                              <TableHead className="w-28">Qty</TableHead>
                              <TableHead className="w-36">Unit cost</TableHead>
                              <TableHead className="w-12" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {lines.map((line) => (
                              <TableRow key={line.id}>
                                <TableCell>
                                  <Select
                                    value={line.medicine_id}
                                    onValueChange={(v) => updateLine(line.id, { medicine_id: v })}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Medicine" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {medicines.map((m) => (
                                        <SelectItem key={m.id} value={m.id}>
                                          {m.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    min={1}
                                    value={line.quantity_ordered}
                                    onChange={(e) =>
                                      updateLine(line.id, {
                                        quantity_ordered: Number.parseInt(e.target.value, 10) || 0,
                                      })
                                    }
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    value={line.unit_cost}
                                    onChange={(e) => updateLine(line.id, { unit_cost: e.target.value })}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeLine(line.id)}
                                    aria-label="Remove line"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" asChild>
                      <Link href="/dashboard/purchases">Cancel</Link>
                    </Button>
                    <Button type="submit" disabled={saving}>
                      {saving ? "Saving…" : "Create draft PO"}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
