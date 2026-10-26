import { describe, expect, it } from "vitest"
import {
  addDaysYmd,
  dayOfWeekYmd,
  formatTime12,
  formatTimeRange,
  previewDoctorShare,
  timetableGrid,
  weekDates,
  weekStartYmd,
  weeklySlotProblems,
} from "@/features/appointments/lib/timetable"
import type { TimetableSession, WeeklySlotInput } from "@/features/appointments/api-client"

const session = (over: Partial<TimetableSession>): TimetableSession => ({
  doctorId: "d1",
  doctorName: "Dr. A",
  speciality: null,
  branchId: "b1",
  date: "2026-11-01",
  startTime: "16:00",
  endTime: "19:00",
  maxTokens: 20,
  isExtraDay: false,
  ...over,
})

const slot = (over: Partial<WeeklySlotInput>): WeeklySlotInput => ({
  branchId: "b1",
  dayOfWeek: 0,
  startTime: "16:00",
  endTime: "19:00",
  maxTokens: 20,
  ...over,
})

describe("timetable dates", () => {
  it("adds days across month and year ends", () => {
    expect(addDaysYmd("2026-11-30", 1)).toBe("2026-12-01")
    expect(addDaysYmd("2026-12-31", 1)).toBe("2027-01-01")
    expect(addDaysYmd("2026-03-01", -1)).toBe("2026-02-28")
  })

  it("starts the week on Sunday", () => {
    expect(dayOfWeekYmd("2026-11-01")).toBe(0)
    expect(weekStartYmd("2026-11-04")).toBe("2026-11-01")
    expect(weekStartYmd("2026-11-01")).toBe("2026-11-01")
    expect(weekStartYmd("2026-11-07")).toBe("2026-11-01")
    expect(weekDates("2026-11-01")).toEqual([
      "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07",
    ])
  })

  it("shows times on a 12-hour clock", () => {
    expect(formatTime12("16:30")).toBe("4:30 pm")
    expect(formatTime12("00:05")).toBe("12:05 am")
    expect(formatTime12("12:00")).toBe("12:00 pm")
    expect(formatTime12("09:00")).toBe("9:00 am")
  })

  it("shortens a time range that stays on one side of noon", () => {
    expect(formatTimeRange("16:00", "19:00")).toBe("4:00–7:00 pm")
    expect(formatTimeRange("09:00", "13:00")).toBe("9:00 am–1:00 pm")
  })
})

describe("timetableGrid", () => {
  it("makes one row per doctor with that doctor's sittings under each date", () => {
    const dates = weekDates("2026-11-01")
    const grid = timetableGrid(
      [
        session({ doctorId: "d2", doctorName: "Dr. Z", date: "2026-11-02" }),
        session({ date: "2026-11-01", startTime: "16:00" }),
        session({ date: "2026-11-01", startTime: "08:00", endTime: "10:00" }),
      ],
      dates,
    )

    expect(grid.map((r) => r.doctorName)).toEqual(["Dr. A", "Dr. Z"])
    expect(grid[0].cells).toHaveLength(7)
    expect(grid[0].cells[0].sessions.map((s) => s.startTime)).toEqual(["08:00", "16:00"])
    expect(grid[0].cells[1].sessions).toEqual([])
    expect(grid[1].cells[1].sessions).toHaveLength(1)
  })
})

describe("previewDoctorShare", () => {
  it("is a percent of the fee or a fixed amount capped at the fee", () => {
    expect(previewDoctorShare(500, "Percent", 80)).toBe(400)
    expect(previewDoctorShare(333, "Percent", 33.33)).toBe(110.99)
    expect(previewDoctorShare(500, "Fixed", 400)).toBe(400)
    expect(previewDoctorShare(300, "Fixed", 400)).toBe(300)
    expect(previewDoctorShare(Number.NaN, "Percent", 50)).toBe(0)
  })
})

describe("weeklySlotProblems", () => {
  it("flags rows that are incomplete or have the end before the start", () => {
    const { invalidRows } = weeklySlotProblems([
      slot({}),
      slot({ branchId: "" }),
      slot({ endTime: "15:00" }),
      slot({ maxTokens: 0 }),
    ])
    expect(invalidRows).toEqual([1, 2, 3])
  })

  it("flags sittings that overlap on the same day, but not back-to-back ones", () => {
    expect(weeklySlotProblems([slot({ startTime: "08:00", endTime: "10:00" }), slot({ startTime: "10:00", endTime: "12:00" })]).overlappingRows).toEqual([])
    expect(weeklySlotProblems([slot({ startTime: "08:00", endTime: "11:00" }), slot({ startTime: "10:00", endTime: "12:00" })]).overlappingRows).toEqual([0, 1])
    expect(weeklySlotProblems([slot({ dayOfWeek: 0 }), slot({ dayOfWeek: 1 })]).overlappingRows).toEqual([])
  })
})
