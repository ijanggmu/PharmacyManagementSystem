import { redirect } from "next/navigation"
import { refundsRedirectHref } from "@/features/returns/lib/returns-view"

/** Refunds now live as a tab on the merged Returns & refunds page. */
export default async function RefundsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  redirect(refundsRedirectHref(await searchParams))
}
