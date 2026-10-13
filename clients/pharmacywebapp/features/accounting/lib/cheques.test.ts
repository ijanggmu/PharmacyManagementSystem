import { describe, expect, it } from "vitest"
import {
  BANKING_RECORD_DEPOSIT_PERMISSION,
  EMPTY_CHEQUE_FIELDS,
  canRunChequeAction,
  chequeActions,
  chequeFiltersFromSearch,
  chequePaymentRequest,
  chequePostingHint,
  chequeStatusLabel,
  chequeStatusTone,
  chequeTotals,
  clearancePostingText,
  hasChequeErrors,
  isChequeDue,
  isPostDated,
  validateChequeFields,
  type ChequeStatus,
} from "./cheques"
import { CUSTOMER_PAYMENT_VOID_PERMISSION, SUPPLIER_PAYMENT_VOID_PERMISSION } from "./payment-void"
import { chequeRequestBody } from "./payment-methods"
import { chequeSearchPath, toChequeRow, type DotnetChequeDto } from "../api-client-cheques"

const actionsOf = (status: ChequeStatus, direction: "received" | "issued") => chequeActions({ status, direction }).map((a) => a.action)

describe("chequeActions", () => {
  it("offers the API's transitions for received cheques", () => {
    expect(actionsOf("on_hand", "received")).toEqual(["deposit", "clear", "bounce", "cancel"])
    expect(actionsOf("deposited", "received")).toEqual(["clear", "bounce"])
  })

  it("offers the API's transitions for issued cheques", () => {
    expect(actionsOf("issued", "issued")).toEqual(["deposit", "clear", "bounce", "cancel"])
    expect(actionsOf("presented", "issued")).toEqual(["clear", "bounce"])
    expect(chequeActions({ status: "issued", direction: "issued" })[0].label).toBe("Mark presented")
  })

  it("allows nothing once bounced or cancelled", () => {
    for (const s of ["bounced", "cancelled"] as const) expect(chequeActions({ status: s, direction: "received" })).toEqual([])
  })

  it("lets a cleared cheque bounce (the bank returned it after paying), and nothing else", () => {
    expect(actionsOf("cleared", "received")).toEqual(["bounce"])
    expect(actionsOf("cleared", "issued")).toEqual(["bounce"])
    expect(chequeActions({ status: "cleared", direction: "received" })[0].voidsPayment).toBe(true)
  })

  it("flags the actions that void the payment", () => {
    const voids = chequeActions({ status: "on_hand", direction: "received" }).filter((a) => a.voidsPayment).map((a) => a.action)
    expect(voids).toEqual(["bounce", "cancel"])
  })
})

describe("canRunChequeAction", () => {
  const [deposit, , bounce] = chequeActions({ status: "on_hand", direction: "received" })

  it("needs the bank-deposit permission", () => {
    expect(canRunChequeAction(deposit, "received", [])).toBe(false)
    expect(canRunChequeAction(deposit, "received", [BANKING_RECORD_DEPOSIT_PERMISSION])).toBe(true)
  })

  it("needs the party's void permission to bounce", () => {
    expect(canRunChequeAction(bounce, "received", [BANKING_RECORD_DEPOSIT_PERMISSION])).toBe(false)
    expect(canRunChequeAction(bounce, "received", [BANKING_RECORD_DEPOSIT_PERMISSION, CUSTOMER_PAYMENT_VOID_PERMISSION])).toBe(true)
    expect(canRunChequeAction(bounce, "issued", [BANKING_RECORD_DEPOSIT_PERMISSION, CUSTOMER_PAYMENT_VOID_PERMISSION])).toBe(false)
    expect(canRunChequeAction(bounce, "issued", [BANKING_RECORD_DEPOSIT_PERMISSION, SUPPLIER_PAYMENT_VOID_PERMISSION])).toBe(true)
  })
})

describe("due and post-dated", () => {
  it("is due when still in play and dated today or earlier", () => {
    expect(isChequeDue({ status: "on_hand", cheque_date: "2026-06-01" }, "2026-06-01")).toBe(true)
    expect(isChequeDue({ status: "presented", cheque_date: "2026-05-01" }, "2026-06-01")).toBe(true)
    expect(isChequeDue({ status: "on_hand", cheque_date: "2026-06-02" }, "2026-06-01")).toBe(false)
    expect(isChequeDue({ status: "cleared", cheque_date: "2026-05-01" }, "2026-06-01")).toBe(false)
  })

  it("is post-dated when dated after the payment", () => {
    expect(isPostDated({ cheque_date: "2026-06-10", payment_date: "2026-06-01" })).toBe(true)
    expect(isPostDated({ cheque_date: "2026-06-01", payment_date: "2026-06-01" })).toBe(false)
  })
})

describe("labels and texts", () => {
  it("labels and tones statuses", () => {
    expect(chequeStatusLabel("on_hand")).toBe("On hand")
    expect(chequeStatusTone("bounced")).toBe("danger")
    expect(chequeStatusTone("cleared")).toBe("success")
    expect(chequeStatusTone("on_hand")).toBe("warning")
  })

  it("describes what a clearance posts", () => {
    expect(clearancePostingText({ direction: "received", posted_to_bank: false })).toContain("Dr Bank / Cr Cheques in Hand")
    expect(clearancePostingText({ direction: "issued", posted_to_bank: false })).toContain("Dr Cheques Issued (2160) / Cr Bank")
    expect(clearancePostingText({ direction: "received", posted_to_bank: true })).toContain("nothing new is posted")
  })

  it("explains where the payment posts", () => {
    expect(chequePostingHint("receipt", { clearedOnDeposit: false, date: "2026-07-01" }, "2026-06-01")).toMatch(/^Post-dated: held in Cheques in Hand/)
    expect(chequePostingHint("payment", { clearedOnDeposit: false, date: "2026-06-01" }, "2026-06-01")).toMatch(/^held in Cheques Issued/)
    expect(chequePostingHint("receipt", { clearedOnDeposit: true, date: "" }, "2026-06-01")).toContain("straight to the bank")
  })

  it("totals by direction", () => {
    expect(chequeTotals([
      { direction: "received", amount: 100.1 },
      { direction: "received", amount: 0.2 },
      { direction: "issued", amount: 50 },
    ])).toEqual({ received: 100.3, issued: 50 })
  })
})

