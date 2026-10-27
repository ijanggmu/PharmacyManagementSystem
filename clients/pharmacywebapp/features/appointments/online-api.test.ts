import { describe, expect, it, vi } from "vitest"
import { OnlineBookingError, buildOnlineBookingBody, onlineBookingApi, onlineBookingPageSchema } from "@/features/appointments/online-api"

describe("online booking api", () => {
  it("sends the booking with TimeOnly, trimmed text and the pharmacy code", () => {
    expect(
      buildOnlineBookingBody({ doctorId: "d", date: "2026-11-01", startTime: "16:00", patientName: " Hari ", patientPhone: " 9812345678 " }, "shree"),
    ).toEqual({ code: "shree", doctorId: "d", date: "2026-11-01", startTime: "16:00:00", patientName: "Hari", patientPhone: "9812345678" })
    expect(buildOnlineBookingBody({ doctorId: "d", date: "2026-11-01", startTime: "16:00", patientName: "Hari", patientPhone: "98" }, null).code).toBeNull()
  })

  it("reads the page and trims times to HH:mm", () => {
    const page = onlineBookingPageSchema.parse({
      pharmacyName: "Shree",
      bookingDaysAhead: 7,
      doctors: [{ id: "d", name: "Dr. A", speciality: "", fee: 500 }],
      sittings: [{ doctorId: "d", branchId: "b", branchName: null, date: "2026-11-01", startTime: "16:00:00", endTime: "19:00:00", placesLeft: 2 }],
    })
    expect(page.doctors[0].speciality).toBeNull()
    expect(page.sittings[0].startTime).toBe("16:00")
  })

  it("turns a 404 into an off error with the API's message", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: "NOT_FOUND", message: "This pharmacy doesn't take bookings online." }), { status: 404 }),
    )
    const error = await onlineBookingApi.getPage("shree", fetchImpl).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(OnlineBookingError)
    expect((error as OnlineBookingError).status).toBe(404)
    expect((error as OnlineBookingError).message).toBe("This pharmacy doesn't take bookings online.")
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/dotnet/public/booking?code=shree")
  })
})
