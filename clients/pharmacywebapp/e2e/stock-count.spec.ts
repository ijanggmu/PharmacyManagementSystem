import type { Request } from "@playwright/test"
import { expect, test } from "./helpers/session"
import { mockDotnet } from "./helpers/dotnet-mocks"

const COUNT_ID = "00000000-0000-4000-8000-00000000a501"

function line(n: number, medicineName: string, batchNo: string, expected: number, counted: number, unitCost: number) {
  const variance = counted - expected
  return {
    id: `00000000-0000-4000-8000-00000000a6${String(n).padStart(2, "0")}`,
    medicineId: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`,
    medicineName,
    batchId: null,
    batchNo,
    expiryDate: "2027-12-31",
    rackLocation: `A${n}`,
    unitCost,
    snapshotQuantity: expected,
    snapshotAtUtc: "2026-10-12T04:00:00Z",
    isFoundLot: false,
    countedQuantity: counted,
    countedAtUtc: "2026-10-12T06:00:00Z",
    note: null,
    movementsSinceSnapshot: 0,
    expectedQuantity: expected,
    varianceQuantity: variance,
    varianceValue: variance * unitCost,
    currentSystemQuantity: expected,
    postedDelta: null,
  }
}

const LINES = [
  line(1, "Paracetamol 500mg", "PCM-2401", 200, 195, 1), // 5 missing → −Rs 5
  line(2, "Amoxicillin 250mg", "AMX-2402", 60, 62, 8), // 2 found → +Rs 16
  line(3, "Cetirizine 10mg", "CTZ-2403", 40, 40, 3), // matches
]

function detail(status: "Review" | "Posted") {
  return {
    session: {
      id: COUNT_ID,
      sessionNumber: "SC-0007",
      title: "Rack A monthly count",
      branchId: "00000000-0000-4000-8000-0000000000b1",
      status,
      categoryId: null,
      rackLocation: "A",
      supplierId: null,
      notes: null,
      createdAtUtc: "2026-10-12T04:00:00Z",
      snapshotAtUtc: "2026-10-12T04:00:00Z",
      submittedAtUtc: "2026-10-12T07:00:00Z",
      postedAtUtc: status === "Posted" ? "2026-10-13T05:00:00Z" : null,
      cancelledAtUtc: null,
      lineCount: 3,
      countedLineCount: 3,
      postedGainValue: status === "Posted" ? 16 : 0,
      postedLossValue: status === "Posted" ? 5 : 0,
    },
    lines: LINES,
    gainValue: 16,
    lossValue: 5,
    netValue: 11,
  }
}

test("reviews stock count variances and posts them", async ({ authedPage: page }) => {
  let status: "Review" | "Posted" = "Review"
  await mockDotnet(page, "GET", `/inventory/stock-counts/${COUNT_ID}`, () => ({ body: detail(status) }))
  const posts: Request[] = []
  await mockDotnet(page, "POST", `/inventory/stock-counts/${COUNT_ID}/post`, (request) => {
    posts.push(request)
    status = "Posted"
    return { body: detail("Posted").session }
  })

  await page.goto(`/dashboard/inventory/stock-counts/${COUNT_ID}`)
  await expect(page.getByRole("heading", { name: "Rack A monthly count" })).toBeVisible()
  await expect(page.getByText("In review")).toBeVisible()

  const table = page.getByRole("table")
  await expect(table.getByRole("row")).toHaveCount(4) // header + 3 lots
  await expect(table.getByRole("row").filter({ hasText: "PCM-2401" })).toContainText("-5")
  await expect(table.getByRole("row").filter({ hasText: "AMX-2402" })).toContainText("+2")

  // Only the two lots that differ remain when filtering to variances.
  await page.getByRole("switch", { name: "Only lots with a difference" }).click()
  await expect(table.getByRole("row")).toHaveCount(3)
  await expect(table).not.toContainText("CTZ-2403")

  await page.getByRole("button", { name: "Post variances" }).click()
  const confirm = page.getByRole("dialog", { name: "Post this stock count?" })
  await expect(confirm).toContainText("रू16.00 of stock gained and रू5.00 missing")
  await confirm.getByRole("button", { name: "Post variances" }).click()

  await expect(confirm).toBeHidden()
  await expect(page.getByText("Posted", { exact: true }).first()).toBeVisible()
  expect(posts).toHaveLength(1)
  expect(posts[0].headers()["idempotency-key"]).toBeTruthy()
})
