/**
 * Checking and running a go-live file. The steps go through the existing imports (suppliers, customers, stock) and
 * opening balances, in that order, each dated on the go-live date. Dependencies are passed in so the order, the
 * resume-after-failure rule and the problem list are testable without a server.
 */
import type { CustomerImportRowDto } from "@/features/imports/lib/customer-import"
import type { SupplierImportRowDto } from "@/features/imports/lib/supplier-import"
import type { ImportFieldError, MappedRow } from "@/features/imports/lib/spreadsheet"
import type { ImportResult } from "@/features/imports/types"
import {
  consignmentSupplierNames,
  mapGoLiveBalances,
  mapGoLiveCustomers,
  mapGoLiveStock,
  mapGoLiveSuppliers,
  openingLinesWithCashAndBank,
  resolveConsignmentSuppliers,
  rowName,
  supplierKey,
  type GoLiveBalances,
  type GoLiveSection,
  type GoLiveSheets,
  type GoLiveStockRowDto,
  type OpeningLine,
} from "./go-live-workbook"

export interface GoLiveDeps {
  importSuppliers: (rows: SupplierImportRowDto[], dryRun: boolean, key?: string) => Promise<ImportResult>
  importCustomers: (rows: CustomerImportRowDto[], dryRun: boolean, key?: string) => Promise<ImportResult>
  importStock: (rows: GoLiveStockRowDto[], dryRun: boolean, key?: string) => Promise<ImportResult>
  /** Existing suppliers by supplierKey(name) → id, for the names asked. */
  findSuppliers: (names: string[]) => Promise<Map<string, string>>
  /** The Cash (1000) and Bank (1010) account ids. */
  cashAndBankAccounts: () => Promise<{ cash: string; bank: string }>
  /** The branch's opening balances now. */
  openingState: () => Promise<{ isSet: boolean; version: number; lines: OpeningLine[] }>
  setOpening: (lines: OpeningLine[], requestId: string) => Promise<unknown>
  editOpening: (lines: OpeningLine[], version: number, requestId: string) => Promise<unknown>
  /** A stand-in id for a supplier the Suppliers sheet will create (preview only). */
  newId: () => string
}

export interface GoLiveProblem {
  section: GoLiveSection
  rowNumber: number
  /** The column key the message is about ("" for the whole row). */
  field: string
  message: string
  /** What the row is (medicine, supplier or customer name as typed), so the owner sees more than a row number. */
  label?: string
}

export interface GoLiveCheck {
  /** Must be fixed before going live. */
  problems: GoLiveProblem[]
  /** Saved as they are, but worth a look (a batch already in stock, a medicine with no form, …). Never block. */
  warnings: GoLiveProblem[]
  suppliers: { count: number; newCount: number; owed: number }
  customers: { count: number; newCount: number; owed: number }
  /** `rows` / `value`: the stock lines of the pharmacy's own stock; `cardsOnly`: rows with no quantity (card only). */
  stock: { rows: number; newMedicines: number; value: number; consignedRows: number; consignedSuppliers: number; cardsOnly: number }
  /** From an older file's "Cash & bank" sheet (zero when the file has none); the page's inputs are what's saved. */
  balances: GoLiveBalances
}

interface Mapped {
  suppliers: MappedRow<SupplierImportRowDto>[]
  customers: MappedRow<CustomerImportRowDto>[]
  stock: MappedRow<GoLiveStockRowDto>[]
  balances: GoLiveBalances
}

export function mapGoLive(sheets: GoLiveSheets, goLiveDate: string): Mapped {
  return {
    suppliers: mapGoLiveSuppliers(sheets.suppliers.rows, goLiveDate),
    customers: mapGoLiveCustomers(sheets.customers.rows, goLiveDate),
    stock: mapGoLiveStock(sheets.stock.rows),
    balances: mapGoLiveBalances(sheets.balances.rows),
  }
}

const missingColumnProblems = (sheets: GoLiveSheets): GoLiveProblem[] =>
  (Object.keys(sheets) as GoLiveSection[]).flatMap((section) =>
    sheets[section].rows.length > 0
      ? sheets[section].missingColumns.map((label) => ({ section, rowNumber: 1, field: "", message: `Column "${label}" is missing.` }))
      : [],
  )

