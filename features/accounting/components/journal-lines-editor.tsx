"use client"

import { useEffect, useRef, useState } from "react"
import { Plus, Scale, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import type { AccountingAccount } from "@/features/accounting/api-client"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import {
  balanceLine,
  emptyLine,
  parseAmount,
  type JournalLineDraft,
  type JournalLineError,
} from "@/features/accounting/lib/journal-form"
import { AccountCombobox } from "./account-combobox"
import { ScrollTable, stickyHeaderClass, totalsRowClass } from "./accounting-ui"

interface JournalLinesEditorProps {
  accounts: AccountingAccount[]
  lines: JournalLineDraft[]
  onChange: (lines: JournalLineDraft[]) => void
  /** Per-line errors keyed by line key; only shown when `showErrors`. */
  errors: Record<string, JournalLineError>
  showErrors: boolean
  disabled?: boolean
  accountsLoading?: boolean
  idPrefix?: string
}

/**
 * Double-entry line editor: account combobox, memo, separate Debit and Credit columns, running
 * totals with the difference, per-line "balance" helper, add/remove line.
 * Keyboard: Enter in an amount on the last line adds a new line and focuses its account.
 */
export function JournalLinesEditor({
  accounts,
  lines,
  onChange,
  errors,
  showErrors,
  disabled,
  accountsLoading,
  idPrefix = "jl",
}: JournalLinesEditorProps) {
  const { amount } = useAccountingMoney()
  const accountRefs = useRef(new Map<string, HTMLButtonElement | null>())
  const [focusKey, setFocusKey] = useState<string | null>(null)

  useEffect(() => {
    if (!focusKey) return
    accountRefs.current.get(focusKey)?.focus()
    setFocusKey(null)
  }, [focusKey, lines])

  const sum = (side: "debit" | "credit") =>
    lines.reduce((s, l) => {
      const n = parseAmount(l[side])
      return s + (Number.isNaN(n) ? 0 : n)
    }, 0)
  const debit = sum("debit")
  const credit = sum("credit")
  const difference = Math.round((debit - credit) * 100) / 100

  const update = (key: string, patch: Partial<JournalLineDraft>) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const addLine = () => {
    const l = emptyLine()
    onChange([...lines, l])
    setFocusKey(l.key)
  }

  const onAmountKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Enter" && index === lines.length - 1) {
      e.preventDefault()
      addLine()
    }
  }

  return (
    <div className="space-y-3">
      <ScrollTable maxHeight="max-h-[60vh]" label="Journal lines">
        <TableHeader className={stickyHeaderClass}>
          <TableRow>
            <TableHead className="w-10 text-right">#</TableHead>
            <TableHead className="min-w-[240px]">Account</TableHead>
            <TableHead className="min-w-[180px]">Memo</TableHead>
            <TableHead className="w-36 min-w-[128px] text-right">Debit</TableHead>
            <TableHead className="w-36 min-w-[128px] text-right">Credit</TableHead>
            <TableHead className="w-20">
              <span className="sr-only">Line actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line, idx) => {
            const err = showErrors ? errors[line.key] : undefined
            const accountErrId = `${idPrefix}-${line.key}-account-error`
            const amountErrId = `${idPrefix}-${line.key}-amount-error`
            const n = idx + 1
            return (
              <TableRow key={line.key} className={cn("align-top hover:bg-muted/30", err && "bg-destructive/[0.03]")}>
                <TableCell className="num pt-4 text-right text-muted-foreground">{n}</TableCell>
                <TableCell className="py-2">
                  <AccountCombobox
                    ref={(el) => {
                      accountRefs.current.set(line.key, el)
                    }}
                    accounts={accounts}
                    value={line.account_id}
                    onChange={(v) => update(line.key, { account_id: v })}
                    placeholder={accountsLoading ? "Loading accounts…" : "Select account"}
                    disabled={disabled || accountsLoading}
                    invalid={!!err?.account}
                    aria-label={`Line ${n} account`}
                    aria-describedby={err?.account ? accountErrId : undefined}
                  />
                  {err?.account && (
                    <p id={accountErrId} className="mt-1 text-xs text-destructive">
                      {err.account}
                    </p>
                  )}
                </TableCell>
                <TableCell className="py-2">
                  <Input
                    aria-label={`Line ${n} memo`}
                    value={line.description}
                    onChange={(e) => update(line.key, { description: e.target.value })}
                    placeholder="Optional"
                    disabled={disabled}
                  />
                </TableCell>
                <TableCell className="py-2">
                  <Input
                    inputMode="decimal"
                    aria-label={`Line ${n} debit`}
                    aria-invalid={!!err?.amount || undefined}
                    aria-describedby={err?.amount ? amountErrId : undefined}
                    className={cn("num text-right", err?.amount && "border-destructive")}
                    placeholder="0.00"
                    value={line.debit}
                    disabled={disabled}
                    onChange={(e) => {
                      const v = e.target.value
                      update(line.key, { debit: v, credit: v.trim() && parseAmount(v) > 0 ? "" : line.credit })
                    }}
                    onKeyDown={(e) => onAmountKeyDown(e, idx)}
                  />
                </TableCell>
                <TableCell className="py-2">
                  <Input
                    inputMode="decimal"
                    aria-label={`Line ${n} credit`}
                    aria-invalid={!!err?.amount || undefined}
                    aria-describedby={err?.amount ? amountErrId : undefined}
                    className={cn("num text-right", err?.amount && "border-destructive")}
                    placeholder="0.00"
                    value={line.credit}
                    disabled={disabled}
                    onChange={(e) => {
                      const v = e.target.value
                      update(line.key, { credit: v, debit: v.trim() && parseAmount(v) > 0 ? "" : line.debit })
                    }}
                    onKeyDown={(e) => onAmountKeyDown(e, idx)}
                  />
                  {err?.amount && (
                    <p id={amountErrId} className="mt-1 text-right text-xs text-destructive">
                      {err.amount}
                    </p>
                  )}
                </TableCell>
                <TableCell className="py-2">
                  <div className="flex justify-end gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-primary"
                      aria-label={`Balance the journal on line ${n}`}
                      title="Put the remaining difference on this line"
                      disabled={disabled || difference === 0}
                      onClick={() => onChange(balanceLine(lines, line.key))}
                    >
                      <Scale aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Remove line ${n}`}
                      title="Remove line"
                      disabled={disabled || lines.length <= 2}
                      onClick={() => onChange(lines.filter((l) => l.key !== line.key))}
                    >
                      <X aria-hidden />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
        <TableFooter>
          <TableRow className={totalsRowClass}>
            <TableCell />
            <TableCell colSpan={2}>
              <div className="flex flex-wrap items-center gap-2">
                <span>Totals</span>
                {debit === 0 && credit === 0 ? (
                  <span className="text-xs font-normal text-muted-foreground">Enter amounts to balance the entry</span>
                ) : difference === 0 ? (
                  <span className="rounded-md bg-success/10 px-2 py-0.5 text-xs font-medium text-success">Balanced</span>
                ) : (
                  <span className="rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                    {difference > 0 ? "Credits short by" : "Debits short by"} <span className="num">{amount(Math.abs(difference))}</span>
                  </span>
                )}
              </div>
            </TableCell>
            <TableCell className="num text-right">{amount(debit)}</TableCell>
            <TableCell className="num text-right">{amount(credit)}</TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      </ScrollTable>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addLine} disabled={disabled}>
          <Plus aria-hidden />
          Add line
        </Button>
        <p className="hidden text-xs text-muted-foreground sm:block">
          Tip: press <kbd className="rounded border bg-muted px-1 font-mono text-[11px]">Enter</kbd> in the last amount
          to add a line.
        </p>
      </div>
    </div>
  )
}
