import { dotnetClient } from "@/lib/api/dotnet-client"
import { stockErrorMessage } from "@/lib/api/stock-dotnet"
import { paymentDescription, type PartyPaymentMethod } from "@/features/accounting/lib/payment-methods"

export interface SupplierPaymentResult {
  ledger_entry_id: string
  /** The .NET payment posts an AP ledger row only; the GL voucher is not returned, so this is always null. */
  voucher_id: string | null
}

/** Payment date as a UTC instant. A bare YYYY-MM-DD is taken as midnight UTC. */
function paymentDateUtc(date: string): string {
  return date.includes("T") ? date : `${date}T00:00:00Z`
}

export const supplierPaymentsApi = {
  /**
   * Posts a payment to the supplier's AP ledger. The method is sent (it picks Cash or Bank for the GL
   * voucher) and also kept in the description with the reference; overpayment (an advance) is not
   * blocked. Throws DotnetApiError on failure.
   */
  post: async (body: {
    supplier_id: string
    amount: number
    /** Picks the GL money account: cash → Cash (1000), anything else → Bank (1010). */
    payment_method: PartyPaymentMethod
    payment_date: string
    reference_note?: string | null
    allow_overpayment?: boolean
    /**
     * Apply the payment to one bill (from open-bills). The server rejects an amount above that bill's
     * outstanding. Without it, the payment settles the oldest open bills first.
     */
    bill?: { reference_type: string; reference_id: string } | null
  }): Promise<SupplierPaymentResult> => {
    const description = paymentDescription(body.payment_method, body.reference_note)
    try {
      const ledgerEntryId = await dotnetClient.post<string>(`/suppliers/${encodeURIComponent(body.supplier_id)}/payments`, {
        amount: body.amount,
        paymentDateUtc: paymentDateUtc(body.payment_date),
        description,
        paymentMethod: body.payment_method,
        ...(body.bill
          ? { billReferenceType: body.bill.reference_type, billReferenceId: body.bill.reference_id }
          : {}),
      })
      return { ledger_entry_id: ledgerEntryId, voucher_id: null }
    } catch (error) {
      throw new Error(stockErrorMessage(error, "Failed to record supplier payment"))
    }
  },
}
