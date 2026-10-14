import { describe, expect, it } from "vitest"
import {
  clampLedgerLimit,
  customerLedgerQuery,
  toCustomerLedgerRow,
  type DotnetCustomerLedgerEntryDto,
} from "@/lib/api/customers-api"

const base: DotnetCustomerLedgerEntryDto = {
  id: "e1",
  customerId: "c1",
  entryDateUtc: "2026-03-02T10:00:00Z",
  entryType: "Sale",
  description: "Invoice INV-9",
  debitAmount: 450,
  creditAmount: 0,
  runningBalance: 450,
  referenceType: "Sale",
  referenceId: "sale-9",
  createdAtUtc: "2026-03-02T10:00:01Z",
  branchId: null,
}

describe("toCustomerLedgerRow", () => {
  it("maps a sale to an invoice row with the sale id and a signed amount", () => {
    const row = toCustomerLedgerRow(base)
    expect(row).toEqual({
      id: "e1",
      entry_date: "2026-03-02T10:00:00Z",
      entry_type: "invoice",
      description: "Invoice INV-9",
      amount: 450,
      balance_after: 450,
      reference_number: null,
      sale_id: "sale-9",
      payment_id: null,
      refund_id: null,
      created_at: "2026-03-02T10:00:01Z",
      debit: 450,
      credit: 0,
      branch_id: null,
      reference_type: "Sale",
      is_voided: false,
    })
  })

  it("carries the voided flag and the void entry's reference type", () => {
    const payment = toCustomerLedgerRow({ ...base, entryType: "Payment", debitAmount: 0, creditAmount: 50, isVoided: true })
    expect(payment.is_voided).toBe(true)
    const reversal = toCustomerLedgerRow({
      ...base,
      entryType: "Adjustment",
      referenceType: "CustomerPaymentVoid",
      referenceId: "pay-1",
    })
    expect(reversal.entry_type).toBe("adjustment")
    expect(reversal.reference_type).toBe("CustomerPaymentVoid")
    expect(reversal.is_voided).toBe(false)
  })

  it("uses the document number (INV-/RCP-) as the reference", () => {
    expect(toCustomerLedgerRow({ ...base, documentNumber: "INV-MAIN-2083/84-00012" }).reference_number).toBe("INV-MAIN-2083/84-00012")
    expect(
      toCustomerLedgerRow({ ...base, entryType: "Payment", debitAmount: 0, creditAmount: 50, documentNumber: "RCP-MAIN-2083/84-00001" })
        .reference_number,
    ).toBe("RCP-MAIN-2083/84-00001")
  })

  it("maps a payment (credit) to a negative amount and the payment id", () => {
    const row = toCustomerLedgerRow({
      ...base,
      entryType: "Payment",
      debitAmount: 0,
      creditAmount: 200,
      runningBalance: 250,
      referenceId: "pay-1",
    })
    expect(row.entry_type).toBe("payment")
    expect(row.amount).toBe(-200)
    expect(row.payment_id).toBe("pay-1")
    expect(row.sale_id).toBeNull()
  })

  it("maps refunds to credit_note and opening balances and adjustments to adjustment", () => {
    expect(toCustomerLedgerRow({ ...base, entryType: "Refund", referenceId: "ref-1" }).entry_type).toBe("credit_note")
    expect(toCustomerLedgerRow({ ...base, entryType: "Refund", referenceId: "ref-1" }).refund_id).toBe("ref-1")
    // A cancelled sale credits the account like a credit note; its reference is the sale.
    const cancelled = toCustomerLedgerRow({ ...base, entryType: "SaleCancellation", referenceId: "sale-1" })
    expect(cancelled.entry_type).toBe("credit_note")
    expect(cancelled.sale_id).toBe("sale-1")
    expect(cancelled.refund_id).toBeNull()
    expect(toCustomerLedgerRow({ ...base, entryType: "OpeningBalance" }).entry_type).toBe("adjustment")
    expect(toCustomerLedgerRow({ ...base, entryType: "Adjustment" }).entry_type).toBe("adjustment")
  })

  it("rejects an unknown entry type rather than guessing", () => {
    expect(() => toCustomerLedgerRow({ ...base, entryType: "Mystery" })).toThrow(/Unknown customer ledger entry type/)
  })
})

describe("clampLedgerLimit", () => {
  it("defaults to 200 and clamps to 1..500 like the legacy route", () => {
    expect(clampLedgerLimit()).toBe(200)
    expect(clampLedgerLimit(Number.NaN)).toBe(200)
    expect(clampLedgerLimit(0)).toBe(1)
    expect(clampLedgerLimit(9999)).toBe(500)
    expect(clampLedgerLimit(50)).toBe(50)
  })
})

describe("customerLedgerQuery", () => {
  it("requests the first page of the newest entries with the clamped size", () => {
    expect(customerLedgerQuery("c 1", 600)).toBe("/api/v1/customers/c%201/ledger?pageNumber=1&pageSize=500")
  })
})
