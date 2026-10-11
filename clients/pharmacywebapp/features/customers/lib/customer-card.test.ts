import { describe, expect, it } from "vitest"
import { buildCustomerCardHtml, customerCardQrValue } from "./customer-card"

const base = {
  profile: { name: "Himalaya Pharmacy", phone: "01-4444444", address: "Kathmandu" },
  customerName: "Sita Rai",
  code: "C-000123",
  phone: "9800000000",
  memberSince: "2026-03-01T00:00:00Z",
  qrDataUrl: "data:image/png;base64,AAAA",
}

describe("customer card", () => {
  it("encodes just the customer number in the QR", () => {
    expect(customerCardQrValue(" c-000123 ")).toBe("C-000123")
  })

  it("prints the pharmacy, customer, number and QR", () => {
    const html = buildCustomerCardHtml(base)
    expect(html).toContain("Himalaya Pharmacy")
    expect(html).toContain("Sita Rai")
    expect(html).toContain("C-000123")
    expect(html).toContain('src="data:image/png;base64,AAAA"')
    expect(html).toContain("Member since Mar 2026")
  })

  it("escapes customer-entered text", () => {
    const html = buildCustomerCardHtml({ ...base, customerName: '<img src=x onerror="alert(1)">' })
    expect(html).not.toContain("<img src=x")
    expect(html).toContain("&lt;img src=x")
  })

  it("repeats the card for each copy, capped at 10", () => {
    const count = (html: string) => html.split('class="card"').length - 1
    expect(count(buildCustomerCardHtml({ ...base, copies: 3 }))).toBe(3)
    expect(count(buildCustomerCardHtml({ ...base, copies: 50 }))).toBe(10)
  })
})
