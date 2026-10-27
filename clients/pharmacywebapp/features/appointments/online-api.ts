/**
 * The public booking page's calls, through the anonymous BFF at /api/dotnet/public/booking (not the signed-in
 * [...path] proxy — patients have no account). The pharmacy is the `code` in the link, else the page's host.
 * Every response is Zod-validated.
 */

import { z } from "zod"
import { getCSRFToken } from "@/lib/api/client-helpers"
import { DOTNET_PROXY_BASE } from "@/lib/api/dotnet-client"
import { toApiTime } from "@/features/appointments/api-client"

const BASE = `${DOTNET_PROXY_BASE}/public/booking`

/** The API sends TimeOnly as "HH:mm:ss"; the UI works in "HH:mm". */
const time = z.string().transform((v) => v.slice(0, 5))
const text = z
  .string()
  .nullish()
  .transform((v) => (v == null || v.trim() === "" ? null : v))

export const onlineBookingPageSchema = z.object({
  pharmacyName: z.string(),
  bookingDaysAhead: z.number(),
  doctors: z.array(z.object({ id: z.string(), name: z.string(), speciality: text, fee: z.number() })),
  sittings: z.array(
    z.object({
      doctorId: z.string(),
      branchId: z.string(),
      branchName: text,
      date: z.string(),
      startTime: time,
      endTime: time,
      placesLeft: z.number(),
    }),
  ),
})
export type OnlineBookingPage = z.infer<typeof onlineBookingPageSchema>
export type OnlineDoctor = OnlineBookingPage["doctors"][number]
export type OnlineSitting = OnlineBookingPage["sittings"][number]

export const onlineTokenSchema = z.object({
  tokenNo: z.number(),
  doctorName: z.string(),
  branchName: text,
  date: z.string(),
  startTime: time,
  endTime: time,
  patientName: z.string(),
  alreadyBooked: z.boolean(),
})
export type OnlineToken = z.infer<typeof onlineTokenSchema>

export interface OnlineBookingInput {
  doctorId: string
  date: string
  startTime: string
  patientName: string
  patientPhone: string
}

/** A failed public call, with the API's plain message for the patient. `status` 404 = online booking is off. */
export class OnlineBookingError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = "OnlineBookingError"
  }
}

async function readError(res: Response): Promise<OnlineBookingError> {
  const body = (await res.json().catch(() => null)) as { message?: unknown; detail?: unknown } | null
  const message =
    typeof body?.message === "string" ? body.message : typeof body?.detail === "string" ? body.detail : `Request failed (${res.status})`
  return new OnlineBookingError(message, res.status)
}

export function buildOnlineBookingBody(input: OnlineBookingInput, code: string | null) {
  return {
    code: code || null,
    doctorId: input.doctorId,
    date: input.date,
    startTime: toApiTime(input.startTime),
    patientName: input.patientName.trim(),
    patientPhone: input.patientPhone.trim(),
  }
}

export const onlineBookingApi = {
  async getPage(code: string | null, fetchImpl: typeof fetch = fetch): Promise<OnlineBookingPage> {
    const query = code ? `?${new URLSearchParams({ code }).toString()}` : ""
    const res = await fetchImpl(`${BASE}${query}`, { cache: "no-store", credentials: "same-origin" })
    if (!res.ok) throw await readError(res)
    return onlineBookingPageSchema.parse(await res.json())
  },
  async book(input: OnlineBookingInput, code: string | null, fetchImpl: typeof fetch = fetch): Promise<OnlineToken> {
    const csrf = await getCSRFToken()
    const res = await fetchImpl(`${BASE}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      credentials: "same-origin",
      body: JSON.stringify(buildOnlineBookingBody(input, code)),
    })
    if (!res.ok) throw await readError(res)
    return onlineTokenSchema.parse(await res.json())
  },
}
