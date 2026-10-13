"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DIALOG_CONTENT_DETAIL_CLASS,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ScrollText, ExternalLink } from "lucide-react"
import Link from "next/link"
import { useToast } from "@/hooks/use-toast"
import { CurrencyDisplay } from "@/components/currency-display"
import { suppliersApi, type Supplier } from "@/features/suppliers/api-client"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { BranchFilterSelect, useBranchFilter } from "@/features/branches/components/branch-filter"

interface LedgerEntry {
  id: string
  entry_date: string
  entry_type: string
  reference_number?: string | null
  supplier_bill_number?: string | null
  amount: string | number
  balance_after?: string | number | null
  description?: string | null
  branch_id?: string | null
  is_voided?: boolean
}

interface SupplierLedgerModalProps {
  supplier: Supplier | null
  isOpen: boolean
  onClose: () => void
}

export default function SupplierLedgerModal({ supplier, isOpen, onClose }: SupplierLedgerModalProps) {
  // With one branch selected, balances are recomputed from that branch's entries.
  const branchFilter = useBranchFilter()
  const ledgerBranchId = branchFilter.branchId
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [balance, setBalance] = useState<number>(0)
  const [meta, setMeta] = useState<{
    name: string | null
    reconciliation_account_ref: string | null
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  /** Bumped by "Try again" to re-run the load effect. */
  const [reloadKey, setReloadKey] = useState(0)
  const { toast } = useToast()

  useEffect(() => {
    if (!isOpen || !supplier) {
      setEntries([])
      setBalance(0)
      setMeta(null)
      return
    }

    const load = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const { data: summary, error: ledgerError } = await suppliersApi.getLedger(supplier.id, ledgerBranchId)
        if (ledgerError || !summary) throw new Error(ledgerError || "Failed to load ledger")
        setBalance(Number(summary.balance ?? 0))
        setEntries(summary.entries)
        setMeta(
          summary.supplier
            ? { name: summary.supplier.name, reconciliation_account_ref: summary.supplier.reconciliation_account_ref }
            : { name: supplier.name, reconciliation_account_ref: supplier.reconciliation_account_ref ?? null }
        )
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Could not load supplier ledger")
        toast({
          title: "Ledger error",
          description: e instanceof Error ? e.message : "Could not load supplier ledger",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [isOpen, supplier, toast, reloadKey, ledgerBranchId])

  if (!supplier) return null

  const balanceState =
    balance > 0
      ? { label: "Payable", variant: "warning" as const, hint: "You owe this supplier" }
      : balance < 0
        ? { label: "Credit balance", variant: "info" as const, hint: "Paid more than billed" }
        : { label: "Settled", variant: "success" as const, hint: "Nothing outstanding" }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`${DIALOG_CONTENT_DETAIL_CLASS} max-w-3xl max-h-[90vh] flex flex-col`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-primary" aria-hidden />
            <span className="min-w-0 truncate">Supplier ledger — {supplier.name}</span>
          </DialogTitle>
          <DialogDescription>
            Trade payables movement (goods receipts and payments). Match supplier tax invoices to the{" "}
            <span className="font-medium">supplier bill no.</span> column below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 flex-1 min-h-0 flex flex-col">
          <BranchFilterSelect filter={branchFilter} id="supplier-ledger-branch" label="Branch" className="max-w-xs" />
          {meta?.reconciliation_account_ref ? (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Statement ref:</span>{" "}
              {meta.reconciliation_account_ref}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current balance</p>
              {loading ? (
                <Skeleton className="mt-1 h-7 w-36" />
              ) : (
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "num text-2xl font-semibold",
                      balance > 0 ? "text-warning" : "text-foreground"
                    )}
                  >
                    <CurrencyDisplay amount={balance} />
                  </span>
                  <Badge variant={balanceState.variant} title={balanceState.hint}>
                    {balanceState.label}
                  </Badge>
                </div>
              )}
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/reports/accounting">
                <ExternalLink aria-hidden />
                Payments &amp; GL
              </Link>
            </Button>
          </div>

          <div className="border rounded-md flex-1 min-h-0 overflow-auto">
            {loading ? (
              <div className="p-3" aria-busy aria-label="Loading ledger">
                <SkeletonTable rows={5} cols={6} />
              </div>
            ) : loadError ? (
              <ErrorState
                size="compact"
                title="Couldn't load the ledger"
                message={loadError}
                onRetry={() => setReloadKey((k) => k + 1)}
              />
            ) : entries.length === 0 ? (
              <EmptyState
                size="compact"
                icon={ScrollText}
                title="No ledger entries yet"
                description="Goods receipts and payments for this supplier will appear here once they are posted."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    {branchFilter.showBranchColumn && <TableHead>Branch</TableHead>}
                    <TableHead>Reference</TableHead>
                    <TableHead>Supplier bill no.</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="num whitespace-nowrap text-xs">
                        {String(row.entry_date).slice(0, 10)}
                      </TableCell>
                      <TableCell className="text-xs capitalize">
                        {row.entry_type}
                        {row.is_voided && (
                          <Badge variant="danger" className="ml-1 normal-case">
                            Voided
                          </Badge>
                        )}
                      </TableCell>
                      {branchFilter.showBranchColumn && (
                        <TableCell className="whitespace-nowrap text-xs">{branchFilter.branchName(row.branch_id)}</TableCell>
                      )}
                      <TableCell className="text-xs font-mono">
                        <span className="block max-w-[10rem] truncate" title={row.reference_number ?? undefined}>
                          {row.reference_number ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {row.supplier_bill_number?.trim() || "—"}
                      </TableCell>
                      <TableCell className="num text-right text-xs">
                        <CurrencyDisplay amount={Number(row.amount)} />
                      </TableCell>
                      <TableCell className="num text-right text-sm font-semibold">
                        {row.balance_after != null ? (
                          <CurrencyDisplay amount={Number(row.balance_after)} />
                        ) : (
                          <span className="font-normal text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
