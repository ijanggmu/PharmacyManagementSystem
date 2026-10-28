"use client"

/**
 * New supplier return = a numbered debit note (DN-{branch}-{FY}-{n}).
 *
 * - Medicines come from the server: the chosen supplier's medicines by default, or any medicine
 *   (typed search) when "All medicines" is on — the server still refuses more than was received
 *   from that supplier.
 * - Stock shown is this branch's stock; a line can name the batch going back (otherwise the
 *   oldest-expiring stock goes first).
 * - The debit note is valued by the server at the cost of the lots that actually leave stock. The form
 *   only previews it: the named batch's cost, else the medicine's purchase cost — never its selling price.
 * - VAT is previewed at the pharmacy rate on taxable lines; the server computes the real figure.
 * - After posting, the form shows the debit-note number with a Print button.
 */

import type React from "react"
import { useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, FileText, Package, Plus, Printer, Receipt, Trash2, Truck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CurrencyDisplay } from "@/components/currency-display"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { medicinesApi, type Medicine } from "@/features/medicines/api-client"
import { MedicineCombobox } from "@/features/medicines/components/medicine-combobox"
import { SupplierCombobox } from "@/features/suppliers/components/supplier-combobox"
import { useSupplierOptions } from "@/features/suppliers/hooks/use-supplier-options"
import { suppliersApi } from "@/features/suppliers/api-client"
import { supplierReturnsApi } from "@/features/suppliers/api-client-returns"
import { supplierReturnTotal } from "@/lib/api/suppliers-api"
import { createIdempotencyKeyTracker } from "@/lib/api/idempotency"
import { invalidateAfterSupplierReturn } from "@/features/returns/lib/supplier-return-cache"
import { useBranchAccess } from "@/features/branches/hooks/use-branch-access"
import { useVatRate } from "@/features/settings/hooks/use-vat-rate"
import { usePrintDebitNote } from "@/features/returns/hooks/use-print-debit-note"
import {
  ANY_BATCH,
  estimatedUnitCost,
  lineVat,
  medicineStock,
  money,
  returnableBatches,
  type ReturnLine,
} from "@/features/returns/lib/supplier-return-math"

interface User {
  id: string
  full_name: string
  email: string
}

interface NewReturnFormProps {
  currentUser: User | null
  /** Called when the user is done (after the success screen). Absent = full page; goes back to the list. */
  onSuccess?: () => void
  initialSupplierId?: string
}

const REASONS = [
  ["expired", "Expired"],
  ["near_expiry", "Near expiry"],
  ["damaged", "Damaged"],
  ["defective", "Defective"],
  ["wrong_item", "Wrong item"],
  ["overstocked", "Overstocked"],
  ["recalled", "Recalled"],
] as const

function newLine(): ReturnLine {
  return { key: crypto.randomUUID(), medicine: null, batchId: ANY_BATCH, quantity: 1, unitCost: 0, reason: "expired", notes: "" }
}

