import { describe, expect, it } from "vitest"
import {
  DEFAULT_TICKET_LIST_STATE,
  applyTicketListPatch,
  buildTicketListSearch,
  hasActiveTicketFilters,
  parsePositiveInt,
  parseTicketListParams,
  type TicketListUrlState,
} from "./ticket-list-params"

const parse = (query: string) => parseTicketListParams(new URLSearchParams(query))

describe("parsePositiveInt", () => {
  it("accepts positive integers", () => {
    expect(parsePositiveInt("3", 1)).toBe(3)
    expect(parsePositiveInt(" 12 ", 1)).toBe(12)
  })
  it("falls back for invalid values", () => {
    for (const raw of [null, undefined, "", "0", "-2", "1.5", "abc", "2x"]) {
      expect(parsePositiveInt(raw, 7)).toBe(7)
    }
  })
})

describe("parseTicketListParams", () => {
  it("returns defaults for an empty query", () => {
    expect(parse("")).toEqual(DEFAULT_TICKET_LIST_STATE)
  })

  it("reads every known param", () => {
    expect(parse("page=3&size=50&q=%20printer%20&status=InProgress&priority=Critical&tenant=acme&ticket=abc")).toEqual({
      page: 3,
      pageSize: 50,
      q: "printer",
      status: "InProgress",
      priority: "Critical",
      tenant: "acme",
      ticket: "abc",
    })
  })

  it("rejects unknown enum values and unsupported page sizes", () => {
    const state = parse("status=Pending&priority=urgent&size=15&page=0&ticket=%20")
    expect(state.status).toBeNull()
    expect(state.priority).toBeNull()
    expect(state.pageSize).toBe(10)
    expect(state.page).toBe(1)
    expect(state.ticket).toBeNull()
  })
})

describe("applyTicketListPatch", () => {
  const onPage3: TicketListUrlState = { ...DEFAULT_TICKET_LIST_STATE, page: 3 }

  it("resets to page 1 when a filter changes", () => {
    expect(applyTicketListPatch(onPage3, { status: "Open" }).page).toBe(1)
    expect(applyTicketListPatch(onPage3, { q: "x" }).page).toBe(1)
    expect(applyTicketListPatch(onPage3, { pageSize: 20 }).page).toBe(1)
    expect(applyTicketListPatch(onPage3, { tenant: "t1" }).page).toBe(1)
  })

  it("keeps the page when a filter is re-set to the same value", () => {
    expect(applyTicketListPatch(onPage3, { status: null, q: "" }).page).toBe(3)
  })

  it("keeps the page when only the selection changes", () => {
    expect(applyTicketListPatch(onPage3, { ticket: "t" })).toEqual({ ...onPage3, ticket: "t" })
  })

  it("honours an explicit page in the same patch", () => {
    expect(applyTicketListPatch(onPage3, { status: "Open", page: 2 }).page).toBe(2)
  })
})

describe("buildTicketListSearch", () => {
  it("omits defaults", () => {
    expect(buildTicketListSearch(DEFAULT_TICKET_LIST_STATE)).toBe("")
  })

  it("serializes non-default values and round-trips", () => {
    const state: TicketListUrlState = {
      page: 2,
      pageSize: 20,
      q: "printer jam",
      status: "Resolved",
      priority: "High",
      tenant: "acme",
      ticket: "id-1",
    }
    const query = buildTicketListSearch(state)
    expect(parse(query)).toEqual(state)
  })

  it("preserves params it does not own and drops stale owned ones", () => {
    const base = new URLSearchParams("scope=all-tenants&ticket=old&page=9")
    const query = buildTicketListSearch({ ...DEFAULT_TICKET_LIST_STATE, ticket: null }, base)
    expect(query).toBe("scope=all-tenants")
  })
})

describe("hasActiveTicketFilters", () => {
  it("detects any filter", () => {
    expect(hasActiveTicketFilters(DEFAULT_TICKET_LIST_STATE)).toBe(false)
    expect(hasActiveTicketFilters({ ...DEFAULT_TICKET_LIST_STATE, priority: "Low" })).toBe(true)
    expect(hasActiveTicketFilters({ ...DEFAULT_TICKET_LIST_STATE, tenant: " " })).toBe(false)
  })
})
