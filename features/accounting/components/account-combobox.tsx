"use client"

import { forwardRef, useMemo, useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { AccountingAccount } from "@/features/accounting/api-client"
import { accountPath, buildAccountIndex, isPostable } from "@/features/accounting/lib/account-tree"

export const ACCOUNT_TYPE_ORDER = ["asset", "liability", "equity", "revenue", "expense"] as const

export const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Expenses",
}

interface AccountComboboxProps {
  accounts: AccountingAccount[]
  value: string
  onChange: (accountId: string) => void
  id?: string
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
  "aria-label"?: string
  "aria-describedby"?: string
  className?: string
  /** Hide inactive accounts from the list (still shown if currently selected). Default true. */
  activeOnly?: boolean
}

/**
 * Searchable picker for ledger (leaf) accounts — the only accounts vouchers can post to. Group accounts and
 * root heads are left out; each option shows its place in the tree ("Assets › Cash & bank"), and search
 * matches code, name or path. Keyboard: Enter/Space opens, type to filter, arrows to move, Enter to choose.
 */
export const AccountCombobox = forwardRef<HTMLButtonElement, AccountComboboxProps>(function AccountCombobox(
  {
    accounts,
    value,
    onChange,
    id,
    placeholder = "Select account",
    disabled,
    invalid,
    className,
    activeOnly = true,
    ...aria
  },
  ref
) {
  const [open, setOpen] = useState(false)
  const index = useMemo(() => buildAccountIndex(accounts), [accounts])
  const selected = index.byId.get(value)

  const groups = useMemo(() => {
    const visible = accounts.filter(
      (a) => a.id === value || (!a.is_root_head && !a.has_children && (activeOnly ? isPostable(a) : true))
    )
    const known = new Set<string>(ACCOUNT_TYPE_ORDER)
    const order = [...ACCOUNT_TYPE_ORDER, ...Array.from(new Set(visible.map((a) => a.account_type))).filter((t) => !known.has(t))]
    return order
      .map((type) => ({
        type,
        label: ACCOUNT_TYPE_LABEL[type] ?? type,
        items: visible
          .filter((a) => a.account_type === type)
          .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
          .map((a) => ({ account: a, parentPath: accountPath(a, index, { includeSelf: false }) })),
      }))
      .filter((g) => g.items.length > 0)
  }, [accounts, activeOnly, value, index])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={ref}
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          aria-label={aria["aria-label"]}
          aria-describedby={aria["aria-describedby"]}
          disabled={disabled}
          title={selected ? accountPath(selected, index) : undefined}
          className={cn(
            "h-9 w-full min-w-0 justify-between px-3 font-normal",
            !selected && "text-muted-foreground",
            invalid && "border-destructive focus-visible:ring-destructive/30",
            className
          )}
        >
          <span className="min-w-0 truncate text-left">
            {selected ? (
              <>
                <span className="num mr-1.5 font-mono text-xs text-muted-foreground">{selected.code}</span>
                {selected.name}
              </>
            ) : (
              placeholder
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,420px)] p-0" align="start">
        <Command
          filter={(itemValue, search) => (itemValue.toLowerCase().includes(search.toLowerCase().trim()) ? 1 : 0)}
        >
          <CommandInput placeholder="Search code, name or group…" />
          <CommandList>
            <CommandEmpty>No postable account matches.</CommandEmpty>
            {groups.map((g) => (
              <CommandGroup key={g.type} heading={g.label}>
                {g.items.map(({ account: a, parentPath }) => (
                  <CommandItem
                    key={a.id}
                    value={`${a.code} ${a.name} ${parentPath} ${a.id}`}
                    onSelect={() => {
                      onChange(a.id)
                      setOpen(false)
                    }}
                    className="cursor-pointer items-start"
                  >
                    <Check className={cn("mt-0.5 h-4 w-4", a.id === value ? "opacity-100" : "opacity-0")} aria-hidden />
                    <span className="num w-16 shrink-0 pt-px font-mono text-xs text-muted-foreground">{a.code}</span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{a.name}</span>
                      {parentPath && <span className="truncate text-xs text-muted-foreground">{parentPath}</span>}
                    </span>
                    {!a.is_active && <span className="ml-auto text-xs text-muted-foreground">inactive</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
})
