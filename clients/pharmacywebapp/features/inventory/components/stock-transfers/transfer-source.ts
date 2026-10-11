import type { Medicine } from "@/features/medicines/api-client"

/**
 * Available stock to send from the current branch. A transfer never moves expired or recalled lots, so the
 * branch's sellable figure is preferred; then its on-hand; then the all-branch figures when the API reports
 * no branch.
 */
export function availableStock(
  medicine:
    | Pick<Medicine, "stock_quantity" | "branch_stock_quantity" | "sellable_stock_quantity" | "branch_sellable_stock_quantity">
    | undefined,
): number | undefined {
  if (!medicine) return undefined
  return (
    medicine.branch_sellable_stock_quantity ??
    medicine.branch_stock_quantity ??
    medicine.sellable_stock_quantity ??
    medicine.stock_quantity
  )
}

/**
 * The branch a transfer leaves from. The API dispatches from the caller's CURRENT branch and rejects any
 * other source (the BFF does not forward an X-Branch-Id override), so the source is always the current
 * branch — users who can see every branch switch their current branch to send from another one.
 */
export function transferSourceBranchId(branchAccess: { ownBranchId?: string | null }): string {
  return branchAccess.ownBranchId ?? ""
}
