/** Pure helpers for the public "Find a doctor" page: search, speciality chips and the day filter. */

import type { ExploreDoctor, ExploreSitting } from "@/features/appointments/explore-api"

export type ExploreDay = "all" | "today" | "tomorrow" | "week"

export interface ExploreFilter {
  text: string
  /** A key from {@link specialityChips}, or null for every speciality. */
  speciality: string | null
  day: ExploreDay
  /** Today in Nepal, yyyy-MM-dd. */
  today: string
}

/** Lower case, single spaces: "General  Physician " and "general physician" are the same speciality. */
export function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

export function addDaysYmd(ymd: string, days: number): string {
  const date = new Date(`${ymd}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Whether a sitting falls on the chosen day: today, tomorrow, or within the 7 days from today. */
export function onDay(date: string, day: ExploreDay, today: string): boolean {
  switch (day) {
    case "all":
      return true
    case "today":
      return date === today
    case "tomorrow":
      return date === addDaysYmd(today, 1)
    case "week":
      return date >= today && date <= addDaysYmd(today, 6)
  }
}

/** The first sitting with a place left on the chosen day, or null when every one is full. */
export function nextOpenSitting(doctor: ExploreDoctor, day: ExploreDay, today: string): ExploreSitting | null {
  return doctor.sittings.find((s) => s.placesLeft > 0 && onDay(s.date, day, today)) ?? null
}

/** One chip per speciality, spelled as most pharmacies spell it, the commonest first. */
export function specialityChips(doctors: readonly ExploreDoctor[]): { key: string; label: string }[] {
  const byKey = new Map<string, { count: number; spellings: Map<string, number> }>()
  for (const d of doctors) {
    if (!d.speciality) continue
    const key = normalizeText(d.speciality)
    const entry = byKey.get(key) ?? { count: 0, spellings: new Map<string, number>() }
    entry.count += 1
    entry.spellings.set(d.speciality, (entry.spellings.get(d.speciality) ?? 0) + 1)
    byKey.set(key, entry)
  }
  return [...byKey.entries()]
    .map(([key, { count, spellings }]) => ({
      key,
      count,
      label: [...spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .map(({ key, label }) => ({ key, label }))
}

/**
 * The doctors to show: every word typed must appear in the doctor's name, speciality, pharmacy, or a branch name or
 * address; the speciality must match the chip; and with a day chosen, the doctor must have a place left that day.
 */
export function filterExplore(doctors: readonly ExploreDoctor[], filter: ExploreFilter): ExploreDoctor[] {
  const words = normalizeText(filter.text).split(" ").filter(Boolean)
  return doctors.filter((d) => {
    if (filter.speciality && (!d.speciality || normalizeText(d.speciality) !== filter.speciality)) return false
    if (filter.day !== "all" && nextOpenSitting(d, filter.day, filter.today) === null) return false
    if (words.length === 0) return true
    const haystack = normalizeText(
      [d.name, d.speciality, d.pharmacyName, ...d.sittings.flatMap((s) => [s.branchName, s.branchAddress])]
        .filter(Boolean)
        .join(" "),
    )
    return words.every((w) => haystack.includes(w))
  })
}
