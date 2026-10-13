"use client"

import { useState } from "react"
import { Pencil, Plus, Search, Wallet } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DatePicker } from "@/components/ui/date-picker"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SkeletonTable } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { newIdempotencyKey } from "@/lib/api/idempotency"
import { useCurrency } from "@/lib/contexts/currency-context"
import { nepalTodayYmd } from "@/lib/utils/date-limits"
import { BranchFilterSelect, useBranchFilter } from "@/features/branches/components/branch-filter"
import { MARITAL_STATUSES, type Employee, type EmployeeInput, type MaritalStatus, type SalaryStructureInput } from "@/features/payroll/api-client"
import { useAddSalaryStructure, useEmployees, useSalaryStructures, useSaveEmployee } from "@/features/payroll/hooks/use-payroll"

function emptyEmployee(branchId: string): EmployeeInput {
  return {
    fullName: "",
    branchId,
    designation: "",
    joiningDate: nepalTodayYmd(),
    pan: "",
    ssfNumber: "",
    ssfEnrolled: false,
    bankName: "",
    bankAccountNumber: "",
    maritalStatus: "Single",
    isActive: true,
  }
}

function toInput(e: Employee): EmployeeInput {
  return {
    fullName: e.fullName,
    branchId: e.branchId,
    designation: e.designation ?? "",
    joiningDate: e.joiningDate,
    pan: e.pan ?? "",
    ssfNumber: e.ssfNumber ?? "",
    ssfEnrolled: e.ssfEnrolled,
    bankName: e.bankName ?? "",
    bankAccountNumber: e.bankAccountNumber ?? "",
    maritalStatus: e.maritalStatus,
    isActive: e.isActive,
  }
}

