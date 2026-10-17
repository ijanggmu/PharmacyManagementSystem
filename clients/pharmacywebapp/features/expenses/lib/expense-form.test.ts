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
  tds_category_code: null,
  tds_category_name: null,
  tds_rate_percent: null,
  tds_amount: 0,
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
      tds_category: null,
      tds_rate_percent: null,
      tds_amount: null,
      due_date: null,
    })
  })

  it("sends TDS on the amount excluding VAT and refuses TDS above it", () => {
    const tds = { category: "service_vat", rate: "1.5", amount: "", taxable: "" }
    const vendor = { vendorName: "Kathmandu Services", supplierVatNumber: "601234567" }
    const form = { ...emptyExpenseAccountingForm(), ...vendor, vatMode: "amount" as const, vatAmount: "130", tds }
    expect(expenseAccountingInput(form, 1130)).toMatchObject({ tds_category: "service_vat", tds_rate_percent: 1.5, tds_amount: null })
    expect(() => expenseAccountingInput({ ...form, tds: { ...tds, amount: "1000.01" } }, 1130)).toThrow(/TDS/)
    // "Amount includes VAT": the base is split out at the tenant rate (1130 at 13% → 1000).
    const includes = { ...emptyExpenseAccountingForm(), ...vendor, vatMode: "includes" as const, tds: { ...tds, amount: "1000" } }
    expect(expenseAccountingInput(includes, 1130, 13).tds_amount).toBe(1000)
    expect(() => expenseAccountingInput({ ...includes, tds: { ...tds, amount: "1000.5" } }, 1130, 13)).toThrow(/TDS/)
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

  it("sends the vendor's name and PAN with TDS on a paid-now expense, VAT bill or not", () => {
    const tds = { category: "rent", rate: "10", amount: "", taxable: "" }
    const form = { ...emptyExpenseAccountingForm(), tds, vendorName: " Hari Prasad ", supplierVatNumber: "301234567" }
    expect(expenseAccountingInput(form, 25000)).toMatchObject({
      vendor_name: "Hari Prasad",
      supplier_vat_number: "301234567",
      tds_category: "rent",
    })
    expect(() => expenseAccountingInput({ ...form, vendorName: "" }, 25000)).toThrow(/vendor's name/)
    expect(() => expenseAccountingInput({ ...form, supplierVatNumber: "30123" }, 25000)).toThrow(/9-digit PAN/)
    // Without TDS the vendor isn't sent.
    expect(expenseAccountingInput({ ...form, tds: { ...tds, category: "" } }, 25000)).toMatchObject({ vendor_name: null, supplier_vat_number: null })
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
      dueDate: "",
      tds: { category: "", rate: "", amount: "", taxable: "" },
      vendorName: "",
    })
  })

  it("prefills the TDS of a saved expense", () => {
    const form = expenseAccountingFormFrom({ ...expense, tds_category_code: "rent", tds_rate_percent: 10, tds_amount: 100 })
    expect(form.tds).toEqual({ category: "rent", rate: "10", amount: "100.00", taxable: "" })
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
