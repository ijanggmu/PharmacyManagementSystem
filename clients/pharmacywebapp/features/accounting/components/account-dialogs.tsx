"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, ArrowRightLeft, Check, ChevronsUpDown, FolderTree, Hash, Lock, Plus, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { accountingApi, type AccountingAccount } from "@/features/accounting/api-client"
import { ACCOUNT_TYPE_LABEL } from "@/features/accounting/components/account-combobox"
import {
  type AccountIndex,
  accountPath,
  cannotHoldChildrenReason,
  descendantIds,
  flattenTree,
  groupIds,
  moveTargetReason,
} from "@/features/accounting/lib/account-tree"

function Required() {
  return (
    <span className="text-destructive" aria-hidden>
      {" "}*
    </span>
  )
}

/**
 * Picks a parent from the whole chart, drawn as an indented tree. Accounts that can't be chosen stay
 * visible (so the structure reads) but are disabled with the reason beside them.
 */
export function AccountTreePicker({
  id,
  index,
  value,
  onChange,
  disabledReason,
  placeholder = "Choose a parent account",
  describedBy,
  invalid,
}: {
  id: string
  index: AccountIndex
  value: string
  onChange: (accountId: string) => void
  disabledReason: (account: AccountingAccount) => string | null
  placeholder?: string
  describedBy?: string
  invalid?: boolean
}) {
  const [open, setOpen] = useState(false)
  const rows = useMemo(() => flattenTree(index, { expanded: groupIds(index) }), [index])
  const selected = index.byId.get(value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={cn("h-auto min-h-9 w-full justify-between px-3 py-1.5 font-normal", !selected && "text-muted-foreground")}
        >
          {selected ? (
            <span className="flex min-w-0 flex-col items-start text-left">
              <span className="truncate">
                <span className="num mr-1.5 font-mono text-xs text-muted-foreground">{selected.code}</span>
                {selected.name}
              </span>
              {selected.parent_id && (
                <span className="truncate text-xs text-muted-foreground">{accountPath(selected, index, { includeSelf: false })}</span>
              )}
            </span>
          ) : (
            placeholder
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,440px)] p-0" align="start">
        <Command filter={(itemValue, search) => (itemValue.toLowerCase().includes(search.toLowerCase().trim()) ? 1 : 0)}>
          <CommandInput placeholder="Search code or name…" />
          <CommandList className="max-h-[min(60vh,360px)]">
            <CommandEmpty>No account matches.</CommandEmpty>
            {rows.map(({ account: a, depth }) => {
              const reason = disabledReason(a)
              return (
                <CommandItem
                  key={a.id}
                  value={`${a.code} ${a.name} ${a.id}`}
                  disabled={reason !== null}
                  onSelect={() => {
                    onChange(a.id)
                    setOpen(false)
                  }}
                  className="cursor-pointer"
                  style={{ paddingLeft: `${0.5 + depth * 1.1}rem` }}
                >
                  <Check className={cn("h-4 w-4 shrink-0", a.id === value ? "opacity-100" : "opacity-0")} aria-hidden />
                  <span className="num shrink-0 font-mono text-xs text-muted-foreground">{a.code}</span>
                  <span className={cn("min-w-0 truncate", a.is_root_head && "font-semibold")}>{a.name}</span>
                  {reason && <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground">{reason}</span>}
                </CommandItem>
              )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** Live preview of the code a new account would get under `parentId` (not reserved until saved). */
function useNextCode(parentId: string, enabled: boolean) {
  const [state, setState] = useState<{ code: string | null; error: string | null; loading: boolean }>({ code: null, error: null, loading: false })
  useEffect(() => {
    if (!enabled || !parentId) {
      setState({ code: null, error: null, loading: false })
      return
    }
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    accountingApi
      .getNextAccountCode(parentId)
      .then((code) => !cancelled && setState({ code: String(code), error: null, loading: false }))
      .catch((e) => !cancelled && setState({ code: null, error: apiRequestErrorMessage(e), loading: false }))
    return () => {
      cancelled = true
    }
  }, [parentId, enabled])
  return state
}

export interface AccountFormValues {
  name: string
  parentId: string
}

/**
 * Create (account = null) or edit an account. New accounts get a code generated from their parent
 * (previewed here). Editing renames, or moves the account under another parent — non-system accounts
 * then get a new code from the new parent; system accounts keep theirs.
 */
export function AccountFormDialog({
  open,
  onOpenChange,
  account,
  defaultParentId,
  index,
  canMove,
  saving,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  account: AccountingAccount | null
  /** Pre-selected parent for "Add sub-account". */
  defaultParentId?: string | null
  index: AccountIndex
  canMove: boolean
  saving: boolean
  onSubmit: (values: AccountFormValues) => void
}) {
  const editing = account !== null
  const [name, setName] = useState("")
  const [parentId, setParentId] = useState("")
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(account?.name ?? "")
    setParentId(account?.parent_id ?? defaultParentId ?? "")
    setTouched(false)
  }, [open, account, defaultParentId])

  const parentChanged = editing && parentId !== (account.parent_id ?? "")
  const preview = useNextCode(parentId, open && (!editing || (parentChanged && !account.is_system)))
  const parent = index.byId.get(parentId)

  const excluded = useMemo(() => (account ? new Set([account.id, ...descendantIds(account.id, index)]) : new Set<string>()), [account, index])
  const parentReason = (candidate: AccountingAccount): string | null => {
    if (excluded.has(candidate.id)) return candidate.id === account?.id ? "This account" : "Inside this account"
    if (account) return moveTargetReason(candidate, [account], index) === "Already here" ? null : moveTargetReason(candidate, [account], index)
    return cannotHoldChildrenReason(candidate)
  }

  const nameError = !name.trim() ? "Enter the account name" : undefined
  const parentError = !parentId ? "Choose where this account sits" : parent && parentReason(parent) ? parentReason(parent)! : undefined
  const unchanged = editing && name.trim() === account.name && !parentChanged
  const headChange = editing && parent && parent.account_type !== account.account_type

  const submit = () => {
    setTouched(true)
    if (nameError || parentError || unchanged) return
    onSubmit({ name: name.trim(), parentId })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit account" : "New account"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Rename the account, or move it under another parent."
              : "Place the account in the chart; its code is numbered from its parent automatically."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="account-parent">
              Parent
              <Required />
            </Label>
            {editing && (!canMove || account.is_root_head) ? (
              <p id="account-parent" className="flex min-h-9 items-center gap-1.5 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                <Lock className="h-3.5 w-3.5" aria-hidden />
                {account.is_root_head ? "Root head — top of the chart" : parent ? accountPath(parent, index) : "—"}
              </p>
            ) : (
              <AccountTreePicker
                id="account-parent"
                index={index}
                value={parentId}
                onChange={setParentId}
                disabledReason={parentReason}
                describedBy="account-parent-help"
                invalid={touched && !!parentError}
              />
            )}
            {touched && parentError ? (
              <FieldError message={parentError} />
            ) : (
              <p id="account-parent-help" className="text-xs text-muted-foreground">
                {headChange ? (
                  <span className="inline-flex items-start gap-1 text-warning">
                    <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />
                    Moves from {ACCOUNT_TYPE_LABEL[account.account_type]} to {ACCOUNT_TYPE_LABEL[parent.account_type]} — reports reclassify its whole history.
                  </span>
                ) : (
                  "A parent becomes a group account: it totals its sub-accounts and can't take journal lines itself."
                )}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="account-name">
              Account name
              <Required />
            </Label>
            <Input
              id="account-name"
              placeholder="e.g. Petty cash"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name && setTouched(true)}
              aria-invalid={touched && !!nameError}
              autoFocus={!editing && !!defaultParentId}
            />
            {touched && <FieldError message={nameError} />}
          </div>

          <div className="flex items-start gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
            <Hash className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 space-y-0.5 text-sm" aria-live="polite">
              <p className="text-xs font-medium text-muted-foreground">Code</p>
              {editing && (!parentChanged || account.is_system) ? (
                <p>
                  <span className="num font-mono font-medium">{account.code}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {account.is_system ? "System accounts keep their code." : "Changes only if you move the account."}
                  </span>
                </p>
              ) : preview.loading ? (
                <p className="text-muted-foreground">Working out the next number…</p>
              ) : preview.error ? (
                <p className="text-destructive">{preview.error}</p>
              ) : preview.code ? (
                <p>
                  {editing && <span className="num mr-1.5 font-mono text-muted-foreground line-through">{account.code}</span>}
                  <span className="num font-mono font-medium">{preview.code}</span>
                  <span className="ml-2 text-xs text-muted-foreground">generated from the parent{editing ? "; sub-accounts are renumbered too" : ""}</span>
                </p>
              ) : (
                <p className="text-muted-foreground">Choose a parent to see the code.</p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} loadingText="Saving…" disabled={unchanged || (!editing && !!preview.error)}>
              {editing ? <Save aria-hidden /> : <Plus aria-hidden />}
              {editing ? "Save changes" : "Create account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Moves the selected accounts (with their sub-accounts) under one parent, all-or-nothing. */
export function MoveAccountsDialog({
  open,
  onOpenChange,
  selected,
  index,
  saving,
  error,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  selected: readonly AccountingAccount[]
  index: AccountIndex
  saving: boolean
  error: string | null
  onSubmit: (targetParentId: string) => void
}) {
  const [target, setTarget] = useState("")
  useEffect(() => {
    if (open) setTarget("")
  }, [open])

  const targetAccount = index.byId.get(target)
  const reason = targetAccount ? moveTargetReason(targetAccount, selected, index) : null
  const carried = useMemo(
    () => selected.reduce((n, a) => n + [...descendantIds(a.id, index)].filter((id) => !selected.some((s) => s.id === id)).length, 0),
    [selected, index]
  )
  const headChange = targetAccount && selected.some((a) => a.account_type !== targetAccount.account_type)

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Move to another parent</DialogTitle>
          <DialogDescription>
            {selected.length} {selected.length === 1 ? "account" : "accounts"} selected
            {carried > 0 && (
              <>
                {" "}— their <span className="num">{carried}</span> sub-{carried === 1 ? "account moves" : "accounts move"} with them
              </>
            )}
            .
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-36 space-y-1 overflow-y-auto rounded-md border bg-muted/30 p-2 text-sm" aria-label="Selected accounts">
          {selected.map((a) => (
            <li key={a.id} className="flex min-w-0 items-baseline gap-2">
              <span className="num shrink-0 font-mono text-xs text-muted-foreground">{a.code}</span>
              <span className="truncate">{a.name}</span>
              <span className="ml-auto truncate text-xs text-muted-foreground">{accountPath(a, index, { includeSelf: false })}</span>
            </li>
          ))}
        </ul>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (target && !reason) onSubmit(target)
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="move-parent">
              Move under
              <Required />
            </Label>
            <AccountTreePicker
              id="move-parent"
              index={index}
              value={target}
              onChange={setTarget}
              disabledReason={(a) => moveTargetReason(a, selected, index)}
              placeholder="Choose the new parent"
              describedBy="move-parent-help"
            />
            <p id="move-parent-help" className="flex items-start gap-1.5 text-xs text-muted-foreground">
              {headChange ? (
                <>
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
                  <span>
                    Some accounts change head to {ACCOUNT_TYPE_LABEL[targetAccount.account_type]}; reports reclassify their whole history.
                  </span>
                </>
              ) : (
                <>
                  <FolderTree className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>Codes are renumbered from the new parent (system accounts keep theirs). Posted history is unaffected.</span>
                </>
              )}
            </p>
          </div>
          {error && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter className="gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} loadingText="Moving…" disabled={!target || !!reason}>
              <ArrowRightLeft aria-hidden />
              {target && !reason ? `Move ${selected.length} ${selected.length === 1 ? "account" : "accounts"}` : "Move"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
