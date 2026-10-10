/**
 * Pure presentation logic for the VAT return summary (Accounting › Tax & IRD › VAT return).
 * No data access — the figures come from accountingApi.vatReturn.
 */

/** The fields of the VAT return report the summary reads. */
export interface VatReturnFigures {
  period_from: string
  period_to: string
  output_vat_gl: number
  input_vat_gl: number
  net_vat_payable: number
  output_vat_operational: number
  input_vat_operational: number
  gl_vs_operational_output_diff: number
  gl_vs_operational_input_diff: number
  trial_balance_ok: boolean
}

export type VatPosition = "payable" | "refundable" | "nil"

const EPSILON = 0.005

export function isZeroAmount(n: number | null | undefined): boolean {
  return Math.abs(Number(n ?? 0)) < EPSILON
}

/** Net VAT (output − input) above zero is due to IRD, below zero is refundable / carried forward. */
export function vatPosition(netVat: number): VatPosition {
  if (isZeroAmount(netVat)) return "nil"
  return netVat > 0 ? "payable" : "refundable"
}

export interface VatPositionCopy {
  /** Short status, e.g. "Payable to IRD". */
  label: string
  /** Title for the net figure, e.g. "Net VAT payable". */
  netLabel: string
  /** One-line guidance. */
  hint: string
}

export function vatPositionCopy(position: VatPosition): VatPositionCopy {
  switch (position) {
    case "payable":
      return {
        label: "Payable to IRD",
        netLabel: "Net VAT payable",
        hint: "Output VAT exceeds input VAT. File and pay within 25 days of the period end.",
      }
    case "refundable":
      return {
        label: "Refundable / carry forward",
        netLabel: "Net VAT refundable",
        hint: "Input VAT exceeds output VAT. Carry the credit forward or claim a refund.",
      }
    default:
      return {
        label: "Nil return",
        netLabel: "Net VAT",
        hint: "Output and input VAT cancel out. A nil return still has to be filed.",
      }
  }
}

export interface VatComputationLine {
  key: "output" | "input" | "net"
  label: string
  basis: string
  /** Signed contribution to the net figure (input VAT is negative). */
  amount: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** The three lines of the return: output VAT, less input VAT, and the net (the totals row). */
export function vatComputationLines(r: Pick<VatReturnFigures, "output_vat_gl" | "input_vat_gl" | "net_vat_payable">): {
  lines: VatComputationLine[]
  net: VatComputationLine
} {
  const position = vatPosition(r.net_vat_payable)
  return {
    lines: [
      { key: "output", label: "Output VAT on sales", basis: "Credit balance of the output VAT account", amount: round2(r.output_vat_gl) },
      { key: "input", label: "Less: input VAT on purchases", basis: "Debit balance of the input VAT account", amount: round2(-r.input_vat_gl) },
    ],
    net: {
      key: "net",
      label: vatPositionCopy(position).netLabel,
      basis: "Output VAT − input VAT",
      amount: round2(r.net_vat_payable),
    },
  }
}

/**
 * The API reports operational (sales/purchase record) VAT as zero until that cross-check is modelled.
 * Only show a GL-vs-records comparison when there is something to compare, otherwise "matches" is a lie.
 */
export function hasOperationalCrossCheck(r: Pick<VatReturnFigures, "output_vat_operational" | "input_vat_operational">): boolean {
  return !isZeroAmount(r.output_vat_operational) || !isZeroAmount(r.input_vat_operational)
}

/** CSV rows (Line, Basis, Amount) for the VAT summary export. */
export function vatSummaryCsvRows(r: VatReturnFigures): string[][] {
  const { lines, net } = vatComputationLines(r)
  const rows = [...lines, net].map((l) => [l.label, l.basis, l.amount.toFixed(2)])
  rows.push(["Status", "", vatPositionCopy(vatPosition(r.net_vat_payable)).label])
  if (hasOperationalCrossCheck(r)) {
    rows.push(["Output VAT per sales records", "Cross-check", r.output_vat_operational.toFixed(2)])
    rows.push(["Input VAT per purchase records", "Cross-check", r.input_vat_operational.toFixed(2)])
  }
  rows.push(["Trial balance", "", r.trial_balance_ok ? "Balanced" : "Out of balance"])
  return rows
}
