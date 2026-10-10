/**
 * Input VAT on stock bought from a supplier. Cost prices are entered excluding VAT (the bill's taxable
 * value), so VAT = quantity × cost × rate / 100 for a taxable medicine and 0 for an exempt one. The rate
 * is the pharmacy's VAT rate from Settings — the same rate sales charge — so purchase and sales VAT stay
 * on one setting. The suggestion is only a default: a supplier bill can show a different VAT figure
 * (rounding, mixed rates), so the user may overwrite it for taxable lines.
 */
export function suggestedPurchaseVat(
  quantity: number,
  unitCost: number,
  vatRatePercent: number,
  isTaxable: boolean,
): number {
  if (!isTaxable || !(vatRatePercent > 0) || !(quantity > 0) || !(unitCost > 0)) return 0
  return Math.round(quantity * unitCost * vatRatePercent) / 100
}

/**
 * The VAT that is actually sent for a line: exempt medicines never carry input VAT (whatever was typed),
 * an explicitly entered amount wins for taxable ones, otherwise the suggestion.
 */
export function effectivePurchaseVat(
  quantity: number,
  unitCost: number,
  vatRatePercent: number,
  isTaxable: boolean,
  enteredVat: number | null | undefined,
): number {
  if (!isTaxable) return 0
  if (enteredVat != null && Number.isFinite(enteredVat) && enteredVat >= 0) return Math.round(enteredVat * 100) / 100
  return suggestedPurchaseVat(quantity, unitCost, vatRatePercent, isTaxable)
}

/** "13%" / "12.5%" for hints. */
export function formatRate(vatRatePercent: number): string {
  return `${Number(vatRatePercent.toFixed(2))}%`
}
