/**
 * Live totals of a supplier bill (purchase order or direct goods receipt) with free goods, trade discounts,
 * a bill discount and pack entry. Mirrors the server's PurchaseLineMath (Purchasing module) so the figures on
 * screen are the ones that get saved:
 *
 *   gross            = quantity × rate                      (packs × pack rate when entered in packs)
 *   line discount    = the amount entered, else gross × % / 100
 *   bill discount    = the amount entered, else Σ(gross − line discount) × % / 100,
 *                      spread over the lines in proportion to (gross − line discount), in whole paisa
 *                      (largest remainder; ties to the larger line, then the earlier one)
 *   taxable (net)    = gross − line discount − bill share   (IRD: VAT is charged on the discounted value)
 *   VAT              = taxable × rate / 100 for a taxable medicine (or the amount typed), 0 when exempt
 *   payable          = Σ taxable + Σ VAT
 *   effective cost   = taxable ÷ (quantity + free quantity), per base unit — what each unit goes into stock at
 *
 * Every amount is rounded to 2 dp, half away from zero.
 */

export type DiscountMode = "percent" | "amount"

export interface PurchaseLineEntry {
  /** Paid quantity, in boxes when `inBoxes`, packs when `inPacks`, else base units. */
  quantity: number
  /** Free (bonus) quantity, same unit as `quantity`. */
  freeQuantity: number
  /** Rate per box / pack when `inBoxes` / `inPacks`, else per base unit. */
  rate: number
  discountMode: DiscountMode
  /** Percent (0–100) or amount, per `discountMode`. */
  discountValue: number
  inPacks: boolean
  /** Units per pack of the medicine (needed when `inPacks` or `inBoxes`). */
  unitsPerPack?: number | null
  /** Quantity and rate are per box (units per pack × packs per box); wins over `inPacks`. */
  inBoxes?: boolean
  /** Packs per box of the medicine (needed when `inBoxes`). */
  packsPerBox?: number | null
  isTaxable: boolean
  /** VAT typed for the line; null/undefined = taxable × rate. */
  vatOverride?: number | null
}

export interface PurchaseLineTotals {
  baseQuantity: number
  baseFreeQuantity: number
  /** Rate per base unit (2 dp). */
  baseRate: number
  gross: number
  lineDiscount: number
  billDiscount: number
  taxable: number
  vat: number
  /** taxable + VAT. */
  total: number
  /** Per base unit, free units included. */
  effectiveUnitCost: number
}

export interface PurchaseBillTotals {
  lines: PurchaseLineTotals[]
  gross: number
  lineDiscount: number
  billDiscount: number
  /** lineDiscount + billDiscount. */
  discount: number
  taxable: number
  exempt: number
  vat: number
  /** taxable + exempt + VAT: the supplier's bill (AP). */
  net: number
}

export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0
  const sign = value < 0 ? -1 : 1
  // Scale through a string so 1.005 rounds to 1.01 (half away from zero), not 1.00.
  return (sign * Math.round(Number(`${Math.abs(value)}e2`))) / 100
}

