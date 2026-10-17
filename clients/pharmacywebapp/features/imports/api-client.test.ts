import { describe, expect, it } from "vitest"
import { stockImportBody } from "@/features/imports/api-client"
import type { StockImportRowDto } from "@/features/imports/lib/stock-import"

const rows = [{ rowNumber: 2, medicineName: "Insulin", quantity: 10, costPrice: 100 }] as StockImportRowDto[]

describe("stockImportBody", () => {
  it("sends owned stock with its funding and as-of date", () => {
    expect(stockImportBody(rows, { funding: "cash", asOfDate: "2026-10-01" }, true)).toEqual({
      rows,
      funding: "cash",
      asOfDate: "2026-10-01",
      dryRun: true,
    })
  })

  it("sends consigned stock with only the supplier", () => {
    expect(
      stockImportBody(rows, { funding: "consignment", supplierId: "sup-1", asOfDate: "2026-10-01" }, false),
    ).toEqual({
      rows,
      funding: null,
      asOfDate: null,
      consignmentSupplierId: "sup-1",
      dryRun: false,
    })
  })

  it("asks for the supplier before a consignment import is checked", () => {
    expect(() => stockImportBody(rows, { funding: "consignment" }, true)).toThrow(
      "Choose the consignment supplier first.",
    )
  })
})
