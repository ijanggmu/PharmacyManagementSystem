import { redirect } from "next/navigation"

/** Old "Expiry & recalls" route: now the Expired tab of Stock › Expiry (moved to features/inventory/components/expired-stock-panel.tsx). */
export default function ExpiredStockRedirect(): never {
  redirect("/dashboard/inventory/expiry?tab=expired")
}
