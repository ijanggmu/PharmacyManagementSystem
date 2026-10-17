import { describe, expect, it, vi } from "vitest"
import type { ImportResult } from "@/features/imports/types"
import { checkGoLive, runGoLive, type GoLiveDeps, type GoLiveStep } from "./go-live-run"
import { sheetsFromMatrices, type GoLiveSheets, type GoLiveStockRowDto } from "./go-live-workbook"

const result = (rows: { status?: string; errors?: { field: string; message: string }[]; newMedicine?: boolean; label?: string }[], committed = true): ImportResult => ({
  committed,
  dryRun: !committed,
  created: rows.filter((r) => (r.status ?? "created") === "created").length,
  updated: 0,
  skipped: 0,
  failed: rows.filter((r) => r.errors?.length).length,
  rows: rows.map((r, i) => ({
    rowNumber: i + 2,
    status: (r.errors?.length ? "failed" : (r.status ?? "created")) as ImportResult["rows"][number]["status"],
    id: null,
    label: r.label ?? null,
    errors: r.errors ?? [],
    warnings: [],
    newMedicine: r.newMedicine,
  })),
})

function sheets(): GoLiveSheets {
  return sheetsFromMatrices({
    Suppliers: [["Name", "PAN / VAT no", "Amount you owe them"], ["Himal Drug House", "600123456", "25000"]],
    Customers: [["Name", "Phone", "Amount they owe you"], ["Krishna Karki", "9851000682", "1500"]],
    "Medicines & stock": [
      ["Medicine name", "Form", "Batch no", "Quantity", "Cost price", "MRP", "Consignment supplier"],
      ["Cetamol 500mg", "Tablet", "C-1", "100", "1", "2", ""],
      ["Insulin", "Injection", "I-1", "10", "1100", "1500", "Himal Drug House"],
    ],
    "Cash & bank": [["Account", "Amount"], ["Cash in hand", "20000"], ["Bank balance", "0"]],
  })
}

function deps(overrides: Partial<GoLiveDeps> = {}): GoLiveDeps & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    importSuppliers: vi.fn(async (rows, dryRun) => (calls.push(`suppliers:${dryRun}`), result(rows.map(() => ({})), !dryRun))),
    importCustomers: vi.fn(async (rows, dryRun) => (calls.push(`customers:${dryRun}`), result(rows.map(() => ({})), !dryRun))),
    importStock: vi.fn(async (rows: GoLiveStockRowDto[], dryRun: boolean) => {
      calls.push(`stock:${dryRun}:${rows.map((r) => r.consignmentSupplierId ?? "-").join(",")}`)
      return result(rows.map((r) => ({ status: "received", newMedicine: r.medicineName === "Insulin", label: r.medicineName })), !dryRun)
    }),
    findSuppliers: vi.fn(async () => new Map<string, string>()),
    cashAndBankAccounts: vi.fn(async () => ({ cash: "cash-id", bank: "bank-id" })),
    openingState: vi.fn(async () => ({ isSet: false, version: 0, lines: [] })),
    setOpening: vi.fn(async (lines) => calls.push(`set:${JSON.stringify(lines)}`)),
    editOpening: vi.fn(async (lines, version) => calls.push(`edit:${version}:${JSON.stringify(lines)}`)),
    newId: () => "preview-id",
    ...overrides,
  }
}

describe("checkGoLive", () => {
  it("previews every sheet without saving and sums what comes in", async () => {
    const d = deps()
    const check = await checkGoLive(sheets(), "2026-10-17", d)

    expect(check.problems).toEqual([])
    expect(d.calls).toEqual(["suppliers:true", "customers:true", "stock:true:-,preview-id"])
    expect(check.suppliers).toEqual({ count: 1, newCount: 1, owed: 25000 })
    expect(check.customers.owed).toBe(1500)
    expect(check.stock).toEqual({ rows: 2, newMedicines: 1, value: 100, consignedRows: 1, consignedSuppliers: 1 })
    expect(check.balances).toMatchObject({ cash: 20000, bank: 0 })
  })

  it("lists the server's problems by sheet and row, and holds back a sheet with problems of its own", async () => {
    const s = sheets()
    s.customers.rows[0].cells.amount = ""
    s.customers.rows[0].cells.name = ""
    const d = deps({
      importStock: vi.fn(async () => result([{}, { errors: [{ field: "expiry_date", message: "Already expired" }] }], false)),
    })
    const check = await checkGoLive(s, "2026-10-17", d)

    expect(check.problems).toContainEqual({ section: "stock", rowNumber: 3, field: "expiry_date", message: "Already expired" })
    expect(check.problems.some((p) => p.section === "customers")).toBe(true)
    expect(d.importCustomers).not.toHaveBeenCalled()
  })
})

describe("runGoLive", () => {
  it("saves suppliers, customers, stock and cash in that order, with the real consignment supplier", async () => {
    const d = deps({ findSuppliers: vi.fn(async () => new Map([["himal drug house", "sup-real"]])) })
    const steps: string[] = []
    await runGoLive(sheets(), "2026-10-17", d, { done: new Set(), keyFor: (s) => `key-${s}`, onStep: (s, st) => steps.push(`${s}:${st}`) })

    expect(d.calls).toEqual([
      "suppliers:false",
      "customers:false",
      "stock:false:-,sup-real",
      `set:${JSON.stringify([{ accountId: "cash-id", debitAmount: 20000, creditAmount: 0 }])}`,
    ])
    expect(d.importStock).toHaveBeenCalledWith(expect.anything(), false, "key-stock")
    expect(steps.filter((s) => s.endsWith(":done"))).toEqual(["suppliers:done", "customers:done", "stock:done", "balances:done"])
  })

  it("skips the steps an earlier attempt finished, and edits opening balances that were already set", async () => {
    const d = deps({
      findSuppliers: vi.fn(async () => new Map([["himal drug house", "sup-real"]])),
      openingState: vi.fn(async () => ({ isSet: true, version: 4, lines: [{ accountId: "loan", debitAmount: 0, creditAmount: 900 }] })),
    })
    const done = new Set<GoLiveStep>(["suppliers", "customers"])
    await runGoLive(sheets(), "2026-10-17", d, { done, keyFor: (s) => s })

    expect(d.importSuppliers).not.toHaveBeenCalled()
    expect(d.importCustomers).not.toHaveBeenCalled()
    expect(d.calls.at(-1)).toBe(
      `edit:4:${JSON.stringify([
        { accountId: "loan", debitAmount: 0, creditAmount: 900 },
        { accountId: "cash-id", debitAmount: 20000, creditAmount: 0 },
      ])}`,
    )
  })

  it("stops at a consignment supplier that still doesn't exist", async () => {
    const d = deps()
    await expect(runGoLive(sheets(), "2026-10-17", d, { done: new Set(), keyFor: (s) => s })).rejects.toThrow(/row 3/)
    expect(d.setOpening).not.toHaveBeenCalled()
  })
})
