import type { AccountingAccount } from "@/features/accounting/api-client"
import type { CreateExpenseInput, Expense, ExpensePaymentMethod } from "@/features/expenses/api-client"
import { EMPTY_TDS, tdsExpenseRequest, tdsFieldsFrom, validateTdsFields, type TdsFieldsValue } from "@/features/accounting/lib/tds"

/** Default expense account when none is chosen (and for expenses recorded before accounts could be chosen). */
export const GENERAL_EXPENSES_CODE = "5100"

/** Expense-type accounts the API refuses for an expense: Cost of Goods Sold and Rounding Off belong to other flows. */
export const RESERVED_EXPENSE_ACCOUNT_CODES: readonly string[] = ["5000", "5990"]

export type ExpenseVatMode = "none" | "amount" | "includes"
export type ExpenseSettlement = "paid" | "later"

/** The account / VAT / settlement part of the expense form. */
export interface ExpenseAccountingForm {
  /** "" = General Expenses (5100) on a new expense, or the current account on an edit. */
  accountId: string
  vatMode: ExpenseVatMode
  /** Entered VAT, as typed (vatMode "amount"). */
  vatAmount: string
  supplierVatNumber: string
  settlement: ExpenseSettlement
  paymentMethod: ExpensePaymentMethod
  /** Pay later: the supplier the bill is owed to. */
  supplierId: string
  supplierName: string | null
  /** Pay later: the chosen supplier's default credit days (undefined = not known, e.g. when editing). */
  supplierCreditDays?: number | null
  /** Pay later: a due date picked for this bill (yyyy-MM-dd); "" = the supplier's credit days decide. */
  dueDate: string
  /** TDS withheld from the vendor (category "" = none). */
  tds: TdsFieldsValue
  /** Paid now with TDS: whom it was withheld from (pay later uses the supplier). Their PAN is supplierVatNumber. */
  vendorName: string
}

export function emptyExpenseAccountingForm(): ExpenseAccountingForm {
  return {
    accountId: "",
    vatMode: "none",
    vatAmount: "",
    supplierVatNumber: "",
    settlement: "paid",
    paymentMethod: "cash",
    supplierId: "",
    supplierName: null,
    supplierCreditDays: undefined,
    dueDate: "",
    tds: { ...EMPTY_TDS },
    vendorName: "",
  }
}

/** Prefills the form from a saved expense (its VAT shows as an entered amount, so an edit keeps it exactly). */
export function expenseAccountingFormFrom(expense: Expense): ExpenseAccountingForm {
  const vat = Number(expense.vat_amount ?? 0)
  return {
    accountId: expense.expense_account_id ?? "",
    vatMode: vat > 0 ? "amount" : "none",
    vatAmount: vat > 0 ? vat.toFixed(2) : "",
    supplierVatNumber: expense.supplier_vat_number ?? "",
    settlement: expense.supplier_id ? "later" : "paid",
    paymentMethod: expense.payment_method ?? "cash",
    supplierId: expense.supplier_id ?? "",
    supplierName: expense.supplier_id ? expense.vendor_name : null,
    // The due date lives on the supplier's bill and isn't edited with the expense.
    dueDate: "",
    tds: tdsFieldsFrom({
      tds_category_code: expense.tds_category_code ?? null,
      tds_rate_percent: expense.tds_rate_percent ?? null,
      tds_amount: Number(expense.tds_amount ?? 0),
    }),
    vendorName: expense.supplier_id ? "" : (expense.vendor_name ?? ""),
  }
}

type AccountingInput = Pick<
  CreateExpenseInput,
  | "expense_account_id"
  | "vat_amount"
  | "amount_includes_vat"
  | "supplier_vat_number"
  | "vendor_name"
  | "supplier_id"
  | "payment_method"
  | "tds_category"
  | "tds_rate_percent"
  | "tds_amount"
  | "due_date"
>