function finite(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

/** A positive amount wins; otherwise the percent of `base`. */
export function amountOrPercent(base: number, mode: DiscountMode, value: number): number {
  const v = finite(value)
  if (v <= 0) return 0
  return mode === "amount" ? round2(v) : round2((base * v) / 100)
}

/**
 * Spreads `billDiscount` over `values` in proportion, in whole paisa (largest remainder). Shares always add
 * back to the discount exactly; a line with no positive value gets nothing.
 */
export function allocateBillDiscount(values: number[], billDiscount: number): number[] {
  const cents = values.map((v) => (v > 0 ? BigInt(Math.round(v * 100)) : BigInt(0)))
  const total = cents.reduce((a, b) => a + b, BigInt(0))
  const discount = BigInt(Math.round(finite(billDiscount) * 100))
  const shares = cents.map(() => BigInt(0))
  if (discount <= BigInt(0) || total <= BigInt(0)) return shares.map(() => 0)

  const remainders = cents.map(() => BigInt(0))
  let allocated = BigInt(0)
  cents.forEach((value, i) => {
    const exact = discount * value
    shares[i] = exact / total
    remainders[i] = exact % total
    allocated += shares[i]
  })

  const order = cents
    .map((value, i) => ({ value, i }))
    .filter((x) => x.value > BigInt(0))
    .sort((a, b) => {
      if (remainders[a.i] !== remainders[b.i]) return remainders[a.i] > remainders[b.i] ? -1 : 1
      if (a.value !== b.value) return a.value > b.value ? -1 : 1
      return a.i - b.i
    })
  for (let k = 0; allocated < discount && k < order.length; k++, allocated++) {
    shares[order[k].i] += BigInt(1)
  }
  return shares.map((s) => Number(s) / 100)
}

/** Units per box (units per pack × packs per box), or 0 when the medicine has no box. */
export function boxSize(line: Pick<PurchaseLineEntry, "unitsPerPack" | "packsPerBox">): number {
  const perPack = line.unitsPerPack ?? 0
  const perBox = line.packsPerBox ?? 0
  return perPack > 0 && perBox > 0 ? perPack * perBox : 0
}

/** Base units per entered unit: the box size when entered in boxes, the pack size when in packs, else 1. */
export function packFactor(line: Pick<PurchaseLineEntry, "inPacks" | "unitsPerPack" | "inBoxes" | "packsPerBox">): number {
  if (line.inBoxes && boxSize(line) > 1) return boxSize(line)
  return line.inPacks && line.unitsPerPack && line.unitsPerPack > 0 ? line.unitsPerPack : 1
}

export function computePurchaseBill(
  entries: PurchaseLineEntry[],
  bill: { discountMode: DiscountMode; discountValue: number },
  vatRatePercent: number,
): PurchaseBillTotals {
  const pre = entries.map((line) => {
    const quantity = Math.max(0, finite(line.quantity))
    const free = Math.max(0, finite(line.freeQuantity))
    const rate = Math.max(0, finite(line.rate))
    const factor = packFactor(line)
    // quantity × rate is the same in packs (packs × pack rate) or units.
    const gross = round2(quantity * rate)
    const lineDiscount = Math.min(gross, amountOrPercent(gross, line.discountMode, line.discountValue))
    return { line, factor, quantity, free, rate, gross, lineDiscount, discounted: gross - lineDiscount }
  })

  const discountedTotal = round2(pre.reduce((s, l) => s + l.discounted, 0))
  const billDiscount = Math.min(discountedTotal, amountOrPercent(discountedTotal, bill.discountMode, bill.discountValue))
  const shares = allocateBillDiscount(
    pre.map((l) => l.discounted),
    billDiscount,
  )

  const lines = pre.map((l, i): PurchaseLineTotals => {
    const taxable = round2(l.discounted - shares[i])
    const override = l.line.vatOverride
    const vat = !l.line.isTaxable
      ? 0
      : override != null && Number.isFinite(override) && override >= 0
        ? round2(override)
        : vatRatePercent > 0
          ? round2((taxable * vatRatePercent) / 100)
          : 0
    const baseQuantity = l.quantity * l.factor
    const baseFreeQuantity = l.free * l.factor
    const units = baseQuantity + baseFreeQuantity
    return {
      baseQuantity,
      baseFreeQuantity,
      baseRate: round2(l.rate / l.factor),
      gross: l.gross,
      lineDiscount: l.lineDiscount,
      billDiscount: shares[i],
      taxable,
      vat,
      total: round2(taxable + vat),
      effectiveUnitCost: units > 0 ? round2(taxable / units) : 0,
    }
  })

  const sum = (pick: (l: PurchaseLineTotals) => number, filter: (l: PurchaseLineTotals, i: number) => boolean = () => true) =>
    round2(lines.filter(filter).reduce((s, l) => s + pick(l), 0))
  const gross = sum((l) => l.gross)
  const lineDiscount = sum((l) => l.lineDiscount)
  const vat = sum((l) => l.vat)
  // A line with VAT is a taxable purchase; one without is exempt (as in the IRD purchase register).
  const taxable = sum((l) => l.taxable, (l) => l.vat > 0)
  const exempt = sum((l) => l.taxable, (l) => l.vat <= 0)
  return {
    lines,
    gross,
    lineDiscount,
    billDiscount,
    discount: round2(lineDiscount + billDiscount),
    taxable,
    exempt,
    vat,
    net: round2(taxable + exempt + vat),
  }
}

/** Server line fields for one entered line (quantities/rate as entered; the server converts packs). */
export function purchaseLineTermsBody(line: PurchaseLineEntry): {
  freeQuantity: number
  discountPercent: number
  discountAmount: number
  inPacks: boolean
  inBoxes: boolean
} {
  const value = Math.max(0, finite(line.discountValue))
  // Boxes win over packs (the server refuses both); a box only when the medicine has one.
  const inBoxes = line.inBoxes === true && boxSize(line) > 1
  return {
    freeQuantity: Math.max(0, finite(line.freeQuantity)),
    discountPercent: line.discountMode === "percent" ? value : 0,
    discountAmount: line.discountMode === "amount" ? round2(value) : 0,
    inPacks: !inBoxes && line.inPacks && packFactor({ ...line, inBoxes: false }) > 1,
    inBoxes,
  }
}

/** Server bill-discount fields. */
export function billDiscountBody(bill: { discountMode: DiscountMode; discountValue: number }): {
  billDiscountPercent: number
  billDiscountAmount: number
} {
  const value = Math.max(0, finite(bill.discountValue))
  return {
    billDiscountPercent: bill.discountMode === "percent" ? value : 0,
    billDiscountAmount: bill.discountMode === "amount" ? round2(value) : 0,
  }
}

/** "10 + 1 free" / "3 box (30 tab)" style quantity text for detail views. */
export function formatPurchaseQuantity(
  quantity: number,
  freeQuantity: number,
  packSize?: number | null,
  unitLabel?: string | null,
): string {
  const fmt = (n: number) => String(Number(n.toFixed(3)))
  const unit = unitLabel?.trim() || "units"
  const paid =
    packSize && packSize > 1
      ? `${fmt(quantity / packSize)} × ${fmt(packSize)} (${fmt(quantity)} ${unit})`
      : fmt(quantity)
  return freeQuantity > 0 ? `${paid} + ${fmt(freeQuantity)} free` : paid
}
