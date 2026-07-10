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
import type { Supplier } from "@/features/suppliers/api-client"

interface LedgerEntry {
  id: string
  entry_date: string
  entry_type: string
  reference_number?: string | null
  supplier_bill_number?: string | null
  amount: string | number
  balance_after?: string | number | null
  description?: string | null
}

interface SupplierLedgerModalProps {
  supplier: Supplier | null
  isOpen: boolean
  onClose: () => void
}

export default function SupplierLedgerModal({ supplier, isOpen, onClose }: SupplierLedgerModalProps) {
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [balance, setBalance] = useState<number>(0)
  const [meta, setMeta] = useState<{
    name: string | null
    reconciliation_account_ref: string | null
  } | null>(null)
  const [loading, setLoading] = useState(false)
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
      try {
        const res = await fetch(`/api/supplier-ledger?supplierId=${encodeURIComponent(supplier.id)}`)
        const body = await res.json()
        if (!res.ok || !body.success) {
          throw new Error(body.error?.message || "Failed to load ledger")
        }
        const d = body.data as {
          balance: number
          entries: LedgerEntry[]
          supplier: {
            name: string
            reconciliation_account_ref?: string | null
          } | null
        }
        setBalance(Number(d.balance ?? 0))
        setEntries(d.entries || [])
        setMeta(
          d.supplier
            ? {
                name: d.supplier.name,
                reconciliation_account_ref: d.supplier.reconciliation_account_ref ?? null,
              }
            : { name: supplier.name, reconciliation_account_ref: supplier.reconciliation_account_ref ?? null }
        )
      } catch (e) {
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
  }, [isOpen, supplier, toast])

  if (!supplier) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`${DIALOG_CONTENT_DETAIL_CLASS} max-w-3xl max-h-[90vh] flex flex-col`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollText className="h-5 w-5" />
            Supplier ledger — {supplier.name}
          </DialogTitle>
          <DialogDescription>
            Trade payables movement (goods receipts and payments). Match supplier tax invoices to{" "}
            <span className="font-medium">supplier bill #</span> below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 flex-1 min-h-0 flex flex-col">
          {meta?.reconciliation_account_ref ? (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Statement ref:</span>{" "}
              {meta.reconciliation_account_ref}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-lg font-semibold">
              Balance: <CurrencyDisplay amount={balance} />
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/reports/accounting">
                <ExternalLink className="h-4 w-4 mr-2" />
                Payments &amp; GL
              </Link>
            </Button>
          </div>

          <div className="border rounded-md flex-1 min-h-0 overflow-auto">
            {loading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            ) : entries.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No ledger entries yet for this supplier.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Supplier bill #</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {String(row.entry_date).slice(0, 10)}
                      </TableCell>
                      <TableCell className="text-xs capitalize">{row.entry_type}</TableCell>
                      <TableCell className="text-xs font-mono">{row.reference_number ?? "—"}</TableCell>
                      <TableCell className="text-xs font-mono">
                        {row.supplier_bill_number?.trim() || "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        <CurrencyDisplay amount={Number(row.amount)} />
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {row.balance_after != null ? (
                          <CurrencyDisplay amount={Number(row.balance_after)} />
                        ) : (
                          "—"
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
