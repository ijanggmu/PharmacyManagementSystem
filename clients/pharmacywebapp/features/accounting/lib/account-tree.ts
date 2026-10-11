import type { AccountingAccount } from "@/features/accounting/api-client"

/**
 * Chart-of-accounts tree helpers. The server owns the rules (leaf-only posting, valid move targets);
 * these mirror them so the UI can explain choices before a request is made.
 */

export const PATH_SEPARATOR = " › "

export interface AccountIndex {
  byId: Map<string, AccountingAccount>
  /** Children by parent id, ordered by code; key `null` holds the roots. */
  childrenOf: Map<string | null, AccountingAccount[]>
  roots: AccountingAccount[]
}

const byCode = (a: AccountingAccount, b: AccountingAccount) => a.code.localeCompare(b.code, undefined, { numeric: true })

/** True when the parent id is unknown too (a parent outside the list) — such rows are shown as roots. */
function parentKey(account: AccountingAccount, byId: Map<string, AccountingAccount>): string | null {
  return account.parent_id && byId.has(account.parent_id) ? account.parent_id : null
}

export function buildAccountIndex(accounts: readonly AccountingAccount[]): AccountIndex {
  const byId = new Map(accounts.map((a) => [a.id, a]))
  const childrenOf = new Map<string | null, AccountingAccount[]>()
  for (const account of accounts) {
    const key = parentKey(account, byId)
    const list = childrenOf.get(key)
    if (list) list.push(account)
    else childrenOf.set(key, [account])
  }
  for (const list of childrenOf.values()) list.sort(byCode)
  return { byId, childrenOf, roots: childrenOf.get(null) ?? [] }
}

/** Voucher lines may only use active leaves (no sub-accounts, not a root head). */
export function isPostable(account: AccountingAccount): boolean {
  return account.is_active && !account.has_children && !account.is_root_head
}

/** Ancestors from the root down to (excluding) the account. */
export function ancestorsOf(account: AccountingAccount, index: AccountIndex): AccountingAccount[] {
  const chain: AccountingAccount[] = []
  const seen = new Set<string>([account.id])
  let parentId = account.parent_id
  while (parentId && !seen.has(parentId)) {
    const parent = index.byId.get(parentId)
    if (!parent) break
    chain.unshift(parent)
    seen.add(parent.id)
    parentId = parent.parent_id
  }
  return chain
}

/** "Assets › Cash & bank › Petty cash" (names, root first, including the account itself). */
export function accountPath(account: AccountingAccount, index: AccountIndex, { includeSelf = true } = {}): string {
  const names = ancestorsOf(account, index).map((a) => a.name)
  if (includeSelf) names.push(account.name)
  return names.join(PATH_SEPARATOR)
}

export function descendantIds(accountId: string, index: AccountIndex): Set<string> {
  const out = new Set<string>()
  const stack = [...(index.childrenOf.get(accountId) ?? [])]
  while (stack.length > 0) {
    const next = stack.pop()!
    if (out.has(next.id)) continue
    out.add(next.id)
    stack.push(...(index.childrenOf.get(next.id) ?? []))
  }
  return out
}

export interface TreeRow {
  account: AccountingAccount
  depth: number
  childCount: number
  descendantCount: number
  expanded: boolean
}

/**
 * Depth-first rows of the visible tree. Without a filter, children show only under expanded parents.
 * With a filter, every match shows with its ancestors (expanded), so results keep their context.
 */
export function flattenTree(
  index: AccountIndex,
  options: { expanded: ReadonlySet<string>; filter?: (account: AccountingAccount) => boolean },
): TreeRow[] {
  const { expanded, filter } = options
  let keep: Set<string> | null = null
  if (filter) {
    keep = new Set<string>()
    for (const account of index.byId.values()) {
      if (!filter(account)) continue
      keep.add(account.id)
      for (const ancestor of ancestorsOf(account, index)) keep.add(ancestor.id)
    }
  }

  const rows: TreeRow[] = []
  const visit = (account: AccountingAccount, depth: number) => {
    if (keep && !keep.has(account.id)) return
    const children = index.childrenOf.get(account.id) ?? []
    const isOpen = keep ? children.some((c) => keep!.has(c.id)) : expanded.has(account.id)
    rows.push({
      account,
      depth,
      childCount: children.length,
      descendantCount: descendantIds(account.id, index).size,
      expanded: isOpen && children.length > 0,
    })
    if (isOpen) for (const child of children) visit(child, depth + 1)
  }
  for (const root of index.roots) visit(root, 0)
  return rows
}

/** Ids of every account that has children — for "Expand all". */
export function groupIds(index: AccountIndex): Set<string> {
  return new Set([...index.childrenOf.keys()].filter((k): k is string => k !== null))
}

/**
 * Why an account can't be the parent of new or moved accounts, or null if it can. Mirrors the server's
 * AccountTreeRules: root heads always can; inactive accounts, system ledger accounts (automatic postings
 * target them) and leaves with voucher entries can't.
 */
export function cannotHoldChildrenReason(account: AccountingAccount): string | null {
  if (!account.is_active) return "Inactive"
  if (account.is_root_head) return null
  if (account.is_system) return "Receives automatic postings"
  if (!account.has_children && account.has_postings) return "Has voucher entries"
  return null
}

/** Why `target` can't receive the `selected` accounts, or null if the move is allowed. */
export function moveTargetReason(
  target: AccountingAccount,
  selected: readonly AccountingAccount[],
  index: AccountIndex,
): string | null {
  const selectedIds = new Set(selected.map((a) => a.id))
  if (selectedIds.has(target.id)) return "Selected"
  if (ancestorsOf(target, index).some((a) => selectedIds.has(a.id))) return "Inside a selected account"
  const holdReason = cannotHoldChildrenReason(target)
  if (holdReason) return holdReason
  for (const account of selected) {
    if (account.account_type === target.account_type) continue
    const subtree = [account, ...[...descendantIds(account.id, index)].map((id) => index.byId.get(id)!)]
    if (subtree.some((a) => a.is_system)) return "System accounts must stay under their head"
  }
  if (selected.length > 0 && selected.every((a) => a.parent_id === target.id)) return "Already here"
  return null
}

/** Root head of an account (itself when it is one). */
export function rootOf(account: AccountingAccount, index: AccountIndex): AccountingAccount {
  return ancestorsOf(account, index)[0] ?? account
}
