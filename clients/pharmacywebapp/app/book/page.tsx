import type { Metadata } from "next"
import { cookies } from "next/headers"
import { OnlineBookingPage } from "@/features/appointments/components/online-booking-page"
import { I18nProvider } from "@/lib/i18n/i18n-provider"
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/config"
import { getLocalePreferences } from "@/lib/i18n/server"

export const metadata: Metadata = {
  title: "Book a doctor's token",
  robots: { index: false, follow: false },
}

/**
 * Public booking page (no sign-in): /book?code=<pharmacy code>, or /book on the pharmacy's own address. Patients
 * here mostly read Nepali, so it opens in Nepali unless this visitor already chose a language.
 */
export default async function BookPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { code, doctor, from } = await searchParams
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value
  const { nepaliDigits } = await getLocalePreferences()
  return (
    <I18nProvider initialLocale={isLocale(saved) ? saved : "ne"} initialNepaliDigits={nepaliDigits}>
      <OnlineBookingPage
        code={typeof code === "string" && code.trim() ? code.trim().toLowerCase() : null}
        doctorId={typeof doctor === "string" ? doctor : null}
        fromExplore={from === "explore"}
      />
    </I18nProvider>
  )
}
