/**
 * Inter-branch stock transfer — see audit Module 03: the previous stock_transfers
 * table was dropped as "unused" with no replacement, so branch-to-branch stock
 * movement had no system-tracked, audited path. This gives it one.
 */

"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, ArrowRight, Loader2, PackageCheck, Ban } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { medicinesApi, type Medicine } from "@/features/medicines/api-client"
import { MedicineCombobox } from "@/features/medicines/components/medicine-combobox"
import { stockTransfersApi, type StockTransfer } from "@/features/inventory/api-client-stock-transfers"

interface Branch {
  id: string
  name: string
  code: string
}

interface LineRow {
  medicine_id: string
  quantity: number
}

export default function StockTransfersPage() {
  const { toast } = useToast()
  const [branches, setBranches] = useState<Branch[]>([])
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [transfers, setTransfers] = useState<StockTransfer[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [fromBranchId, setFromBranchId] = useState("")
  const [toBranchId, setToBranchId] = useState("")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<LineRow[]>([{ medicine_id: "", quantity: 1 }])
  const [saving, setSaving] = useState(false)
  const [receivingId, setReceivingId] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<StockTransfer | null>(null)
  const [cancelReason, setCancelReason] = useState("")
  const [cancelling, setCancelling] = useState(false)

  const loadTransfers = async () => {
    const { data } = await stockTransfersApi.list({ limit: 50 })
    setTransfers(data)
  }

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      const [branchesRes, medicinesRes] = await Promise.all([
        fetch("/api/branches").then((r) => (r.ok ? r.json() : { data: [] })),
        medicinesApi.getMedicines({ limit: 1000, sortBy: "name", sortOrder: "asc" }),
      ])
      setBranches(branchesRes?.data ?? [])
      setMedicines(medicinesRes.data || [])
      await loadTransfers()
      setIsLoading(false)
    }
    load()
  }, [])

  const addLine = () => setLines((prev) => [...prev, { medicine_id: "", quantity: 1 }])
  const removeLine = (index: number) => setLines((prev) => prev.filter((_, i) => i !== index))
  const updateLine = (index: number, patch: Partial<LineRow>) =>
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))

  const handleSubmit = async () => {
    if (!fromBranchId || !toBranchId) {
      toast({ title: "Select both branches", variant: "destructive" })
      return
    }
    if (fromBranchId === toBranchId) {
      toast({ title: "Source and destination branch must differ", variant: "destructive" })
      return
    }
    const validLines = lines.filter((l) => l.medicine_id && l.quantity > 0)
    if (validLines.length === 0) {
      toast({ title: "Add at least one medicine", variant: "destructive" })
      return
    }

    setSaving(true)
    try {
      const { error } = await stockTransfersApi.create({
        from_branch_id: fromBranchId,
        to_branch_id: toBranchId,
        notes: notes.trim() || null,
        items: validLines,
      })
      if (error) throw new Error(error)

      toast({ title: "Transfer dispatched", description: "Stock left the source branch — receive it at the destination once it arrives." })
      setFromBranchId("")
      setToBranchId("")
      setNotes("")
      setLines([{ medicine_id: "", quantity: 1 }])
      await loadTransfers()
    } catch (error) {
      toast({
        title: "Transfer failed",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleReceive = async (transfer: StockTransfer) => {
    setReceivingId(transfer.id)
    try {
      const { error } = await stockTransfersApi.receive(transfer.id)
      if (error) throw new Error(error)
      toast({ title: "Transfer received", description: "Destination stock updated." })
      await loadTransfers()
    } catch (error) {
      toast({
        title: "Failed to receive transfer",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      })
    } finally {
      setReceivingId(null)
    }
  }

  const handleCancel = async () => {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      const { error } = await stockTransfersApi.cancel(cancelTarget.id, cancelReason.trim() || "Cancelled before receipt")
      if (error) throw new Error(error)
      toast({ title: "Transfer cancelled", description: "Source stock was restored." })
      setCancelTarget(null)
      setCancelReason("")
      await loadTransfers()
    } catch (error) {
      toast({
        title: "Failed to cancel transfer",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      })
    } finally {
      setCancelling(false)
    }
  }

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader title="Stock Transfers" description="Move stock between branches with a full audit trail" />

        <Section spacing="lg">
          <Card>
            <CardHeader>
              <CardTitle>New transfer</CardTitle>
              <CardDescription>
                Stock leaves the source branch immediately and sits "in transit" until the destination branch
                receives it — capped at what the source branch actually has on hand.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>From branch</Label>
                  <Select value={fromBranchId} onValueChange={setFromBranchId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select source branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>To branch</Label>
                  <Select value={toBranchId} onValueChange={setToBranchId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select destination branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.filter((b) => b.id !== fromBranchId).map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                {lines.map((line, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="flex-1">
                      <MedicineCombobox
                        medicines={medicines}
                        value={line.medicine_id}
                        onValueChange={(v) => updateLine(index, { medicine_id: v })}
                        placeholder="Select medicine..."
                      />
                    </div>
                    <Input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(e) => updateLine(index, { quantity: Number.parseInt(e.target.value) || 1 })}
                      className="w-28"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLine(index)}
                      disabled={lines.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addLine}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add line
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
              </div>

              <Button onClick={handleSubmit} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Dispatch transfer
              </Button>
            </CardContent>
          </Card>
        </Section>

        <Section spacing="lg">
          <Card>
            <CardHeader>
              <CardTitle>Recent transfers</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : transfers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No stock transfers yet.</p>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Transfer</TableHead>
                        <TableHead>Route</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="w-40" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transfers.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="font-mono text-xs">{t.transfer_number}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 text-sm">
                              <Badge variant="outline">{t.from_branch?.name || "—"}</Badge>
                              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                              <Badge variant="outline">{t.to_branch?.name || "—"}</Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {t.stock_transfer_items
                              .map((i) => `${i.medicines?.name || "Medicine"} × ${i.quantity}`)
                              .join(", ")}
                          </TableCell>
                          <TableCell>
                            {t.status === "in_transit" && <Badge variant="secondary">In transit</Badge>}
                            {t.status === "completed" && <Badge>Received</Badge>}
                            {t.status === "cancelled" && <Badge variant="destructive">Cancelled</Badge>}
                          </TableCell>
                          <TableCell className="text-sm">{new Date(t.created_at).toLocaleString()}</TableCell>
                          <TableCell>
                            {t.status === "in_transit" && (
                              <div className="flex items-center gap-1.5">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleReceive(t)}
                                  disabled={receivingId === t.id}
                                >
                                  <PackageCheck className="h-3.5 w-3.5 mr-1.5" />
                                  {receivingId === t.id ? "Receiving…" : "Receive"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => {
                                    setCancelTarget(t)
                                    setCancelReason("")
                                  }}
                                >
                                  <Ban className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
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

        <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancel transfer {cancelTarget?.transfer_number}?</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This restores the stock to {cancelTarget?.from_branch?.name || "the source branch"}. Only possible
                while still in transit — once received, it's completed and can't be cancelled.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="transfer-cancel-reason">Reason</Label>
                <Textarea
                  id="transfer-cancel-reason"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. dispatched to the wrong branch"
                  rows={2}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCancelTarget(null)}>
                Keep transfer
              </Button>
              <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
                {cancelling ? "Cancelling…" : "Cancel transfer"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </PageContainer>
    </DashboardLayout>
  )
}
