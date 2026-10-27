import { describe, expect, it } from "vitest"
import {
  buildBookingPosterHtml,
  normalizeNepaliMobile,
  onlineBookingLink,
  showsBranches,
  sittingsByDate,
} from "@/features/appointments/lib/online-booking"
import type { OnlineSitting } from "@/features/appointments/online-api"

const sitting = (over: Partial<OnlineSitting>): OnlineSitting => ({
  doctorId: "d1",
  branchId: "b1",
  branchName: "Main",
  date: "2026-11-01",
  startTime: "16:00",
  endTime: "19:00",
  placesLeft: 3,
  ...over,
})

describe("normalizeNepaliMobile", () => {
  it.each([
    ["9812345678", "9812345678"],
    [" 981-234-5678 ", "9812345678"],
    ["+977 9801234567", "9801234567"],
    ["9779741234567", "9741234567"],
    ["00977 (976) 123 4567", "9761234567"],
  ])("accepts %s", (input, expected) => {
    expect(normalizeNepaliMobile(input)).toBe(expected)
  })

  it.each(["981234567", "98123456789", "9512345678", "014412345", "98123x5678", "98+12345678", ""])("refuses %s", (input) => {
    expect(normalizeNepaliMobile(input)).toBeNull()
  })
})

describe("onlineBookingLink", () => {
  it("puts the pharmacy code on the booking page", () => {
    expect(onlineBookingLink("https://app.example.com/", "shree pharmacy")).toBe("https://app.example.com/book?code=shree%20pharmacy")
  })
})

describe("sittingsByDate", () => {
  it("groups one doctor's sittings by date in date and time order", () => {
    const days = sittingsByDate(
      [
        sitting({ date: "2026-11-08" }),
        sitting({ date: "2026-11-01", startTime: "16:00" }),
        sitting({ doctorId: "d2" }),
        sitting({ date: "2026-11-01", startTime: "08:00", endTime: "10:00" }),
      ],
      "d1",
    )
    expect(days.map((d) => [d.date, d.sittings.map((s) => s.startTime)])).toEqual([
      ["2026-11-01", ["08:00", "16:00"]],
      ["2026-11-08", ["16:00"]],
    ])
  })
})

describe("showsBranches", () => {
  it("names the branch only when there is more than one", () => {
    expect(showsBranches([sitting({}), sitting({ date: "2026-11-02" })])).toBe(false)
    expect(showsBranches([sitting({}), sitting({ branchId: "b2" })])).toBe(true)
  })
})

describe("buildBookingPosterHtml", () => {
  it("escapes everything it prints", () => {
    const html = buildBookingPosterHtml({
      pharmacyName: "<b>Shree</b>",
      title: "Book",
      hint: "Scan",
      link: "https://x/book?code=a&b",
      qrDataUrl: "data:image/png;base64,AAA",
    })
    expect(html).toContain("&lt;b&gt;Shree&lt;/b&gt;")
    expect(html).toContain("code=a&amp;b")
    expect(html).not.toContain("<b>Shree")
  })
})
