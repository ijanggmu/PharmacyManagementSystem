import { describe, expect, it } from "vitest"
import type { AccountingAccount } from "@/features/accounting/api-client"
import type { Expense } from "@/features/expenses/api-client"
import {
  emptyExpenseAccountingForm,
  expenseAccountingFormFrom,
  expenseAccountingInput,
  expenseAccountLabel,
  expenseHeadAccounts,
  expenseVatSplit,
} from "@/features/expenses/lib/expense-form"

const expense: Expense = {
  id: "e1",
  tenant_id: "",
  branch_id: null,
  category: "utilities",
  description: null,
  amount: 1130,
  expense_date: "2026-06-10",
  payment_method: null,
  receipt_reference: "NT-1",
  created_by: null,
  created_at: "2026-06-10T00:00:00Z",
  expense_account_id: "acc-1",
  expense_account_code: "5200",
  expense_account_name: "Telephone & Internet",
  vat_amount: 130,
  supplier_vat_number: "301234567",
  vendor_name: "Nepal Telecom",
  supplier_id: "sup-1",
}

function account(code: string, type: string): AccountingAccount {
  return {
    id: code,
    code,
    name: `Account ${code}`,
    account_type: type,
    is_system: false,
    is_active: true,
    parent_id: null,
    has_children: false,
    has_postings: false,
    is_root_head: false,
  }
}

describe("expenseAccountingInput", () => {
  it("maps a paid-now expense with no VAT to the default account and the payment method", () => {
    expect(expenseAccountingInput(emptyExpenseAccountingForm(), 100)).toEqual({
      expense_account_id: null,
      vat_amount: null,
      amount_includes_vat: false,
      supplier_vat_number: null,
      vendor_name: null,
      supplier_id: null,
      payment_method: "cash",
    })
  })

  it("sends an entered VAT amount rounded to the paisa, with the seller's VAT number", () => {
    const form = { ...emptyExpenseAccountingForm(), accountId: "acc-1", vatMode: "amount" as const, vatAmount: "130.004", supplierVatNumber: " 6012 " }
    expect(expenseAccountingInput(form, 1130)).toMatchObject({
      expense_account_id: "acc-1",
      vat_amount: 130,
      amount_includes_vat: false,
      supplier_vat_number: "6012",
    })
  })

  it("asks the server to split the VAT when the amount includes it", () => {
    const form = { ...emptyExpenseAccountingForm(), vatMode: "includes" as const, vatAmount: "99" }
    expect(expenseAccountingInput(form, 1130)).toMatchObject({ vat_amount: null, amount_includes_vat: true })
  })

  it("drops a typed VAT number when it is not a VAT bill", () => {
    const form = { ...emptyExpenseAccountingForm(), supplierVatNumber: "6012" }
    expect(expenseAccountingInput(form, 100).supplier_vat_number).toBeNull()
  })

  it("sends a pay-later expense with its supplier and no payment method", () => {
    const form = { ...emptyExpenseAccountingForm(), settlement: "later" as const, supplierId: "sup-1", supplierName: "Nepal Telecom" }
    expect(expenseAccountingInput(form, 100)).toMatchObject({
      supplier_id: "sup-1",
      vendor_name: "Nepal Telecom",
      payment_method: null,
    })
  })

  it("rejects pay later without a supplier and a VAT amount that isn't below the amount", () => {
    expect(() => expenseAccountingInput({ ...emptyExpenseAccountingForm(), settlement: "later" }, 100)).toThrow(/supplier/)
    const vat = (vatAmount: string) => ({ ...emptyExpenseAccountingForm(), vatMode: "amount" as const, vatAmount })
    expect(() => expenseAccountingInput(vat("100"), 100)).toThrow(/VAT amount/)
    expect(() => expenseAccountingInput(vat("abc"), 100)).toThrow(/VAT amount/)
    expect(() => expenseAccountingInput(vat("0"), 100)).toThrow(/VAT amount/)
  })
})

describe("expenseAccountingFormFrom", () => {
  it("prefills a pay-later VAT expense", () => {
    expect(expenseAccountingFormFrom(expense)).toEqual({
      accountId: "acc-1",
      vatMode: "amount",
      vatAmount: "130.00",
      supplierVatNumber: "301234567",
      settlement: "later",
      paymentMethod: "cash",
      supplierId: "sup-1",
      supplierName: "Nepal Telecom",
    })
  })

  it("prefills an older paid expense without account or VAT", () => {
    const form = expenseAccountingFormFrom({
      ...expense,
      payment_method: "bank",
      expense_account_id: null,
      vat_amount: 0,
      supplier_vat_number: null,
      supplier_id: null,
    })
    expect(form).toMatchObject({ accountId: "", vatMode: "none", vatAmount: "", settlement: "paid", paymentMethod: "bank", supplierName: null })
  })
})

describe("expenseVatSplit", () => {
  it("splits an entered VAT amount or the tenant rate out of the gross", () => {
    expect(expenseVatSplit(1130, { vatMode: "amount", vatAmount: "130" }, 13)).toEqual({ net: 1000, vat: 130 })
    expect(expenseVatSplit(1000, { vatMode: "includes", vatAmount: "" }, 13)).toEqual({ net: 884.96, vat: 115.04 })
    expect(expenseVatSplit(500, { vatMode: "none", vatAmount: "" }, 13)).toEqual({ net: 500, vat: 0 })
  })

  it("has nothing to show without an amount, or for 'includes VAT' without a rate", () => {
    expect(expenseVatSplit(Number.NaN, { vatMode: "amount", vatAmount: "1" }, 13)).toBeNull()
    expect(expenseVatSplit(100, { vatMode: "includes", vatAmount: "" }, 0)).toBeNull()
  })
})

describe("expenseHeadAccounts / expenseAccountLabel", () => {
  it("offers Expense accounts except Cost of Goods Sold and Rounding Off", () => {
    const heads = expenseHeadAccounts([account("5100", "expense"), account("5000", "expense"), account("5990", "expense"), account("1000", "asset")])
    expect(heads.map((a) => a.code)).toEqual(["5100"])
  })

  it("labels the account, falling back to General Expenses for older rows", () => {
    expect(expenseAccountLabel(expense)).toBe("5200 Telephone & Internet")
    expect(expenseAccountLabel({ expense_account_code: null, expense_account_name: null })).toBe("5100 General Expenses")
  })
})
