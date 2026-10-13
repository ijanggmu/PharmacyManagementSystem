import { dotnetClient } from "@/lib/api/dotnet-client"
import { newIdempotencyKey } from "@/lib/api/idempotency"
import { stockErrorMessage } from "@/lib/api/stock-dotnet"
import { paymentDescription, type PartyPaymentMethod } from "@/features/accounting/lib/payment-methods"
import { paymentVoidPath } from "@/features/accounting/lib/payment-void"

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
    /**
     * TDS withheld (service suppliers). `amount` stays the gross settled on the supplier's account; the money paid
     * out is amount − TDS and Accounting credits the TDS to TDS Payable.
     */
    tds?: { tdsAmount: number; tdsCategory: string; tdsRatePercent: number | null; tdsTaxableAmount: number } | null
    /**
     * One key per payment the user submits, reused if that same payment is retried, so the server records
     * it once (the endpoint is idempotent). A fresh key is used when none is given.
     */
    idempotency_key?: string
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
        ...(body.tds ?? {}),
      }, body.idempotency_key ?? newIdempotencyKey())
      return { ledger_entry_id: ledgerEntryId, voucher_id: null }
    } catch (error) {
      throw new Error(stockErrorMessage(error, "Failed to record supplier payment"))
    }
  },

  /**
   * Voids a recorded supplier payment: the AP ledger gets a reversing entry (the payment stays, flagged voided),
   * the bill it settled is open again, and Accounting reverses its GL voucher dated today. 409 when it is
   * already voided. Pass the same idempotency key when retrying the same void.
   */
  void: async (body: { supplier_id: string; payment_id: string; reason: string; idempotency_key?: string }): Promise<{ void_entry_id: string }> => {
    try {
      const voidEntryId = await dotnetClient.post<string>(
        paymentVoidPath("payment", body.supplier_id, body.payment_id),
        { reason: body.reason.trim() },
        body.idempotency_key ?? newIdempotencyKey(),
      )
      return { void_entry_id: voidEntryId }
    } catch (error) {
      throw new Error(stockErrorMessage(error, "Failed to void supplier payment"))
    }
  },
}
