import { describe, expect, it } from "vitest"
import type { Medicine } from "@/features/sales/types"
import {
  buildParkBody,
  cartLineFor,
  defaultParkLabel,
  listLocalParked,
  parkLocally,
  removeLocalParked,
  restoreParkedCart,
  type ParkedLine,
} from "./parked-bills"
import type { PriceLevelRule } from "./price-levels"

function medicine(overrides: Partial<Medicine> = {}): Medicine {
  return {
    id: "para",
    name: "Paracetamol 500mg",
    generic_name: null,
    strength: "500mg",
    form: "Tablet",
    unit_price: "1.00",
    stock_quantity: 100,
    is_taxable: true,
    fefo_picks: [{ batch_number: "B1", expiry_date: "2027-01-01", rack_location: "A1", quantity_remaining: 100, selling_price: 1.13 }],
    batch_count: 1,
    units_per_pack: 10,
    unit_label: "Strip",
    ...overrides,
  }
}

function memoryStore() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  }
}

const wholesale: PriceLevelRule = { id: "lvl", name: "Wholesale", discountPercent: 10, explicitPrices: {} }

describe("held bills", () => {
  it("holds the cart with base quantities, the pack count of pack lines and the till's prices", () => {
    const strips = cartLineFor(medicine(), 20, "pack", 5, null)
    const ors = cartLineFor(medicine({ id: "ors", name: "ORS", units_per_pack: null, unit_label: null, fefo_picks: [] , unit_price: "20" }), 3, "base", 0, null)
    const body = buildParkBody(
      [strips, ors],
      { customerId: "c1", customerName: "Ram Thapa", buyerName: "Thapa Traders", buyerPan: "123456789", billDiscountAmount: 2.004 },
      81.47,
      "park-1",
    )
    expect(body.label).toBe("Ram Thapa")
    expect(body.billDiscountAmount).toBe(2)
    expect(body.clientParkId).toBe("park-1")
    expect(body.lines[0]).toMatchObject({ medicineId: "para", quantity: 20, saleUnit: "pack", packCount: 2, discountPercent: 5, unitPrice: 1.13 })
    expect(body.lines[1]).toMatchObject({ medicineId: "ors", quantity: 3, saleUnit: null, packCount: null })
  })

  it("labels an anonymous bill with the time", () => {
    expect(defaultParkLabel(null, new Date(2026, 9, 13, 9, 5))).toBe("Bill 09:05")
    expect(defaultParkLabel("  Sita  ")).toBe("Sita")
  })

  it("restores a held cart priced against today's lots and the customer's level, and says what changed", () => {
    const lines: ParkedLine[] = [
      { medicineId: "para", medicineName: "Paracetamol 500mg", quantity: 20, saleUnit: "pack", packCount: 2, discountPercent: 0, unitPrice: 1.13, lineTotal: 22.6 },
    ]
    // The lot was re-priced to 1.20 since; the customer is on wholesale (−10%) → 1.08 a tablet.
    const today = medicine({ fefo_picks: [{ batch_number: "B2", expiry_date: null, rack_location: null, quantity_remaining: 100, selling_price: 1.2 }] })
    const { cart, warnings } = restoreParkedCart(lines, [today], wholesale)
    expect(cart).toHaveLength(1)
    expect(cart[0]).toMatchObject({ quantity: 20, saleUnit: "pack", unitPrice: 1.08, totalPrice: 21.6 })
    expect(warnings).toEqual(["Paracetamol 500mg: price changed from Rs 1.13 to Rs 1.08 a unit."])
  })

  it("drops lines now out of stock and cuts a quantity down to today's stock, in whole packs", () => {
    const lines: ParkedLine[] = [
      { medicineId: "para", medicineName: "Paracetamol 500mg", quantity: 50, saleUnit: "pack", packCount: 5, discountPercent: 0, unitPrice: 1.13, lineTotal: 56.5 },
      { medicineId: "gone", medicineName: "Cetirizine", quantity: 2, saleUnit: null, packCount: null, discountPercent: 0, unitPrice: 2, lineTotal: 4 },
    ]
    const { cart, warnings } = restoreParkedCart(lines, [medicine({ stock_quantity: 35 })], null)
    expect(cart.map((c) => [c.medicineId, c.quantity, c.saleUnit])).toEqual([["para", 30, "pack"]])
    expect(warnings).toContain("Cetirizine is out of stock and was left out.")
    expect(warnings.some((w) => w.includes("only 30 left"))).toBe(true)
  })

  it("keeps bills held offline per branch on this device until recalled or expired", () => {
    const store = memoryStore()
    const now = new Date("2026-10-13T08:00:00Z")
    const body = buildParkBody([cartLineFor(medicine(), 10, "base", 0, null)], { label: "Counter 2" }, 11.3, "k1", now)
    const held = parkLocally(body, "branch-a", now, 24, store)
    expect(held?.source).toBe("local")
    expect(listLocalParked("branch-a", now, store).map((b) => b.label)).toEqual(["Counter 2"])
    expect(listLocalParked("branch-b", now, store)).toEqual([])
    expect(listLocalParked("branch-a", new Date("2026-10-14T08:00:01Z"), store)).toEqual([])

    expect(removeLocalParked(held!.id, store)?.lines).toHaveLength(1)
    expect(listLocalParked("branch-a", now, store)).toEqual([])
  })
})
