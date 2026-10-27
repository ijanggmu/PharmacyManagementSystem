"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { CalendarDays, ClipboardList, Stethoscope, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTranslations } from "@/lib/i18n/i18n-provider"

const TABS: { key: "today" | "timetable" | "doctors"; href: string; icon: LucideIcon }[] = [
  { key: "today", href: "/dashboard/appointments", icon: ClipboardList },
  { key: "timetable", href: "/dashboard/appointments/timetable", icon: CalendarDays },
  { key: "doctors", href: "/dashboard/doctors", icon: Stethoscope },
]

/**
 * The doctors' pages as tabs under the one "Appointments" menu item: Today (the desk) · Timetable · Doctors.
 * Each tab is its own page and address, so these are links (the current one marked), not a client tab state.
 * Tabs the user may not open are left out; with only one left the bar isn't shown.
 */
export function AppointmentsTabs({ show }: { show: { today: boolean; timetable: boolean; doctors: boolean } }) {
  const t = useTranslations("appointments")
  const pathname = usePathname()
  const tabs = TABS.filter((tab) => show[tab.key])
  if (tabs.length < 2) return null
  const active = [...tabs].sort((a, b) => b.href.length - a.href.length).find((tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`))

  return (
    <nav aria-label={t("tabs.label")} className="-mx-1 mb-5 overflow-x-auto px-1">
      <ul className="inline-flex min-w-max gap-1 rounded-lg bg-muted p-1">
        {tabs.map((tab) => {
          const current = tab === active
          return (
            <li key={tab.key}>
              <Link
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-md px-3.5 text-sm font-medium transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  current ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <tab.icon className={cn("size-4", current ? "text-primary" : "")} aria-hidden />
                {t(`tabs.${tab.key}`)}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
