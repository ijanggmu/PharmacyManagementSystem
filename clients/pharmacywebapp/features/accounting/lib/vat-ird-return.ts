/**
 * The VAT return in IRD's monthly layout (Accounting › Tax & IRD › VAT return): sales and purchases turnover
 * from the IRD registers, the VAT computation from the ledger, credit brought / carried forward, and the
 * register-vs-ledger reconciliation. Pure: mapping from the .NET DTO plus the rows the tab, print and CSV show.
 */

/** Sales section as sent by the .NET API (VatReturnSalesDto). */
export interface DotnetVatReturnSalesDto {
  taxableSales: number
  outputVat: number
  exemptSales: number
  exportSales: number
  unclassifiedSales: number
  returnsTaxable: number
  returnsExempt: number
  returnsVat: number
  netTaxableSales: number
  netExemptSales: number
  netOutputVat: number
  netTotalSales: number
  invoiceCount: number
  creditNoteCount: number
}

/** Purchases section as sent by the .NET API (VatReturnPurchasesDto). */
export interface DotnetVatReturnPurchasesDto {
  taxablePurchases: number
  inputVat: number
  exemptPurchases: number
  importPurchases: number
  importVat: number
  debitNotesTaxable: number
  debitNotesExempt: number
  debitNotesVat: number
  netTaxablePurchases: number
  netExemptPurchases: number
  netInputVat: number
  netTotalPurchases: number
  billCount: number
  debitNoteCount: number
}

/** Carry-forward as sent by the .NET API (VatReturnCarryForwardDto). Positions: + owed to IRD, − credit. */
export interface DotnetVatReturnCarryForwardDto {
  openingPosition: number
  creditBroughtForward: number
  unpaidVatBroughtForward: number
  netVatForPeriod: number
  vatPayable: number
  creditCarriedForward: number
  vatPaidInPeriod: number
  closingPosition: number
}

/** Register vs ledger VAT as sent by the .NET API (VatReturnReconciliationDto). Differences are register − ledger. */
export interface DotnetVatReturnReconciliationDto {
  registerOutputVat: number
  ledgerOutputVat: number
  outputVatDifference: number
  registerInputVat: number
  ledgerInputVat: number
  inputVatDifference: number
  hasDifference: boolean
}

export interface DotnetVatReturnIrdSections {
  sales?: DotnetVatReturnSalesDto | null
  purchases?: DotnetVatReturnPurchasesDto | null
  carryForward?: DotnetVatReturnCarryForwardDto | null
  reconciliation?: DotnetVatReturnReconciliationDto | null
}

export interface VatIrdReturn {
  sales: {
    taxable: number
    output_vat: number
    exempt: number
    export: number
    unclassified: number
    returns_taxable: number
    returns_exempt: number
    returns_vat: number
    net_taxable: number
    net_exempt: number
    net_output_vat: number
    net_total: number
    invoice_count: number
    credit_note_count: number
  }
  purchases: {
    taxable: number
    input_vat: number
    exempt: number
    imports: number
    import_vat: number
    debit_notes_taxable: number
    debit_notes_exempt: number
    debit_notes_vat: number
    net_taxable: number
    net_exempt: number
    net_input_vat: number
    net_total: number
    bill_count: number
    debit_note_count: number
  }
  carry_forward: {
    opening_position: number
    credit_brought_forward: number
    unpaid_brought_forward: number
    net_vat_for_period: number
    vat_payable: number
    credit_carried_forward: number
    vat_paid_in_period: number
    closing_position: number
  }
  reconciliation: {
    register_output_vat: number
    ledger_output_vat: number
    output_difference: number
    register_input_vat: number
    ledger_input_vat: number
    input_difference: number
    has_difference: boolean
  }
}

const EPSILON = 0.005

