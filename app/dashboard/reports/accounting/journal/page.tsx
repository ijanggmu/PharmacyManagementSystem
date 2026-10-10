import { redirect } from "next/navigation"
import { legacyRedirectUrl, type IncomingSearchParams } from "@/features/accounting/lib/accounting-views"

/** Merged into a tabbed page; old links land on the matching tab with their query string. */
export default async function JournalRedirectPage({ searchParams }: { searchParams: Promise<IncomingSearchParams> }) {
  redirect(legacyRedirectUrl("journal", await searchParams))
}
