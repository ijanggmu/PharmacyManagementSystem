import { redirect } from "next/navigation"
import { legacyRedirectUrl, type IncomingSearchParams } from "@/features/accounting/lib/accounting-views"

/**
 * Opening balances now live on Accounting › Finance setup. The tab there is shown only with
 * settings:write (the same check the sidebar applied to this page); without it the page falls
 * back to the chart of accounts, and the migration endpoints stay server-enforced either way.
 */
export default async function OpeningBalancesRedirectPage({ searchParams }: { searchParams: Promise<IncomingSearchParams> }) {
  redirect(legacyRedirectUrl("opening-balances", await searchParams))
}
