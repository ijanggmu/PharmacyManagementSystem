import { describe, expect, it } from "vitest"
import { levelPricer, levelUnitPrice, priceLevelIdToSend, RETAIL_LEVEL_ID, ruleFromQuote, type PriceLevelRule } from "./price-levels"
import { posPriceLine } from "./pos-pricing"
import { toDotnetCreateSaleBody } from "@/lib/api/sales-api"
import type { CreateSaleData } from "@/features/sales/api-client"

const wholesale: PriceLevelRule = { id: "lvl-1", name: "Wholesale", discountPercent: 10, explicitPrices: { "med-explicit": 9.5 } }

describe("price levels (mirror of the server's PriceLevelPricing)", () => {
  it("prices each lot a percent below its own price, rounded to the paisa half away from zero", () => {
    expect(levelUnitPrice(wholesale, "med", 11.3)).toBe(10.17)
    expect(levelUnitPrice({ ...wholesale, discountPercent: 15 }, "med", 2.35)).toBe(2)
    expect(levelUnitPrice({ ...wholesale, discountPercent: 12.5 }, "med", 10.05)).toBe(8.79)
  })

  it("uses the level's explicit price for that medicine, never above the lot price (MRP)", () => {
    expect(levelUnitPrice(wholesale, "med-explicit", 11.3)).toBe(9.5)
    expect(levelUnitPrice(wholesale, "med-explicit", 9)).toBe(9)
  })

  it("is retail without a level, and leaves an unpriced lot unpriced", () => {
    expect(levelUnitPrice(null, "med", 11.3)).toBe(11.3)
    expect(levelUnitPrice(wholesale, "med", 0)).toBe(0)
    expect(levelPricer(null, "med")).toBeUndefined()
  })

  it("prices a cart line lot by lot at the level, pack lines as their base units", () => {
    const picks = [
      { batch_number: "B1", quantity_remaining: 6, selling_price: 11.3 },
      { batch_number: "B2", quantity_remaining: 50, selling_price: 12 },
    ]
    // Same figures as the server test: 6 × 10.17 + 4 × 10.80 = 104.22.
    const line = posPriceLine(picks, 0, 10, 0, levelPricer(wholesale, "med"))
    expect(line.totalPrice).toBe(104.22)
    expect(line.mixedPrices).toBe(true)
    // 2 strips of 10 at an explicit 9.50 a tablet.
    expect(posPriceLine(picks, 0, 20, 0, levelPricer(wholesale, "med-explicit")).totalPrice).toBe(190)
  })

  it("reads the server's quote into a rule (null = retail)", () => {
    expect(ruleFromQuote(null)).toBeNull()
    expect(
      ruleFromQuote({
        customerPriceLevelId: null,
        customerPriceLevelName: null,
        priceLevelId: null,
        priceLevelName: null,
        discountPercent: 0,
        items: [],
      }),
    ).toBeNull()
    expect(
      ruleFromQuote({
        customerPriceLevelId: "lvl-1",
        customerPriceLevelName: "Wholesale",
        priceLevelId: "lvl-1",
        priceLevelName: "Wholesale",
        discountPercent: 10,
        items: [{ medicineId: "med-explicit", unitPrice: 9.5 }],
      }),
    ).toEqual(wholesale)
  })

  it("sends a level only when it differs from the customer's own (all-zero GUID = retail)", () => {
    expect(priceLevelIdToSend("lvl-1", "lvl-1")).toBeUndefined()
    expect(priceLevelIdToSend(null, null)).toBeUndefined()
    expect(priceLevelIdToSend(null, "lvl-1")).toBe("lvl-1")
    expect(priceLevelIdToSend("lvl-1", null)).toBe(RETAIL_LEVEL_ID)
  })

  it("puts priceLevelId on the checkout body only when overridden, so normal checkouts keep their fingerprint", () => {
    const base: CreateSaleData = {
      sale_number: "S1",
      customer_id: "",
      total_amount: "10.00",
      discount_amount: "0",
      tax_amount: "0",
      payments: [{ method: "cash", amount: 10, reference: null }],
      payment_status: "paid",
      sale_date: "2026-10-13T00:00:00.000Z",
      sale_items: [{ medicine_id: "med", quantity: 1, unit_price: "10.00", total_price: "10.00", discount_percent: 0 }],
    } as unknown as CreateSaleData
    expect("priceLevelId" in toDotnetCreateSaleBody(base)).toBe(false)
    expect(toDotnetCreateSaleBody({ ...base, price_level_id: "lvl-1" }).priceLevelId).toBe("lvl-1")
  })
})
