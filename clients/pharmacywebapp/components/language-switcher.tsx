"use client"

import { Languages } from "lucide-react"
import {
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { LOCALES, LOCALE_LABELS, isLocale } from "@/lib/i18n/config"
import { useI18n, useTranslations } from "@/lib/i18n/i18n-provider"

/** "Language" submenu for the header user menu: English / नेपाली + the Nepali-digit toggle. */
export function LanguageMenuSub() {
  const { locale, setLocale, nepaliDigits, setNepaliDigits } = useI18n()
  const t = useTranslations("common")
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Languages className="mr-2 size-4" />
        {t("language.label")}
        <span className="ml-auto pl-2 text-xs text-muted-foreground">{LOCALE_LABELS[locale]}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-56">
        <DropdownMenuRadioGroup value={locale} onValueChange={(v) => isLocale(v) && setLocale(v)}>
          {LOCALES.map((l) => (
            <DropdownMenuRadioItem key={l} value={l} lang={l}>
              {LOCALE_LABELS[l]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {locale === "ne" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked={nepaliDigits} onCheckedChange={(on) => setNepaliDigits(on === true)}>
              {t("language.nepaliDigits")}
            </DropdownMenuCheckboxItem>
          </>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

/** Profile page card: the same preferences with room for an explanation. */
export function LanguageSettingsCard() {
  const { locale, setLocale, nepaliDigits, setNepaliDigits } = useI18n()
  const t = useTranslations("common")
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-base">{t("language.title")}</CardTitle>
        <CardDescription>{t("language.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div role="radiogroup" aria-label={t("language.label")} className="inline-flex rounded-lg border border-border p-0.5">
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              lang={l}
              aria-checked={locale === l}
              onClick={() => setLocale(l)}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                locale === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {LOCALE_LABELS[l]}
            </button>
          ))}
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="nepali-digits">{t("language.nepaliDigits")}</Label>
            <p className="text-xs text-muted-foreground">{t("language.nepaliDigitsHint")}</p>
          </div>
          <Switch id="nepali-digits" checked={nepaliDigits} onCheckedChange={setNepaliDigits} disabled={locale !== "ne"} />
        </div>
      </CardContent>
    </Card>
  )
}
