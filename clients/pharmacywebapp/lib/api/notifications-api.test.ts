import { describe, expect, it } from "vitest"
import { toNotificationItem, type DotnetNotificationDto } from "@/lib/api/notifications-api"

const base: DotnetNotificationDto = {
  id: "11111111-1111-1111-1111-111111111111",
  type: "low_stock",
  title: "Low stock",
  body: "Paracetamol is below reorder level",
  link: "/inventory",
  source: "Inventory",
  metadataJson: "{}",
  readAtUtc: null,
  createdAtUtc: "2026-10-06T04:00:00Z",
}

describe("toNotificationItem", () => {
  it("maps a .NET notification to the dropdown shape", () => {
    expect(toNotificationItem(base)).toEqual({
      id: base.id,
      type: "low_stock",
      title: "Low stock",
      message: "Paracetamol is below reorder level",
      link: "/inventory",
      is_read: false,
      created_at: "2026-10-06T04:00:00Z",
    })
  })

  it("marks a row read when readAtUtc is set", () => {
    expect(toNotificationItem({ ...base, readAtUtc: "2026-10-06T05:00:00Z" }).is_read).toBe(true)
  })

  it("uses an empty message when the body is null", () => {
    expect(toNotificationItem({ ...base, body: null }).message).toBe("")
  })
})