/**
 * Maps the form to the API input. Throws a user-facing message when it is incomplete: pay later without a
 * supplier, an entered VAT amount that isn't a number from 0 up to (not including) the amount, or TDS fields that
 * don't add up (TDS is withheld on the amount excluding VAT — `vatRatePercent` splits it for "amount includes VAT").
 */
export function expenseAccountingInput(form: ExpenseAccountingForm, amount: number, vatRatePercent?: number | null): AccountingInput {
  const later = form.settlement === "later"
  if (later && !form.supplierId) throw new Error("Choose the supplier the bill is owed to")

  let vatAmount: number | null = null
  if (form.vatMode === "amount") {
    const parsed = Number.parseFloat(form.vatAmount)
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= amount) {
      throw new Error("Enter a VAT amount greater than 0 and less than the bill amount")
    }
    vatAmount = Math.round(parsed * 100) / 100
  }

  const isVatBill = form.vatMode !== "none"
  const tds = form.tds ?? EMPTY_TDS
  // TDS is reported against the vendor's name and PAN; pay later takes both from the supplier.
  const paidWithTds = !later && tds.category !== ""
  if (paidWithTds) {
    if (!form.vendorName?.trim()) throw new Error("Enter the vendor's name: TDS withheld is reported against them")
    if (!/^\d{9}$/.test(form.supplierVatNumber.trim())) throw new Error("Enter the vendor's 9-digit PAN for the TDS return")
  }
  const tdsError = validateTdsFields(tds, expenseVatSplit(amount, form, vatRatePercent)?.net ?? amount)
  if (tdsError) throw new Error(tdsError)
  const tdsRequest = tdsExpenseRequest(tds)
  return {
    expense_account_id: form.accountId || null,
    vat_amount: vatAmount,
    amount_includes_vat: form.vatMode === "includes",
    supplier_vat_number: isVatBill || paidWithTds ? form.supplierVatNumber.trim() || null : null,
    vendor_name: later ? form.supplierName : paidWithTds ? form.vendorName.trim() : null,
    supplier_id: later ? form.supplierId : null,
    payment_method: later ? null : form.paymentMethod,
    tds_category: tdsRequest.tdsCategory,
    tds_rate_percent: tdsRequest.tdsRatePercent,
    tds_amount: tdsRequest.tdsAmount,
    // Pay later only; blank = the supplier's credit days decide on the server.
    due_date: later && form.dueDate.trim() ? form.dueDate.trim() : null,
  }
}

/** Net / VAT split shown under the amount. "includes" uses the tenant VAT rate (the server does the same). */
export function expenseVatSplit(
  amount: number,
  form: Pick<ExpenseAccountingForm, "vatMode" | "vatAmount">,
  vatRatePercent: number | null | undefined,
): { net: number; vat: number } | null {
  if (!Number.isFinite(amount) || amount <= 0) return null
  let vat = 0
  if (form.vatMode === "amount") {
    const parsed = Number.parseFloat(form.vatAmount)
    vat = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : 0
  } else if (form.vatMode === "includes") {
    if (!vatRatePercent || vatRatePercent <= 0) return null
    vat = Math.round(((amount * vatRatePercent) / (100 + vatRatePercent)) * 100) / 100
  }
  return { net: Math.round((amount - vat) * 100) / 100, vat }
}

/** Accounts the expense account picker offers: Expense-type accounts (groups give the tree paths; the picker only
 * lists ledger accounts), minus the reserved ones. */
export function expenseHeadAccounts(accounts: readonly AccountingAccount[]): AccountingAccount[] {
  return accounts.filter((a) => a.account_type === "expense" && !RESERVED_EXPENSE_ACCOUNT_CODES.includes(a.code))
}

/** "5200 Rent" style label for the list; older rows without an account read as General Expenses. */
export function expenseAccountLabel(expense: Pick<Expense, "expense_account_code" | "expense_account_name">): string {
  if (!expense.expense_account_code) return `${GENERAL_EXPENSES_CODE} General Expenses`
  return [expense.expense_account_code, expense.expense_account_name].filter(Boolean).join(" ")
}
