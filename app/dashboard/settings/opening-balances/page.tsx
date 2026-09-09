/**
 * Opening-balance / migration wizard (2026-09 ERP audit, priority item #1) —
 * lets a pharmacy that already has real stock/cash/bank/customer/supplier
 * balances go live here without re-entering years of historical sales. Each
 * section posts a balanced GL voucher via migration-service.ts; nothing here
 * ever writes a raw balance.
 */

"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DualDateInput } from "@/components/ui/dual-date-input"
import { Plus, Trash2, Loader2, CheckCircle2, Lock } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { medicinesApi, type Medicine } from "@/features/medicines/api-client"
import { MedicineCombobox } from "@/features/medicines/components/medicine-combobox"
import { customersApi, type Customer } from "@/features/customers/api-client"
import { suppliersApi, type Supplier } from "@/features/suppliers/api-client"
import { migrationApi, type MigrationSession, type OpeningStockItem } from "@/features/migration/api-client"

interface Branch {
  id: string
  name: string
}

interface StockRow {
  medicine_id: string
  quantity: number
  unit_cost: number
  batch_number: string
  expiry_date: string
}

interface PartyRow {
  id: string
  amount: number
}

export default function OpeningBalancesPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<MigrationSession | null>(null)
  const [branches, setBranches] = useState<Branch[]>([])
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  const [cutoverDate, setCutoverDate] = useState("")
  const [notes, setNotes] = useState("")
  const [starting, setStarting] = useState(false)
  const [completing, setCompleting] = useState(false)

  const [branchId, setBranchId] = useState("")
  const [stockRows, setStockRows] = useState<StockRow[]>([
    { medicine_id: "", quantity: 0, unit_cost: 0, batch_number: "", expiry_date: "" },
  ])
  const [importingStock, setImportingStock] = useState(false)

  const [cashAmount, setCashAmount] = useState("")
  const [savingCash, setSavingCash] = useState(false)
  const [bankAmount, setBankAmount] = useState("")
  const [savingBank, setSavingBank] = useState(false)

  const [customerRows, setCustomerRows] = useState<PartyRow[]>([{ id: "", amount: 0 }])
  const [savingCustomers, setSavingCustomers] = useState(false)
  const [supplierRows, setSupplierRows] = useState<PartyRow[]>([{ id: "", amount: 0 }])
  const [savingSuppliers, setSavingSuppliers] = useState(false)

  const isDraft = session?.status === "draft"

  const load = async () => {
    setLoading(true)
    const [sessionRes, branchesRes, medicinesRes, customersRes, suppliersRes] = await Promise.all([
      migrationApi.getSession(),
      fetch("/api/branches").then((r) => (r.ok ? r.json() : { data: [] })),
      medicinesApi.getMedicines({ limit: 1000, sortBy: "name", sortOrder: "asc" }),
      customersApi.getCustomers({ limit: 1000 }),
      suppliersApi.getSuppliers({ limit: 1000 }),
    ])
    setSession(sessionRes.data)
    setBranches(branchesRes?.data ?? [])
    setMedicines(medicinesRes.data || [])
    setCustomers(customersRes.data || [])
    setSuppliers(suppliersRes.data || [])
    if (!branchId && branchesRes?.data?.length) setBranchId(branchesRes.data[0].id)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleStart = async () => {
    if (!cutoverDate) {
      toast({ title: "Set a cutover date", variant: "destructive" })
      return
    }
    setStarting(true)
    try {
      const { data, error } = await migrationApi.startSession({ cutover_date: cutoverDate, notes: notes.trim() || null })
      if (error) throw new Error(error)
      setSession(data)
      toast({ title: "Migration session started", description: "You can now import opening balances." })
    } catch (error) {
      toast({ title: "Could not start migration", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      setStarting(false)
    }
  }

  const handleComplete = async () => {
    if (!confirm("Complete migration? Opening balances will be locked and can no longer be changed here.")) return
    setCompleting(true)
    try {
      const { error } = await migrationApi.completeSession()
      if (error) throw new Error(error)
      toast({ title: "Migration completed", description: "This pharmacy is now live." })
      await load()
    } catch (error) {
      toast({ title: "Could not complete migration", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      setCompleting(false)
    }
  }

  const addStockRow = () => setStockRows((p) => [...p, { medicine_id: "", quantity: 0, unit_cost: 0, batch_number: "", expiry_date: "" }])
  const removeStockRow = (i: number) => setStockRows((p) => p.filter((_, idx) => idx !== i))
  const updateStockRow = (i: number, patch: Partial<StockRow>) =>
    setStockRows((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  const handleImportStock = async () => {
    if (!branchId) {
      toast({ title: "Select a branch", variant: "destructive" })
      return
    }
    const items: OpeningStockItem[] = stockRows
      .filter((r) => r.medicine_id && r.quantity > 0)
      .map((r) => ({
        medicine_id: r.medicine_id,
        quantity: r.quantity,
        unit_cost: r.unit_cost,
        batch_number: r.batch_number.trim() || null,
        expiry_date: r.expiry_date || null,
      }))
    if (items.length === 0) {
      toast({ title: "Add at least one opening stock line", variant: "destructive" })
      return
    }
    setImportingStock(true)
    try {
      const { data, error } = await migrationApi.importOpeningStock(branchId, items)
      if (error) throw new Error(error)
      const failedCount = data?.failed.length ?? 0
      const warningCount = data?.warnings.length ?? 0
      toast({
        title: `Imported ${data?.imported ?? 0} opening stock line(s)`,
        description: failedCount
          ? `${failedCount} line(s) failed — see console for details.`
          : warningCount
            ? `${warningCount} medicine(s) already had stock at this branch — added on top, check for double-counting. Total value NPR ${data?.totalValue.toFixed(2)}`
            : `Total value NPR ${data?.totalValue.toFixed(2)}`,
        variant: failedCount ? "destructive" : warningCount ? "default" : undefined,
      })
      if (failedCount) console.error("[opening-stock] failures", data?.failed)
      if (warningCount) console.warn("[opening-stock] already had stock", data?.warnings)
      setStockRows([{ medicine_id: "", quantity: 0, unit_cost: 0, batch_number: "", expiry_date: "" }])
    } catch (error) {
      toast({ title: "Import failed", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      setImportingStock(false)
    }
  }

  const handleSetCash = async () => {
    const amount = Number(cashAmount)
    if (!(amount > 0)) {
      toast({ title: "Enter a positive amount", variant: "destructive" })
      return
    }
    setSavingCash(true)
    try {
      const { error } = await migrationApi.setOpeningCash(amount, branchId || null)
      if (error) throw new Error(error)
      toast({ title: "Opening cash recorded" })
      setCashAmount("")
    } catch (error) {
      toast({ title: "Failed to record opening cash", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      setSavingCash(false)
    }
  }

  const handleSetBank = async () => {
    const amount = Number(bankAmount)
    if (!(amount > 0)) {
      toast({ title: "Enter a positive amount", variant: "destructive" })
      return
    }
    setSavingBank(true)
    try {
      const { error } = await migrationApi.setOpeningBank(amount, branchId || null)
      if (error) throw new Error(error)
      toast({ title: "Opening bank balance recorded" })
      setBankAmount("")
    } catch (error) {
      toast({ title: "Failed to record opening bank balance", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      setSavingBank(false)
    }
  }

  const addPartyRow = (setter: typeof setCustomerRows) => setter((p) => [...p, { id: "", amount: 0 }])
  const removePartyRow = (setter: typeof setCustomerRows, i: number) => setter((p) => p.filter((_, idx) => idx !== i))
  const updatePartyRow = (setter: typeof setCustomerRows, i: number, patch: Partial<PartyRow>) =>
    setter((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  const handleImportCustomers = async () => {
    const entries = customerRows.filter((r) => r.id && r.amount > 0).map((r) => ({ customer_id: r.id, amount: r.amount }))
    if (entries.length === 0) {
      toast({ title: "Add at least one customer balance", variant: "destructive" })
      return
    }
    setSavingCustomers(true)
    try {
      const { data, error } = await migrationApi.importOpeningCustomers(entries)
      if (error) throw new Error(error)
      toast({ title: `Recorded ${data?.imported ?? 0} opening customer balance(s)` })
      setCustomerRows([{ id: "", amount: 0 }])
    } catch (error) {
      toast({ title: "Import failed", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      setSavingCustomers(false)
    }
  }

  const handleImportSuppliers = async () => {
    const entries = supplierRows.filter((r) => r.id && r.amount > 0).map((r) => ({ supplier_id: r.id, amount: r.amount }))
    if (entries.length === 0) {
      toast({ title: "Add at least one supplier balance", variant: "destructive" })
      return
    }
    setSavingSuppliers(true)
    try {
      const { data, error } = await migrationApi.importOpeningSuppliers(entries)
      if (error) throw new Error(error)
      toast({ title: `Recorded ${data?.imported ?? 0} opening supplier balance(s)` })
      setSupplierRows([{ id: "", amount: 0 }])
    } catch (error) {
      toast({ title: "Import failed", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      setSavingSuppliers(false)
    }
  }

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Opening Balances"
          description="Bring an existing pharmacy live without re-entering years of sales — opening stock, cash, bank, and customer/supplier balances post as normal, balanced ledger entries."
        />

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <Section spacing="lg">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    Migration session
                    {session?.status === "completed" && <Badge><Lock className="h-3 w-3 mr-1" />Completed</Badge>}
                    {session?.status === "draft" && <Badge variant="secondary">In progress</Badge>}
                  </CardTitle>
                  <CardDescription>
                    The cutover date is the day you stop using your old system — opening balances are dated here, and every
                    live sale/purchase from this date forward is a normal system transaction.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!session ? (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Cutover date</Label>
                          <DualDateInput value={cutoverDate} onChange={setCutoverDate} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Notes</Label>
                        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional — e.g. migrating from Excel + manual ledger" rows={2} />
                      </div>
                      <Button onClick={handleStart} disabled={starting}>
                        {starting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Start migration
                      </Button>
                    </>
                  ) : (
                    <div className="flex flex-wrap items-center gap-6 text-sm">
                      <div>
                        <span className="text-muted-foreground">Cutover date: </span>
                        <span className="font-medium">{session.cutover_date}</span>
                      </div>
                      {isDraft && (
                        <Button variant="outline" onClick={handleComplete} disabled={completing}>
                          {completing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                          Complete migration
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Section>

            {session && (
              <fieldset disabled={!isDraft} className="contents">
                <Section spacing="lg">
                  <Card>
                    <CardHeader>
                      <CardTitle>Opening stock</CardTitle>
                      <CardDescription>Physical stock counted at cutover — posts Dr Inventory / Cr Opening balance equity.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2 max-w-xs">
                        <Label>Branch</Label>
                        <Select value={branchId} onValueChange={setBranchId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select branch" />
                          </SelectTrigger>
                          <SelectContent>
                            {branches.map((b) => (
                              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        {stockRows.map((row, i) => (
                          <div key={i} className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-2 items-center">
                            <MedicineCombobox medicines={medicines} value={row.medicine_id} onValueChange={(v) => updateStockRow(i, { medicine_id: v })} placeholder="Select medicine..." />
                            <Input type="number" min={0} placeholder="Qty" value={row.quantity || ""} onChange={(e) => updateStockRow(i, { quantity: Number(e.target.value) || 0 })} />
                            <Input type="number" min={0} step="0.01" placeholder="Unit cost" value={row.unit_cost || ""} onChange={(e) => updateStockRow(i, { unit_cost: Number(e.target.value) || 0 })} />
                            <Input placeholder="Batch #" value={row.batch_number} onChange={(e) => updateStockRow(i, { batch_number: e.target.value })} />
                            <Input type="date" value={row.expiry_date} onChange={(e) => updateStockRow(i, { expiry_date: e.target.value })} />
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeStockRow(i)} disabled={stockRows.length === 1}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={addStockRow}>
                          <Plus className="h-4 w-4 mr-2" />Add line
                        </Button>
                      </div>

                      <Button onClick={handleImportStock} disabled={importingStock}>
                        {importingStock && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Import opening stock
                      </Button>
                    </CardContent>
                  </Card>
                </Section>

                <Section spacing="lg">
                  <Card>
                    <CardHeader>
                      <CardTitle>Opening cash &amp; bank</CardTitle>
                      <CardDescription>What's physically in the till and in the bank as of the cutover date. Each can only be set once — void the voucher in Accounting to redo it.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label>Opening cash on hand</Label>
                        <div className="flex gap-2">
                          <Input type="number" min={0} step="0.01" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} placeholder="0.00" />
                          <Button onClick={handleSetCash} disabled={savingCash}>{savingCash ? "Saving…" : "Save"}</Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Opening bank balance</Label>
                        <div className="flex gap-2">
                          <Input type="number" min={0} step="0.01" value={bankAmount} onChange={(e) => setBankAmount(e.target.value)} placeholder="0.00" />
                          <Button onClick={handleSetBank} disabled={savingBank}>{savingBank ? "Saving…" : "Save"}</Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Section>

                <Section spacing="lg">
                  <Card>
                    <CardHeader>
                      <CardTitle>Opening customer balances (AR)</CardTitle>
                      <CardDescription>What each credit customer owed you at cutover — posts to that customer's statement and the AR control account.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        {customerRows.map((row, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <Select value={row.id} onValueChange={(v) => updatePartyRow(setCustomerRows, i, { id: v })}>
                              <SelectTrigger className="flex-1"><SelectValue placeholder="Select customer..." /></SelectTrigger>
                              <SelectContent>
                                {customers.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input type="number" min={0} step="0.01" className="w-40" placeholder="Amount owed" value={row.amount || ""} onChange={(e) => updatePartyRow(setCustomerRows, i, { amount: Number(e.target.value) || 0 })} />
                            <Button type="button" variant="ghost" size="icon" onClick={() => removePartyRow(setCustomerRows, i)} disabled={customerRows.length === 1}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={() => addPartyRow(setCustomerRows)}>
                          <Plus className="h-4 w-4 mr-2" />Add customer
                        </Button>
                      </div>
                      <Button onClick={handleImportCustomers} disabled={savingCustomers}>
                        {savingCustomers && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Save opening customer balances
                      </Button>
                    </CardContent>
                  </Card>
                </Section>

                <Section spacing="lg">
                  <Card>
                    <CardHeader>
                      <CardTitle>Opening supplier balances (AP)</CardTitle>
                      <CardDescription>What you owed each supplier at cutover — posts to that supplier's statement and the AP control account.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        {supplierRows.map((row, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <Select value={row.id} onValueChange={(v) => updatePartyRow(setSupplierRows, i, { id: v })}>
                              <SelectTrigger className="flex-1"><SelectValue placeholder="Select supplier..." /></SelectTrigger>
                              <SelectContent>
                                {suppliers.map((s) => (
                                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input type="number" min={0} step="0.01" className="w-40" placeholder="Amount owed" value={row.amount || ""} onChange={(e) => updatePartyRow(setSupplierRows, i, { amount: Number(e.target.value) || 0 })} />
                            <Button type="button" variant="ghost" size="icon" onClick={() => removePartyRow(setSupplierRows, i)} disabled={supplierRows.length === 1}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={() => addPartyRow(setSupplierRows)}>
                          <Plus className="h-4 w-4 mr-2" />Add supplier
                        </Button>
                      </div>
                      <Button onClick={handleImportSuppliers} disabled={savingSuppliers}>
                        {savingSuppliers && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Save opening supplier balances
                      </Button>
                    </CardContent>
                  </Card>
                </Section>
              </fieldset>
            )}
          </>
        )}
      </PageContainer>
    </DashboardLayout>
  )
}