const rowProblems = (section: GoLiveSection, rows: { rowNumber: number; errors: ImportFieldError[] }[]): GoLiveProblem[] =>
  rows.flatMap((r) => r.errors.map((e) => ({ section, rowNumber: r.rowNumber, field: e.field, message: e.message })))

const rowWarnings = (section: GoLiveSection, result: ImportResult | null): GoLiveProblem[] =>
  (result?.rows ?? []).flatMap((r) => r.warnings.map((message) => ({ section, rowNumber: r.rowNumber, field: "", message })))

/** Gives each problem its row's name (the server's medicine label when the sheet row has none). */
function named(sheets: GoLiveSheets, list: GoLiveProblem[], labels: ReadonlyMap<number, string>): GoLiveProblem[] {
  const bySection = new Map(
    (Object.keys(sheets) as GoLiveSection[]).map((s) => [s, new Map(sheets[s].rows.map((r) => [r.rowNumber, r]))]),
  )
  return list.map((p) => ({
    ...p,
    label: rowName(p.section, bySection.get(p.section)?.get(p.rowNumber)) ?? (p.section === "stock" ? labels.get(p.rowNumber) : undefined),
  }))
}

/** Every supplier name the stock sheet's consignment column may use: existing ones and the Suppliers sheet's. */
async function supplierIds(
  mapped: Mapped,
  deps: GoLiveDeps,
  forPreview: boolean,
): Promise<Map<string, string>> {
  const names = consignmentSupplierNames(mapped.stock.map((r) => r.data))
  if (names.length === 0) return new Map()
  const ids = await deps.findSuppliers(names)
  if (forPreview) {
    for (const s of mapped.suppliers) {
      const key = supplierKey(s.data.name ?? "")
      if (key && !ids.has(key)) ids.set(key, deps.newId())
    }
  }
  return ids
}

/** Checks the whole file without saving anything: client-side rules first, then each import's preview. */
export async function checkGoLive(sheets: GoLiveSheets, goLiveDate: string, deps: GoLiveDeps): Promise<GoLiveCheck> {
  const mapped = mapGoLive(sheets, goLiveDate)
  const stock = resolveConsignmentSuppliers(mapped.stock, await supplierIds(mapped, deps, true))

  const problems: GoLiveProblem[] = [
    ...missingColumnProblems(sheets),
    ...rowProblems("suppliers", mapped.suppliers),
    ...rowProblems("customers", mapped.customers),
    ...rowProblems("stock", stock),
    ...mapped.balances.errors.map((e) => ({ section: "balances" as const, rowNumber: e.rowNumber, field: "amount", message: e.message })),
  ]

  // A section with problems of its own isn't sent for the server's preview until they're fixed.
  const preview = async <T,>(
    section: GoLiveSection,
    rows: MappedRow<T>[],
    run: (data: T[]) => Promise<ImportResult>,
  ): Promise<ImportResult | null> => {
    if (rows.length === 0 || problems.some((p) => p.section === section)) return null
    const result = await run(rows.map((r) => r.data))
    problems.push(...rowProblems(section, result.rows))
    return result
  }

  const suppliers = await preview("suppliers", mapped.suppliers, (d) => deps.importSuppliers(d, true))
  const customers = await preview("customers", mapped.customers, (d) => deps.importCustomers(d, true))
  const stockResult = await preview("stock", stock, (d) => deps.importStock(d, true))

  const owed = (rows: MappedRow<{ openingBalance?: number }>[], result: ImportResult | null) =>
    rows.reduce((sum, r, i) => sum + (result?.rows[i]?.status === "created" ? (r.data.openingBalance ?? 0) : 0), 0)
  const consigned = stock.filter((r) => r.data.consignmentSupplierName)
  // No quantity: the row only adds the medicine card, so it's neither a stock line nor part of the stock value.
  const cardsOnly = stock.filter((r) => r.data.quantity === 0)
  const ownLines = stock.filter((r) => !r.data.consignmentSupplierName && r.data.quantity > 0)

  const labels = new Map((stockResult?.rows ?? []).filter((r) => r.label).map((r) => [r.rowNumber, r.label!]))
  const warnings = [...rowWarnings("suppliers", suppliers), ...rowWarnings("customers", customers), ...rowWarnings("stock", stockResult)]

  return {
    problems: named(sheets, problems, labels),
    warnings: named(sheets, warnings, labels),
    suppliers: { count: mapped.suppliers.length, newCount: suppliers?.created ?? 0, owed: owed(mapped.suppliers, suppliers) },
    customers: { count: mapped.customers.length, newCount: customers?.created ?? 0, owed: owed(mapped.customers, customers) },
    stock: {
      rows: ownLines.length,
      newMedicines: new Set(
        (stockResult?.rows ?? []).filter((r) => r.newMedicine).map((r) => r.label ?? String(r.rowNumber)),
      ).size,
      value: ownLines.reduce((sum, r) => sum + r.data.quantity * r.data.costPrice, 0),
      consignedRows: consigned.length,
      consignedSuppliers: new Set(consigned.map((r) => supplierKey(r.data.consignmentSupplierName!))).size,
      cardsOnly: cardsOnly.length,
    },
    balances: mapped.balances,
  }
}

