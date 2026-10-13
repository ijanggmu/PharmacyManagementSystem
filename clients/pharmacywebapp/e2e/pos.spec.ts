import type { Page, Request } from "@playwright/test"
import { expect, test } from "./helpers/session"
import { mockDotnet, problem } from "./helpers/dotnet-mocks"

// Fixture medicines (e2e/mock-dotnet/fixtures.mjs): Paracetamol Rs 2/tablet in strips of 10, Amoxicillin Rs 15/capsule.
const PARACETAMOL_ID = "00000000-0000-4000-8000-000000000101"
const SALE_ID = "00000000-0000-4000-8000-00000000c001"

/** GET /sales/{id} read-back after checkout (best effort in the app; a fixed DTO keeps the receipt deterministic). */
function saleDto(total: number) {
  return {
    id: SALE_ID,
    customerId: null,
    customerName: null,
    saleDateUtc: "2026-10-13T05:00:00Z",
    status: "Completed",
    paymentMethod: "Cash",
    paymentAmount: total,
    totalAmount: total,
    balanceDue: 0,
    prescriptionId: null,
    notes: null,
    createdAtUtc: "2026-10-13T05:00:00Z",
    cancelledAtUtc: null,
    cancelReason: null,
    invoiceNumber: "INV-2083-000123",
    fiscalYear: "2083/84",
    printCount: 0,
    items: [
      {
        id: "00000000-0000-4000-8000-00000000c101",
        medicineId: PARACETAMOL_ID,
        medicineName: "Paracetamol 500mg",
        quantity: 10,
        unitPrice: 2,
        discountAmount: 0,
        unitCostPrice: 1,
        lineTotal: total,
        soldUnitsPerPack: 10,
      },
    ],
    payments: [{ id: "00000000-0000-4000-8000-00000000c201", method: "Cash", amount: total, reference: null }],
  }
}

async function openPos(page: Page) {
  await page.goto("/dashboard/sales/new")
  await expect(page.getByRole("heading", { name: "Point of sale", level: 1 })).toBeVisible()
  await expect(page.getByRole("list", { name: "Medicines in stock" })).toBeVisible()
}

async function addParacetamolStrip(page: Page) {
  await page.getByRole("searchbox", { name: "Search medicines by name or generic name" }).fill("parac")
  const catalog = page.getByRole("list", { name: "Medicines in stock" })
  await expect(catalog.getByRole("heading", { name: "Amoxicillin 250mg" })).toBeHidden()
  await catalog.getByRole("button", { name: "Add 1 strip (10 tablets) of Paracetamol 500mg to cart" }).click()
  const cart = page.getByRole("complementary", { name: "Current sale" })
  await expect(cart.getByRole("list", { name: "Cart items" })).toContainText("Paracetamol 500mg")
  return cart
}

