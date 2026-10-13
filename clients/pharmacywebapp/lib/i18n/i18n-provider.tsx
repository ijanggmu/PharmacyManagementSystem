"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
  LOCALE_COOKIE,
  LOCALE_STORAGE_KEY,
  NEPALI_DIGITS_COOKIE,
  NEPALI_DIGITS_STORAGE_KEY,
  PREFERENCE_COOKIE_MAX_AGE,
  isLocale,
  type Locale,
} from "@/lib/i18n/config"
import { formatBsDate as formatBsDatePure, formatNumber as formatNumberPure, localizeDigits } from "@/lib/i18n/format"
import {
  createNamespaceTranslator,
  createTranslator,
  type Namespace,
  type NamespaceTranslator,
  type Translator,
} from "@/lib/i18n/translate"

interface I18nContextValue {
  locale: Locale
  /** Devanagari digits on (only meaningful when locale = "ne"). */
  nepaliDigits: boolean
  setLocale: (locale: Locale) => void
  setNepaliDigits: (on: boolean) => void
  t: Translator
  /** Locale-aware number: Nepali grouping (+ digits) for "ne". */
  formatNumber: (value: number | string, fractionDigits?: number) => string
  /** BS date ("25 Ashwin 2083" / "२५ असोज २०८३") for a Date or "yyyy-MM-dd" / ISO string. */
  formatBsDate: (value: Date | string, withYear?: boolean) => string
  /** Applies the digit preference to an already formatted string (e.g. a money label). */
  localizeDigits: (value: string) => string
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined)

function writeCookie(name: string, value: string): void {
  document.cookie = `${name}=${value}; path=/; max-age=${PREFERENCE_COOKIE_MAX_AGE}; samesite=lax`
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage blocked (private mode): the cookie still carries the choice.
  }
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function I18nProvider({
  initialLocale,
  initialNepaliDigits,
  children,
}: {
  /** From the request cookie (root layout) so the server render is already in the right language. */
  initialLocale: Locale
  initialNepaliDigits: boolean
  children: ReactNode
}) {
  const router = useRouter()
  const [locale, setLocaleState] = useState<Locale>(initialLocale)
  const [nepaliDigits, setNepaliDigitsState] = useState(initialNepaliDigits)

  // The cookie can be cleared while localStorage survives (or vice versa on a new device login):
  // localStorage wins, and the cookie is re-written so the next server render agrees.
  useEffect(() => {
    const stored = readStorage(LOCALE_STORAGE_KEY)
    if (isLocale(stored) && stored !== initialLocale) {
      setLocaleState(stored)
      writeCookie(LOCALE_COOKIE, stored)
      router.refresh()
    } else if (!stored) {
      writeStorage(LOCALE_STORAGE_KEY, initialLocale)
    }
    const digits = readStorage(NEPALI_DIGITS_STORAGE_KEY)
    if ((digits === "0" || digits === "1") && (digits === "1") !== initialNepaliDigits) {
      setNepaliDigitsState(digits === "1")
      writeCookie(NEPALI_DIGITS_COOKIE, digits)
    }
    // Initial values only — later changes go through the setters below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback(
    (next: Locale) => {
      setLocaleState(next)
      writeStorage(LOCALE_STORAGE_KEY, next)
      writeCookie(LOCALE_COOKIE, next)
      // Server Components read the cookie — re-render them in the new language.
      router.refresh()
    },
    [router],
  )

  const setNepaliDigits = useCallback((on: boolean) => {
    setNepaliDigitsState(on)
    writeStorage(NEPALI_DIGITS_STORAGE_KEY, on ? "1" : "0")
    writeCookie(NEPALI_DIGITS_COOKIE, on ? "1" : "0")
  }, [])

  const value = useMemo<I18nContextValue>(() => {
    const display = { locale, nepaliDigits }
    return {
      locale,
      nepaliDigits,
      setLocale,
      setNepaliDigits,
      t: createTranslator(locale),
      formatNumber: (n, fractionDigits) => formatNumberPure(n, { ...display, fractionDigits }),
      formatBsDate: (d, withYear = true) => formatBsDatePure(d, { ...display, withYear }),
      localizeDigits: (s) => localizeDigits(s, display),
    }
  }, [locale, nepaliDigits, setLocale, setNepaliDigits])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)
  if (!context) throw new Error("useI18n must be used within an I18nProvider")
  return context
}

/** Translator scoped to one namespace: `const t = useTranslations("pos"); t("cart.title")`. */
export function useTranslations<N extends Namespace>(namespace: N): NamespaceTranslator<N> {
  const { locale } = useI18n()
  return useMemo(() => createNamespaceTranslator(locale, namespace), [locale, namespace])
}
