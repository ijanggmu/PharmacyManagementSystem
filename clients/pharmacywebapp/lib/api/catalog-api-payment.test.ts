import { describe, expect, it } from "vitest"
import { toDotnetCreateMedicineCommand, toDotnetSupplierBillPayment } from "@/lib/api/catalog-api"

describe("supplier bill payment on create medicine", () => {
  const withStock = { name: "Paracetamol", stock_quantity: 10, cost_price: 2, unit_price: 3, supplier_id: "s1" }

  it("sends the payment for a supplier bill with stock", () => {
    const cmd = toDotnetCreateMedicineCommand({
      ...withStock,
      payment: { method: "bank", amount: 15, reference: " TXN-1 ", payment_date: "2026-10-01" },
    })
    expect(cmd.payment).toEqual({ method: "bank", amount: 15, reference: "TXN-1", paymentDateUtc: "2026-10-01T00:00:00Z" })
  })

  it("drops the payment without a supplier or without stock", () => {
    const payment = { method: "cash" }
    expect(toDotnetCreateMedicineCommand({ ...withStock, supplier_id: null, payment }).payment).toBeNull()
    expect(toDotnetCreateMedicineCommand({ ...withStock, stock_quantity: 0, payment }).payment).toBeNull()
    expect(toDotnetCreateMedicineCommand(withStock).payment).toBeNull()
  })

  it("leaves amount null (pay in full) when blank or zero", () => {
    expect(toDotnetSupplierBillPayment({ method: "cash", amount: null })).toMatchObject({ amount: null, paymentDateUtc: null })
    expect(toDotnetSupplierBillPayment({ method: "cash", amount: 0 })?.amount).toBeNull()
    expect(toDotnetSupplierBillPayment(null)).toBeNull()
  })
})
