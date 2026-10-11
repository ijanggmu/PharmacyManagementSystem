import { dotnetClient } from "@/lib/api/dotnet-client"
import { toUtcDateTime } from "@/lib/api/sales-api"
import { paymentDescription, type PartyPaymentMethod } from "@/features/accounting/lib/payment-methods"

export const customerPaymentsApi = {
  post: async (body: {
    customer_id: string
    amount: number
    /** Picks the GL money account: cash → Cash (1000), anything else → Bank (1010). */
    payment_method: PartyPaymentMethod
    payment_date: string
    reference_note?: string | null
    allocations?: Array<{ sale_id: string; amount: number }> | null
    /**
     * Idempotency-Key for this submission. Pass the same key when retrying the same payment (a timeout, a
     * double click) so the server records it once; a fresh key is generated only when none is given.
     */
    idempotency_key?: string
  }): Promise<{ payment_id: string }> => {
    if (body.allocations && body.allocations.length > 0) {
      throw new Error("Allocating a payment to individual sales is not supported on the .NET API; record it without allocations")
    }
    const description = paymentDescription(body.payment_method, body.reference_note)
    const paymentId = await dotnetClient.post<string>(
      `/api/v1/customers/${encodeURIComponent(body.customer_id)}/payments`,
      {
        customerId: body.customer_id,
        amount: body.amount,
        paymentDateUtc: toUtcDateTime(body.payment_date),
        description,
        paymentMethod: body.payment_method,
      },
      body.idempotency_key ?? crypto.randomUUID(),
    )
    return { payment_id: paymentId }
  },
}

/** A customer as the receipt dialog needs it: name and what they currently owe (AR sub-ledger). */
export interface CustomerPayer {
  id: string
  name: string
  phone: string | null
  /** Positive = the customer owes the pharmacy. */
  outstanding: number
}

interface CustomerPayerDto {
  id: string
  name: string
  phone: string | null
  currentBalance: number
}

interface CustomerPayerPage {
  items: CustomerPayerDto[]
  totalCount: number
}

/** Query string for the receipt dialog's customer search (one bounded page, active customers only). */
export function customerPayerSearchPath(search: string, pageSize: number): string {
  const p = new URLSearchParams({ pageNumber: "1", pageSize: String(pageSize), isActive: "true" })
  if (search.trim()) p.set("search", search.trim())
  return `/api/v1/customers?${p.toString()}`
}

/**
 * Searches customers with their current balance. The shared customers client maps rows to the profile
 * shape and drops `currentBalance`, which the receipt dialog needs to show what is outstanding.
 */
export async function searchCustomerPayers(search: string, pageSize = 25): Promise<{ items: CustomerPayer[]; total: number }> {
  const page = await dotnetClient.get<CustomerPayerPage>(customerPayerSearchPath(search, pageSize))
  return {
    items: page.items.map((c) => ({ id: c.id, name: c.name, phone: c.phone ?? null, outstanding: Number(c.currentBalance ?? 0) })),
    total: page.totalCount,
  }
}
