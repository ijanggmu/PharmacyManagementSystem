// Server Components / route handlers only (next/headers).
import { cookies } from "next/headers"
import { LOCALE_COOKIE, NEPALI_DIGITS_COOKIE, parseLocale, parseNepaliDigits, type Locale } from "@/lib/i18n/config"
import { createNamespaceTranslator, type Namespace, type NamespaceTranslator } from "@/lib/i18n/translate"

export interface LocalePreferences {
  locale: Locale
  nepaliDigits: boolean
}

/** The visitor's language preferences from the request cookies — lets SSR render the right language. */
export async function getLocalePreferences(): Promise<LocalePreferences> {
  const store = await cookies()
  return {
    locale: parseLocale(store.get(LOCALE_COOKIE)?.value),
    nepaliDigits: parseNepaliDigits(store.get(NEPALI_DIGITS_COOKIE)?.value),
  }
}

/** Translator for Server Components: `const t = await getTranslations("nav")`. */
export async function getTranslations<N extends Namespace>(namespace: N): Promise<NamespaceTranslator<N>> {
  const { locale } = await getLocalePreferences()
  return createNamespaceTranslator(locale, namespace)
}