export default function NewReturnForm({ currentUser, onSuccess, initialSupplierId = "" }: NewReturnFormProps) {
  const { toast } = useToast()
  const router = useRouter()
  const queryClient = useQueryClient()
  const access = useBranchAccess()
  const { data: vatRate = 13 } = useVatRate()
  const { print, printingId } = usePrintDebitNote()

  const [supplierSearch, setSupplierSearch] = useState("")
  const supplierOptions = useSupplierOptions({ search: supplierSearch })
  const [supplierId, setSupplierId] = useState(initialSupplierId)
  const [allMedicines, setAllMedicines] = useState(false)
  const [medicineSearch, setMedicineSearch] = useState("")
  const [billNumber, setBillNumber] = useState("")
  const [vatBill, setVatBill] = useState(true)
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<ReturnLine[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [posted, setPosted] = useState<{ id: string; number: string | null; total: number } | null>(null)
  /** One Idempotency-Key per return submitted; the same return retried reuses it, so it posts once. */
  const submitKeys = useRef(createIdempotencyKeyTracker())

  const branchId = access.ownBranchId ?? undefined
  const searchTerm = medicineSearch.trim()
  const medicinesQuery = useQuery({
    queryKey: ["supplier-return-medicines", allMedicines ? "" : supplierId, allMedicines ? searchTerm : "", branchId],
    queryFn: async () => {
      const res = await medicinesApi.getMedicines({
        supplierId: allMedicines ? undefined : supplierId,
        search: allMedicines ? searchTerm : undefined,
        branchId,
        limit: 200,
        sortBy: "name",
        sortOrder: "asc",
      })
      if (res.error) throw new Error(res.error)
      const linked = res.data ?? []
      if (allMedicines) return linked
      // Also offer what was actually bought from this supplier on its bills, even when the medicine's preferred
      // supplier is someone else.
      const history = await suppliersApi.getCostHistory(supplierId)
      const known = new Set(linked.map((m) => m.id))
      const boughtIds = new Set(history.data.map((r) => r.medicine_id).filter((id) => id && !known.has(id)))
      if (boughtIds.size === 0) return linked
      const all = await medicinesApi.getMedicines({ branchId, limit: 5000, sortBy: "name", sortOrder: "asc" })
      const bought = (all.data ?? []).filter((m) => boughtIds.has(m.id))
      return [...linked, ...bought].sort((a, b) => a.name.localeCompare(b.name))
    },
    enabled: Boolean(supplierId) && (!allMedicines || searchTerm.length >= 2),
    staleTime: 30_000,
  })
  const medicines = useMemo(() => medicinesQuery.data ?? [], [medicinesQuery.data])
  // The picker shows this branch's stock.
  const pickerMedicines = useMemo(() => medicines.map((m) => ({ ...m, stock_quantity: medicineStock(m) })), [medicines])

  const supplierLabel =
    supplierOptions.knownOptions.find((s) => s.id === supplierId)?.name ?? (supplierId ? "Selected supplier" : undefined)

  const updateLine = (key: string, patch: Partial<ReturnLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const chooseMedicine = (key: string, id: string) => {
    const medicine = medicines.find((m) => m.id === id)
    if (!medicine) return
    updateLine(key, {
      medicine,
      batchId: ANY_BATCH,
      batchCap: undefined,
      unitCost: estimatedUnitCost(medicine),
      quantity: medicineStock(medicine) > 0 ? 1 : 0,
    })
  }

  const changeSupplier = (id: string) => {
    setSupplierId(id)
    setLines([])
  }

  const goodsTotal = money(lines.reduce((s, l) => s + money(l.quantity * l.unitCost), 0))
  const vatTotal = money(lines.reduce((s, l) => s + lineVat(l, vatBill, vatRate), 0))
  const debitTotal = money(goodsTotal + vatTotal)

  const lineProblem = (l: ReturnLine): string | null => {
    if (!l.medicine) return "Choose a medicine."
    const cap = l.batchCap ?? medicineStock(l.medicine)
    if (l.quantity <= 0) return "Enter a quantity."
    if (l.quantity > cap) return `Only ${cap} in stock${l.batchCap !== undefined ? " in this batch" : " at this branch"}.`
    return null
  }
  const problems = lines.map(lineProblem)
  const hasProblem = problems.some(Boolean)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitAttempted(true)
    if (!supplierId || lines.length === 0 || hasProblem) {
      toast({
        title: "Check the return",
        description: !supplierId
          ? "Choose the supplier the goods go back to."
          : lines.length === 0
            ? "Add at least one medicine."
            : "Fix the highlighted lines.",
        variant: "destructive",
      })
      return
    }
    setIsSubmitting(true)
    try {
      const input = {
        supplier_id: supplierId,
        notes: notes.trim() || undefined,
        supplier_invoice_number: billNumber.trim() || undefined,
        reverse_input_vat: vatBill,
        items: lines.map((l) => ({
          medicine_id: l.medicine!.id,
          quantity: l.quantity,
          // Informational: the server values the debit note at the cost of the lots that leave stock.
          unit_cost: l.unitCost,
          return_reason: l.reason,
          notes: l.notes.trim() || undefined,
          batch_id: l.batchId === ANY_BATCH ? null : l.batchId,
        })),
      }
      const result = await supplierReturnsApi.create(input, submitKeys.current.keyFor(JSON.stringify(input)))
      if (result.error || !result.data) throw new Error(result.error ?? "The return was not saved.")
      submitKeys.current.reset()
      // Stock, the supplier's payable and the returns lists all moved: refresh them wherever they're shown
      // (this form is used by both the Returns modal and /dashboard/returns/new).
      void invalidateAfterSupplierReturn(queryClient)
      const saved = await supplierReturnsApi.get(result.data.id)
      setPosted({
        id: result.data.id,
        number: saved.data?.documentNumber ?? null,
        total: saved.data ? supplierReturnTotal(saved.data) : debitTotal,
      })
    } catch (error) {
      toast({
        title: "Couldn't post the return",
        description: error instanceof Error ? error.message : "Try again in a moment.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const finish = () => {
    if (onSuccess) onSuccess()
    else router.push("/dashboard/returns?tab=supplier")
  }

  if (posted) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border bg-gradient-to-b from-primary/[0.06] to-transparent px-6 py-10 text-center" role="status">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
          <CheckCircle2 className="h-7 w-7" aria-hidden />
        </span>
        <div className="space-y-1">
          <h3 className="font-display text-lg font-semibold">Debit note posted</h3>
          {posted.number && <p className="num font-mono text-base font-medium text-primary">{posted.number}</p>}
          <p className="text-sm text-muted-foreground">
            Stock went down and {supplierLabel ?? "the supplier"}&apos;s payable dropped by{" "}
            <span className="num font-medium text-foreground">
              <CurrencyDisplay amount={posted.total} />
            </span>
            .
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => void print(posted.id)}
            loading={printingId === posted.id}
            loadingText="Preparing…"
          >
            <Printer className="h-4 w-4" aria-hidden />
            Print debit note
          </Button>
          <Button type="button" onClick={finish}>
            Done
          </Button>
        </div>
      </div>
    )
  }

  const isPage = !onSuccess
  const required = (
    <span className="text-destructive" aria-hidden>
      {" "}
      *
    </span>
  )

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-5", isPage && "pb-24")} noValidate>
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck className="h-4 w-4 text-primary" aria-hidden />
            Supplier & bill
          </CardTitle>
          <CardDescription>Who the goods go back to, and the bill they came on.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dn-supplier">Supplier{required}</Label>
              <SupplierCombobox
                id="dn-supplier"
                suppliers={supplierOptions.options}
                value={supplierId}
                onValueChange={changeSupplier}
                onSearchChange={setSupplierSearch}
                isSearching={supplierOptions.isSearching}
                isLoading={supplierOptions.isLoading}
                error={supplierOptions.error}
                onRetry={supplierOptions.refetch}
                selectedLabel={supplierLabel}
                placeholder="Search suppliers…"
                aria-required
                aria-invalid={submitAttempted && !supplierId ? true : undefined}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dn-bill">Supplier bill no.</Label>
              <Input
                id="dn-bill"
                value={billNumber}
                onChange={(e) => setBillNumber(e.target.value)}
                placeholder="e.g. INV-2083-0412"
                maxLength={100}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">Printed on the debit note so the supplier can match it.</p>
            </div>
          </div>
          <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/30 p-3">
            <div className="space-y-0.5">
              <Label htmlFor="dn-vat" className="flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                Goods came on a VAT bill
              </Label>
              <p className="text-xs text-muted-foreground">
                {vatBill
                  ? `Input VAT (${vatRate}%) on taxable medicines is reversed and added to the debit.`
                  : "No VAT is reversed. Use this for goods bought on a PAN-only bill or no bill."}
              </p>
            </div>
            <Switch id="dn-vat" checked={vatBill} onCheckedChange={setVatBill} />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dn-notes">Remarks</Label>
              <Textarea
                id="dn-notes"
                placeholder="e.g. Collected by supplier rep; adjust against next bill"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dn-by">Processed by</Label>
              <Input id="dn-by" value={currentUser?.full_name || "You"} readOnly disabled />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4 text-primary" aria-hidden />
              Items going back{required}
            </CardTitle>
            <CardDescription>
              {allMedicines
                ? "Searching every medicine. The server checks you received it from this supplier."
                : "Medicines linked to or bought from this supplier. Stock shown is this branch's."}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="dn-all" className="text-xs font-normal text-muted-foreground">
              All medicines
            </Label>
            <Switch id="dn-all" checked={allMedicines} onCheckedChange={setAllMedicines} disabled={!supplierId} />
          </div>
        </CardHeader>
        <CardContent>
          {!supplierId ? (
            <EmptyLines text="Choose a supplier first, then add what you're sending back." />
          ) : !allMedicines && medicinesQuery.isError ? (
            <EmptyLines
              text="Couldn't load this supplier's medicines."
              action={
                <Button type="button" variant="outline" size="sm" onClick={() => void medicinesQuery.refetch()}>
                  Retry
                </Button>
              }
            />
          ) : !allMedicines && medicinesQuery.isSuccess && medicines.length === 0 ? (
            <EmptyLines
              text="No medicines are linked to or were bought from this supplier."
              action={
                <Button type="button" variant="outline" size="sm" onClick={() => setAllMedicines(true)}>
                  Search all medicines
                </Button>
              }
            />
          ) : lines.length === 0 ? (
            <EmptyLines
              text="Nothing added yet."
              action={
                <Button type="button" variant="outline" size="sm" onClick={() => setLines([newLine()])}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Add medicine
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {lines.map((line, index) => (
                <LineEditor
                  key={line.key}
                  index={index}
                  line={line}
                  medicines={pickerMedicines}
                  allMedicines={allMedicines}
                  onSearch={setMedicineSearch}
                  isSearching={medicinesQuery.isFetching}
                  branchId={branchId}
                  vat={lineVat(line, vatBill, vatRate)}
                  problem={submitAttempted ? problems[index] : null}
                  onChooseMedicine={(id) => chooseMedicine(line.key, id)}
                  onChange={(patch) => updateLine(line.key, patch)}
                  onRemove={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                />
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, newLine()])}>
                <Plus className="h-4 w-4" aria-hidden />
                Add another medicine
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {lines.length > 0 && (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.05] to-transparent">
          <CardContent className="grid gap-3 pt-6 sm:grid-cols-3">
            <Total label="Goods value (est.)" amount={goodsTotal} />
            <Total label={vatBill ? `VAT reversed (${vatRate}%)` : "VAT reversed"} amount={vatTotal} />
            <Total label="Total debit to supplier (est.)" amount={debitTotal} strong />
            <p className="text-xs text-muted-foreground sm:col-span-3">
              Estimate. The debit note is valued at the purchase cost of the batches that actually go back; the
              posted amount is shown once it is saved.
            </p>
          </CardContent>
        </Card>
      )}

      <div
        className={cn(
          "flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end",
          isPage
            ? "sticky bottom-0 z-10 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:mx-0 sm:rounded-lg sm:border sm:px-4"
            : // In a dialog: pinned to the bottom of its scrolling body, edge to edge.
              "sticky bottom-0 z-10 -mx-6 -mb-6 border-t bg-background px-6 py-3",
        )}
      >
        <p className="mr-auto hidden text-sm text-muted-foreground sm:block">
          <span className="num">{lines.length}</span> {lines.length === 1 ? "line" : "lines"} · debit{" "}
          <span className="num font-medium text-foreground">
            <CurrencyDisplay amount={debitTotal} />
          </span>
        </p>
        {isPage && (
          <Button type="button" variant="outline" asChild>
            <Link href="/dashboard/returns?tab=supplier">Cancel</Link>
          </Button>
        )}
        <Button type="submit" disabled={lines.length === 0} loading={isSubmitting} loadingText="Posting debit note…">
          <FileText className="h-4 w-4" aria-hidden />
          Post debit note
        </Button>
      </div>
    </form>
  )
}

function EmptyLines({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-8 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
      {action}
    </div>
  )
}

function Total({ label, amount, strong = false }: { label: string; amount: number; strong?: boolean }) {
  return (
    <div className={cn("rounded-lg px-3 py-2", strong && "bg-primary/10")}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("num mt-0.5 font-semibold", strong ? "font-display text-xl text-primary" : "text-base")}>
        <CurrencyDisplay amount={amount} />
      </p>
    </div>
  )
}

interface LineEditorProps {
  index: number
  line: ReturnLine
  medicines: Medicine[]
  allMedicines: boolean
  onSearch: (q: string) => void
  isSearching: boolean
  branchId?: string
  vat: number
  problem: string | null
  onChooseMedicine: (id: string) => void
  onChange: (patch: Partial<ReturnLine>) => void
  onRemove: () => void
}

function LineEditor({
  index,
  line,
  medicines,
  allMedicines,
  onSearch,
  isSearching,
  branchId,
  vat,
  problem,
  onChooseMedicine,
  onChange,
  onRemove,
}: LineEditorProps) {
  const medicineId = line.medicine?.id
  const batchesQuery = useQuery({
    queryKey: ["medicine-batches", medicineId],
    queryFn: async () => {
      const res = await medicinesApi.getMedicineBatches(medicineId!)
      if (res.error) throw new Error(res.error)
      return res.data
    },
    enabled: Boolean(medicineId),
    staleTime: 30_000,
  })
  const batches = useMemo(() => returnableBatches(batchesQuery.data ?? [], branchId), [batchesQuery.data, branchId])
  // Keep a chosen medicine visible even when the current search no longer lists it.
  const chosen = line.medicine
  const options =
    chosen && !medicines.some((m) => m.id === chosen.id)
      ? [{ ...chosen, stock_quantity: medicineStock(chosen) }, ...medicines]
      : medicines
  const cap = line.batchCap ?? (chosen ? medicineStock(chosen) : 0)
  const id = (s: string) => `dn-${s}-${line.key}`

  const chooseBatch = (value: string) => {
    if (value === ANY_BATCH) {
      onChange({ batchId: ANY_BATCH, batchCap: undefined, unitCost: estimatedUnitCost(chosen) })
      return
    }
    const batch = batches.find((b) => b.id === value)
    if (!batch) return
    onChange({
      batchId: batch.id,
      batchCap: batch.quantity_remaining,
      quantity: Math.min(line.quantity || 1, batch.quantity_remaining),
      unitCost: estimatedUnitCost(chosen, batch),
    })
  }

  return (
    <div
      role="group"
      aria-label={`Line ${index + 1}`}
      className={cn(
        "space-y-3 rounded-xl border bg-card p-3 transition-colors duration-200 sm:p-4",
        problem && "border-destructive/60 bg-destructive/[0.03]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">
            {index + 1}
          </span>
          <span className="truncate">{chosen ? chosen.name : "New line"}</span>
          {chosen && chosen.is_taxable === false && <Badge variant="muted">VAT exempt</Badge>}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={onRemove}
          aria-label={`Remove line ${index + 1}`}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          Remove
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)]">
        <div className="space-y-1.5">
          <Label htmlFor={id("med")}>Medicine</Label>
          <MedicineCombobox
            id={id("med")}
            medicines={options}
            value={chosen?.id}
            onValueChange={onChooseMedicine}
            onSearchChange={allMedicines ? onSearch : undefined}
            isSearching={allMedicines && isSearching}
            placeholder={allMedicines ? "Type 2+ letters to search…" : "Choose medicine…"}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={id("batch")}>Batch</Label>
          <Select value={line.batchId} onValueChange={chooseBatch} disabled={!chosen}>
            <SelectTrigger id={id("batch")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_BATCH}>Oldest expiry first (auto)</SelectItem>
              {batches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  <span className="font-mono">{b.batch_number}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {b.expiry_date ? `exp ${b.expiry_date.slice(0, 7)}` : "no expiry"} · {b.quantity_remaining} left
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {chosen && batchesQuery.isSuccess && batches.length === 0 && (
            <p className="text-xs text-muted-foreground">No batches with stock at this branch.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor={id("qty")}>Quantity</Label>
          <Input
            id={id("qty")}
            type="number"
            inputMode="decimal"
            min={0}
            max={cap || undefined}
            disabled={!chosen}
            value={line.quantity}
            onChange={(e) => onChange({ quantity: Math.max(0, Number(e.target.value) || 0) })}
            className="num text-right"
            aria-invalid={problem ? true : undefined}
          />
          {chosen && (
            <p className="text-xs text-muted-foreground">
              <span className="num">{cap}</span> {line.batchCap !== undefined ? "in this batch" : "in stock here"}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <span id={id("cost")} className="text-sm font-medium leading-none">
            Unit cost
          </span>
          <div
            aria-labelledby={id("cost")}
            className="num flex h-10 items-center justify-end rounded-md border bg-muted/40 px-3 text-sm"
          >
            {chosen ? <CurrencyDisplay amount={line.unitCost} /> : "—"}
          </div>
          <p className="text-xs text-muted-foreground">
            {line.batchId === ANY_BATCH ? "Est. purchase cost; the batches that go out set it." : "This batch's purchase cost."}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={id("reason")}>Reason</Label>
          <Select value={line.reason} onValueChange={(v) => onChange({ reason: v })}>
            <SelectTrigger id={id("reason")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REASONS.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <span className="text-sm font-medium leading-none">Line debit</span>
          <div className="num flex h-10 items-center justify-end rounded-md border bg-muted/40 px-3 text-sm font-semibold">
            <CurrencyDisplay amount={money(money(line.quantity * line.unitCost) + vat)} />
          </div>
          {vat > 0 && (
            <p className="num text-right text-xs text-muted-foreground">
              incl. VAT <CurrencyDisplay amount={vat} />
            </p>
          )}
        </div>
      </div>

      <Input
        aria-label={`Note for line ${index + 1}`}
        placeholder="Line note (optional), e.g. 3 strips crushed"
        value={line.notes}
        onChange={(e) => onChange({ notes: e.target.value })}
        maxLength={500}
      />
      {problem && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {problem}
        </p>
      )}
    </div>
  )
}
