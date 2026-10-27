import { describe, expect, it } from "vitest"
import type { ExploreDoctor, ExploreSitting } from "@/features/appointments/explore-api"
import { addDaysYmd, filterExplore, nextOpenSitting, onDay, specialityChips } from "@/features/appointments/lib/explore"

const TODAY = "2026-11-01"

const sitting = (over: Partial<ExploreSitting> = {}): ExploreSitting => ({
  date: TODAY,
  startTime: "16:00",
  endTime: "19:00",
  branchName: "Main Branch",
  branchAddress: "New Road, Kathmandu",
  placesLeft: 3,
  ...over,
})

const doctor = (over: Partial<ExploreDoctor> = {}): ExploreDoctor => ({
  pharmacyCode: "shree",
  pharmacyName: "Shree Pharmacy",
  doctorId: "d1",
  name: "Dr. Ram Sharma",
  speciality: "General physician",
  fee: 500,
  sittings: [sitting()],
  ...over,
})

const all = { text: "", speciality: null, day: "all" as const, today: TODAY }

describe("onDay", () => {
  it("matches today, tomorrow and the coming 7 days", () => {
    expect(onDay(TODAY, "today", TODAY)).toBe(true)
    expect(onDay("2026-11-02", "today", TODAY)).toBe(false)
    expect(onDay("2026-11-02", "tomorrow", TODAY)).toBe(true)
    expect(onDay("2026-11-07", "week", TODAY)).toBe(true)
    expect(onDay("2026-11-08", "week", TODAY)).toBe(false)
    expect(addDaysYmd("2026-12-31", 1)).toBe("2027-01-01")
  })
})

describe("nextOpenSitting", () => {
  it("skips full sittings and keeps to the chosen day", () => {
    const d = doctor({ sittings: [sitting({ placesLeft: 0 }), sitting({ date: "2026-11-04", placesLeft: 2 })] })
    expect(nextOpenSitting(d, "all", TODAY)?.date).toBe("2026-11-04")
    expect(nextOpenSitting(d, "today", TODAY)).toBeNull()
  })
})

describe("specialityChips", () => {
  it("merges spellings that differ only in case or spaces, commonest first", () => {
    const chips = specialityChips([
      doctor({ speciality: "Dentist" }),
      doctor({ speciality: "General physician" }),
      doctor({ speciality: "general  Physician" }),
      doctor({ speciality: "General physician" }),
      doctor({ speciality: null }),
    ])
    expect(chips).toEqual([
      { key: "general physician", label: "General physician" },
      { key: "dentist", label: "Dentist" },
    ])
  })
})

describe("filterExplore", () => {
  const ram = doctor()
  const sita = doctor({
    doctorId: "d2",
    name: "Dr. Sita KC",
    speciality: "Dentist",
    pharmacyName: "Lifeline Pharmacy",
    sittings: [sitting({ date: "2026-11-02", branchName: "Lalitpur Branch", branchAddress: "Pulchowk, Lalitpur" })],
  })

  it("finds by doctor, speciality, pharmacy or area, every word typed", () => {
    expect(filterExplore([ram, sita], { ...all, text: "sharma" })).toEqual([ram])
    expect(filterExplore([ram, sita], { ...all, text: "DENTIST" })).toEqual([sita])
    expect(filterExplore([ram, sita], { ...all, text: "lifeline" })).toEqual([sita])
    expect(filterExplore([ram, sita], { ...all, text: "pulchowk" })).toEqual([sita])
    expect(filterExplore([ram, sita], { ...all, text: "sita kathmandu" })).toEqual([])
    expect(filterExplore([ram, sita], { ...all, text: "  " })).toEqual([ram, sita])
  })

  it("keeps to the chosen speciality and day", () => {
    expect(filterExplore([ram, sita], { ...all, speciality: "dentist" })).toEqual([sita])
    expect(filterExplore([ram, sita], { ...all, day: "today" })).toEqual([ram])
    expect(filterExplore([ram, sita], { ...all, day: "tomorrow" })).toEqual([sita])
  })

  it("drops a doctor whose only sitting that day is full", () => {
    const full = doctor({ sittings: [sitting({ placesLeft: 0 })] })
    expect(filterExplore([full], { ...all, day: "today" })).toEqual([])
    expect(filterExplore([full], all)).toEqual([full])
  })
})
