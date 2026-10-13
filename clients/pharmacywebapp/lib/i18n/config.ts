// Shared by the server root layout and the client I18nProvider — a plain module (no "use client").

export const LOCALES = ["en", "ne"] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = "en"

/** Cookie (read by the server for SSR) and localStorage key (survives cookie clearing) for the language. */
export const LOCALE_COOKIE = "pharmacare_locale"
export const LOCALE_STORAGE_KEY = "pharmacare.locale"

/** "1" = show Devanagari digits (०१२…) when the language is Nepali; "0" = keep 0-9. Default on. */
export const NEPALI_DIGITS_COOKIE = "pharmacare_ne_digits"
export const NEPALI_DIGITS_STORAGE_KEY = "pharmacare.ne-digits"

/** One year — a preference, not a session. */
export const PREFERENCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ne: "नेपाली",
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value)
}

export function parseLocale(value: string | null | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE
}

export function parseNepaliDigits(value: string | null | undefined): boolean {
  return value !== "0"
}
