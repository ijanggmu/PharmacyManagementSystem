import { describe, expect, it } from "vitest"
import {
  acceptanceSummary,
  buildClaimLetterHtml,
  claimActions,
  expiryLabel,
  fullAcceptance,
  selectionToLines,
  selectionValue,
  type ExpiryClaim,
  type ExpiryClaimCandidateLot,
  type ExpiryClaimLine,
} from "./expiry-claim"
import { expiryClaimsListPath } from "../api-client"

function lot(overrides: Partial<ExpiryClaimCandidateLot> = {}): ExpiryClaimCandidateLot {
  return {
    batchId: "b1",
    medicineId: "m1",
    medicineName: "Cetamol 500mg",
    batchNo: "C1",
    expiryDate: "2026-11-30",
    daysUntilExpiry: 30,
    isExpired: false,
    quantityOnHand: 10,
    alreadyClaimedQuantity: 0,
    claimableQuantity: 10,
    unitCost: 3,
    claimableValue: 30,
    attribution: "Receipt",
    ...overrides,
  }
}

function claimLine(overrides: Partial<ExpiryClaimLine> = {}): ExpiryClaimLine {
  return {
    id: "l1",
    medicineId: "m1",
    medicineName: "Cetamol 500mg",
    batchId: "b1",
    batchNo: "C1",
    expiryDate: "2026-11-30",
    quantity: 10,
    unitCost: 3,
    value: 30,
    acceptedQuantity: null,
    ...overrides,
  }
}

describe("selection", () => {
  const lots = [lot(), lot({ batchId: "b2", batchNo: "C2", claimableQuantity: 4, unitCost: 5 })]

  it("caps quantities at what is claimable and drops zeros", () => {
    expect(selectionToLines(lots, { b1: 25, b2: 0 })).toEqual([{ batchId: "b1", quantity: 10 }])
  })

  it("values the selection at lot cost", () => {
    expect(selectionValue(lots, { b1: 2, b2: 4 })).toBe(26)
  })
})

describe("acceptance", () => {
  const lines = [claimLine(), claimLine({ id: "l2", batchId: "b2", quantity: 4, unitCost: 5, value: 20 })]

  it("defaults to full acceptance", () => {
    expect(fullAcceptance(lines)).toEqual({ l1: 10, l2: 4 })
    expect(acceptanceSummary(lines, {}).value).toBe(50)
  })

  it("supports partial acceptance and sends every line explicitly", () => {
    const summary = acceptanceSummary(lines, { l1: 6, l2: 0 })
    expect(summary.lines).toEqual([
      { lineId: "l1", acceptedQuantity: 6 },
      { lineId: "l2", acceptedQuantity: 0 },
    ])
    expect(summary.value).toBe(18)
    expect(summary.valid).toBe(true)
    expect(summary.anyAccepted).toBe(true)
  })

  it("flags quantities above the claim and an all-zero answer", () => {
    expect(acceptanceSummary(lines, { l1: 11 }).valid).toBe(false)
    expect(acceptanceSummary(lines, { l1: 0, l2: 0 }).anyAccepted).toBe(false)
  })
})

describe("status and labels", () => {
  it("offers the next steps per status", () => {
    expect(claimActions("Draft")).toEqual(["send", "reject"])
    expect(claimActions("Sent")).toEqual(["accept", "reject"])
    expect(claimActions("Accepted")).toEqual(["credit"])
    expect(claimActions("Credited")).toEqual([])
  })

  it("describes expiry", () => {
    expect(expiryLabel({ daysUntilExpiry: -3 })).toBe("Expired 3d ago")
    expect(expiryLabel({ daysUntilExpiry: 0 })).toBe("Expires today")
    expect(expiryLabel({ daysUntilExpiry: 12 })).toBe("Expires in 12d")
  })

  it("builds the list path", () => {
    expect(expiryClaimsListPath({ status: "Sent", supplierId: "s1" })).toBe(
      "/suppliers/expiry-claims?pageNumber=1&pageSize=20&status=Sent&supplierId=s1",
    )
  })
})

describe("claim letter", () => {
  it("lists the lots with the total and escapes text", () => {
    const claim: ExpiryClaim = {
      id: "c1",
      claimNumber: "EC-261012-ABC123",
      supplierId: "s1",
      supplierName: "Acme <Pharma>",
      branchId: null,
      status: "Draft",
      notes: null,
      createdAtUtc: "2026-10-12T00:00:00Z",
      sentAtUtc: null,
      respondedAtUtc: null,
      creditedAtUtc: null,
      supplierReturnId: null,
      debitNoteNumber: null,
      supplierCreditNoteNumber: null,
      rejectionReason: null,
      claimedValue: 30,
      acceptedValue: 0,
      lineCount: 1,
      lines: [claimLine()],
    }
    const html = buildClaimLetterHtml({ claim, profile: { name: "Hamro Pharmacy" }, printedAt: new Date(0) })
    expect(html).toContain("EC-261012-ABC123")
    expect(html).toContain("Acme &lt;Pharma&gt;")
    expect(html).toContain("C1")
    expect(html).toContain("Total claimed")
  })
})
