"use client"

import { useMemo } from "react"
import { useTranslations } from "@/lib/i18n/i18n-provider"

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const

/** Day names by the API's DayOfWeek (0 = Sunday), long and short, in the user's language. */
export function useDayNames() {
  const t = useTranslations("appointments")
  return useMemo(
    () => ({
      long: DAY_KEYS.map((k) => t(`days.${k}`)),
      short: DAY_KEYS.map((k) => t(`days.${k}Short`)),
    }),
    [t],
  )
}
