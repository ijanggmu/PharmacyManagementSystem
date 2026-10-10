import { describe, expect, it } from "vitest"
import type { AccountingAccount } from "@/features/accounting/api-client"
import {
  accountPath,
  buildAccountIndex,
  cannotHoldChildrenReason,
  descendantIds,
  flattenTree,
  isPostable,
  moveTargetReason,
} from "./account-tree"

function account(id: string, code: string, name: string, parent: string | null, extra: Partial<AccountingAccount> = {}): AccountingAccount {
  return {
    id,
    code,
    name,
    account_type: "asset",
    is_system: false,
    is_active: true,
    parent_id: parent,
    has_children: false,
    has_postings: false,
    is_root_head: false,
    ...extra,
  }
}

const assets = account("assets", "1", "Assets", null, { is_system: true, is_root_head: true, has_children: true })
const expenses = account("exp", "5", "Expenses", null, { account_type: "expense", is_system: true, is_root_head: true, has_children: true })
const cashGroup = account("grp", "1300", "Cash & bank", "assets", { has_children: true })
const petty = account("petty", "130001", "Petty cash", "grp")
const drawer = account("drawer", "130002", "Drawer", "grp", { has_postings: true })
const cash = account("cash", "1000", "Cash", "assets", { is_system: true })
const rent = account("rent", "5300", "Rent", "exp", { account_type: "expense" })
const all = [assets, expenses, cashGroup, petty, drawer, cash, rent]
const index = buildAccountIndex(all)

describe("account tree", () => {
  it("orders children by code and builds paths root first", () => {
    expect(index.childrenOf.get("assets")!.map((a) => a.code)).toEqual(["1000", "1300"])
    expect(accountPath(petty, index)).toBe("Assets › Cash & bank › Petty cash")
    expect(accountPath(petty, index, { includeSelf: false })).toBe("Assets › Cash & bank")
  })

  it("treats only active leaves as postable", () => {
    expect(isPostable(petty)).toBe(true)
    expect(isPostable(cashGroup)).toBe(false)
    expect(isPostable(assets)).toBe(false)
    expect(isPostable({ ...petty, is_active: false })).toBe(false)
  })

  it("collects descendants", () => {
    expect([...descendantIds("assets", index)].sort()).toEqual(["cash", "drawer", "grp", "petty"])
  })

  it("flattens only expanded branches", () => {
    const rows = flattenTree(index, { expanded: new Set(["assets"]) })
    expect(rows.map((r) => r.account.code)).toEqual(["1", "1000", "1300", "5"])
    expect(rows.find((r) => r.account.id === "grp")).toMatchObject({ depth: 1, childCount: 2, expanded: false })
  })

  it("shows matches with their ancestors when filtering", () => {
    const rows = flattenTree(index, { expanded: new Set(), filter: (a) => a.name.includes("Petty") })
    expect(rows.map((r) => r.account.code)).toEqual(["1", "1300", "130001"])
    expect(rows.every((r) => r.account.id === "petty" || r.expanded)).toBe(true)
  })

  it("explains which accounts can't hold sub-accounts", () => {
    expect(cannotHoldChildrenReason(assets)).toBeNull()
    expect(cannotHoldChildrenReason(cash)).toBe("Receives automatic postings")
    expect(cannotHoldChildrenReason(drawer)).toBe("Has voucher entries")
    expect(cannotHoldChildrenReason({ ...petty, is_active: false })).toBe("Inactive")
    expect(cannotHoldChildrenReason(petty)).toBeNull()
  })

  it("rejects cycles, system head changes and no-op moves", () => {
    expect(moveTargetReason(petty, [cashGroup], index)).toBe("Inside a selected account")
    expect(moveTargetReason(cashGroup, [cashGroup], index)).toBe("Selected")
    expect(moveTargetReason(expenses, [cash], index)).toBe("System accounts must stay under their head")
    expect(moveTargetReason(cashGroup, [petty], index)).toBe("Already here")
    expect(moveTargetReason(cashGroup, [cash], index)).toBeNull()
    expect(moveTargetReason(expenses, [petty], index)).toBeNull()
  })
})
