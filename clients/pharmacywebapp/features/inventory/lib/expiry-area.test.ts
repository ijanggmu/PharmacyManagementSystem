import { describe, expect, it } from "vitest"

import { DOTNET_ROOT_PERMISSIONS } from "@/lib/api/dotnet-permissions"
import { toExpiredBatch } from "@/features/inventory/api-client-expired-batches"
import {
  EXPIRY_WINDOWS,
  allowedExpiryTabs,
  bulkWriteOffTargets,
  expiredCountLabel,
  expiredRowBadges,
  expiryHref,
  isOnOpenClaim,
  parseExpiryWindow,
  recallFilterParam,
  resolveExpiryTab,
} from "@/features/inventory/lib/expiry-area"

const REPORTS = "Permissions.Inventory.Reports.View"
const RETURNS_VIEW = "Permissions.Suppliers.Returns.View"

describe("expiry tabs", () => {
  it("shows the stock tabs to report viewers and claims to Returns.View holders (not Suppliers.View)", () => {
    expect(allowedExpiryTabs([REPORTS])).toEqual(["expiring", "expired"])
    expect(allowedExpiryTabs([RETURNS_VIEW])).toEqual(["claims"])
    expect(allowedExpiryTabs(["Permissions.Suppliers.Suppliers.View"])).toEqual([])
    expect(allowedExpiryTabs([...DOTNET_ROOT_PERMISSIONS])).toEqual(["expiring", "expired", "claims"])
  })

  it("resolves ?tab= to an allowed tab, falling back to the first allowed one", () => {
    const all = allowedExpiryTabs([REPORTS, RETURNS_VIEW])
    expect(resolveExpiryTab("claims", all)).toBe("claims")
    expect(resolveExpiryTab("nonsense", all)).toBe("expiring")
    expect(resolveExpiryTab(null, all)).toBe("expiring")
    expect(resolveExpiryTab("expired", ["claims"])).toBe("claims")
    expect(resolveExpiryTab("expired", [])).toBeNull()
  })

  it("builds tab links", () => {
    expect(expiryHref("claims")).toBe("/dashboard/inventory/expiry?tab=claims")
  })
})

describe("day windows", () => {
  it("offers the same 30/60/90/180 everywhere and rejects anything else", () => {
    expect(EXPIRY_WINDOWS).toEqual([30, 60, 90, 180])
    expect(parseExpiryWindow("90")).toBe(90)
    expect(parseExpiryWindow("45")).toBe(30)
    expect(parseExpiryWindow(null, 90)).toBe(90)
  })
})

describe("expired rows", () => {
  const row = (over: Partial<{ is_expired: boolean; is_recalled: boolean; open_claim_quantity: number }> = {}) => ({
    is_expired: true,
    is_recalled: false,
    open_claim_quantity: 0,
    ...over,
  })

  it("labels an in-date recalled lot Recalled, not Expired", () => {
    expect(expiredRowBadges(row({ is_expired: false, is_recalled: true }))).toEqual(["recalled"])
    expect(expiredRowBadges(row({ is_recalled: true }))).toEqual(["expired", "recalled"])
    expect(expiredRowBadges(row({ open_claim_quantity: 4 }))).toEqual(["expired", "on-claim"])
  })

  it("blocks write-off of lots on an open claim, also in the bulk write-off", () => {
    expect(isOnOpenClaim(row({ open_claim_quantity: 1 }))).toBe(true)
    expect(isOnOpenClaim(row())).toBe(false)
    const rows = [row(), row({ open_claim_quantity: 2 }), row({ is_recalled: true }), row({ is_expired: false, is_recalled: true })]
    const { targets, skippedOnClaim } = bulkWriteOffTargets(rows)
    expect(targets).toEqual([rows[0]])
    expect(skippedOnClaim).toBe(1)
  })

  it("names the count after the filter and maps it to isRecalled", () => {
    expect(expiredCountLabel("recalled-only")).toBe("Recalled batches")
    expect(expiredCountLabel("expired-only")).toBe("Expired batches")
    expect(recallFilterParam("all")).toBeUndefined()
    expect(recallFilterParam("recalled-only")).toBe(true)
    expect(recallFilterParam("expired-only")).toBe(false)
  })

  it("maps the DTO's expiry and claim fields, defaulting for older APIs", () => {
    const base = {
      batchId: "b1",
      medicineId: "m1",
      medicineName: "Cetamol",
      batchNo: "A1",
      expiryDate: "2026-12-01",
      quantityOnHand: 5,
      costPrice: 2,
      receivedAtUtc: "2026-01-01T00:00:00Z",
      branchId: "br",
      rackLocation: null,
      isRecalled: true,
    }
    expect(toExpiredBatch({ ...base, isExpired: false, openClaimQuantity: 3 })).toMatchObject({
      is_recalled: true,
      is_expired: false,
      open_claim_quantity: 3,
    })
    expect(toExpiredBatch(base)).toMatchObject({ is_expired: true, open_claim_quantity: 0 })
  })
})
