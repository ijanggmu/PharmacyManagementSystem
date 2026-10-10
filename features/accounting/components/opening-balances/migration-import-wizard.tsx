"use client"

/**
 * Onboarding import wizard (moved here unchanged from the old Opening balances tab). It posts party-
 * and batch-level detail: stock batches, supplier statement entries and per-category GL vouchers,
 * each crediting Owner's Equity. The account-level opening balances (Set/Edit/Reset with history)
 * live in OpeningBalancesPanel; this stays available for the subledger detail.
 *
 * Opening-balance / migration wizard (2026-09 ERP audit, priority item #1) —
 * lets a pharmacy that already has real stock/cash/bank/customer/supplier
 * balances go live here without re-entering years of historical sales. Each
 * section posts a balanced GL voucher via migration-service.ts; nothing here
 * ever writes a raw balance.
 */

import { useEffect, useState } from "react"
import { Section } from "@/components/layouts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DatePicker, EXPIRY_PRESETS } from "@/components/ui/date-picker"
import { Plus, Trash2, CheckCircle2, ChevronRight, Clock, Landmark, Lock } from "lucide-react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { dotnetClient } from "@/lib/api/dotnet-client"
import { medicinesApi, type Medicine } from "@/features/medicines/api-client"
import { MedicineCombobox } from "@/features/medicines/components/medicine-combobox"
import { customersApi, type Customer } from "@/features/customers/api-client"
import { CustomerCombobox } from "@/features/customers/components/customer-combobox"
import { suppliersApi, type Supplier } from "@/features/suppliers/api-client"
import { SupplierCombobox } from "@/features/suppliers/components/supplier-combobox"
import { migrationApi, type MigrationSession, type OpeningStockItem } from "@/features/migration/api-client"
import { useBranchAccess } from "@/features/branches/hooks/use-branch-access"
import { BranchScopeBadge } from "@/features/branches/components/branch-scope-badge"

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

