/**
 * The public "Find a doctor" page's one call, through the anonymous BFF at /api/dotnet/public/explore: the doctors
 * of every pharmacy that chose to be listed, each with the sittings patients can book. Zod-validated.
 */

import { z } from "zod"
import { DOTNET_PROXY_BASE } from "@/lib/api/dotnet-client"
import { OnlineBookingError } from "@/features/appointments/online-api"

/** The API sends TimeOnly as "HH:mm:ss"; the UI works in "HH:mm". */
const time = z.string().transform((v) => v.slice(0, 5))
const text = z
  .string()
  .nullish()
  .transform((v) => (v == null || v.trim() === "" ? null : v.trim()))

export const exploreSchema = z.object({
  doctors: z.array(
    z.object({
      pharmacyCode: z.string(),
      pharmacyName: z.string(),
      doctorId: z.string(),
      name: z.string(),
      speciality: text,
      fee: z.number(),
      sittings: z.array(
        z.object({
          date: z.string(),
          startTime: time,
          endTime: time,
          branchName: text,
          branchAddress: text,
          placesLeft: z.number(),
        }),
      ),
    }),
  ),
})
export type Explore = z.infer<typeof exploreSchema>
export type ExploreDoctor = Explore["doctors"][number]
export type ExploreSitting = ExploreDoctor["sittings"][number]

/** The booking page for this doctor, with the doctor already chosen and a way back to the list. */
export function exploreBookingHref(doctor: Pick<ExploreDoctor, "pharmacyCode" | "doctorId">): string {
  return `/book?${new URLSearchParams({ code: doctor.pharmacyCode, doctor: doctor.doctorId, from: "explore" }).toString()}`
}

export const exploreApi = {
  async list(fetchImpl: typeof fetch = fetch): Promise<Explore> {
    const res = await fetchImpl(`${DOTNET_PROXY_BASE}/public/explore`, { cache: "no-store", credentials: "same-origin" })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: unknown } | null
      throw new OnlineBookingError(typeof body?.message === "string" ? body.message : `Request failed (${res.status})`, res.status)
    }
    return exploreSchema.parse(await res.json())
  },
}
