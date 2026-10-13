import { describe, expect, it } from "vitest"
import { DOTNET_ROOT_PERMISSIONS } from "@/lib/api/dotnet-permissions"
import {
  CUSTOMER_PAYMENT_VOID_PERMISSION,
  SUPPLIER_PAYMENT_VOID_PERMISSION,
  canVoidPayments,
  isPaymentVoidEntry,
  isVoidablePayment,
  paymentVoidPath,
  voidReasonError,
} from "./payment-void"

describe("canVoidPayments", () => {
  it("needs the dedicated permission per kind, not just recording payments", () => {
    const cashier = ["Permissions.Customers.Ledger.View", "Permissions.Customers.Ledger.RecordPayment"]
    expect(canVoidPayments("receipt", cashier)).toBe(false)
    expect(canVoidPayments("receipt", [CUSTOMER_PAYMENT_VOID_PERMISSION])).toBe(true)
    expect(canVoidPayments("payment", [CUSTOMER_PAYMENT_VOID_PERMISSION])).toBe(false)
    expect(canVoidPayments("payment", [SUPPLIER_PAYMENT_VOID_PERMISSION])).toBe(true)
  })

  it("always allows root users", () => {
    expect(canVoidPayments("receipt", DOTNET_ROOT_PERMISSIONS)).toBe(true)
    expect(canVoidPayments("payment", DOTNET_ROOT_PERMISSIONS)).toBe(true)
  })
})

describe("isVoidablePayment", () => {
  it("allows a payment that is not voided yet", () => {
    expect(isVoidablePayment({ entry_type: "payment", credit: 50 })).toBe(true)
    expect(isVoidablePayment({ entry_type: "payment", credit: 50, is_voided: false })).toBe(true)
  })

  it("refuses voided payments, other entry types and the void entries themselves", () => {
    expect(isVoidablePayment({ entry_type: "payment", credit: 50, is_voided: true })).toBe(false)
    expect(isVoidablePayment({ entry_type: "invoice", credit: 0 })).toBe(false)
    expect(isVoidablePayment({ entry_type: "purchase", credit: 0 })).toBe(false)
    expect(isVoidablePayment({ entry_type: "adjustment", credit: 0 })).toBe(false)
    expect(isVoidablePayment({ entry_type: "payment", credit: 0 })).toBe(false)
  })
})

describe("isPaymentVoidEntry", () => {
  it("recognises both void reference types only", () => {
    expect(isPaymentVoidEntry("CustomerPaymentVoid")).toBe(true)
    expect(isPaymentVoidEntry("SupplierPaymentVoid")).toBe(true)
    expect(isPaymentVoidEntry("DirectGoodsReceiptVoid")).toBe(false)
    expect(isPaymentVoidEntry(null)).toBe(false)
  })
})

describe("voidReasonError", () => {
  it("requires at least three characters after trimming", () => {
    expect(voidReasonError("")).toBeDefined()
    expect(voidReasonError("  ab  ")).toBeDefined()
    expect(voidReasonError("Keyed twice")).toBeUndefined()
  })

  it("caps the length", () => {
    expect(voidReasonError("x".repeat(501))).toBeDefined()
    expect(voidReasonError("x".repeat(500))).toBeUndefined()
  })
})

describe("paymentVoidPath", () => {
  it("targets the customer or supplier payment void endpoint", () => {
    expect(paymentVoidPath("receipt", "c1", "p1")).toBe("/customers/c1/payments/p1/void")
    expect(paymentVoidPath("payment", "s 1", "p/2")).toBe("/suppliers/s%201/payments/p%2F2/void")
  })
})
