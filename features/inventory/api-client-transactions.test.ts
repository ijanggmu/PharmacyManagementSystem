import { describe, expect, it } from "vitest"
import {
  buildInventoryTransactionsPath,
  canListTransactionsOnDotnet,
  toInventoryTransaction,
  toInventoryTransactionType,
  type DotnetInventoryTransactionDto,
} from "./api-client-transactions"

const dto: DotnetInventoryTransactionDto = {
  id: "88888888-8888-8888-8888-888888888888",
  medicineId: "99999999-9999-9999-9999-999999999999",
  medicineName: "Amoxicillin 250mg",
  branchId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  medicineBatchId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  batchNo: "B-100",
  transactionType: "Sale",
  quantityDelta: -3,
  unitCostPrice: 12.5,
  referenceType: "Sale",
  referenceId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  notes: null,
  createdAtUtc: "2026-10-05T09:30:00Z",
}

describe("toInventoryTransactionType", () => {
  it("maps each .NET enum name to the legacy value, with the closest meaning for return and expired", () => {
    expect(toInventoryTransactionType("Purchase")).toBe("purchase")
    expect(toInventoryTransactionType("Sale")).toBe("sale")
    expect(toInventoryTransactionType("Adjustment")).toBe("adjustment")
    expect(toInventoryTransactionType("SaleReversal")).toBe("return")
    expect(toInventoryTransactionType("Dispose")).toBe("expired")
    expect(toInventoryTransactionType("Transfer")).toBe("transfer")
    expect(toInventoryTransactionType("SupplierReturn")).toBe("supplier_return")
  })

  it("throws on an unknown enum name instead of guessing", () => {
    expect(() => toInventoryTransactionType("Gift")).toThrow(/Unknown inventory transaction type/)
  })
})

describe("canListTransactionsOnDotnet", () => {
  it("accepts no type filter and the three types with an exact .NET name", () => {
    expect(canListTransactionsOnDotnet({})).toBe(true)
    expect(canListTransactionsOnDotnet({ transactionType: "purchase" })).toBe(true)
    expect(canListTransactionsOnDotnet({ transactionType: "sale" })).toBe(true)
    expect(canListTransactionsOnDotnet({ transactionType: "adjustment" })).toBe(true)
  })

  it("keeps the ambiguous return and expired filters on the legacy path", () => {
    expect(canListTransactionsOnDotnet({ transactionType: "return" })).toBe(false)
    expect(canListTransactionsOnDotnet({ transactionType: "expired" })).toBe(false)
  })
})

describe("toInventoryTransaction", () => {
  it("maps quantity from QuantityDelta, the date from CreatedAtUtc, and the medicine and branch ids", () => {
    const row = toInventoryTransaction(dto)
    expect(row).toEqual({
      id: dto.id,
      transaction_type: "sale",
      quantity: -3,
      reference_id: dto.referenceId,
      reference_type: "Sale",
      reason_code: null,
      notes: null,
      transaction_date: "2026-10-05T09:30:00Z",
      medicines: { id: dto.medicineId, name: "Amoxicillin 250mg" },
      branches: { id: dto.branchId, name: "" },
      users: null,
    })
  })

  it("returns a null medicine when the .NET row carries no name, and null reference fields when absent", () => {
    const row = toInventoryTransaction({ ...dto, medicineName: null, referenceId: null, referenceType: null })
    expect(row.medicines).toBeNull()
    expect(row.reference_id).toBeNull()
    expect(row.reference_type).toBeNull()
  })
})

describe("buildInventoryTransactionsPath", () => {
  it("maps page and limit to pageNumber and pageSize with the legacy defaults", () => {
    const sp = new URLSearchParams(buildInventoryTransactionsPath({}).split("?")[1])
    expect(sp.get("pageNumber")).toBe("1")
    expect(sp.get("pageSize")).toBe("50")
  })

  it("clamps the page size to 1..200 as the legacy service does", () => {
    const big = new URLSearchParams(buildInventoryTransactionsPath({ limit: 999 }).split("?")[1])
    const small = new URLSearchParams(buildInventoryTransactionsPath({ limit: 0, page: 0 }).split("?")[1])
    expect(big.get("pageSize")).toBe("200")
    expect(small.get("pageSize")).toBe("1")
    expect(small.get("pageNumber")).toBe("1")
  })

  it("sends the medicine, branch, type and date filters with .NET parameter names", () => {
    const sp = new URLSearchParams(
      buildInventoryTransactionsPath({
        medicineId: "m1",
        branchId: "b1",
        transactionType: "purchase",
        dateFrom: "2026-10-01",
        dateTo: "2026-10-06",
        page: 2,
        limit: 25,
      }).split("?")[1],
    )
    expect(sp.get("medicineId")).toBe("m1")
    expect(sp.get("branchId")).toBe("b1")
    expect(sp.get("transactionType")).toBe("Purchase")
    expect(sp.get("dateFrom")).toBe("2026-10-01")
    expect(sp.get("dateTo")).toBe("2026-10-06")
    expect(sp.get("pageNumber")).toBe("2")
    expect(sp.get("pageSize")).toBe("25")
  })

  it("throws for a type filter with no .NET equivalent rather than dropping it", () => {
    expect(() => buildInventoryTransactionsPath({ transactionType: "expired" })).toThrow(/no .NET equivalent/)
  })
})
