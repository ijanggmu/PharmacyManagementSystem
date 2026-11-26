import { redirect } from "next/navigation"

/** Old Buying › "Expiry claims" route: now the Supplier claims tab of Stock › Expiry (features/expiry-claims/components/expiry-claims-panel.tsx). */
export default function ExpiryClaimsRedirect(): never {
  redirect("/dashboard/inventory/expiry?tab=claims")
}
