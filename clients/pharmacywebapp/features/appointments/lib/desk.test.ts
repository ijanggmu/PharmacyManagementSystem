import { describe, expect, it } from "vitest"
import type { TimetableSession } from "@/features/appointments/api-client"
import {
  bookableSittings,
  buildTokenSlipHtml,
  nepalTimeHHmm,
  placesLeft,
  prescriptionHref,
  tokenActions,
} from "@/features/appointments/lib/desk"

const sitting = (over: Partial<TimetableSession>): TimetableSession => ({
  doctorId: "d1",
  doctorName: "Dr. A",
  speciality: null,
  branchId: "b1",
  date: "2026-11-01",
  startTime: "16:00",
  endTime: "19:00",
  maxTokens: 20,
  isExtraDay: false,
  booked: 0,
  ...over,
})

describe("nepalTimeHHmm", () => {
  it("is UTC plus 5:45, wrapping past midnight", () => {
    expect(nepalTimeHHmm(new Date("2026-11-01T06:00:00Z"))).toBe("11:45")
    expect(nepalTimeHHmm(new Date("2026-11-01T18:30:00Z"))).toBe("00:15")
  })
})

describe("bookableSittings", () => {
  it("keeps the doctor's sittings that are not over and not full, soonest first", () => {
    const result = bookableSittings(
      [
        sitting({ date: "2026-11-04" }),
        sitting({ date: "2026-11-01", startTime: "08:00", endTime: "10:00" }),
        sitting({ date: "2026-11-01" }),
        sitting({ date: "2026-11-02", booked: 20 }),
        sitting({ doctorId: "d2", date: "2026-11-01" }),
      ],
      "d1",
      "2026-11-01",
      "11:45",
    )
    expect(result.map((s) => `${s.date} ${s.startTime}`)).toEqual(["2026-11-01 16:00", "2026-11-04 16:00"])
  })
})

describe("tokenActions", () => {
  const desk = { canCheckIn: true }

  it("offers what the token's status allows", () => {
    expect(tokenActions({ status: "Booked", payoutId: null }, desk)).toEqual({
      arrive: true, seen: false, noShow: true, cancel: true, prescribe: false,
    })
    expect(tokenActions({ status: "Arrived", payoutId: null }, desk)).toEqual({
      arrive: false, seen: true, noShow: false, cancel: true, prescribe: true,
    })
    expect(tokenActions({ status: "Seen", payoutId: null }, desk)).toEqual({
      arrive: false, seen: false, noShow: false, cancel: false, prescribe: true,
    })
    expect(tokenActions({ status: "Cancelled", payoutId: null }, desk).cancel).toBe(false)
  })

  it("offers nothing to someone who can only book, and no cancel once the doctor was paid", () => {
    expect(Object.values(tokenActions({ status: "Booked", payoutId: null }, { canCheckIn: false }))).not.toContain(true)
    expect(tokenActions({ status: "Arrived", payoutId: "p1" }, desk).cancel).toBe(false)
  })
})

describe("prescriptionHref", () => {
  it("carries the token, the doctor and, when known, the customer and NMC number", () => {
    const href = prescriptionHref({ id: "a1", customerId: "c1", doctorName: "Dr. A & B" }, "NMC 12")
    const url = new URL(href, "http://x")
    expect(url.pathname).toBe("/dashboard/prescriptions/add")
    expect(url.searchParams.get("appointmentId")).toBe("a1")
    expect(url.searchParams.get("doctorName")).toBe("Dr. A & B")
    expect(url.searchParams.get("customerId")).toBe("c1")
    expect(url.searchParams.get("doctorLicense")).toBe("NMC 12")
    expect(new URL(prescriptionHref({ id: "a1", customerId: null, doctorName: "Dr" }, null), "http://x").searchParams.has("customerId")).toBe(false)
  })
})

describe("placesLeft", () => {
  it("never goes below zero", () => {
    expect(placesLeft({ booked: 3, maxTokens: 20 })).toBe(17)
    expect(placesLeft({ booked: 22, maxTokens: 20 })).toBe(0)
  })
})

describe("buildTokenSlipHtml", () => {
  it("prints the token big and escapes names", () => {
    const html = buildTokenSlipHtml({
      pharmacyName: "Demo <Pharmacy>",
      doctorName: "Dr. A",
      tokenNo: 7,
      patientName: "Hari",
      dateLabel: "15 Kartik",
      startTime: "16:00",
      labels: { token: "Token", with: "with Dr. A", when: "15 Kartik, 4:00 pm" },
    })
    expect(html).toContain('<div class="token">7</div>')
    expect(html).toContain("Demo &lt;Pharmacy&gt;")
    expect(html).not.toContain("Demo <Pharmacy>")
  })
})
