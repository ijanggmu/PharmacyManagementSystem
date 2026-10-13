import { describe, expect, it } from "vitest"
import {
  hasOptOut,
  normalizeNepaliMobile,
  renderSmsTemplate,
  sampleValues,
  templateError,
  unknownPlaceholders,
} from "./sms-template"
import { smsKindLabel, smsStatusTone } from "./sms-log"

describe("renderSmsTemplate", () => {
  it("fills every placeholder", () => {
    expect(
      renderSmsTemplate("Dear {customer}, {amount} for {invoice} was due on {due_date}. - {pharmacy}", {
        customer: "Ram",
        amount: "Rs. 1,200.00",
        invoice: "INV-7",
        due_date: "13 Oct 2026",
        pharmacy: "City Pharmacy",
      }),
    ).toBe("Dear Ram, Rs. 1,200.00 for INV-7 was due on 13 Oct 2026. - City Pharmacy")
  })

  it("is case-insensitive, keeps unknown placeholders and collapses gaps", () => {
    expect(renderSmsTemplate("{Customer} {foo}", { customer: "Sita" })).toBe("Sita {foo}")
    expect(renderSmsTemplate("Bill {invoice} total", {})).toBe("Bill total")
  })
})

describe("template checks", () => {
  it("reports unknown placeholders once", () => {
    expect(unknownPlaceholders("Hi {customer}, {balance} {balance} {Amount}")).toEqual(["{balance}"])
  })

  it("requires the STOP line on refill reminders only", () => {
    expect(hasOptOut("Reply stop to opt out")).toBe(true)
    expect(templateError("RefillReminder", "Your refill is due.")).toMatch(/STOP/)
    expect(templateError("RefillReminder", "Your refill is due. Reply STOP to opt out.")).toBeNull()
    expect(templateError("DuesReminder", "Please pay {amount}.")).toBeNull()
  })

  it("rejects empty, too long and unknown placeholders", () => {
    expect(templateError("Receipt", "  ")).toMatch(/Enter/)
    expect(templateError("Receipt", "a".repeat(641))).toMatch(/640/)
    expect(templateError("Receipt", "Total {total}")).toMatch(/\{total\}/)
  })

  it("has sample values in both languages", () => {
    expect(sampleValues("ne", "").pharmacy).toBe("सिटी फार्मेसी")
    expect(sampleValues("en", "Hamro Pharmacy").pharmacy).toBe("Hamro Pharmacy")
  })
})

describe("normalizeNepaliMobile", () => {
  it.each([
    ["9841234567", "9841234567"],
    ["+977 984-123-4567", "9841234567"],
    ["9779801234567", "9801234567"],
    ["01-4412345", null],
    ["9541234567", null],
    ["98412345ab", null],
    ["", null],
  ])("%s → %s", (raw, expected) => {
    expect(normalizeNepaliMobile(raw)).toBe(expected)
  })
})

describe("sms log helpers", () => {
  it("labels kinds and picks a tone per status", () => {
    expect(smsKindLabel("DuesReminder")).toBe("Dues reminder")
    expect(smsKindLabel("Other")).toBe("Other")
    expect(smsStatusTone("Sent")).toBe("success")
    expect(smsStatusTone("Failed")).toBe("danger")
    expect(smsStatusTone("Queued")).toBe("muted")
  })
})
