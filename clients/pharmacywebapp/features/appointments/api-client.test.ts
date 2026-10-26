import { describe, expect, it } from "vitest"
import {
  appointmentSchema,
  buildArriveBody,
  buildBookTokenBody,
  buildDayChangeBody,
  buildDoctorBody,
  buildWeeklySlotsBody,
  doctorSchema,
  timetableSchema,
  toApiTime,
} from "@/features/appointments/api-client"

describe("appointments api-client", () => {
  it("sends blank optional doctor text as null and rounds money", () => {
    expect(
      buildDoctorBody({ name: " Dr. A ", nmcNumber: " ", speciality: "Skin", phone: "", fee: 500.005, shareType: "Percent", shareValue: 80 }),
    ).toEqual({ name: "Dr. A", nmcNumber: null, speciality: "Skin", phone: null, fee: 500.01, shareType: "Percent", shareValue: 80 })
  })

  it("sends times as TimeOnly", () => {
    expect(toApiTime("16:00")).toBe("16:00:00")
    expect(toApiTime("16:00:00")).toBe("16:00:00")
    expect(buildWeeklySlotsBody([{ branchId: "b", dayOfWeek: 3, startTime: "16:00", endTime: "19:30", maxTokens: 20.7 }])).toEqual({
      slots: [{ branchId: "b", dayOfWeek: 3, startTime: "16:00:00", endTime: "19:30:00", maxTokens: 20 }],
    })
  })

  it("sends only date, kind and note for a day off", () => {
    const base = { date: "2026-11-02", branchId: "b", startTime: "08:00", endTime: "10:00", maxTokens: 5, note: " Leave " }
    expect(buildDayChangeBody({ ...base, kind: "DayOff" })).toEqual({
      date: "2026-11-02", kind: "DayOff", branchId: null, startTime: null, endTime: null, maxTokens: null, note: "Leave",
    })
    expect(buildDayChangeBody({ ...base, kind: "ExtraDay", note: "" })).toEqual({
      date: "2026-11-02", kind: "ExtraDay", branchId: "b", startTime: "08:00:00", endTime: "10:00:00", maxTokens: 5, note: null,
    })
  })

  it("reads a doctor and trims TimeOnly to HH:mm", () => {
    const doctor = doctorSchema.parse({
      id: "d",
      name: "Dr. A",
      nmcNumber: null,
      speciality: "",
      phone: null,
      fee: 500,
      shareType: "Percent",
      shareValue: 80,
      doctorShareAmount: 400,
      isActive: true,
      createdAtUtc: "2026-11-01T00:00:00Z",
      weeklySlots: [{ id: "s", branchId: "b", dayOfWeek: 0, startTime: "16:00:00", endTime: "19:00:00", maxTokens: 20 }],
      dayChanges: [{ id: "c", date: "2026-11-02", kind: "DayOff", branchId: null, startTime: null, endTime: null, maxTokens: null, note: null }],
    })
    expect(doctor.speciality).toBeNull()
    expect(doctor.weeklySlots[0].startTime).toBe("16:00")
    expect(doctor.dayChanges[0].startTime).toBeNull()
  })

  it("sends a booking with TimeOnly and blank patient extras as null", () => {
    expect(
      buildBookTokenBody({ doctorId: "d", date: "2026-11-01", startTime: "16:00", patientName: " Hari ", patientPhone: " ", customerId: "", note: "" }),
    ).toEqual({ doctorId: "d", date: "2026-11-01", startTime: "16:00:00", patientName: "Hari", patientPhone: null, customerId: null, note: null })
  })

  it("sends no payment method for a free visit", () => {
    expect(buildArriveBody(500, "esewa")).toEqual({ fee: 500, paymentMethod: "esewa" })
    expect(buildArriveBody(0, "cash")).toEqual({ fee: 0, paymentMethod: null })
  })

  it("reads a token and falls back to Booked for an unknown status", () => {
    const token = appointmentSchema.parse({
      id: "a", sessionId: "s", doctorId: "d", doctorName: "Dr", branchId: "b", date: "2026-11-01",
      startTime: "16:00:00", endTime: "19:00:00", tokenNo: 3, customerId: null, patientName: "Hari", patientPhone: "98",
      source: "Counter", status: "Mystery", note: null, bookedAtUtc: "2026-11-01T06:00:00Z", arrivedAtUtc: null,
      seenAtUtc: null, cancelledAtUtc: null, cancelReason: null, feeAmount: null, doctorShareAmount: null,
      paymentMethod: null, feePaidAtUtc: null, feeRefundedAtUtc: null, payoutId: null, prescriptionId: null,
    })
    expect(token.status).toBe("Booked")
    expect(token.startTime).toBe("16:00")
    expect(token.feeAmount).toBeNull()
  })

  it("reads a timetable", () => {
    const t = timetableSchema.parse({
      from: "2026-11-01",
      to: "2026-11-07",
      sessions: [
        { doctorId: "d", doctorName: "Dr. A", speciality: null, branchId: "b", date: "2026-11-01", startTime: "16:00:00", endTime: "19:00:00", maxTokens: 20, isExtraDay: false },
      ],
      daysOff: [{ doctorId: "d", doctorName: "Dr. A", date: "2026-11-04", note: "Leave" }],
    })
    expect(t.sessions[0].endTime).toBe("19:00")
    expect(t.daysOff[0].note).toBe("Leave")
  })
})
