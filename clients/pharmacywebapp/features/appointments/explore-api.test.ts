import { describe, expect, it, vi } from "vitest"
import { exploreApi, exploreBookingHref, exploreSchema } from "@/features/appointments/explore-api"
import { OnlineBookingError } from "@/features/appointments/online-api"

describe("explore api", () => {
  it("reads the doctors, trimming times to HH:mm and blank text to null", () => {
    const explore = exploreSchema.parse({
      doctors: [
        {
          pharmacyCode: "shree",
          pharmacyName: "Shree",
          doctorId: "d",
          name: "Dr. A",
          speciality: " ",
          fee: 500,
          sittings: [
            { date: "2026-11-01", startTime: "16:00:00", endTime: "19:00:00", branchName: "Main", branchAddress: null, placesLeft: 2 },
          ],
        },
      ],
    })
    expect(explore.doctors[0].speciality).toBeNull()
    expect(explore.doctors[0].sittings[0]).toMatchObject({ startTime: "16:00", endTime: "19:00", branchAddress: null })
  })

  it("links to the booking page with the doctor chosen", () => {
    expect(exploreBookingHref({ pharmacyCode: "shree-pharmacy", doctorId: "d1" })).toBe(
      "/book?code=shree-pharmacy&doctor=d1&from=explore",
    )
  })

  it("calls the anonymous route and turns a failure into an error with the API's message", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Too many requests" }), { status: 429 }))
    const error = await exploreApi.list(fetchImpl).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(OnlineBookingError)
    expect((error as OnlineBookingError).status).toBe(429)
    expect((error as OnlineBookingError).message).toBe("Too many requests")
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/dotnet/public/explore")
  })
})
