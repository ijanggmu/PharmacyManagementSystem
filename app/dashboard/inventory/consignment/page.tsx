/**
 * Consignment inventory (2026-09 ERP audit, priority item #8) — supplier-owned
 * stock on the shelf. Receiving here posts no GL/AP entry (ownership hasn't
 * transferred); settling a supplier reads how much has sold since it was last
 * settled and posts a correcting voucher + supplier ledger entry. See
 * lib/server/services/consignment-service.ts.
 */

"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { DualDateInput } from "@/components/ui/dual-date-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, PackagePlus, HandCoins } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { medicinesApi, type Medicine } from "@/features/medicines/api-client"
import { MedicineCombobox } from "@/features/medicines/components/medicine-combobox"
import { suppliersApi, type Supplier } from "@/features/suppliers/api-client"
import { consignmentApi, type ConsignmentPosition, type ConsignmentSettlement } from "@/features/inventory/api-client-consignment"

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function ConsignmentInventoryPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [positions, setPositions] = useState<ConsignmentPosition[]>([])
  const [settlements, setSettlements] = useState<ConsignmentSettlement[]>([])

  const [medicineId, setMedicineId] = useState("")
  const [supplierId, setSupplierId] = useState("")
  const [quantity, setQuantity] = useState("")
  const [unitCost, setUnitCost] = useState("")
  const [batchNumber, setBatchNumber] = useState("")
  const [expiryDate, setExpiryDate] = useState("")
  const [rackLocation, setRackLocation] = useState("")
  const [receiving, setReceiving] = useState(false)

  const [settlingSupplierId, setSettlingSupplierId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const [medicinesRes, suppliersRes, positionsRes, settlementsRes] = await Promise.all([
      medicinesApi.getMedicines({ limit: 1000, sortBy: "name", sortOrder: "asc" }),
      suppliersApi.getSuppliers({ limit: 1000 }),
      consignmentApi.getPositions(),
      consignmentApi.getSettlements(),
    ])
    setMedicines(medicinesRes.data || [])
    setSuppliers(suppliersRes.data || [])
    setPositions(positionsRes.data)
    setSettlements(settlementsRes.data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleReceive = async () => {
    const qty = Number(quantity)
    const cost = Number(unitCost)
    if (!medicineId || !supplierId || !(qty > 0) || !(cost >= 0)) {
      toast({ title: "Select a medicine, supplier, quantity and unit cost", variant: "destructive" })
      return
    }
    setReceiving(true)
    try {
      const { error } = await consignmentApi.receive({
        medicine_id: medicineId,
        supplier_id: supplierId,
        quantity: qty,
        unit_cost: cost,
        batch_number: batchNumber.trim() || null,
        expiry_date: expiryDate || null,
        rack_location: rackLocation.trim() || null,
      })
      if (error) throw new Error(error)
      toast({ title: "Consignment stock received", description: "On the shelf and sellable — no payable posted until it sells." })
      setMedicineId("")
      setQuantity("")
      setUnitCost("")
      setBatchNumber("")
      setExpiryDate("")
      setRackLocation("")
      await load()
    } catch (error) {
      toast({ title: "Receive failed", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      setReceiving(false)
    }
  }

  const handleSettle = async (supId: string) => {
    setSettlingSupplierId(supId)
    try {
      const { data, error } = await consignmentApi.settle(supId)
      if (error) throw new Error(error)
      if (!data?.settlementId) {
        toast({ title: "Nothing to settle", description: "No consignment stock has sold since the last settlement." })
      } else {
        toast({ title: "Settled", description: `${data.totalQuantity} unit(s) — NPR ${fmt(data.totalValue)} posted to the supplier's payable.` })
      }
      await load()
    } catch (error) {
      toast({ title: "Settlement failed", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      setSettlingSupplierId(null)
    }
  }

  const positionsBySupplier = positions.reduce<Record<string, { name: string; rows: ConsignmentPosition[]; totalUnsettled: number }>>((acc, p) => {
    if (!acc[p.supplier_id]) acc[p.supplier_id] = { name: p.supplier_name, rows: [], totalUnsettled: 0 }
    acc[p.supplier_id].rows.push(p)
    acc[p.supplier_id].totalUnsettled += p.unsettled_value
    return acc
  }, {})

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Consignment Inventory"
          description="Supplier-owned stock on the shelf — you don't owe the supplier until it sells. Settle periodically to post what's been sold."
        />

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <Section spacing="lg">
              <Card>
                <CardHeader>
                  <CardTitle>Receive consignment stock</CardTitle>
                  <CardDescription>Makes the stock sellable immediately — posts no purchase, no payable, until settled.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Medicine</Label>
                      <MedicineCombobox medicines={medicines} value={medicineId} onValueChange={setMedicineId} placeholder="Select medicine..." />
                    </div>
                    <div className="space-y-2">
                      <Label>Supplier</Label>
                      <Select value={supplierId} onValueChange={setSupplierId}>
                        <SelectTrigger><SelectValue placeholder="Select supplier..." /></SelectTrigger>
                        <SelectContent>
                          {suppliers.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label>Quantity</Label>
                      <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Unit cost</Label>
                      <Input type="number" min={0} step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Batch # (optional)</Label>
                      <Input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Expiry (optional)</Label>
                      <DualDateInput value={expiryDate} onChange={setExpiryDate} />
                    </div>
                    <div className="space-y-2">
                      <Label>Shelf location (optional)</Label>
                      <Input value={rackLocation} onChange={(e) => setRackLocation(e.target.value)} placeholder="e.g. Rack 3" />
                    </div>
                  </div>
                  <Button onClick={handleReceive} disabled={receiving}>
                    {receiving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PackagePlus className="h-4 w-4 mr-2" />}
                    Receive stock
                  </Button>
                </CardContent>
              </Card>
            </Section>

            <Section spacing="lg">
              <Card>
                <CardHeader>
                  <CardTitle>Outstanding position</CardTitle>
                  <CardDescription>Sold-but-unsettled value per supplier — settling posts it to their payable account.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {Object.keys(positionsBySupplier).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No consignment stock on hand.</p>
                  ) : (
                    Object.entries(positionsBySupplier).map(([supId, group]) => (
                      <div key={supId} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="font-medium flex items-center gap-2">
                            {group.name}
                            {group.totalUnsettled > 0 ? (
                              <Badge variant="destructive">NPR {fmt(group.totalUnsettled)} due</Badge>
                            ) : (
                              <Badge variant="secondary">Settled</Badge>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={group.totalUnsettled <= 0 || settlingSupplierId === supId}
                            onClick={() => handleSettle(supId)}
                          >
                            {settlingSupplierId === supId ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <HandCoins className="h-3.5 w-3.5 mr-1.5" />}
                            Settle now
                          </Button>
                        </div>
                        <div className="rounded-md border overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Medicine</TableHead>
                                <TableHead>Batch</TableHead>
                                <TableHead className="text-right">Received</TableHead>
                                <TableHead className="text-right">Remaining</TableHead>
                                <TableHead className="text-right">Sold, unsettled</TableHead>
                                <TableHead className="text-right">Value due</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {group.rows.map((p) => (
                                <TableRow key={p.batch_id}>
                                  <TableCell>{p.medicine_name}</TableCell>
                                  <TableCell className="font-mono text-xs">{p.batch_number}</TableCell>
                                  <TableCell className="text-right">{p.quantity_received}</TableCell>
                                  <TableCell className="text-right">{p.quantity_remaining}</TableCell>
                                  <TableCell className="text-right">{p.unsettled_sold_quantity}</TableCell>
                                  <TableCell className="text-right">{fmt(p.unsettled_value)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </Section>

            <Section spacing="lg">
              <Card>
                <CardHeader>
                  <CardTitle>Settlement history</CardTitle>
                </CardHeader>
                <CardContent>
                  {settlements.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No settlements yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Supplier</TableHead>
                          <TableHead className="text-right">Quantity</TableHead>
                          <TableHead className="text-right">Value</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {settlements.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell>{s.settlement_date}</TableCell>
                            <TableCell>{s.supplier_name}</TableCell>
                            <TableCell className="text-right">{s.total_quantity}</TableCell>
                            <TableCell className="text-right">{fmt(s.total_value)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </Section>
          </>
        )}
      </PageContainer>
    </DashboardLayout>
  )
}
