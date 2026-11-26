import { redirect } from "next/navigation"
import { ACCOUNTING_BASE, buildRedirectUrl, type IncomingSearchParams } from "@/features/accounting/lib/accounting-views"

/** The standalone IRD page duplicated Money › Tax & IRD › IRD reports; old links land on that tab. */
export default async function IrdReportsRedirectPage({ searchParams }: { searchParams: Promise<IncomingSearchParams> }) {
  redirect(buildRedirectUrl(`${ACCOUNTING_BASE}/vat`, "ird", await searchParams))
}