export type GoLiveStep = "suppliers" | "customers" | "stock" | "balances"
export const GO_LIVE_STEPS: GoLiveStep[] = ["suppliers", "customers", "stock", "balances"]

export interface GoLiveRunOptions {
  /** Steps already saved by an earlier attempt of this same file — skipped, never saved twice. */
  done: ReadonlySet<GoLiveStep>
  /** Idempotency key / request id for a step (stable for this file, so a retried request is applied once). */
  keyFor: (step: GoLiveStep) => string
  onStep?: (step: GoLiveStep, state: "running" | "done" | "skipped") => void
  /** Cash in hand and bank balance as typed on the page. Without it, an older file's "Cash & bank" sheet is used. */
  balances?: { cash: number; bank: number }
}

/**
 * Saves the file: suppliers, customers, stock (consignment suppliers looked up after the suppliers exist), then cash
 * and bank into the opening balances (Set, or Edit keeping the other lines when they were set before). Throws on the
 * first failure; the steps finished so far are reported through onStep so the caller can resume.
 */
export async function runGoLive(sheets: GoLiveSheets, goLiveDate: string, deps: GoLiveDeps, options: GoLiveRunOptions): Promise<void> {
  const mapped = mapGoLive(sheets, goLiveDate)
  const step = async (name: GoLiveStep, hasWork: boolean, work: () => Promise<void>) => {
    if (options.done.has(name) || !hasWork) {
      options.onStep?.(name, "skipped")
      return
    }
    options.onStep?.(name, "running")
    await work()
    options.onStep?.(name, "done")
  }
  const committed = (result: ImportResult, what: string) => {
    if (!result.committed) throw new Error(`The ${what} weren't saved — check the file again.`)
  }

  await step("suppliers", mapped.suppliers.length > 0, async () =>
    committed(await deps.importSuppliers(mapped.suppliers.map((r) => r.data), false, options.keyFor("suppliers")), "suppliers"),
  )
  await step("customers", mapped.customers.length > 0, async () =>
    committed(await deps.importCustomers(mapped.customers.map((r) => r.data), false, options.keyFor("customers")), "customers"),
  )
  await step("stock", mapped.stock.length > 0, async () => {
    const stock = resolveConsignmentSuppliers(mapped.stock, await supplierIds(mapped, deps, false))
    const unresolved = stock.find((r) => r.errors.length > 0)
    if (unresolved) throw new Error(`Medicines & stock row ${unresolved.rowNumber}: ${unresolved.errors[0].message}`)
    committed(await deps.importStock(stock.map((r) => r.data), false, options.keyFor("stock")), "stock lines")
  })
  const { cash, bank } = options.balances ?? mapped.balances
  await step("balances", cash > 0 || bank > 0, async () => {
    const accounts = await deps.cashAndBankAccounts()
    const state = await deps.openingState()
    const lines = openingLinesWithCashAndBank(
      state.isSet ? state.lines : [],
      { accountId: accounts.cash, amount: cash },
      { accountId: accounts.bank, amount: bank },
    )
    if (state.isSet) await deps.editOpening(lines, state.version, options.keyFor("balances"))
    else await deps.setOpening(lines, options.keyFor("balances"))
  })
}
