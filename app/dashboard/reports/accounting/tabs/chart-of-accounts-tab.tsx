"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowRightLeft,
  BookMarked,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleSlash,
  CornerDownRight,
  FolderTree,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Pagination } from "@/components/ui/pagination"
import { SkeletonTable } from "@/components/ui/skeleton"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { cn } from "@/lib/utils"
import { accountingApi, type AccountingAccount } from "@/features/accounting/api-client"
import { ACCOUNT_TYPE_LABEL, ACCOUNT_TYPE_ORDER } from "@/features/accounting/components/account-combobox"
import { AccountFormDialog, MoveAccountsDialog, type AccountFormValues } from "@/features/accounting/components/account-dialogs"
import { useAccountPermissions } from "@/features/accounting/hooks/use-account-permissions"
import {
  accountPath,
  buildAccountIndex,
  cannotHoldChildrenReason,
  flattenTree,
  groupIds,
  isPostable,
} from "@/features/accounting/lib/account-tree"
import { QueryState, ScrollTable, stickyHeaderClass } from "../accounting-ui"
import { useAccountingContext } from "../accounting-context"

const PAGE_SIZE = 25
const COLUMN_COUNT = 6

const TYPE_TONE: Record<string, string> = {
  asset: "bg-chart-1",
  liability: "bg-chart-2",
  equity: "bg-chart-3",
  revenue: "bg-chart-4",
  expense: "bg-chart-5",
}

interface ChartOfAccountsTabProps {
  accounts: AccountingAccount[]
  setAccounts: Dispatch<SetStateAction<AccountingAccount[]>>
  accountsLoading?: boolean
}