export function PayrollEmployees() {
  const { formatCurrency } = useCurrency()
  const filter = useBranchFilter()
  const [search, setSearch] = useState("")
  const [includeInactive, setIncludeInactive] = useState(false)
  const [editing, setEditing] = useState<{ id: string | null; input: EmployeeInput } | null>(null)
  const [salaryFor, setSalaryFor] = useState<Employee | null>(null)
  const employees = useEmployees({ branchId: filter.branchId, includeInactive, search })
  const defaultBranch = filter.branchId ?? filter.access.ownBranchId ?? filter.access.branches[0]?.id ?? ""

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <BranchFilterSelect filter={filter} />
        <div className="space-y-1.5">
          <Label htmlFor="payroll-employee-search">Search</Label>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input
              id="payroll-employee-search"
              className="h-9 w-56 pl-8"
              placeholder="Name, designation or PAN"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <label className="flex h-9 items-center gap-2 text-sm">
          <Switch checked={includeInactive} onCheckedChange={setIncludeInactive} aria-label="Show inactive employees" />
          Show inactive
        </label>
        <Button className="ml-auto" onClick={() => setEditing({ id: null, input: emptyEmployee(defaultBranch) })}>
          <Plus className="mr-1 h-4 w-4" /> Add employee
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {employees.isLoading ? (
            <SkeletonTable rows={5} columns={7} />
          ) : employees.isError ? (
            <ErrorState message={apiRequestErrorMessage(employees.error)} onRetry={() => void employees.refetch()} />
          ) : (employees.data ?? []).length === 0 ? (
            <EmptyState
              title="No employees yet"
              description="Add the people you pay, then give each a salary structure."
              action={{ label: "Add employee", onClick: () => setEditing({ id: null, input: emptyEmployee(defaultBranch) }) }}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Designation</TableHead>
                  {filter.showBranchColumn && <TableHead>Branch</TableHead>}
                  <TableHead>Joined</TableHead>
                  <TableHead>SSF</TableHead>
                  <TableHead>Tax slabs</TableHead>
                  <TableHead className="text-right">Monthly gross</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(employees.data ?? []).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">
                      {e.fullName}
                      {!e.isActive && (
                        <Badge variant="outline" className="ml-2">
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{e.designation ?? "—"}</TableCell>
                    {filter.showBranchColumn && <TableCell>{filter.branchName(e.branchId)}</TableCell>}
                    <TableCell>{e.joiningDate}</TableCell>
                    <TableCell>{e.ssfEnrolled ? (e.ssfNumber ?? "Enrolled") : "—"}</TableCell>
                    <TableCell>{e.maritalStatus === "Married" ? "Couple" : "Single"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {e.currentSalary ? formatCurrency(e.currentSalary.gross) : <span className="text-muted-foreground">No salary</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" aria-label={`Edit ${e.fullName}`} onClick={() => setEditing({ id: e.id, input: toInput(e) })}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Salary of ${e.fullName}`} onClick={() => setSalaryFor(e)}>
                        <Wallet className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {editing && <EmployeeDialog key={editing.id ?? "new"} editing={editing} onClose={() => setEditing(null)} />}
      {salaryFor && <SalaryDialog employee={salaryFor} onClose={() => setSalaryFor(null)} />}
    </div>
  )
}

function EmployeeDialog({ editing, onClose }: { editing: { id: string | null; input: EmployeeInput }; onClose: () => void }) {
  const { toast } = useToast()
  const filter = useBranchFilter()
  const save = useSaveEmployee()
  const [form, setForm] = useState<EmployeeInput>(editing.input)
  const [idempotencyKey] = useState(() => newIdempotencyKey())
  const set = <K extends keyof EmployeeInput>(key: K, value: EmployeeInput[K]) => setForm((f) => ({ ...f, [key]: value }))
  const panInvalid = form.pan.trim() !== "" && !/^\d{9}$/.test(form.pan.trim())
  const invalid = form.fullName.trim() === "" || !form.branchId || !form.joiningDate || panInvalid

  const submit = () =>
    save.mutate(
      { id: editing.id, input: form, idempotencyKey },
      {
        onSuccess: () => {
          toast({ title: editing.id ? "Employee updated" : "Employee added" })
          onClose()
        },
        onError: (error) => toast({ title: "Could not save the employee", description: apiRequestErrorMessage(error), variant: "destructive" }),
      },
    )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing.id ? "Edit employee" : "Add employee"}</DialogTitle>
          <DialogDescription>Marital status picks the tax slabs; SSF enrolment adds SSF and waives the 1% social security tax.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" id="emp-name">
            <Input id="emp-name" value={form.fullName} maxLength={200} onChange={(e) => set("fullName", e.target.value)} />
          </Field>
          <Field label="Branch" id="emp-branch">
            <Select value={form.branchId} onValueChange={(v) => set("branchId", v)}>
              <SelectTrigger id="emp-branch">
                <SelectValue placeholder="Pick a branch" />
              </SelectTrigger>
              <SelectContent>
                {filter.access.branches
                  .filter((b) => b.isActive || b.id === form.branchId)
                  .map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Designation" id="emp-designation">
            <Input id="emp-designation" value={form.designation} maxLength={100} onChange={(e) => set("designation", e.target.value)} />
          </Field>
          <Field label="Joining date" id="emp-joined">
            <DatePicker id="emp-joined" value={form.joiningDate} onChange={(v) => set("joiningDate", v)} allowFuture />
          </Field>
          <Field label="PAN" id="emp-pan" error={panInvalid ? "PAN is 9 digits." : undefined}>
            <Input id="emp-pan" inputMode="numeric" value={form.pan} maxLength={9} onChange={(e) => set("pan", e.target.value)} />
          </Field>
          <Field label="Marital status (tax slabs)" id="emp-marital">
            <Select value={form.maritalStatus} onValueChange={(v) => set("maritalStatus", v as MaritalStatus)}>
              <SelectTrigger id="emp-marital">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MARITAL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === "Married" ? "Married (couple slabs)" : "Single"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="SSF number" id="emp-ssf">
            <Input id="emp-ssf" value={form.ssfNumber} maxLength={64} onChange={(e) => set("ssfNumber", e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <Switch checked={form.ssfEnrolled} onCheckedChange={(v) => set("ssfEnrolled", v)} aria-label="Enrolled in SSF" />
            Contributes to the SSF
          </label>
          <Field label="Bank" id="emp-bank">
            <Input id="emp-bank" value={form.bankName} maxLength={100} onChange={(e) => set("bankName", e.target.value)} />
          </Field>
          <Field label="Bank account number" id="emp-account">
            <Input id="emp-account" value={form.bankAccountNumber} maxLength={64} onChange={(e) => set("bankAccountNumber", e.target.value)} />
          </Field>
          {editing.id && (
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} aria-label="Active" />
              Active (inactive employees are left out of new runs)
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={invalid || save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const emptySalary = (): SalaryStructureInput => ({
  effectiveFrom: nepalTodayYmd(),
  basic: 0,
  grade: 0,
  dearnessAllowance: 0,
  otherAllowance: 0,
  otherDeduction: 0,
  citContribution: 0,
  notes: "",
})

const SALARY_FIELDS: { key: Exclude<keyof SalaryStructureInput, "effectiveFrom" | "notes">; label: string }[] = [
  { key: "basic", label: "Basic (SSF is on this)" },
  { key: "grade", label: "Grade" },
  { key: "dearnessAllowance", label: "Dearness allowance" },
  { key: "otherAllowance", label: "Other allowance" },
  { key: "citContribution", label: "CIT contribution" },
  { key: "otherDeduction", label: "Other deduction" },
]

function SalaryDialog({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const { toast } = useToast()
  const { formatCurrency } = useCurrency()
  const structures = useSalaryStructures(employee.id)
  const add = useAddSalaryStructure()
  const [form, setForm] = useState<SalaryStructureInput>(emptySalary)
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey())

  const submit = () =>
    add.mutate(
      { employeeId: employee.id, input: form, idempotencyKey },
      {
        onSuccess: () => {
          toast({ title: "Salary structure added" })
          setForm(emptySalary())
          setIdempotencyKey(newIdempotencyKey())
          void structures.refetch()
        },
        onError: (error) => toast({ title: "Could not add the salary", description: apiRequestErrorMessage(error), variant: "destructive" }),
      },
    )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Salary — {employee.fullName}</DialogTitle>
          <DialogDescription>Monthly amounts. A run uses the latest structure effective by the month&apos;s last day.</DialogDescription>
        </DialogHeader>
        {structures.isLoading ? (
          <SkeletonTable rows={2} columns={5} />
        ) : (structures.data ?? []).length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Effective from</TableHead>
                <TableHead className="text-right">Basic</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">CIT</TableHead>
                <TableHead className="text-right">Other deduction</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(structures.data ?? []).map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.effectiveFrom}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(s.basic)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(s.gross)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(s.citContribution)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(s.otherDeduction)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">No salary structure yet — this employee is skipped by payroll runs until one is added.</p>
        )}
        <div className="grid gap-3 border-t pt-3 sm:grid-cols-3">
          <Field label="Effective from" id="sal-from">
            <DatePicker id="sal-from" value={form.effectiveFrom} onChange={(v) => setForm((f) => ({ ...f, effectiveFrom: v }))} allowFuture />
          </Field>
          {SALARY_FIELDS.map(({ key, label }) => (
            <Field key={key} label={label} id={`sal-${key}`}>
              <Input
                id={`sal-${key}`}
                type="number"
                min={0}
                step="0.01"
                value={form[key] === 0 ? "" : String(form[key])}
                onChange={(e) => setForm((f) => ({ ...f, [key]: Number(e.target.value) || 0 }))}
              />
            </Field>
          ))}
          <Field label="Notes" id="sal-notes">
            <Input id="sal-notes" value={form.notes} maxLength={500} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={submit} disabled={form.basic <= 0 || !form.effectiveFrom || add.isPending}>
            {add.isPending ? "Adding…" : "Add salary structure"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function Field({ label, id, error, children }: { label: string; id: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
