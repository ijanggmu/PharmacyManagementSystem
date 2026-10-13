"use client"

import { useEffect, useRef, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CalendarDays, Pencil, Plus, Receipt, Search, Tags, Trash2, Wallet, X } from "lucide-react"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Pagination } from "@/components/ui/pagination"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonTable } from "@/components/ui/skeleton"
import { useCurrency } from "@/lib/contexts/currency-context"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/hooks/use-toast"
import { CurrencyDisplay } from "@/components/currency-display"
import { expensesApi, EXPENSE_CATEGORIES, type Expense, type ExpenseCategory } from "@/features/expenses/api-client"
import { ExpenseAccountingFields } from "@/features/expenses/components/expense-accounting-fields"
import {
  emptyExpenseAccountingForm,
  expenseAccountingFormFrom,
  expenseAccountingInput,
  expenseAccountLabel,
  type ExpenseAccountingForm,
} from "@/features/expenses/lib/expense-form"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { createIdempotencyKeyTracker } from "@/lib/api/idempotency"
import { nepalTodayYmd } from "@/lib/utils/date-limits"
import { BranchFilterSelect, useBranchFilter } from "@/features/branches/components/branch-filter"
import { currentBsMonthRange, isValidYmdRange, summarizeExpenses } from "@/features/expenses/lib/expense-period"

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  rent: "Rent",
  utilities: "Utilities",
  salaries: "Salaries",
  maintenance: "Maintenance",
  marketing: "Marketing",
  transport: "Transport",
  supplies: "Supplies",
  insurance: "Insurance",
  taxes_fees: "Taxes & Fees",
  other: "Other",
}

const PAYMENT_LABELS: Record<"cash" | "bank" | "card" | "other", string> = {
  cash: "Cash",
  bank: "Bank",
  card: "Card",
  other: "Other",
}

const todayYmd = () => nepalTodayYmd()
const PAGE_SIZE = 20
const RECEIPT_REFERENCE_MAX = 128