function zero(n: number | null | undefined): boolean {
  return Math.abs(Number(n ?? 0)) < EPSILON
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

const n = (v: number | null | undefined): number => round2(Number(v ?? 0))

/** Maps the API's IRD sections; null when the API predates them (any section missing). */
export function mapVatIrdReturn(dto: DotnetVatReturnIrdSections): VatIrdReturn | null {
  const { sales: s, purchases: p, carryForward: c, reconciliation: r } = dto
  if (!s || !p || !c || !r) return null
  return {
    sales: {
      taxable: n(s.taxableSales),
      output_vat: n(s.outputVat),
      exempt: n(s.exemptSales),
      export: n(s.exportSales),
      unclassified: n(s.unclassifiedSales),
      returns_taxable: n(s.returnsTaxable),
      returns_exempt: n(s.returnsExempt),
      returns_vat: n(s.returnsVat),
      net_taxable: n(s.netTaxableSales),
      net_exempt: n(s.netExemptSales),
      net_output_vat: n(s.netOutputVat),
      net_total: n(s.netTotalSales),
      invoice_count: s.invoiceCount ?? 0,
      credit_note_count: s.creditNoteCount ?? 0,
    },
    purchases: {
      taxable: n(p.taxablePurchases),
      input_vat: n(p.inputVat),
      exempt: n(p.exemptPurchases),
      imports: n(p.importPurchases),
      import_vat: n(p.importVat),
      debit_notes_taxable: n(p.debitNotesTaxable),
      debit_notes_exempt: n(p.debitNotesExempt),
      debit_notes_vat: n(p.debitNotesVat),
      net_taxable: n(p.netTaxablePurchases),
      net_exempt: n(p.netExemptPurchases),
      net_input_vat: n(p.netInputVat),
      net_total: n(p.netTotalPurchases),
      bill_count: p.billCount ?? 0,
      debit_note_count: p.debitNoteCount ?? 0,
    },
    carry_forward: {
      opening_position: n(c.openingPosition),
      credit_brought_forward: n(c.creditBroughtForward),
      unpaid_brought_forward: n(c.unpaidVatBroughtForward),
      net_vat_for_period: n(c.netVatForPeriod),
      vat_payable: n(c.vatPayable),
      credit_carried_forward: n(c.creditCarriedForward),
      vat_paid_in_period: n(c.vatPaidInPeriod),
      closing_position: n(c.closingPosition),
    },
    reconciliation: {
      register_output_vat: n(r.registerOutputVat),
      ledger_output_vat: n(r.ledgerOutputVat),
      output_difference: n(r.outputVatDifference),
      register_input_vat: n(r.registerInputVat),
      ledger_input_vat: n(r.ledgerInputVat),
      input_difference: n(r.inputVatDifference),
      has_difference: Boolean(r.hasDifference),
    },
  }
}

export type IrdRowKind = "line" | "less" | "total"

/** One line of the sales / purchases annex: a VAT-exclusive value and its VAT (null where VAT doesn't apply). */
export interface IrdTurnoverRow {
  key: string
  label: string
  /** Short explanation shown under the label (and in print/CSV notes). */
  note?: string
  value: number
  vat: number | null
  kind: IrdRowKind
}

export interface IrdTurnoverSection {
  key: "sales" | "purchases"
  title: string
  rows: IrdTurnoverRow[]
  total: IrdTurnoverRow
}

/** The sales and purchases sections in IRD's order. Deductions are negative so each section sums to its total. */
export function irdTurnoverSections(ret: VatIrdReturn): IrdTurnoverSection[] {
  const s = ret.sales
  const p = ret.purchases
  const salesRows: IrdTurnoverRow[] = [
    { key: "taxable_sales", label: "Taxable sales", note: `${s.invoice_count} invoice(s) in the IRD sales register`, value: s.taxable, vat: s.output_vat, kind: "line" },
    { key: "exempt_sales", label: "Exempt sales", value: s.exempt, vat: null, kind: "line" },
    { key: "export_sales", label: "Export (zero-rated) sales", note: "Exports are not recorded in this system", value: s.export, vat: 0, kind: "line" },
  ]
  if (!zero(s.unclassified)) {
    salesRows.push({
      key: "unclassified_sales",
      label: "Sales without a VAT breakdown",
      note: "Recorded before VAT was tracked per invoice — review before filing",
      value: s.unclassified,
      vat: null,
      kind: "line",
    })
  }
  salesRows.push(
    { key: "sales_returns_taxable", label: "Less: sales returns / credit notes (taxable)", note: `${s.credit_note_count} cancellation(s) and credit note(s)`, value: -s.returns_taxable, vat: -s.returns_vat, kind: "less" },
    { key: "sales_returns_exempt", label: "Less: sales returns / credit notes (exempt)", value: -s.returns_exempt, vat: null, kind: "less" },
  )

  const purchaseRows: IrdTurnoverRow[] = [
    { key: "taxable_purchases", label: "Taxable purchases", note: `${p.bill_count} bill(s) in the IRD purchase register`, value: p.taxable, vat: p.input_vat, kind: "line" },
    { key: "exempt_purchases", label: "Exempt purchases", value: p.exempt, vat: null, kind: "line" },
    { key: "imports", label: "Taxable imports", note: "Imports are not recorded in this system", value: p.imports, vat: p.import_vat, kind: "line" },
    { key: "debit_notes_taxable", label: "Less: purchase returns / debit notes (taxable)", note: `${p.debit_note_count} debit note(s) and voided bill(s)`, value: -p.debit_notes_taxable, vat: -p.debit_notes_vat, kind: "less" },
    { key: "debit_notes_exempt", label: "Less: purchase returns / debit notes (exempt)", value: -p.debit_notes_exempt, vat: null, kind: "less" },
  ]

  return [
    {
      key: "sales",
      title: "Sales",
      rows: salesRows,
      total: { key: "sales_total", label: "Total sales", value: s.net_total, vat: s.net_output_vat, kind: "total" },
    },
    {
      key: "purchases",
      title: "Purchases",
      rows: purchaseRows,
      total: { key: "purchases_total", label: "Total purchases", value: p.net_total, vat: p.net_input_vat, kind: "total" },
    },
  ]
}

/** The ledger VAT figures the computation starts from. */
export interface LedgerVatFigures {
  /** Gross output VAT (credits to 2100, excl. settlements). */
  output_vat_gl: number
  /** Output VAT given back on returns / adjustments (debits to 2100, excl. settlements). */
  output_vat_adjustments?: number
  input_vat_gl: number
}

export interface IrdComputationLine {
  key: string
  label: string
  basis: string
  /** Signed: deductions are negative. */
  amount: number
  kind: IrdRowKind
}

export type IrdReturnOutcome = "payable" | "credit" | "nil"

export interface IrdComputation {
  lines: IrdComputationLine[]
  result: IrdComputationLine
  outcome: IrdReturnOutcome
}

/**
 * Output VAT − input VAT = net VAT for the period (ledger); less the credit brought forward = VAT payable for
 * this return, or the credit carried forward to the next period.
 */
export function irdVatComputation(ledger: LedgerVatFigures, ret: VatIrdReturn): IrdComputation {
  const cf = ret.carry_forward
  const adjustments = ledger.output_vat_adjustments ?? 0
  const lines: IrdComputationLine[] = [
    { key: "output", label: "Output VAT on sales", basis: "Ledger: output VAT account", amount: round2(ledger.output_vat_gl), kind: "line" },
  ]
  if (!zero(adjustments)) {
    lines.push({ key: "adjustments", label: "Less: VAT on sales returns / credit notes", basis: "Ledger: output VAT account", amount: round2(-adjustments), kind: "less" })
  }
  lines.push(
    { key: "input", label: "Less: input VAT on purchases (net of debit notes)", basis: "Ledger: input VAT account", amount: round2(-ledger.input_vat_gl), kind: "less" },
    { key: "net", label: "Net VAT for the period", basis: "Output VAT − input VAT", amount: cf.net_vat_for_period, kind: "total" },
    { key: "credit_bf", label: "Less: credit brought forward from previous period", basis: "Excess input VAT before this period", amount: round2(-cf.credit_brought_forward), kind: "less" },
  )
  let outcome: IrdReturnOutcome = "nil"
  if (!zero(cf.vat_payable)) outcome = "payable"
  else if (!zero(cf.credit_carried_forward)) outcome = "credit"
  const result: IrdComputationLine =
    outcome === "credit"
      ? { key: "credit_cf", label: "Credit carried forward to next period", basis: "Credit brought forward − net VAT", amount: cf.credit_carried_forward, kind: "total" }
      : { key: "payable", label: "VAT payable for this return", basis: "Net VAT − credit brought forward", amount: cf.vat_payable, kind: "total" }
  return { lines, result, outcome }
}

export interface IrdReconciliationRow {
  key: "output" | "input"
  label: string
  register: number
  ledger: number
  /** Register − ledger. */
  difference: number
  matches: boolean
}

export function irdReconciliationRows(ret: VatIrdReturn): IrdReconciliationRow[] {
  const r = ret.reconciliation
  return [
    { key: "output", label: "Output VAT", register: r.register_output_vat, ledger: r.ledger_output_vat, difference: r.output_difference, matches: zero(r.output_difference) },
    { key: "input", label: "Input VAT", register: r.register_input_vat, ledger: r.ledger_input_vat, difference: r.input_difference, matches: zero(r.input_difference) },
  ]
}

const money2 = (v: number | null): string => (v == null ? "" : round2(v).toFixed(2))

/** CSV rows (Section, Line, Taxable value / amount, VAT, Note) for the whole IRD-layout return. */
export function irdReturnCsvRows(ledger: LedgerVatFigures, ret: VatIrdReturn): string[][] {
  const rows: string[][] = []
  for (const section of irdTurnoverSections(ret)) {
    for (const r of [...section.rows, section.total]) {
      rows.push([section.title, r.label, money2(r.value), money2(r.vat), r.note ?? ""])
    }
  }
  const computation = irdVatComputation(ledger, ret)
  for (const l of [...computation.lines, computation.result]) {
    rows.push(["VAT computation", l.label, money2(l.amount), "", l.basis])
  }
  const cf = ret.carry_forward
  rows.push(["VAT account", "Unpaid VAT brought forward (earlier returns)", money2(cf.unpaid_brought_forward), "", "Not part of this return"])
  rows.push(["VAT account", "VAT paid to IRD in the period", money2(cf.vat_paid_in_period), "", "Net of refunds received"])
  rows.push(["VAT account", "VAT position at period end", money2(cf.closing_position), "", cf.closing_position < 0 ? "Credit" : "Owed to IRD"])
  for (const r of irdReconciliationRows(ret)) {
    rows.push(["Reconciliation", `${r.label} per registers`, money2(r.register), "", ""])
    rows.push(["Reconciliation", `${r.label} per ledger`, money2(r.ledger), "", ""])
    rows.push(["Reconciliation", `${r.label} difference`, money2(r.difference), "", r.matches ? "Matches" : "Investigate before filing"])
  }
  return rows
}

/** Rows (Particulars, Value, VAT) for the printed return; section titles are rows with empty amounts. */
export function irdReturnPrintRows(
  ledger: LedgerVatFigures,
  ret: VatIrdReturn,
  fmt: (n: number) => string,
): { rows: (string | null)[][]; sectionRowIndexes: number[] } {
  const rows: (string | null)[][] = []
  const sectionRowIndexes: number[] = []
  const section = (title: string) => {
    sectionRowIndexes.push(rows.length)
    rows.push([title, null, null])
  }
  for (const s of irdTurnoverSections(ret)) {
    section(s.title)
    for (const r of s.rows) rows.push([r.label, fmt(r.value), r.vat == null ? "—" : fmt(r.vat)])
    sectionRowIndexes.push(rows.length)
    rows.push([s.total.label, fmt(s.total.value), s.total.vat == null ? "—" : fmt(s.total.vat)])
  }
  section("VAT computation")
  const computation = irdVatComputation(ledger, ret)
  for (const l of computation.lines) rows.push([l.label, null, fmt(l.amount)])
  sectionRowIndexes.push(rows.length)
  rows.push([computation.result.label, null, fmt(computation.result.amount)])
  section("VAT account")
  const cf = ret.carry_forward
  rows.push(["Unpaid VAT brought forward (earlier returns)", null, fmt(cf.unpaid_brought_forward)])
  rows.push(["VAT paid to IRD in the period", null, fmt(cf.vat_paid_in_period)])
  rows.push([cf.closing_position < 0 ? "Credit at period end" : "VAT owed at period end", null, fmt(Math.abs(cf.closing_position))])
  return { rows, sectionRowIndexes }
}

/** One-line reconciliation warning, or null when registers and ledger agree. */
export function irdReconciliationWarning(ret: VatIrdReturn, fmt: (n: number) => string): string | null {
  if (!ret.reconciliation.has_difference) return null
  const parts = irdReconciliationRows(ret)
    .filter((r) => !r.matches)
    .map((r) => `${r.label}: registers ${fmt(r.register)} vs ledger ${fmt(r.ledger)} (difference ${fmt(r.difference)})`)
  return parts.join("; ")
}
