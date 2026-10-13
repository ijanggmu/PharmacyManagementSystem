import { describe, expect, it } from "vitest"
import { purchaseOrdersListQuery, receivePurchaseOrderBody, shortReceivedLines } from "./api-client"

function params(path: string): URLSearchParams {
  return new URLSearchParams(path.split("?")[1])
}

describe("purchaseOrdersListQuery", () => {
  it("sends search and the mapped status list to the server", () => {
    const p = params(purchaseOrdersListQuery({ page: 2, limit: 10, status: "open", search: "  himal " }))
    expect(p.get("pageNumber")).toBe("2")
    expect(p.get("pageSize")).toBe("10")
    expect(p.get("status")).toBe("Draft,Approved")
    expect(p.get("search")).toBe("himal")
  })

  it("omits the status for 'all' and a blank search", () => {
    const p = params(purchaseOrdersListQuery({ status: "all", search: "   " }))
    expect(p.has("status")).toBe(false)
    expect(p.has("search")).toBe(false)
  })

  it("caps the page size at the server maximum of 200 (1000 used to be rejected)", () => {
    expect(params(purchaseOrdersListQuery({ limit: 1000 })).get("pageSize")).toBe("200")
  })

  it("rejects a status the API has no equivalent for", () => {
    expect(() => purchaseOrdersListQuery({ status: "partially_received" })).toThrow(/not supported/)
  })
})

describe("receivePurchaseOrderBody (short delivery)", () => {
  it("sends the received quantity per line and the backorder choice", () => {
    const body = receivePurchaseOrderBody(
      [
        { purchase_order_item_id: "l1", quantity_to_receive: 6, batch_number: "B1", expiry_date: "2027-01-31", selling_price: "12" },
        { purchase_order_item_id: "l2", quantity_to_receive: 0, batch_number: "ignored", expiry_date: "2027-01-31", selling_price: "9" },
      ],
      "2026-10-09",
      false,
    )
    expect(body.createBackorder).toBe(false)
    expect(body.lines[0]).toEqual({ lineId: "l1", batchNo: "B1", expiryDate: "2027-01-31", sellingPrice: 12, quantityReceived: 6, freeQuantityReceived: null })
    // Nothing arrived on l2, so no batch details are sent for it.
    expect(body.lines[1]).toEqual({ lineId: "l2", batchNo: null, expiryDate: null, sellingPrice: null, quantityReceived: 0, freeQuantityReceived: null })
  })

  it("treats a missing quantity as the full quantity and defaults to raising a backorder", () => {
    const body = receivePurchaseOrderBody([{ purchase_order_item_id: "l1", batch_number: "B1" }])
    expect(body.createBackorder).toBe(true)
    expect(body.lines[0].quantityReceived).toBeNull()
  })

  it("rejects a negative quantity", () => {
    expect(() => receivePurchaseOrderBody([{ purchase_order_item_id: "l1", quantity_to_receive: -1 }])).toThrow()
  })
})

describe("shortReceivedLines", () => {
  const items = [
    { id: "a", quantity_ordered: 10, quantity_received: 0 },
    { id: "b", quantity_ordered: 4, quantity_received: 0 },
  ]

  it("lists lines receiving less than ordered, including nothing", () => {
    expect(shortReceivedLines(items, { a: 6, b: 4 })).toEqual(["a"])
    expect(shortReceivedLines(items, { a: 10, b: 0 })).toEqual(["b"])
  })

  it("treats a line without an entry as received in full", () => {
    expect(shortReceivedLines(items, {})).toEqual([])
  })
})
