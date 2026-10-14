"use client"

import { Home, ShieldAlert } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { useTranslations } from "@/lib/i18n/i18n-provider"

/**
 * Shown by the dashboard shell in place of a page the user's permissions don't cover (a typed or
 * bookmarked URL). Presentation only — the backend's 403 remains the real gate.
 */
export function AccessDenied() {
  const t = useTranslations("common")
  return (
    <EmptyState
      icon={ShieldAlert}
      title={t("accessDenied.title")}
      description={t("accessDenied.description")}
      action={{ label: t("accessDenied.backToDashboard"), href: "/dashboard", icon: Home }}
    />
  )
}
