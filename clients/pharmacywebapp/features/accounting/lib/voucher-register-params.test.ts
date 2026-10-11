import { describe, expect, it } from "vitest"
import {
  defaultVoucherRegisterState,
  patchVoucherRegisterState,
  readVoucherRegisterState,
  toVoucherListParams,
  writeVoucherRegisterState,
} from "./voucher-register-params"
import { buildVoucherListPath } from "@/lib/api/accounting-api"

const ALL = { source: "all" as const }

describe("voucher register URL state", () => {
  it("defaults when the URL has nothing", () => {
    expect(readVoucherRegisterState(new URLSearchParams(""), "vr", ALL)).toEqual(defaultVoucherRegisterState(ALL))
  })

  it("round-trips every field and keeps unrelated params", () => {
    const state = { page: 3, pageSize: 50, status: "reversed" as const, voucherType: "system_sale", source: "system" as const, search: "RV-0" }
    const qs = writeVoucherRegisterState("view=register&from=x", "vr", state, ALL)
    const params = new URLSearchParams(qs)
    expect(params.get("view")).toBe("register")
    expect(params.get("vrPage")).toBe("3")
    expect(readVoucherRegisterState(params, "vr", ALL)).toEqual(state)
  })

  it("omits defaults from the URL", () => {
    expect(writeVoucherRegisterState("view=register", "vr", defaultVoucherRegisterState(ALL), ALL)).toBe("view=register")
  })

  it("keeps the two registers apart by prefix and honours each one's default source", () => {
    const qs = writeVoucherRegisterState("", "vr", { ...defaultVoucherRegisterState(ALL), status: "draft" }, ALL)
    expect(readVoucherRegisterState(new URLSearchParams(qs), "mj", { source: "manual" })).toEqual(
      defaultVoucherRegisterState({ source: "manual" })
    )
    const all = writeVoucherRegisterState("", "mj", { ...defaultVoucherRegisterState({ source: "manual" }), source: "all" }, { source: "manual" })
    expect(readVoucherRegisterState(new URLSearchParams(all), "mj", { source: "manual" }).source).toBe("all")
  })

  it("ignores invalid values", () => {
    const params = new URLSearchParams("vrPage=-2&vrSize=37&vrStatus=pending&vrType=drop%20table&vrSource=imported")
    expect(readVoucherRegisterState(params, "vr", ALL)).toEqual(defaultVoucherRegisterState(ALL))
  })
})

describe("patchVoucherRegisterState", () => {
  const base = { ...defaultVoucherRegisterState(ALL), page: 4 }
  it("resets to page 1 when a filter changes", () => {
    expect(patchVoucherRegisterState(base, { status: "posted" }).page).toBe(1)
    expect(patchVoucherRegisterState(base, { search: "x" }).page).toBe(1)
    expect(patchVoucherRegisterState(base, { pageSize: 50 }).page).toBe(1)
  })
  it("keeps the page for a page change or an unchanged filter", () => {
    expect(patchVoucherRegisterState(base, { page: 7 }).page).toBe(7)
    expect(patchVoucherRegisterState(base, { status: "all" }).page).toBe(4)
  })
})

describe("toVoucherListParams", () => {
  it("maps the state to an API request with every filter server-side", () => {
    const state = { page: 2, pageSize: 20, status: "voided" as const, voucherType: "all", source: "manual" as const, search: "  rent " }
    const params = toVoucherListParams(state, { from: "2026-09-01", to: "2026-09-30", branchId: "b1" })
    expect(params).toEqual({
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
      branchId: "b1",
      status: "voided",
      voucherType: undefined,
      source: "manual",
      search: "rent",
      page: 2,
      pageSize: 20,
    })
    const sp = new URLSearchParams(buildVoucherListPath(params).split("?")[1])
    expect(sp.get("pageNumber")).toBe("2")
    expect(sp.get("status")).toBe("voided")
  })
})
