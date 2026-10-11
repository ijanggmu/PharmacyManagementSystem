"use client"

import { useMemo, useState } from "react"
import { ArrowRight, Plus, Trash2, Truck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import type { Medicine } from "@/features/medicines/api-client"
import { MedicineCombobox } from "@/features/medicines/components/medicine-combobox"
import { BranchScopeBadge } from "@/features/branches/components/branch-scope-badge"
import type { BranchAccess } from "@/features/branches/hooks/use-branch-access"
import { useCreateStockTransfer } from "@/features/inventory/hooks/use-stock-transfers"
import { availableStock, transferSourceBranchId } from "./transfer-source"

interface LineRow {
  key: number
  medicine_id: string
  quantity: string
}

interface FormErrors {
  from?: string
  to?: string
  lines?: string
  lineErrors: Record<number, string>
}

function RequiredMark() {
  return (
    <span className="text-destructive" aria-hidden>
      *
    </span>
  )
}

let lineKey = 0
const newLine = (): LineRow => ({ key: ++lineKey, medicine_id: "", quantity: "1" })

export function NewTransferForm({
  branches,
  medicines,
  medicinesLoading,
  branchAccess,
  onCreated,
}: {
  branches: ReadonlyArray<{ id: string; name: string; code: string }>
  medicines: Medicine[]
  medicinesLoading: boolean
  branchAccess: BranchAccess
  onCreated: () => void
}) {
  const { toast } = useToast()
  const create = useCreateStockTransfer()
  const [toBranchId, setToBranchId] = useState("")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<LineRow[]>(() => [newLine()])
  const [errors, setErrors] = useState<FormErrors>({ lineErrors: {} })

  // Stock always leaves from the current branch (see transferSourceBranchId).
  const sourceBranchId = branchAccess.isLoading ? "" : transferSourceBranchId(branchAccess)
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name

  // The picker shows on-hand stock, so the cashier can see what can actually be sent.
  const pickerMedicines = useMemo(
    () => medicines.map((m) => ({ id: m.id, name: m.name, generic_name: m.generic_name, stock_quantity: availableStock(m) })),
    [medicines],
  )
  const byId = useMemo(() => new Map(medicines.map((m) => [m.id, m])), [medicines])

  const updateLine = (key: number, patch: Partial<LineRow>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
    setErrors((e) => ({ ...e, lines: undefined, lineErrors: { ...e.lineErrors, [key]: "" } }))
  }

  const validate = (): FormErrors => {
    const next: FormErrors = { lineErrors: {} }
    if (!sourceBranchId) next.from = "Your current branch could not be determined. Select a branch first."
    if (!toBranchId) next.to = "Choose the branch that will receive the stock."
    else if (toBranchId === sourceBranchId) next.to = "Destination must be a different branch."

    const filled = lines.filter((l) => l.medicine_id)
    if (filled.length === 0) next.lines = "Add at least one medicine."
    const seen = new Set<string>()
    for (const line of lines) {
      if (!line.medicine_id) continue
      const qty = Number(line.quantity)
      const stock = availableStock(byId.get(line.medicine_id))
      if (seen.has(line.medicine_id)) next.lineErrors[line.key] = "This medicine is already on another line."
      else if (!Number.isInteger(qty) || qty <= 0) next.lineErrors[line.key] = "Enter a whole number above 0."
      else if (stock !== undefined && qty > stock) next.lineErrors[line.key] = `Only ${stock} on hand.`
      seen.add(line.medicine_id)
    }
    return next
  }

  const hasErrors = (e: FormErrors) => !!(e.from || e.to || e.lines || Object.values(e.lineErrors).some(Boolean))

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const next = validate()
    setErrors(next)
    if (hasErrors(next)) return

    try {
      await create.mutateAsync({
        from_branch_id: sourceBranchId,
        to_branch_id: toBranchId,
        notes: notes.trim() || null,
        items: lines.filter((l) => l.medicine_id).map((l) => ({ medicine_id: l.medicine_id, quantity: Number(l.quantity) })),
      })
      toast({ title: "Transfer dispatched", description: "Stock left the source branch. Receive it at the destination once it arrives." })
      setToBranchId("")
      setNotes("")
      setLines([newLine()])
      setErrors({ lineErrors: {} })
      onCreated()
    } catch (error) {
      toast({
        title: "Transfer failed",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      })
    }
  }

  const fromName = branchName(sourceBranchId)
  const toName = branchName(toBranchId)
  const totalUnits = lines.reduce((s, l) => s + (l.medicine_id ? Number(l.quantity) || 0 : 0), 0)

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>New transfer</CardTitle>
          <CardDescription>
            Stock leaves the source branch immediately and stays in transit until the destination branch receives it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">Route</legend>
            <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[1fr_auto_1fr]">
              <div className="space-y-2">
                <span className="text-sm font-medium leading-none">From branch</span>
                <BranchScopeBadge branch={branchAccess.ownBranch} className="w-full" />
                {branchAccess.canViewAll && (
                  <p className="text-xs text-muted-foreground">
                    Stock is sent from your current branch. Switch branch to send from another one.
                  </p>
                )}
                <FieldError message={errors.from} />
              </div>
              <div className="hidden h-10 items-center justify-center pt-6 text-muted-foreground md:flex" aria-hidden>
                <ArrowRight className="h-5 w-5" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="transfer-to">
                  To branch <RequiredMark />
                </Label>
                <Select
                  value={toBranchId}
                  onValueChange={(v) => {
                    setToBranchId(v)
                    setErrors((e) => ({ ...e, to: undefined }))
                  }}
                >
                  <SelectTrigger id="transfer-to" aria-required aria-invalid={!!errors.to} className="h-10">
                    <SelectValue placeholder="Select destination branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches
                      .filter((b) => b.id !== sourceBranchId)
                      .map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <FieldError message={errors.to} />
              </div>
            </div>
            {(fromName || toName) && (
              <p className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Route:</span>
                <span className="font-medium">{fromName ?? "Choose source"}</span>
                <ArrowRight className="h-4 w-4 text-primary" aria-label="to" />
                <span className="font-medium">{toName ?? "Choose destination"}</span>
              </p>
            )}
          </fieldset>

          <fieldset className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <legend className="text-sm font-semibold">
                Medicines <RequiredMark />
              </legend>
              <span className="num text-xs text-muted-foreground">
                {lines.filter((l) => l.medicine_id).length} line(s) · {totalUnits} units
              </span>
            </div>
            <div className="overflow-hidden rounded-lg border">
              <div className="hidden grid-cols-[2.5rem_1fr_7rem_7rem_3rem] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
                <span>#</span>
                <span>Medicine</span>
                <span className="text-right">On hand</span>
                <span className="text-right">Quantity</span>
                <span className="sr-only">Remove</span>
              </div>
              <ul className="divide-y">
                {lines.map((line, index) => {
                  const stock = availableStock(byId.get(line.medicine_id))
                  const lineError = errors.lineErrors[line.key]
                  return (
                    <li key={line.key} className="px-3 py-2.5">
                      <div className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[2.5rem_1fr_7rem_7rem_3rem] sm:gap-3">
                        <span className="num hidden text-sm text-muted-foreground sm:block">{index + 1}</span>
                        <div className="col-span-2 min-w-0 sm:col-span-1">
                          <Label htmlFor={`transfer-medicine-${line.key}`} className="sr-only">
                            Medicine, line {index + 1}
                          </Label>
                          <MedicineCombobox
                            id={`transfer-medicine-${line.key}`}
                            medicines={pickerMedicines}
                            value={line.medicine_id}
                            onValueChange={(v) => updateLine(line.key, { medicine_id: v })}
                            placeholder={medicinesLoading ? "Loading medicines…" : "Select medicine…"}
                            disabled={medicinesLoading}
                          />
                        </div>
                        <span className="num text-sm text-muted-foreground sm:text-right">
                          <span className="sm:hidden">On hand: </span>
                          {line.medicine_id ? (stock ?? "—") : "—"}
                        </span>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          step={1}
                          value={line.quantity}
                          onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                          className="num h-10 text-right"
                          aria-label={`Quantity, line ${index + 1}`}
                          aria-invalid={!!lineError}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                          disabled={lines.length === 1}
                          aria-label={`Remove line ${index + 1}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      </div>
                      {lineError && <FieldError message={lineError} />}
                    </li>
                  )
                })}
              </ul>
            </div>
            <FieldError message={errors.lines} />
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, newLine()])}>
              <Plus aria-hidden />
              Add medicine
            </Button>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="transfer-notes">Notes</Label>
            <Textarea
              id="transfer-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional, e.g. courier or reason for the move"
              rows={2}
            />
          </div>
        </CardContent>
        <div className="flex flex-col-reverse gap-2 border-t px-6 py-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={create.isPending}
            onClick={() => {
              setToBranchId("")
              setNotes("")
              setLines([newLine()])
              setErrors({ lineErrors: {} })
            }}
          >
            Clear
          </Button>
          <Button type="submit" loading={create.isPending} loadingText="Dispatching…">
            <Truck aria-hidden />
            Dispatch transfer
          </Button>
        </div>
      </Card>
    </form>
  )
}
