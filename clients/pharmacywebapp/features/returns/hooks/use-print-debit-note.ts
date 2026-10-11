"use client"

import { useCallback, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { usePharmacyProfile } from "@/features/accounting/hooks/use-pharmacy-profile"
import { printHtmlDocument } from "@/features/accounting/lib/voucher-print"
import { useBranchAccess } from "@/features/branches/hooks/use-branch-access"
import { suppliersApi } from "@/features/suppliers/api-client"
import { supplierReturnsApi } from "@/features/suppliers/api-client-returns"
import { buildDebitNotePrintHtml } from "@/features/returns/lib/debit-note-print"

/**
 * Prints a debit note by id: loads the return (fresh, so the number and VAT are the server's) and the
 * supplier's address/PAN for the "debit to" block. `printingId` drives the button spinner.
 */
export function usePrintDebitNote() {
  const { toast } = useToast()
  const { profile } = usePharmacyProfile()
  const { branches } = useBranchAccess()
  const [printingId, setPrintingId] = useState<string | null>(null)

  const print = useCallback(
    async (returnId: string) => {
      setPrintingId(returnId)
      try {
        const { data: debitNote, error } = await supplierReturnsApi.get(returnId)
        if (!debitNote) throw new Error(error ?? "The debit note could not be loaded.")
        const { data: supplier } = await suppliersApi.getSupplier(debitNote.supplierId)
        const branchName = branches.find((b) => b.id === debitNote.branchId)?.name ?? null
        await printHtmlDocument(
          buildDebitNotePrintHtml({
            debitNote,
            profile,
            branchName,
            supplier: supplier
              ? { name: supplier.name, address: supplier.address, phone: supplier.phone, panVat: supplier.tax_id ?? null }
              : null,
          }),
        )
      } catch (err) {
        toast({
          title: "Couldn't print the debit note",
          description: err instanceof Error ? err.message : "Try again in a moment.",
          variant: "destructive",
        })
      } finally {
        setPrintingId(null)
      }
    },
    [branches, profile, toast],
  )

  return { print, printingId }
}
