"use client"

/**
 * Payment accounts (Accounting › Finance setup): which cash / bank / wallet account each payment method's money
 * posts to — sale tenders, returns and refunds, customer receipts, supplier payments, expenses, deposits and VAT
 * payments all follow it. A method left on its default posts as before (cash → Cash 1000, insurance → Insurance
 * Receivable 1190, everything else → Bank 1010). Viewing needs Accounts.View; saving needs Accounts.Update and
 * adding a bank account Accounts.Create.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import { Landmark, Plus, Wallet } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { createIdempotencyKeyTracker } from "@/lib/api/idempotency"
import { accountingApi, type AccountingAccount } from "@/features/accounting/api-client"
import { InlineAlert, QueryState, ScrollTable, SectionHeading } from "@/features/accounting/components/accounting-ui"
import { useAccountPermissions } from "@/features/accounting/hooks/use-account-permissions"
import { usePaymentAccountMutations, usePaymentMethodAccounts } from "@/features/accounting/hooks/use-payment-accounts"
import {
  buildPaymentAccountsUpdate,
  draftFromRows,
  paymentAccountMethodLabel,
  paymentAccountOptions,
} from "@/features/accounting/lib/payment-accounts"

export interface PaymentAccountsPanelProps {
  accounts: AccountingAccount[]
  setAccounts: Dispatch<SetStateAction<AccountingAccount[]>>
  accountsLoading: boolean
}

export function PaymentAccountsPanel({ accounts, setAccounts, accountsLoading }: PaymentAccountsPanelProps) {
  const { toast } = useToast()
  const perms = useAccountPermissions()
  const mapping = usePaymentMethodAccounts()
  const { update, createBankAccount } = usePaymentAccountMutations()

  const rows = useMemo(() => mapping.data ?? [], [mapping.data])
  const [draft, setDraft] = useState<Record<string, string | null>>({})
  // Re-seed the editor whenever the saved mapping changes (first load, after a save).
  useEffect(() => setDraft(draftFromRows(rows)), [rows])

  const changes = useMemo(() => buildPaymentAccountsUpdate(rows, draft, accounts), [rows, draft, accounts])
  const dirty = changes.length > 0

  const [addOpen, setAddOpen] = useState(false)

  const save = () => {
    update.mutate(changes, {
      onSuccess: () => toast({ title: "Payment accounts saved", description: "New postings use the accounts you chose." }),
      onError: (e) => toast({ title: "Couldn't save payment accounts", description: apiRequestErrorMessage(e), variant: "destructive" }),
    })
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-6">
        <SectionHeading
          icon={Wallet}
          title="Payment accounts"
          description="Choose the cash, bank or wallet account each payment method's money goes to. Only new postings change — past vouchers stay where they are."
          actions={
            perms.canCreate ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(true)}>
                <Plus aria-hidden />
                Add bank account
              </Button>
            ) : null
          }
        />

        <QueryState
          isLoading={mapping.isLoading || accountsLoading}
          error={mapping.error}
          onRetry={() => void mapping.refetch()}
          retrying={mapping.isFetching}
          errorTitle="Couldn't load payment accounts"
        >
          <ScrollTable label="Payment method accounts">
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Payment method</TableHead>
                <TableHead>Posts to</TableHead>
                <TableHead className="hidden w-32 sm:table-cell">Default</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const options = paymentAccountOptions(accounts, row.method)
                const value = draft[row.method] ?? ""
                const current = accounts.find((a) => a.id === value)
                // A mapped account that has since become inactive or a group still shows, so the problem is visible.
                const listed = current && !options.some((o) => o.id === current.id) ? [current, ...options] : options
                return (
                  <TableRow key={row.method}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        {paymentAccountMethodLabel(row.method)}
                        {row.is_default && (
                          <Badge variant="outline" className="font-normal">
                            Default
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Label htmlFor={`pm-account-${row.method}`} className="sr-only">
                        Account for {paymentAccountMethodLabel(row.method)}
                      </Label>
                      <Select
                        value={value}
                        onValueChange={(v) => setDraft((d) => ({ ...d, [row.method]: v }))}
                        disabled={!perms.canUpdate || update.isPending}
                      >
                        <SelectTrigger id={`pm-account-${row.method}`} className="w-full sm:max-w-sm">
                          <SelectValue placeholder="Choose an account" />
                        </SelectTrigger>
                        <SelectContent>
                          {listed.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              <span className="num">{a.code}</span> {a.name}
                              {!a.is_active ? " (inactive)" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                      <span className="num">{row.default_account_code}</span>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </ScrollTable>

          <InlineAlert tone="info">
            Money methods can use any active cash &amp; bank account (codes 10xx). Insurance claims can use any asset account,
            since the insurer pays later. Pick the default account again to go back to the default.
          </InlineAlert>

          {perms.canUpdate ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" disabled={!dirty || update.isPending} onClick={() => setDraft(draftFromRows(rows))}>
                Discard changes
              </Button>
              <Button type="button" disabled={!dirty} loading={update.isPending} loadingText="Saving…" onClick={save}>
                Save payment accounts
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">You can view these accounts. Changing them needs permission to update accounts.</p>
          )}
        </QueryState>
      </CardContent>

      {addOpen && (
        <AddBankAccountDialog
          onOpenChange={setAddOpen}
          create={createBankAccount}
          onCreated={async (name) => {
            toast({ title: "Bank account added", description: `${name} can now be chosen for payment methods, deposits and reconciliation.` })
            try {
              setAccounts(await accountingApi.getAccounts())
            } catch {
              // The account exists; the chart refreshes on the next load.
            }
          }}
        />
      )}
    </Card>
  )
}

function AddBankAccountDialog({
  onOpenChange,
  create,
  onCreated,
}: {
  onOpenChange: (open: boolean) => void
  create: ReturnType<typeof usePaymentAccountMutations>["createBankAccount"]
  onCreated: (name: string) => void | Promise<void>
}) {
  const { toast } = useToast()
  const [name, setName] = useState("")
  const [touched, setTouched] = useState(false)
  // One Idempotency-Key per account: a retried submit of the same name is replayed, not created twice.
  const keys = useRef(createIdempotencyKeyTracker())
  const error = name.trim() ? undefined : "Name the account, e.g. “Nabil Bank – current”."
  const busy = create.isPending

  const submit = () => {
    setTouched(true)
    if (error) return
    const trimmed = name.trim()
    create.mutate(
      { name: trimmed, idempotency_key: keys.current.keyFor(trimmed) },
      {
        onSuccess: async (_id, vars) => {
          keys.current.reset()
          await onCreated(vars.name)
          onOpenChange(false)
        },
        onError: (e) => toast({ title: "Couldn't add the bank account", description: apiRequestErrorMessage(e), variant: "destructive" }),
      }
    )
  }

  return (
    <Dialog open onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md" showCloseButton={!busy}>
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-primary" aria-hidden />
            Add bank account
          </DialogTitle>
          <DialogDescription>
            A new bank, wallet or till account in the cash &amp; bank block (next to Cash 1000 and Bank 1010). Its code is
            assigned for you.
          </DialogDescription>
        </DialogHeader>
        <form
          id="add-bank-account-form"
          noValidate
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <Label htmlFor="bank-account-name">
            Account name <span className="text-destructive" aria-hidden>*</span>
          </Label>
          <Input
            id="bank-account-name"
            value={name}
            maxLength={256}
            autoFocus
            placeholder="Nabil Bank – current"
            onChange={(e) => setName(e.target.value)}
            aria-invalid={touched && !!error}
            disabled={busy}
          />
          <FieldError message={touched ? error : undefined} />
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="add-bank-account-form" loading={busy} loadingText="Adding…">
            Add account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