test.describe("Point of sale", () => {
  test("sells a strip for cash and shows the receipt", async ({ authedPage: page }) => {
    const posted: Request[] = []
    await mockDotnet(page, "POST", "/sales", (request) => {
      posted.push(request)
      return { body: SALE_ID }
    })
    await mockDotnet(page, "GET", `/sales/${SALE_ID}`, { body: saleDto(20) })

    await openPos(page)
    const cart = await addParacetamolStrip(page)
    await expect(cart).toContainText("रू20.00")

    await cart.getByRole("button", { name: /Review & pay/ }).click()
    const checkout = page.getByRole("dialog", { name: "Review & pay" })
    await expect(checkout.getByRole("heading", { name: "Payment" })).toBeVisible()
    await checkout.getByRole("group", { name: "Quick cash received" }).getByRole("button", { name: "Exact" }).click()
    await checkout.getByRole("button", { name: /Complete sale/ }).click()

    await expect(page.getByRole("dialog", { name: "Print invoice" })).toBeVisible()
    expect(posted).toHaveLength(1)
    const body = posted[0].postDataJSON() as {
      items: { medicineId: string; quantity: number; saleUnit?: string; packCount?: number }[]
      payments: { method: string; amount: number }[]
    }
    // Quantity stays in base units; the pack is named so the invoice reads "1 strip".
    expect(body.items).toEqual([expect.objectContaining({ medicineId: PARACETAMOL_ID, quantity: 10, saleUnit: "pack", packCount: 1 })])
    expect(body.payments).toEqual([expect.objectContaining({ method: "cash", amount: 20 })])
  })

  test("parks a bill with F6 and recalls it with F7", async ({ authedPage: page }) => {
    // The held bill lives in this closure: park stores it, list/recall read it back.
    let parked: { label: string; lines: unknown[]; totalAmount: number; billDiscountAmount: number } | null = null
    const summary = () => ({
      id: "00000000-0000-4000-8000-00000000d001",
      label: parked!.label,
      customerId: null,
      customerName: null,
      lineCount: parked!.lines.length,
      totalAmount: parked!.totalAmount,
      parkedByUserId: null,
      parkedByName: "Sita Sharma",
      parkedAtUtc: "2026-10-13T05:00:00Z",
      expiresAtUtc: "2026-10-14T05:00:00Z",
    })
    await mockDotnet(page, "POST", "/sales/parked", (request) => {
      parked = request.postDataJSON()
      return { body: summary() }
    })
    await mockDotnet(page, "GET", "/sales/parked", () => ({ body: parked ? [summary()] : [] }))
    await mockDotnet(page, "POST", /^\/sales\/parked\/[^/]+\/recall$/, () => {
      const bill = {
        ...summary(),
        branchId: "00000000-0000-4000-8000-0000000000b1",
        prescriptionId: null,
        priceLevelId: null,
        buyerName: null,
        buyerPan: null,
        billDiscountAmount: parked!.billDiscountAmount,
        notes: null,
        lines: parked!.lines,
      }
      parked = null
      return { body: bill }
    })

    await openPos(page)
    const cart = await addParacetamolStrip(page)

    await page.keyboard.press("F6")
    const hold = page.getByRole("dialog", { name: "Hold this bill" })
    await hold.getByLabel("Name for this bill").fill("Ram - counter 2")
    await hold.getByRole("button", { name: "Hold bill" }).click()
    await expect(hold).toBeHidden()
    await expect(cart.getByRole("heading", { name: "No items yet" })).toBeVisible()
    expect(parked).toMatchObject({ label: "Ram - counter 2", totalAmount: 20 })

    await page.keyboard.press("F7")
    const held = page.getByRole("dialog", { name: "Held bills" })
    await held.getByRole("button", { name: "Recall Ram - counter 2" }).click()
    await expect(held).toBeHidden()
    await expect(cart.getByRole("list", { name: "Cart items" })).toContainText("Paracetamol 500mg")
    await expect(cart).toContainText("रू20.00")
  })

  test("asks for manager approval when the discount is over the cashier's cap", async ({ authedPage: page }) => {
    const posted: Request[] = []
    await mockDotnet(page, "POST", "/sales", (request) => {
      posted.push(request)
      const body = request.postDataJSON() as { approvalTokens?: string[] }
      if (!body.approvalTokens?.length) {
        return problem(403, "Manager approval is required: a 20% discount is above your 5% limit.", {
          title: "ApprovalRequiredException",
          errors: ["approval_required", "sale.discount", "20", null],
        })
      }
      return { body: SALE_ID }
    })
    let approvalBody: Record<string, unknown> | null = null
    await mockDotnet(page, "POST", "/identity/approvals", (request) => {
      approvalBody = request.postDataJSON()
      return {
        body: { token: "approval-token-1", approvalId: "a1", expiresAtUtc: "2026-10-13T05:05:00Z", approverName: "Hari Manager" },
      }
    })
    await mockDotnet(page, "GET", `/sales/${SALE_ID}`, { body: saleDto(16) })

    await openPos(page)
    const cart = await addParacetamolStrip(page)
    await cart.getByRole("button", { name: /Review & pay/ }).click()

    const checkout = page.getByRole("dialog", { name: "Review & pay" })
    await checkout.getByRole("spinbutton", { name: "Custom discount percent" }).fill("20")
    await checkout.getByRole("group", { name: "Quick cash received" }).getByRole("button", { name: "Exact" }).click()
    await checkout.getByRole("button", { name: /Complete sale/ }).click()

    const approval = page.getByRole("dialog", { name: "Manager approval needed" })
    await expect(approval).toContainText("above your 5% limit")
    await expect(approval).toContainText("Discount above limit")
    await approval.getByLabel("Approver email or username").fill("manager@demo-pharmacy.test")
    await approval.getByLabel("Approver password").fill("manager-password")
    await approval.getByRole("button", { name: "Approve" }).click()

    await expect(page.getByRole("dialog", { name: "Print invoice" })).toBeVisible()
    expect(approvalBody).toMatchObject({ approverLogin: "manager@demo-pharmacy.test", action: "sale.discount", amount: 20 })
    expect(posted).toHaveLength(2)
    // 20% off a Rs 20 strip: Rs 4 discount, Rs 16 cash.
    expect(posted[0].postDataJSON()).toMatchObject({
      items: [expect.objectContaining({ discountAmount: 4 })],
      payments: [expect.objectContaining({ method: "cash", amount: 16 })],
    })
    expect(posted[1].postDataJSON()).toMatchObject({ approvalTokens: ["approval-token-1"] })
    // The approval is bound to the checkout's idempotency key, so the resubmission must reuse it.
    expect(posted[1].headers()["idempotency-key"]).toBe(posted[0].headers()["idempotency-key"])
  })
})
