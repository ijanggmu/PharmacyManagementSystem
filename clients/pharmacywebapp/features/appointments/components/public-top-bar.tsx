"use client"

import Link from "next/link"
import { BrandMark } from "@/components/brand/brand-mark"
import { cn } from "@/lib/utils"
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n/config"
import { useI18n } from "@/lib/i18n/i18n-provider"

/** The thin bar on the patients' public pages (Find a doctor, booking): the PharmaCare mark (home) and the language switch. */
export function PublicTopBar() {
  return (
    <div className="border-b bg-background">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-4">
        <Link
          href="/"
          className="flex min-h-11 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <BrandMark className="size-7" />
          <span className="font-display text-base font-bold tracking-tight">PharmaCare</span>
        </Link>
        <LanguageButtons />
      </div>
    </div>
  )
}

function LanguageButtons() {
  const { locale, setLocale } = useI18n()
  return (
    <div className="flex shrink-0 rounded-lg border p-0.5" role="group" aria-label="Language / भाषा">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={locale === l}
          onClick={() => setLocale(l)}
          className={cn(
            "min-h-9 cursor-pointer rounded-md px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            locale === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {LOCALE_LABELS[l]}
        </button>
      ))}
    </div>
  )
}