function RequiredMark() {
  return (
    <span className="text-destructive" aria-hidden>
      {" "}
      *
    </span>
  )
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [pageNumber, setPageNumber] = useState(1)
  // ViewAll users can narrow to one branch; otherwise the server scopes to the user's branch.
  const branchFilter = useBranchFilter()
  // List filters, applied by the API (date range is inclusive, Nepal days).
  const [filterFrom, setFilterFrom] = useState("")
  const [filterTo, setFilterTo] = useState("")
  const [filterCategory, setFilterCategory] = useState<ExpenseCategory | "all">("all")
  const filterRangeValid = isValidYmdRange(filterFrom, filterTo)
  const filtersActive = !!filterFrom || !!filterTo || filterCategory !== "all"
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Stat cards cover the current Nepali (BS) month to date, not just the current page; the API filters by
  // date so only that month's rows are fetched.
  const [monthExpenses, setMonthExpenses] = useState<Expense[]>([])
  const [statsLoading, setStatsLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  // One Idempotency-Key per expense: retrying the same values (after a timeout or error) reuses it, so the
  // expense and its voucher are recorded once; changed values get a fresh key.
  const createKeys = useRef(createIdempotencyKeyTracker())
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null)
  const [editTarget, setEditTarget] = useState<Expense | null>(null)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()
  const { formatCurrency } = useCurrency()

  const [category, setCategory] = useState<ExpenseCategory>("other")
  const [description, setDescription] = useState("")
  const [amount, setAmount] = useState("")
  const [amountError, setAmountError] = useState<string | null>(null)
  const [expenseDate, setExpenseDate] = useState(todayYmd())
  const [accounting, setAccounting] = useState<ExpenseAccountingForm>(emptyExpenseAccountingForm)
  const [receiptReference, setReceiptReference] = useState("")

  const [editCategory, setEditCategory] = useState<ExpenseCategory>("other")
  const [editDescription, setEditDescription] = useState("")
  const [editAmount, setEditAmount] = useState("")
  const [editAmountError, setEditAmountError] = useState<string | null>(null)
  const [editAccounting, setEditAccounting] = useState<ExpenseAccountingForm>(emptyExpenseAccountingForm)
  const [editReceiptReference, setEditReceiptReference] = useState("")
  const [editSaving, setEditSaving] = useState(false)

  const load = async () => {
    if (!filterRangeValid) return
    setIsLoading(true)
    setLoadError(null)
    try {
      const res = await expensesApi.getExpenses({
        page: pageNumber,
        limit: PAGE_SIZE,
        branchId: branchFilter.branchId,
        from: filterFrom || undefined,
        to: filterTo || undefined,
        category: filterCategory,
      })
      setExpenses(res.data)
      setTotalCount(res.total)
    } catch (error) {
      setLoadError(apiRequestErrorMessage(error))
      toast({ title: "Failed to load expenses", description: apiRequestErrorMessage(error), variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber, branchFilter.branchId, filterFrom, filterTo, filterCategory])

  const updateFilters = (next: { from?: string; to?: string; category?: ExpenseCategory | "all" }) => {
    if (next.from !== undefined) setFilterFrom(next.from)
    if (next.to !== undefined) setFilterTo(next.to)
    if (next.category !== undefined) setFilterCategory(next.category)
    setPageNumber(1)
  }

  const clearFilters = () => updateFilters({ from: "", to: "", category: "all" })

  const bsMonth = currentBsMonthRange(todayYmd())

  const loadMonthStats = async () => {
    setStatsLoading(true)
    try {
      const { from, to } = currentBsMonthRange(todayYmd())
      setMonthExpenses(await expensesApi.getAllExpenses({ from, to, branchId: branchFilter.branchId }))
    } catch {
      // Stat cards are a convenience; leave them at their last known value on failure.
    } finally {
      setStatsLoading(false)
    }
  }

  useEffect(() => {
    void loadMonthStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchFilter.branchId])

  const resetForm = () => {
    setCategory("other")
    setDescription("")
    setAmount("")
    setAmountError(null)
    setExpenseDate(todayYmd())
    setAccounting(emptyExpenseAccountingForm())
    setReceiptReference("")
  }

  const handleCreate = async () => {
    const amountNum = Number.parseFloat(amount)
    if (!amountNum || amountNum <= 0) {
      setAmountError("Enter an amount greater than 0.")
      document.getElementById("expense-amount")?.focus()
      return
    }
    setSaving(true)
    try {
      const input = {
        category,
        description: description.trim() || null,
        amount: amountNum,
        expense_date: expenseDate,
        receipt_reference: receiptReference.trim() || null,
        ...expenseAccountingInput(accounting, amountNum),
      }
      const { error } = await expensesApi.createExpense(input, createKeys.current.keyFor(JSON.stringify(input)))
      if (error) throw new Error(error)
      createKeys.current.reset()
      toast({ title: "Expense recorded" })
      setCreateOpen(false)
      resetForm()
      if (pageNumber !== 1) setPageNumber(1)
      else await load()
      await loadMonthStats()
    } catch (error) {
      toast({ title: "Failed to record expense", description: apiRequestErrorMessage(error), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const openEditDialog = (expense: Expense) => {
    setEditTarget(expense)
    setEditCategory(expense.category)
    setEditDescription(expense.description || "")
    setEditAmount(String(expense.amount))
    setEditAmountError(null)
    setEditAccounting(expenseAccountingFormFrom(expense))
    setEditReceiptReference(expense.receipt_reference ?? "")
  }

  const handleSaveEdit = async () => {
    if (!editTarget) return
    const amountNum = Number.parseFloat(editAmount)
    if (!amountNum || amountNum <= 0) {
      setEditAmountError("Enter an amount greater than 0.")
      document.getElementById("edit-expense-amount")?.focus()
      return
    }
    setEditSaving(true)
    try {
      const { error } = await expensesApi.updateExpense(
        editTarget.id,
        {
          category: editCategory,
          description: editDescription.trim() || null,
          amount: amountNum,
          receipt_reference: editReceiptReference.trim() || null,
          ...expenseAccountingInput(editAccounting, amountNum),
        },
        editTarget.expense_date,
      )
      if (error) throw new Error(error)
      toast({ title: "Expense updated" })
      setEditTarget(null)
      await load()
      await loadMonthStats()
    } catch (error) {
      toast({ title: "Failed to update expense", description: apiRequestErrorMessage(error), variant: "destructive" })
    } finally {
      setEditSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const { error } = await expensesApi.deleteExpense(deleteTarget.id)
      if (error) throw new Error(error)
      toast({ title: "Expense deleted" })
      setDeleteTarget(null)
      await load()
      await loadMonthStats()
    } catch (error) {
      toast({ title: "Failed to delete expense", description: apiRequestErrorMessage(error), variant: "destructive" })
    }
  }

  const monthSummary = summarizeExpenses(monthExpenses)
  const totalListed = expenses.reduce((sum, e) => sum + Number(e.amount), 0)
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const startIndex = (pageNumber - 1) * PAGE_SIZE

  // Largest category this month — shows owners where the money goes at a glance.
  const topCategory = monthSummary.topCategory

  const openCreate = () => setCreateOpen(true)
  const plural = (n: number) => (n === 1 ? "expense" : "expenses")

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Expenses"
          description="Record rent, salaries, utilities and other operating costs. They feed net profit in the P&L."
          icon={Receipt}
          actions={
            <div className="flex flex-wrap items-end gap-2">
              <BranchFilterSelect filter={branchFilter} id="expenses-branch" hideLabel onChange={() => setPageNumber(1)} />
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" aria-hidden />
                Record expense
              </Button>
            </div>
          }
        />

        <Section spacing="lg">
          <StatGrid cols={3}>
            <StatCard
              label={`This month (${bsMonth.label})`}
              value={formatCurrency(monthSummary.total)}
              hint={`${monthSummary.count} ${plural(monthSummary.count)} recorded`}
              icon={Wallet}
              tone="primary"
              loading={statsLoading}
            />
            <StatCard
              label="Largest category this month"
              value={topCategory ? CATEGORY_LABELS[topCategory.category] : "—"}
              hint={topCategory ? formatCurrency(topCategory.amount) : "No expenses this month yet"}
              icon={Tags}
              tone="info"
              loading={statsLoading}
            />
            <StatCard
              label="Total listed"
              value={formatCurrency(totalListed)}
              hint={`This page's ${expenses.length} ${plural(expenses.length)}, out of ${totalCount} ${filtersActive ? "matching" : "total"}`}
              icon={CalendarDays}
              loading={isLoading}
            />
          </StatGrid>
        </Section>

        <Section spacing="lg">
          <Card>
            <CardHeader>
              <CardTitle>{filtersActive ? "Filtered expenses" : "All expenses"}</CardTitle>
              <CardDescription>Most recent first</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-end">
                <div className="space-y-1.5 sm:w-44">
                  <Label htmlFor="expenses-filter-from" className="text-xs font-medium text-muted-foreground">
                    From
                  </Label>
                  <DatePicker
                    id="expenses-filter-from"
                    value={filterFrom}
                    onChange={(v) => updateFilters({ from: v })}
                    max={filterTo || undefined}
                    clearable
                    placeholder="Any date"
                  />
                </div>
                <div className="space-y-1.5 sm:w-44">
                  <Label htmlFor="expenses-filter-to" className="text-xs font-medium text-muted-foreground">
                    To
                  </Label>
                  <DatePicker
                    id="expenses-filter-to"
                    value={filterTo}
                    onChange={(v) => updateFilters({ to: v })}
                    min={filterFrom || undefined}
                    clearable
                    placeholder="Any date"
                  />
                </div>
                <div className="space-y-1.5 sm:w-44">
                  <Label htmlFor="expenses-filter-category" className="text-xs font-medium text-muted-foreground">
                    Category
                  </Label>
                  <Select value={filterCategory} onValueChange={(v) => updateFilters({ category: v as ExpenseCategory | "all" })}>
                    <SelectTrigger id="expenses-filter-category" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      {EXPENSE_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {CATEGORY_LABELS[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit sm:mb-0.5"
                  onClick={() => updateFilters({ from: bsMonth.from, to: bsMonth.to })}
                >
                  <CalendarDays className="h-4 w-4" aria-hidden />
                  This BS month
                </Button>
                {filtersActive && (
                  <Button variant="ghost" size="sm" className="w-fit sm:mb-0.5" onClick={clearFilters}>
                    <X className="h-4 w-4" aria-hidden />
                    Clear filters
                  </Button>
                )}
              </div>
              {!filterRangeValid && (
                <p role="alert" className="mb-4 text-sm text-destructive">
                  The start date is after the end date.
                </p>
              )}
              {isLoading ? (
                <SkeletonTable rows={5} cols={6} />
              ) : loadError ? (
                <ErrorState
                  title="We couldn't load expenses"
                  message={`${loadError} Check your connection and try again.`}
                  onRetry={() => void load()}
                  retrying={isLoading}
                  size="compact"
                />
              ) : expenses.length === 0 && filtersActive ? (
                <EmptyState
                  icon={Search}
                  title="No expenses match these filters"
                  description="Try another date range or category, or clear the filters."
                  action={{ label: "Clear filters", onClick: clearFilters, icon: X }}
                  size="compact"
                />
              ) : expenses.length === 0 ? (
                <EmptyState
                  icon={Receipt}
                  title="Record your first expense"
                  description="Log rent, salaries, utilities and other running costs so your P&L shows true net profit."
                  action={{ label: "Record expense", onClick: openCreate, icon: Plus }}
                  size="compact"
                />
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        {branchFilter.showBranchColumn && <TableHead>Branch</TableHead>}
                        <TableHead>Category</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="w-20">
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expenses.map((expense) => {
                        const label = `${CATEGORY_LABELS[expense.category]} expense of ${expense.expense_date}`
                        return (
                          <TableRow key={expense.id}>
                            <TableCell className="num whitespace-nowrap">{expense.expense_date}</TableCell>
                            {branchFilter.showBranchColumn && (
                              <TableCell className="whitespace-nowrap text-sm">{branchFilter.branchName(expense.branch_id)}</TableCell>
                            )}
                            <TableCell>
                              <Badge variant="muted">{CATEGORY_LABELS[expense.category] ?? expense.category}</Badge>
                            </TableCell>
                            <TableCell className="max-w-[200px] text-sm">
                              <span className="block truncate" title={expenseAccountLabel(expense)}>
                                {expenseAccountLabel(expense)}
                              </span>
                            </TableCell>
                            <TableCell className="max-w-[280px] text-sm text-muted-foreground">
                              <span className="block truncate" title={expense.description || undefined}>
                                {expense.description || "—"}
                              </span>
                              {expense.receipt_reference && (
                                <span className="block truncate text-xs" title={expense.receipt_reference}>
                                  Receipt <span className="font-mono">{expense.receipt_reference}</span>
                                </span>
                              )}
                              {expense.vat_amount > 0 && expense.supplier_vat_number && (
                                <span className="block truncate text-xs" title={expense.supplier_vat_number}>
                                  VAT no. <span className="font-mono">{expense.supplier_vat_number}</span>
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">
                              {expense.supplier_id ? (
                                <span className="flex flex-col">
                                  <Badge variant="outline" className="w-fit">
                                    Pay later
                                  </Badge>
                                  {expense.vendor_name && (
                                    <span className="truncate text-xs text-muted-foreground" title={expense.vendor_name}>
                                      {expense.vendor_name}
                                    </span>
                                  )}
                                </span>
                              ) : expense.payment_method ? (
                                PAYMENT_LABELS[expense.payment_method]
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell className="num text-right font-medium">
                              <CurrencyDisplay amount={Number(expense.amount)} />
                              {expense.vat_amount > 0 && (
                                <span className="block text-xs font-normal text-muted-foreground">
                                  incl. VAT <CurrencyDisplay amount={expense.vat_amount} />
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => openEditDialog(expense)}
                                  aria-label={`Edit ${label}`}
                                >
                                  <Pencil className="h-4 w-4" aria-hidden />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => setDeleteTarget(expense)}
                                  aria-label={`Delete ${label}`}
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={branchFilter.showBranchColumn ? 6 : 5} className="font-medium">
                          Page total ({expenses.length} {plural(expenses.length)})
                        </TableCell>
                        <TableCell className="num text-right font-semibold">
                          <CurrencyDisplay amount={totalListed} />
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              )}
              {!isLoading && !loadError && expenses.length > 0 ? (
                <Pagination
                  currentPage={pageNumber}
                  totalPages={totalPages}
                  totalItems={totalCount}
                  itemsPerPage={PAGE_SIZE}
                  startIndex={startIndex}
                  onPageChange={setPageNumber}
                  className="mt-4"
                />
              ) : null}
            </CardContent>
          </Card>
        </Section>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="h-4 w-4" aria-hidden />
                Record expense
              </DialogTitle>
              <DialogDescription>Posts to your books as an operating cost on the date you choose.</DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                void handleCreate()
              }}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="expense-category">
                    Category
                    <RequiredMark />
                  </Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
                    <SelectTrigger id="expense-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {CATEGORY_LABELS[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="expense-date">
                    Date
                    <RequiredMark />
                  </Label>
                  <DatePicker
                    id="expense-date"
                    value={expenseDate}
                    onChange={setExpenseDate}
                    aria-describedby="expense-date-help"
                    aria-required
                  />
                  <p id="expense-date-help" className="text-xs text-muted-foreground">
                    Can&apos;t be changed after saving.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="expense-amount">
                    Amount
                    <RequiredMark />
                  </Label>
                  <Input
                    id="expense-amount"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value)
                      if (amountError) setAmountError(null)
                    }}
                    placeholder="0.00"
                    className="num text-right"
                    aria-required
                    aria-invalid={!!amountError}
                    aria-describedby={amountError ? "expense-amount-error" : undefined}
                  />
                  {amountError && (
                    <p id="expense-amount-error" role="alert" className="text-xs text-destructive">
                      {amountError}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="expense-receipt">
                    Bill / receipt no.
                    {accounting.vatMode !== "none" ? <RequiredMark /> : " (optional)"}
                  </Label>
                  <Input
                    id="expense-receipt"
                    value={receiptReference}
                    onChange={(e) => setReceiptReference(e.target.value)}
                    maxLength={RECEIPT_REFERENCE_MAX}
                    placeholder="e.g. NEA-2083-0412"
                    aria-describedby="expense-receipt-help"
                  />
                  <p id="expense-receipt-help" className="text-xs text-muted-foreground">
                    Kept on the expense and its voucher narration so it can be traced later.
                  </p>
                </div>
              </div>
              <ExpenseAccountingFields
                idPrefix="expense"
                form={accounting}
                onChange={(patch) => setAccounting((prev) => ({ ...prev, ...patch }))}
                amount={Number.parseFloat(amount)}
              />
              <div className="space-y-1.5">
                <Label htmlFor="expense-description">Description (optional)</Label>
                <Textarea
                  id="expense-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="e.g. Shop rent for Kartik"
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={saving} loadingText="Saving…">
                  Save expense
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-4 w-4" aria-hidden />
                Edit expense
              </DialogTitle>
              <DialogDescription>
                {editTarget ? `Recorded on ${editTarget.expense_date}. ` : null}
                The date can&apos;t be changed — delete and re-record the expense if the date is wrong.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                void handleSaveEdit()
              }}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-expense-category">
                    Category
                    <RequiredMark />
                  </Label>
                  <Select value={editCategory} onValueChange={(v) => setEditCategory(v as ExpenseCategory)}>
                    <SelectTrigger id="edit-expense-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {CATEGORY_LABELS[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-expense-amount">
                    Amount
                    <RequiredMark />
                  </Label>
                  <Input
                    id="edit-expense-amount"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={editAmount}
                    onChange={(e) => {
                      setEditAmount(e.target.value)
                      if (editAmountError) setEditAmountError(null)
                    }}
                    placeholder="0.00"
                    className="num text-right"
                    // A pay-later bill's amount is on the supplier's ledger; the API refuses to change it.
                    disabled={editAccounting.settlement === "later"}
                    aria-required
                    aria-invalid={!!editAmountError}
                    aria-describedby={editAmountError ? "edit-expense-amount-error" : undefined}
                  />
                  {editAmountError && (
                    <p id="edit-expense-amount-error" role="alert" className="text-xs text-destructive">
                      {editAmountError}
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-expense-receipt">
                  Bill / receipt no.
                  {editAccounting.vatMode !== "none" ? <RequiredMark /> : " (optional)"}
                </Label>
                <Input
                  id="edit-expense-receipt"
                  value={editReceiptReference}
                  onChange={(e) => setEditReceiptReference(e.target.value)}
                  maxLength={RECEIPT_REFERENCE_MAX}
                />
              </div>
              <ExpenseAccountingFields
                idPrefix="edit-expense"
                form={editAccounting}
                onChange={(patch) => setEditAccounting((prev) => ({ ...prev, ...patch }))}
                amount={Number.parseFloat(editAmount)}
                settlementLocked
              />
              <div className="space-y-1.5">
                <Label htmlFor="edit-expense-description">Description (optional)</Label>
                <Textarea
                  id="edit-expense-description"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={2}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
                  Cancel
                </Button>
                <Button type="submit" loading={editSaving} loadingText="Saving…">
                  Save changes
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          title="Delete expense?"
          description={`This removes the expense record and reverses its accounting entry.${
            deleteTarget?.supplier_id
              ? " The bill is also taken off the supplier's account — not possible once it has been paid."
              : ""
          }${
            deleteTarget
              ? ` ${CATEGORY_LABELS[deleteTarget.category]} · ${deleteTarget.expense_date} · ${formatCurrency(deleteTarget.amount)}`
              : ""
          }`}
          confirmText="Delete expense"
        />
      </PageContainer>
    </DashboardLayout>
  )
}