/** Onboarding import wizard: stock batches, cash/bank and customer/supplier detail. */
export function MigrationImportWizard() {
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
  const [confirmCompleteOpen, setConfirmCompleteOpen] = useState(false)

  const [branchId, setBranchId] = useState("")
  const [stockRows, setStockRows] = useState<StockRow[]>([
    { medicine_id: "", quantity: 0, unit_cost: 0, batch_number: "", expiry_date: "" },
  ])
  const [importingStock, setImportingStock] = useState(false)
  const [medicineSearching, setMedicineSearching] = useState(false)

  const [cashAmount, setCashAmount] = useState("")
  const [savingCash, setSavingCash] = useState(false)
  const [bankAmount, setBankAmount] = useState("")
  const [savingBank, setSavingBank] = useState(false)

  const [customerRows, setCustomerRows] = useState<PartyRow[]>([{ id: "", amount: 0 }])
  const [savingCustomers, setSavingCustomers] = useState(false)
  const [customerSearching, setCustomerSearching] = useState(false)
  const [supplierRows, setSupplierRows] = useState<PartyRow[]>([{ id: "", amount: 0 }])
  const [savingSuppliers, setSavingSuppliers] = useState(false)
  const [supplierSearching, setSupplierSearching] = useState(false)

  const isDraft = session?.status === "draft"

  // The medicine/customer/supplier pickers used to fetch a flat `limit: 1000` snapshot once,
  // which silently hid any row beyond the 1000th for a large org. Instead, fetch a bounded
  // initial page here, then re-fetch (debounced, server-side `search`) as the user types in a
  // combobox below — same pattern as the payables/receivables tabs — so any medicine, customer
  // or supplier can be found regardless of how many exist, without loading the whole table.
  const PICKER_PAGE_SIZE = 50

  /** Merges newly-fetched rows into a picker's cache by id, without dropping rows already
   *  selected on another row (those must stay visible even after a different search). */
  const mergeById = <T extends { id: string }>(prev: T[], found: T[]): T[] => {
    const merged = [...prev]
    for (const row of found) {
      const idx = merged.findIndex((existing) => existing.id === row.id)
      if (idx === -1) merged.push(row)
      else merged[idx] = row
    }
    return merged
  }

  // Start on the user's own branch; users limited to it can't post opening balances elsewhere.
  const branchAccess = useBranchAccess()
  const branchLocked = !branchAccess.isLoading && !branchAccess.canViewAll
  useEffect(() => {
    if (branchAccess.isLoading) return
    const own = branchAccess.ownBranchId
    if (branchLocked) {
      if (own && branchId !== own) setBranchId(own)
      return
    }
    if (!branchId) {
      const fallback = own ?? branches[0]?.id
      if (fallback) setBranchId(fallback)
    }
  }, [branchAccess.isLoading, branchAccess.ownBranchId, branchLocked, branchId, branches])

  const load = async () => {
    setLoading(true)
    const [sessionRes, branchesRes, medicinesRes, customersRes, suppliersRes] = await Promise.all([
      migrationApi.getSession(),
      dotnetClient
        .get<{ items: { id: string; name: string; code: string }[] }>("/branches?pageNumber=1&pageSize=100")
        .then((page) => page.items ?? [])
        .catch(() => []),
      medicinesApi.getMedicines({ limit: PICKER_PAGE_SIZE, sortBy: "name", sortOrder: "asc" }),
      customersApi.getCustomers({ limit: PICKER_PAGE_SIZE }),
      suppliersApi.getSuppliers({ limit: PICKER_PAGE_SIZE }),
    ])
    setSession(sessionRes.data)
    setBranches(branchesRes)
    setMedicines(medicinesRes.data || [])
    setCustomers(customersRes.data || [])
    setSuppliers(suppliersRes.data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleMedicineSearch = async (query: string) => {
    if (!query) return
    setMedicineSearching(true)
    try {
      const res = await medicinesApi.getMedicines({ search: query, limit: PICKER_PAGE_SIZE, sortBy: "name", sortOrder: "asc" })
      setMedicines((prev) => mergeById(prev, res.data || []))
    } catch {
      // Live search failure just falls back to the locally filtered cache.
    } finally {
      setMedicineSearching(false)
    }
  }

  const handleCustomerSearch = async (query: string) => {
    if (!query) return
    setCustomerSearching(true)
    try {
      const res = await customersApi.getCustomers({ search: query, limit: PICKER_PAGE_SIZE })
      setCustomers((prev) => mergeById(prev, res.data || []))
    } catch {
      // Live search failure just falls back to the locally filtered cache.
    } finally {
      setCustomerSearching(false)
    }
  }

  const handleSupplierSearch = async (query: string) => {
    if (!query) return
    setSupplierSearching(true)
    try {
      const res = await suppliersApi.getSuppliers({ search: query, limit: PICKER_PAGE_SIZE })
      setSuppliers((prev) => mergeById(prev, res.data || []))
    } catch {
      // Live search failure just falls back to the locally filtered cache.
    } finally {
      setSupplierSearching(false)
    }
  }

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
    // Confirmation now happens in the ConfirmDialog before this runs.
    setCompleting(true)
    try {
      const { error } = await migrationApi.completeSession(branchId || null)
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

  const isCompleted = session?.status === "completed"
  const steps: { n: number; label: string; done: boolean }[] = [
    { n: 1, label: "Start session", done: !!session },
    { n: 2, label: "Opening stock", done: isCompleted },
    { n: 3, label: "Cash & bank", done: isCompleted },
    { n: 4, label: "Customers (AR)", done: isCompleted },
    { n: 5, label: "Suppliers (AP)", done: isCompleted },
    { n: 6, label: "Complete & lock", done: isCompleted },
  ]

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h2 className="flex flex-wrap items-center gap-2 font-display text-lg font-semibold">
            <Landmark className="h-5 w-5 text-muted-foreground" aria-hidden />
            Onboarding import
            {isCompleted ? (
              <Badge variant="success">
                <Lock aria-hidden />
                Completed
              </Badge>
            ) : isDraft ? (
              <Badge variant="warning">
                <Clock aria-hidden />
                In progress
              </Badge>
            ) : null}
          </h2>
          <p className="text-sm text-muted-foreground">
            Bring an existing pharmacy live without re-entering years of sales — opening stock, cash, bank and
            customer/supplier balances post as normal, balanced ledger entries.
          </p>
        </div>
        {isDraft && (
          <Button variant="success" onClick={() => setConfirmCompleteOpen(true)} loading={completing} loadingText="Completing…" className="sm:shrink-0">
            <CheckCircle2 aria-hidden />
            Complete migration
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-6" aria-busy="true">
          <span className="sr-only">Loading opening balances</span>
          <Skeleton className="h-12" />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <>
          {/* Progress — the order to work through the wizard */}
          <nav aria-label="Opening balance steps" className="mb-6 overflow-x-auto">
            <ol className="flex min-w-max items-center gap-2">
              {steps.map((step, i) => (
                <li key={step.n} className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm",
                      step.done
                        ? "border-success/25 bg-success/10 text-success"
                        : session && !isCompleted && step.n > 1
                          ? "border-primary/25 bg-primary/5 text-foreground"
                          : !session && step.n === 1
                            ? "border-primary/40 bg-primary/10 font-medium text-primary"
                            : "border-border bg-card text-muted-foreground"
                    )}
                  >
                    {step.done ? (
                      <CheckCircle2 className="h-4 w-4" aria-hidden />
                    ) : (
                      <span className="num flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-semibold" aria-hidden>
                        {step.n}
                      </span>
                    )}
                    {step.label}
                    <span className="sr-only">{step.done ? "(done)" : ""}</span>
                  </span>
                  {i < steps.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />}
                </li>
              ))}
            </ol>
          </nav>

          {isCompleted && (
            <div role="status" className="mb-6 flex items-start gap-3 rounded-xl border border-success/25 bg-success/10 p-4 text-sm">
              <Lock className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
              <div>
                <p className="font-medium text-foreground">Migration completed — opening balances are locked</p>
                <p className="mt-0.5 text-muted-foreground">
                  To correct an opening entry, void or reverse its voucher in Accounting.
                </p>
              </div>
            </div>
          )}

          <Section spacing="lg">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-display text-base">
                  <StepNumber n={1} />
                  Migration session
                </CardTitle>
                <CardDescription>
                  The cutover date is the day you stop using your old system — opening balances are dated here, and every
                  live sale/purchase from this date forward is a normal system transaction.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!session ? (
                  <form
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault()
                      void handleStart()
                    }}
                  >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="cutover-date">
                          Cutover date <span className="text-destructive" aria-hidden>*</span>
                        </Label>
                        <DatePicker id="cutover-date" value={cutoverDate} onChange={setCutoverDate} aria-describedby="cutover-date-help" />
                        <p id="cutover-date-help" className="text-xs text-muted-foreground">
                          Usually the end of the last day on your old system (AD or BS).
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="migration-notes">Notes</Label>
                      <Textarea
                        id="migration-notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Optional — e.g. migrating from Excel + manual ledger"
                        rows={2}
                      />
                    </div>
                    <Button type="submit" loading={starting} loadingText="Starting…">
                      Start migration
                    </Button>
                  </form>
                ) : (
                  <dl className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Cutover date</dt>
                      <dd className="num font-medium text-foreground">{session.cutover_date}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Status</dt>
                      <dd className="font-medium text-foreground">{isCompleted ? "Completed (locked)" : "In progress"}</dd>
                    </div>
                  </dl>
                )}
              </CardContent>
            </Card>
          </Section>

          {session && (
            <fieldset disabled={!isDraft} className="contents">
              <Section spacing="lg">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 font-display text-base">
                      <StepNumber n={2} />
                      Opening stock
                    </CardTitle>
                    <CardDescription>Physical stock counted at cutover — posts Dr Inventory / Cr Opening balance equity.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="max-w-xs space-y-2">
                      {branchLocked ? (
                        <>
                          <span className="text-sm font-medium leading-none">Branch</span>
                          <BranchScopeBadge branch={branchAccess.ownBranch} className="w-full" />
                        </>
                      ) : (
                        <>
                          <Label htmlFor="opening-branch">
                            Branch <span className="text-destructive" aria-hidden>*</span>
                          </Label>
                          <Select value={branchId} onValueChange={setBranchId}>
                            <SelectTrigger id="opening-branch">
                              <SelectValue placeholder="Select branch" />
                            </SelectTrigger>
                            <SelectContent>
                              {branches.map((b) => (
                                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="hidden gap-2 px-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]" aria-hidden>
                        <span>Medicine</span>
                        <span className="text-right">Quantity</span>
                        <span className="text-right">Unit cost (NPR)</span>
                        <span>Batch no.</span>
                        <span>Expiry date</span>
                        <span className="w-10" />
                      </div>
                      {stockRows.map((row, i) => (
                        <div
                          key={i}
                          className="grid grid-cols-1 items-center gap-2 rounded-lg border p-2 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] md:border-0 md:p-0"
                        >
                          <MedicineCombobox
                            medicines={medicines}
                            value={row.medicine_id}
                            onValueChange={(v) => updateStockRow(i, { medicine_id: v })}
                            placeholder="Select medicine..."
                            onSearchChange={handleMedicineSearch}
                            isSearching={medicineSearching}
                          />
                          <Input aria-label={`Line ${i + 1} quantity`} className="num text-right" type="number" min={0} placeholder="Qty" value={row.quantity || ""} onChange={(e) => updateStockRow(i, { quantity: Number(e.target.value) || 0 })} />
                          <Input aria-label={`Line ${i + 1} unit cost`} className="num text-right" type="number" min={0} step="0.01" placeholder="Unit cost" value={row.unit_cost || ""} onChange={(e) => updateStockRow(i, { unit_cost: Number(e.target.value) || 0 })} />
                          <Input aria-label={`Line ${i + 1} batch number`} placeholder="Batch #" value={row.batch_number} onChange={(e) => updateStockRow(i, { batch_number: e.target.value })} />
                          <DatePicker aria-label={`Line ${i + 1} expiry date`} value={row.expiry_date} onChange={(v) => updateStockRow(i, { expiry_date: v })} presets={EXPIRY_PRESETS} allowFuture placeholder="Expiry" compact clearable />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeStockRow(i)}
                            disabled={stockRows.length === 1}
                            aria-label={`Remove line ${i + 1}`}
                            className="justify-self-end text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </Button>
                        </div>
                      ))}
                      <Button type="button" variant="outline" size="sm" onClick={addStockRow}>
                        <Plus aria-hidden />
                        Add line
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Batch number and expiry are printed on the pack; leave blank if unknown. Lines without a medicine or quantity are skipped.
                      </p>
                    </div>

                    <div className="flex justify-end border-t pt-4">
                      <Button onClick={handleImportStock} loading={importingStock} loadingText="Importing…">
                        Import opening stock
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </Section>

              <Section spacing="lg">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 font-display text-base">
                      <StepNumber n={3} />
                      Opening cash &amp; bank
                    </CardTitle>
                    <CardDescription>What&apos;s physically in the till and in the bank as of the cutover date. Each can only be set once — void the voucher in Accounting to redo it.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="opening-cash">Opening cash on hand (NPR)</Label>
                      <div className="flex gap-2">
                        <Input id="opening-cash" className="num text-right" type="number" min={0} step="0.01" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} placeholder="0.00" />
                        <Button onClick={handleSetCash} loading={savingCash}>Save</Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="opening-bank">Opening bank balance (NPR)</Label>
                      <div className="flex gap-2">
                        <Input id="opening-bank" className="num text-right" type="number" min={0} step="0.01" value={bankAmount} onChange={(e) => setBankAmount(e.target.value)} placeholder="0.00" />
                        <Button onClick={handleSetBank} loading={savingBank}>Save</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Section>

              <Section spacing="lg">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 font-display text-base">
                      <StepNumber n={4} />
                      Opening customer balances (AR)
                    </CardTitle>
                    <CardDescription>What each credit customer owed you at cutover — posts to that customer&apos;s statement and the AR control account.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      {customerRows.map((row, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                          <CustomerCombobox
                            customers={customers}
                            value={row.id}
                            onValueChange={(v) => updatePartyRow(setCustomerRows, i, { id: v })}
                            placeholder="Select customer..."
                            className="min-w-0 flex-1"
                            aria-label={`Customer ${i + 1}`}
                            onSearchChange={handleCustomerSearch}
                            isSearching={customerSearching}
                          />
                          <Input aria-label={`Customer ${i + 1} amount owed (NPR)`} type="number" min={0} step="0.01" className="num w-full text-right sm:w-40" placeholder="Amount owed" value={row.amount || ""} onChange={(e) => updatePartyRow(setCustomerRows, i, { amount: Number(e.target.value) || 0 })} />
                          <Button type="button" variant="ghost" size="icon" onClick={() => removePartyRow(setCustomerRows, i)} disabled={customerRows.length === 1} aria-label={`Remove customer line ${i + 1}`} className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </Button>
                        </div>
                      ))}
                      <Button type="button" variant="outline" size="sm" onClick={() => addPartyRow(setCustomerRows)}>
                        <Plus aria-hidden />
                        Add customer
                      </Button>
                    </div>
                    <div className="flex justify-end border-t pt-4">
                      <Button onClick={handleImportCustomers} loading={savingCustomers} loadingText="Saving…">
                        Save customer balances
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </Section>

              <Section spacing="lg">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 font-display text-base">
                      <StepNumber n={5} />
                      Opening supplier balances (AP)
                    </CardTitle>
                    <CardDescription>What you owed each supplier at cutover — posts to that supplier&apos;s statement and the AP control account.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      {supplierRows.map((row, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                          <SupplierCombobox
                            suppliers={suppliers}
                            value={row.id}
                            onValueChange={(v) => updatePartyRow(setSupplierRows, i, { id: v })}
                            placeholder="Select supplier..."
                            className="min-w-0 flex-1"
                            aria-label={`Supplier ${i + 1}`}
                            onSearchChange={handleSupplierSearch}
                            isSearching={supplierSearching}
                          />
                          <Input aria-label={`Supplier ${i + 1} amount owed (NPR)`} type="number" min={0} step="0.01" className="num w-full text-right sm:w-40" placeholder="Amount owed" value={row.amount || ""} onChange={(e) => updatePartyRow(setSupplierRows, i, { amount: Number(e.target.value) || 0 })} />
                          <Button type="button" variant="ghost" size="icon" onClick={() => removePartyRow(setSupplierRows, i)} disabled={supplierRows.length === 1} aria-label={`Remove supplier line ${i + 1}`} className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </Button>
                        </div>
                      ))}
                      <Button type="button" variant="outline" size="sm" onClick={() => addPartyRow(setSupplierRows)}>
                        <Plus aria-hidden />
                        Add supplier
                      </Button>
                    </div>
                    <div className="flex justify-end border-t pt-4">
                      <Button onClick={handleImportSuppliers} loading={savingSuppliers} loadingText="Saving…">
                        Save supplier balances
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </Section>
            </fieldset>
          )}

          {isDraft && (
            <Section spacing="lg">
              <Card className="border-warning/30">
                <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 font-display text-base">
                      <StepNumber n={6} />
                      Complete migration
                    </CardTitle>
                    <CardDescription>
                      Once every balance above is entered, complete the migration. This locks opening balances and cannot be undone here.
                    </CardDescription>
                  </div>
                  <Button variant="success" onClick={() => setConfirmCompleteOpen(true)} loading={completing} loadingText="Completing…">
                    <CheckCircle2 aria-hidden />
                    Complete migration
                  </Button>
                </CardHeader>
              </Card>
            </Section>
          )}
        </>
      )}

      <ConfirmDialog
        isOpen={confirmCompleteOpen}
        onClose={() => setConfirmCompleteOpen(false)}
        onConfirm={() => {
          setConfirmCompleteOpen(false)
          void handleComplete()
        }}
        title="Complete migration and lock opening balances?"
        description="Opening stock, cash, bank, customer and supplier balances will be locked and can no longer be changed here. Corrections after this must be made by voiding or reversing vouchers in Accounting. This cannot be undone."
        confirmText="Complete and lock"
        cancelText="Keep editing"
        variant="destructive"
      />
    </div>
  )
}

function StepNumber({ n }: { n: number }) {
  return (
    <span
      className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary ring-1 ring-primary/15"
      aria-hidden
    >
      {n}
    </span>
  )
}