describe("validateChequeFields", () => {
  const ok = { ...EMPTY_CHEQUE_FIELDS, number: "004512", date: "2026-07-01", bank: "Nabil" }

  it("accepts a post-dated cheque", () => {
    expect(hasChequeErrors(validateChequeFields(ok, "2026-06-01"))).toBe(false)
  })

  it("requires the number and the date", () => {
    const errors = validateChequeFields(EMPTY_CHEQUE_FIELDS, "2026-06-01")
    expect(errors.number).toBeTruthy()
    expect(errors.date).toBeTruthy()
  })

  it("allows no details when not required", () => {
    expect(hasChequeErrors(validateChequeFields(EMPTY_CHEQUE_FIELDS, "2026-06-01", false))).toBe(false)
  })

  it("refuses a stale cheque and one dated over a year ahead", () => {
    expect(validateChequeFields({ ...ok, date: "2025-11-01" }, "2026-06-01").date).toMatch(/stale/)
    expect(validateChequeFields({ ...ok, date: "2027-07-01" }, "2026-06-01").date).toMatch(/year/)
  })

  it("caps the lengths", () => {
    expect(validateChequeFields({ ...ok, number: "1".repeat(33) }, "2026-06-01").number).toBeTruthy()
    expect(validateChequeFields({ ...ok, bank: "b".repeat(129) }, "2026-06-01").bank).toBeTruthy()
  })
})

describe("request mapping", () => {
  it("builds the cheque part of the request", () => {
    expect(chequePaymentRequest({ number: " 004512 ", date: "2026-07-01", bank: " ", clearedOnDeposit: true })).toEqual({
      chequeNumber: "004512",
      chequeDate: "2026-07-01",
      chequeBank: null,
      chequeClearedOnDeposit: true,
    })
    expect(chequePaymentRequest(EMPTY_CHEQUE_FIELDS)).toBeNull()
  })

  it("sends the cheque date as the API's business-date instant", () => {
    expect(chequeRequestBody({ chequeNumber: "1", chequeDate: "2026-07-01", chequeBank: "NIC", chequeClearedOnDeposit: false })).toEqual({
      chequeNumber: "1",
      chequeDateUtc: "2026-07-01T00:00:00Z",
      chequeBank: "NIC",
      chequeClearedOnDeposit: false,
    })
    expect(chequeRequestBody(null)).toEqual({})
  })

  it("reads the register filters from the URL", () => {
    expect(chequeFiltersFromSearch("view=cheques&due=1&direction=received&status=on_hand")).toMatchObject({
      dueOnly: true,
      direction: "received",
      status: "on_hand",
    })
    expect(chequeFiltersFromSearch("status=lost&direction=sideways")).toMatchObject({ dueOnly: false, direction: "", status: "" })
  })

  it("builds the search path", () => {
    const path = chequeSearchPath(
      { status: "on_hand", direction: "received", from: "2026-06-01", to: "", dueOnly: true, search: " Himal ", page: 2, pageSize: 50 },
      "b1",
    )
    const qs = new URLSearchParams(path.split("?")[1])
    expect(path.startsWith("/accounting/banking/cheques?")).toBe(true)
    expect(qs.get("status")).toBe("on_hand")
    expect(qs.get("dueOnly")).toBe("true")
    expect(qs.get("search")).toBe("Himal")
    expect(qs.get("pageNumber")).toBe("2")
    expect(qs.get("branchId")).toBe("b1")
    expect(qs.get("chequeDateFromUtc")).toBe("2026-05-31T18:15:00.000Z")
    expect(qs.has("chequeDateToUtc")).toBe(false)
  })

  it("maps a register row to Nepal days", () => {
    const dto: DotnetChequeDto = {
      id: "c1",
      direction: "received",
      status: "on_hand",
      partyId: "p1",
      partyName: "Himal Pharma",
      bankName: null,
      chequeNumber: "004512",
      chequeDateUtc: "2026-06-30T18:15:00Z",
      amount: 5000,
      paymentReferenceType: "CustomerPayment",
      paymentReferenceId: "pay1",
      paymentDateUtc: "2026-06-01T00:00:00Z",
      postedToBank: false,
      bankAccountId: null,
      depositedDateUtc: null,
      clearedDateUtc: null,
      branchId: null,
      notes: null,
      createdAtUtc: "2026-06-01T00:00:00Z",
      history: [
        {
          id: "h1",
          fromStatus: null,
          toStatus: "on_hand",
          effectiveDateUtc: "2026-06-01T00:00:00Z",
          changedAtUtc: "2026-06-01T00:00:00Z",
          changedBy: "system",
          note: null,
          voucherId: null,
        },
      ],
    }
    const row = toChequeRow(dto)
    expect(row.cheque_date).toBe("2026-07-01")
    expect(row.payment_date).toBe("2026-06-01")
    expect(row.history?.[0].to_status).toBe("on_hand")
  })
})
