import { dotnetClient } from "@/lib/api/dotnet-client"
import {
  toPaymentMethodAccountRow,
  type DotnetPaymentMethodAccountDto,
  type PaymentMethodAccountInput,
  type PaymentMethodAccountRow,
} from "@/features/accounting/lib/payment-accounts"

const base = "/accounting/payment-method-accounts"

export const paymentAccountsApi = {
  /** Every payment method with the account its money posts to (defaults included). */
  list: async (): Promise<PaymentMethodAccountRow[]> =>
    (await dotnetClient.get<DotnetPaymentMethodAccountDto[]>(base)).map(toPaymentMethodAccountRow),

  /** Saves the changed methods (null resets one to its default) and returns the full mapping afterwards. */
  update: async (mappings: readonly PaymentMethodAccountInput[]): Promise<PaymentMethodAccountRow[]> =>
    (await dotnetClient.put<DotnetPaymentMethodAccountDto[]>(base, { mappings: [...mappings] })).map(toPaymentMethodAccountRow),

  /**
   * Adds a bank / wallet / till account in the 10xx cash & bank block (beside Cash 1000 and Bank 1010 — Bank
   * itself takes automatic postings, so it can't hold sub-accounts). Resolves to the new account id.
   */
  createCashBankAccount: async (name: string, idempotencyKey?: string): Promise<string> =>
    String(await dotnetClient.post<string>("/accounting/accounts/cash-bank", { name }, idempotencyKey)),
}
