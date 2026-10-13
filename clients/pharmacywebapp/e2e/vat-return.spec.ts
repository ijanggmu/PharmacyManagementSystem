import { expect, test } from "./helpers/session"
import { mockDotnet } from "./helpers/dotnet-mocks"

// One month: Rs 1,00,000 taxable sales (13% = 13,000 output VAT) + 20,000 exempt; Rs 60,000 taxable purchases
// (7,800 input VAT). Net VAT 5,200 payable, registers agree with the ledger.
const VAT_RETURN = {
  fromUtc: "2026-09-16T18:15:00Z",
  toUtc: "2026-10-16T18:14:59Z",
  vatCollected: 13000,
  vatRefundedOrAdjusted: 0,
  netVatPayable: 5200,
  inputVat: 7800,
  netVatDue: 5200,
  vatSettled: 0,
  sales: {
    taxableSales: 100000,
    outputVat: 13000,
    exemptSales: 20000,
    exportSales: 0,
    unclassifiedSales: 0,
    returnsTaxable: 0,
    returnsExempt: 0,
    returnsVat: 0,
    netTaxableSales: 100000,
    netExemptSales: 20000,
    netOutputVat: 13000,
    netTotalSales: 120000,
    invoiceCount: 412,
    creditNoteCount: 0,
  },
  purchases: {
    taxablePurchases: 60000,
    inputVat: 7800,
    exemptPurchases: 0,
    importPurchases: 0,
    importVat: 0,
    debitNotesTaxable: 0,
    debitNotesExempt: 0,
    debitNotesVat: 0,
    netTaxablePurchases: 60000,
    netExemptPurchases: 0,
    netInputVat: 7800,
    netTotalPurchases: 60000,
    billCount: 18,
    debitNoteCount: 0,
  },
  carryForward: {
    openingPosition: 0,
    creditBroughtForward: 0,
    unpaidVatBroughtForward: 0,
    netVatForPeriod: 5200,
    vatPayable: 5200,
    creditCarriedForward: 0,
    vatPaidInPeriod: 0,
    closingPosition: 5200,
  },
  reconciliation: {
    registerOutputVat: 13000,
    ledgerOutputVat: 13000,
    outputVatDifference: 0,
    registerInputVat: 7800,
    ledgerInputVat: 7800,
    inputVatDifference: 0,
    hasDifference: false,
  },
}

test("VAT return renders the IRD sections", async ({ authedPage: page }) => {
  await mockDotnet(page, "GET", "/accounting/reports/vat-return", { body: VAT_RETURN })
  // The tab checks the trial balance balances for the same period; an empty one does.
  await mockDotnet(page, "GET", "/accounting/reports/trial-balance-period", {
    body: { fromUtc: VAT_RETURN.fromUtc, toUtc: VAT_RETURN.toUtc, branchId: null, lines: [], openingVouchersInPeriod: [] },
  })

  await page.goto("/dashboard/reports/accounting/vat")
  await expect(page.getByRole("heading", { name: /^VAT return · / })).toBeVisible()
  await expect(page.getByText(/VAT payable to IRD\s*·\s*रू5,200\.00/)).toBeVisible()

  // IRD monthly layout: sales and purchases turnover from the registers…
  const turnover = page.getByRole("table").filter({ hasText: "Particulars" })
  for (const label of ["Sales", "Taxable sales", "Exempt sales", "Total sales", "Purchases", "Taxable purchases", "Total purchases"]) {
    await expect(turnover.getByRole("row").filter({ hasText: label }).first()).toBeVisible()
  }
  await expect(turnover.getByRole("row").filter({ hasText: "Total sales" })).toContainText("120,000.00")
  await expect(turnover.getByRole("row").filter({ hasText: "Taxable purchases" })).toContainText("7,800.00")

  // …the VAT computation from the ledger…
  const computation = page.getByRole("table").filter({ hasText: "VAT computation" })
  await expect(computation.getByRole("row").filter({ hasText: "Output VAT on sales" })).toContainText("13,000.00")
  await expect(computation.getByRole("row").filter({ hasText: "VAT payable for this return" })).toContainText("5,200.00")

  // …and the register-vs-ledger reconciliation.
  await expect(page.getByRole("heading", { name: "Registers vs ledger" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Open IRD registers" })).toBeVisible()
})
