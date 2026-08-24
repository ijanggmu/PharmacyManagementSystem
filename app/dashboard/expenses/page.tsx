"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Receipt, Trash2 } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/hooks/use-toast"
import { CurrencyDisplay } from "@/components/currency-display"
import { expensesApi, EXPENSE_CATEGORIES, type Expense, type ExpenseCategory } from "@/features/expenses/api-client"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"

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

const todayYmd = () => new Date().toISOString().slice(0, 10)

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const [category, setCategory] = useState<ExpenseCategory>("other")
  const [description, setDescription] = useState("")
  const [amount, setAmount] = useState("")
  const [expenseDate, setExpenseDate] = useState(todayYmd())
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank" | "card" | "other">("cash")

  const load = async () => {
    setIsLoading(true)
    try {
      const res = await expensesApi.getExpenses({ limit: 200 })
      setExpenses(res.data)
    } catch (error) {
      toast({ title: "Failed to load expenses", description: apiRequestErrorMessage(error), variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const resetForm = () => {
    setCategory("other")
    setDescription("")
    setAmount("")
    setExpenseDate(todayYmd())
    setPaymentMethod("cash")
  }

  const handleCreate = async () => {
    const amountNum = Number.parseFloat(amount)
    if (!amountNum || amountNum <= 0) {
      toast({ title: "Invalid amount", description: "Enter an amount greater than 0.", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const { error } = await expensesApi.createExpense({
        category,
        description: description.trim() || null,
        amount: amountNum,
        expense_date: expenseDate,
        payment_method: paymentMethod,
      })
      if (error) throw new Error(error)
      toast({ title: "Expense recorded" })
      setCreateOpen(false)
      resetForm()
      await load()
    } catch (error) {
      toast({ title: "Failed to record expense", description: apiRequestErrorMessage(error), variant: "destructive" })
    } finally {
      setSaving(false)
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
    } catch (error) {
      toast({ title: "Failed to delete expense", description: apiRequestErrorMessage(error), variant: "destructive" })
    }
  }

  const totalThisMonth = expenses
    .filter((e) => e.expense_date.slice(0, 7) === todayYmd().slice(0, 7))
    .reduce((sum, e) => sum + Number(e.amount), 0)

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Expenses"
          description="Rent, salaries, utilities and other operating costs — feeds net profit in P&L"
          actions={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Record Expense
            </Button>
          }
        />

        <Section spacing="lg">
          <Card className="max-w-xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">This Month</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                <CurrencyDisplay amount={totalThisMonth} />
              </div>
            </CardContent>
          </Card>
        </Section>

        <Section spacing="lg">
          <Card>
            <CardHeader>
              <CardTitle>All Expenses</CardTitle>
              <CardDescription>Most recent first</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading expenses...</p>
              ) : expenses.length === 0 ? (
                <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
                  No expenses recorded yet.
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expenses.map((expense) => (
                        <TableRow key={expense.id}>
                          <TableCell>{expense.expense_date}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{CATEGORY_LABELS[expense.category]}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{expense.description || "—"}</TableCell>
                          <TableCell className="text-sm capitalize">{expense.payment_method || "—"}</TableCell>
                          <TableCell className="text-right font-medium">
                            <CurrencyDisplay amount={Number(expense.amount)} />
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteTarget(expense)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
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

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                Record Expense
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
                    <SelectTrigger>
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
                  <Label>Date</Label>
                  <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Payment method</Label>
                  <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="bank">Bank</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Description (optional)</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          title="Delete expense?"
          description={`This removes the expense record and reverses its accounting entry. ${deleteTarget ? `Amount: ${deleteTarget.amount}` : ""}`}
          confirmText="Delete"
        />
      </PageContainer>
    </DashboardLayout>
  )
}
