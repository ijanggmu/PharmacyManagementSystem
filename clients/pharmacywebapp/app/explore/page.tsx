import type { Metadata } from "next"
import { cookies } from "next/headers"
import { ExplorePage } from "@/features/appointments/components/explore-page"
import { I18nProvider } from "@/lib/i18n/i18n-provider"
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/config"
import { getLocalePreferences } from "@/lib/i18n/server"

export const metadata: Metadata = {
  title: "Find a doctor and book a token",
  description:
    "See which doctors sit at pharmacies near you, their fee and their next open day, and book a token online. Pay the fee at the pharmacy.",
}

/**
 * Public "Find a doctor" page (no sign-in): doctors of every pharmacy that chose to be listed. Unlike /book it is
 * meant to be found, so it is indexed. Opens in Nepali unless this visitor already chose a language.
 */
export default async function ExploreRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { q, speciality, day } = await searchParams
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : null)
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value
  const { nepaliDigits } = await getLocalePreferences()
  return (
    <I18nProvider initialLocale={isLocale(saved) ? saved : "ne"} initialNepaliDigits={nepaliDigits}>
      <ExplorePage initial={{ q: one(q), speciality: one(speciality), day: one(day) }} />
    </I18nProvider>
  )
}