export default function ChartOfAccountsTab({ accounts, setAccounts, accountsLoading = false }: ChartOfAccountsTabProps) {
  const { toast } = useToast()
  const router = useRouter()
  const { loadLedgerForAccountCode } = useAccountingContext()
  const perms = useAccountPermissions()

  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [showInactive, setShowInactive] = useState(true)
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const [loadError, setLoadError] = useState<unknown>(null)
  const [reloading, setReloading] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<AccountingAccount | null>(null)
  const [defaultParentId, setDefaultParentId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [moveTargets, setMoveTargets] = useState<AccountingAccount[] | null>(null)
  const [moving, setMoving] = useState(false)
  const [moveError, setMoveError] = useState<string | null>(null)

  const [deactivating, setDeactivating] = useState<AccountingAccount | null>(null)
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null)

  // Full tree for dialogs (paths, valid parents); the table works on the filtered one.
  const fullIndex = useMemo(() => buildAccountIndex(accounts), [accounts])

  // Hiding inactive accounts never orphans active ones: a group can only be deactivated once its sub-accounts are.
  const index = useMemo(
    () =>
      buildAccountIndex(
        accounts.filter((a) => (typeFilter === "all" || a.account_type === typeFilter) && (showInactive || a.is_active))
      ),
    [accounts, typeFilter, showInactive]
  )

  // Open the five heads the first time the chart arrives.
  const initialised = useRef(false)
  useEffect(() => {
    if (initialised.current || accounts.length === 0) return
    initialised.current = true
    setExpanded(new Set(fullIndex.roots.map((r) => r.id)))
  }, [accounts.length, fullIndex])

  const term = search.trim().toLowerCase()
  const rows = useMemo(
    () =>
      flattenTree(index, {
        expanded,
        filter: term ? (a) => a.code.toLowerCase().includes(term) || a.name.toLowerCase().includes(term) : undefined,
      }),
    [index, expanded, term]
  )

  const countsByType = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of accounts) if (!a.is_root_head) m.set(a.account_type, (m.get(a.account_type) ?? 0) + 1)
    return m
  }, [accounts])

  useEffect(() => setPage(1), [search, typeFilter, showInactive])

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const startIndex = (currentPage - 1) * PAGE_SIZE
  const pageRows = useMemo(() => rows.slice(startIndex, startIndex + PAGE_SIZE), [rows, startIndex])
  const continuedFrom = pageRows[0] && pageRows[0].depth > 0 ? fullIndex.byId.get(pageRows[0].account.parent_id ?? "") : undefined

  const isSelectable = (a: AccountingAccount) => perms.canUpdate && !a.is_root_head
  const pageSelectable = pageRows.map((r) => r.account).filter(isSelectable)
  const pageSelectedCount = pageSelectable.filter((a) => selectedIds.has(a.id)).length
  const allPageSelected = pageSelectable.length > 0 && pageSelectedCount === pageSelectable.length
  const somePageSelected = pageSelectedCount > 0 && !allPageSelected
  const selectedAccounts = useMemo(() => accounts.filter((a) => selectedIds.has(a.id)), [accounts, selectedIds])

  // Drop selections that no longer exist after a reload.
  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => fullIndex.byId.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [fullIndex])

  const toggleOne = (id: string, checked: boolean) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })

  const togglePage = (checked: boolean) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const a of pageSelectable) {
        if (checked) next.add(a.id)
        else next.delete(a.id)
      }
      return next
    })

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const reloadAccounts = async () => {
    setReloading(true)
    setLoadError(null)
    try {
      setAccounts((await accountingApi.getAccounts()) || [])
    } catch (e) {
      setLoadError(e)
    } finally {
      setReloading(false)
    }
  }

  const openCreate = (parentId: string | null = null) => {
    setEditing(null)
    setDefaultParentId(parentId)
    setFormOpen(true)
  }

  const openEdit = (account: AccountingAccount) => {
    setEditing(account)
    setDefaultParentId(null)
    setFormOpen(true)
  }

  const submitForm = async (values: AccountFormValues) => {
    setSaving(true)
    try {
      if (!editing) {
        await accountingApi.createAccount({ parentId: values.parentId, name: values.name })
        toast({ title: "Account created", description: `${values.name} added under ${fullIndex.byId.get(values.parentId)?.name ?? "its parent"}.` })
      } else {
        if (values.name !== editing.name) await accountingApi.renameAccount(editing.id, values.name)
        if (values.parentId !== editing.parent_id) await accountingApi.moveAccounts([editing.id], values.parentId)
        toast({ title: "Account updated", description: values.name })
      }
      setExpanded((prev) => new Set(prev).add(values.parentId))
      setFormOpen(false)
      await reloadAccounts()
    } catch (e) {
      toast({ title: editing ? "Couldn't update account" : "Couldn't create account", description: apiRequestErrorMessage(e), variant: "destructive" })
      // An edit can be two calls (rename, then move); refresh so a half-applied edit shows as it really is.
      if (editing) void reloadAccounts()
    } finally {
      setSaving(false)
    }
  }

  const openMove = (targets: AccountingAccount[]) => {
    setMoveError(null)
    setMoveTargets(targets)
  }

  const submitMove = async (targetParentId: string) => {
    if (!moveTargets) return
    setMoving(true)
    setMoveError(null)
    try {
      const moved = await accountingApi.moveAccounts(
        moveTargets.map((a) => a.id),
        targetParentId
      )
      const target = fullIndex.byId.get(targetParentId)
      toast({
        title: `Moved ${moved} ${moved === 1 ? "account" : "accounts"}`,
        description: target ? `Now under ${accountPath(target, fullIndex)}.` : undefined,
      })
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const a of moveTargets) next.delete(a.id)
        return next
      })
      setExpanded((prev) => new Set(prev).add(targetParentId))
      setMoveTargets(null)
      await reloadAccounts()
    } catch (e) {
      // All-or-nothing on the server, so nothing moved; show its reason verbatim.
      setMoveError(apiRequestErrorMessage(e))
    } finally {
      setMoving(false)
    }
  }

  const setActive = async (account: AccountingAccount, active: boolean) => {
    setStatusBusyId(account.id)
    try {
      if (active) await accountingApi.activateAccount(account.id)
      else await accountingApi.deactivateAccount(account.id)
      toast({ title: active ? "Account reactivated" : "Account deactivated", description: `${account.code} — ${account.name}` })
      setDeactivating(null)
      await reloadAccounts()
    } catch (e) {
      toast({
        title: active ? "Couldn't reactivate account" : "Couldn't deactivate account",
        description: apiRequestErrorMessage(e),
        variant: "destructive",
      })
    } finally {
      setStatusBusyId(null)
    }
  }

  const openLedger = (accountCode: string) => {
    void loadLedgerForAccountCode(accountCode).then(() => router.push("/dashboard/reports/accounting/register?view=ledger"))
  }

  const clearFilters = () => {
    setSearch("")
    setTypeFilter("all")
    setShowInactive(true)
  }

  return (
    <div className="min-w-0 space-y-3">
      <div role="group" aria-label="Filter by head" className="flex flex-wrap gap-1.5">
        {[
          { type: "all", label: "All", count: accounts.filter((a) => !a.is_root_head).length },
          ...ACCOUNT_TYPE_ORDER.map((t) => ({ type: t, label: ACCOUNT_TYPE_LABEL[t], count: countsByType.get(t) ?? 0 })),
        ].map((f) => {
          const active = typeFilter === f.type
          return (
            <button
              key={f.type}
              type="button"
              aria-pressed={active}
              onClick={() => setTypeFilter(f.type)}
              className={cn(
                "inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "border-primary/40 bg-primary/10 text-primary" : "bg-card text-muted-foreground hover:text-foreground"
              )}
            >
              {f.type !== "all" && <span className={cn("h-2 w-2 rounded-full", TYPE_TONE[f.type])} aria-hidden />}
              {f.label}
              <span className="num rounded-full bg-muted px-1.5 text-xs text-muted-foreground">{f.count}</span>
            </button>
          )
        })}
      </div>

      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-end sm:p-4">
          <div className="w-full space-y-1.5 sm:w-72">
            <Label htmlFor="coa-search" className="text-xs font-medium text-muted-foreground">
              Search
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input id="coa-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Code or name" className="pl-8" />
            </div>
          </div>
          <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show inactive accounts
          </label>
          <div className="flex flex-wrap items-center gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(groupIds(fullIndex))} disabled={!!term}>
              <ChevronsUpDown aria-hidden />
              Expand all
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(new Set())} disabled={!!term}>
              <ChevronsDownUp aria-hidden />
              Collapse all
            </Button>
          </div>
          {perms.canCreate && (
            <Button className="sm:ml-auto" onClick={() => openCreate()}>
              <Plus aria-hidden />
              New account
            </Button>
          )}
        </CardContent>
      </Card>

      <QueryState
        isLoading={accountsLoading && accounts.length === 0}
        error={loadError}
        onRetry={() => void reloadAccounts()}
        retrying={reloading}
        skeleton={<SkeletonTable rows={10} cols={COLUMN_COUNT} />}
        isEmpty={rows.length === 0}
        empty={
          accounts.length === 0
            ? {
                icon: BookOpen,
                title: "No accounts yet",
                description: "Vouchers can only post to accounts listed here.",
                action: perms.canCreate ? { label: "New account", onClick: () => openCreate(), icon: Plus } : undefined,
              }
            : { icon: Search, title: "No account matches", description: "Try another code, name or head.", action: { label: "Clear filters", onClick: clearFilters, icon: X } }
        }
      >
        <ScrollTable label="Chart of accounts">
          <TableHeader className={stickyHeaderClass}>
            <TableRow>
              <TableHead className="w-10">
                {perms.canUpdate && (
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer accent-primary align-middle disabled:cursor-not-allowed"
                    aria-label={allPageSelected ? "Deselect all accounts on this page" : "Select all accounts on this page"}
                    checked={allPageSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = somePageSelected
                    }}
                    disabled={pageSelectable.length === 0}
                    onChange={(e) => togglePage(e.target.checked)}
                  />
                )}
              </TableHead>
              <TableHead className="w-28">Code</TableHead>
              <TableHead className="min-w-[260px]">Account</TableHead>
              <TableHead className="w-40">Kind</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-24 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {continuedFrom && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={COLUMN_COUNT} className="py-1.5 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <CornerDownRight className="h-3.5 w-3.5" aria-hidden />
                    Continued under {accountPath(continuedFrom, fullIndex)}
                  </span>
                </TableCell>
              </TableRow>
            )}
            {pageRows.map(({ account: a, depth, childCount, descendantCount, expanded: isOpen }) => {
              const selectable = isSelectable(a)
              const selected = selectedIds.has(a.id)
              const isGroup = a.is_root_head || a.has_children
              const canAddChild = perms.canCreate && cannotHoldChildrenReason(a) === null
              const hasRowActions = canAddChild || perms.canUpdate || perms.canActivate || perms.canDeactivate
              return (
                <TableRow
                  key={a.id}
                  data-state={selected ? "selected" : undefined}
                  className={cn(
                    a.is_root_head && "bg-muted/40 hover:bg-muted/50",
                    !a.is_active && "text-muted-foreground",
                    selected && "bg-primary/5"
                  )}
                >
                  <TableCell>
                    {perms.canUpdate && !a.is_root_head && (
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer accent-primary align-middle disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={`Select ${a.code} ${a.name}`}
                        checked={selected}
                        disabled={!selectable}
                        onChange={(e) => toggleOne(a.id, e.target.checked)}
                      />
                    )}
                  </TableCell>
                  <TableCell className={cn("num font-mono", a.is_root_head && "font-semibold")}>{a.code}</TableCell>
                  <TableCell className="max-w-[420px]">
                    <div className="flex min-w-0 items-center gap-1" style={{ paddingLeft: `${depth * 1.25}rem` }}>
                      {childCount > 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          aria-expanded={isOpen}
                          aria-label={`${isOpen ? "Collapse" : "Expand"} ${a.name}`}
                          onClick={() => toggleExpanded(a.id)}
                          disabled={!!term}
                        >
                          <ChevronRight className={cn("transition-transform duration-150", isOpen && "rotate-90")} aria-hidden />
                        </Button>
                      ) : (
                        <span className="w-7 shrink-0" aria-hidden />
                      )}
                      {a.is_root_head && <span className={cn("h-2 w-2 shrink-0 rounded-full", TYPE_TONE[a.account_type])} aria-hidden />}
                      <span className={cn("truncate", a.is_root_head ? "font-semibold uppercase tracking-wide" : isGroup && "font-medium")} title={a.name}>
                        {a.name}
                      </span>
                      {a.is_system && !a.is_root_head && (
                        <Badge variant="muted" className="ml-1 shrink-0" title="Used by automatic postings — keeps its code and head">
                          <Lock aria-hidden />
                          System
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {isGroup ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title="Totals its sub-accounts; can't take journal lines">
                        <FolderTree className="h-3.5 w-3.5" aria-hidden />
                        {a.is_root_head ? "Head" : "Group"}
                        <span className="num">· {descendantCount}</span>
                      </span>
                    ) : isPostable(a) ? (
                      <span className="text-xs text-muted-foreground">Postable</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {a.is_root_head ? null : a.is_active ? (
                      <Badge variant="success">
                        <CheckCircle2 aria-hidden />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="muted">
                        <CircleSlash aria-hidden />
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-0.5">
                      {!isGroup && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          aria-label={`Open ledger for ${a.code} ${a.name}`}
                          title="Open ledger"
                          onClick={() => openLedger(a.code)}
                        >
                          <BookMarked aria-hidden />
                        </Button>
                      )}
                      {hasRowActions && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`Actions for ${a.code} ${a.name}`} loading={statusBusyId === a.id}>
                              <MoreHorizontal aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            {canAddChild && (
                              <DropdownMenuItem onSelect={() => openCreate(a.id)}>
                                <Plus aria-hidden />
                                Add sub-account
                              </DropdownMenuItem>
                            )}
                            {perms.canUpdate && !a.is_root_head && (
                              <>
                                <DropdownMenuItem onSelect={() => openEdit(a)}>
                                  <Pencil aria-hidden />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => openMove([a])}>
                                  <ArrowRightLeft aria-hidden />
                                  Move to…
                                </DropdownMenuItem>
                              </>
                            )}
                            {a.is_active && perms.canDeactivate && !a.is_system && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem variant="destructive" onSelect={() => setDeactivating(a)}>
                                  <CircleSlash aria-hidden />
                                  Deactivate
                                </DropdownMenuItem>
                              </>
                            )}
                            {!a.is_active && perms.canActivate && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={() => void setActive(a, true)}>
                                  <RotateCcw aria-hidden />
                                  Reactivate
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </ScrollTable>

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={rows.length}
          itemsPerPage={PAGE_SIZE}
          startIndex={startIndex}
          onPageChange={setPage}
          className="mt-3"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Journals post only to accounts without sub-accounts. Group accounts and heads total what sits beneath them.
        </p>
      </QueryState>

      {selectedIds.size > 0 && (
        <div
          role="region"
          aria-label="Bulk actions"
          className="sticky bottom-4 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2 rounded-full border bg-card py-1.5 pl-4 pr-1.5 shadow-lg"
        >
          <span className="text-sm font-medium" aria-live="polite">
            <span className="num">{selectedIds.size}</span> selected
          </span>
          <Button size="sm" onClick={() => openMove(selectedAccounts)}>
            <ArrowRightLeft aria-hidden />
            Move to parent…
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            <X aria-hidden />
            Clear
          </Button>
        </div>
      )}

      <AccountFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        account={editing}
        defaultParentId={defaultParentId}
        index={fullIndex}
        canMove={perms.canUpdate}
        saving={saving}
        onSubmit={(values) => void submitForm(values)}
      />

      <MoveAccountsDialog
        open={moveTargets !== null}
        onOpenChange={(open) => !open && setMoveTargets(null)}
        selected={moveTargets ?? []}
        index={fullIndex}
        saving={moving}
        error={moveError}
        onSubmit={(target) => void submitMove(target)}
      />

      <ConfirmDialog
        isOpen={deactivating !== null}
        onClose={() => statusBusyId === null && setDeactivating(null)}
        onConfirm={() => deactivating && void setActive(deactivating, false)}
        title={`Deactivate ${deactivating?.code ?? ""} ${deactivating?.name ?? ""}?`}
        description="It can't be used in new journals. Posted history stays in every report, and you can reactivate it at any time. A group can be deactivated only after its sub-accounts are. Accounts are never deleted because posted vouchers reference them."
        confirmText="Deactivate"
        variant="destructive"
        loading={statusBusyId !== null}
      />
    </div>
  )
}
