/**
 * Pure money helpers for the POS payment dialog. Everything that decides "is this bill covered?"
 * works in paisa (integer 1/100 rupee) so float drift such as 44.099999 can never block or
 * mis-balance a sale.
 */

/** Rupees → integer paisa. Non-finite input is treated as 0. */
export function toPaisa(amount: number): number {
  if (!Number.isFinite(amount)) return 0
  // Nudge by EPSILON in the sign's direction so 1.005 → 101 (not 100) and -1.005 → -101.
  return Math.round(amount * 100 + Math.sign(amount) * 1e-7) || 0
}

/** Integer paisa → rupees (2 decimals, exact for display). */
export function fromPaisa(paisa: number): number {
  return Math.round(paisa) / 100
}

/** Rounds a rupee amount to whole paisa. */
export function roundMoney(amount: number): number {
  return fromPaisa(toPaisa(amount))
}

/**
 * Parses a money text input: accepts "44.1", "1,250.50", "" → 0. Negative or invalid input → 0.
 * Always returns a value rounded to paisa.
 */
export function parseMoneyInput(raw: string): number {
  const cleaned = raw.replace(/[,\s]/g, "")
  if (cleaned === "") return 0
  const n = Number.parseFloat(cleaned)
  if (!Number.isFinite(n) || n <= 0) return 0
  return roundMoney(n)
}

export interface MoneyLeg {
  method: string
  amount: number
  /** Cash handed over by the customer (cash legs only). Display-only: never recorded as payment. */
  tendered?: number
}

export interface PaymentSummary {
  duePaisa: number
  receivedPaisa: number
  /** due − received; positive means still to collect, negative means legs exceed the bill. */
  remainingPaisa: number
  /** Cash to hand back: Σ over cash legs of max(0, tendered − amount). */
  changePaisa: number
  /** True when legs add up to the bill exactly and every leg has a positive amount. */
  balanced: boolean
  /** True when at least one leg has no amount yet. */
  hasEmptyLeg: boolean
}

export function summarizePayments(total: number, legs: readonly MoneyLeg[]): PaymentSummary {
  const duePaisa = toPaisa(total)
  let receivedPaisa = 0
  let changePaisa = 0
  let hasEmptyLeg = false
  for (const leg of legs) {
    const amountPaisa = toPaisa(leg.amount)
    if (amountPaisa <= 0) hasEmptyLeg = true
    receivedPaisa += Math.max(0, amountPaisa)
    if (leg.method === "cash" && leg.tendered !== undefined) {
      changePaisa += Math.max(0, toPaisa(leg.tendered) - amountPaisa)
    }
  }
  const remainingPaisa = duePaisa - receivedPaisa
  return {
    duePaisa,
    receivedPaisa,
    remainingPaisa,
    changePaisa,
    balanced: remainingPaisa === 0 && !hasEmptyLeg && legs.length > 0,
    hasEmptyLeg,
  }
}

/**
 * The amount a new or "Remaining"-filled leg should take: what the other legs leave uncovered,
 * never negative. `excludeIndex` is the leg being filled (its own amount is ignored).
 */
export function remainingFor(total: number, legs: readonly MoneyLeg[], excludeIndex?: number): number {
  const others = legs.reduce((sum, leg, i) => (i === excludeIndex ? sum : sum + Math.max(0, toPaisa(leg.amount))), 0)
  return fromPaisa(Math.max(0, toPaisa(total) - others))
}

const NOTE_STEPS = [10, 50, 100, 500, 1000] as const

/**
 * Quick-tender buttons for a cash amount: the exact amount, then the next round figure at each
 * note step (10/50/100/500/1000) at or above it. Duplicates are dropped and the list is sorted, so
 * a bill that is already a round figure (रू500) just offers [500, 1000].
 */
export function cashNoteSuggestions(amount: number, max = 5): number[] {
  const paisa = toPaisa(amount)
  if (paisa <= 0) return []
  const out = new Set<number>([paisa])
  for (const step of NOTE_STEPS) {
    const stepPaisa = step * 100
    out.add(Math.ceil(paisa / stepPaisa) * stepPaisa)
  }
  return [...out]
    .sort((a, b) => a - b)
    .slice(0, max)
    .map(fromPaisa)
}
